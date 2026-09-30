# Receptionist module

The next slice introduces call orchestration here. Compose company context, voice session events and validated business tools using provider ports. Keep prompts and booking decisions out of Next.js route handlers and provider adapters.

Planned tools: business information lookup, caller intake, availability, confirmed booking and human transfer. Inject company/call IDs from the server session; validate every tool payload; derive booking idempotency keys from persisted invocation IDs. Do not let the model select credentials, tenant scope or arbitrary transfer numbers.
