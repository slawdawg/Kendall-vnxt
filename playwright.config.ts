import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const dashboardUrl = process.env.PLAYWRIGHT_DASHBOARD_URL ?? "http://127.0.0.1:3000";
const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";
const dashboardPort = new URL(dashboardUrl).port || "3000";
const supervisorPort = new URL(supervisorUrl).port || "8100";
const localDataDir = path.join(__dirname, ".data");
const uvCacheDir = process.env.UV_CACHE_DIR ?? path.join(localDataDir, "uv-cache");
const tempDir = process.env.TEMP ?? path.join(localDataDir, "tmp");
const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(localDataDir, "ms-playwright");
process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
const enableWebKitProjects = process.env.PLAYWRIGHT_ENABLE_WEBKIT_PROJECTS === "true";
const supervisorCommand = `uv run --directory services/supervisor uvicorn supervisor.api.main:app --host 127.0.0.1 --port ${supervisorPort}`;
const dashboardCommand = `pnpm --filter @kendall/dashboard exec next dev --hostname 127.0.0.1 --port ${dashboardPort}`;
const dbPath = (
  process.env.PLAYWRIGHT_E2E_DB_PATH ?? path.join(localDataDir, `e2e-supervisor-${process.pid}.db`)
).replaceAll("\\", "/");
const dbUrl = `sqlite+aiosqlite:///${dbPath}`;
process.env.PLAYWRIGHT_E2E_DB_PATH = dbPath;

const chromiumProject = {
  name: "windows-11-chromium",
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 960 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  },
};

const webKitProjects = [
  {
    name: "ipad-pro-gen-2-safari-ios-26",
    use: {
      browserName: "webkit" as const,
      viewport: { width: 1024, height: 1366 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    },
  },
  {
    name: "iphone-15-pro-max-safari-ios-27",
    use: {
      ...devices["iPhone 15 Pro Max"],
      browserName: "webkit" as const,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
    },
  },
];

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
  webServer: process.env.PLAYWRIGHT_DISABLE_WEBSERVER === "true"
    ? undefined
    : [
        {
          command: supervisorCommand,
          url: `${supervisorUrl}/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            SUPERVISOR_ALLOW_DIRTY_REPO: "true",
            SUPERVISOR_DATABASE_URL: dbUrl,
            SUPERVISOR_POLL_INTERVAL_SECONDS: "1",
            SUPERVISOR_CORS_ORIGINS: dashboardUrl,
            UV_CACHE_DIR: uvCacheDir,
            PLAYWRIGHT_BROWSERS_PATH: browserPath,
            TEMP: tempDir,
            TMP: tempDir,
          },
        },
        {
          command: dashboardCommand,
          url: dashboardUrl,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            NEXT_PUBLIC_SUPERVISOR_URL: supervisorUrl,
            SUPERVISOR_INTERNAL_URL: supervisorUrl,
            PLAYWRIGHT_BROWSERS_PATH: browserPath,
            TEMP: tempDir,
            TMP: tempDir,
          },
        },
      ],
  projects: enableWebKitProjects ? [chromiumProject, ...webKitProjects] : [chromiumProject],
});
