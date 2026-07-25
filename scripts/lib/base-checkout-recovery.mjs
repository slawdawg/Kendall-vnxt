import { spawnSync } from "node:child_process";

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
  const primary = trustedPrimaryWorktree(git, context.cwd);
  if (!primary) return unknownRecovery();

  const checkout = checkoutMetadata(primary, git);
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

function trustedPrimaryWorktree(git, cwd) {
  const result = git(["worktree", "list", "--porcelain"], { cwd });
  if (result?.code !== 0) return null;
  const first = parseWorktreePorcelain(result.stdout)[0];
  return boundedText(first?.path);
}

function checkoutMetadata(path, git) {
  const inside = git(["rev-parse", "--is-inside-work-tree"], { cwd: path });
  if (inside?.code !== 0 || String(inside.stdout || "").trim() !== "true") return null;

  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: path });
  const headResult = git(["rev-parse", "HEAD"], { cwd: path });
  const statusResult = git(["status", "--porcelain=v1", "-z"], { cwd: path });
  if (headResult?.code !== 0 || statusResult?.code !== 0) return null;

  const head = boundedText(headResult.stdout);
  if (!head) return null;

  return Object.freeze({
    identity: "primary_worktree",
    path,
    branch: boundedText(branchResult?.stdout) || "DETACHED",
    head,
    changedPathCount: changedPathCount(statusResult.stdout),
  });
}

function changedPathCount(value) {
  const records = String(value || "").split("\0");
  let count = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    count += 1;
    const indexStatus = record[0] || " ";
    const worktreeStatus = record[1] || " ";
    if (indexStatus === "R" || indexStatus === "C" || worktreeStatus === "R" || worktreeStatus === "C") {
      index += 1;
    }
  }
  return count;
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
