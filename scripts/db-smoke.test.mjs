import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd(), true);

test("local PostgreSQL migration and constraints", async (t) => {
  const url = new URL(process.env.DATABASE_URL ?? "http://missing");
  assert.ok(
    ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname === "/voice_ai_saas",
    "Set DATABASE_URL in .env.local to the local voice_ai_saas database before running db:test.",
  );
  const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await client.connect();
  const row = async (sql, values = []) => (await client.query(sql, values)).rows[0];
  const reject = async (constraint, code, sql, values) => {
    await client.query("SAVEPOINT expected_failure");
    try {
      await assert.rejects(client.query(sql, values), (error) => {
        assert.equal(error.code, code);
        assert.equal(error.constraint, constraint);
        return true;
      });
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT expected_failure");
      await client.query("RELEASE SAVEPOINT expected_failure");
    }
  };

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '5s'");
    const runId = randomUUID();
    const a = await row("INSERT INTO companies (name, slug) VALUES ('Atelier Ștefan', $1) RETURNING *", [`smoke-a-${runId}`]);
    const b = await row("INSERT INTO companies (name, slug) VALUES ('Atelier B', $1) RETURNING *", [`smoke-b-${runId}`]);
    const phone = await row(`INSERT INTO phone_configurations
      (company_id, provider, provider_account_id, phone_number, credential_reference)
      VALUES ($1, 'test', $2, '+40000000000', 'test-only') RETURNING id`, [a.id, runId]);
    const call = await row(`INSERT INTO calls
      (company_id, phone_configuration_id, telephony_provider, provider_account_id, provider_call_id,
       caller_name, started_at, ended_at, duration_seconds, summary, appointment_outcome)
      VALUES ($1, $2, 'test', $3, 'call-1', 'Ștefan Țurcanu',
       '2026-09-30T09:00:00+03:00', '2026-09-30T09:02:00+03:00', 120, 'Verificare frâne', 'booked')
      RETURNING *`, [a.id, phone.id, runId]);
    const service = await row(`INSERT INTO services (company_id, name, duration_minutes)
      VALUES ($1, 'Diagnoză', 60) RETURNING id`, [a.id]);
    const calendar = await row(`INSERT INTO calendar_connections
      (company_id, external_calendar_id, credential_reference)
      VALUES ($1, 'test-calendar', 'test-only') RETURNING id`, [a.id]);
    const appointment = await row(`INSERT INTO appointments
      (company_id, call_id, service_id, calendar_connection_id, caller_name, caller_phone,
       vehicle, issue, starts_at, ends_at, idempotency_key, status, external_event_id)
      VALUES ($1, $2, $3, $4, 'Ștefan Țurcanu', '+40722123456',
       '{"make":"Dacia","model":"Logan"}', 'Verificare frâne',
       '2026-10-01T10:00:00+03:00', '2026-10-01T11:00:00+03:00', 'booking-1', 'confirmed', 'event-1')
      RETURNING *`, [a.id, call.id, service.id, calendar.id]);
    const transcript = await row(`INSERT INTO transcript_entries
      (company_id, call_id, sequence, provider_item_id, speaker, text, offset_ms)
      VALUES ($1, $2, 0, 'item-1', 'caller', 'Bună ziua, aș dori o programare.', 100) RETURNING *`, [a.id, call.id]);
    const event = await row(`INSERT INTO provider_events
      (company_id, call_id, provider, provider_account_id, provider_event_id, event_type)
      VALUES ($1, $2, 'test', $3, 'webhook-1', 'incoming') RETURNING id`, [a.id, call.id, runId]);

    await t.test("Romanian text, vehicle JSON and UTC instants round-trip", () => {
      assert.equal(a.timezone, "Europe/Bucharest");
      assert.equal(a.locale, "ro-RO");
      assert.equal(call.caller_name, "Ștefan Țurcanu");
      assert.equal(call.duration_seconds, 120);
      assert.equal(call.started_at.toISOString(), "2026-09-30T06:00:00.000Z");
      assert.equal(appointment.starts_at.toISOString(), "2026-10-01T07:00:00.000Z");
      assert.deepEqual(appointment.vehicle, { make: "Dacia", model: "Logan" });
      assert.equal(transcript.text, "Bună ziua, aș dori o programare.");
    });

    await t.test("cross-company call, transcript and event links are rejected", async () => {
      await reject("call_phone_tenant_fk", "23503", `INSERT INTO calls
        (company_id, phone_configuration_id, telephony_provider, provider_account_id, provider_call_id, started_at)
        VALUES ($1, $2, 'test', $3, 'cross-company-call', now())`, [b.id, phone.id, runId]);
      await reject("transcript_call_tenant_fk", "23503", "UPDATE transcript_entries SET company_id = $1 WHERE id = $2", [b.id, transcript.id]);
      await reject("provider_event_call_tenant_fk", "23503", "UPDATE provider_events SET company_id = $1 WHERE id = $2", [b.id, event.id]);
    });

    await t.test("appointments cannot reference another company's call, service or calendar", async () => {
      const otherPhone = await row(`INSERT INTO phone_configurations
        (company_id, provider, provider_account_id, phone_number, credential_reference)
        VALUES ($1, 'test', $2, '+40000000001', 'test-only') RETURNING id`, [b.id, runId]);
      const otherCall = await row(`INSERT INTO calls
        (company_id, phone_configuration_id, telephony_provider, provider_account_id, provider_call_id, started_at)
        VALUES ($1, $2, 'test', $3, 'call-2', now()) RETURNING id`, [b.id, otherPhone.id, runId]);
      const otherService = await row("INSERT INTO services (company_id, name, duration_minutes) VALUES ($1, 'Test', 60) RETURNING id", [b.id]);
      const otherCalendar = await row(`INSERT INTO calendar_connections
        (company_id, external_calendar_id, credential_reference) VALUES ($1, 'other-calendar', 'test-only') RETURNING id`, [b.id]);
      await reject("appointment_call_tenant_fk", "23503", "UPDATE appointments SET call_id = $1 WHERE id = $2", [otherCall.id, appointment.id]);
      await reject("appointment_service_tenant_fk", "23503", "UPDATE appointments SET service_id = $1 WHERE id = $2", [otherService.id, appointment.id]);
      await reject("appointment_calendar_tenant_fk", "23503", "UPDATE appointments SET calendar_connection_id = $1 WHERE id = $2", [otherCalendar.id, appointment.id]);
    });

    await t.test("duplicate calls, webhooks and transcript items are rejected", async () => {
      await reject("call_provider_id_unique", "23505", `INSERT INTO calls
        (company_id, phone_configuration_id, telephony_provider, provider_account_id, provider_call_id, started_at)
        VALUES ($1, $2, 'test', $3, 'call-1', now())`, [a.id, phone.id, runId]);
      await reject("provider_event_unique", "23505", `INSERT INTO provider_events
        (company_id, provider, provider_account_id, provider_event_id, event_type)
        VALUES ($1, 'test', $2, 'webhook-1', 'incoming')`, [a.id, runId]);
      await reject("transcript_call_item_unique", "23505", `INSERT INTO transcript_entries
        (company_id, call_id, sequence, provider_item_id, speaker, text, offset_ms)
        VALUES ($1, $2, 1, 'item-1', 'caller', 'Retry', 100)`, [a.id, call.id]);
    });

    await t.test("booking retries cannot duplicate a request or external event", async () => {
      const copyBooking = `INSERT INTO appointments
        (company_id, call_id, service_id, calendar_connection_id, caller_name, caller_phone,
         vehicle, issue, starts_at, ends_at, idempotency_key, external_event_id)
        SELECT company_id, call_id, service_id, calendar_connection_id, caller_name, caller_phone,
         vehicle, issue, starts_at, ends_at, $1, $2 FROM appointments WHERE id = $3`;
      await reject("appointment_request_unique", "23505", copyBooking, ["booking-1", "event-2", appointment.id]);
      await reject("appointment_external_event_unique", "23505", copyBooking, ["booking-2", "event-1", appointment.id]);
    });

    await t.test("invalid appointment intervals and unbacked confirmations are rejected", async () => {
      await reject("appointment_interval_check", "23514", "UPDATE appointments SET ends_at = starts_at WHERE id = $1", [appointment.id]);
      await reject("appointment_confirmation_check", "23514", "UPDATE appointments SET external_event_id = NULL WHERE id = $1", [appointment.id]);
    });

    await t.test("invalid business hours and call durations are rejected", async () => {
      await reject("business_hours_weekday_check", "23514", `INSERT INTO business_hours
        (company_id, weekday, opens_at, closes_at) VALUES ($1, 8, '09:00', '17:00')`, [a.id]);
      await reject("business_hours_order_check", "23514", `INSERT INTO business_hours
        (company_id, weekday, opens_at, closes_at) VALUES ($1, 1, '17:00', '09:00')`, [a.id]);
      await reject("call_duration_check", "23514", "UPDATE calls SET duration_seconds = -1 WHERE id = $1", [call.id]);
      await reject("call_ended_check", "23514", "UPDATE calls SET ended_at = started_at - interval '1 second' WHERE id = $1", [call.id]);
    });
  } finally {
    // No test fixtures survive either successful or failed runs.
    try { await client.query("ROLLBACK"); }
    finally { await client.end(); }
  }
});
