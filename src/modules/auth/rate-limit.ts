import "server-only";
import { eq, sql } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { authRateLimits } from "@/db/schema";

// Keep the predicate on the actual UPDATE, so PostgreSQL rechecks it after
// concurrent writers release their row lock. A subquery of IDs is insufficient.
// See https://better-auth.com/docs/concepts/rate-limit#custom-storage.
export function databaseRateLimit(db: ReturnType<typeof getDb>) {
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const now = Date.now();
      const cutoff = now - rule.window * 1000;
      const [consumed] = await db.insert(authRateLimits)
        .values({ key, count: 1, lastRequest: now })
        .onConflictDoUpdate({
          target: authRateLimits.key,
          set: {
            count: sql`case when ${authRateLimits.lastRequest} <= ${cutoff}
              then 1 else ${authRateLimits.count} + 1 end`,
            lastRequest: sql`greatest(${authRateLimits.lastRequest}, ${now})`,
          },
          setWhere: sql`${authRateLimits.lastRequest} <= ${cutoff} or ${authRateLimits.count} < ${rule.max}`,
        })
        .returning({ key: authRateLimits.key });
      if (consumed) return { allowed: true, retryAfter: null };

      const [current] = await db.select({ lastRequest: authRateLimits.lastRequest })
        .from(authRateLimits).where(eq(authRateLimits.key, key));
      return {
        allowed: false,
        retryAfter: current
          ? Math.max(1, Math.ceil((current.lastRequest + rule.window * 1000 - Date.now()) / 1000))
          : rule.window,
      };
    },
  };
}
