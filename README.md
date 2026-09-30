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

Create a local PostgreSQL database named `voice_ai_saas`. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to that database. Next.js and Drizzle both load `.env.local`. PostgreSQL installation/hosting is up to the development environment; no additional infrastructure is provisioned here.

```sh
npm run db:generate
npm run db:migrate
```

The initial SQL migration is checked into `drizzle/`; generate again only after schema changes. Inspect generated SQL before applying it. `npm run db:studio` opens Drizzle's local database browser. Do not point development commands at a production database.

The migration matches the Drizzle schema, but has not been applied or tested against PostgreSQL in this workspace yet.

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
