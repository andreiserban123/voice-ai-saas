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
