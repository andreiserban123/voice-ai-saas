import OpenAI from "openai";
import WebSocket from "ws";
import { z } from "zod";
import type { VoiceEvent, VoiceProvider, VoiceSession } from "./port";
import { WebhookError } from "@/providers/telephony/twilio";
import type { VoiceConfig } from "@/runtime/config";

const incomingSchema = z.object({
  id: z.string().min(1).max(200), type: z.literal("realtime.call.incoming"),
  data: z.object({ call_id: z.string().min(1).max(200), sip_headers: z.array(z.object({ name: z.string(), value: z.string() })).max(100) }),
});

class EventQueue implements AsyncIterable<VoiceEvent> {
  private values: VoiceEvent[] = [];
  private wake?: () => void;
  private ended = false;
  push(value: VoiceEvent) {
    if (this.ended) return;
    if (this.values.length >= 256) {
      this.values = [{ type: "error", code: "queue_overflow", message: "Voice event queue overflow" }];
      this.end(); return;
    }
    this.values.push(value); this.wake?.();
  }
  end() { this.ended = true; this.wake?.(); }
  async *[Symbol.asyncIterator]() {
    while (!this.ended || this.values.length) {
      const value = this.values.shift();
      if (value) yield value;
      else await new Promise<void>((resolve) => { this.wake = resolve; });
    }
  }
}

const transcriptSchema = z.object({ item_id: z.string(), transcript: z.string() });
const doneSchema = z.object({ response: z.object({ status: z.string(), output: z.array(z.object({
  type: z.string(), call_id: z.string().optional(), name: z.string().optional(), arguments: z.string().optional(),
})) }) });

export class OpenAISipVoice implements VoiceProvider {
  readonly name = "openai";
  private client: OpenAI;
  constructor(private config: VoiceConfig, private dependencies: {
    client?: OpenAI; connect?: (url: string, options: WebSocket.ClientOptions) => WebSocket;
  } = {}) {
    this.client = dependencies.client ?? new OpenAI({ apiKey: config.OPENAI_API_KEY, webhookSecret: config.OPENAI_WEBHOOK_SECRET, timeout: 10_000, maxRetries: 0 });
  }

  async verifyIncoming(rawBody: string, headers: Headers) {
    let event;
    try { event = await this.client.webhooks.unwrap(rawBody, headers); }
    catch { throw new WebhookError(403); }
    if (event.type !== "realtime.call.incoming") return null;
    const result = incomingSchema.safeParse(event);
    if (!result.success) throw new WebhookError(400);
    return result.data;
  }

  async reject(callId: string) { await this.client.realtime.calls.reject(callId, { status_code: 403 }); }
  async hangUp(callId: string) { await this.client.realtime.calls.hangup(callId); }

  async startSession(input: Parameters<VoiceProvider["startSession"]>[0]): Promise<VoiceSession> {
    await this.client.realtime.calls.accept(input.connectionToken, {
      type: "realtime", model: input.model, instructions: input.instructions,
      audio: { input: { transcription: { model: "gpt-4o-mini-transcribe", language: "ro" },
        turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true } },
        output: { voice: input.voice } },
      tools: input.tools.map((tool) => ({ type: "function" as const, ...tool })),
      tool_choice: "auto", max_output_tokens: 512,
    });
    return this.attach(input.connectionToken, true, input.startedAt);
  }

  async attach(callId: string, greet = false, startedAt = new Date()): Promise<VoiceSession> {
    const queue = new EventQueue();
    const pendingTools = new Set<string>();
    const seenTools = new Set<string>();
    const itemOffsets = new Map<string, number>();
    const ws = (this.dependencies.connect ?? ((url, options) => new WebSocket(url, options)))(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${this.config.OPENAI_API_KEY}` }, handshakeTimeout: 10_000, maxPayload: 1024 * 1024,
    });
    const send = (event: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) throw new Error("Voice control connection closed");
      ws.send(JSON.stringify(event));
    };
    ws.on("message", (bytes) => {
      try {
        const event = JSON.parse(bytes.toString());
        if (event.type === "conversation.item.added" && typeof event.item?.id === "string") {
          itemOffsets.set(event.item.id, Date.now() - startedAt.getTime());
        } else if (event.type === "conversation.item.input_audio_transcription.completed" || event.type === "response.output_audio_transcript.done") {
          const parsed = transcriptSchema.parse(event);
          queue.push({ type: "transcript", itemId: parsed.item_id,
            speaker: event.type.startsWith("conversation.") ? "caller" : "agent",
            text: parsed.transcript, offsetMs: itemOffsets.get(parsed.item_id) ?? Date.now() - startedAt.getTime() });
        } else if (event.type === "response.done") {
          const { response } = doneSchema.parse(event);
          if (response.status === "failed") queue.push({ type: "error", code: "response_failed", message: "Voice response failed" });
          // Wait for response.done so response.create cannot race the model's tool response.
          const tools = response.output.filter((item) => item.type === "function_call" && item.call_id && item.name && item.arguments);
          for (const tool of tools) if (!seenTools.has(tool.call_id!)) pendingTools.add(tool.call_id!);
          for (const tool of tools) {
            if (seenTools.has(tool.call_id!)) continue;
            seenTools.add(tool.call_id!);
            let args: unknown;
            try { args = JSON.parse(tool.arguments!); } catch { args = null; }
            queue.push({ type: "tool-call", invocationId: tool.call_id!, name: tool.name!, arguments: args });
          }
        } else if (event.type === "error") {
          queue.push({ type: "error", code: "provider_error", message: "Voice provider error" });
        }
      } catch {
        queue.push({ type: "error", code: "invalid_event", message: "Invalid voice provider event" });
        ws.close(1011); queue.end();
      }
    });
    ws.on("error", () => { queue.push({ type: "error", code: "connection_error", message: "Voice control connection failed" }); queue.end(); });
    ws.on("close", (code) => { queue.push({ type: "ended", reason: code === 1000 ? "remote_hangup" : "connection_lost" }); queue.end(); });
    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
        ws.once("close", () => reject(new Error("Voice connection closed before opening")));
      });
      if (greet) send({ type: "response.create" });
    } catch { ws.terminate(); throw new Error("Cannot attach voice control connection"); }
    return { id: callId, events: queue,
      submitToolResult: async (invocationId, result) => {
        // Persist queued intake after hangup, but do not send on a closed socket.
        if (ws.readyState !== WebSocket.OPEN) {
          pendingTools.delete(invocationId);
          return;
        }
        send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: invocationId, output: JSON.stringify(result) } });
        pendingTools.delete(invocationId);
        if (!pendingTools.size) send({ type: "response.create" });
      },
      close: async () => { queue.end(); ws.close(1000); setTimeout(() => ws.terminate(), 1000).unref(); },
    };
  }
}
