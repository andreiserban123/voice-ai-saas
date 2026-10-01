import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CallDatabase } from "@/modules/calls/repository";
import { agentConfigurations, businessHours, faqs, phoneConfigurations, services } from "@/db/schema";
import type { TenantContext } from "@/lib/validation";
import { readVoiceConfig } from "@/runtime/config";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const faq = z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(2000) });
export const receptionSettingsSchema = z.object({
  greeting: z.string().trim().min(1).max(1000), instructions: z.string().trim().max(4000),
  opensAt: clock, closesAt: clock,
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7).refine((days) => new Set(days).size === days.length),
  serviceName: z.string().trim().min(1).max(200), durationMinutes: z.coerce.number().int().min(5).max(480),
  faqs: z.array(faq).min(1).max(3), enabled: z.boolean(),
}).refine((input) => input.opensAt < input.closesAt, { path: ["closesAt"], message: "Ora închiderii trebuie să fie după ora deschiderii." });

export async function getReceptionSettings(db: CallDatabase, tenant: TenantContext) {
  const [agents, hours, questions, offerings, phones] = await Promise.all([
    db.select().from(agentConfigurations).where(eq(agentConfigurations.companyId, tenant.companyId)),
    db.select().from(businessHours).where(eq(businessHours.companyId, tenant.companyId)).orderBy(businessHours.weekday, businessHours.opensAt),
    db.select().from(faqs).where(and(eq(faqs.companyId, tenant.companyId), eq(faqs.active, true))).orderBy(faqs.sortOrder),
    db.select().from(services).where(and(eq(services.companyId, tenant.companyId), eq(services.active, true))).orderBy(services.id),
    db.select().from(phoneConfigurations).where(and(eq(phoneConfigurations.companyId, tenant.companyId), eq(phoneConfigurations.provider, "twilio")))
      .orderBy(desc(phoneConfigurations.enabled), desc(phoneConfigurations.updatedAt)),
  ]);
  return { agent: agents[0], hours, faqs: questions, service: offerings[0], phone: phones[0] };
}

// The action checks owner membership before calling this use case.
export async function saveReceptionSettings(db: CallDatabase, tenant: TenantContext, input: unknown) {
  const settings = receptionSettingsSchema.parse(input);
  const { config } = readVoiceConfig();
  if (settings.enabled && !config) throw new Error("Configurează integrarea Twilio și OpenAI pe server înainte de activare.");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('pam-phone-settings'))`);
    // Serialize edits and prevent two owners from claiming the same demo number.
    const phoneNumber = config?.TWILIO_PHONE_NUMBER;
    if (settings.enabled && phoneNumber) {
      const [assigned] = await tx.select().from(phoneConfigurations).where(eq(phoneConfigurations.phoneNumber, phoneNumber));
      if (assigned && assigned.companyId !== tenant.companyId) throw new Error("Numărul de test este deja asociat altei firme.");
    }
    await tx.insert(agentConfigurations).values({ companyId: tenant.companyId,
      greeting: settings.greeting, instructions: settings.instructions, enabled: settings.enabled,
      model: config?.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1", voice: config?.OPENAI_VOICE ?? "marin", voiceProvider: "openai",
    }).onConflictDoUpdate({ target: agentConfigurations.companyId, set: {
      greeting: settings.greeting, instructions: settings.instructions, enabled: settings.enabled,
      model: config?.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2.1", voice: config?.OPENAI_VOICE ?? "marin", updatedAt: new Date(),
    } });
    // This first-call form owns a single service and weekly opening window.
    await tx.delete(businessHours).where(eq(businessHours.companyId, tenant.companyId));
    await tx.insert(businessHours).values(settings.weekdays.map((weekday) => ({ companyId: tenant.companyId,
      weekday, opensAt: settings.opensAt, closesAt: settings.closesAt })));
    await tx.update(faqs).set({ active: false, updatedAt: new Date() }).where(eq(faqs.companyId, tenant.companyId));
    await tx.insert(faqs).values(settings.faqs.map((item, sortOrder) => ({ ...item, sortOrder, companyId: tenant.companyId })));
    const [service] = await tx.select().from(services)
      .where(and(eq(services.companyId, tenant.companyId), eq(services.active, true))).orderBy(services.id).limit(1);
    if (service) await tx.update(services).set({ name: settings.serviceName, durationMinutes: settings.durationMinutes,
      active: true, updatedAt: new Date() }).where(and(eq(services.companyId, tenant.companyId), eq(services.id, service.id)));
    else await tx.insert(services).values({ companyId: tenant.companyId, name: settings.serviceName, durationMinutes: settings.durationMinutes });
    await tx.update(phoneConfigurations).set({ enabled: false, updatedAt: new Date() }).where(eq(phoneConfigurations.companyId, tenant.companyId));
    if (settings.enabled && config) {
      await tx.insert(phoneConfigurations).values({ companyId: tenant.companyId, provider: "twilio",
        providerAccountId: config.TWILIO_ACCOUNT_SID, phoneNumber: config.TWILIO_PHONE_NUMBER,
        credentialReference: "env:TWILIO_AUTH_TOKEN", enabled: true,
      }).onConflictDoUpdate({ target: phoneConfigurations.phoneNumber, set: {
        provider: "twilio", credentialReference: "env:TWILIO_AUTH_TOKEN",
        providerAccountId: config.TWILIO_ACCOUNT_SID, enabled: true, updatedAt: new Date(),
      } });
    }
  });
}
