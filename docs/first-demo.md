# First end-to-end demo

## Smallest credible slice

One manually configured Romanian garage, one inbound number, one authenticated owner, one service (60-minute diagnostic intake), three FAQs, one Google Calendar, Romanian speech, and one configured human transfer destination. Manual provisioning is sufficient; self-service onboarding can follow.

Build this in two increments: first prove phone → FAQ/intake → persisted call → dashboard, then extend that same path with booking and human transfer. The first increment is an integration checkpoint; the complete demo below is the first slice that demonstrates the requested receptionist workflow. Configuration forms and onboarding are not prerequisites.

1. A real phone calls the garage number. A verified incoming event resolves the company and creates a call once.
2. The receptionist greets the caller in Romanian and answers an opening-hours FAQ from stored configuration.
3. It collects and confirms name, callback number, vehicle make/model or registration, and the issue. Caller ID is a hint; confirm the callback number.
4. The caller asks for an appointment. The server checks hours, local reservations and Google Calendar, then offers an available intake slot in Romanian local time.
5. After explicit caller confirmation, a validated tool creates one appointment and one Google event. A retry returns the same booking. The agent confirms only after success.
6. On hangup, persist finalized transcript, summary, booking outcome and duration. The owner can open the call and see the linked appointment.
7. In a second short call, the caller requests a person. Transfer to the configured number; a failed transfer is reported honestly and captures a callback request.

## Acceptance checks

- Real handset audio works both ways; Romanian names and diacritics survive persistence.
- The appointment's time matches Google Calendar when displayed in `Europe/Bucharest`.
- A duplicate webhook or booking tool invocation does not create another call or event.
- Two simultaneous requests for the same local slot cannot both confirm.
- Calendar failure produces no false confirmation; interrupted writes can be reconciled.
- A second tenant cannot read or link the first tenant's call or appointment.
- Unknown numbers, invalid webhook signatures and forged tenant/tool identifiers are rejected.
- DST boundaries, closed hours, no availability and human transfer failure have explicit outcomes.

## Prerequisites

PostgreSQL; a publicly reachable HTTPS endpoint and persistent Node runtime; carrier credentials and a routable phone number; OpenAI credentials; a Google Calendar connection; one owner's authentication. Provider accounts and paid calls are configured in the integration milestone. No live credentials are required to run the current application shell.
