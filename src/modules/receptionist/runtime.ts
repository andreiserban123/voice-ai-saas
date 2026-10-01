import { z } from "zod";
import type { VoiceConfig } from "@/runtime/config";
import type { OpenAISipVoice } from "@/providers/voice/openai";
import { hangupXml, verifyRoutingToken, WebhookError, type TwilioSipAdapter } from "@/providers/telephony/twilio";
import type { VoiceSession } from "@/providers/voice/port";
import {
  appendTranscript, bindVoiceCall, createIncomingCall, findTwilioCall, finishCall, getRoutedCall,
  markAnswered, receptionContext, recordTwilioEnd, terminalStatuses, unfinishedCalls,
  type CallDatabase, type ReceptionContext, type StoredCall,
} from "@/modules/calls/repository";
import { buildInstructions, executeReceptionistTool, receptionistTools } from "./conversation";

type VoiceAdapter = Pick<OpenAISipVoice, "verifyIncoming" | "startSession" | "attach" | "reject" | "hangUp">;
type TelephonyAdapter = Pick<TwilioSipAdapter, "verify" | "dial" | "hangUp">;
const paths = new Set(["/api/telephony/twilio/voice", "/api/telephony/twilio/status", "/api/telephony/twilio/dial-ended", "/api/voice/openai"]);
export const isVoicePath = (path: string) => paths.has(path);
const xml = (body: string) => new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });

export class ReceptionistRuntime {
  private sessions = new Map<string, { session: VoiceSession; call: StoredCall; task: Promise<void> }>();
  private starting = new Map<string, { voiceCallId: string; task: Promise<void> }>();
  private stopping = false;
  private maintenance?: ReturnType<typeof setInterval>;
  private maintenanceTask: Promise<void> = Promise.resolve();

  constructor(private db: CallDatabase, private config: VoiceConfig, private voice: VoiceAdapter, private telephony: TelephonyAdapter) {}

  async initialize() {
    const calls = await unfinishedCalls(this.db, this.config.TWILIO_ACCOUNT_SID);
    for (const call of calls) {
      if (!call.voiceSessionId || Date.now() - call.startedAt.getTime() >= this.config.VOICE_MAX_SECONDS * 1000 || this.sessions.size >= this.config.VOICE_MAX_CALLS) {
        await this.endCarrier(call); await finishCall(this.db, call, "failed"); continue;
      }
      try {
        const context = await receptionContext(this.db, { companyId: call.companyId });
        if (!context) throw new Error("Reception disabled");
        const session = await this.voice.attach(call.voiceSessionId, false, call.startedAt);
        await markAnswered(this.db, call, this.config.OPENAI_PROJECT_ID, "recovery");
        this.watch(call, context, session);
      } catch {
        console.error("[voice] Could not recover call", call.id);
        await this.endCarrier(call); await finishCall(this.db, call, "failed");
      }
    }
    let running = false;
    this.maintenance = setInterval(() => {
      if (running || this.stopping) return;
      running = true;
      this.maintenanceTask = this.expireUnanswered().catch(() => console.error("[voice] Call cleanup failed"))
        .finally(() => { running = false; });
    }, 15_000);
    this.maintenance.unref();
  }

  async handle(path: string, headers: Headers, body: string): Promise<Response> {
    if (this.stopping) return new Response("Voice runtime stopping", { status: 503 });
    if (path === "/api/voice/openai") {
      const event = await this.voice.verifyIncoming(body, headers);
      if (!event) return new Response(null, { status: 204 });
      const value = (name: string) => {
        const matching = event.data.sip_headers.filter((header) => header.name.toLowerCase() === name);
        return matching.length === 1 ? matching[0]!.value : "";
      };
      const id = value("x-pam-call");
      const call = z.uuid().safeParse(id).success ? await getRoutedCall(this.db, id) : null;
      if (!call || call.providerAccountId !== this.config.TWILIO_ACCOUNT_SID ||
          !verifyRoutingToken(this.config.AUTH_SECRET, call.id, call.startedAt, value("x-pam-token")) ||
          terminalStatuses.includes(call.status as typeof terminalStatuses[number])) {
        await this.voice.reject(event.data.call_id);
        return new Response(null, { status: 204 });
      }
      const existing = this.sessions.get(call.id);
      if (existing) {
        if (existing.session.id !== event.data.call_id) await this.voice.reject(event.data.call_id);
        return new Response(null, { status: 204 });
      }
      const starting = this.starting.get(call.id);
      if (starting) {
        if (starting.voiceCallId !== event.data.call_id) await this.voice.reject(event.data.call_id);
        else await starting.task;
        return new Response(null, { status: 204 });
      }
      if (new Set([...this.sessions.keys(), ...this.starting.keys()]).size >= this.config.VOICE_MAX_CALLS) {
        await this.voice.reject(event.data.call_id);
        await finishCall(this.db, call, "missed");
        return new Response(null, { status: 204 });
      }
      const task = this.start(call, event.data.call_id, event.id);
      this.starting.set(call.id, { voiceCallId: event.data.call_id, task });
      try { await task; } finally { this.starting.delete(call.id); }
      return new Response(null, { status: 204 });
    }
    const incoming = this.telephony.verify(path, headers, body);
    if (path === "/api/telephony/twilio/voice") {
      if (incoming.To !== this.config.TWILIO_PHONE_NUMBER) throw new WebhookError(404);
      const call = await createIncomingCall(this.db, { accountId: incoming.AccountSid, providerCallId: incoming.CallSid,
        to: incoming.To, from: /^\+[1-9]\d{7,14}$/.test(incoming.From ?? "") ? incoming.From! : null });
      if (!call || call.status !== "ringing" || Date.now() - call.startedAt.getTime() > 60_000) return xml(hangupXml());
      return xml(this.telephony.dial(call.id, call.startedAt));
    }
    const call = await findTwilioCall(this.db, incoming.AccountSid, incoming.CallSid);
    if (!call) throw new WebhookError(404);
    const outcome = incoming.DialCallStatus ?? incoming.CallStatus;
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(outcome ?? "")) {
      const status = outcome === "completed" ? (call.answeredAt ? "completed" : "missed")
        : ["busy", "no-answer", "canceled"].includes(outcome!) ? "missed" : "failed";
      await recordTwilioEnd(this.db, call, `${path.endsWith("dial-ended") ? "dial" : "parent"}:${outcome}`);
      // Carrier completion is authoritative; close the event connection after draining queued events.
      const active = this.sessions.get(call.id);
      const authoritativeFailure = path.endsWith("dial-ended") && status !== "completed";
      if (status !== "completed") await finishCall(this.db, call, status, undefined, authoritativeFailure);
      if (active) { await active.session.close(); await active.task; }
      await finishCall(this.db, call, status, incoming.DialCallDuration ?? incoming.CallDuration, authoritativeFailure,
        path.endsWith("dial-ended") ? "dial" : "parent");
    }
    return path.endsWith("dial-ended") ? xml(hangupXml()) : new Response(null, { status: 204 });
  }

  private async start(call: StoredCall, callId: string, eventId: string) {
    let session: VoiceSession | undefined;
    try {
      const context = await receptionContext(this.db, { companyId: call.companyId });
      if (!context || !await bindVoiceCall(this.db, call, callId, eventId, this.config.OPENAI_PROJECT_ID)) {
        await this.voice.reject(callId); return;
      }
      session = await this.voice.startSession({ tenant: { companyId: call.companyId }, callId: call.id,
        connectionToken: callId, startedAt: call.startedAt, instructions: buildInstructions(context), model: context.agent.model,
        voice: context.agent.voice, tools: receptionistTools });
      await markAnswered(this.db, call, this.config.OPENAI_PROJECT_ID, eventId);
      // A signed completion callback may arrive while accept/attach is in progress.
      const current = await getRoutedCall(this.db, call.id);
      if (this.stopping || !current || current.status !== "active") {
        await session.close(); await this.endCarrier(call);
        await finishCall(this.db, call, "failed");
        return;
      }
      this.watch(call, context, session);
    } catch {
      if (session) await session.close();
      console.error("[voice] Call start failed", call.id);
      await this.endCarrier(call);
      await finishCall(this.db, call, "failed");
      throw new Error("Call start failed");
    }
  }

  private watch(call: StoredCall, context: ReceptionContext, session: VoiceSession) {
    const remaining = Math.max(1, this.config.VOICE_MAX_SECONDS * 1000 - (Date.now() - call.startedAt.getTime()));
    const timer = setTimeout(() => {
      void this.endCarrier(call).finally(() => session.close());
    }, remaining);
    timer.unref();
    const task = this.consume(call, context, session).catch(async () => {
      console.error("[voice] Call processing failed", call.id);
      await finishCall(this.db, call, "failed");
    }).finally(async () => {
      clearTimeout(timer); await session.close(); await this.endCarrier(call); this.sessions.delete(call.id);
    });
    // Attach a rejection observer even if final database cleanup fails.
    void task.catch(() => console.error("[voice] Call finalization failed", call.id));
    this.sessions.set(call.id, { call, session, task });
  }

  private async consume(call: StoredCall, context: ReceptionContext, session: VoiceSession) {
    let failed = false;
    const results = new Map<string, unknown>();
    for await (const event of session.events) {
      if (event.type === "transcript") {
        await appendTranscript(this.db, call, event);
      } else if (event.type === "tool-call") {
        let result = results.get(event.invocationId);
        if (!results.has(event.invocationId)) {
          result = await executeReceptionistTool(this.db, call, context, event);
          results.set(event.invocationId, result);
        }
        await session.submitToolResult(event.invocationId, result);
      } else if (event.type === "error") {
        failed = true; break;
      } else if (event.type === "ended" && event.reason !== "remote_hangup") {
        failed = true;
      }
    }
    await finishCall(this.db, call, failed ? "failed" : "completed");
  }

  private async endCarrier(call: StoredCall) {
    try { await this.telephony.hangUp(call.providerCallId); }
    catch { console.error("[voice] Carrier hangup unconfirmed", call.id); }
  }

  private async expireUnanswered() {
    for (const call of await unfinishedCalls(this.db, this.config.TWILIO_ACCOUNT_SID)) {
      if (call.status === "ringing" && Date.now() - call.startedAt.getTime() > 60_000 && !this.starting.has(call.id)) {
        await this.endCarrier(call); await finishCall(this.db, call, "missed");
      }
    }
  }

  async stop() {
    this.stopping = true;
    clearInterval(this.maintenance);
    await this.maintenanceTask;
    await Promise.allSettled([...this.starting.values()].map((entry) => entry.task));
    await Promise.allSettled([...this.sessions.values()].map(async ({ call, session, task }) => {
      await this.endCarrier(call); await finishCall(this.db, call, "failed"); await session.close(); await task;
    }));
    for (const call of await unfinishedCalls(this.db, this.config.TWILIO_ACCOUNT_SID)) {
      await this.endCarrier(call);
      await finishCall(this.db, call, "failed");
    }
  }
}
