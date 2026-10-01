import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { requirePageSession } from "@/modules/auth/page-session";
import { AccessError, listUserCompanies, requireCompanyAccess } from "@/modules/auth/access";
import { getReceptionSettings } from "@/modules/companies/reception";
import { readVoiceConfig } from "@/runtime/config";
import { ReceptionForm } from "./form";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await requirePageSession();
  const companyId = (await searchParams).company ?? (await listUserCompanies(getDb(), session.user.id))[0]?.id;
  if (!companyId) redirect("/onboarding");
  const access = await requireCompanyAccess(getAuth(), getDb(), await headers(), companyId, "owner").catch((error: unknown) => {
    if (error instanceof AccessError && [403, 404].includes(error.status)) notFound();
    throw error;
  });
  const settings = await getReceptionSettings(getDb(), access.tenant);
  const { config } = readVoiceConfig();
  return <section className="mx-auto max-w-5xl">
    <Link className="btn btn-ghost btn-sm mb-7 -ml-3 gap-2 text-base-content/65" href={`/dashboard?company=${companyId}`}>
      <span aria-hidden="true">←</span> Înapoi la dashboard
    </Link>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary">RECEPȚIA TA TELEFONICĂ</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Configurează recepția</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-base-content/65">Informațiile pe care Pam le folosește la telefon pentru {access.company.name}.</p>
      </div>
      <span className={`badge badge-soft mt-1 gap-2 whitespace-nowrap ${settings.agent?.enabled ? "badge-success" : "badge-neutral"}`}>
        <span className={`size-1.5 rounded-full ${settings.agent?.enabled ? "bg-success" : "bg-base-content/45"}`} aria-hidden="true" />
        {settings.agent?.enabled ? "Recepție activată" : "În configurare"}
      </span>
    </div>
    {config && <aside className="alert mb-8 border-primary/20 bg-primary/5 text-base-content shadow-none">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5"><path d="m8 3 2 5-3 2a14 14 0 0 0 7 7l2-3 5 2v3a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2h3Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <div><strong className="text-sm">Număr de test: {config.TWILIO_PHONE_NUMBER}</strong>
        <p className="mt-1 text-sm leading-relaxed text-base-content/65">După activare, sună acest număr pentru a vorbi cu Pam. Verifică și configurarea numărului în Twilio.</p>
      </div>
    </aside>}
    <ReceptionForm companyId={companyId} canActivate={Boolean(config)} initial={{
      greeting: settings.agent?.greeting ?? `Bună ziua! Ați sunat la ${access.company.name}. Sunt Pam.`,
      instructions: settings.agent?.instructions ?? "Preia solicitările clienților și răspunde din informațiile configurate.",
      opensAt: settings.hours[0]?.opensAt.slice(0, 5) ?? "09:00", closesAt: settings.hours[0]?.closesAt.slice(0, 5) ?? "17:00",
      weekdays: settings.hours.length ? [...new Set(settings.hours.map((hours) => hours.weekday))] : [1, 2, 3, 4, 5],
      serviceName: settings.service?.name ?? "Consultație", durationMinutes: settings.service?.durationMinutes ?? 60,
      faqs: settings.faqs, enabled: settings.agent?.enabled ?? false,
    }} />
  </section>;
}
