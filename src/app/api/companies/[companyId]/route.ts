import { getDb } from "@/db/client";
import { getAuth } from "@/modules/auth/server";
import { AccessError, requireCompanyAccess } from "@/modules/auth/access";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const { company, role } = await requireCompanyAccess(getAuth(), getDb(), request.headers, companyId);
    return Response.json({ company, role }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
