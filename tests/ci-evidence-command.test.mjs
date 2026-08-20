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
      command: ["pnpm", "run", "test:codex-workspace"],
    },
  );
  assert.throws(() => parseCiEvidenceCommandArgs(["--report", "report.json"]), /--route must be baseline or proposed/);
});
