import type { StoredCall } from "./repository";

export const callStatusLabel: Record<StoredCall["status"], string> = {
  ringing: "Sună", active: "În desfășurare", completed: "Încheiat", failed: "Eroare", missed: "Nepreluat", transferred: "Transferat",
};
export function formatCallTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("ro-RO", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(date);
}
