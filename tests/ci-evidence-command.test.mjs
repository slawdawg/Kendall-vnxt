import assert from "node:assert/strict";
import test from "node:test";

import { buildCiCommandEvidence, parseCiEvidenceCommandArgs } from "../scripts/run-ci-evidence-command.mjs";

test("CI command evidence captures immutable source identity and failure time", () => {
  const evidence = buildCiCommandEvidence({
    route: "proposed",
    cohort: "controlled_failure",
    selectionVector: { id: "supervisor-work-packets" },
    source: { headSha: "head", baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu-latest-node22" },
    cacheStrategy: "observed",
    cacheKey: "github-cache-key",
    jobName: "proposed-supervisor (integration-work-packets)",
    command: ["pnpm", "run", "test:supervisor:check:integration:work-packets"],
    startedAtMs: 1000,
    completedAtMs: 1600,
    exitCode: 1,
    signal: null,
  });
  assert.equal(evidence.outcome.status, "failed");
  assert.equal(evidence.metrics.executionMs, 600);
  assert.equal(evidence.metrics.firstActionableFailureMs, 600);
  assert.deepEqual(evidence.cacheControl, { strategy: "observed", cacheKey: "github-cache-key" });
  assert.equal(evidence.jobName, "proposed-supervisor (integration-work-packets)");
});

test("CI command evidence can inject a named deterministic failure after a successful target command", () => {
  const evidence = buildCiCommandEvidence({
    route: "baseline",
    cohort: "controlled_failure",
    selectionVector: { id: "supervisor-elevated" },
    source: { headSha: "head", baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu" },
    cacheStrategy: "counterbalanced",
    cacheKey: "cold-cache",
    injectedFailureId: "supervisor-elevated:aggregate",
    command: ["pnpm", "run", "test:supervisor:profile"],
    startedAtMs: 10,
    completedAtMs: 40,
    exitCode: 0,
    signal: null,
  });
  assert.equal(evidence.outcome.status, "failed");
  assert.equal(evidence.outcome.failureId, "supervisor-elevated:aggregate");
  assert.equal(evidence.outcome.injected, true);
  assert.equal(evidence.outcome.exitCode, 1);
});

test("CI command evidence does not relabel a target-command failure as an injected failure", () => {
  const evidence = buildCiCommandEvidence({
    route: "baseline",
    cohort: "controlled_failure",
    selectionVector: { id: "supervisor-elevated" },
    source: { headSha: "head", baseSha: "base", lockfileSha: "lock", environmentId: "ubuntu" },
    cacheStrategy: "isolated",
    cacheKey: "pair",
    injectedFailureId: "supervisor-elevated:aggregate",
    command: ["pnpm", "run", "test:supervisor:profile"],
    startedAtMs: 10,
    completedAtMs: 40,
    exitCode: 1,
    signal: null,
  });
  assert.equal(evidence.outcome.failureId, null);
  assert.equal(evidence.outcome.injected, false);
});

test("CI command evidence CLI requires a complete and typed contract", () => {
  assert.deepEqual(
    parseCiEvidenceCommandArgs([
      "--report", "report.json", "--route", "baseline", "--selection-vector", '{"id":"workspace"}',
      "--head-sha", "head", "--base-sha", "base", "--lockfile-sha", "lock", "--environment-id", "runner",
      "--cache-strategy", "isolated", "--cache-key", "pair", "--", "pnpm", "run", "test:codex-workspace",
    ]),
    {
      reportPath: "report.json",
      route: "baseline",
      cohort: "ordinary",
      selectionVector: { id: "workspace" },
      headSha: "head",
      baseSha: "base",
      lockfileSha: "lock",
      environmentId: "runner",
      cacheStrategy: "isolated",
      cacheKey: "pair",
      jobName: null,
      injectedFailureId: null,
      command: ["pnpm", "run", "test:codex-workspace"],
    },
  );
  assert.throws(() => parseCiEvidenceCommandArgs(["--report", "report.json"]), /--route must be baseline or proposed/);
});
