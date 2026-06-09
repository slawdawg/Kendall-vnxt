import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(rootDir, ".data", "ms-playwright");

mkdirSync(browserPath, { recursive: true });

const playwrightBin = process.platform === "win32"
  ? join(rootDir, "node_modules", ".bin", "playwright.CMD")
  : join(rootDir, "node_modules", ".bin", "playwright");
const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : playwrightBin;
const args = process.platform === "win32" ? ["/d", "/c", playwrightBin, "install", "chromium"] : ["install", "chromium"];

const result = spawnSync(command, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browserPath,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to start Playwright installer: ${result.error.message}`);
}

process.exit(result.status ?? 1);
