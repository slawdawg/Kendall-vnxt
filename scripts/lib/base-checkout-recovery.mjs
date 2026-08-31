import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_TEXT_LENGTH = 256;
const RECOVERY_PROJECTION = Object.freeze({
  column: "Needs attention",
  attentionKind: "recovery_needed",
  derived: true,
});

/**
 * Inspect the Git primary worktree without retaining a diff, changing Git
 * state, or adding it to managed workspace state. Git's first porcelain
 * worktree record identifies the trusted Base Checkout, even when the caller
 * itself is running in a managed worktree.
 */
export function inspectBaseCheckoutRecovery(input = {}, context = {}) {
  const git = context.git || defaultGit;
  const worktrees = trustedWorktrees(git, context.cwd);
  const primary = boundedText(worktrees[0]?.path);
  if (!primary) return unknownRecovery();

  const checkout = checkoutMetadata(primary, git, {
    registeredManagedWorktreePaths: registeredManagedWorktreePaths(input.managedWorktreePaths, worktrees),
    readdir: context.readdir || readdirSync,
  });
  if (!checkout) return unknownRecovery();
  const marker = recoveryMarker(input.recoveryMarker, checkout);
  if (marker?.status === "invalid") return unknownRecovery("recovery.break_glass_marker_invalid");

  if (input.explicitBreakGlass === true || marker?.status === "active") {
    return recoveryResult("recovery.break_glass_edit", checkout, marker);
  }
  if (checkout.changedPathCount > 0) {
    return recoveryResult("recovery.base_checkout_dirty", checkout);
  }
  return Object.freeze({
    status: "clear",
    outcome: "no_recovery",
    reasonCode: "recovery.base_checkout_clean",
    nextSafeAction: "Continue through managed-lane admission before any source change.",
    canonicalStage: null,
    canonicalStatus: null,
    canonicalOwner: null,
    projection: null,
    checkout,
    mutation: "none; inspection only",
  });
}

function recoveryResult(reasonCode, checkout, marker = null) {
  return Object.freeze({
    status: "recovery_required",
    outcome: "recovery_required",
    reasonCode,
    nextSafeAction: "Inspect the unmanaged Base Checkout diff; preserve it and do not mutate, publish, or adopt it.",
    canonicalStage: "human_gate",
    canonicalStatus: "blocked",
    canonicalOwner: "blocked",
    projection: { ...RECOVERY_PROJECTION },
    checkout,
    ...(marker?.status === "active" ? { recoveryMarker: recoveryMarkerEvidence(marker) } : {}),
    mutation: "none; inspection only",
  });
}

function unknownRecovery(reasonCode = "recovery.primary_checkout_unknown") {
  return Object.freeze({
    status: "inspection_unknown",
    outcome: "recovery_required",
    reasonCode,
    nextSafeAction: "Inspect trusted Base Checkout facts before source changes or delivery.",
    canonicalStage: "human_gate",
    canonicalStatus: "blocked",
    canonicalOwner: "blocked",
    projection: { ...RECOVERY_PROJECTION },
    checkout: null,
    mutation: "none; inspection only",
  });
}

function recoveryMarker(value, checkout) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = boundedText(value.status);
  if (!status) return { status: "invalid" };
  if (status === "resolved") return { status, recordedAt: boundedText(value.recordedAt), resolvedAt: boundedText(value.resolvedAt) };
  if (status !== "active"
    || boundedText(value.reasonCode) !== "recovery.break_glass_edit"
    || !boundedText(value.recordedAt)
    || value.checkout?.identity !== "primary_worktree"
    || boundedText(value.checkout?.path) !== checkout.path) {
    return { status: "invalid" };
  }
  return { status, recordedAt: boundedText(value.recordedAt) };
}

function recoveryMarkerEvidence(marker) {
  return Object.freeze({
    status: "active",
    recordedAt: marker.recordedAt,
  });
}

function trustedWorktrees(git, cwd) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result?.code !== 0) return [];
  return parseWorktreePorcelain(result.stdout);
}

function checkoutMetadata(path, git, context = {}) {
  const inside = git(["rev-parse", "--is-inside-work-tree"], { cwd: path });
  if (inside?.code !== 0 || String(inside.stdout || "").trim() !== "true") return null;

  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: path });
  const headResult = git(["rev-parse", "HEAD"], { cwd: path });
  const statusResult = git(["status", "--porcelain=v1", "-z"], { cwd: path });
  if (headResult?.code !== 0 || statusResult?.code !== 0) return null;

  const head = boundedText(headResult.stdout);
  if (!head) return null;

  const changes = changedPathRecords(statusResult.stdout);
  const changedPathCount = changes.filter((change) => !isVerifiedManagedWorktreeContainer(change, path, context)).length;

  return Object.freeze({
    identity: "primary_worktree",
    path,
    branch: boundedText(branchResult?.stdout) || "DETACHED",
    head,
    changedPathCount,
  });
}

function changedPathRecords(value) {
  const records = String(value || "").split("\0");
  const changes = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const indexStatus = record[0] || " ";
    const worktreeStatus = record[1] || " ";
    changes.push({ indexStatus, worktreeStatus, path: record.slice(3) });
    if (indexStatus === "R" || indexStatus === "C" || worktreeStatus === "R" || worktreeStatus === "C") {
      index += 1;
    }
  }
  return changes;
}

function registeredManagedWorktreePaths(value, worktrees) {
  if (!Array.isArray(value)) return new Set();
  const registered = new Set(worktrees.map((worktree) => resolvedPath(worktree.path)).filter(Boolean));
  return new Set(
    value
      .map((path) => resolvedPath(path))
      .filter((path) => path && registered.has(path)),
  );
}

function isVerifiedManagedWorktreeContainer(change, checkoutPath, context) {
  if (change.indexStatus !== "?" || change.worktreeStatus !== "?" || !change.path.endsWith("/")) return false;
  const containerPath = resolvedChildPath(checkoutPath, change.path);
  if (!containerPath || context.registeredManagedWorktreePaths?.size === 0) return false;
  const managedRoots = [...context.registeredManagedWorktreePaths].filter((path) => isDescendant(path, containerPath));
  if (managedRoots.length === 0) return false;
  let entries;
  try {
    entries = context.readdir(containerPath, { withFileTypes: true });
  } catch {
    return false;
  }
  if (!Array.isArray(entries) || entries.length === 0) return false;
  return entries.every((entry) => {
    if (!entry?.name || !entry.isDirectory?.()) return false;
    const entryPath = resolvedChildPath(containerPath, entry.name);
    return entryPath && managedRoots.some((root) => root === entryPath);
  });
}

function resolvedPath(value) {
  const text = boundedText(value);
  return text && isAbsolute(text) ? resolve(text) : null;
}

function resolvedChildPath(parent, child) {
  const text = typeof child === "string" ? child : "";
  if (!text || isAbsolute(text)) return null;
  const target = resolve(parent, text);
  return isDescendant(target, resolve(parent)) ? target : null;
}

function isDescendant(path, parent) {
  const relation = relative(parent, path);
  return Boolean(relation) && !relation.startsWith("..") && !isAbsolute(relation);
}

function parseWorktreePorcelain(value) {
  const records = [];
  let current = null;
  for (const line of String(value || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) records.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    if (key === "worktree") current = { path: rest.join(" ") };
  }
  if (current) records.push(current);
  return records;
}

function boundedText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
}

function defaultGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || result.error?.message || ""),
  };
}
