"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { AccessError } from "@/modules/auth/access";
import { onboardCompany, onboardingSchema } from "@/modules/companies/onboarding";

export async function createCompanyAction(_state: { error: string }, data: FormData) {
  const input = onboardingSchema.safeParse({ name: data.get("name") });
  if (!input.success) return { error: "Introdu un nume de service de maximum 200 de caractere." };
  let companyId: string;
  try {
    companyId = await onboardCompany(getAuth(), getDb(), await headers(), input.data);
  } catch (error) {
    if (error instanceof AccessError) redirect("/login");
    return { error: "Nu am putut crea service-ul. Încearcă din nou." };
  }
  redirect(`/dashboard?company=${companyId}`);
}
