import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  STATIC_BUNDLES,
  buildStaticBundleReport,
  commandsForBundle,
  parseStaticBundleArgs,
  staticBundleNames,
} from "../scripts/run-static-bundle.mjs";
import { summarizeStaticBundleReports } from "../scripts/summarize-static-bundle-reports.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function aggregateStaticCommands() {
  return packageJson.scripts["check:static"]
    .split("&&")
    .map((command) => command.trim())
    .filter(Boolean)
    .map((command) => {
      assert.match(command, /^pnpm run /, `Unexpected static command shape: ${command}`);
      return command.slice("pnpm run ".length);
    });
}

test("static bundles have package script entry points", () => {
  assert.deepEqual(staticBundleNames(), [
    "core",
    "manager",
    "workspace",
    "policy",
    "pipeline-dashboard",
    "anti-churn",
  ]);

  for (const bundleName of staticBundleNames()) {
    assert.equal(
      packageJson.scripts[`check:static-${bundleName}`],
      `node ./scripts/run-static-bundle.mjs ${bundleName}`,
    );
  }

  assert.equal(packageJson.scripts["check:static-bundles"], "node ./scripts/run-static-bundle.mjs all");
  assert.equal(packageJson.scripts["test:static-bundle-summary"], "node --test tests/static-bundles.test.mjs");
});

test("static bundle coverage matches the monolithic static aggregate", () => {
  const aggregateCommands = aggregateStaticCommands();
  const bundleCommands = staticBundleNames().flatMap((bundleName) => STATIC_BUNDLES[bundleName]);

  assert.deepEqual(
    new Set(bundleCommands).size,
    bundleCommands.length,
    "A static command should belong to only one bundle",
  );

  assert.deepEqual(
    bundleCommands.sort(),
    [...aggregateCommands].sort(),
  );
});

test("all static bundle expands bundles in declared order", () => {
  assert.deepEqual(
    commandsForBundle("all"),
    staticBundleNames().flatMap((bundleName) => STATIC_BUNDLES[bundleName]),
  );
});

test("unknown static bundle fails before running commands", () => {
  assert.throws(() => commandsForBundle("unknown"), /Unknown static bundle "unknown"/);
});

test("static bundle CLI accepts report output path", () => {
  assert.deepEqual(parseStaticBundleArgs(["core", "--report", "reports/core.json"]), {
    bundleName: "core",
    reportPath: "reports/core.json",
    headSha: null,
  });
  assert.deepEqual(parseStaticBundleArgs(["core", "--report=reports/core.json"]), {
    bundleName: "core",
    reportPath: "reports/core.json",
    headSha: null,
  });
  assert.deepEqual(parseStaticBundleArgs(["core", "--head-sha", "abc123"]), {
    bundleName: "core",
    reportPath: null,
    headSha: "abc123",
  });
  assert.throws(() => parseStaticBundleArgs(["core", "--unexpected"]), /Unknown option "--unexpected"/);
});

test("static bundle report records command durations and failures", () => {
  const report = buildStaticBundleReport({
    bundleName: "core",
    commands: ["first", "second"],
    startedAtMs: 100,
    completedAtMs: 250,
    startedAt: "2026-07-07T00:00:00.000Z",
    completedAt: "2026-07-07T00:00:00.150Z",
    headSha: "abc123",
    commandResults: [
      { command: "first", status: "passed", exitCode: 0, signal: null, durationMs: 75 },
      { command: "second", status: "failed", exitCode: 1, signal: null, durationMs: 75 },
    ],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.headSha, "abc123");
  assert.equal(report.status, "failed");
  assert.equal(report.startedAt, "2026-07-07T00:00:00.000Z");
  assert.equal(report.completedAt, "2026-07-07T00:00:00.150Z");
  assert.equal(report.durationMs, 150);
  assert.equal(report.failedCommand, "second");
  assert.equal(report.completedCommandCount, 2);
});

test("static bundle summary compares bundle reports with monolithic static result", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "static-bundle-summary-"));
  for (const bundleName of staticBundleNames()) {
    writeFileSync(
      join(reportsDir, `${bundleName}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        bundle: bundleName,
        headSha: "abc123",
        status: "passed",
        durationMs: 100,
        commandCount: STATIC_BUNDLES[bundleName].length,
        completedCommandCount: STATIC_BUNDLES[bundleName].length,
        failedCommand: null,
        commands: [],
      })}\n`,
    );
  }

  const summary = summarizeStaticBundleReports({
    reportsDir,
    headSha: "abc123",
    staticResult: "success",
    staticBundleResult: "success",
    generatedAt: "2026-07-07T00:00:00.000Z",
  });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.headSha, "abc123");
  assert.equal(summary.sameHead.status, "matched");
  assert.equal(summary.equivalence.status, "matched");
  assert.equal(summary.promotionReadiness.status, "not_ready");
  assert.equal(summary.promotionReadiness.reportingOnly, true);
  assert.equal(summary.promotionReadiness.finalCheckRequiresStaticBundles, false);
  assert.equal(summary.promotionReadiness.requiredConsecutiveEquivalentRuns, 3);
  assert.equal(summary.promotionReadiness.observedConsecutiveEquivalentRuns, 1);
  assert.deepEqual(summary.equivalence.missingBundles, []);
  assert.deepEqual(summary.equivalence.failedBundles, []);
  assert.deepEqual(summary.equivalence.incompleteBundles, []);
  assert.deepEqual(summary.equivalence.duplicateBundles, []);
});

test("static bundle summary rejects cross-head evidence for promotion", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "static-bundle-summary-"));
  for (const bundleName of staticBundleNames()) {
    writeFileSync(
      join(reportsDir, `${bundleName}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        bundle: bundleName,
        headSha: bundleName === "core" ? "older" : "abc123",
        status: "passed",
        durationMs: 100,
        commandCount: STATIC_BUNDLES[bundleName].length,
        completedCommandCount: STATIC_BUNDLES[bundleName].length,
        failedCommand: null,
        commands: [],
      })}\n`,
    );
  }

  const summary = summarizeStaticBundleReports({
    reportsDir,
    headSha: "abc123",
    staticResult: "success",
    staticBundleResult: "success",
  });

  assert.equal(summary.sameHead.status, "not_matched");
  assert.deepEqual(summary.sameHead.mismatchedHeadShaBundles, ["core"]);
  assert.equal(summary.equivalence.status, "not_matched");
  assert.equal(summary.promotionReadiness.observedConsecutiveEquivalentRuns, 0);
});

test("static bundle summary rejects missing bundle reports for same-head evidence", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "static-bundle-summary-"));
  for (const bundleName of staticBundleNames().filter((bundleName) => bundleName !== "anti-churn")) {
    writeFileSync(
      join(reportsDir, `${bundleName}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        bundle: bundleName,
        headSha: "abc123",
        status: "passed",
        durationMs: 100,
        commandCount: STATIC_BUNDLES[bundleName].length,
        completedCommandCount: STATIC_BUNDLES[bundleName].length,
        failedCommand: null,
        commands: [],
      })}\n`,
    );
  }

  const summary = summarizeStaticBundleReports({
    reportsDir,
    headSha: "abc123",
    staticResult: "success",
    staticBundleResult: "success",
  });

  assert.equal(summary.sameHead.status, "not_matched");
  assert.equal(summary.equivalence.status, "not_matched");
  assert.deepEqual(summary.equivalence.missingBundles, ["anti-churn"]);
  assert.equal(summary.promotionReadiness.observedConsecutiveEquivalentRuns, 0);
});

test("static bundle summary rejects duplicate bundle reports", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "static-bundle-summary-"));
  const duplicateDir = join(reportsDir, "duplicate");
  mkdirSync(duplicateDir);
  for (const bundleName of staticBundleNames()) {
    writeFileSync(
      join(reportsDir, `${bundleName}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        bundle: bundleName,
        headSha: "abc123",
        status: "passed",
        durationMs: 100,
        commandCount: STATIC_BUNDLES[bundleName].length,
        completedCommandCount: STATIC_BUNDLES[bundleName].length,
        failedCommand: null,
        commands: [],
      })}\n`,
    );
  }
  writeFileSync(
    join(duplicateDir, "core.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      bundle: "core",
      headSha: "abc123",
      status: "passed",
      durationMs: 100,
      commandCount: STATIC_BUNDLES.core.length,
      completedCommandCount: STATIC_BUNDLES.core.length,
      failedCommand: null,
      commands: [],
    })}\n`,
  );

  const summary = summarizeStaticBundleReports({
    reportsDir,
    headSha: "abc123",
    staticResult: "success",
    staticBundleResult: "success",
  });

  assert.equal(summary.sameHead.status, "not_matched");
  assert.equal(summary.equivalence.status, "not_matched");
  assert.deepEqual(summary.equivalence.duplicateBundles, ["core"]);
  assert.match(summary.warnings.join("\n"), /Duplicate static-bundle report for core/);
});

test("static bundle summary rejects malformed or incomplete passing reports", () => {
  const reportsDir = mkdtempSync(join(tmpdir(), "static-bundle-summary-"));
  for (const bundleName of staticBundleNames()) {
    writeFileSync(
      join(reportsDir, `${bundleName}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        bundle: bundleName,
        headSha: "abc123",
        status: bundleName === "core" ? "passed" : "unknown",
        durationMs: 100,
        commandCount: STATIC_BUNDLES[bundleName].length,
        completedCommandCount: bundleName === "core" ? STATIC_BUNDLES[bundleName].length - 1 : STATIC_BUNDLES[bundleName].length,
        failedCommand: null,
        commands: [],
      })}\n`,
    );
  }

  const summary = summarizeStaticBundleReports({
    reportsDir,
    headSha: "abc123",
    staticResult: "success",
    staticBundleResult: "success",
  });

  assert.equal(summary.sameHead.status, "matched");
  assert.equal(summary.equivalence.status, "not_matched");
  assert.deepEqual(summary.equivalence.incompleteBundles, staticBundleNames());
  assert.equal(summary.promotionReadiness.observedConsecutiveEquivalentRuns, 0);
});

test("static bundle CLI parser leaves missing bundle name for entry guard", () => {
  assert.deepEqual(parseStaticBundleArgs([]), {
    bundleName: undefined,
    reportPath: null,
    headSha: null,
  });
});
