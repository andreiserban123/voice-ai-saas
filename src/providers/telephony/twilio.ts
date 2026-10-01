import { createHmac, timingSafeEqual } from "node:crypto";
import twilio from "twilio";
import { z } from "zod";
import type { VoiceConfig } from "@/runtime/config";

export class WebhookError extends Error {
  constructor(public readonly status: number, message = "Invalid webhook") { super(message); }
}

export const twilioCallSchema = z.object({
  AccountSid: z.string().regex(/^AC[0-9a-fA-F]{32}$/),
  CallSid: z.string().regex(/^CA[0-9a-fA-F]{32}$/),
  To: z.string().optional(),
  From: z.string().optional(),
  CallStatus: z.string().optional(),
  CallDuration: z.coerce.number().int().min(0).max(86400).optional(),
  DialCallStatus: z.string().optional(),
  DialCallDuration: z.coerce.number().int().min(0).max(86400).optional(),
});

export class TwilioSipAdapter {
  private client: ReturnType<typeof twilio>;
  constructor(private config: VoiceConfig) {
    this.client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, { timeout: 10_000, autoRetry: false });
  }

  verify(path: string, headers: Headers, rawBody: string) {
    if (!headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new WebhookError(415);
    const entries = new URLSearchParams(rawBody);
    if ([...entries.keys()].some((key) => entries.getAll(key).length !== 1)) throw new WebhookError(400);
    const parameters = Object.fromEntries(entries);
    // Use configured external origin, never a caller-supplied Host/Forwarded header.
    const url = new URL(path, this.config.VOICE_PUBLIC_URL).toString();
    if (!twilio.validateRequest(this.config.TWILIO_AUTH_TOKEN, headers.get("x-twilio-signature") ?? "", url, parameters)) {
      throw new WebhookError(403);
    }
    const result = twilioCallSchema.safeParse(parameters);
    if (!result.success) throw new WebhookError(400);
    if (result.data.AccountSid !== this.config.TWILIO_ACCOUNT_SID) throw new WebhookError(403);
    return result.data;
  }

  dial(callId: string, startedAt: Date) {
    const response = new twilio.twiml.VoiceResponse();
    const dial = response.dial({
      answerOnBridge: true, timeout: 30, timeLimit: this.config.VOICE_MAX_SECONDS,
      action: new URL("/api/telephony/twilio/dial-ended", this.config.VOICE_PUBLIC_URL).toString(), method: "POST",
    });
    const token = routingToken(this.config.AUTH_SECRET, callId, startedAt);
    dial.sip(`sip:${this.config.OPENAI_PROJECT_ID}@sip.api.openai.com;transport=tls?x-pam-call=${callId}&x-pam-token=${token}`);
    return response.toString();
  }

  async hangUp(callSid: string) { await this.client.calls(callSid).update({ status: "completed" }); }
}

export function routingToken(secret: string, callId: string, startedAt: Date) {
  return createHmac("sha256", secret).update(`pam-sip-v1:${callId}:${startedAt.toISOString()}`).digest("base64url");
}

export function verifyRoutingToken(secret: string, callId: string, startedAt: Date, token: string, now = Date.now()) {
  if (now < startedAt.getTime() - 30_000 || now - startedAt.getTime() > 300_000) return false;
  const expected = Buffer.from(routingToken(secret, callId, startedAt));
  const received = Buffer.from(token);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function hangupXml() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>"; }
