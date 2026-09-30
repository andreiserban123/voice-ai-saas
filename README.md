# Romanian AI voice receptionist

MVP foundation for independent auto repair shops: TypeScript, Next.js App Router, PostgreSQL, Drizzle and Zod in a modular monolith.

**Current state:** architecture proposal and scaffold. `/dashboard` is an unconnected Romanian UI shell; `/api/health` reports process liveness. Provider contracts and the database schema exist. Authentication, real calls, bookings and dashboard data are tracked in [TODO.md](TODO.md).

## Run the shell

Use Node.js 22 or newer (an active LTS release is preferred) and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The shell needs no database or provider credentials.

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

Verified locally against PostgreSQL 18.6: migration application, all 13 tables, Romanian text/JSON/timestamp round-trips, tenant foreign keys, deduplication keys and lifecycle constraints. `db:test` uses a transaction and rolls back all fixtures, including on failure. It accepts only a loopback `voice_ai_saas` database. These are database constraint checks; authentication, booking orchestration and live providers are still future work.

## Verify

```sh
npm run lint
npm run typecheck
npm run build
```

Run `npm start` after building. The future live-call runtime will need persistent session handling, as described in the architecture proposal; `next start` currently serves the shell only.

Tooling notes: ESLint 9 is pinned because the React plugins bundled with this Next.js version fail under ESLint 10; npm marks ESLint 9 deprecated. The dependency audit reports four moderate findings in Drizzle Kit's transitive development tooling (`esbuild`), with no runtime dependency findings at scaffold creation. Track compatible upgrades in the roadmap; the suggested forced downgrade is not applied.

## Design documents

- [Architecture and repository structure](docs/architecture.md)
- [Initial database schema](docs/database.md)
- [Minimum end-to-end demo](docs/first-demo.md)
- [Implementation roadmap](TODO.md)

Routes handle HTTP concerns; business use cases belong in `src/modules`. Vendor implementations belong behind `src/providers/*/port.ts`. All future tenant data access must resolve membership or verified inbound routing and include company scope. No tenant records are exposed by this scaffold.
