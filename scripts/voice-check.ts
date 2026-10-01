import { loadEnvConfig } from "@next/env";
import { readVoiceConfig } from "../src/runtime/config";

loadEnvConfig(process.cwd(), true);
const { config, missing } = readVoiceConfig();
if (!config) {
  console.info("Apelurile live nu sunt încă disponibile. Completează în .env.local:");
  for (const name of missing) console.info(`  ${name}`);
  console.info("Pași: docs/first-call.md. Cheile nu se trimit în chat.");
  process.exitCode = 1;
} else {
  console.info("Configurația serverului este completă. Disponibilitatea conturilor nu a fost verificată prin API.");
  console.info(`Twilio voice POST: ${new URL("/api/telephony/twilio/voice", config.VOICE_PUBLIC_URL)}`);
  console.info(`Twilio status POST: ${new URL("/api/telephony/twilio/status", config.VOICE_PUBLIC_URL)}`);
  console.info(`OpenAI incoming webhook: ${new URL("/api/voice/openai", config.VOICE_PUBLIC_URL)}`);
  console.info(`Număr de test: ${config.TWILIO_PHONE_NUMBER}`);
  console.info("Repornește npm run dev, salvează și activează recepția în dashboard, apoi sună numărul.");
}
