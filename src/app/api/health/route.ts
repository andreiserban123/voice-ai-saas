export function GET() {
  // Liveness only. No database or external-provider readiness is implied.
  return Response.json({ status: "ok", service: "voice-ai-saas" });
}
