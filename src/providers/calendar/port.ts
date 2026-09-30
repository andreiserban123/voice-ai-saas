import type { TenantContext } from "@/lib/validation";

export type TimeInterval = { startsAt: Date; endsAt: Date };
export type CalendarScope = { tenant: TenantContext; connectionId: string };

export interface CalendarProvider {
  readonly name: string;
  listBusyIntervals(input: CalendarScope & TimeInterval): Promise<TimeInterval[]>;
  /** Must return the same event on retries, including after an ambiguous timeout. */
  createEvent(input: CalendarScope & TimeInterval & {
    idempotencyKey: string;
    title: string;
    description: string;
    timezone: string;
  }): Promise<{ externalEventId: string }>;
  findEvent(input: CalendarScope & { idempotencyKey: string }): Promise<{ externalEventId: string } | null>;
}
