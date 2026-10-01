import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { requirePageSession } from "@/modules/auth/page-session";
import { AccessError, requireCompanyAccess } from "@/modules/auth/access";
import { getCallDetails } from "@/modules/calls/repository";
import { formatCallTime } from "@/modules/calls/presentation";
import { CallStatusBadge, DashboardIcon } from "../../ui";

export default async function CallPage({ params, searchParams }: {
  params: Promise<{ callId: string }>; searchParams: Promise<{ company?: string }>;
}) {
  await requirePageSession();
  const { callId } = await params;
  const { company } = await searchParams;
  if (!company || !z.uuid().safeParse(callId).success) notFound();
  const access = await requireCompanyAccess(getAuth(), getDb(), await headers(), company).catch((error: unknown) => {
    if (error instanceof AccessError && [403, 404].includes(error.status)) notFound();
    throw error;
  });
  const detail = await getCallDetails(getDb(), access.tenant, callId);
  if (!detail) notFound();
  const { call, transcript } = detail;
  return <div className="space-y-7 sm:space-y-9">
    <Link className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-base-content/65 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href={`/dashboard?company=${company}`}><DashboardIcon name="arrow" className="size-4 rotate-180" /> Înapoi la apeluri</Link>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary"><DashboardIcon name="phone" className="size-6" /></div>
        <div><p className="mb-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase">Detaliile conversației</p><h1 className="text-3xl font-semibold tracking-tight text-base-content sm:text-4xl">{call.callerName ?? "Apel telefonic"}</h1></div>
      </div>
      <CallStatusBadge status={call.status} />
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr] lg:items-start">
      <div className="space-y-6">
        <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="request-title">
          <div className="flex items-center gap-3 border-b border-base-300 px-6 py-5"><DashboardIcon name="sparkles" className="size-5 text-primary" /><h2 id="request-title" className="text-lg font-semibold">Solicitarea clientului</h2></div>
          <dl className="space-y-6 p-6">
            <div><dt className="mb-2 text-xs font-semibold tracking-wider text-base-content/55 uppercase">Motivul apelului</dt><dd className="text-base leading-relaxed text-base-content">{call.issue ?? "Nicio solicitare confirmată încă."}</dd></div>
            <div className="rounded-2xl border border-base-300 bg-base-200/40 p-4 sm:p-5"><dt className="mb-2 flex items-center gap-2 text-sm font-semibold"><DashboardIcon name="message" className="size-4 text-primary" /> Rezumat</dt><dd className="text-sm leading-relaxed text-base-content/70">{call.summary ?? "Disponibil după încheierea apelului."}</dd></div>
          </dl>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="transcript-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-6 py-5"><div className="flex items-center gap-3"><DashboardIcon name="message" className="size-5 text-primary" /><h2 id="transcript-title" className="text-lg font-semibold">Transcriere</h2></div><span className="badge badge-ghost badge-sm">Conversația cu Pam</span></div>
          {!transcript.length && <div className="flex flex-col items-center px-6 py-12 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-base-200 text-base-content/50"><DashboardIcon name="message" /></div><p className="max-w-md text-sm leading-relaxed text-base-content/60">Nu există încă fragmente transcrise. Reîncarcă pagina după încheierea apelului.</p></div>}
          {transcript.length > 0 && <ol className="space-y-4 px-4 py-6 sm:px-6">{transcript.map((item) => <li key={item.id} className={`chat ${item.speaker === "agent" ? "chat-start" : "chat-end"}`}>
            <div className="chat-header mb-1.5 text-xs font-semibold text-base-content/60">{item.speaker === "agent" ? "Pam" : "Apelant"}</div>
            <p className={`chat-bubble max-w-[90%] text-sm leading-relaxed break-words sm:max-w-[85%] ${item.speaker === "agent" ? "bg-primary/10 text-base-content" : "bg-base-200 text-base-content"}`}>{item.text}</p>
          </li>)}</ol>}
          <div className="border-t border-base-300 px-6 py-4"><p className="text-xs leading-relaxed text-base-content/50">Transcrierea automată poate conține erori. Rezumatul folosește solicitarea confirmată.</p></div>
        </section>
      </div>

      <aside className="card border border-base-300 bg-base-100 shadow-sm" aria-labelledby="call-info-title">
        <div className="border-b border-base-300 px-6 py-5"><h2 id="call-info-title" className="text-lg font-semibold">Informații apel</h2></div>
        <dl className="divide-y divide-base-300 px-6">
          <div className="py-5"><dt className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content/55"><DashboardIcon name="phone" className="size-4" /> Telefon</dt><dd className="text-sm font-semibold break-words">{call.callerPhone ?? "Necunoscut"}</dd></div>
          <div className="py-5"><dt className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content/55"><DashboardIcon name="calendar" className="size-4" /> Data și ora</dt><dd className="text-sm font-semibold">{formatCallTime(call.startedAt, access.company.timezone)}</dd><dd className="mt-1 text-xs text-base-content/50">{access.company.timezone}</dd></div>
          <div className="py-5"><dt className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content/55"><DashboardIcon name="clock" className="size-4" /> Durată</dt><dd className="text-sm font-semibold">{call.durationSeconds !== null ? `${call.durationSeconds} secunde` : "Încă indisponibilă"}</dd></div>
          <div className="py-5"><dt className="mb-2 flex items-center gap-2 text-xs font-medium text-base-content/55"><DashboardIcon name="building" className="size-4" /> Afacere</dt><dd className="text-sm font-semibold">{access.company.name}</dd></div>
        </dl>
      </aside>
    </div>
  </div>;
}
