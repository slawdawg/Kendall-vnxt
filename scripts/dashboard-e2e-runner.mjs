import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export async function runFocusedDashboardE2E({ databaseName, grep, testFile = "dashboard.spec.ts" }) {
  const dataDir = join(rootDir, ".data");
  const tempDir = join(dataDir, "tmp");
  const uvCacheDir = join(dataDir, "uv-cache");
  const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(dataDir, "ms-playwright");
  const dashboardUrl = process.env.PLAYWRIGHT_DASHBOARD_URL ?? "http://127.0.0.1:3100";
  const supervisorUrl = process.env.PLAYWRIGHT_SUPERVISOR_URL ?? "http://127.0.0.1:8100";
  const dashboardPort = new URL(dashboardUrl).port || "3100";
  const supervisorPort = new URL(supervisorUrl).port || "8100";
  const dbPath = (process.env.PLAYWRIGHT_E2E_DB_PATH ?? join(dataDir, `${databaseName}-${process.pid}.db`)).replaceAll("\\", "/");

  mkdirSync(tempDir, { recursive: true });
  mkdirSync(uvCacheDir, { recursive: true });
  mkdirSync(browserPath, { recursive: true });

  const browserPreflight = playwrightBrowserPreflight(browserPath);
  if (!browserPreflight.ok) {
    console.error(browserPreflight.message);
    return 1;
  }

  const baseEnv = {
    ...process.env,
    TEMP: tempDir,
    TMP: tempDir,
    UV_CACHE_DIR: uvCacheDir,
    PLAYWRIGHT_BROWSERS_PATH: browserPath,
  };

  const children = [];

  try {
    const supervisor = startProcess(
      "uv",
      ["run", "--directory", "services/supervisor", "uvicorn", "supervisor.api.main:app", "--host", "127.0.0.1", "--port", supervisorPort],
      {
        cwd: rootDir,
        env: {
          ...baseEnv,
          SUPERVISOR_ALLOW_DIRTY_REPO: "true",
          SUPERVISOR_DATABASE_URL: `sqlite+aiosqlite:///${dbPath}`,
          SUPERVISOR_POLL_INTERVAL_SECONDS: "1",
          SUPERVISOR_CORS_ORIGINS: dashboardUrl,
        },
        label: "supervisor",
      },
    );
    children.push(supervisor);
    await waitForUrl(`${supervisorUrl}/health`, "supervisor");

    const dashboard = startProcess(dashboardCommand(), dashboardArgs(dashboardPort), {
      cwd: rootDir,
      env: {
        ...baseEnv,
        NEXT_PUBLIC_SUPERVISOR_URL: supervisorUrl,
        SUPERVISOR_INTERNAL_URL: supervisorUrl,
      },
      label: "dashboard",
    });
    children.push(dashboard);
    await waitForUrl(dashboardUrl, "dashboard");

    const playwright = startProcess(
      process.execPath,
      [join(rootDir, "node_modules", "@playwright", "test", "cli.js"), "test", testFile, "--grep", grep],
      {
        cwd: rootDir,
        env: {
          ...baseEnv,
          PLAYWRIGHT_DISABLE_WEBSERVER: "true",
          PLAYWRIGHT_DASHBOARD_URL: dashboardUrl,
          PLAYWRIGHT_SUPERVISOR_URL: supervisorUrl,
          PLAYWRIGHT_E2E_DB_PATH: dbPath,
        },
        label: "playwright",
      },
    );
    const code = await waitForExit(playwright);
    process.exitCode = code;
    return code;
  } finally {
    await Promise.allSettled(children.map(stopProcessTree));
  }
}

export function playwrightBrowserPreflight(browserPath) {
  if (hasPlaywrightChromium(browserPath)) {
    return { ok: true, message: "Playwright Chromium browser cache is ready." };
  }

  return {
    ok: false,
    message: [
      `Missing Playwright Chromium browser in ${browserPath}.`,
      "Run the e2e setup command before launching focused dashboard e2e:",
      `PLAYWRIGHT_BROWSERS_PATH="${browserPath}" pnpm run setup:e2e`,
      "This preflight stops before starting supervisor/dashboard servers to avoid tool churn.",
    ].join("\n"),
  };
}

export function hasPlaywrightChromium(browserPath) {
  return expectedPlaywrightChromiumExecutables(browserPath).some((candidate) => existsSync(candidate));
}

export function expectedPlaywrightChromiumExecutables(browserPath) {
  return [
    join(browserPath, "chromium_headless_shell-1228", "chrome-headless-shell-linux64", "chrome-headless-shell"),
    join(browserPath, "chromium-1228", "chrome-linux", "chrome"),
  ];
}

function dashboardCommand() {
  return "pnpm";
}

function dashboardArgs(dashboardPort) {
  return ["--filter", "@kendall/dashboard", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", dashboardPort];
}

function startProcess(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    detectExpectedPass(child, options.label, chunk);
    process.stdout.write(`[${options.label}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    detectExpectedPass(child, options.label, chunk);
    process.stderr.write(`[${options.label}] ${chunk}`);
  });
  return child;
}

function detectExpectedPass(child, label, chunk) {
  if (label === "playwright" && chunk.toString().replace(/\s+/g, " ").includes("1 passed")) {
    child.kendallExpectedPassObserved = true;
  }
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 120_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError}`);
}

async function waitForExit(child) {
  return await new Promise((resolve) => {
    const hardStop = setTimeout(() => {
      stopProcessTree(child).finally(() => resolve(child.kendallExpectedPassObserved ? 0 : 1));
    }, 90_000);
    const passWatchdog = setInterval(() => {
      if (child.kendallExpectedPassObserved) {
        clearTimeout(hardStop);
        clearInterval(passWatchdog);
        stopProcessTree(child).finally(() => resolve(0));
      }
    }, 250);
    child.on("exit", (code) => {
      clearTimeout(hardStop);
      clearInterval(passWatchdog);
      resolve(code ?? 1);
    });
    child.on("error", () => {
      clearTimeout(hardStop);
      clearInterval(passWatchdog);
      resolve(1);
    });
  });
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
}
