import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { agentConfigurations, businessHours, calls, companies, faqs, phoneConfigurations, providerEvents, services, transcriptEntries } from "@/db/schema";
import type { TenantContext } from "@/lib/validation";
import type { CallerIntake } from "./schemas";

export type CallDatabase = ReturnType<typeof getDb>;
export type StoredCall = typeof calls.$inferSelect;
export const terminalStatuses = ["completed", "failed", "missed", "transferred"] as const;

export function listCalls(db: CallDatabase, tenant: TenantContext) {
  return db.select().from(calls).where(eq(calls.companyId, tenant.companyId)).orderBy(desc(calls.startedAt)).limit(30);
}

export async function getCallDetails(db: CallDatabase, tenant: TenantContext, callId: string) {
  const [call] = await db.select().from(calls).where(and(eq(calls.companyId, tenant.companyId), eq(calls.id, callId))).limit(1);
  if (!call) return null;
  const transcript = await db.select().from(transcriptEntries)
    .where(and(eq(transcriptEntries.companyId, tenant.companyId), eq(transcriptEntries.callId, callId)))
    .orderBy(asc(transcriptEntries.offsetMs), asc(transcriptEntries.sequence));
  return { call, transcript };
}

export async function receptionContext(db: CallDatabase, tenant: TenantContext) {
  const [company] = await db.select().from(companies).where(eq(companies.id, tenant.companyId));
  const [agent] = await db.select().from(agentConfigurations).where(eq(agentConfigurations.companyId, tenant.companyId));
  if (!company || !agent?.enabled || agent.voiceProvider !== "openai") return null;
  const [hours, questions, offerings] = await Promise.all([
    db.select().from(businessHours).where(eq(businessHours.companyId, tenant.companyId)).orderBy(businessHours.weekday, businessHours.opensAt),
    db.select({ question: faqs.question, answer: faqs.answer }).from(faqs)
      .where(and(eq(faqs.companyId, tenant.companyId), eq(faqs.active, true))).orderBy(faqs.sortOrder),
    db.select({ name: services.name, description: services.description, durationMinutes: services.durationMinutes }).from(services)
      .where(and(eq(services.companyId, tenant.companyId), eq(services.active, true))),
  ]);
  return { company, agent, hours, questions, services: offerings };
}

export type ReceptionContext = NonNullable<Awaited<ReturnType<typeof receptionContext>>>;

export async function createIncomingCall(db: CallDatabase, input: {
  accountId: string; providerCallId: string; to: string; from: string | null;
}) {
  return db.transaction(async (tx) => {
    const [phone] = await tx.select().from(phoneConfigurations).where(and(
      eq(phoneConfigurations.provider, "twilio"), eq(phoneConfigurations.providerAccountId, input.accountId),
      eq(phoneConfigurations.phoneNumber, input.to), eq(phoneConfigurations.enabled, true),
    ));
    if (!phone) return null;
    const [agent] = await tx.select().from(agentConfigurations).where(and(
      eq(agentConfigurations.companyId, phone.companyId), eq(agentConfigurations.enabled, true),
    ));
    if (!agent) return null;
    await tx.insert(calls).values({
      companyId: phone.companyId, phoneConfigurationId: phone.id, telephonyProvider: "twilio",
      providerAccountId: input.accountId, providerCallId: input.providerCallId,
      callerPhone: input.from, startedAt: new Date(),
    }).onConflictDoNothing({ target: [calls.telephonyProvider, calls.providerAccountId, calls.providerCallId] });
    const [call] = await tx.select().from(calls).where(and(
      eq(calls.companyId, phone.companyId), eq(calls.telephonyProvider, "twilio"),
      eq(calls.providerAccountId, input.accountId), eq(calls.providerCallId, input.providerCallId),
    ));
    if (!call) return null;
    await tx.insert(providerEvents).values({
      companyId: phone.companyId, callId: call.id, provider: "twilio", providerAccountId: input.accountId,
      providerEventId: `incoming:${input.providerCallId}`, eventType: "incoming", status: "processed", processedAt: new Date(),
    }).onConflictDoNothing();
    return call;
  });
}

// Only verified SIP routing tokens can reach this lookup; dashboard uses scoped reads above.
export async function getRoutedCall(db: CallDatabase, callId: string) {
  const [call] = await db.select().from(calls).where(eq(calls.id, callId));
  return call ?? null;
}

export async function bindVoiceCall(db: CallDatabase, call: StoredCall, sessionId: string, eventId: string, projectId: string) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(calls).where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id))).for("update");
    if (!current || terminalStatuses.includes(current.status as typeof terminalStatuses[number])) return false;
    if (current.voiceSessionId && current.voiceSessionId !== sessionId) return false;
    await tx.update(calls).set({ voiceProvider: "openai", voiceSessionId: sessionId, updatedAt: new Date() })
      .where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id)));
    await tx.insert(providerEvents).values({ companyId: call.companyId, callId: call.id, provider: "openai",
      providerAccountId: projectId, providerEventId: eventId, eventType: "realtime.call.incoming" }).onConflictDoNothing();
    return true;
  });
}

export async function markAnswered(db: CallDatabase, call: StoredCall, projectId: string, eventId: string) {
  await db.transaction(async (tx) => {
    await tx.update(calls).set({ status: "active", answeredAt: new Date(), updatedAt: new Date() })
      .where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id), eq(calls.status, "ringing")));
    await tx.update(providerEvents).set({ status: "processed", processedAt: new Date() }).where(and(
      eq(providerEvents.companyId, call.companyId), eq(providerEvents.provider, "openai"),
      eq(providerEvents.providerAccountId, projectId), eq(providerEvents.providerEventId, eventId),
    ));
  });
}

export async function appendTranscript(db: CallDatabase, call: StoredCall, item: {
  itemId: string; speaker: "caller" | "agent"; text: string; offsetMs: number;
}) {
  await db.transaction(async (tx) => {
    // Row lock serializes event sequence allocation and tool writes for this call.
    await tx.select({ id: calls.id }).from(calls).where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id))).for("update");
    const [last] = await tx.select({ sequence: transcriptEntries.sequence }).from(transcriptEntries)
      .where(and(eq(transcriptEntries.companyId, call.companyId), eq(transcriptEntries.callId, call.id)))
      .orderBy(desc(transcriptEntries.sequence)).limit(1);
    await tx.insert(transcriptEntries).values({ companyId: call.companyId, callId: call.id,
      sequence: (last?.sequence ?? -1) + 1, providerItemId: item.itemId, speaker: item.speaker,
      text: item.text.slice(0, 16000), offsetMs: Math.min(2147483647, Math.max(0, item.offsetMs)),
    }).onConflictDoNothing({ target: [transcriptEntries.companyId, transcriptEntries.callId, transcriptEntries.providerItemId] });
  });
}

export async function saveIntake(db: CallDatabase, call: StoredCall, invocationId: string, caller: CallerIntake) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(calls).where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id))).for("update");
    if (!current || current.status !== "active") return { ok: false, error: "call_ended" };
    const [saved] = await tx.insert(providerEvents).values({ companyId: call.companyId, callId: call.id,
      provider: "voice-tool", providerAccountId: call.providerAccountId, providerEventId: `${call.id}:${invocationId}`,
      eventType: "save_caller_intake", status: "processed", processedAt: new Date(),
    }).onConflictDoNothing().returning({ id: providerEvents.id });
    if (saved) await tx.update(calls).set({ callerName: caller.name, callerPhone: caller.phone,
      issue: caller.issue, details: caller.details, updatedAt: new Date() })
      .where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id)));
    return { ok: true };
  });
}

export async function finishCall(db: CallDatabase, call: StoredCall, status: "completed" | "failed" | "missed", durationSeconds?: number, authoritativeFailure = false, durationSource?: "parent" | "dial") {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(calls).where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id))).for("update");
    if (!current) return;
    // The SIP leg duration takes precedence over later/retried parent callbacks.
    if (durationSource === "parent") {
      const [dialEnd] = await tx.select({ id: providerEvents.id }).from(providerEvents).where(and(
        eq(providerEvents.companyId, call.companyId), eq(providerEvents.callId, call.id),
        eq(providerEvents.provider, "twilio"), like(providerEvents.eventType, "dial:%"),
      )).limit(1);
      if (dialEnd) durationSeconds = undefined;
    }
    const endedAt = new Date(Math.max(Date.now(), current.answeredAt?.getTime() ?? current.startedAt.getTime()));
    const terminal = terminalStatuses.includes(current.status as typeof terminalStatuses[number]);
    // Summarize confirmed intake, never invent caller details from an incomplete transcript.
    const summary = current.issue ? `${current.callerName ?? "Apelant"}: ${current.issue}`
      : "Apel fără solicitare confirmată. Consultă transcrierea pentru detalii.";
    await tx.update(calls).set({
      ...(terminal ? {} : { status, endedAt, durationSeconds: durationSeconds ?? Math.max(0, Math.floor((endedAt.getTime() - (current.answeredAt ?? current.startedAt).getTime()) / 1000)) }),
      ...(authoritativeFailure && current.status === "completed" && status !== "completed" ? { status } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}), summary, updatedAt: new Date(),
    }).where(and(eq(calls.companyId, call.companyId), eq(calls.id, call.id)));
    await tx.update(providerEvents).set({ status: "failed", processedAt: new Date() })
      .where(and(eq(providerEvents.companyId, call.companyId), eq(providerEvents.callId, call.id), eq(providerEvents.status, "pending")));
  });
}

export async function findTwilioCall(db: CallDatabase, accountId: string, callSid: string) {
  const [call] = await db.select().from(calls).where(and(
    eq(calls.telephonyProvider, "twilio"), eq(calls.providerAccountId, accountId), eq(calls.providerCallId, callSid),
  ));
  return call ?? null;
}

export function unfinishedCalls(db: CallDatabase, accountId: string) {
  return db.select().from(calls).where(and(eq(calls.telephonyProvider, "twilio"),
    eq(calls.providerAccountId, accountId), inArray(calls.status, ["ringing", "active"])));
}

export async function recordTwilioEnd(db: CallDatabase, call: StoredCall, kind: string) {
  await db.insert(providerEvents).values({ companyId: call.companyId, callId: call.id, provider: "twilio",
    providerAccountId: call.providerAccountId, providerEventId: `ended:${call.providerCallId}:${kind}`,
    eventType: kind, status: "processed", processedAt: new Date(),
  }).onConflictDoNothing();
}
