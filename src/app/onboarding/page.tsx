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
  return <section className="panel auth-panel">
    <h1>Adaugă afacerea ta</h1>
    <p>Vei putea configura programul, serviciile și recepția telefonică pentru afacerea ta.</p>
    <OnboardingForm />
    <p className="field-help">Dacă faci parte dintr-o afacere deja înregistrată, cere proprietarului să îți acorde acces.</p>
    <SignOutButton />
  </section>;
}
