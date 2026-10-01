"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "../client";

type Mode = "login" | "signup" | "forgot" | "reset" | "verify";
const labels: Record<Mode, { title: string; button: string; description: string }> = {
  login: { title: "Bine ai revenit", button: "Intră în cont", description: "Intră în spațiul tău de lucru și vezi ce au nevoie clienții tăi." },
  signup: { title: "Creează un cont", button: "Creează contul", description: "Primul pas către o recepție care îți lasă mai mult timp pentru afacere." },
  forgot: { title: "Ai uitat parola?", button: "Trimite linkul de resetare", description: "Introdu adresa contului și îți trimitem un link pentru o parolă nouă." },
  reset: { title: "Alege o parolă nouă", button: "Salvează parola", description: "Alege o parolă sigură pentru a reveni în spațiul tău de lucru." },
  verify: { title: "Confirmă adresa de email", button: "Retrimite emailul de confirmare", description: "Confirmarea adresei de email îți permite să accesezi contul Pam." },
};

export function AuthForm({ mode, token, initialMessage }: { mode: Mode; token?: string; initialMessage?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "");
  const needsPassword = ["login", "signup", "reset"].includes(mode);
  const newPassword = mode === "signup" || mode === "reset";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");
    setError("");
    setMessage("");
    if (newPassword && password !== data.get("confirmation")) {
      setError("Parolele nu coincid.");
      return;
    }
    setPending(true);
    try {
      const result = mode === "login"
        ? await authClient.signIn.email({ email, password })
        : mode === "signup"
          ? await authClient.signUp.email({ email, password, name: String(data.get("name")).trim(), callbackURL: "/login?verified=1" })
          : mode === "forgot"
            ? await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })
            : mode === "verify"
              ? await authClient.sendVerificationEmail({ email, callbackURL: "/login?verified=1" })
              : await authClient.resetPassword({ newPassword: password, token: token ?? "" });

      if (result.error) {
        if (result.error.status === 429) setError("Prea multe încercări. Așteaptă un minut și încearcă din nou.");
        else if (mode === "login" && result.error.code === "EMAIL_NOT_VERIFIED") setError("Confirmă adresa de email înainte de autentificare. Poți retrimite emailul de mai jos.");
        else if (mode === "login") setError("Emailul sau parola nu sunt corecte.");
        else if (mode === "reset") setError("Linkul este invalid sau a expirat. Solicită un link nou.");
        else setError("Nu am putut finaliza cererea. Verifică datele și încearcă din nou.");
        return;
      }
      if (mode === "login") {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      form.reset();
      setMessage(mode === "reset"
        ? "Parola a fost schimbată. Te poți autentifica folosind noua parolă."
        : mode === "forgot"
          ? "Dacă există un cont cu această adresă, vei primi un link de resetare."
          : "Verifică inboxul pentru instrucțiuni. Dacă ai deja un cont confirmat, te poți autentifica.");
    } catch {
      setError("Conexiunea a eșuat. Încearcă din nou.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 py-6 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:py-12">
      <aside className="hidden lg:block">
        <p className="mb-5 text-xs font-semibold tracking-[0.2em] text-primary">BUN VENIT LA PAM.AI</p>
        <h2 className="max-w-sm text-5xl font-semibold leading-[1.12] tracking-tight">O primire atentă.<br /><span className="text-primary">Mai mult timp pentru tine.</span></h2>
        <p className="mt-6 max-w-sm text-base leading-relaxed text-base-content/65">Pregătește recepția telefonică a afacerii tale, urmărește conversațiile și păstrează solicitările clienților într-un singur loc.</p>
        <div className="mt-9 flex items-center gap-3 border-t border-base-300 pt-6 text-sm text-base-content/65">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 12H3v6h4v-6H4Zm16 0h1v6h-4v-6h3Zm0 6a4 4 0 0 1-4 4h-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>Recepția ta, cu vocea lui Pam.</span>
        </div>
      </aside>
      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-0 p-6 sm:p-9">
          <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-primary">SPAȚIUL TĂU DE LUCRU</p>
          <h1 className="text-3xl font-semibold tracking-tight">{labels[mode].title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-base-content/65">{labels[mode].description}</p>
          {message && <p className="alert mt-6 border-primary/20 bg-primary/5 text-sm text-base-content shadow-none" role="status">{message}</p>}
          {error && <p className="alert alert-error mt-6 text-sm" role="alert">{error}</p>}
          <form onSubmit={submit} className="mt-7 grid gap-5" aria-busy={pending}>
            {mode === "signup" && <label className="grid gap-2 text-sm font-medium">Nume<input className="input w-full" name="name" autoComplete="name" required maxLength={200} placeholder="Numele tău" /></label>}
            {mode !== "reset" && <label className="grid gap-2 text-sm font-medium">Email<input className="input w-full" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nume@afacere.ro" /></label>}
            {needsPassword && <label className="grid gap-2 text-sm font-medium">{mode === "reset" ? "Parola nouă" : "Parolă"}
              <input className="input w-full" name="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"}
                required minLength={newPassword ? 15 : undefined} maxLength={128} aria-describedby={newPassword ? "password-help" : undefined} />
            </label>}
            {newPassword && <>
              <p id="password-help" className="-mt-3 text-xs leading-relaxed text-base-content/60">Folosește între 15 și 128 de caractere. Poți folosi o frază lungă.</p>
              <label className="grid gap-2 text-sm font-medium">Confirmă parola<input className="input w-full" name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /></label>
            </>}
            <button className="btn btn-primary mt-1 w-full" type="submit" disabled={pending || (mode === "reset" && !token)}>
              {pending && <span className="loading loading-spinner loading-xs" aria-hidden="true" />}
              {pending ? "Se procesează…" : labels[mode].button}
            </button>
          </form>
          <nav className="mt-7 flex flex-col items-center gap-3 border-t border-base-300 pt-6 text-center text-sm" aria-label="Cont">
            {mode !== "login" && <Link className="link link-hover font-medium text-primary" href="/login">Înapoi la autentificare</Link>}
            {mode === "login" && <Link className="link link-hover font-medium text-primary" href="/signup">Creează un cont</Link>}
            {(mode === "login" || mode === "reset") && <Link className="link link-hover text-base-content/70" href="/forgot-password">Ai uitat parola?</Link>}
            {(mode === "login" || mode === "signup") && <Link className="link link-hover text-xs text-base-content/60" href="/verify-email">Retrimite confirmarea emailului</Link>}
          </nav>
        </div>
      </section>
    </div>
  );
}
