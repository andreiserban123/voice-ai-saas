import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { hash, verify } from "@node-rs/argon2";
import type { getDb } from "@/db/client";
import { users, authSessions, authAccounts, authVerifications, authRateLimits } from "@/db/schema";
import { databaseRateLimit } from "./rate-limit";

export type AuthEmail = { to: string; subject: string; text: string };

export function createAuth(db: ReturnType<typeof getDb>, options: {
  secret: string;
  baseURL: string;
  sendEmail: (message: AuthEmail) => Promise<void>;
}) {
  return betterAuth({
    appName: "Recepție AI",
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [new URL(options.baseURL).origin],
    database: drizzleAdapter(db, {
      provider: "pg",
      transaction: true,
      schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications, rateLimit: authRateLimits },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 15,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      password: {
        // 2 = Argon2id; the package's ambient const enum cannot be used with isolatedModules.
        hash: (password) => hash(password, { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 }),
        verify: ({ hash: encoded, password }) => verify(encoded, password),
      },
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => options.sendEmail({
        to: user.email,
        subject: "Resetează parola — Recepție AI",
        text: `Pentru a alege o parolă nouă, deschide acest link în următoarele 30 de minute:\n${url}\n\nDacă nu ai cerut resetarea, ignoră acest mesaj.`,
      }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => options.sendEmail({
        to: user.email,
        subject: "Confirmă adresa de email — Recepție AI",
        text: `Confirmă adresa ta de email în următoarea oră:\n${url}\n\nDacă nu ai creat acest cont, ignoră acest mesaj.`,
      }),
    },
    verification: { storeIdentifier: "hashed" },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      // Always consult PostgreSQL so logout/revocation takes effect immediately.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customStorage: databaseRateLimit(db),
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: new URL(options.baseURL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      // Production ingress must overwrite this header and prevent direct origin access.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
