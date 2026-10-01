import { randomInt, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { Pool } from "pg";

test("signup, SMTP verification, onboarding, tenant access, logout and password reset", async ({ page, context, request }, testInfo) => {
  const databaseURL = new URL(process.env.DATABASE_URL ?? "http://missing");
  expect(["postgres:", "postgresql:"]).toContain(databaseURL.protocol);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(databaseURL.hostname);
  expect(databaseURL.pathname).toBe("/voice_ai_saas");
  const authOrigin = new URL(process.env.AUTH_URL!);
  expect(authOrigin.protocol).toBe("http:");
  expect(authOrigin.hostname).toBe("localhost");
  expect(["localhost", "127.0.0.1", "::1"]).toContain(process.env.SMTP_HOST);
  expect(process.env.SMTP_PORT).toBe("1025");

  const pool = new Pool({ connectionString: databaseURL.toString(), connectionTimeoutMillis: 5000 });
  const runId = randomUUID();
  const email = `browser-${runId}@example.test`;
  const password = `Business test password ${runId}`;
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
    const message = await response.json() as { Text: string; From: { Name: string } };
    expect(message.From.Name).toBe("Pam.ai");
    const link = message.Text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    expect(new URL(link!).origin).toBe(authOrigin.origin);
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
    await expect(page).toHaveTitle("Pam.ai | Recepționera AI pentru afacerea ta");
    await expect(page.getByRole("link", { name: "Pam.ai", exact: true })).toBeVisible();
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
    await page.goto(await emailLink("Confirmă adresa de email — Pam.ai"));
    await expect(page.getByRole("status")).toContainText("Email confirmat");
    await login(password);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Numele afacerii").fill("Studio Ștefan Browser");
    await page.getByRole("button", { name: "Adaugă afacerea", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\?company=/);
    const companyId = new URL(page.url()).searchParams.get("company")!;
    companyIds.push(companyId);
    await expect(page.getByText("Studio Ștefan Browser", { exact: true })).toBeVisible();
    const themeToggle = page.getByRole("switch", { name: "Mod întunecat", exact: true });
    for (const theme of ["light", "dark"] as const) {
      await themeToggle.setChecked(theme === "dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { name: "Apeluri recente", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("dashboard-mobile-dark.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    const ownCompany = await context.request.get(`/api/companies/${companyId}`);
    expect(ownCompany.status()).toBe(200);
    expect(ownCompany.headers()["cache-control"]).toBe("private, no-store");
    expect((await ownCompany.json()).role).toBe("owner");

    await page.getByRole("link", { name: "Configurează recepția →" }).click();
    await expect(page.getByRole("heading", { name: "Configurează recepția" })).toBeVisible();
    await page.getByLabel("Serviciu oferit", { exact: true }).fill("Consultație inițială");
    const firstFaq = page.getByRole("group", { name: "Întrebare frecventă 1", exact: true });
    await firstFaq.getByLabel("Întrebare", { exact: true }).fill("Unde se află studioul?");
    await firstFaq.getByRole("textbox", { name: "Răspuns", exact: true }).fill("Strada Exemplu 1, București.");
    await page.getByLabel("Închidere", { exact: true }).fill("08:00");
    await page.getByRole("button", { name: "Salvează configurarea", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Verifică salutul" })).toBeVisible();
    await expect(page.getByLabel("Serviciu oferit", { exact: true })).toHaveValue("Consultație inițială");
    await expect(firstFaq.getByRole("textbox", { name: "Răspuns", exact: true })).toHaveValue("Strada Exemplu 1, București.");
    await page.getByLabel("Închidere", { exact: true }).fill("17:00");
    await page.getByRole("button", { name: "Salvează configurarea", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Configurarea a fost salvată");
    await page.reload();
    await expect(page.getByLabel("Serviciu oferit", { exact: true })).toHaveValue("Consultație inițială");
    await expect(page.getByRole("group", { name: "Întrebare frecventă 1", exact: true }).getByRole("textbox", { name: "Răspuns", exact: true })).toHaveValue("Strada Exemplu 1, București.");
    await page.screenshot({ path: testInfo.outputPath("settings-dark.png"), fullPage: true });

    const phoneId = randomUUID(), callId = randomUUID();
    await pool.query("INSERT INTO phone_configurations (id, company_id, provider, provider_account_id, phone_number, credential_reference) VALUES ($1,$2,'browser-test',$3,$4,'test-only')", [phoneId, companyId, runId, `+408${runId.replace(/[^0-9]/g, "").slice(0, 8).padEnd(8, "0")}`]);
    await pool.query("INSERT INTO calls (id, company_id, phone_configuration_id, telephony_provider, provider_account_id, provider_call_id, caller_name, caller_phone, issue, summary, status, started_at, ended_at, duration_seconds) VALUES ($1,$2,$3,'browser-test',$4,'browser-call','Ana Popescu','+40722123456','Informații despre consultație','Ana a cerut informații.','completed',now()-interval '42 seconds',now(),42)", [callId, companyId, phoneId, runId]);
    await pool.query("INSERT INTO transcript_entries (company_id, call_id, sequence, provider_item_id, speaker, text, offset_ms) VALUES ($1,$2,0,'browser-item','caller','Mă numesc Ana Popescu.',0)", [companyId, callId]);
    await page.goto(`/dashboard?company=${companyId}`);
    await page.getByRole("link", { name: "Ana Popescu", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Transcriere", exact: true })).toBeVisible();
    await expect(page.getByText("Mă numesc Ana Popescu.", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("call-dark.png"), fullPage: true });

    const foreignId = randomUUID();
    companyIds.push(foreignId);
    await pool.query("INSERT INTO companies (id, name, slug) VALUES ($1, 'Foreign browser fixture', $2)", [foreignId, `browser-${runId}`]);
    expect((await context.request.get(`/api/companies/${foreignId}`)).status()).toBe(404);
    await page.goto(`/dashboard/settings?company=${foreignId}`);
    await expect(page.getByRole("button", { name: "Salvează configurarea", exact: true })).toHaveCount(0);
    await page.goto(`/dashboard/calls/${callId}?company=${foreignId}`);
    await expect(page.getByText("Mă numesc Ana Popescu.", { exact: true })).toHaveCount(0);
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
    const resetLink = await emailLink("Resetează parola — Pam.ai");
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
    await expect(page.getByText("Studio Ștefan Browser", { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    try {
      const memberships = await pool.query("SELECT company_id FROM company_memberships WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [email]);
      companyIds.push(...memberships.rows.map((row: { company_id: string }) => row.company_id));
      for (const table of ["provider_events", "transcript_entries", "calls", "phone_configurations", "agent_configurations", "business_hours", "faqs", "services"]) {
        await pool.query(`DELETE FROM ${table} WHERE company_id = ANY($1::uuid[])`, [companyIds]);
      }
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
