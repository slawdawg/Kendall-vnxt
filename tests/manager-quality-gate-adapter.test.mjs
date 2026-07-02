import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdapterFailurePacket,
  buildQualityGatePreview,
  parseArgs,
  qualityGateCatalog,
  runQualityGate,
} from "../scripts/manager-quality-gate-adapter.mjs";

test("quality gate catalog exposes allowlisted local adapters only", () => {
  const catalog = qualityGateCatalog();

  assert.deepEqual(Object.keys(catalog).sort(), ["runner-assignment-status", "workspace-coordination"]);
  assert.equal(catalog["runner-assignment-status"].adapterId, "local-node-check");
  assert.equal(catalog["runner-assignment-status"].policy.mutation, "none; local quality check only");
  assert.equal(catalog["runner-assignment-status"].policy.providerUsage, "none");
  assert.equal(catalog["runner-assignment-status"].policy.workerLaunch, "none");
  assert.equal(catalog["runner-assignment-status"].command.executable, "node");
  assert.deepEqual(catalog["runner-assignment-status"].command.args, ["./scripts/check-runner-assignment-status-report.mjs"]);
  assert.deepEqual(catalog["runner-assignment-status"].evidenceRefs, [
    "quality-gate:runner-assignment-status",
    "command:node-scripts-check-runner-assignment-status-report",
  ]);
});

test("quality gate dry-run preview is metadata-only and non-mutating", () => {
  const options = parseArgs(["--gate", "runner-assignment-status", "--dry-run", "--summary-json"]);
  const packet = buildQualityGatePreview(options);

  assert.equal(packet.status, "preview");
  assert.equal(packet.mutation, "none; dry-run preview only");
  assert.equal(packet.providerUsage, "none");
  assert.equal(packet.workerLaunch, "none");
  assert.deepEqual(packet.safety, expectedSafety());
  assert.equal(packet.rawPayloadRetained, false);
  assert.deepEqual(packet.evidenceRefs, [
    "quality-gate:runner-assignment-status",
    "command:node-scripts-check-runner-assignment-status-report",
  ]);
});

test("quality gate run records passing adapter results without raw payload retention", () => {
  const packet = runQualityGate(
    { gateId: "runner-assignment-status" },
    {
      now: fixedClock(),
      startMs: 100,
      endMs: 125,
      runner: () => ({
        code: 0,
        stdout: "Runner assignment status report drift check passed.\nextra line\n",
        stderr: "",
      }),
    },
  );

  assert.equal(packet.status, "passed");
  assert.equal(packet.exitCode, 0);
  assert.equal(packet.durationMs, 25);
  assert.equal(packet.providerUsage, "none");
  assert.equal(packet.workerLaunch, "none");
  assert.deepEqual(packet.safety, expectedSafety());
  assert.equal(packet.rawPayloadRetained, false);
  assert.equal(packet.failureReason, null);
  assert.deepEqual(packet.stdoutSummary, ["Runner assignment status report drift check passed.", "extra line"]);
  assert.deepEqual(packet.stderrSummary, []);
  assert.equal(packet.nextManagerAction, "attach quality evidence to the current packet before promote or deliver");
});

test("quality gate failure blocks promote or deliver and retains compact stderr only", () => {
  const packet = runQualityGate(
    { gateId: "workspace-coordination" },
    {
      now: fixedClock(),
      runner: () => ({
        code: 1,
        stdout: "",
    stderr: "failure one\nfailure two\nfailure three\nfailure four\nfailure five\nfailure six\n",
      }),
    },
  );

  assert.equal(packet.status, "failed");
  assert.equal(packet.exitCode, 1);
  assert.equal(packet.rawPayloadRetained, false);
  assert.equal(packet.failureReason, "quality-gate-command-failed");
  assert.deepEqual(packet.stderrSummary, ["failure one", "failure two", "failure three", "failure four", "failure five"]);
  assert.equal(packet.nextManagerAction, "hold promote or deliver and create follow-up work from the failed quality gate");
});

test("quality gate output summaries are bounded by line count and line length", () => {
  const longLine = "x".repeat(450);
  const packet = runQualityGate(
    { gateId: "workspace-coordination" },
    {
      now: fixedClock(),
      runner: () => ({
        code: 1,
        stdout: "",
        stderr: [longLine, "two", "three", "four", "five", "six"].join("\n"),
      }),
    },
  );

  assert.equal(packet.stderrSummary.length, 5);
  assert.equal(packet.stderrSummary[0].length, 300);
  assert(!packet.stderrSummary.includes("six"));
});

test("quality gate fails closed when the local process boundary blocks the command", () => {
  const packet = runQualityGate(
    { gateId: "runner-assignment-status" },
    {
      now: fixedClock(),
      runner: () => ({
        code: 0,
        errorCode: "EPERM",
        stdout: "",
        stderr: "spawnSync /usr/bin/node EPERM\n",
      }),
    },
  );

  assert.equal(packet.status, "failed");
  assert.equal(packet.exitCode, 1);
  assert.equal(packet.failureReason, "local-process-boundary-blocked");
  assert.deepEqual(packet.stderrSummary, ["spawnSync /usr/bin/node EPERM"]);
});

test("quality gate timeouts and signals fail closed with explicit metadata", () => {
  const timeoutPacket = runQualityGate(
    { gateId: "runner-assignment-status" },
    {
      now: fixedClock(),
      runner: () => ({
        code: 1,
        signal: "SIGTERM",
        timedOut: true,
        stdout: "",
        stderr: "timed out\n",
      }),
    },
  );
  assert.equal(timeoutPacket.status, "failed");
  assert.equal(timeoutPacket.timedOut, true);
  assert.equal(timeoutPacket.signal, "SIGTERM");
  assert.equal(timeoutPacket.failureReason, "quality-gate-command-timeout");

  const signalPacket = runQualityGate(
    { gateId: "runner-assignment-status" },
    {
      now: fixedClock(),
      runner: () => ({
        code: 1,
        signal: "SIGINT",
        stdout: "",
        stderr: "interrupted\n",
      }),
    },
  );
  assert.equal(signalPacket.status, "failed");
  assert.equal(signalPacket.signal, "SIGINT");
  assert.equal(signalPacket.failureReason, "quality-gate-command-signaled");
});

test("unknown quality gates fail closed", () => {
  assert.throws(
    () => buildQualityGatePreview({ gateId: "provider-live-call" }),
    /Unknown quality gate: provider-live-call/,
  );
});

test("unknown quality gate summary-json emits parseable failure packet", () => {
  const packet = buildAdapterFailurePacket({
    gateId: "provider-live-call",
    message: "Unknown quality gate: provider-live-call",
  });
  assert.equal(packet.status, "failed");
  assert.equal(packet.failureReason, "unknown-quality-gate");
  assert.equal(packet.rawPayloadRetained, false);
  assert.deepEqual(packet.safety, expectedSafety());
});

function fixedClock() {
  return () => new Date("2026-07-02T00:00:00.000Z");
}

function expectedSafety() {
  return {
    workerMutation: "none",
    dispatchApply: "none",
    delivery: "none",
    cleanup: "none",
    providerUsage: "none",
    workerLaunch: "none",
    mutation: "none; local quality check only",
    rawPayloadRetained: false,
  };
}
