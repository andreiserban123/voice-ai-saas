import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);
const port = Number(process.env.E2E_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid E2E_PORT");
const baseURL = `http://localhost:${port}`;
process.env.AUTH_URL = baseURL;

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL,
    browserName: "chromium",
    channel: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Browser tests must never recover or terminate live calls from local credentials.
    env: { OPENAI_API_KEY: "", HOSTNAME_BIND: "127.0.0.1" },
    command: `npm run start -- --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
