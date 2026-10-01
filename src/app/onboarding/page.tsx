import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requirePageSession } from "@/modules/auth/page-session";
import { listUserCompanies } from "@/modules/auth/access";
import { SignOutButton } from "@/modules/auth/components/sign-out-button";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const session = await requirePageSession();
  const companies = await listUserCompanies(getDb(), session.user.id);
  if (companies.length) redirect("/dashboard");
  return <section className="card mx-auto max-w-xl border border-base-300 bg-base-100 shadow-sm">
    <div className="card-body gap-0 p-6 sm:p-10">
      <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-6"><path d="M4 21h16M6 21V5l6-2 6 2v16M9 8h1m4 0h1M9 12h1m4 0h1m-5 9v-5h4v5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary">SĂ FACEM CUNOȘTINȚĂ</p>
      <h1 className="text-3xl font-semibold tracking-tight">Adaugă afacerea ta</h1>
      <p className="mb-7 mt-3 text-sm leading-relaxed text-base-content/65">Vei putea configura programul, serviciile și recepția telefonică pentru afacerea ta.</p>
      <OnboardingForm />
      <p className="mb-5 mt-7 border-t border-base-300 pt-5 text-xs leading-relaxed text-base-content/60">Dacă faci parte dintr-o afacere deja înregistrată, cere proprietarului să îți acorde acces.</p>
      <SignOutButton />
    </div>
  </section>;
}
