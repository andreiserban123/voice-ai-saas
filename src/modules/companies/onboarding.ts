import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/db/client";
import { companies, companyMemberships, users } from "@/db/schema";
import type { Auth } from "@/modules/auth/config";
import { requireSession } from "@/modules/auth/access";

export const onboardingSchema = z.object({ name: z.string().trim().min(1).max(200) });

export async function onboardCompany(auth: Auth, db: ReturnType<typeof getDb>, headers: Headers, input: unknown) {
  const session = await requireSession(auth, headers);
  const { name } = onboardingSchema.parse(input);
  return db.transaction(async (tx) => {
    // Serialize repeated submissions from the same owner, including multiple tabs.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, session.user.id)).for("update");
    const [existing] = await tx.select().from(companyMemberships).where(eq(companyMemberships.userId, session.user.id)).limit(1);
    if (existing) return existing.companyId;
    const companyId = randomUUID();
    await tx.insert(companies).values({ id: companyId, name, slug: `business-${companyId}` });
    // User ID and role always come from trusted server state, never the form.
    await tx.insert(companyMemberships).values({ companyId, userId: session.user.id, role: "owner" });
    return companyId;
  });
}
