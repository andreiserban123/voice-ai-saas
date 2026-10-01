import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import twilio from "twilio";
import WebSocket, { WebSocketServer } from "ws";
import * as schema from "../src/db/schema";
import { readVoiceConfig, type VoiceConfig } from "../src/runtime/config";
import { routingToken, verifyRoutingToken, TwilioSipAdapter, WebhookError } from "../src/providers/telephony/twilio";
import { OpenAISipVoice } from "../src/providers/voice/openai";
import { ReceptionistRuntime } from "../src/modules/receptionist/runtime";
import { receptionistTools, executeReceptionistTool } from "../src/modules/receptionist/conversation";
import { appendTranscript, createIncomingCall, finishCall, getCallDetails, getRoutedCall, listCalls, receptionContext, saveIntake } from "../src/modules/calls/repository";
import { getReceptionSettings, saveReceptionSettings } from "../src/modules/companies/reception";
import type { VoiceEvent, VoiceSession } from "../src/providers/voice/port";

loadEnvConfig(process.cwd(), true);
const config: VoiceConfig = {
  OPENAI_API_KEY: "test-key", OPENAI_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString("base64")}`,
  OPENAI_PROJECT_ID: "proj_test", OPENAI_REALTIME_MODEL: "gpt-realtime-2.1", OPENAI_VOICE: "marin",
  TWILIO_ACCOUNT_SID: `AC${randomBytes(16).toString("hex")}`, TWILIO_AUTH_TOKEN: randomBytes(32).toString("hex"),
  TWILIO_PHONE_NUMBER: `+407${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`,
  VOICE_PUBLIC_URL: "https://pam.example.test", AUTH_SECRET: randomBytes(32).toString("base64"), VOICE_MAX_CALLS: 3, VOICE_MAX_SECONDS: 600,
};
const callSid = () => `CA${randomBytes(16).toString("hex")}`;
function twilioRequest(path: string, parameters: Record<string, string>) {
  return { body: new URLSearchParams(parameters).toString(), headers: new Headers({
    "content-type": "application/x-www-form-urlencoded",
    "x-twilio-signature": twilio.getExpectedTwilioSignature(config.TWILIO_AUTH_TOKEN, new URL(path, config.VOICE_PUBLIC_URL).toString(), parameters),
  }) };
}
function openaiRequest(event: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(event), id = `wh_${randomUUID()}`;
  const secret = Buffer.from(config.OPENAI_WEBHOOK_SECRET.slice(6), "base64");
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { body, headers: new Headers({ "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": `v1,${signature}` }) };
}

test("voice configuration rejects invalid public URLs without throwing", () => {
  const env = { ...config, VOICE_MAX_CALLS: "3", VOICE_MAX_SECONDS: "600" };
  for (const value of [undefined, "", "not-a-url", "/relative", "https://", "http://pam.example.test",
    "https://user:password@pam.example.test", "https://pam.example.test/path",
    "https://pam.example.test?query=1", "https://pam.example.test#fragment"]) {
    assert.deepEqual(readVoiceConfig({ ...env, VOICE_PUBLIC_URL: value }), {
      config: null, missing: ["VOICE_PUBLIC_URL"],
    }, `Expected validation failure for ${JSON.stringify(value)}`);
  }
  for (const value of ["https://pam.example.test", "https://pam.example.test/", "https://pam.example.test:8443"]) {
    assert.equal(readVoiceConfig({ ...env, VOICE_PUBLIC_URL: value }).config?.VOICE_PUBLIC_URL, value);
  }
});

test("voice configuration, Twilio signatures and expiring SIP routing tokens", () => {
  assert.equal(readVoiceConfig({}).config, null);
  assert.ok(readVoiceConfig({ ...config, VOICE_MAX_CALLS: "3", VOICE_MAX_SECONDS: "600" }).config);
  const adapter = new TwilioSipAdapter(config);
  const path = "/api/telephony/twilio/voice";
  const request = twilioRequest(path, { AccountSid: config.TWILIO_ACCOUNT_SID, CallSid: callSid(), To: config.TWILIO_PHONE_NUMBER, From: "+40722123456" });
  assert.equal(adapter.verify(path, request.headers, request.body).To, config.TWILIO_PHONE_NUMBER);
  assert.throws(() => adapter.verify(path, request.headers, `${request.body}&To=%2B40733123456`), WebhookError);
  assert.throws(() => adapter.verify(path, request.headers, request.body.replace("40722123456", "40722123457")), WebhookError);
  assert.throws(() => adapter.verify("/api/telephony/twilio/status", request.headers, request.body), WebhookError);
  const id = randomUUID(), now = new Date();
  const token = routingToken(config.AUTH_SECRET, id, now);
  assert.equal(verifyRoutingToken(config.AUTH_SECRET, id, now, token), true);
  assert.equal(verifyRoutingToken(config.AUTH_SECRET, randomUUID(), now, token), false);
  assert.equal(verifyRoutingToken(config.AUTH_SECRET, id, now, "bad"), false);
  assert.equal(verifyRoutingToken(config.AUTH_SECRET, id, now, token, now.getTime() + 300001), false);
  const xml = adapter.dial(id, now);
  assert.match(xml, /transport=tls/);
  assert.match(xml, /x-pam-call=/);
  assert.match(xml, /x-pam-token=/);
  assert.ok(!xml.includes(config.OPENAI_API_KEY) && !xml.includes(config.TWILIO_AUTH_TOKEN));
});

test("OpenAI raw-body webhook verification rejects tampering and expired delivery", async () => {
  const adapter = new OpenAISipVoice(config);
  const event = { id: `evt_${randomUUID()}`, type: "realtime.call.incoming", data: { call_id: "sip-test", sip_headers: [] } };
  const request = openaiRequest(event);
  assert.equal((await adapter.verifyIncoming(request.body, request.headers))?.data.call_id, "sip-test");
  await assert.rejects(adapter.verifyIncoming(request.body.replace("sip-test", "sip-other"), request.headers), WebhookError);
  const expired = openaiRequest(event, Math.floor(Date.now() / 1000) - 1000);
  await assert.rejects(adapter.verifyIncoming(expired.body, expired.headers), WebhookError);
});

test("Realtime SIP protocol accepts, greets, normalizes transcripts and waits for every tool result", async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ server });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const messages: Record<string, unknown>[] = [];
  const connected = once(sockets, "connection");
  let accepted: Record<string, unknown> = {};
  const client = new OpenAI({ apiKey: "test", maxRetries: 0, fetch: async (_url, init) => {
    accepted = JSON.parse(String(init?.body));
    return new Response(null, { status: 200 });
  } });
  const adapter = new OpenAISipVoice(config, { client, connect: () => new WebSocket(`ws://127.0.0.1:${address.port}`) });
  const sessionPromise = adapter.startSession({ tenant: { companyId: randomUUID() }, callId: randomUUID(), startedAt: new Date(),
    connectionToken: "sip-test", instructions: "Vorbește română", model: config.OPENAI_REALTIME_MODEL, voice: config.OPENAI_VOICE, tools: receptionistTools });
  const [peer] = await connected as [WebSocket];
  peer.on("message", (bytes) => { messages.push(JSON.parse(bytes.toString())); });
  const session = await sessionPromise;
  const events = session.events[Symbol.asyncIterator]();
  try {
    assert.equal(accepted.type, "realtime");
    assert.equal(accepted.model, config.OPENAI_REALTIME_MODEL);
    assert.equal((accepted.audio as { input: { transcription: { language: string } } }).input.transcription.language, "ro");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(messages[0]?.type, "response.create");
    peer.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", item_id: "caller-1", transcript: "Mă numesc Ștefan." }));
    assert.equal((await events.next()).value?.type, "transcript");
    peer.send(JSON.stringify({ type: "response.output_audio_transcript.done", item_id: "agent-1", transcript: "Bună ziua!" }));
    assert.equal((await events.next()).value?.speaker, "agent");
    peer.send(JSON.stringify({ type: "response.done", response: { status: "completed", output: [
      { type: "function_call", call_id: "tool-1", name: "business_information", arguments: "{}" },
      { type: "function_call", call_id: "tool-2", name: "save_caller_intake", arguments: "{invalid" },
    ] } }));
    assert.equal((await events.next()).value?.invocationId, "tool-1");
    assert.equal((await events.next()).value?.arguments, null);
    await session.submitToolResult("tool-1", { ok: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(messages.filter((message) => message.type === "response.create").length, 1);
    await session.submitToolResult("tool-2", { ok: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(messages.filter((message) => message.type === "response.create").length, 2);
    assert.equal(messages.filter((message) => message.type === "conversation.item.create").length, 2);
    await session.close();
    await assert.doesNotReject(session.submitToolResult("queued-at-hangup", { ok: true }));
  } finally {
    await session.close(); peer.terminate(); sockets.close(); await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("malformed voice events report a failure before ending the stream", async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ server });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const connected = once(sockets, "connection");
  const adapter = new OpenAISipVoice(config, {
    connect: () => new WebSocket(`ws://127.0.0.1:${address.port}`),
  });
  const sessionPromise = adapter.attach("malformed-events");
  const [peer] = await connected as [WebSocket];
  const session = await sessionPromise;
  try {
    peer.send("not-json");
    const events = [];
    for await (const event of session.events) events.push(event);
    assert.equal(events[0]?.type, "error");
  } finally {
    await session.close(); peer.terminate(); sockets.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

class FakeSession implements VoiceSession {
  readonly results: unknown[] = [];
  private values: VoiceEvent[] = [];
  private wake?: () => void;
  private closed = false;
  constructor(readonly id: string) {}
  readonly events: AsyncIterable<VoiceEvent> = { [Symbol.asyncIterator]: () => this.iterate() };
  private async *iterate() {
    while (!this.closed || this.values.length) {
      const event = this.values.shift();
      if (event) yield event;
      else await new Promise<void>((resolve) => { this.wake = resolve; });
    }
  }
  push(event: VoiceEvent) { this.values.push(event); this.wake?.(); }
  async submitToolResult(_id: string, result: unknown) { this.results.push(result); }
  async close() { this.closed = true; this.wake?.(); }
}

test("first-call flow against PostgreSQL, with signed webhooks and fake external voice", async (t) => {
  const url = new URL(process.env.DATABASE_URL ?? "http://missing");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname === "/voice_ai_saas");
  const pool = new Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 5000 });
  const db = drizzle(pool, { schema });
  const a = randomUUID(), b = randomUUID();
  const ids = [a, b];
  const verifier = new OpenAISipVoice(config);
  const sessions: FakeSession[] = [], rejected: string[] = [], hangups: string[] = [];
  let started = 0;
  let failStart = false;
  const adapter = new TwilioSipAdapter(config);
  const runtime = new ReceptionistRuntime(db, config, {
    verifyIncoming: (body, headers) => verifier.verifyIncoming(body, headers),
    startSession: async (input) => {
      started++;
      if (failStart) throw new Error("Simulated provider failure");
      const session = new FakeSession(input.connectionToken); sessions.push(session); return session;
    },
    attach: async () => { throw new Error("No resumable fake session"); },
    reject: async (id) => { rejected.push(id); }, hangUp: async () => {},
  }, {
    verify: (path, headers, body) => adapter.verify(path, headers, body), dial: (id, start) => adapter.dial(id, start),
    hangUp: async (sid) => { hangups.push(sid); },
  });
  const caller = { name: "Ștefan Țurcanu", phone: "+40722123456", issue: "Doresc informații despre consultație" };
  let firstCallId = "", firstSid = "";
  const incoming = async (sid = callSid()) => {
    const request = twilioRequest("/api/telephony/twilio/voice", { AccountSid: config.TWILIO_ACCOUNT_SID,
      CallSid: sid, To: config.TWILIO_PHONE_NUMBER, From: caller.phone });
    const response = await runtime.handle("/api/telephony/twilio/voice", request.headers, request.body);
    return { sid, xml: await response.text(), request };
  };
  const sipEvent = (id: string, token: string, sipId: string) => ({ id: `evt_${randomUUID()}`, type: "realtime.call.incoming",
    data: { call_id: sipId, sip_headers: [{ name: "X-Pam-Call", value: id }, { name: "X-Pam-Token", value: token }] } });
  const sip = async (id: string, sipId: string) => {
    const call = await getRoutedCall(db, id); assert.ok(call);
    const request = openaiRequest(sipEvent(id, routingToken(config.AUTH_SECRET, id, call.startedAt), sipId));
    return runtime.handle("/api/voice/openai", request.headers, request.body);
  };
  try {
    await db.insert(schema.companies).values(ids.map((id) => ({ id, name: id === a ? "Cabinet Ștefan" : "Salon B", slug: `voice-test-${id}` })));
    await db.insert(schema.phoneConfigurations).values({ companyId: a, provider: "twilio", providerAccountId: config.TWILIO_ACCOUNT_SID,
      phoneNumber: config.TWILIO_PHONE_NUMBER, credentialReference: "test-only", enabled: true });
    await db.insert(schema.agentConfigurations).values({ companyId: a, greeting: "Bună ziua", instructions: "Răspunde politicos",
      model: config.OPENAI_REALTIME_MODEL, voice: config.OPENAI_VOICE, enabled: true });
    await db.insert(schema.businessHours).values({ companyId: a, weekday: 1, opensAt: "09:00", closesAt: "17:00" });
    await db.insert(schema.faqs).values({ companyId: a, question: "Unde sunteți?", answer: "Strada Exemplu 1" });
    await runtime.initialize();
    await t.test("Twilio retries create one call and unknown numbers never route", async () => {
      const sid = callSid(); firstSid = sid;
      const requests = await Promise.all([incoming(sid), incoming(sid)]);
      const calls = await listCalls(db, { companyId: a });
      assert.equal(calls.length, 1); firstCallId = calls[0]!.id;
      assert.equal(requests[0]!.xml, requests[1]!.xml);
      assert.match(requests[0]!.xml, /sip:proj_test@sip.api.openai.com/);
      assert.equal(await createIncomingCall(db, { accountId: config.TWILIO_ACCOUNT_SID, providerCallId: callSid(), to: "+40799111111", from: null }), null);
    });
    await t.test("forged routing and tenant identifiers are rejected", async () => {
      const request = openaiRequest(sipEvent(firstCallId, "forged", "rejected-call"));
      await runtime.handle("/api/voice/openai", request.headers, request.body);
      assert.ok(rejected.includes("rejected-call")); assert.equal(started, 0);
      assert.equal(await getCallDetails(db, { companyId: b }, firstCallId), null);
      assert.deepEqual(await listCalls(db, { companyId: b }), []);
    });
    await t.test("concurrent OpenAI retries start one voice session", async () => {
      await Promise.all([sip(firstCallId, "sip-first"), sip(firstCallId, "sip-first")]);
      assert.equal(started, 1);
      assert.equal((await getRoutedCall(db, firstCallId))?.status, "active");
      await sip(firstCallId, "sip-duplicate");
      assert.ok(rejected.includes("sip-duplicate")); assert.equal(started, 1);
    });
    await t.test("tools require confirmation, reject tenant IDs and persist once", async () => {
      const call = await getRoutedCall(db, firstCallId), context = await receptionContext(db, { companyId: a });
      assert.ok(call && context);
      assert.equal((await executeReceptionistTool(db, call, context, { name: "save_caller_intake", invocationId: "bad", arguments: { ...caller, confirmedByCaller: false } })).ok, false);
      assert.equal((await executeReceptionistTool(db, call, context, { name: "save_caller_intake", invocationId: "forged", arguments: { ...caller, confirmedByCaller: true, companyId: b } })).ok, false);
      assert.equal((await executeReceptionistTool(db, call, context, { name: "booking", invocationId: "unknown", arguments: {} })).ok, false);
      await saveIntake(db, call, "intake-first", { ...caller, details: {} });
      await saveIntake(db, call, "intake-first", { ...caller, name: "Duplicate altered payload", details: {} });
      assert.equal((await getRoutedCall(db, firstCallId))?.callerName, caller.name);
      const events = await pool.query("SELECT count(*)::int AS count FROM provider_events WHERE call_id=$1 AND provider='voice-tool'", [firstCallId]);
      assert.equal(events.rows[0].count, 1);
    });
    await t.test("transcripts survive duplicate items and retain conversation order", async () => {
      const call = await getRoutedCall(db, firstCallId); assert.ok(call);
      const agent = { itemId: "agent-1", speaker: "agent" as const, text: "Bună ziua!", offsetMs: 2000 };
      await Promise.all([appendTranscript(db, call, agent), appendTranscript(db, call, agent)]);
      await appendTranscript(db, call, { itemId: "caller-1", speaker: "caller", text: "Sunt Ștefan Țurcanu.", offsetMs: 1000 });
      const detail = await getCallDetails(db, { companyId: a }, firstCallId); assert.ok(detail);
      assert.equal(detail.transcript.length, 2);
      assert.equal(detail.transcript[0]?.speaker, "caller");
      assert.match(detail.transcript[0]!.text, /Ștefan Țurcanu/);
    });
    await t.test("hangup drains queued confirmed intake and late callbacks preserve final state", async () => {
      sessions[0]!.push({ type: "tool-call", invocationId: "intake-final", name: "save_caller_intake", arguments: { ...caller, issue: "Solicitare finală confirmată", confirmedByCaller: true } });
      const path = "/api/telephony/twilio/dial-ended";
      const request = twilioRequest(path, { AccountSid: config.TWILIO_ACCOUNT_SID, CallSid: firstSid, DialCallStatus: "completed", DialCallDuration: "42" });
      await runtime.handle(path, request.headers, request.body);
      await runtime.handle(path, request.headers, request.body);
      const call = await getRoutedCall(db, firstCallId); assert.ok(call);
      assert.equal(call.status, "completed"); assert.equal(call.durationSeconds, 42);
      assert.match(call.summary!, /Solicitare finală confirmată/);
      const endedAt = call.endedAt;
      await finishCall(db, call, "failed");
      assert.deepEqual((await getRoutedCall(db, firstCallId))?.endedAt, endedAt);
    });
    await t.test("provider failures persist failure and terminate the carrier call", async () => {
      failStart = true;
      const request = await incoming();
      const call = (await listCalls(db, { companyId: a })).find((call) => call.providerCallId === request.sid); assert.ok(call);
      await assert.rejects(sip(call.id, "sip-failed"));
      assert.equal((await getRoutedCall(db, call.id))?.status, "failed");
      assert.ok(hangups.includes(request.sid)); failStart = false;
    });
    await t.test("unconfigured firm can save reception knowledge without credentials", async () => {
      await db.insert(schema.services).values({ companyId: b, name: "Archived offering", durationMinutes: 30, active: false });
      await saveReceptionSettings(db, { companyId: b }, { greeting: "Bună ziua de la salon", instructions: "",
        opensAt: "09:00", closesAt: "17:00", weekdays: [1, 2], serviceName: "Tuns", durationMinutes: 30,
        faqs: [{ question: "Ce oferiți?", answer: "Tuns" }], enabled: false });
      const agent = await db.select().from(schema.agentConfigurations).where(eq(schema.agentConfigurations.companyId, b));
      assert.equal(agent[0]?.enabled, false);
      const offerings = await db.select().from(schema.services).where(eq(schema.services.companyId, b));
      assert.equal(offerings.find((service) => service.name === "Archived offering")?.active, false);
      assert.equal((await getReceptionSettings(db, { companyId: b })).service?.name, "Tuns");
    });
    await t.test("reception reads select the enabled phone after a number change", async () => {
      await db.insert(schema.phoneConfigurations).values({ companyId: b, provider: "twilio",
        providerAccountId: config.TWILIO_ACCOUNT_SID, phoneNumber: `+409${randomBytes(4).readUInt32BE().toString().padStart(10, "0")}`,
        credentialReference: "test-only", enabled: false });
      const [active] = await db.insert(schema.phoneConfigurations).values({ companyId: b, provider: "twilio",
        providerAccountId: config.TWILIO_ACCOUNT_SID, phoneNumber: `+409${randomBytes(4).readUInt32BE().toString().padStart(10, "0")}`,
        credentialReference: "test-only", enabled: true }).returning();
      assert.equal((await getReceptionSettings(db, { companyId: b })).phone?.id, active?.id);
    });
    await t.test("late SIP failure corrects a completed parent callback without reopening a call", async () => {
      const request = await incoming();
      const call = (await listCalls(db, { companyId: a })).find((call) => call.providerCallId === request.sid); assert.ok(call);
      await sip(call.id, "sip-order-test");
      const parentPath = "/api/telephony/twilio/status";
      const parent = twilioRequest(parentPath, { AccountSid: config.TWILIO_ACCOUNT_SID, CallSid: request.sid, CallStatus: "completed", CallDuration: "12" });
      await runtime.handle(parentPath, parent.headers, parent.body);
      assert.equal((await getRoutedCall(db, call.id))?.status, "completed");
      const path = "/api/telephony/twilio/dial-ended";
      const dial = twilioRequest(path, { AccountSid: config.TWILIO_ACCOUNT_SID, CallSid: request.sid, DialCallStatus: "failed", DialCallDuration: "0" });
      await runtime.handle(path, dial.headers, dial.body);
      await runtime.handle(parentPath, parent.headers, parent.body);
      assert.equal((await getRoutedCall(db, call.id))?.status, "failed");
      assert.equal((await getRoutedCall(db, call.id))?.durationSeconds, 0);
    });
    await t.test("session capacity rejects excess calls and shutdown finalizes active sessions", async () => {
      const activeIds: string[] = [];
      for (let index = 0; index < config.VOICE_MAX_CALLS + 1; index++) {
        const request = await incoming();
        const call = (await listCalls(db, { companyId: a })).find((call) => call.providerCallId === request.sid); assert.ok(call);
        await sip(call.id, `sip-capacity-${index}`);
        if (index < config.VOICE_MAX_CALLS) activeIds.push(call.id);
        else {
          assert.ok(rejected.includes(`sip-capacity-${index}`));
          assert.equal((await getRoutedCall(db, call.id))?.status, "missed");
        }
      }
      const ringing = await incoming();
      await runtime.stop();
      assert.ok(hangups.includes(ringing.sid));
      assert.equal((await listCalls(db, { companyId: a })).find((call) => call.providerCallId === ringing.sid)?.status, "failed");
      for (const id of activeIds) assert.equal((await getRoutedCall(db, id))?.status, "failed");
    });
    await t.test("restart reattaches persisted voice sessions and finalizes orphan calls", async () => {
      const recover = await createIncomingCall(db, { accountId: config.TWILIO_ACCOUNT_SID, providerCallId: callSid(), to: config.TWILIO_PHONE_NUMBER, from: caller.phone });
      const orphan = await createIncomingCall(db, { accountId: config.TWILIO_ACCOUNT_SID, providerCallId: callSid(), to: config.TWILIO_PHONE_NUMBER, from: null });
      assert.ok(recover && orphan);
      await db.update(schema.calls).set({ status: "active", voiceProvider: "openai", voiceSessionId: "sip-recovered", answeredAt: new Date() }).where(eq(schema.calls.id, recover.id));
      const restoredSession = new FakeSession("sip-recovered");
      const restored = new ReceptionistRuntime(db, config, {
        verifyIncoming: (body, headers) => verifier.verifyIncoming(body, headers),
        startSession: async () => { throw new Error("Recovery must not accept a second session"); },
        attach: async (id) => { assert.equal(id, "sip-recovered"); return restoredSession; },
        reject: async () => {}, hangUp: async () => {},
      }, {
        verify: (path, headers, body) => adapter.verify(path, headers, body), dial: (id, start) => adapter.dial(id, start),
        hangUp: async (sid) => { hangups.push(sid); },
      });
      try {
        await restored.initialize();
        assert.equal((await getRoutedCall(db, recover.id))?.status, "active");
        assert.equal((await getRoutedCall(db, orphan.id))?.status, "failed");
        assert.ok(hangups.includes(orphan.providerCallId));
        restoredSession.push({ type: "transcript", itemId: "recovered-item", speaker: "caller", text: "Conversație recuperată", offsetMs: 0 });
      } finally { await restored.stop(); }
      assert.equal((await getCallDetails(db, { companyId: a }, recover.id))?.transcript[0]?.text, "Conversație recuperată");
    });
  } finally {
    await runtime.stop();
    for (const table of ["provider_events", "transcript_entries", "appointments", "calls", "phone_configurations", "agent_configurations", "business_hours", "faqs", "services", "company_memberships"]) {
      await pool.query(`DELETE FROM ${table} WHERE company_id=ANY($1::uuid[])`, [ids]);
    }
    await pool.query("DELETE FROM companies WHERE id=ANY($1::uuid[])", [ids]);
    await pool.end();
  }
});
