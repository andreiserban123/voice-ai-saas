export type TelephonyEvent = {
  eventId: string;
  providerAccountId: string;
  providerCallId: string;
  occurredAt: Date;
} & (
  | { type: "incoming"; from: string | null; to: string; connectionToken: string }
  | { type: "answered" }
  | { type: "ended"; reason: string; durationSeconds: number }
  | { type: "transfer-completed" }
  | { type: "transfer-failed"; reason: string }
);

export interface TelephonyProvider {
  readonly name: string;
  /** Verify signature and replay window against raw bytes before normalizing. Throw on failure. */
  verifyAndParseWebhook(input: {
    url: string;
    headers: Headers;
    rawBody: Uint8Array;
  }): Promise<TelephonyEvent[]>;
  /** Requested is asynchronous; a later event determines the final outcome. */
  transfer(input: { providerAccountId: string; providerCallId: string; destination: string }): Promise<{ status: "requested" | "failed" }>;
  hangUp(input: { providerAccountId: string; providerCallId: string }): Promise<void>;
}
