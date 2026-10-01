import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/db/client";
import { companies, companyMemberships } from "@/db/schema";
import type { Auth } from "./config";

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403 | 404) {
    super(status === 401 ? "Authentication required" : status === 403 ? "Access denied" : "Company not found");
  }
}

export async function requireSession(auth: Auth, headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new AccessError(401);
  if (!session.user.emailVerified) throw new AccessError(403);
  return session;
}

export async function listUserCompanies(db: ReturnType<typeof getDb>, userId: string) {
  return db.select({ id: companies.id, name: companies.name, role: companyMemberships.role })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(eq(companyMemberships.userId, userId))
    .orderBy(companyMemberships.createdAt, companies.id);
}

export async function requireCompanyAccess(
  auth: Auth, db: ReturnType<typeof getDb>, headers: Headers, companyId: string,
  requiredRole?: "owner",
) {
  const session = await requireSession(auth, headers);
  if (!z.uuid().safeParse(companyId).success) throw new AccessError(404);
  const [membership] = await db.select({ company: companies, role: companyMemberships.role })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(and(eq(companyMemberships.userId, session.user.id), eq(companyMemberships.companyId, companyId)))
    .limit(1);
  // The same response for unknown and inaccessible IDs avoids disclosing tenants.
  if (!membership) throw new AccessError(404);
  if (requiredRole && membership.role !== requiredRole) throw new AccessError(403);
  return { user: session.user, ...membership, tenant: { companyId: membership.company.id } };
}
