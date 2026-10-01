"use client";

import { useActionState } from "react";
import { createCompanyAction } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createCompanyAction, { error: "" });
  return <form action={action} className="auth-form">
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <label>Numele afacerii<input name="name" autoComplete="organization" required maxLength={200} /></label>
    <button disabled={pending}>{pending ? "Se creează…" : "Adaugă afacerea"}</button>
  </form>;
}
