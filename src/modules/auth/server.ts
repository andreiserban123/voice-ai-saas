import "server-only";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { getAuthEnv } from "@/lib/env";
import { createAuth, type Auth } from "./config";
import { sendAuthEmail } from "./email";

let auth: Auth | undefined;

export function getAuth() {
  if (!auth) {
    const env = getAuthEnv();
    auth = createAuth(getDb(), {
      secret: env.AUTH_SECRET,
      baseURL: env.AUTH_URL,
      sendEmail: async (message) => {
        // Run after the HTTP response to avoid account-dependent SMTP timing.
        after(async () => {
          try { await sendAuthEmail(message); }
          catch { console.error("Authentication email delivery failed. Check SMTP availability."); }
        });
      },
    });
  }
  return auth;
}
