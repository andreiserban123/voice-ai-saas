import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & { postgresPool?: Pool };

export function getDb() {
  // Lazy initialization lets the unconnected app shell build without secrets.
  const pool = globalForDatabase.postgresPool ?? new Pool({
    connectionString: getDatabaseEnv().DATABASE_URL,
    max: 10,
  });
  globalForDatabase.postgresPool = pool;
  return drizzle(pool, { schema });
}
