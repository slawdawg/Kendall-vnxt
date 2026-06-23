import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";
import { recordChurnEvent } from "../scripts/lib/anti-churn-event-writer.mjs";

const SCRIPT = "./scripts/anti-churn-guidance-hook.mjs";

test("JSON evaluation emits the stable hook output contract", () => {
  const fixture = createFixture();
  try {
    const written = recordChurnEvent(event({ eventId: "churn-output-json" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--dry-run", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: emptySnapshots(),
      },
    );

    assert.deepEqual(Object.keys(result), [
      "schemaVersion",
      "lane",
      "mode",
      "status",
      "exitCode",
      "lessonsEvaluated",
      "eventStore",
      "ignoredPathVerified",
      "transactionId",
      "applied",
      "proposals",
      "skipped",
      "warnings",
      "requiresAuthority",
      "filesChanged",
      "verification",
      "residualRisks",
      "localEventStorage",
    ]);
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.lane, "lane-123");
    assert.equal(result.mode, "dry-run");
    assert.equal(result.status, "success");
    assert.equal(result.exitCode, 0);
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.eventStore, written.eventStore);
    assert.equal(result.ignoredPathVerified, true);
    assert.equal(result.transactionId, null);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.filesChanged, []);
  } finally {
    fixture.cleanup();
  }
});

test("direct executable emits one JSON object with --format json", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-direct-json" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = spawnSync(process.execPath, [SCRIPT, "--lane", "lane-123", "--dry-run", "--format", "json"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_WORKSPACE_ROOT: fixture.stateRoot,
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.status, "success");
    assert.equal(parsed.exitCode, 0);
    assert.equal(parsed.mode, "dry-run");
  } finally {
    fixture.cleanup();
  }
});

test("direct executable emits deterministic human-readable dry-run output by default", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-human" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = spawnSync(process.execPath, [SCRIPT, "--lane", "lane-123", "--dry-run"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_WORKSPACE_ROOT: fixture.stateRoot,
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Anti-Churn Hook Result/);
    assert.match(result.stdout, /Lane: lane-123/);
    assert.match(result.stdout, /Mode: dry-run/);
    assert.match(result.stdout, /Lessons evaluated: 1/);
    assert.match(result.stdout, /Proposals prepared:/);
    assert.match(result.stdout, /No-op reasons:/);
    assert.match(result.stdout, /Required authority:/);
    assert.match(result.stdout, /Files changed:/);
    assert.match(result.stdout, /Verification:/);
    assert.match(result.stdout, /Residual risks:/);
    assert.match(result.stdout, /Local event storage:/);
  } finally {
    fixture.cleanup();
  }
});

test("invalid evaluation input returns input-error with exit code 1", () => {
  const result = runAntiChurnGuidanceHookCli(["evaluate", "--format", "json"]);

  assert.equal(result.status, "input-error");
  assert.equal(result.exitCode, 1);
  assert.equal(result.lane, null);
});

test("unsafe local event storage reports input-error without claiming ignored path verification", () => {
  const result = runAntiChurnGuidanceHookCli(
    ["evaluate", "--lane", "lane-123", "--format", "json"],
    {
      env: {
        ...process.env,
        CODEX_WORKSPACE_ROOT: join(process.cwd(), "anti-churn-unsafe-state"),
      },
    },
  );

  assert.equal(result.status, "input-error");
  assert.equal(result.exitCode, 1);
  assert.equal(result.ignoredPathVerified, false);
  assert.deepEqual(result.filesChanged, []);
  assert.deepEqual(result.applied, []);
});

test("apply-safe without lane manifest degrades to proposal-only without mutation", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-apply-safe" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--apply-safe", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: emptySnapshots(),
      },
    );

    assert.equal(result.mode, "apply-safe");
    assert.equal(result.status, "success");
    assert.equal(result.exitCode, 0);
    assert.match(result.warnings.at(-1), /missing-lane-manifest/);
    assert.match(result.residualRisks.at(-1), /source-application-blocked/);
    assert.deepEqual(result.filesChanged, []);
    assert.deepEqual(result.applied, []);
  } finally {
    fixture.cleanup();
  }
});

test("lesson filtering limits evaluation to one event", () => {
  const fixture = createFixture();
  try {
    recordChurnEvent(event({ eventId: "churn-first", signature: ".git/worktrees read-only filesystem boundary" }), {
      stateRoot: fixture.stateRoot,
    });
    recordChurnEvent(event({ eventId: "churn-second", signature: "$HOME/.cache/uv read-only filesystem boundary" }), {
      stateRoot: fixture.stateRoot,
    });

    const result = runAntiChurnGuidanceHookCli(
      ["evaluate", "--lane", "lane-123", "--lesson", "churn-second", "--format", "json"],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: fixture.stateRoot,
        },
        sourceSnapshots: emptySnapshots(),
      },
    );

    assert.equal(result.mode, "dry-run");
    assert.equal(result.lessonsEvaluated, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.localEventStorage[0].eventCount, 1);
  } finally {
    fixture.cleanup();
  }
});

function event(overrides = {}) {
  return {
    laneId: "lane-123",
    phase: "verification",
    failureClass: "sandbox",
    signature: ".git/worktrees read-only filesystem boundary",
    attemptedCommand: "pnpm run check:static",
    evidenceSummary: "Workspace verification hit a local read-only filesystem boundary.",
    wrongRetryPattern: "retrying inside sandbox",
    nextSafeAction: "Request approval to rerun the exact same read-only verification command outside the sandbox.",
    createdAt: "2026-06-22T12:00:00Z",
    metadata: {
      wrongRetryPrevented: true,
    },
    ...overrides,
  };
}

function emptySnapshots() {
  return {
    "docs/workflows/tool-churn-rca-examples.md": "",
    "docs/workflows/tool-churn-rca.md": "",
    AGENTS: "",
    "docs/workflows/end-to-end-lane-runner.md": "",
    "scripts/check-token-economy.mjs": "",
  };
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-guidance-output-"));
  return {
    stateRoot: join(root, "state"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
