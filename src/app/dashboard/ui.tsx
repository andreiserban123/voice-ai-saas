import type { StoredCall } from "@/modules/calls/repository";
import { callStatusLabel } from "@/modules/calls/presentation";

type IconName = "phone" | "calendar" | "arrow" | "clock" | "sparkles" | "building" | "message" | "check";

const paths: Record<IconName, React.ReactNode> = {
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.91.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sparkles: <><path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-5h6v5M8 7h1M15 7h1M8 11h1M15 11h1" /></>,
  message: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />,
  check: <path d="m5 12 4 4L19 6" />,
};

export function DashboardIcon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const statusClasses: Record<StoredCall["status"], string> = {
  active: "badge-success badge-soft", ringing: "badge-info badge-soft", completed: "badge-ghost",
  failed: "badge-error badge-soft", missed: "badge-warning badge-soft", transferred: "badge-primary badge-soft",
};

export function CallStatusBadge({ status }: { status: StoredCall["status"] }) {
  return <span className={`badge badge-sm whitespace-nowrap ${statusClasses[status]}`}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
    {callStatusLabel[status]}
  </span>;
}
