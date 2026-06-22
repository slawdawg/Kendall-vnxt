import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedPlaywrightChromiumExecutables,
  hasPlaywrightChromium,
  playwrightBrowserPreflight,
} from "../scripts/dashboard-e2e-runner.mjs";

test("dashboard e2e browser preflight fails before server launch with setup command", () => {
  const browserPath = mkdtempSync(join(tmpdir(), "kendall-e2e-missing-browser-"));
  try {
    const preflight = playwrightBrowserPreflight(browserPath);

    assert.equal(preflight.ok, false);
    assert.match(preflight.message, /Missing Playwright Chromium browser/);
    assert.match(preflight.message, /pnpm run setup:e2e/);
    assert.match(preflight.message, /PLAYWRIGHT_BROWSERS_PATH=/);
    assert.match(preflight.message, /stops before starting supervisor\/dashboard servers/);
  } finally {
    rmSync(browserPath, { recursive: true, force: true });
  }
});

test("dashboard e2e browser preflight accepts the configured worktree browser cache", () => {
  const browserPath = mkdtempSync(join(tmpdir(), "kendall-e2e-ready-browser-"));
  try {
    const executable = expectedPlaywrightChromiumExecutables(browserPath)[0];
    mkdirSync(dirname(executable), { recursive: true });
    writeFileSync(executable, "");

    assert.equal(hasPlaywrightChromium(browserPath), true);
    assert.deepEqual(playwrightBrowserPreflight(browserPath), {
      ok: true,
      message: "Playwright Chromium browser cache is ready.",
    });
  } finally {
    rmSync(browserPath, { recursive: true, force: true });
  }
});
