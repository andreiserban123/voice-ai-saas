# Pam.ai

AI receptionist for businesses that need help answering calls, sharing information and managing appointments: TypeScript, Next.js App Router, PostgreSQL, Drizzle and Zod in a modular monolith.

**Current state:** email/password authentication with Better Auth, email verification, password reset, persistent sessions and company onboarding are implemented. `/dashboard` requires a verified account and resolves company membership on the server. Calls and bookings still show empty states; `/api/health` reports process liveness. Remaining work and validation status are tracked in [TODO.md](TODO.md).

Pam.ai is industry-neutral: each business supplies its own services, hours, FAQs and reception instructions. Caller intake requires contact details and a reason for the call; additional context is optional. The first voice and booking integrations remain planned.

## Run locally

Use Node.js 22 or newer (an active LTS release is preferred) and npm.

```sh
npm ci
npm run services:up
npm run db:migrate
npm run dev
```

Before starting, copy `.env.example` to `.env.local` if it does not exist. Set `AUTH_SECRET` to the output of `openssl rand -base64 32`; retain the local database and SMTP defaults. Existing `.env.local` files need the authentication and SMTP variables added without replacing existing credentials.

Open http://localhost:3000/signup, create an account, then open the verification email in http://localhost:8025 (Mailpit). After verification, sign in and enter your business name. Use the exact origin in `AUTH_URL` when opening the app. `services:up` starts PostgreSQL and Mailpit; `services:down` stops them while retaining the database volume. Local email stays in Mailpit.

Development and build scripts explicitly use Webpack. The same commands work on Linux, macOS, and Windows; no platform-specific setup is required by the scaffold.

## Database

Start local PostgreSQL with Docker and Docker Compose. Copy `.env.example` to `.env.local` if that file does not exist yet. Its `DATABASE_URL` matches the development credentials in [compose.yaml](compose.yaml). Next.js, Drizzle and the database smoke tests load `.env.local`.

```sh
npm run db:up
npm run db:migrate
npm run db:test
```

Compose runs `postgres:latest` at `127.0.0.1:5432`, creates `voice_ai_saas`, and waits for the database health check. The app runs on the host using `npm run dev`. Database files persist in the `postgres_data` named volume mounted at `/var/lib/postgresql`, following the [official image layout for PostgreSQL 18+](https://github.com/docker-library/docs/blob/master/postgres/content.md#pgdata).

`npm run db:down` stops and removes the container while retaining its data volume. To fetch a newer image explicitly, run `docker compose pull postgres` before starting it. Because `latest` can move to another PostgreSQL major version, a future major upgrade needs a database migration or dump/restore; changing the image does not upgrade stored data.

The initial SQL migration is checked into `drizzle/`; run `npm run db:generate` only after schema changes. `npm run db:studio` opens Drizzle's local database browser.

The authentication migration adds account, session, verification and rate-limit tables to the original 13 tables. `db:test` checks Romanian text/JSON/timestamp round-trips, tenant foreign keys, deduplication keys and lifecycle constraints. It uses a transaction and rolls back fixtures, including on failure, and accepts only a loopback `voice_ai_saas` database.

The existing local database name `voice_ai_saas` and Docker volume remain compatible with installed environments. The Pam.ai migration renames vehicle-specific columns to generic `details`, preserving historical JSON values and allowing appointments without additional context.

## Authentication

Routes: `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/onboarding` and `/dashboard`. Passwords use Argon2id and must contain 15–128 characters. Verification links expire after one hour; reset links expire after 30 minutes and are single-use. Resetting a password revokes existing sessions. Sessions last seven days and are checked against PostgreSQL on protected requests.

`GET /api/companies/:companyId` returns the current user's company and role. Anonymous requests receive 401; inaccessible or unknown company IDs receive 404. Onboarding creates one company and an owner membership, including when submitted concurrently. User IDs and roles come from server state.

Deploy with a stable random `AUTH_SECRET`, an HTTPS `AUTH_URL`, and working SMTP credentials. Remote SMTP requires TLS. The ingress must overwrite `X-Real-IP` with the client address and prevent direct access to the application server, because authentication rate limits trust that header. Missing IPs share one bucket. Login allows five attempts per minute; signup, reset requests and verification resends allow three. Limits persist in PostgreSQL and use an atomic conditional upsert through Better Auth's [custom storage interface](https://better-auth.com/docs/concepts/rate-limit#custom-storage). Remove stale `auth_rate_limits` rows older than one day in scheduled database maintenance; all configured windows are at most one minute.

Email delivery runs after the HTTP response. Delivery failures appear in server logs; users can request another email after the SMTP service recovers. Production SMTP delivery and deployment remain to be verified in the target environment.

## Verify

```sh
npm run lint
npm run typecheck
npm run auth:test
npm run db:test
npm run intake:test
npm run build
npx playwright install chromium
npm run auth:e2e
```

On Linux/WSL, Chromium also needs system libraries. Install them once with `npx playwright install-deps chromium` (administrator privileges required). The local WSL verification used Ubuntu libraries extracted into `/tmp/voice-ai-browser-libs` and `LD_LIBRARY_PATH=/tmp/voice-ai-browser-libs/root/usr/lib/x86_64-linux-gnu npm run auth:e2e`, without changing system packages.

Verified on 2026-10-01: migrations, lint, TypeScript, production build, 12 authentication test results, 10 database test results, 3 generic intake tests and the Chromium/Mailpit end-to-end flow all passed. The browser flow also checks Pam.ai branding in page metadata and authentication emails. Migration checks confirm that historical JSON remains intact and appointments can omit additional details.

`auth:test` exercises the real database with temporary fixtures: signup, verification, password hashing, cookies, session expiry/revocation, tenant isolation, concurrent onboarding, CSRF, reset tokens and concurrent rate limits across authentication instances. It removes only its own fixtures.

`intake:test` checks contact validation, caller confirmation and optional context for salons, consultations and other services. `db:test` also verifies the upgrade from the original vehicle fields without losing existing records.

`auth:e2e` starts the production build on port 3000, which must be free. Keep PostgreSQL and Mailpit running and use the local defaults from `.env.example`. The Chromium test covers the visible forms, SMTP messages, verification links, onboarding, protected company reads, logout and password reset, then removes its own database fixtures and emails using the [Mailpit API](https://mailpit.axllent.org/docs/api-v1/). Browser screenshots on failure are ignored by Git. Test discovery alone does not validate these flows.

Run `npm start` after building for normal use. The future live-call runtime will need persistent session handling, as described in the architecture proposal.

Tooling notes: ESLint 9 is pinned because the React plugins bundled with this Next.js version fail under ESLint 10; npm marks ESLint 9 deprecated. The dependency audit reports four moderate findings in Drizzle Kit's transitive development tooling (`esbuild`), with no runtime dependency findings at scaffold creation. Track compatible upgrades in the roadmap; the suggested forced downgrade is not applied.

## Design documents

- [Architecture and repository structure](docs/architecture.md)
- [Initial database schema](docs/database.md)
- [Minimum end-to-end demo](docs/first-demo.md)
- [Implementation roadmap](TODO.md)

Routes handle HTTP concerns; business use cases belong in `src/modules`. Vendor implementations belong behind `src/providers/*/port.ts`. All tenant data access must resolve membership or verified inbound routing and include company scope.
