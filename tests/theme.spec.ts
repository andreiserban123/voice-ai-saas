import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light" });

test("theme toggle changes real colors, works by keyboard, and persists across navigation and reload", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const root = page.locator("html");
  const toggle = page.getByRole("switch", { name: "Mod întunecat", exact: true });
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(toggle).not.toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("login-light.png"), fullPage: true });
  const lightBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await expect(root).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("pam-theme"))).toBe("dark");
  const darkBackground = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await page.screenshot({ path: testInfo.outputPath("login-dark.png"), fullPage: true });
  await page.getByRole("link", { name: "Creează un cont", exact: true }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toBeChecked();
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(root).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(toggle).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("system preference follows OS changes until the user explicitly picks a theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  const toggle = page.getByRole("switch", { name: "Mod întunecat", exact: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("unavailable browser storage still allows system defaults and theme switching", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("Storage unavailable", "SecurityError"); } });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("switch", { name: "Mod întunecat", exact: true }).uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
});

test("auth screens remain usable at mobile widths in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  const toggle = page.getByRole("switch", { name: "Mod întunecat", exact: true });
  for (const theme of ["light", "dark"] as const) {
    await toggle.setChecked(theme === "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Creează contul", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  }
});
