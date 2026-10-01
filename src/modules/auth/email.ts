import "server-only";
import nodemailer from "nodemailer";
import { getAuthEnv } from "@/lib/env";
import type { AuthEmail } from "./config";

let transport: ReturnType<typeof nodemailer.createTransport> | undefined;

export async function sendAuthEmail(message: AuthEmail) {
  const env = getAuthEnv();
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE === "true",
    // Require STARTTLS for remote SMTP when implicit TLS isn't selected.
    requireTLS: !["localhost", "127.0.0.1", "::1"].includes(env.SMTP_HOST) && env.SMTP_SECURE !== "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ ...message, from: { name: "Pam.ai", address: env.SMTP_FROM } });
}
