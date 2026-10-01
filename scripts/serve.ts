import { createServer, type IncomingMessage } from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { readVoiceConfig } from "../src/runtime/config";
import { OpenAISipVoice } from "../src/providers/voice/openai";
import { TwilioSipAdapter, WebhookError } from "../src/providers/telephony/twilio";
import { isVoicePath, ReceptionistRuntime } from "../src/modules/receptionist/runtime";

async function rawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 64 * 1024) throw new WebhookError(413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const dev = process.argv.includes("--dev");
  loadEnvConfig(process.cwd(), dev);
  const portIndex = process.argv.indexOf("--port");
  const port = Number(portIndex < 0 ? process.env.PORT ?? 3000 : process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
  const hostname = process.env.HOSTNAME_BIND ?? "127.0.0.1";
  const app = next({ dev, hostname, port, webpack: true });
  let pool: Pool | undefined;
  let guard: PoolClient | undefined;
  let runtime: ReceptionistRuntime | undefined;
  const lifecycle: { server?: ReturnType<typeof createServer> } = {};
  let stopping = false;
  const { config, missing } = readVoiceConfig();
  if (config) {
    if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 });
    guard = await pool.connect();
    const lock = await guard.query("SELECT pg_try_advisory_lock(hashtext('pam-voice-runtime'), hashtext($1)) AS locked", [config.TWILIO_ACCOUNT_SID]);
    if (!lock.rows[0]?.locked) throw new Error("Another voice runtime already owns this Twilio account");
    runtime = new ReceptionistRuntime(drizzle(pool, { schema }), config, new OpenAISipVoice(config), new TwilioSipAdapter(config));
    guard.on("error", () => { console.error("[voice] Runtime lock connection lost"); void shutdown(); });
    await runtime.initialize();
  } else {
    console.info(`[voice] Inactive; configure ${missing.join(", ")}. Dashboard and authentication remain available.`);
  }
  await app.prepare();
  const handle = app.getRequestHandler();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!isVoicePath(url.pathname)) { await handle(request, response); return; }
      let result: Response;
      if (request.method !== "POST") result = new Response(null, { status: 405, headers: { Allow: "POST" } });
      else if (url.search) result = new Response("Unexpected query parameters", { status: 400 });
      else if (!runtime) result = Response.json({ error: "Voice integration is not configured" }, { status: 503 });
      else {
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        result = await runtime.handle(url.pathname, headers, await rawBody(request));
      }
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    } catch (error) {
      const status = error instanceof WebhookError ? error.status : 503;
      if (status === 503) console.error("[voice] Webhook processing failed");
      if (!response.headersSent) response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: status === 503 ? "Voice service unavailable" : "Invalid webhook" }));
    }
  });
  lifecycle.server = server;
  server.on("upgrade", (request, socket, head) => { void app.getUpgradeHandler()(request, socket, head); });
  server.requestTimeout = 20_000;
  server.headersTimeout = 15_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, hostname, resolve); });
  console.info(`Pam.ai ready at http://${hostname}:${port} (${config ? "voice configured" : "voice inactive"})`);
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const force = setTimeout(() => process.exit(1), 25_000);
    force.unref();
    lifecycle.server?.close();
    try {
      await runtime?.stop(); await app.close(); guard?.release(); await pool?.end(); clearTimeout(force); process.exit(0);
    } catch { console.error("[voice] Shutdown failed"); process.exit(1); }
  }
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
}

void main().catch(() => { console.error("Pam.ai could not start. Check database, port and server configuration."); process.exit(1); });
