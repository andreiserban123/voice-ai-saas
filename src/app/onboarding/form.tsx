"use client";

import { useActionState } from "react";
import { createCompanyAction } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createCompanyAction, { error: "" });
  return <form action={action} className="grid gap-5" aria-busy={pending}>
    {state.error && <p className="alert alert-error text-sm" role="alert">{state.error}</p>}
    <label className="grid gap-2 text-sm font-medium">Numele afacerii<input className="input w-full" name="name" autoComplete="organization" required maxLength={200} placeholder="De exemplu, Clinica Verde" /></label>
    <button className="btn btn-primary w-full" disabled={pending}>
      {pending && <span className="loading loading-spinner loading-xs" aria-hidden="true" />}
      {pending ? "Se creează…" : "Adaugă afacerea"}
    </button>
  </form>;
}
