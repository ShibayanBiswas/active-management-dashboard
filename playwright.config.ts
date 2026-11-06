import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://localhost:3006";

/** One Chromium smoke. BASE_URL points it at a deployment; otherwise it starts the production build on 3006. */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "reports/playwright", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL ? undefined : { command: "npm run start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
