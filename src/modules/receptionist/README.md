# Receptionist module

`conversation.ts` builds Romanian instructions from company configuration and validates business-information and confirmed caller-intake tools. `runtime.ts` owns Twilio/OpenAI webhook orchestration, bounded sessions, transcript writes, recovery and shutdown. The persistent Node composition root is `scripts/serve.ts`.

Availability, confirmed booking and human transfer remain planned. Inject company/call IDs from the verified server session, validate tool payloads and derive idempotency keys from persisted invocation IDs. The model cannot select credentials, tenant scope or arbitrary transfer numbers. Setup and live-call validation: `docs/first-call.md`.
