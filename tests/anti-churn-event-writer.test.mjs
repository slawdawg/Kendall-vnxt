import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ChurnEventWriterError,
  recordChurnEvent,
} from "../scripts/lib/anti-churn-event-writer.mjs";
import { runAntiChurnGuidanceHookCli } from "../scripts/anti-churn-guidance-hook.mjs";

test("recordChurnEvent writes readable global and per-lane JSONL events", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const result = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(result.status, "recorded");
    assert.match(result.event.eventId, /^churn-20260622t120000z-[a-f0-9]{12}$/);
    assert.equal(result.event.schemaVersion, 1);
    assert.equal(result.event.lane, "lane-123");
    assert.equal(result.event.phase, "verification");
    assert.equal(result.event.failureClass, "sandbox");
    assert.equal(result.event.signature, ".git/worktrees EROFS");
    assert.equal(result.event.attemptedCommand, "pnpm run check:static");
    assert.equal(result.event.evidenceSummary, "Sandbox blocked .git/worktrees metadata writes.");
    assert.equal(result.event.wrongRetryPattern, "retrying inside sandbox");
    assert.equal(result.event.nextSafeAction, "request outside-sandbox rerun");
    assert.equal(result.event.createdAt, "2026-06-22T12:00:00Z");
    assert.equal(result.event.wrongRetryPrevented, true);
    assert.equal(result.eventStore, join(resolve(stateRoot), "churn-events", "lane-123.jsonl"));
    assert.equal(result.globalEventStore, join(resolve(stateRoot), "churn-events", "churn-events.jsonl"));

    assert.deepEqual(readJsonl(result.eventStore), [result.event]);
    assert.deepEqual(readJsonl(result.globalEventStore), [result.event]);
  } finally {
    fixture.cleanup();
  }
});

test("CLI record-event writes the same validated event shape", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  const eventFile = join(fixture.root, "event.json");
  writeFileSync(eventFile, JSON.stringify(validEvent({ eventId: "churn-custom-safe-id-001" })));
  try {
    const output = runAntiChurnGuidanceHookCli(
      ["record-event", "--lane", "lane-123", "--event-file", eventFile],
      {
        env: {
          ...process.env,
          CODEX_WORKSPACE_ROOT: stateRoot,
        },
      },
    );
    assert.equal(output.status, "recorded");
    assert.equal(output.eventId, "churn-custom-safe-id-001");
    assert.deepEqual(readJsonl(output.eventStore).map((event) => event.eventId), ["churn-custom-safe-id-001"]);
  } finally {
    fixture.cleanup();
  }
});

test("unsafe storage fails closed without creating event files", () => {
  const fixture = createGitFixture();
  const unsafeStateRoot = join(fixture.repo, "state");
  try {
    assert.throws(
      () => recordChurnEvent(validEvent(), {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot: unsafeStateRoot,
      }),
      (error) => error instanceof ChurnEventWriterError && error.code === "UNSAFE_EVENT_STORAGE",
    );
    assert.equal(existsSync(unsafeStateRoot), false);
  } finally {
    fixture.cleanup();
  }
});

test("event validation redacts unsafe evidence and rejects oversized serialized events", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const result = recordChurnEvent(
      validEvent({
        evidenceSummary: `Provider payload contained password=hunter2 and sk-proj-${"a".repeat(48)} before retry.`,
        metadata: {
          prompt: "raw user prompt must not be retained",
          completion: "raw model completion must not be retained",
          reasoning: "hidden reasoning must not be retained",
          providerPayload: { token: "secret" },
          verification: "pnpm run check:static",
        },
      }),
      {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      },
    );

    assert.match(result.event.evidenceSummary, /\[REDACTED:UNSAFE_EVIDENCE\]/);
    assert.doesNotMatch(result.event.evidenceSummary, /Provider payload contained/i);
    assert.equal(result.event.prompt, undefined);
    assert.equal(result.event.completion, undefined);
    assert.equal(result.event.reasoning, undefined);
    assert.equal(result.event.providerPayload, undefined);
    assert.equal(result.event.verification, "pnpm run check:static");
    assert.ok(Buffer.byteLength(result.event.evidenceSummary, "utf8") <= 8192);

    const secretResult = recordChurnEvent(
      validEvent({
        signature: "secret redaction",
        evidenceSummary: `Failure included password=hunter2 and sk-proj-${"a".repeat(48)} before retry.`,
      }),
      {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      },
    );

    assert.match(secretResult.event.evidenceSummary, /\[REDACTED:PASSWORD\]/);
    assert.match(secretResult.event.evidenceSummary, /\[REDACTED:OPENAI_KEY\]/);

    assert.throws(
      () => recordChurnEvent(
        validEvent({
          signature: "oversized event",
          evidenceSummary: "x".repeat(33000),
          metadata: { sourceFile: "a".repeat(33000) },
        }),
        {
          repoRoot: fixture.repo,
          cwd: fixture.repo,
          stateRoot,
        },
      ),
      (error) => error instanceof ChurnEventWriterError && error.code === "EVENT_TOO_LARGE",
    );
  } finally {
    fixture.cleanup();
  }
});

test("stable event ids dedupe repeated writes without corrupting JSONL stores", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const first = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });
    const second = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(first.event.eventId, second.event.eventId);
    assert.equal(second.status, "duplicate");
    assert.deepEqual(second.warnings, ["duplicate-event-id"]);
    assert.equal(readJsonl(first.eventStore).length, 1);
    assert.equal(readJsonl(first.globalEventStore).length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("duplicate recovery completes a missing per-lane store without duplicating global events", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    const first = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });
    rmSync(first.eventStore);

    const second = recordChurnEvent(validEvent(), {
      repoRoot: fixture.repo,
      cwd: fixture.repo,
      stateRoot,
    });

    assert.equal(second.status, "recorded");
    assert.deepEqual(second.warnings, ["duplicate-event-id"]);
    assert.equal(readJsonl(first.globalEventStore).length, 1);
    assert.equal(readJsonl(first.eventStore).length, 1);
  } finally {
    fixture.cleanup();
  }
});

test("missing fields, invalid lane ids, unsafe event ids, and invalid timestamps fail before writes", () => {
  const fixture = createGitFixture();
  const stateRoot = join(fixture.root, "state");
  try {
    assert.throws(
      () => recordChurnEvent({ ...validEvent(), signature: "" }, {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      }),
      (error) => error instanceof ChurnEventWriterError && error.code === "MISSING_EVENT_FIELD",
    );
    assert.throws(
      () => recordChurnEvent(validEvent({ laneId: "../bad-lane" }), {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      }),
      (error) => error instanceof ChurnEventWriterError && error.code === "INVALID_LANE",
    );
    assert.throws(
      () => recordChurnEvent(validEvent({ eventId: "../bad-event" }), {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      }),
      (error) => error instanceof ChurnEventWriterError && error.code === "INVALID_EVENT_ID",
    );
    assert.throws(
      () => recordChurnEvent(validEvent({ eventId: "churn-custom-safe-id-001", createdAt: "not-a-date" }), {
        repoRoot: fixture.repo,
        cwd: fixture.repo,
        stateRoot,
      }),
      (error) => error instanceof ChurnEventWriterError && error.code === "INVALID_CREATED_AT",
    );
    assert.equal(existsSync(join(stateRoot, "churn-events")), false);
  } finally {
    fixture.cleanup();
  }
});

function validEvent(overrides = {}) {
  return {
    laneId: "lane-123",
    phase: "verification",
    failureClass: "sandbox",
    signature: ".git/worktrees EROFS",
    attemptedCommand: "pnpm run check:static",
    evidenceSummary: "Sandbox blocked .git/worktrees metadata writes.",
    wrongRetryPattern: "retrying inside sandbox",
    nextSafeAction: "request outside-sandbox rerun",
    createdAt: "2026-06-22T12:00:00Z",
    metadata: {
      wrongRetryPrevented: true,
    },
    ...overrides,
  };
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function createGitFixture() {
  const root = mkdtempSync(join(tmpdir(), "anti-churn-event-writer-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  runGit(repo, ["init", "-q"]);
  runGit(repo, ["config", "user.email", "anti-churn-test@example.com"]);
  runGit(repo, ["config", "user.name", "Anti Churn Test"]);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  runGit(repo, ["add", "README.md"]);
  runGit(repo, ["commit", "-q", "-m", "initial"]);

  return {
    root,
    repo,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
