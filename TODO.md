# MVP roadmap

## 0 — Proposal and scaffold (this task)

- [x] Document module boundaries, runtime choice and provider interfaces.
- [x] Propose tenant-aware database schema and demo acceptance criteria.
- [x] Scaffold Next.js, TypeScript, PostgreSQL/Drizzle and Zod.
- [x] Add provider ports, environment example and dashboard shell.
- [x] Generate the initial migration; validate lint, types and production build.
- [x] Smoke-check the built app: home redirect, health response and Romanian dashboard empty states.

Scaffold verification on 2026-09-30: `npm ci`, lint, typecheck, production build and HTTP smoke checks passed. `db:generate` reports no schema drift from the existing migration. Local Compose PostgreSQL 18.6 now runs the migration and passes `npm run db:test`; live integrations remain unverified.

## 1 — Tenant foundation

- [x] Add local Docker Compose with `postgres:latest`, persistent storage and a health check.
- [x] Apply migrations to development PostgreSQL and verify constraints against a real database.
- [x] Choose authentication, implement login and server-resolved company membership.
- [x] Validate authentication against PostgreSQL and Chromium/Mailpit, including concurrent rate limits, session revocation and tenant isolation.
- [ ] Implement tenant-scoped repositories and cross-tenant access tests.
- [ ] Provision one demo business, owner, opening hours, three FAQs, bookable service and agent configuration.
- [x] Add protected company reads.
- [ ] Add simple company configuration editing.

Pam.ai verification on 2026-10-01: migrations, lint, TypeScript, production build, all 12 authentication test results, all 10 database test results, 3 generic intake tests and the Chromium end-to-end flow passed. The rebrand covers the UI, metadata and authentication emails. Optional request details replace mandatory vehicle data; migration tests verify historical data preservation. Local SMTP delivery was verified through Mailpit. Production SMTP and deployment still need validation in their target environment.

## 2 — Real call and FAQ slice

- [ ] Spike Romanian number routing and choose the first telephony adapter; verify transfer support.
- [ ] Add a persistent Node entry point around Next.js with graceful shutdown and session cleanup.
- [ ] Implement signed webhook verification, number-to-company routing, event deduplication and call lifecycle handling.
- [ ] Implement OpenAI Realtime voice adapter and server-side session/tool event loop.
- [ ] Build Romanian instructions from company data; expose validated intake and business-information tools.
- [ ] Persist finalized transcript, caller details, duration and post-call summary.
- [ ] Show authenticated recent calls and call details using stored data.
- [ ] Prove a real handset call answers a stored FAQ and captures caller information.

## 3 — Booking and transfer: first complete demo

- [ ] Connect one Google Calendar; implement CalendarProvider free/busy and idempotent event creation.
- [ ] Implement local-time availability, DST rules, service duration and capacity-one booking.
- [ ] Serialize booking attempts; recheck conflicts; persist pending bookings and recover ambiguous external writes.
- [ ] Expose validated availability/booking tools with explicit caller confirmation and server-injected tenant context.
- [ ] Add appointment list and linked appointment outcome in call details.
- [ ] Implement requested human transfer and callback fallback on failure.
- [ ] Run all acceptance checks in docs/first-demo.md, including concurrent booking and webhook retries.

## 4 — Pilot MVP

- [ ] Upgrade deprecated ESLint when Next.js's bundled plugins support its successor; resolve Drizzle Kit's transitive development dependency audit findings.
- [ ] Finish configuration UI for company, hours, date-specific closures, phone, services, FAQs and agent.
- [ ] Add secure per-company Google OAuth connection, refresh and disconnect flows.
- [ ] Add after-hours policy, no-answer behavior, provider timeout handling and recoverable finalization.
- [ ] Add minimal operational logs, error reporting, call/session limits and credential rotation procedure.
- [ ] Define transcript retention/deletion and caller disclosure before using real customer data.
- [ ] Document deployment, database backup/restore and a repeatable pilot smoke test.

## Explicitly outside this MVP

Mobile app, CRM, Kafka, Kubernetes, microservices, complex analytics, multi-resource scheduling, payments, outbound campaigns and audio recording.
