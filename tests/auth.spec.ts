import { randomInt, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";

test("signup, SMTP verification, onboarding, tenant access, logout and password reset", async ({ page, context, request }) => {
  const databaseURL = new URL(process.env.DATABASE_URL ?? "http://missing");
  expect(["postgres:", "postgresql:"]).toContain(databaseURL.protocol);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(databaseURL.hostname);
  expect(databaseURL.pathname).toBe("/voice_ai_saas");
  expect(process.env.AUTH_URL).toBe("http://localhost:3000");
  expect(["localhost", "127.0.0.1", "::1"]).toContain(process.env.SMTP_HOST);
  expect(process.env.SMTP_PORT).toBe("1025");

  const pool = new Pool({ connectionString: databaseURL.toString(), connectionTimeoutMillis: 5000 });
  const runId = randomUUID();
  const email = `browser-${runId}@example.test`;
  const password = `Atelier test password ${runId}`;
  const newPassword = `${password} changed`;
  const ip = `198.18.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const companyIds: string[] = [];
  const mailpit = "http://localhost:8025";
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.setExtraHTTPHeaders({ "x-real-ip": ip });

  async function emailLink(subject: string) {
    let id: string | undefined;
    await expect.poll(async () => {
      const response = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } });
      expect(response.ok()).toBeTruthy();
      const data = await response.json() as { messages: { ID: string; Subject: string }[] };
      id = data.messages.find((message) => message.Subject === subject)?.ID;
      return Boolean(id);
    }, { timeout: 15_000, message: "Authentication email arrives in local Mailpit" }).toBe(true);
    const response = await request.get(`${mailpit}/api/v1/message/${id}`);
    expect(response.ok()).toBeTruthy();
    const message = await response.json() as { Text: string };
    const link = message.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    expect(new URL(link!).origin).toBe("http://localhost:3000");
    return link!;
  }

  async function login(value: string) {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Parolă", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Intră în cont", exact: true }).click();
  }

  try {
    await pool.query("SELECT 1");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    expect((await request.get(`/api/companies/${randomUUID()}`)).status()).toBe(401);

    await page.getByRole("link", { name: "Creează un cont", exact: true }).click();
    await page.getByLabel("Nume", { exact: true }).fill("Ștefan Test");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Parolă", { exact: true }).fill(password);
    await page.getByLabel("Confirmă parola", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Creează contul", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Verifică inboxul");

    await login(password);
    await expect(page.getByRole("alert").filter({ hasText: "Confirmă adresa de email" })).toBeVisible();
    await page.goto(await emailLink("Confirmă adresa de email — Recepție AI"));
    await expect(page.getByRole("status")).toContainText("Email confirmat");
    await login(password);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Numele service-ului").fill("Atelier Ștefan Browser");
    await page.getByRole("button", { name: "Creează service-ul", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?company=/);
    const companyId = new URL(page.url()).searchParams.get("company")!;
    companyIds.push(companyId);
    await expect(page.getByText("Atelier Ștefan Browser", { exact: true })).toBeVisible();
    const ownCompany = await context.request.get(`/api/companies/${companyId}`);
    expect(ownCompany.status()).toBe(200);
    expect(ownCompany.headers()["cache-control"]).toBe("private, no-store");
    expect((await ownCompany.json()).role).toBe("owner");

    const foreignId = randomUUID();
    companyIds.push(foreignId);
    await pool.query("INSERT INTO companies (id, name, slug) VALUES ($1, 'Foreign browser fixture', $2)", [foreignId, `browser-${runId}`]);
    expect((await context.request.get(`/api/companies/${foreignId}`)).status()).toBe(404);
    await page.goto(`/dashboard?company=${foreignId}`);
    await expect(page.getByText("Foreign browser fixture", { exact: true })).toHaveCount(0);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Ieși din cont", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get(`/api/companies/${companyId}`)).status()).toBe(401);
    await login(password);
    await expect(page).toHaveURL(/\/dashboard$/);
    const oldCookies = await context.cookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Trimite linkul de resetare" }).click();
    await expect(page.getByRole("status")).toContainText("vei primi un link de resetare");
    const resetLink = await emailLink("Resetează parola — Recepție AI");
    await page.goto(resetLink);
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    await page.getByLabel("Parola nouă", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirmă parola", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Salvează parola" }).click();
    await expect(page.getByRole("status")).toContainText("Parola a fost schimbată");
    const revoked = await request.get(`/api/companies/${companyId}`, {
      headers: { cookie: oldCookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
    });
    expect(revoked.status()).toBe(401);
    await login(password);
    await expect(page.getByRole("alert").filter({ hasText: "Emailul sau parola nu sunt corecte" })).toBeVisible();
    await login(newPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Atelier Ștefan Browser", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    try {
      const memberships = await pool.query("SELECT company_id FROM company_memberships WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [email]);
      companyIds.push(...memberships.rows.map((row: { company_id: string }) => row.company_id));
      await pool.query("DELETE FROM company_memberships WHERE company_id = ANY($1::uuid[])", [companyIds]);
      await pool.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [companyIds]);
      await pool.query("DELETE FROM auth_verifications WHERE value IN (SELECT id::text FROM users WHERE email = $1)", [email]);
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
      await pool.query("DELETE FROM auth_rate_limits WHERE key LIKE $1", [`${ip}|%`]);
      // Include this run's emails even if a form assertion fails before emailLink.
      const deleted = await request.delete(`${mailpit}/api/v1/search`, { params: { query: `to:${email}` } });
      expect(deleted.ok()).toBeTruthy();
    } finally {
      await pool.end();
    }
  }
});
