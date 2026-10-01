import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    channel: "chromium",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3000",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
