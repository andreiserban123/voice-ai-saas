import "server-only";
import { z } from "zod";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url().refine((url) => /^postgres(ql)?:\/\//.test(url), "Expected a PostgreSQL connection URL"),
});

export function getDatabaseEnv() {
  const result = databaseEnvSchema.safeParse({ DATABASE_URL: process.env.DATABASE_URL });
  if (!result.success) {
    // Do not include the connection string or credentials in errors.
    throw new Error("Set DATABASE_URL to a valid PostgreSQL connection URL in .env.local.");
  }
  return result.data;
}

const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.url().refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  }),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.email(),
});

export function getAuthEnv() {
  const result = authEnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error("Configure AUTH_SECRET (at least 32 characters), AUTH_URL and SMTP settings; see .env.example.");
  }
  if (Boolean(result.data.SMTP_USER) !== Boolean(result.data.SMTP_PASSWORD)) {
    throw new Error("Set both SMTP_USER and SMTP_PASSWORD, or neither for local mail.");
  }
  return result.data;
}
