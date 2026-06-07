import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dashboardUrl = process.env.PLAYWRIGHT_DASHBOARD_URL ?? "http://127.0.0.1:3100";
const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";
const dashboardPort = new URL(dashboardUrl).port || "3100";
const supervisorPort = new URL(supervisorUrl).port || "8100";
const dbPath = (
  process.env.PLAYWRIGHT_E2E_DB_PATH ?? path.join(__dirname, ".data", `e2e-supervisor-${process.pid}.db`)
).replaceAll("\\", "/");
const dbUrl = `sqlite+aiosqlite:///${dbPath}`;

export default defineConfig({
  testDir: path.join(__dirname, "tests", "e2e"),
  fullyParallel: false,
  globalSetup: path.join(__dirname, "tests", "e2e", "global-setup.ts"),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: dashboardUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `uv run --directory services/supervisor uvicorn supervisor.api.main:app --host 127.0.0.1 --port ${supervisorPort}`,
      url: `${supervisorUrl}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SUPERVISOR_ALLOW_DIRTY_REPO: "true",
        SUPERVISOR_DATABASE_URL: dbUrl,
        SUPERVISOR_POLL_INTERVAL_SECONDS: "1",
        SUPERVISOR_CORS_ORIGINS: dashboardUrl,
      },
    },
    {
      command: `pnpm --filter @kendall/dashboard build && pnpm --filter @kendall/dashboard exec next start --hostname 127.0.0.1 --port ${dashboardPort}`,
      url: dashboardUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPERVISOR_URL: supervisorUrl,
        SUPERVISOR_INTERNAL_URL: supervisorUrl,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
