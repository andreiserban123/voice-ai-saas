import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./server";
import { AccessError, requireSession } from "./access";

export async function requirePageSession() {
  try {
    return await requireSession(getAuth(), await headers());
  } catch (error) {
    if (error instanceof AccessError) redirect("/login");
    throw error;
  }
}
