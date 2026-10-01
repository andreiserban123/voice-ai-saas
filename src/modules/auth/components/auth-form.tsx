"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "../client";

type Mode = "login" | "signup" | "forgot" | "reset" | "verify";
const labels: Record<Mode, { title: string; button: string }> = {
  login: { title: "Bine ai revenit", button: "Intră în cont" },
  signup: { title: "Creează un cont", button: "Creează contul" },
  forgot: { title: "Ai uitat parola?", button: "Trimite linkul de resetare" },
  reset: { title: "Alege o parolă nouă", button: "Salvează parola" },
  verify: { title: "Confirmă adresa de email", button: "Retrimite emailul de confirmare" },
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
    <section className="panel auth-panel">
      <h1>{labels[mode].title}</h1>
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={submit} className="auth-form">
        {mode === "signup" && <label>Nume<input name="name" autoComplete="name" required maxLength={200} /></label>}
        {mode !== "reset" && <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
        {needsPassword && <label>{mode === "reset" ? "Parola nouă" : "Parolă"}
          <input name="password" type="password" autoComplete={newPassword ? "new-password" : "current-password"}
            required minLength={newPassword ? 15 : undefined} maxLength={128} aria-describedby={newPassword ? "password-help" : undefined} />
        </label>}
        {newPassword && <>
          <p id="password-help" className="field-help">Folosește între 15 și 128 de caractere. Poți folosi o frază lungă.</p>
          <label>Confirmă parola<input name="confirmation" type="password" autoComplete="new-password" required minLength={15} maxLength={128} /></label>
        </>}
        <button type="submit" disabled={pending || (mode === "reset" && !token)}>{pending ? "Se procesează…" : labels[mode].button}</button>
      </form>
      <nav className="auth-links" aria-label="Cont">
        {mode !== "login" && <Link href="/login">Înapoi la autentificare</Link>}
        {mode === "login" && <Link href="/signup">Creează un cont</Link>}
        {(mode === "login" || mode === "reset") && <Link href="/forgot-password">Ai uitat parola?</Link>}
        {(mode === "login" || mode === "signup") && <Link href="/verify-email">Retrimite confirmarea emailului</Link>}
      </nav>
    </section>
  );
}
