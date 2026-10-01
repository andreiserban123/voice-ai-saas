import assert from "node:assert/strict";
import { randomBytes, randomUUID, randomInt } from "node:crypto";
import test from "node:test";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema";
import { createAuth, type AuthEmail } from "../src/modules/auth/config";
import { AccessError, requireCompanyAccess, requireSession } from "../src/modules/auth/access";
import { onboardCompany } from "../src/modules/companies/onboarding";

loadEnvConfig(process.cwd(), true);

test("database authentication and tenant authorization", async (t) => {
  const databaseURL = new URL(process.env.DATABASE_URL ?? "http://missing");
  assert.ok(["postgres:", "postgresql:"].includes(databaseURL.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(databaseURL.hostname) && databaseURL.pathname === "/voice_ai_saas",
  "auth:test requires the local voice_ai_saas database");
  const pool = new Pool({ connectionString: databaseURL.toString(), max: 5, connectionTimeoutMillis: 5000 });
  try { await pool.query("SELECT 1"); }
  catch (error) { await pool.end(); throw error; }
  const db = drizzle(pool, { schema });
  const origin = "http://localhost:3000";
  const outbox: AuthEmail[] = [];
  const secret = randomBytes(32).toString("base64");
  const auth = createAuth(db, { secret, baseURL: origin, sendEmail: async (message) => { outbox.push(message); } });
  const runId = randomUUID();
  const emails = [`owner-${runId}@example.test`];
  const password = `Garage original password ${runId}`;
  const companyIds: string[] = [];
  const ipPrefix = `198.19.${randomInt(1, 255)}.`;
  let ipCount = 1;
  const ips: string[] = [];
  function nextIp() { const ip = `${ipPrefix}${ipCount++}`; ips.push(ip); return ip; }
  const post = (path: string, body: unknown, cookie = "", ip = nextIp(), requestOrigin = origin) => auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", origin: requestOrigin, cookie, "x-real-ip": ip }, body: JSON.stringify(body),
  }));
  const cookieFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const sessionHeaders = (cookie: string) => new Headers({ cookie });
  const latestLink = (email: string) => {
    const message = outbox.findLast((entry) => entry.to === email);
    assert.ok(message, "Expected authentication email");
    const match = message.text.match(/https?:\/\/\S+/);
    assert.ok(match);
    return new URL(match[0]);
  };
  const expectAccessError = (status: number) => (error: unknown) => error instanceof AccessError && error.status === status;
  let cookie = "";
  let ownerId = "";
  let companyId = "";

  try {
    await t.test("signup enforces password policy and stores Argon2id, not plaintext", async () => {
      assert.equal((await post("/sign-up/email", { name: "Owner", email: emails[0], password: "short" })).status, 400);
      const response = await post("/sign-up/email", { name: "Ștefan", email: emails[0], password, emailVerified: true });
      assert.equal(response.status, 200);
      const user = (await pool.query("SELECT id, email_verified FROM users WHERE email = $1", [emails[0]])).rows[0];
      ownerId = user.id;
      assert.equal(user.email_verified, false, "Client cannot mark its own email verified");
      const stored = (await pool.query("SELECT password FROM auth_accounts WHERE user_id = $1", [ownerId])).rows[0].password;
      assert.match(stored, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
      assert.ok(!stored.includes(password));
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE user_id = $1", [ownerId])).rows[0].count, 0);
      assert.equal((await post("/sign-up/email", { name: "Duplicate", email: emails[0], password })).status, 200);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM users WHERE email = $1", [emails[0]])).rows[0].count, 1);
    });

    await t.test("verification is required, invalid credentials are generic, valid login sets protected cookies", async () => {
      assert.equal((await post("/sign-in/email", { email: emails[0], password })).status, 403);
      const link = latestLink(emails[0]!);
      assert.equal((await auth.handler(new Request(link, { headers: { "x-real-ip": nextIp() } }))).status, 302);
      const wrong = await post("/sign-in/email", { email: emails[0], password: `${password}!` });
      const missing = await post("/sign-in/email", { email: `absent-${runId}@example.test`, password });
      assert.equal(wrong.status, 401);
      assert.deepEqual(await wrong.json(), await missing.json());
      const login = await post("/sign-in/email", { email: emails[0]!.toUpperCase(), password });
      assert.equal(login.status, 200);
      assert.match(login.headers.get("set-cookie") ?? "", /HttpOnly/i);
      assert.match(login.headers.get("set-cookie") ?? "", /SameSite=Lax/i);
      cookie = cookieFrom(login);
      assert.equal((await requireSession(auth, sessionHeaders(cookie))).user.id, ownerId);
      assert.equal((await post("/sign-up/email", { name: "Case duplicate", email: emails[0]!.toUpperCase(), password })).status, 200);
    });

    await t.test("anonymous and forged sessions cannot access company data", async () => {
      await assert.rejects(requireCompanyAccess(auth, db, new Headers(), randomUUID()), expectAccessError(401));
      await assert.rejects(requireSession(auth, sessionHeaders("better-auth.session_token=forged")), expectAccessError(401));
      await assert.rejects(onboardCompany(auth, db, new Headers(), { name: "Unauthorized" }), expectAccessError(401));
    });

    await t.test("concurrent onboarding creates one company and owner membership", async () => {
      const ids = await Promise.all([
        onboardCompany(auth, db, sessionHeaders(cookie), { name: "Atelier Ștefan", userId: randomUUID(), role: "member" }),
        onboardCompany(auth, db, sessionHeaders(cookie), { name: "Duplicate request" }),
      ]);
      assert.equal(ids[0], ids[1]);
      companyId = ids[0]!;
      companyIds.push(companyId);
      const access = await requireCompanyAccess(auth, db, sessionHeaders(cookie), companyId, "owner");
      assert.equal(access.role, "owner");
      assert.equal(access.tenant.companyId, companyId);
      const memberships = await pool.query("SELECT * FROM company_memberships WHERE user_id = $1", [ownerId]);
      assert.equal(memberships.rowCount, 1);
    });

    await t.test("tenant and owner checks reject foreign IDs, role escalation and revoked membership", async () => {
      const foreign = randomUUID();
      companyIds.push(foreign);
      await pool.query("INSERT INTO companies (id, name, slug) VALUES ($1, 'Other garage', $2)", [foreign, `foreign-${runId}`]);
      await assert.rejects(requireCompanyAccess(auth, db, sessionHeaders(cookie), foreign), expectAccessError(404));
      await assert.rejects(requireCompanyAccess(auth, db, sessionHeaders(cookie), "invalid"), expectAccessError(404));
      await pool.query("UPDATE company_memberships SET role = 'member' WHERE company_id = $1 AND user_id = $2", [companyId, ownerId]);
      await assert.rejects(requireCompanyAccess(auth, db, sessionHeaders(cookie), companyId, "owner"), expectAccessError(403));
      await pool.query("DELETE FROM company_memberships WHERE company_id = $1 AND user_id = $2", [companyId, ownerId]);
      await assert.rejects(requireCompanyAccess(auth, db, sessionHeaders(cookie), companyId), expectAccessError(404));
      await pool.query("INSERT INTO company_memberships (company_id, user_id, role) VALUES ($1, $2, 'owner')", [companyId, ownerId]);
    });

    await t.test("cross-origin mutations and external redirects are rejected", async () => {
      assert.equal((await post("/sign-out", {}, cookie, nextIp(), "https://attacker.example")).status, 403);
      assert.equal((await post("/sign-in/email", { email: emails[0], password, callbackURL: "https://attacker.example" })).status, 403);
      assert.equal((await requireSession(auth, sessionHeaders(cookie))).user.id, ownerId);
    });

    await t.test("logout revokes the stored session immediately", async () => {
      assert.equal((await post("/sign-out", {}, cookie)).status, 200);
      await assert.rejects(requireSession(auth, sessionHeaders(cookie)), expectAccessError(401));
      cookie = cookieFrom(await post("/sign-in/email", { email: emails[0], password }));
    });

    await t.test("password reset is non-enumerating, single-use and revokes existing sessions", async () => {
      const missing = await post("/request-password-reset", { email: `absent-${runId}@example.test`, redirectTo: "/reset-password" });
      const existing = await post("/request-password-reset", { email: emails[0], redirectTo: "/reset-password" });
      assert.equal(existing.status, 200);
      assert.deepEqual(await existing.json(), await missing.json());
      const resetLink = latestLink(emails[0]!);
      const redirect = await auth.handler(new Request(resetLink, { headers: { "x-real-ip": nextIp() } }));
      assert.equal(redirect.status, 302);
      const token = new URL(redirect.headers.get("location")!, origin).searchParams.get("token");
      assert.ok(token);
      const newPassword = `${password} changed`;
      const record = (await pool.query("SELECT identifier FROM auth_verifications WHERE value = $1", [ownerId])).rows[0];
      assert.ok(record && !record.identifier.includes(token), "Reset token must be hashed at rest");
      assert.equal((await post("/reset-password", { token, newPassword })).status, 200);
      assert.equal((await post("/reset-password", { token, newPassword })).status, 400);
      await assert.rejects(requireSession(auth, sessionHeaders(cookie)), expectAccessError(401));
      assert.equal((await post("/sign-in/email", { email: emails[0], password })).status, 401);
      const login = await post("/sign-in/email", { email: emails[0], password: newPassword });
      assert.equal(login.status, 200);
      cookie = cookieFrom(login);
    });

    await t.test("expired sessions and expired password-reset tokens are rejected", async () => {
      await pool.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [ownerId]);
      await assert.rejects(requireSession(auth, sessionHeaders(cookie)), expectAccessError(401));
      await post("/request-password-reset", { email: emails[0], redirectTo: "/reset-password" });
      const redirect = await auth.handler(new Request(latestLink(emails[0]!), { headers: { "x-real-ip": nextIp() } }));
      const token = new URL(redirect.headers.get("location")!, origin).searchParams.get("token");
      await pool.query("UPDATE auth_verifications SET expires_at = now() - interval '1 second' WHERE value = $1", [ownerId]);
      assert.equal((await post("/reset-password", { token, newPassword: `${password} expired` })).status, 400);
    });

    await t.test("login throttling persists across auth instances and concurrent requests", async () => {
      const ip = nextIp();
      const request = () => new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST", headers: { "Content-Type": "application/json", origin, "x-real-ip": ip },
        body: JSON.stringify({ email: `absent-${runId}@example.test`, password }),
      });
      const restarted = createAuth(db, { secret, baseURL: origin, sendEmail: async () => {} });
      const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? auth : restarted).handler(request())));
      assert.equal(responses.filter((response) => response.status === 401).length, 5);
      assert.equal(responses.filter((response) => response.status === 429).length, 7);
      assert.equal((await restarted.handler(request())).status, 429);
      await pool.query("UPDATE auth_rate_limits SET last_request = $1 WHERE key = $2", [Date.now() - 61_000, `${ip}|/sign-in/email`]);
      const afterExpiry = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? auth : restarted).handler(request())));
      assert.equal(afterExpiry.filter((response) => response.status === 401).length, 5);
      assert.equal(afterExpiry.filter((response) => response.status === 429).length, 7);
    });

    await t.test("HTTPS deployment uses Secure session cookies", async () => {
      const secureOrigin = "https://receptie.example.test";
      const secureAuth = createAuth(db, { secret, baseURL: secureOrigin, sendEmail: async () => {} });
      const response = await secureAuth.handler(new Request(`${secureOrigin}/api/auth/sign-in/email`, {
        method: "POST", headers: { "Content-Type": "application/json", origin: secureOrigin, "x-real-ip": nextIp() },
        body: JSON.stringify({ email: emails[0], password: `${password} changed` }),
      }));
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie") ?? "", /; Secure/i);
      assert.match(response.headers.get("set-cookie") ?? "", /__Secure-/);
    });
  } finally {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM company_memberships WHERE company_id = ANY($1::uuid[]) OR user_id IN (SELECT id FROM users WHERE email = ANY($2::text[]))", [companyIds, emails]);
      await client.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [companyIds]);
      await client.query("DELETE FROM auth_verifications WHERE value IN (SELECT id::text FROM users WHERE email = ANY($1::text[]))", [emails]);
      await client.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]);
      // Rate-limit keys contain the test IP plus endpoint. Remove only this run's IPs.
      for (const ip of ips) await client.query("DELETE FROM auth_rate_limits WHERE key LIKE $1", [`${ip}|%`]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); await pool.end(); }
  }
});
