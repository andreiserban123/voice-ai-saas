"use client";

import { useActionState } from "react";
import { saveSettings } from "./actions";

type Settings = { greeting: string; instructions: string; opensAt: string; closesAt: string; weekdays: number[];
  serviceName: string; durationMinutes: number; faqs: { question: string; answer: string }[]; enabled: boolean };

export function ReceptionForm({ companyId, initial, canActivate }: { companyId: string; initial: Settings; canActivate: boolean }) {
  const [state, action, pending] = useActionState(saveSettings.bind(null, companyId), {});
  const days = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
  // React resets uncontrolled fields when an action returns, including validation errors.
  // This edit form keeps the entered values so the owner can correct and resubmit them.
  return <form action={action} onReset={(event) => event.preventDefault()} className="grid gap-6" aria-busy={pending}>
    <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="voice-settings-title">
      <div className="card-body gap-5 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">01</span>
          <div><h2 id="voice-settings-title" className="text-lg font-semibold tracking-tight">Vocea afacerii tale</h2><p className="mt-1 text-sm text-base-content/60">Spune-i lui Pam cum să întâmpine clienții.</p></div>
        </div>
        <label className="grid gap-2 text-sm font-medium">Salutul lui Pam<input className="input w-full" name="greeting" defaultValue={initial.greeting} required maxLength={1000} /></label>
        <label className="grid gap-2 text-sm font-medium">Instrucțiuni pentru recepție<textarea className="textarea min-h-28 w-full resize-y" name="instructions" defaultValue={initial.instructions} maxLength={4000} rows={3} /></label>
      </div>
    </section>

    <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="business-settings-title">
      <div className="card-body gap-5 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">02</span>
          <div><h2 id="business-settings-title" className="text-lg font-semibold tracking-tight">Program și servicii</h2><p className="mt-1 text-sm text-base-content/60">Informații clare pentru fiecare conversație.</p></div>
        </div>
        <fieldset className="grid gap-5">
          <legend className="mb-3 text-sm font-medium">Zile și ore de lucru · ora României</legend>
          <div className="flex flex-wrap gap-2">{days.map((day, index) => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-base-300 px-3 py-2.5 text-sm" key={day}>
            <input className="checkbox checkbox-primary checkbox-sm" type="checkbox" name="weekdays" value={index + 1} defaultChecked={initial.weekdays.includes(index + 1)} />{day}
          </label>)}</div>
          <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Deschidere<input className="input w-full" type="time" name="opensAt" defaultValue={initial.opensAt} required /></label>
            <label className="grid gap-2 text-sm font-medium">Închidere<input className="input w-full" type="time" name="closesAt" defaultValue={initial.closesAt} required /></label></div>
        </fieldset>
        <div className="grid gap-5 border-t border-base-300 pt-5 sm:grid-cols-[2fr_1fr]"><label className="grid gap-2 text-sm font-medium">Serviciu oferit<input className="input w-full" name="serviceName" defaultValue={initial.serviceName} required maxLength={200} /></label>
          <label className="grid gap-2 text-sm font-medium">Durată în minute<input className="input w-full" type="number" name="durationMinutes" defaultValue={initial.durationMinutes} min={5} max={480} required /></label></div>
        <p className="text-xs leading-relaxed text-base-content/60">Pam poate explica serviciul și prelua o solicitare. Programările și transferul către o persoană urmează.</p>
      </div>
    </section>

    <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="faq-settings-title">
      <div className="card-body gap-5 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">03</span>
          <div><h2 id="faq-settings-title" className="text-lg font-semibold tracking-tight">Răspunsuri pregătite</h2><p className="mt-1 text-sm text-base-content/60">Adaugă întrebările pe care le primești cel mai des.</p></div>
        </div>
        {[0, 1, 2].map((index) => <fieldset className={`grid gap-4 ${index > 0 ? "border-t border-base-300 pt-5" : ""}`} key={index}>
          <legend className={`text-xs font-semibold text-base-content/55 ${index > 0 ? "pt-5" : ""}`}>Întrebare frecventă {index + 1}</legend>
          <label className="grid gap-2 text-sm font-medium">Întrebare<input className="input w-full" name={`question${index}`} defaultValue={initial.faqs[index]?.question ?? ""} required={index === 0} maxLength={300} placeholder={index === 0 ? "De exemplu, unde vă găsesc?" : "Adaugă o întrebare (opțional)"} /></label>
          <label className="grid gap-2 text-sm font-medium">Răspuns<textarea className="textarea min-h-24 w-full resize-y" name={`answer${index}`} defaultValue={initial.faqs[index]?.answer ?? ""} required={index === 0} maxLength={2000} rows={2} /></label>
        </fieldset>)}
      </div>
    </section>

    <div className="card border border-primary/20 bg-primary/5">
      <div className="card-body gap-3 p-5 sm:p-7">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold"><input className="checkbox checkbox-primary" type="checkbox" name="enabled" defaultChecked={initial.enabled} disabled={!canActivate} />Activează Pam pentru numărul de test</label>
        {!canActivate && <p className="text-sm leading-relaxed text-base-content/65">Poți salva informațiile acum. Activarea devine disponibilă după configurarea conexiunii telefonice.</p>}
      </div>
    </div>
    {state.error && <p className="alert alert-error text-sm" role="alert">{state.error}</p>}
    {state.saved && <p className="alert alert-success text-sm" role="status">Configurarea a fost salvată.</p>}
    <div className="flex justify-end border-t border-base-300 pt-6">
      <button className="btn btn-primary w-full sm:w-auto" disabled={pending}>
        {pending && <span className="loading loading-spinner loading-xs" aria-hidden="true" />}
        {pending ? "Se salvează…" : "Salvează configurarea"}
      </button>
    </div>
  </form>;
}
