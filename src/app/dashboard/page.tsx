import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { requirePageSession } from "@/modules/auth/page-session";
import { AccessError, listUserCompanies, requireCompanyAccess } from "@/modules/auth/access";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";
import { listCalls } from "@/modules/calls/repository";
import { getReceptionSettings } from "@/modules/companies/reception";
import { formatCallTime } from "@/modules/calls/presentation";
import { CallStatusBadge, DashboardIcon } from "./ui";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await requirePageSession();
  const companies = await listUserCompanies(getDb(), session.user.id);
  const companyId = (await searchParams).company ?? companies[0]?.id;
  if (!companyId) redirect("/onboarding");
  const access = await requireCompanyAccess(getAuth(), getDb(), await headers(), companyId).catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 404) notFound();
    if (error instanceof AccessError) redirect("/login");
    throw error;
  });
  const [recentCalls, reception] = await Promise.all([
    listCalls(getDb(), access.tenant), getReceptionSettings(getDb(), access.tenant),
  ]);
  const isReady = Boolean(reception.agent?.enabled && reception.phone?.enabled);
  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-col gap-4 border-b border-base-300 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-base-300 bg-base-100 text-primary"><DashboardIcon name="building" /></div>
          <div><p className="font-semibold text-base-content">{access.company.name}</p><p className="text-sm text-base-content/60">Spațiul tău de lucru · {session.user.name}</p></div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge badge-sm ${isReady ? "badge-success badge-soft" : "badge-warning badge-soft"}`}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{isReady ? "Recepție activă" : "În configurare"}</span>
          <SignOutButton />
        </div>
      </div>
      {companies.length > 1 && <nav className="flex flex-wrap gap-2" aria-label="Afaceri">
        {companies.map((company) => <Link className={`btn btn-sm ${company.id === companyId ? "btn-primary" : "btn-ghost"}`} key={company.id} href={`/dashboard?company=${company.id}`} aria-current={company.id === companyId ? "page" : undefined}>{company.name}</Link>)}
      </nav>}
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase"><DashboardIcon name="sparkles" className="size-4" /> Recepția ta, cu Pam</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-base-content sm:text-4xl lg:text-5xl">Mai mult timp pentru<br className="hidden sm:block" /> afacerea ta.</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-base-content/65">O privire asupra conversațiilor cu clienții tăi. Apeluri, solicitări și următorii pași, într-un singur loc.</p>
        </div>
        {access.role === "owner" && <Link className="btn btn-outline self-start rounded-xl sm:self-auto" href={`/dashboard/settings?company=${companyId}`}><DashboardIcon name="sparkles" className="size-4" /> Setările recepției</Link>}
      </section>
      <aside className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-12 -right-12 size-48 rounded-full border-[24px] border-primary/5" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-content"><DashboardIcon name={isReady ? "check" : "phone"} className="size-6" /></div>
          <div className="flex-1">
            <p className="mb-1 text-xs font-semibold tracking-widest text-primary uppercase">{isReady ? "Pregătită să răspundă" : "Primul tău apel"}</p>
            <h2 className="text-lg font-semibold text-base-content">{isReady ? "Pam este configurată pentru apeluri." : "O primire atentă începe aici."}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-base-content/65">{isReady
              ? `Numărul de test este ${reception.phone?.phoneNumber}. Apelurile preluate apar mai jos. Programările urmează.`
              : "Adaugă programul, serviciul și răspunsurile firmei, apoi activează numărul de test. Pam va avea toate informațiile pentru prima conversație."}</p>
          </div>
          {access.role === "owner" && <Link className="btn btn-primary self-start rounded-xl sm:shrink-0 sm:self-center" href={`/dashboard/settings?company=${companyId}`}>Configurează recepția →</Link>}
        </div>
      </aside>
      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <section className="card overflow-hidden border border-base-300 bg-base-100 shadow-sm" aria-labelledby="calls-title">
          <div className="flex items-center justify-between gap-4 border-b border-base-300 px-6 py-5">
            <div className="flex items-center gap-3"><DashboardIcon name="phone" className="size-5 text-primary" /><h2 id="calls-title" className="text-lg font-semibold">Apeluri recente</h2></div>
            <span className="badge badge-ghost badge-sm">{recentCalls.length} {recentCalls.length === 1 ? "apel" : "apeluri"}</span>
          </div>
          {recentCalls.length ? <ul className="divide-y divide-base-300">{recentCalls.map((call) => <li key={call.id} className="p-5 transition-colors hover:bg-base-200/50 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl bg-base-200 text-base-content/60"><DashboardIcon name="phone" className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="rounded-sm font-semibold text-base-content transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href={`/dashboard/calls/${call.id}?company=${companyId}`}>{call.callerName ?? call.callerPhone ?? "Apelant necunoscut"}</Link>
                  <CallStatusBadge status={call.status} />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-base-content/55">{formatCallTime(call.startedAt, access.company.timezone)}{call.durationSeconds !== null && ` · ${call.durationSeconds} secunde`}</p>
                <p className="mt-3 text-sm leading-relaxed text-base-content/75">{call.issue ?? "Nicio solicitare confirmată."}</p>
              </div>
            </div>
          </li>)}</ul> : <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary"><DashboardIcon name="message" className="size-7" /></div>
            <h3 className="text-lg font-semibold">Aici începe conversația</h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-base-content/60">După activare, vei putea consulta apelurile, rezumatele și informațiile oferite de clienți.</p>
            <span className="mt-6 flex items-center gap-2 text-xs text-base-content/50"><span className="size-1.5 rounded-full bg-base-content/30" aria-hidden="true" /> În așteptarea primului apel</span>
          </div>}
        </section>
        <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="appointments-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-6 py-5">
            <div className="flex items-center gap-3"><DashboardIcon name="calendar" className="size-5 text-primary" /><h2 id="appointments-title" className="text-lg font-semibold">Programări</h2></div>
            <span className="badge badge-ghost badge-sm">În curând</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-base-300 bg-base-200/60 text-base-content/55"><DashboardIcon name="calendar" className="size-7" /></div>
            <h3 className="max-w-64 text-lg font-semibold">Un calendar mai ușor de urmărit</h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-base-content/60">Programările confirmate telefonic vor apărea aici, împreună cu datele de contact și detaliile solicitării.</p>
            <p className="mt-6 text-xs text-base-content/50">Integrarea cu calendarul urmează.</p>
          </div>
        </section>
      </div>
      <footer className="flex flex-col gap-2 border-t border-base-300 pt-5 pb-3 text-xs text-base-content/50 sm:flex-row sm:justify-between"><p>Pam.ai · O primire atentă pentru fiecare client.</p><p className="flex items-center gap-1.5"><DashboardIcon name="clock" className="size-3.5" /> {access.company.timezone}</p></footer>
    </div>
  );
}
