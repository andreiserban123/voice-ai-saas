import type { TenantContext } from "@/lib/validation";

export type VoiceEvent =
  | { type: "transcript"; itemId: string; speaker: "caller" | "agent"; text: string; offsetMs: number }
  | { type: "tool-call"; invocationId: string; name: string; arguments: unknown }
  | { type: "ended"; reason: string }
  | { type: "error"; code: string; message: string };

export interface VoiceSession {
  readonly id: string;
  readonly events: AsyncIterable<VoiceEvent>;
  submitToolResult(invocationId: string, result: unknown): Promise<void>;
  close(): Promise<void>;
}

/** Adapter-owned connection token can represent SIP or a media bridge. */
export interface VoiceProvider {
  readonly name: string;
  startSession(input: {
    tenant: TenantContext;
    callId: string;
    connectionToken: string;
    instructions: string;
    model: string;
    voice: string;
    tools: ReadonlyArray<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }): Promise<VoiceSession>;
}
