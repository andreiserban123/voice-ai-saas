"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { AccessError, requireCompanyAccess } from "@/modules/auth/access";
import { receptionSettingsSchema, saveReceptionSettings } from "@/modules/companies/reception";

export async function saveSettings(companyId: string, _state: { error?: string; saved?: boolean }, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    const access = await requireCompanyAccess(getAuth(), getDb(), await headers(), companyId, "owner");
    const result = receptionSettingsSchema.safeParse({
      greeting: form.get("greeting"), instructions: form.get("instructions"),
      opensAt: form.get("opensAt"), closesAt: form.get("closesAt"), weekdays: form.getAll("weekdays"),
      serviceName: form.get("serviceName"), durationMinutes: form.get("durationMinutes"),
      faqs: [0, 1, 2].map((index) => ({ question: form.get(`question${index}`), answer: form.get(`answer${index}`) }))
        .filter((item) => item.question || item.answer), enabled: form.get("enabled") === "on",
    });
    if (!result.success) return { error: "Verifică salutul, serviciul, programul și cel puțin o întrebare cu răspuns." };
    await saveReceptionSettings(getDb(), access.tenant, result.data);
    revalidatePath("/dashboard"); revalidatePath("/dashboard/settings");
    return { saved: true };
  } catch (error) {
    if (error instanceof AccessError) return { error: "Nu ai permisiunea de a modifica această firmă." };
    if (error instanceof Error && ["Configurează", "Numărul"].some((prefix) => error.message.startsWith(prefix))) return { error: error.message };
    return { error: "Configurarea nu a putut fi salvată. Încearcă din nou." };
  }
}
