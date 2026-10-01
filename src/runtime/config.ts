import { z } from "zod";

const voiceEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_WEBHOOK_SECRET: z.string().min(1),
  OPENAI_PROJECT_ID: z.string().regex(/^proj_[A-Za-z0-9_-]+$/),
  OPENAI_REALTIME_MODEL: z.string().min(1).default("gpt-realtime-2.1"),
  OPENAI_VOICE: z.enum(["marin", "cedar", "coral", "alloy", "sage", "shimmer"]).default("marin"),
  TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-fA-F]{32}$/),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().regex(/^\+[1-9]\d{7,14}$/),
  VOICE_PUBLIC_URL: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password &&
        url.pathname === "/" && !url.search && !url.hash;
    } catch {
      return false;
    }
  }),
  AUTH_SECRET: z.string().min(32),
  VOICE_MAX_CALLS: z.coerce.number().int().min(1).max(20).default(3),
  VOICE_MAX_SECONDS: z.coerce.number().int().min(30).max(3600).default(600),
});

export type VoiceConfig = z.infer<typeof voiceEnvSchema>;

export function readVoiceConfig(env: Record<string, string | undefined> = process.env) {
  const result = voiceEnvSchema.safeParse(env);
  return result.success
    ? { config: result.data, missing: [] as string[] }
    : { config: null, missing: [...new Set(result.error.issues.map((issue) => String(issue.path[0])))] };
}
