import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { requirePageSession } from "@/modules/auth/page-session";
import { AccessError, listUserCompanies, requireCompanyAccess } from "@/modules/auth/access";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";

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
  return (
    <>
      <div className="account-bar">
        <p><strong>{access.company.name}</strong> · {session.user.name}</p>
        <SignOutButton />
      </div>
      {companies.length > 1 && <nav className="auth-links" aria-label="Service-uri">
        {companies.map((company) => <Link key={company.id} href={`/dashboard?company=${company.id}`} aria-current={company.id === companyId ? "page" : undefined}>{company.name}</Link>)}
      </nav>}
      <section className="intro">
        <p className="eyebrow">SERVICE AUTO · RECEPȚIE TELEFONICĂ</p>
        <h1>Mai mult timp pentru atelier.</h1>
        <p>Apelurile și programările service-ului, într-un singur loc.</p>
      </section>
      <aside className="notice">
        <strong>Recepționerul nu este încă activ.</strong>
        <p>Configurarea companiei, a numărului de telefon și a calendarului urmează. Această pagină nu afișează încă date reale.</p>
      </aside>
      <div className="grid">
        <section className="panel" aria-labelledby="calls-title">
          <h2 id="calls-title">Apeluri recente</h2>
          <div className="empty">
            <span className="symbol" aria-hidden="true">↗</span>
            <h3>Aici începe conversația</h3>
            <p>După activare, vei putea consulta apelurile, rezumatele și informațiile oferite de clienți.</p>
          </div>
        </section>
        <section className="panel" aria-labelledby="appointments-title">
          <h2 id="appointments-title">Programări</h2>
          <div className="empty">
            <span className="symbol" aria-hidden="true">◷</span>
            <h3>Un calendar mai ușor de urmărit</h3>
            <p>Programările confirmate telefonic vor apărea aici, împreună cu detaliile mașinii și ale solicitării.</p>
          </div>
        </section>
      </div>
      <footer>Conceput pentru service-uri auto independente din România.</footer>
    </>
  );
}
