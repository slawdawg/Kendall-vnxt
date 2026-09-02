#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync, spawn as spawnChild } from "node:child_process";

export const RECEIPT_SCHEMA = "hermes-verification-receipt/v2";
export const REQUIRED_SUITE_COMMAND = "pnpm run test:codex-workspace";
export const REQUIRED_SCRIPT_ARGUMENTS = ["-e", "-q", "-c", REQUIRED_SUITE_COMMAND];
const TERMINAL_STATUSES = new Set(["passed", "failed", "lifecycle_inconclusive"]);
const ACTIVE_STATUSES = new Set(["launch_claimed", "spawned", "running", "terminating"]);

export class ReceiptError extends Error {
  constructor(code, message) { super(message); this.name = "ReceiptError"; this.code = code; }
}

function digest(value) { return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`; }
function nowIso(now) { return new Date(now).toISOString(); }
function safeId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)) throw new ReceiptError("INVALID_ARGUMENT", `${label} is invalid.`);
  return value;
}
function safeAbsolutePath(value, label) {
  if (typeof value !== "string" || !isAbsolute(value)) throw new ReceiptError("INVALID_ARGUMENT", `${label} must be an absolute path.`);
  const path = resolve(value);
  if (path.length > 4_096) throw new ReceiptError("INVALID_ARGUMENT", `${label} is too long.`);
  return path;
}
function isWithin(parent, child) { const relation = relative(parent, child); return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation)); }
function canonicalTarget(path, label) {
  const lexical = resolve(path); const missing = []; let probe = lexical;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) throw new ReceiptError("UNSAFE_STATE_PATH", `${label} has no existing parent.`);
    missing.unshift(basename(probe)); probe = parent;
  }
  const ancestors = [];
  for (let current = probe; ; current = dirname(current)) { ancestors.push(current); if (current === dirname(current)) break; }
  for (const ancestor of ancestors.reverse()) {
    const stats = lstatSync(ancestor);
    if (stats.isSymbolicLink()) throw new ReceiptError("UNSAFE_STATE_PATH", `${label} cannot traverse a symlinked ancestor.`);
    realpathSync(ancestor);
  }
  let canonicalParent;
  try { canonicalParent = realpathSync(probe); } catch { throw new ReceiptError("UNSAFE_STATE_PATH", `${label} cannot resolve its existing parent.`); }
  return missing.length === 0 ? canonicalParent : resolve(canonicalParent, ...missing);
}
function expectedUid() {
  if (typeof process.getuid !== "function") throw new ReceiptError("UNSUPPORTED_PROCESS_PROOF", "Receipt state requires a POSIX effective-owner proof.");
  return process.getuid();
}
function linuxProcessProofSupported() { return process.platform === "linux"; }
function assertOwnedPrivate(path, label, { directory = true } = {}) {
  const stats = lstatSync(path);
  if ((directory && !stats.isDirectory()) || (!directory && !stats.isFile()) || stats.isSymbolicLink() || stats.uid !== expectedUid() || (stats.mode & 0o022) !== 0) {
    throw new ReceiptError("UNSAFE_STATE_PATH", `${label} must be owned by the effective user and not group/other writable.`);
  }
  return stats;
}
function assertPrivateDirectory(path, label = "Receipt state directory") {
  if (!existsSync(path)) {
    const parent = dirname(path);
    if (!existsSync(parent)) assertPrivateDirectory(parent, `${label} parent`);
    assertOwnedPrivate(parent, `${label} parent`);
    mkdirSync(path, { mode: 0o700 });
  }
  return assertOwnedPrivate(path, label);
}
function assertSafeLogPath(path) {
  const parent = dirname(path);
  assertOwnedPrivate(parent, "Durable log parent");
  if (existsSync(path)) assertOwnedPrivate(path, "Durable log", { directory: false });
}
function ensurePrivateLog(path) {
  if (!existsSync(path)) writeFileSync(path, "", { encoding: "utf8", mode: 0o600, flag: "wx" });
  assertSafeLogPath(path);
}
function receiptPath(input) { return join(input.stateDir, "receipts", input.taskId, `${input.invocationId}.json`); }
function monitorLockPath(input) { return join(input.stateDir, "locks", input.taskId, `${input.invocationId}.json`); }
function logLockPath(input) { return `${input.logPath}.hermes-receipt.lock`; }
function writeAtomic(path, value) {
  assertPrivateDirectory(dirname(path), "Receipt record parent");
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    assertOwnedPrivate(path, "Receipt record", { directory: false });
  } catch (error) { try { rmSync(temporary, { force: true }); } catch {} throw error; }
}
function createExclusive(path, value, code = "RECEIPT_EXISTS") {
  assertPrivateDirectory(dirname(path), "Receipt lock parent");
  try {
    writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    assertOwnedPrivate(path, "Receipt lock", { directory: false });
  } catch (error) { if (error?.code === "EEXIST") throw new ReceiptError(code, "An equivalent durable receipt lock already exists."); throw error; }
}
function readJson(path, code, message) {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.uid !== expectedUid() || (stats.mode & 0o022) !== 0 || stats.size < 2 || stats.size > 32_768) throw new Error("unsafe");
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) { if (error instanceof ReceiptError) throw error; throw new ReceiptError(code, message); }
}
function defaultReadProcessIdentity(pid) {
  if (!Number.isInteger(pid) || pid < 1 || !linuxProcessProofSupported()) return null;
  try {
    const source = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
    const closing = source.lastIndexOf(")");
    const fields = closing < 0 ? [] : source.slice(closing + 2).trim().split(/\s+/);
    const groupId = Number(fields[2]); const sessionId = Number(fields[3]); const startTicks = fields[19];
    return Number.isInteger(groupId) && groupId > 0 && Number.isInteger(sessionId) && sessionId > 0 && /^\d+$/.test(startTicks || "") ? `${pid}:${startTicks}:${groupId}:${sessionId}` : null;
  } catch { return null; }
}
function defaultProcessIsAbsent(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); return false; }
  catch (error) { return error?.code === "ESRCH" ? true : null; }
}
function defaultReadChildPids(pid) {
  if (!Number.isInteger(pid) || pid < 1 || !linuxProcessProofSupported()) return [];
  try {
    const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    return raw === "" ? [] : raw.split(/\s+/).map(Number).filter((value) => Number.isInteger(value) && value > 0).sort((left, right) => left - right);
  } catch { return []; }
}
function defaultListExactProcessGroupPids(groupId) {
  if (!Number.isInteger(groupId) || groupId < 1 || !linuxProcessProofSupported()) return null;
  try {
    const stdout = execFileSync("pgrep", ["-g", String(groupId)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return stdout.trim() === "" ? [] : stdout.trim().split(/\s+/).map(Number).filter((pid) => Number.isInteger(pid) && pid > 0).sort((left, right) => left - right);
  } catch (error) {
    return error?.status === 1 ? [] : null;
  }
}
function identityParts(identity) {
  const match = /^(\d+):(\d+):(\d+):(\d+)$/.exec(identity || "");
  return match ? { pid: Number(match[1]), startTicks: match[2], groupId: Number(match[3]), sessionId: Number(match[4]) } : null;
}
function privateRegularFileStats(path) {
  const stats = lstatSync(path);
  return stats.isFile() && !stats.isSymbolicLink() && stats.uid === expectedUid() && (stats.mode & 0o022) === 0 ? stats : null;
}
function logIdentity(stats) { return stats ? `${stats.dev}:${stats.ino}` : null; }
function matchesLogIdentity(path, expected) {
  try { return logIdentity(privateRegularFileStats(path)) === expected; }
  catch { return false; }
}
function defaultReadLogObservation(logPath) {
  try { const stats = privateRegularFileStats(logPath); return stats ? { exists: true, size: stats.size, mtimeMs: stats.mtimeMs } : { exists: false, size: 0, mtimeMs: 0 }; }
  catch { return { exists: false, size: 0, mtimeMs: 0 }; }
}
export function readBoundLog(logPath, expectedIdentity = null) {
  try {
    const stats = privateRegularFileStats(logPath);
    if (!stats || (expectedIdentity && logIdentity(stats) !== expectedIdentity)) return "";
    const descriptor = openSync(logPath, "r");
    try {
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || opened.uid !== stats.uid || (opened.mode & 0o022) !== 0 || opened.dev !== stats.dev || opened.ino !== stats.ino || (expectedIdentity && logIdentity(opened) !== expectedIdentity)) return "";
      const tailBytes = opened.size <= 2_000_000 ? opened.size : Math.min(opened.size, 524_288);
      const tail = Buffer.alloc(tailBytes);
      readSync(descriptor, tail, 0, tailBytes, opened.size - tailBytes);
      return tail.toString("utf8");
    } finally { closeSync(descriptor); }
  }
  catch { return ""; }
}
function dependencies(overrides = {}) {
  return { now: () => Date.now(), spawn: spawnChild, environment: process.env, readProcessIdentity: defaultReadProcessIdentity, processIsAbsent: defaultProcessIsAbsent, readChildPids: defaultReadChildPids, listExactProcessGroupPids: defaultListExactProcessGroupPids, readLogObservation: defaultReadLogObservation, readLog: readBoundLog, link: linkSync, unlink: unlinkSync, rename: renameSync, signalProcessGroup: (groupId, signal) => process.kill(-groupId, signal), setInterval, clearInterval, processIdentity: defaultReadProcessIdentity(process.pid), ...overrides };
}
function requiredCommandDigest() { return digest({ program: "script", arguments: REQUIRED_SCRIPT_ARGUMENTS }); }
function sanitizedSuiteEnvironment(environment = {}) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("CODEX_WORKSPACE_TEST_")));
}
function validateInput(input = {}) {
  const stateTarget = safeAbsolutePath(input.stateDir, "stateDir"); const logTarget = safeAbsolutePath(input.logPath, "logPath"); const cwdTarget = safeAbsolutePath(input.cwd || process.cwd(), "cwd");
  if (!input.worktreeRoot) throw new ReceiptError("INVALID_ARGUMENT", "worktreeRoot is required for a canonical source boundary.");
  let worktreeRoot;
  try { worktreeRoot = realpathSync(safeAbsolutePath(input.worktreeRoot, "worktreeRoot")); } catch { throw new ReceiptError("INVALID_ARGUMENT", "worktreeRoot must resolve to an existing canonical directory."); }
  if (!lstatSync(worktreeRoot).isDirectory()) throw new ReceiptError("INVALID_ARGUMENT", "worktreeRoot must be a directory.");
  let cwd;
  try { cwd = realpathSync(cwdTarget); } catch { throw new ReceiptError("INVALID_ARGUMENT", "cwd must resolve to an existing canonical directory."); }
  if (!lstatSync(cwd).isDirectory()) throw new ReceiptError("INVALID_ARGUMENT", "cwd must be a directory.");
  if (!isWithin(worktreeRoot, cwd)) throw new ReceiptError("INVALID_ARGUMENT", "cwd must remain inside canonical worktreeRoot.");
  const stateDir = canonicalTarget(stateTarget, "Receipt state"); const logPath = canonicalTarget(logTarget, "Durable log");
  if (isWithin(worktreeRoot, stateDir)) throw new ReceiptError("UNSAFE_STATE_PATH", "Receipt state must be outside the canonical source worktree.");
  if (isWithin(worktreeRoot, logPath) || isWithin(stateDir, logPath)) throw new ReceiptError("UNSAFE_LOG_PATH", "The durable log must stay outside source and receipt state.");
  const heartbeatMs = input.heartbeatMs ?? 5_000; const childGraceMs = input.childGraceMs ?? 30_000; const noProgressMs = input.noProgressMs ?? 240_000; const terminationGraceMs = input.terminationGraceMs ?? 15_000;
  for (const [label, value, min, max] of [["heartbeatMs", heartbeatMs, 10, 60_000], ["childGraceMs", childGraceMs, 1, 300_000], ["noProgressMs", noProgressMs, 10, 3_600_000], ["terminationGraceMs", terminationGraceMs, 10, 300_000]]) if (!Number.isInteger(value) || value < min || value > max) throw new ReceiptError("INVALID_ARGUMENT", `${label} is outside the bounded receipt contract.`);
  const terminationSettlementMs = input.terminationSettlementMs ?? 60_000;
  if (!Number.isInteger(terminationSettlementMs) || terminationSettlementMs < terminationGraceMs || terminationSettlementMs > 900_000) throw new ReceiptError("INVALID_ARGUMENT", "terminationSettlementMs is outside the bounded receipt contract.");
  return { stateDir, logPath, cwd, worktreeRoot, taskId: safeId(input.taskId, "taskId"), ownerId: safeId(input.ownerId, "ownerId"), invocationId: safeId(input.invocationId || `run_${randomUUID().replaceAll("-", "")}`, "invocationId"), heartbeatMs, childGraceMs, noProgressMs, terminationGraceMs, terminationSettlementMs, commandDigest: input.commandDigest ?? requiredCommandDigest() };
}
function initialReceipt(input, deps) {
  const now = nowIso(deps.now());
  let identity;
  try { identity = logIdentity(privateRegularFileStats(input.logPath)); }
  catch { throw new ReceiptError("UNSAFE_LOG_PATH", "Durable log identity cannot be bound."); }
  if (!identity) throw new ReceiptError("UNSAFE_LOG_PATH", "Durable log identity cannot be bound.");
  return { schema_version: RECEIPT_SCHEMA, status: "launch_claimed", phase: "launch_claimed", task_id: input.taskId, owner_id: input.ownerId, invocation_id: input.invocationId, command: { program: "script", arguments: REQUIRED_SCRIPT_ARGUMENTS, digest: requiredCommandDigest() }, command_digest: requiredCommandDigest(), log_path: input.logPath, log_identity: identity, cwd: input.cwd, worktree_root: input.worktreeRoot, started_at: now, heartbeat_at: now, last_progress_at: now, process: null, supervisor: { pid: process.pid, identity: deps.processIdentity }, launch: { claimed_at: now, spawn_attempted_at: null, spawned_at: null }, termination: null, terminal: null };
}
function assertReceipt(receipt) {
  if (!receipt || receipt.schema_version !== RECEIPT_SCHEMA || (!ACTIVE_STATUSES.has(receipt.status) && !TERMINAL_STATUSES.has(receipt.status)) || typeof receipt.task_id !== "string" || typeof receipt.owner_id !== "string" || typeof receipt.invocation_id !== "string" || !/^\d+:\d+$/.test(receipt.log_identity || "") || receipt.command_digest !== requiredCommandDigest() || receipt.command?.digest !== requiredCommandDigest() || receipt.command?.program !== "script" || JSON.stringify(receipt.command.arguments) !== JSON.stringify(REQUIRED_SCRIPT_ARGUMENTS) || !isAbsolute(receipt.log_path) || !isAbsolute(receipt.cwd) || !isAbsolute(receipt.worktree_root)) throw new ReceiptError("INVALID_RECEIPT", "Receipt is malformed or does not bind the required suite command.");
  return receipt;
}
function persistReceipt(input, receipt) { writeAtomic(receiptPath(input), receipt); return receipt; }
function loadReceipt(input) {
  const receipt = assertReceipt(readJson(receiptPath(input), "RECEIPT_NOT_FOUND", "The requested receipt is unavailable."));
  if (receipt.task_id !== input.taskId || receipt.owner_id !== input.ownerId || receipt.invocation_id !== input.invocationId || receipt.log_path !== input.logPath || receipt.worktree_root !== input.worktreeRoot || input.commandDigest !== requiredCommandDigest()) throw new ReceiptError("RECEIPT_BINDING_MISMATCH", "Receipt task, owner, invocation, worktree, command, or log binding changed.");
  return receipt;
}
function lockBinding(input) { return { task_id: input.taskId, owner_id: input.ownerId, invocation_id: input.invocationId, receipt: receiptPath(input), log_path: input.logPath }; }
function claimLog(input) {
  try {
    createExclusive(logLockPath(input), lockBinding(input), "LOG_IN_USE");
    const identity = logIdentity(privateRegularFileStats(logLockPath(input)));
    if (!identity) throw new ReceiptError("UNSAFE_LOG_PATH", "Durable log claim cannot be bound.");
    return identity;
  }
  catch (error) {
    if (!(error instanceof ReceiptError) || error.code !== "LOG_IN_USE") throw error;
    const existing = readJson(logLockPath(input), "UNSAFE_LOG_PATH", "Durable log claim is malformed.");
    if (JSON.stringify(existing) !== JSON.stringify(lockBinding(input))) throw new ReceiptError("LOG_IN_USE", "The durable log is reserved by a different receipt.");
    throw new ReceiptError("RECEIPT_EXISTS", "The exact durable log claim already exists.");
  }
}
function releaseFreshLogClaim(input, freshIdentity) {
  try {
    const path = logLockPath(input);
    const existing = readJson(path, "UNSAFE_LOG_PATH", "Durable log claim is malformed.");
    if (logIdentity(privateRegularFileStats(path)) === freshIdentity && JSON.stringify(existing) === JSON.stringify(lockBinding(input))) rmSync(path, { force: true });
  } catch {}
}
function assertLogClaim(input) {
  const existing = readJson(logLockPath(input), "LOG_LOCK_MISMATCH", "Durable log claim is missing or unsafe.");
  if (JSON.stringify(existing) !== JSON.stringify(lockBinding(input))) throw new ReceiptError("LOG_LOCK_MISMATCH", "Durable log claim does not match the exact receipt.");
}
function releaseLogClaim(input) { try { rmSync(logLockPath(input), { force: true }); } catch {} }
function validMonitorLock(record) {
  const identity = identityParts(record?.identity);
  return Boolean(record && typeof record === "object" && !Array.isArray(record) && Number.isInteger(record.pid) && record.pid > 0 && identity?.pid === record.pid && Number.isFinite(Date.parse(record.claimed_at || "")));
}
function releaseMonitorLock(input, receipt) {
  try {
    const existing = readJson(monitorLockPath(input), "INVALID_RECEIPT", "Receipt monitor lock is malformed.");
    if (existing?.pid === receipt.supervisor?.pid && existing?.identity === receipt.supervisor?.identity) rmSync(monitorLockPath(input), { force: true });
  } catch {}
}
function claimMonitor(input, deps, receipt, allowStale = false) {
  const path = monitorLockPath(input);
  const current = { pid: process.pid, identity: deps.processIdentity, claimed_at: nowIso(deps.now()) };
  try { createExclusive(path, current); return; }
  catch (error) { if (!(error instanceof ReceiptError) || error.code !== "RECEIPT_EXISTS" || !allowStale) throw error; }
  const prior = readJson(path, "INVALID_RECEIPT", "Receipt monitor lock is malformed.");
  if (!validMonitorLock(prior)) throw new ReceiptError("INVALID_RECEIPT", "Receipt monitor lock is malformed.");
  const observedIdentity = deps.readProcessIdentity(prior.pid);
  if (observedIdentity === prior.identity || (observedIdentity === null && deps.processIsAbsent(prior.pid) !== true)) throw new ReceiptError("ACTIVE_SUPERVISOR", "The exact receipt already has a live or unproven monitor.");
  const priorEncoded = JSON.stringify(prior);
  const stalePath = `${path}.${randomUUID()}.stale`;
  try {
    deps.rename(path, stalePath);
    if (JSON.stringify(readJson(stalePath, "INVALID_RECEIPT", "Receipt monitor lock changed during stale recovery.")) !== priorEncoded) {
      throw new ReceiptError("ACTIVE_SUPERVISOR", "Receipt monitor lock changed during stale recovery.");
    }
    createExclusive(path, current);
  } catch (error) {
    if (error instanceof ReceiptError) throw error;
    throw new ReceiptError("ACTIVE_SUPERVISOR", "Receipt monitor lock changed during stale recovery.");
  } finally { try { rmSync(stalePath, { force: true }); } catch {} }
}
function processProof(receipt, deps) {
  const root = identityParts(receipt.process?.identity);
  if (!root || receipt.process?.pid !== root.pid || receipt.process?.group_id !== root.groupId || receipt.process?.session_id !== root.sessionId || root.groupId !== root.pid || root.sessionId !== root.pid) return { valid: false, reason: "invalid_process_receipt", live: [] };
  const observedWrapper = deps.readProcessIdentity(root.pid);
  if (observedWrapper !== null && observedWrapper !== receipt.process.identity) return { valid: false, reason: "process_identity_drift", live: [] };
  const known = new Map((receipt.process.owned_identities || [receipt.process.identity]).map((identity) => [identityParts(identity)?.pid, identity]).filter(([pid]) => Number.isInteger(pid)));
  const queue = [...known.keys()]; const inspected = new Set();
  while (queue.length > 0) {
    const pid = queue.shift(); if (inspected.has(pid)) continue; inspected.add(pid);
    const identity = known.get(pid); if (deps.readProcessIdentity(pid) !== identity) continue;
    for (const childPid of deps.readChildPids(pid)) {
      if (known.has(childPid)) continue;
      const childIdentity = deps.readProcessIdentity(childPid); const child = identityParts(childIdentity);
      if (!child || child.groupId !== root.groupId || child.sessionId !== root.sessionId) continue;
      known.set(childPid, childIdentity); queue.push(childPid);
    }
  }
  const exactGroup = deps.listExactProcessGroupPids(root.groupId);
  if (!Array.isArray(exactGroup) || exactGroup.length > 256) return { valid: false, reason: "exact_group_proof_unavailable", live: [] };
  for (const pid of exactGroup) {
    const identity = deps.readProcessIdentity(pid); const member = identityParts(identity);
    if (!member || member.groupId !== root.groupId || member.sessionId !== root.sessionId) return { valid: false, reason: "exact_group_identity_mismatch", live: [] };
    known.set(pid, identity);
  }
  const groupIdentities = exactGroup.map((pid) => known.get(pid)).filter(Boolean);
  const ownedIdentities = [...new Set(groupIdentities)].sort(); const live = groupIdentities;
  receipt.process.owned_identities = ownedIdentities;
  return { valid: true, root, live, wrapperLive: live.includes(receipt.process.identity), eligibleChildren: live.filter((identity) => identity !== receipt.process.identity) };
}
function progress(receipt, input, deps) {
  if (!matchesLogIdentity(input.logPath, receipt.log_identity)) return false;
  const observation = deps.readLogObservation(input.logPath); const prior = receipt.log_observation; const changed = !prior || prior.size !== observation.size || prior.mtime_ms !== observation.mtimeMs;
  receipt.log_observation = { exists: Boolean(observation.exists), size: observation.size || 0, mtime_ms: observation.mtimeMs || 0 }; receipt.heartbeat_at = nowIso(deps.now()); if (changed) receipt.last_progress_at = receipt.heartbeat_at;
  return true;
}
function terminalize(input, receipt, deps, { status, reason, exitCode = null, signal = null, controlledTermination = false, retainLogFence = false, verifiedLogDigest = null }) {
  if (TERMINAL_STATUSES.has(receipt.status)) return receipt;
  const terminalLog = deps.readLog(input.logPath, receipt.log_identity);
  const terminalLogDigest = digest(terminalLog);
  if (status === "passed" && (!verifiedLogDigest || terminalLogDigest !== verifiedLogDigest || !hasTerminalSuiteSuccess(terminalLog))) {
    status = "lifecycle_inconclusive"; reason = "terminal_log_changed"; retainLogFence = true;
  }
  receipt.status = status; receipt.phase = "terminal"; receipt.heartbeat_at = nowIso(deps.now());
  receipt.terminal = { at: receipt.heartbeat_at, reason, exit_code: exitCode, signal, controlled_termination: controlledTermination, log_digest: terminalLogDigest, replacement_fence_retained: retainLogFence };
  persistReceipt(input, receipt); releaseMonitorLock(input, receipt); if (!retainLogFence) releaseLogClaim(input); return receipt;
}
function beginTermination(input, receipt, deps, reason, pendingTerminal = null, awaitingChildClose = false) {
  if (TERMINAL_STATUSES.has(receipt.status) || receipt.status === "terminating") return receipt;
  receipt.status = "terminating"; receipt.phase = "terminating"; receipt.termination = { reason, requested_at: nowIso(deps.now()), term_sent_at: null, kill_sent_at: null, signal_error: null, pending_terminal: pendingTerminal, awaiting_child_close: awaitingChildClose };
  persistReceipt(input, receipt); return receipt;
}
function settleTerminating(input, receipt, deps) {
  const proof = processProof(receipt, deps);
  const pending = receipt.termination?.pending_terminal;
  const waitingForChildClose = Boolean(receipt.termination?.awaiting_child_close && !pending);
  const settlementDeadlineReached = deps.now() - Date.parse(receipt.termination.requested_at) >= input.terminationSettlementMs;
  if ((!proof.valid || proof.live.length === 0) && waitingForChildClose && !settlementDeadlineReached) { persistReceipt(input, receipt); return receipt; }
  if (!proof.valid) return terminalize(input, receipt, deps, pending?.status === "failed" ? { ...pending, retainLogFence: true } : { status: "lifecycle_inconclusive", reason: proof.reason ?? "process_identity_drift", retainLogFence: true });
  if (proof.live.length === 0) {
    return pending ? terminalize(input, receipt, deps, pending) : terminalize(input, receipt, deps, { status: "lifecycle_inconclusive", reason: receipt.termination?.reason ?? "termination_completed", controlledTermination: Boolean(receipt.termination?.term_sent_at || receipt.termination?.kill_sent_at), retainLogFence: true });
  }
  const now = deps.now();
  if (settlementDeadlineReached) return terminalize(input, receipt, deps, pending?.status === "failed" ? { ...pending, retainLogFence: true } : { status: "lifecycle_inconclusive", reason: "termination_settlement_deadline", retainLogFence: true });
  const elapsedSinceTerm = receipt.termination.term_sent_at ? now - Date.parse(receipt.termination.term_sent_at) : 0;
  const next = receipt.termination.term_sent_at ? (elapsedSinceTerm >= input.terminationGraceMs && !receipt.termination.kill_sent_at ? "SIGKILL" : null) : "SIGTERM";
  if (!next) { persistReceipt(input, receipt); return receipt; }
  try { deps.signalProcessGroup(proof.root.groupId, next); if (next === "SIGTERM") receipt.termination.term_sent_at = nowIso(now); else receipt.termination.kill_sent_at = nowIso(now); }
  catch (error) { receipt.termination.signal_error = `${next}:${error?.code ?? "failed"}`; }
  persistReceipt(input, receipt); return receipt;
}
function monitorReceipt(input, receipt, deps, child = null) {
  let timer = null; let stopped = false;
  const stop = () => { if (!stopped) { stopped = true; if (timer) deps.clearInterval(timer); } };
  const tick = () => {
    if (stopped || TERMINAL_STATUSES.has(receipt.status)) return receipt;
    if (receipt.status === "terminating") { const settled = settleTerminating(input, receipt, deps); if (TERMINAL_STATUSES.has(settled.status)) stop(); return settled; }
    const proof = processProof(receipt, deps);
    if (!proof.valid || proof.live.length === 0) {
      if (child && receipt.status === "running") return beginTermination(input, receipt, deps, proof.valid ? "exit_status_unavailable_after_supervisor_loss" : proof.reason ?? "process_identity_drift", null, true);
      terminalize(input, receipt, deps, { status: "lifecycle_inconclusive", reason: proof.valid ? "exit_status_unavailable_after_supervisor_loss" : proof.reason ?? "process_identity_drift", retainLogFence: !proof.valid }); stop(); return receipt;
    }
    if (!progress(receipt, input, deps)) { beginTermination(input, receipt, deps, "log_identity_drift"); return receipt; }
    const elapsed = deps.now() - Date.parse(receipt.started_at); const silentFor = deps.now() - Date.parse(receipt.last_progress_at);
    if (silentFor >= input.noProgressMs) beginTermination(input, receipt, deps, "no_progress_deadline", null, Boolean(child && receipt.status === "running"));
    else persistReceipt(input, receipt);
    return receipt;
  };
  if (child) {
    child.once("close", (exitCode, signal) => {
      const logIdentityMatches = matchesLogIdentity(input.logPath, receipt.log_identity);
      const verifiedLog = logIdentityMatches ? deps.readLog(input.logPath, receipt.log_identity) : "";
      const pending = exitCode === 0 && !signal && logIdentityMatches && hasTerminalSuiteSuccess(verifiedLog)
        ? { status: "passed", reason: "suite_terminal_success", exitCode, signal, verifiedLogDigest: digest(verifiedLog) }
        : exitCode === 0 && !signal
          ? { status: "lifecycle_inconclusive", reason: logIdentityMatches ? "missing_terminal_success_evidence" : "log_identity_drift", exitCode, signal, retainLogFence: !logIdentityMatches }
          : { status: "failed", reason: "suite_exit_nonzero", exitCode, signal };
      if (receipt.status === "terminating" && (receipt.termination?.awaiting_child_close || (pending.status === "failed" && !receipt.termination?.pending_terminal))) {
        receipt.termination.pending_terminal = pending;
        receipt.termination.awaiting_child_close = false;
        persistReceipt(input, receipt);
      } else beginTermination(input, receipt, deps, "child_close_group_settlement", pending);
      const settled = settleTerminating(input, receipt, deps);
      if (TERMINAL_STATUSES.has(settled.status)) stop();
    });
  }
  timer = deps.setInterval(tick, input.heartbeatMs); return { receipt, tick, stop };
}

export function hasTerminalSuiteSummary(contents) {
  if (typeof contents !== "string") return false;
  return /(?:^|\n)1\.\.[1-9]\d*\n# tests\s+[1-9]\d*\n# suites\s+\d+\n# pass\s+[1-9]\d*\n# fail\s+0\n# cancelled\s+0\n# skipped\s+0\n# todo\s+0\n# duration_ms\s+\d+(?:\.\d+)?\s*(?:\n(?:Script done on [^\n]*(?:\[COMMAND_EXIT_CODE="0"\])?\s*)?)?$/.test(contents);
}
export function hasTerminalSuiteSuccess(contents) {
  if (typeof contents !== "string") return false;
  const normalized = contents.replace(/\r\n/g, "\n");
  if (hasTerminalSuiteSummary(normalized)) return true;
  const withoutTrailer = normalized.replace(/\n?Script done on [^\n]*(?:\[COMMAND_EXIT_CODE="0"\])?\s*$/, "");
  const finalLine = withoutTrailer.trimEnd().split("\n").at(-1);
  if (!finalLine?.startsWith("WORKSPACE_TEST_PROFILE_SUMMARY=")) return false;
  let summary;
  try { summary = JSON.parse(finalLine.slice("WORKSPACE_TEST_PROFILE_SUMMARY=".length)); } catch { return false; }
  if (summary?.profile !== "all" || !Number.isInteger(summary.executedTestCount) || summary.executedTestCount < 1) return false;
  const okCount = withoutTrailer.split("\n").filter((line) => /^OK:\s+\S/.test(line)).length;
  return okCount >= summary.executedTestCount;
}
export function startVerificationReceipt(rawInput, overrides = {}) {
  const input = validateInput(rawInput); const deps = dependencies(overrides);
  if (!deps.processIdentity) throw new ReceiptError("UNSUPPORTED_PROCESS_PROOF", "The runner requires a Linux process start-identity proof.");
  assertPrivateDirectory(input.stateDir); assertSafeLogPath(input.logPath); ensurePrivateLog(input.logPath);
  if (existsSync(receiptPath(input))) throw new ReceiptError("RECEIPT_EXISTS", "An invocation receipt already exists; use exact resume instead.");
  const freshLogClaimIdentity = claimLog(input);
  let receipt;
  try { overrides.afterLogClaimed?.(); receipt = initialReceipt(input, deps); }
  catch (error) { if (freshLogClaimIdentity) releaseFreshLogClaim(input, freshLogClaimIdentity); throw error; }
  createExclusive(receiptPath(input), receipt); claimMonitor(input, deps, receipt);
  overrides.afterLaunchClaimed?.(receipt);
  receipt.launch.spawn_attempted_at = nowIso(deps.now()); persistReceipt(input, receipt);
  let child;
  try { child = deps.spawn("script", [...REQUIRED_SCRIPT_ARGUMENTS, input.logPath], { cwd: input.cwd, detached: true, stdio: "ignore", env: sanitizedSuiteEnvironment(deps.environment) }); }
  catch (error) { terminalize(input, receipt, deps, { status: "failed", reason: "spawn_error", signal: error?.code ?? null }); throw error; }
  let monitor = null;
  child.once("error", (error) => { terminalize(input, receipt, deps, { status: "failed", reason: "spawn_error", signal: error?.code ?? null }); monitor?.stop(); });
  const identity = deps.readProcessIdentity(child.pid); const parts = identityParts(identity);
  if (!parts || parts.pid !== child.pid || parts.groupId !== child.pid || parts.sessionId !== child.pid) {
    receipt.status = "spawned"; receipt.phase = "spawned"; receipt.launch.spawned_at = nowIso(deps.now()); persistReceipt(input, receipt);
    monitor = monitorReceipt(input, receipt, deps, child); if (TERMINAL_STATUSES.has(receipt.status)) monitor.stop(); return monitor;
  }
  receipt.status = "spawned"; receipt.phase = "spawned"; receipt.launch.spawned_at = nowIso(deps.now()); receipt.process = { pid: child.pid, group_id: parts.groupId, session_id: parts.sessionId, identity, owned_identities: [identity], observed_at: receipt.launch.spawned_at }; persistReceipt(input, receipt);
  overrides.afterSpawnPersisted?.(receipt);
  receipt.status = "running"; receipt.phase = "running";
  if (!progress(receipt, input, deps)) beginTermination(input, receipt, deps, "log_identity_drift");
  else persistReceipt(input, receipt);
  monitor = monitorReceipt(input, receipt, deps, child); if (TERMINAL_STATUSES.has(receipt.status)) monitor.stop(); return monitor;
}
export function resumeVerificationReceipt(rawInput, overrides = {}) {
  const input = validateInput(rawInput); const deps = dependencies(overrides);
  if (!deps.processIdentity) throw new ReceiptError("UNSUPPORTED_PROCESS_PROOF", "The runner requires a Linux process start-identity proof.");
  assertPrivateDirectory(input.stateDir); assertSafeLogPath(input.logPath);
  let receipt = loadReceipt(input);
  if (TERMINAL_STATUSES.has(receipt.status)) throw new ReceiptError("RECEIPT_NOT_ACTIVE", "Only an exact active receipt may be resumed.");
  assertLogClaim(input); claimMonitor(input, deps, receipt, true);
  receipt = loadReceipt(input);
  if (TERMINAL_STATUSES.has(receipt.status)) {
    releaseMonitorLock(input, { supervisor: { pid: process.pid, identity: deps.processIdentity } });
    throw new ReceiptError("RECEIPT_NOT_ACTIVE", "The receipt terminalized while monitor recovery was acquiring ownership.");
  }
  assertLogClaim(input);
  receipt.supervisor = { pid: process.pid, identity: deps.processIdentity };
  persistReceipt(input, receipt);
  if (!matchesLogIdentity(input.logPath, receipt.log_identity)) {
    terminalize(input, receipt, deps, { status: "lifecycle_inconclusive", reason: "log_identity_drift", retainLogFence: true });
    throw new ReceiptError("RECOVERED_INCONCLUSIVE", "The durable log changed before exact resume.");
  }
  if (receipt.status === "launch_claimed") { terminalize(input, receipt, deps, { status: "lifecycle_inconclusive", reason: "pre_spawn_interrupted", retainLogFence: true }); throw new ReceiptError("RECOVERED_INCONCLUSIVE", "The launch claim was recovered without a spawned child."); }
  const proof = processProof(receipt, deps);
  if (!proof.valid || proof.live.length === 0) { terminalize(input, receipt, deps, { status: "lifecycle_inconclusive", reason: proof.valid ? "exit_status_unavailable_after_supervisor_loss" : proof.reason ?? "process_identity_drift", retainLogFence: !proof.valid }); throw new ReceiptError("RECOVERED_INCONCLUSIVE", "The detached child has no durable exit result for exact resume."); }
  if (receipt.status === "spawned") { receipt.status = "running"; receipt.phase = "running"; persistReceipt(input, receipt); }
  return monitorReceipt(input, receipt, deps);
}
export function parseCli(argv) {
  const [operation, ...rest] = argv;
  if (!new Set(["start", "resume"]).has(operation)) throw new ReceiptError("INVALID_ARGUMENT", "Usage: verification-receipt.mjs <start|resume> --task <id> --owner <id> --worktree-root <absolute> --state-dir <absolute> --log <absolute> [--invocation <id>].");
  const values = { operation };
  for (let index = 0; index < rest.length; index += 2) { const flag = rest[index]; const value = rest[index + 1]; if (!value || !["--task", "--owner", "--worktree-root", "--state-dir", "--log", "--invocation", "--heartbeat-ms", "--child-grace-ms", "--no-progress-ms", "--termination-grace-ms", "--termination-settlement-ms"].includes(flag)) throw new ReceiptError("INVALID_ARGUMENT", "Unsupported receipt runner option."); values[flag.slice(2).replaceAll("-", "_")] = value; }
  return { operation, taskId: values.task, ownerId: values.owner, worktreeRoot: values.worktree_root, stateDir: values.state_dir, logPath: values.log, invocationId: values.invocation, heartbeatMs: values.heartbeat_ms ? Number(values.heartbeat_ms) : undefined, childGraceMs: values.child_grace_ms ? Number(values.child_grace_ms) : undefined, noProgressMs: values.no_progress_ms ? Number(values.no_progress_ms) : undefined, terminationGraceMs: values.termination_grace_ms ? Number(values.termination_grace_ms) : undefined, terminationSettlementMs: values.termination_settlement_ms ? Number(values.termination_settlement_ms) : undefined };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try { const input = parseCli(process.argv.slice(2)); const monitor = input.operation === "start" ? startVerificationReceipt(input) : resumeVerificationReceipt(input); process.stdout.write(`${JSON.stringify({ status: monitor.receipt.status, task_id: monitor.receipt.task_id, invocation_id: monitor.receipt.invocation_id, receipt: receiptPath({ ...input, stateDir: resolve(input.stateDir) })})}\n`); }
  catch (error) { process.stderr.write(`${error.code ?? "RECEIPT_ERROR"}: ${error.message}\n`); process.exitCode = 2; }
}
