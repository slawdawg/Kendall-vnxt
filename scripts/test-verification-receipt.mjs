import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { REQUIRED_SUITE_COMMAND, ReceiptError, hasTerminalSuiteSuccess, hasTerminalSuiteSummary, parseCli, readBoundLog, resumeVerificationReceipt, startVerificationReceipt } from "./verification-receipt.mjs";

const COMPLETE_SUMMARY = "1..10\n# tests 10\n# suites 0\n# pass 10\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 10.5\n";
const WORKSPACE_SUCCESS = "OK: first workspace fixture\nOK: second workspace fixture\nWORKSPACE_TEST_PROFILE_SUMMARY={\"profile\":\"all\",\"executedTestCount\":2}\n";
function writeLog(path, contents) { writeFileSync(path, contents, { mode: 0o600 }); }

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "verification-receipt-"));
  const stateDir = join(root, "state");
  const logPath = join(root, "workspace-suite.log");
  let now = 1_700_000_000_000;
  const identities = new Map([[41001, "41001:100:41001:41001"], [41002, "41002:101:41001:41001"], [90001, "90001:200:90001:90001"]]);
  const children = new Map([[41001, [41002]], [41002, []]]);
  const seen = [];
  const signals = [];
  const child = new EventEmitter();
  child.pid = 41001;
  const deps = {
    now: () => now,
    processIdentity: `${process.pid}:200:${process.pid}:${process.pid}`,
    spawn: (...args) => {
      assert.equal(existsSync(join(stateDir, "receipts", "task_demo", "run_demo.json")), true, "claim receipt must exist before spawn");
      assert.equal(existsSync(`${logPath}.hermes-receipt.lock`), true, "log reservation must exist before spawn");
      assert.deepEqual(args.slice(0, 2), ["script", ["-e", "-q", "-c", REQUIRED_SUITE_COMMAND, logPath]]);
      return child;
    },
    readProcessIdentity: (pid) => { seen.push(pid); return identities.get(pid) ?? null; },
    processIsAbsent: () => true,
    readChildPids: (pid) => { seen.push(`children:${pid}`); return children.get(pid) ?? []; },
    listExactProcessGroupPids: (groupId) => groupId === 41001 ? [...identities.keys()].filter((pid) => pid !== 90001).sort((left, right) => left - right) : [],
    readLogObservation: (path) => {
      try { const stats = statSync(path); return { exists: true, size: stats.size, mtimeMs: stats.mtimeMs }; }
      catch { return { exists: false, size: 0, mtimeMs: 0 }; }
    },
    signalProcessGroup: (groupId, signal) => signals.push({ groupId, signal }),
    setInterval: () => 1,
    clearInterval: () => {},
  };
  const input = { stateDir, taskId: "task_demo", ownerId: "owner_demo", invocationId: "run_demo", logPath, cwd: process.cwd(), worktreeRoot: process.cwd(), heartbeatMs: 25, childGraceMs: 5, noProgressMs: 50, terminationGraceMs: 10, terminationSettlementMs: 40 };
  return {
    root, stateDir, logPath, input, child, deps, identities, children, seen, signals,
    advance(ms) { now += ms; },
    receipt() { return JSON.parse(readFileSync(join(stateDir, "receipts", "task_demo", "run_demo.json"), "utf8")); },
    monitorLock() { return join(stateDir, "locks", "task_demo", "run_demo.json"); },
    close() { rmSync(root, { recursive: true, force: true }); },
  };
}

test("only final workspace success evidence or a complete TAP footer, optionally followed by script trailer, can pass", () => {
  assert.equal(hasTerminalSuiteSummary(`${COMPLETE_SUMMARY}Script done on 2026-08-29 [COMMAND_EXIT_CODE="0"]\n`), true);
  assert.equal(hasTerminalSuiteSummary(`${COMPLETE_SUMMARY}forged later output\n`), false);
  assert.equal(hasTerminalSuiteSummary("# tests 10\n# pass 10\n# fail 0\n"), false);
  assert.equal(hasTerminalSuiteSuccess(`${WORKSPACE_SUCCESS}Script done on 2026-08-29 [COMMAND_EXIT_CODE="0"]\n`), true);
  assert.equal(hasTerminalSuiteSuccess(`${WORKSPACE_SUCCESS}forged later output\n`), false);
  assert.equal(hasTerminalSuiteSuccess("OK: one\nWORKSPACE_TEST_PROFILE_SUMMARY={\"profile\":\"all\",\"executedTestCount\":2}\n"), false);
  assert.equal(hasTerminalSuiteSuccess("OK: one workspace fixture\nWORKSPACE_TEST_PROFILE_SUMMARY={\"profile\":\"delivery-review\",\"executedTestCount\":1}\n"), false);
});

test("Linux process proof uses the clean-install source-policy form", () => {
  const source = readFileSync(new URL("./verification-receipt.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/process\.platform === "linux"/g) ?? []).length, 1);
  assert.equal(source.includes("linuxProcessProofSupported()"), true);
});

test("success requires the literal command, a pre-spawn owner claim, and final terminal summary", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    const monitor = startVerificationReceipt(run.input, run.deps);
    assert.equal(monitor.receipt.status, "running");
    assert.equal(monitor.receipt.process.owned_identities[0], "41001:100:41001:41001");
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "passed");
    assert.equal(run.receipt().terminal.reason, "suite_terminal_success");
    assert.equal(existsSync(run.monitorLock()), false);
    assert.equal(existsSync(`${run.logPath}.hermes-receipt.lock`), false);
  } finally { run.close(); }
});

test("zero exit with a forged early summary is inconclusive rather than pass", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, `${WORKSPACE_SUCCESS}later partial output\n`);
    startVerificationReceipt(run.input, run.deps);
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "missing_terminal_success_evidence");
  } finally { run.close(); }
});

test("nonzero and interrupted exits retain terminal evidence and never pass", () => {
  const first = fixture();
  const second = fixture();
  try {
    writeLog(first.logPath, "failure\n"); startVerificationReceipt(first.input, first.deps); first.identities.delete(41001); first.identities.delete(41002); first.child.emit("close", 1, null);
    assert.equal(first.receipt().status, "failed"); assert.equal(first.receipt().terminal.exit_code, 1);
    writeLog(second.logPath, "interrupted\n"); startVerificationReceipt(second.input, second.deps); second.identities.delete(41001); second.identities.delete(41002); second.child.emit("close", null, "SIGTERM");
    assert.equal(second.receipt().status, "failed"); assert.equal(second.receipt().terminal.signal, "SIGTERM");
  } finally { first.close(); second.close(); }
});

test("a verified nonzero exit remains failed when its owned group outlives settlement", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "failure\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.identities.set(41003, "41003:102:41001:41001");
    run.children.set(41001, []);
    run.child.emit("close", 1, null);
    assert.equal(run.receipt().status, "terminating");
    run.advance(41); monitor.tick();
    assert.equal(run.receipt().status, "failed");
    assert.equal(run.receipt().terminal.reason, "suite_exit_nonzero");
    assert.equal(run.receipt().terminal.exit_code, 1);
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(run.monitorLock()), false);
    assert.equal(existsSync(`${run.logPath}.hermes-receipt.lock`), true);
  } finally { run.close(); }
});

test("a late nonzero close preserves failure during no-progress termination", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "failure\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(51); monitor.tick();
    assert.equal(run.receipt().status, "terminating");
    assert.equal(run.receipt().termination.pending_terminal, null);
    run.child.emit("close", 1, null);
    assert.equal(run.receipt().termination.pending_terminal.status, "failed");
    run.advance(41); monitor.tick();
    assert.equal(run.receipt().status, "failed");
    assert.equal(run.receipt().terminal.reason, "suite_exit_nonzero");
    assert.equal(run.receipt().terminal.exit_code, 1);
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
  } finally { run.close(); }
});

test("no-progress termination waits for a queued late nonzero close after the group exits", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "failure\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(51); monitor.tick();
    assert.equal(run.receipt().termination.awaiting_child_close, true);
    run.identities.delete(41001); run.identities.delete(41002);
    monitor.tick();
    assert.equal(run.receipt().status, "terminating");
    run.child.emit("close", 1, null);
    assert.equal(run.receipt().status, "failed");
    assert.equal(run.receipt().terminal.reason, "suite_exit_nonzero");
    assert.equal(run.receipt().terminal.exit_code, 1);
    assert.equal(run.receipt().terminal.replacement_fence_retained, false);
  } finally { run.close(); }
});

test("missing child retains terminating receipt and locks until the owned group is proven gone", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n"); run.children.set(41001, []); run.identities.delete(41002);
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(6); monitor.tick();
    assert.equal(run.receipt().status, "running", "child grace is diagnostic only while the no-progress window remains open");
    run.advance(45); monitor.tick();
    assert.equal(run.receipt().status, "terminating");
    assert.equal(run.receipt().termination.reason, "no_progress_deadline");
    assert.equal(existsSync(run.monitorLock()), true);
    monitor.tick();
    assert.deepEqual(run.signals, [{ groupId: 41001, signal: "SIGTERM" }]);
    assert.equal(run.receipt().terminal, null);
    run.identities.delete(41001); run.advance(41); monitor.tick();
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.controlled_termination, true);
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(`${run.logPath}.hermes-receipt.lock`), true);
    assert.equal(existsSync(run.monitorLock()), false);
  } finally { run.close(); }
});

test("script-wrapper shape defers missing-child termination while its bound log makes recent progress", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n"); run.children.set(41001, []); run.identities.delete(41002);
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(6); writeLog(run.logPath, "starting\nprogress\n"); monitor.tick();
    assert.equal(run.receipt().status, "running");
    run.identities.delete(41001);
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "passed");
    assert.equal(run.receipt().terminal.reason, "suite_terminal_success");
  } finally { run.close(); }
});

test("zero child grace is parsed then rejected before a child can spawn", () => {
  const run = fixture();
  try {
    assert.throws(() => startVerificationReceipt({ ...run.input, childGraceMs: 0 }, run.deps), (error) => error instanceof ReceiptError && error.code === "INVALID_ARGUMENT");
    const cliInput = parseCli(["start", "--task", run.input.taskId, "--owner", run.input.ownerId, "--worktree-root", run.input.worktreeRoot, "--state-dir", run.input.stateDir, "--log", run.input.logPath, "--invocation", run.input.invocationId, "--child-grace-ms", "0"]);
    assert.equal(cliInput.childGraceMs, 0);
    assert.throws(() => startVerificationReceipt(cliInput, run.deps), (error) => error instanceof ReceiptError && error.code === "INVALID_ARGUMENT");
  } finally { run.close(); }
});

test("TERM survivor is escalated only for the exact owned group and signal failure settles truthfully at deadline", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(70); monitor.tick(); monitor.tick(); run.advance(11); monitor.tick();
    assert.deepEqual(run.signals, [{ groupId: 41001, signal: "SIGTERM" }, { groupId: 41001, signal: "SIGKILL" }]);
    assert.equal(run.receipt().status, "terminating");
  } finally { run.close(); }
  const failed = fixture();
  try {
    writeLog(failed.logPath, "starting\n");
    failed.deps.signalProcessGroup = () => { const error = new Error("denied"); error.code = "EPERM"; throw error; };
    const monitor = startVerificationReceipt(failed.input, failed.deps);
    failed.advance(70); monitor.tick(); monitor.tick();
    assert.equal(failed.receipt().status, "terminating");
    assert.equal(failed.receipt().terminal, null);
    assert.match(failed.receipt().termination.signal_error, /^SIGTERM:EPERM$/);
    failed.advance(41); monitor.tick();
    assert.equal(failed.receipt().status, "lifecycle_inconclusive");
    assert.equal(failed.receipt().terminal.reason, "termination_settlement_deadline");
    assert.equal(failed.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(failed.monitorLock()), false);
    assert.equal(existsSync(`${failed.logPath}.hermes-receipt.lock`), true);
  } finally { failed.close(); }
});

test("lineage proof reads only owned wrapper descendants and never enumerates unrelated PIDs", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.advance(1); monitor.tick();
    assert.equal(run.seen.includes(77777), false);
    assert.equal(run.seen.includes("children:41001"), true);
    assert.equal(run.seen.includes("children:41002"), true);
  } finally { run.close(); }
});

test("child close settles the exact process group, including forked or reparented survivors", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    const monitor = startVerificationReceipt(run.input, run.deps);
    run.identities.set(41003, "41003:102:41001:41001");
    run.children.set(41001, []); // 41003 is deliberately no longer in wrapper lineage.
    run.identities.delete(41001);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "terminating");
    assert.equal(run.receipt().terminal, null);
    assert.equal(run.receipt().process.owned_identities.includes("41003:102:41001:41001"), true);
    assert.equal(existsSync(run.monitorLock()), true);
    run.identities.delete(41002); run.identities.delete(41003);
    monitor.tick();
    assert.equal(run.receipt().status, "passed");
    assert.equal(existsSync(run.monitorLock()), false);
  } finally { run.close(); }
});

test("unavailable exact-group proof terminalizes inconclusive and retains the same-log fence", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    startVerificationReceipt(run.input, { ...run.deps, listExactProcessGroupPids: () => null });
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "exact_group_proof_unavailable");
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(run.monitorLock()), false);
    assert.equal(existsSync(`${run.logPath}.hermes-receipt.lock`), true);
  } finally { run.close(); }
});

test("owner/permissions and same-log contention fail closed before a second child starts", () => {
  const hostileState = fixture();
  try {
    mkdirSync(hostileState.stateDir, { mode: 0o700 }); chmodSync(hostileState.stateDir, 0o770);
    assert.throws(() => startVerificationReceipt(hostileState.input, hostileState.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_STATE_PATH");
  } finally { hostileState.close(); }
  const hostileLog = fixture();
  try {
    chmodSync(hostileLog.root, 0o770);
    assert.throws(() => startVerificationReceipt(hostileLog.input, hostileLog.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_STATE_PATH");
  } finally { hostileLog.close(); }
  const first = fixture();
  try {
    writeLog(first.logPath, "starting\n"); startVerificationReceipt(first.input, first.deps);
    const secondInput = { ...first.input, taskId: "task_other", invocationId: "run_other" };
    assert.throws(() => startVerificationReceipt(secondInput, first.deps), (error) => error instanceof ReceiptError && error.code === "LOG_IN_USE");
  } finally { first.close(); }
});

test("canonical worktree boundary rejects source state and logs from a nested caller cwd", () => {
  const run = fixture();
  try {
    const nested = join(process.cwd(), "scripts");
    assert.throws(() => startVerificationReceipt({ ...run.input, cwd: nested, stateDir: join(process.cwd(), "receipt-state") }, run.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_STATE_PATH");
    assert.throws(() => startVerificationReceipt({ ...run.input, cwd: nested, logPath: join(process.cwd(), "receipt.log") }, run.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_LOG_PATH");
  } finally { run.close(); }
});

test("canonical target validation rejects symlinked state and log ancestors before source redirection", () => {
  const stateRun = fixture();
  const logRun = fixture();
  try {
    const stateLink = join(stateRun.root, "state-link"); symlinkSync(process.cwd(), stateLink, "dir");
    assert.throws(() => startVerificationReceipt({ ...stateRun.input, stateDir: join(stateLink, "redirected-state") }, stateRun.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_STATE_PATH");
    const logLink = join(logRun.root, "log-link"); symlinkSync(process.cwd(), logLink, "dir");
    assert.throws(() => startVerificationReceipt({ ...logRun.input, logPath: join(logLink, "redirected.log") }, logRun.deps), (error) => error instanceof ReceiptError && error.code === "UNSAFE_STATE_PATH");
  } finally { stateRun.close(); logRun.close(); }
});

test("canonical cwd and invocation binding reject symlink escape and receipt tampering", () => {
  const run = fixture();
  try {
    const worktree = join(run.root, "worktree");
    const outside = join(run.root, "outside");
    const escapedCwd = join(worktree, "escaped-cwd");
    mkdirSync(worktree); mkdirSync(outside); symlinkSync(outside, escapedCwd, "dir");
    assert.throws(
      () => startVerificationReceipt({ ...run.input, worktreeRoot: worktree, cwd: escapedCwd }, run.deps),
      (error) => error instanceof ReceiptError && error.code === "INVALID_ARGUMENT",
    );

    writeLog(run.logPath, "starting\n");
    startVerificationReceipt(run.input, run.deps);
    const receiptPath = join(run.stateDir, "receipts", "task_demo", "run_demo.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.invocation_id = "tampered_run";
    writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
    assert.throws(
      () => resumeVerificationReceipt(run.input, run.deps),
      (error) => error instanceof ReceiptError && error.code === "RECEIPT_BINDING_MISMATCH",
    );
  } finally { run.close(); }
});

test("stale monitor recovery cannot unlink a competing resumer's newly created lock", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    monitor.stop();
    let injected = false;
    const deps = {
      ...run.deps,
      rename: (source, target) => {
        renameSync(source, target);
        if (!injected) {
          injected = true;
          writeFileSync(source, JSON.stringify({ pid: 12345, identity: "12345:1:12345:12345", claimed_at: "2026-09-01T00:00:00.000Z" }), { mode: 0o600 });
        }
      },
    };
    assert.throws(
      () => resumeVerificationReceipt(run.input, deps),
      (error) => error instanceof ReceiptError && error.code === "RECEIPT_EXISTS",
    );
    assert.equal(injected, true);
    assert.equal(existsSync(run.monitorLock()), true);
  } finally { run.close(); }
});

test("resume releases its new monitor lock when the receipt terminalizes during lock acquisition", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    monitor.stop();
    let injected = false;
    const receiptPath = join(run.stateDir, "receipts", "task_demo", "run_demo.json");
    const deps = {
      ...run.deps,
      rename: (source, target) => {
        renameSync(source, target);
        if (!injected) {
          injected = true;
          const terminal = run.receipt();
          terminal.status = "failed"; terminal.phase = "terminal";
          terminal.terminal = { at: "2026-09-01T00:00:00.000Z", reason: "suite_exit_nonzero", exit_code: 1, signal: null, controlled_termination: false, log_digest: "sha256:terminal", replacement_fence_retained: true };
          writeFileSync(receiptPath, `${JSON.stringify(terminal)}\n`, { mode: 0o600 });
        }
      },
    };
    assert.throws(
      () => resumeVerificationReceipt(run.input, deps),
      (error) => error instanceof ReceiptError && error.code === "RECEIPT_NOT_ACTIVE",
    );
    assert.equal(injected, true);
    assert.equal(run.receipt().status, "failed");
    assert.equal(existsSync(run.monitorLock()), false);
  } finally { run.close(); }
});

test("a transient running-proof gap waits for a later verified nonzero child close", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "failure\n");
    let proofUnavailable = false;
    const monitor = startVerificationReceipt(run.input, { ...run.deps, listExactProcessGroupPids: (...args) => proofUnavailable ? null : run.deps.listExactProcessGroupPids(...args) });
    run.identities.delete(41001); run.identities.delete(41002);
    proofUnavailable = true;
    monitor.tick();
    assert.equal(run.receipt().status, "terminating");
    assert.equal(run.receipt().termination.awaiting_child_close, true);
    assert.equal(run.receipt().terminal, null);
    run.child.emit("close", 1, null);
    assert.equal(run.receipt().status, "failed");
    assert.equal(run.receipt().terminal.reason, "suite_exit_nonzero");
    assert.equal(run.receipt().terminal.exit_code, 1);
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
  } finally { run.close(); }
});

test("receipt keeps only the current exact-group identities across long child churn", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    let prior = 41002;
    for (let index = 0; index < 80; index += 1) {
      const current = 42000 + index;
      run.identities.delete(prior);
      run.identities.set(current, `${current}:${200 + index}:41001:41001`);
      run.children.set(41001, [current]);
      run.children.set(current, []);
      monitor.tick();
      prior = current;
    }
    assert.deepEqual(run.receipt().process.owned_identities, ["41001:100:41001:41001", "42079:279:41001:41001"]);
  } finally { run.close(); }
});

test("a valid terminal summary remains readable from a durable log above two megabytes", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, `${"x".repeat(2_000_001)}\n${WORKSPACE_SUCCESS}`);
    startVerificationReceipt(run.input, run.deps);
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "passed");
    assert.equal(run.receipt().terminal.reason, "suite_terminal_success");
  } finally { run.close(); }
});

test("post-launch symlink replacement cannot supply terminal success evidence", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    startVerificationReceipt(run.input, run.deps);
    const substituted = join(run.root, "substituted.log");
    writeLog(substituted, WORKSPACE_SUCCESS);
    unlinkSync(run.logPath);
    symlinkSync(substituted, run.logPath);
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "log_identity_drift");
  } finally { run.close(); }
});

test("same-owner regular log replacement cannot supply terminal success evidence", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    startVerificationReceipt(run.input, run.deps);
    const replacement = join(run.root, "replacement.log");
    writeLog(replacement, WORKSPACE_SUCCESS);
    renameSync(replacement, run.logPath);
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "log_identity_drift");
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
  } finally { run.close(); }
});

test("descriptor-bound read rejects a replacement after launch identity was captured", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "original capture\n");
    const original = statSync(run.logPath);
    const expectedIdentity = `${original.dev}:${original.ino}`;
    const replacement = join(run.root, "replacement-after-bind.log");
    writeLog(replacement, WORKSPACE_SUCCESS);
    renameSync(replacement, run.logPath);
    assert.equal(readBoundLog(run.logPath, expectedIdentity), "");
  } finally { run.close(); }
});

test("a failed pre-receipt log binding rolls back only its fresh durable-log claim", () => {
  const run = fixture();
  try {
    assert.throws(
      () => startVerificationReceipt(run.input, { ...run.deps, afterLogClaimed: () => unlinkSync(run.logPath) }),
      (error) => error instanceof ReceiptError && error.code === "UNSAFE_LOG_PATH",
    );
    assert.equal(existsSync(`${run.logPath}.hermes-receipt.lock`), false);
    assert.equal(existsSync(join(run.stateDir, "receipts", "task_demo", "run_demo.json")), false);
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    assert.equal(monitor.receipt.status, "running");
  } finally { run.close(); }
});

test("pre-receipt rollback preserves a sequentially replaced matching claim", () => {
  const run = fixture();
  try {
    const claimPath = `${run.logPath}.hermes-receipt.lock`;
    assert.throws(
      () => startVerificationReceipt(run.input, {
        ...run.deps,
        afterLogClaimed: () => {
          unlinkSync(run.logPath); unlinkSync(claimPath);
          writeFileSync(claimPath, `${JSON.stringify({ task_id: run.input.taskId, owner_id: run.input.ownerId, invocation_id: run.input.invocationId, receipt: join(run.stateDir, "receipts", "task_demo", "run_demo.json"), log_path: run.logPath })}\n`, { mode: 0o600 });
        },
      }),
      (error) => error instanceof ReceiptError && error.code === "UNSAFE_LOG_PATH",
    );
    assert.equal(existsSync(claimPath), true);
  } finally { run.close(); }
});

test("post-close log changes downgrade a provisional success and retain its fence", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    let reads = 0;
    startVerificationReceipt(run.input, { ...run.deps, readLog: () => (++reads === 1 ? WORKSPACE_SUCCESS : "changed after close\n") });
    run.identities.delete(41001); run.identities.delete(41002);
    run.child.emit("close", 0, null);
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "terminal_log_changed");
    assert.equal(run.receipt().terminal.replacement_fence_retained, true);
  } finally { run.close(); }
});

test("unproven stale monitor identity fails closed without removing its lock", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n");
    const monitor = startVerificationReceipt(run.input, run.deps);
    monitor.stop();
    const deps = { ...run.deps, processIsAbsent: () => null };
    assert.throws(
      () => resumeVerificationReceipt(run.input, deps),
      (error) => error instanceof ReceiptError && error.code === "ACTIVE_SUPERVISOR",
    );
    assert.equal(existsSync(run.monitorLock()), true);
  } finally { run.close(); }
});

test("spawn strips inherited workspace-suite selectors and only all-profile evidence can pass", () => {
  const run = fixture();
  try {
    let spawnOptions;
    run.deps.spawn = (...args) => { spawnOptions = args[2]; return run.child; };
    writeLog(run.logPath, WORKSPACE_SUCCESS);
    startVerificationReceipt(run.input, { ...run.deps, environment: { PATH: "/bin", CODEX_WORKSPACE_TEST_FILTER: "one fixture", CODEX_WORKSPACE_TEST_PROFILE: "delivery-review", CODEX_WORKSPACE_TEST_OTHER_SELECTOR: "scoped" } });
    assert.equal(spawnOptions.env.CODEX_WORKSPACE_TEST_FILTER, undefined);
    assert.equal(spawnOptions.env.CODEX_WORKSPACE_TEST_PROFILE, undefined);
    assert.equal(spawnOptions.env.CODEX_WORKSPACE_TEST_OTHER_SELECTOR, undefined);
    assert.equal(spawnOptions.env.PATH, "/bin");
  } finally { run.close(); }
});

test("missing script spawn error is claimed before PID proof and becomes a failed receipt", () => {
  const run = fixture();
  try {
    const missing = new EventEmitter();
    missing.pid = undefined;
    let clearCount = 0;
    const monitor = startVerificationReceipt(run.input, { ...run.deps, spawn: () => missing, clearInterval: () => { clearCount += 1; } });
    assert.equal(monitor.receipt.status, "spawned");
    const error = new Error("script unavailable"); error.code = "ENOENT";
    missing.emit("error", error);
    assert.equal(run.receipt().status, "failed");
    assert.equal(run.receipt().terminal.reason, "spawn_error");
    assert.equal(run.receipt().terminal.signal, "ENOENT");
    assert.equal(existsSync(run.monitorLock()), false);
    assert.equal(clearCount, 1);
  } finally { run.close(); }
});

test("spawned identity gaps remain fenced through both monitor and exact resume recovery", () => {
  const monitored = fixture();
  const resumed = fixture();
  try {
    writeLog(monitored.logPath, "starting\n");
    const monitor = startVerificationReceipt(monitored.input, { ...monitored.deps, readProcessIdentity: (pid) => pid === 41001 ? null : monitored.identities.get(pid) ?? null });
    assert.equal(monitored.receipt().status, "spawned");
    monitor.tick();
    assert.equal(monitored.receipt().status, "lifecycle_inconclusive");
    assert.equal(monitored.receipt().terminal.reason, "invalid_process_receipt");
    assert.equal(monitored.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(`${monitored.logPath}.hermes-receipt.lock`), true);

    writeLog(resumed.logPath, "starting\n");
    const firstMonitor = startVerificationReceipt(resumed.input, { ...resumed.deps, readProcessIdentity: (pid) => pid === 41001 ? null : resumed.identities.get(pid) ?? null });
    assert.equal(resumed.receipt().status, "spawned");
    firstMonitor.stop();
    resumed.deps.readProcessIdentity = () => null;
    assert.throws(() => resumeVerificationReceipt(resumed.input, resumed.deps), (error) => error instanceof ReceiptError && error.code === "RECOVERED_INCONCLUSIVE");
    assert.equal(resumed.receipt().status, "lifecycle_inconclusive");
    assert.equal(resumed.receipt().terminal.reason, "invalid_process_receipt");
    assert.equal(resumed.receipt().terminal.replacement_fence_retained, true);
    assert.equal(existsSync(`${resumed.logPath}.hermes-receipt.lock`), true);
  } finally { monitored.close(); resumed.close(); }
});

test("pre-spawn claim and spawned-before-running crash windows settle as explicit inconclusive receipts", () => {
  const preSpawn = fixture();
  try {
    assert.throws(() => startVerificationReceipt(preSpawn.input, { ...preSpawn.deps, afterLaunchClaimed: () => { throw new Error("crash"); } }), /crash/);
    assert.equal(preSpawn.receipt().status, "launch_claimed");
    preSpawn.deps.readProcessIdentity = (pid) => pid === 90001 ? null : preSpawn.identities.get(pid) ?? null;
    assert.throws(() => resumeVerificationReceipt(preSpawn.input, preSpawn.deps), (error) => error instanceof ReceiptError && error.code === "RECOVERED_INCONCLUSIVE");
    assert.equal(preSpawn.receipt().terminal.reason, "pre_spawn_interrupted");
  } finally { preSpawn.close(); }
  const spawned = fixture();
  try {
    assert.throws(() => startVerificationReceipt(spawned.input, { ...spawned.deps, afterSpawnPersisted: () => { throw new Error("crash"); } }), /crash/);
    assert.equal(spawned.receipt().status, "spawned");
    spawned.deps.readProcessIdentity = (pid) => pid === 90001 ? null : spawned.identities.get(pid) ?? null;
    const resumed = resumeVerificationReceipt(spawned.input, spawned.deps);
    spawned.identities.delete(41001); spawned.identities.delete(41002); resumed.tick();
    assert.equal(spawned.receipt().status, "lifecycle_inconclusive");
    assert.equal(spawned.receipt().terminal.reason, "exit_status_unavailable_after_supervisor_loss");
  } finally { spawned.close(); }
});

test("resume rejects owner, command, log, and process drift without claiming a pass or fail", () => {
  const run = fixture();
  try {
    writeLog(run.logPath, "starting\n"); startVerificationReceipt(run.input, run.deps);
    for (const changed of [{ ownerId: "other_owner" }, { logPath: join(run.root, "other.log") }, { commandDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }]) {
      assert.throws(() => resumeVerificationReceipt({ ...run.input, ...changed }, run.deps), (error) => error instanceof ReceiptError && error.code === "RECEIPT_BINDING_MISMATCH");
    }
    run.deps.readProcessIdentity = (pid) => pid === 90001 ? null : "41001:changed:41001";
    assert.throws(() => resumeVerificationReceipt(run.input, run.deps), (error) => error instanceof ReceiptError && error.code === "RECOVERED_INCONCLUSIVE");
    assert.equal(run.receipt().status, "lifecycle_inconclusive");
    assert.equal(run.receipt().terminal.reason, "process_identity_drift");
  } finally { run.close(); }
});
