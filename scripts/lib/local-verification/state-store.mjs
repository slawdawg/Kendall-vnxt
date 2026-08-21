import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { assertLocalWorkspaceStoragePath, workspaceState } from "../codex-workspace-state.mjs";
import { assertPlanResponse, createPlanResponse, digest, stableJson } from "./contracts.mjs";

export const LOCAL_VERIFICATION_STATE_SCHEMA_VERSION = "local-verification-state/v1";
const MAX_RECORD_BYTES = 16_384;
const MAX_RECEIPTS = 200;
const MAX_PLAN_NODES = 200;

export class LocalVerificationStateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocalVerificationStateError";
    this.code = code;
  }
}

function safeId(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw new LocalVerificationStateError("INVALID_ID", `${label} is invalid.`);
  return value;
}

function safeDirectory(path) {
  if (existsSync(path)) {
    const stats = lstatSync(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new LocalVerificationStateError("UNSAFE_STATE_PATH", "Local verification state directory is unsafe.");
    return;
  }
  const parent = dirname(path);
  if (parent === path) throw new LocalVerificationStateError("UNSAFE_STATE_PATH", "Local verification state directory has no safe parent.");
  safeDirectory(parent);
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new LocalVerificationStateError("UNSAFE_STATE_PATH", "Local verification state directory is unsafe.");
}

function fsyncDirectory(path) {
  let fd;
  try { fd = openSync(path, "r"); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
}

function writeSnapshot(path, value, maxRecordBytes) {
  const content = serializeRecord(value, maxRecordBytes);
  safeDirectory(dirname(path));
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let fd;
  try { fd = openSync(temp, "wx", 0o600); writeFileSync(fd, content); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(temp, path);
  fsyncDirectory(dirname(path));
}

function writeImmutable(path, value, maxRecordBytes) {
  const content = serializeRecord(value, maxRecordBytes);
  safeDirectory(dirname(path));
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.pending`);
  let fd;
  try { fd = openSync(temp, "wx", 0o600); writeFileSync(fd, content); fsyncSync(fd); linkSync(temp, path); fsyncDirectory(dirname(path)); }
  catch (error) { if (error?.code === "EEXIST") throw new LocalVerificationStateError("RECEIPT_EXISTS", "An immutable verification receipt already exists."); throw error; }
  finally { try { rmSync(temp, { force: true }); } catch {} }
}

function serializeRecord(value, maxRecordBytes = MAX_RECORD_BYTES) {
  const content = `${stableJson(value)}\n`;
  if (Buffer.byteLength(content) > maxRecordBytes) throw new LocalVerificationStateError("RECORD_TOO_LARGE", "Verification evidence exceeds the configured bounded record size.");
  return content;
}

function readRecord(path, maxRecordBytes = MAX_RECORD_BYTES) {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size === 0 || stats.size > maxRecordBytes) throw new Error("invalid");
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof LocalVerificationStateError) throw error;
    throw new LocalVerificationStateError("INVALID_RECORD", "Local verification state record is missing, malformed, or unsafe.");
  }
}

function validSourceIdentity(identity) {
  return Boolean(identity && identity.schemaVersion === "source-identity/v1" && /^[a-f0-9]{16,64}$/i.test(identity.commit || "") && /^sha256:[a-f0-9]{64}$/.test(identity.worktreeFingerprint || "") && /^sha256:[a-f0-9]{64}$/.test(identity.plannerDigest || "") && /^sha256:[a-f0-9]{64}$/.test(identity.commandDigest || "") && /^sha256:[a-f0-9]{64}$/.test(identity.environmentDigest || "") && identity.surfaceFingerprints && typeof identity.surfaceFingerprints === "object" && !Array.isArray(identity.surfaceFingerprints) && Object.entries(identity.surfaceFingerprints).every(([surface, value]) => /^[a-zA-Z][a-zA-Z0-9_-]{0,80}$/.test(surface) && /^sha256:[a-f0-9]{64}$/.test(value)));
}

function hasSameSourceIdentity(left, right) {
  return ["schemaVersion", "commit", "worktreeFingerprint", "plannerDigest", "commandDigest", "environmentDigest"].every((field) => left?.[field] === right?.[field]) && stableJson(left?.surfaceFingerprints) === stableJson(right?.surfaceFingerprints);
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function checkedPlan(sourceIdentity, plan) {
  if (!validSourceIdentity(sourceIdentity)) throw new LocalVerificationStateError("INVALID_PLAN", "Plan evidence lacks a valid v1 source identity.");
  try {
    return assertPlanResponse(createPlanResponse({ sourceIdentity, plan })).result;
  } catch {
    throw new LocalVerificationStateError("INVALID_PLAN", "Plan evidence is not a valid canonical local-verification plan.");
  }
}

export function localVerificationState(options = {}, context = {}) {
  try {
    const workspace = workspaceState({ stateRoot: options.stateRoot }, context);
    assertLocalWorkspaceStoragePath(workspace.root, context);
    const root = join(workspace.root, "local-verification");
    assertLocalWorkspaceStoragePath(root, context);
    const maxReceipts = options.maxReceipts ?? MAX_RECEIPTS;
    const maxRecordBytes = options.maxRecordBytes ?? MAX_RECORD_BYTES;
    if (!Number.isInteger(maxReceipts) || maxReceipts < 1 || maxReceipts > MAX_RECEIPTS) throw new LocalVerificationStateError("INVALID_LIMIT", "Receipt retention limit is invalid.");
    if (!Number.isInteger(maxRecordBytes) || maxRecordBytes < 1_024 || maxRecordBytes > MAX_RECORD_BYTES) throw new LocalVerificationStateError("INVALID_LIMIT", "Record size limit is invalid.");
    return { root, plansDir: join(root, "plans"), receiptsDir: join(root, "receipts"), runsDir: join(root, "runs"), shadowsDir: join(root, "shadows"), claimsDir: join(root, "claims"), maxReceipts, maxRecordBytes };
  } catch (error) {
    if (error instanceof LocalVerificationStateError) throw error;
    throw new LocalVerificationStateError("UNSAFE_STATE_ROOT", "Local verification state must be outside tracked source or Git-ignored.");
  }
}

export function withStartClaim({ state, planId, action } = {}) {
  const id = safeId(planId, "Plan ID");
  if (typeof action !== "function") throw new LocalVerificationStateError("INVALID_CLAIM", "Start claim requires an action.");
  safeDirectory(state.claimsDir);
  const path = join(state.claimsDir, `${id}.lock`);
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, `${process.pid}\n`);
    fsyncSync(fd);
  } catch (error) {
    if (error?.code === "EEXIST") throw new LocalVerificationStateError("START_IN_PROGRESS", "An equivalent verification start is already claiming this plan.");
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
  try { return action(); } finally { try { unlinkSync(path); fsyncDirectory(state.claimsDir); } catch {} }
}

function planRecord({ sourceIdentity, plan, status = "planned", reusedNodeIds = [], supersededBy = null, now = new Date().toISOString() }) {
  const checked = checkedPlan(sourceIdentity, plan);
  if (checked.nodes.length > MAX_PLAN_NODES || !validTimestamp(now) || !["planned", "running", "passed", "failed", "cancelled", "superseded", "unknown"].includes(status) || !Array.isArray(reusedNodeIds) || reusedNodeIds.length > checked.nodes.length || !reusedNodeIds.every((nodeId) => checked.nodes.some((node) => node.nodeId === nodeId)) || (supersededBy !== null && !/^plan_[a-f0-9]{64}$/.test(supersededBy))) throw new LocalVerificationStateError("INVALID_PLAN", "Plan evidence exceeds the durable state contract.");
  return {
    schema_version: LOCAL_VERIFICATION_STATE_SCHEMA_VERSION,
    record_type: "plan",
    plan_id: checked.planId,
    source_identity: sourceIdentity,
    planner_digest: sourceIdentity.plannerDigest,
    command_digest: sourceIdentity.commandDigest,
    environment_digest: sourceIdentity.environmentDigest,
    status,
    plan: checked,
    reused_node_ids: [...new Set(reusedNodeIds)].sort(),
    superseded_by: supersededBy,
    created_at: now,
    updated_at: now,
  };
}

export function persistPlan({ state, sourceIdentity, plan, status, reusedNodeIds, supersededBy, now } = {}) {
  const record = planRecord({ sourceIdentity, plan, status, reusedNodeIds, supersededBy, now });
  writeSnapshot(join(state.plansDir, `${record.plan_id}.json`), record, state.maxRecordBytes);
  return { planId: record.plan_id, status: record.status };
}

export function readPlan({ state, planId, sourceIdentity } = {}) {
  const id = safeId(planId, "Plan ID");
  const record = readRecord(join(state.plansDir, `${id}.json`), state.maxRecordBytes);
  if (record.schema_version !== LOCAL_VERIFICATION_STATE_SCHEMA_VERSION || record.record_type !== "plan" || record.plan_id !== id || !validSourceIdentity(record.source_identity) || record.planner_digest !== record.source_identity.plannerDigest || record.command_digest !== record.source_identity.commandDigest || record.environment_digest !== record.source_identity.environmentDigest || !["planned", "running", "passed", "failed", "cancelled", "superseded", "unknown"].includes(record.status) || !Array.isArray(record.reused_node_ids) || !validTimestamp(record.created_at) || !validTimestamp(record.updated_at)) throw new LocalVerificationStateError("INVALID_RECORD", "Plan record is ineligible.");
  if (!sourceIdentity || !hasSameSourceIdentity(record.source_identity, sourceIdentity)) throw new LocalVerificationStateError("SOURCE_IDENTITY_MISMATCH", "Saved plan does not match the current source identity.");
  try {
    const checked = checkedPlan(record.source_identity, record.plan);
    if (checked.planId !== id || checked.nodes.length > MAX_PLAN_NODES || !record.reused_node_ids.every((nodeId) => checked.nodes.some((node) => node.nodeId === nodeId)) || (record.superseded_by !== null && !/^plan_[a-f0-9]{64}$/.test(record.superseded_by))) throw new Error("invalid");
  } catch { throw new LocalVerificationStateError("INVALID_RECORD", "Plan record is not bound to its canonical plan."); }
  return record;
}

export function reusableReceipts({ state, sourceIdentity, plan } = {}) {
  const checked = checkedPlan(sourceIdentity, plan);
  let entries;
  try { entries = readdirSync(state.receiptsDir); } catch (error) { if (error?.code === "ENOENT") return []; throw new LocalVerificationStateError("INVALID_RECORD", "Receipt storage is unavailable."); }
  const reusable = [];
  const currentByInput = new Map(checked.nodes.map((node) => [node.inputDigest, node]));
  for (const name of entries.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const receipt = readRecord(join(state.receiptsDir, name), state.maxRecordBytes);
      const current = currentByInput.get(receipt.node_input_digest);
      if (!current || receipt.record_type !== "receipt" || receipt.status !== "passed" || receipt.command_digest !== digest(current.command) || !Number.isInteger(receipt.duration_ms) || receipt.duration_ms < 0 || !validTimestamp(receipt.created_at) || !validSourceIdentity(receipt.source_identity)) continue;
      // Validate the old immutable receipt through its own canonical plan
      // before allowing its scoped input identity to satisfy a new plan.
      const prior = readPlan({ state, planId: receipt.plan_id, sourceIdentity: receipt.source_identity });
      const priorNode = prior.plan.nodes.find((node) => node.nodeId === receipt.node_id);
      if (!priorNode || priorNode.inputDigest !== receipt.node_input_digest || digest(priorNode.command) !== receipt.command_digest) continue;
      reusable.push({ ...receipt, node_id: current.nodeId });
      currentByInput.delete(receipt.node_input_digest);
    } catch { /* A malformed or source-incompatible candidate is ineligible. */ }
  }
  return reusable.sort((left, right) => left.node_id.localeCompare(right.node_id));
}

export function supersedePriorPlans({ state, sourceIdentity, plan } = {}) {
  const current = checkedPlan(sourceIdentity, plan);
  let entries;
  try { entries = readdirSync(state.plansDir); } catch (error) { if (error?.code === "ENOENT") return []; throw new LocalVerificationStateError("INVALID_RECORD", "Plan storage is unavailable."); }
  const superseded = [];
  for (const name of entries) {
    if (!/^plan_[a-f0-9]{64}\.json$/.test(name) || name === `${current.planId}.json`) continue;
    let record;
    try {
      record = readRecord(join(state.plansDir, name), state.maxRecordBytes);
      if (record.record_type !== "plan" || !validSourceIdentity(record.source_identity) || !record.plan || checkedPlan(record.source_identity, record.plan).planId !== record.plan_id || record.superseded_by !== null) continue;
    } catch { continue; }
    if (hasSameSourceIdentity(record.source_identity, sourceIdentity)) continue;
    persistPlan({ state, sourceIdentity: record.source_identity, plan: record.plan, status: "superseded", reusedNodeIds: record.reused_node_ids || [], supersededBy: current.planId });
    superseded.push(record.plan_id);
  }
  return superseded.sort();
}

export function supersedePriorRuns({ state, sourceIdentity, plan } = {}) {
  const current = checkedPlan(sourceIdentity, plan);
  let entries;
  try { entries = readdirSync(state.runsDir); } catch (error) { if (error?.code === "ENOENT") return []; throw new LocalVerificationStateError("INVALID_RECORD", "Run storage is unavailable."); }
  const superseded = [];
  for (const name of entries) {
    if (!/^run_[a-f0-9]{64}\.json$/.test(name)) continue;
    try {
      const record = readRecord(join(state.runsDir, name), state.maxRecordBytes);
      if (record.record_type !== "run" || !validSourceIdentity(record.source_identity) || hasSameSourceIdentity(record.source_identity, sourceIdentity) || record.status === "superseded") continue;
      const prior = readPlan({ state, planId: record.plan_id, sourceIdentity: record.source_identity });
      persistRun({ state, sourceIdentity: record.source_identity, plan: prior.plan, runId: record.run_id, status: "superseded", nodeStates: record.nodes.map((node) => ({ ...node, status: ["pending", "running"].includes(node.status) ? "superseded" : node.status })), pid: record.pid, processIdentity: record.process_identity, ownerToken: record.owner_token, startedAt: record.started_at, firstFailure: record.first_failure });
      superseded.push(record.run_id);
    } catch { /* malformed old evidence remains ineligible and is not repaired */ }
  }
  return superseded.sort();
}

function runRecord({ sourceIdentity, plan, runId, status, nodeStates, pid = null, processIdentity = null, ownerToken = null, startedAt, updatedAt = startedAt, firstFailure = null }) {
  const checked = checkedPlan(sourceIdentity, plan);
  if (!/^run_[a-f0-9]{64}$/.test(runId || "") || !["planned", "running", "cancelling", "passed", "failed", "cancelled", "superseded", "unknown"].includes(status) || !validTimestamp(startedAt) || !validTimestamp(updatedAt) || !Array.isArray(nodeStates) || nodeStates.length !== checked.nodes.length || !nodeStates.every((nodeState, index) => nodeState?.node_id === checked.nodes[index].nodeId && ["pending", "running", "passed", "failed", "reused", "blocked", "cancelled", "unknown", "superseded"].includes(nodeState.status)) || (pid !== null && (!Number.isInteger(pid) || pid < 1)) || (processIdentity !== null && (typeof processIdentity !== "string" || processIdentity !== `${pid}:${processIdentity.split(":")[1]}` || !/^\d+:\d+$/.test(processIdentity))) || (ownerToken !== null && !/^[a-f0-9-]{36}$/i.test(ownerToken)) || (firstFailure !== null && (typeof firstFailure !== "object" || !/^node_[a-f0-9]{64}$/.test(firstFailure.node_id || "") || typeof firstFailure.code !== "string"))) throw new LocalVerificationStateError("INVALID_RUN", "Run state is outside the bounded lifecycle contract.");
  return { schema_version: LOCAL_VERIFICATION_STATE_SCHEMA_VERSION, record_type: "run", run_id: runId, plan_id: checked.planId, source_identity: sourceIdentity, status, pid, process_identity: processIdentity, owner_token: ownerToken, nodes: nodeStates, first_failure: firstFailure, started_at: startedAt, updated_at: updatedAt };
}

export function createRunId(planId, startedAt, nonce = randomUUID()) {
  // A timestamp is status information, not a uniqueness guarantee.  A retry
  // can legitimately occur inside the same millisecond after an owned worker
  // dies, so bind a private nonce into the durable run identity as well.
  return `run_${digest({ planId, startedAt, nonce }).slice("sha256:".length)}`;
}

export function persistRun({ state, sourceIdentity, plan, runId, status, nodeStates, pid, processIdentity, ownerToken, startedAt, updatedAt, firstFailure } = {}) {
  const record = runRecord({ sourceIdentity, plan, runId, status, nodeStates, pid, processIdentity, ownerToken, startedAt, updatedAt, firstFailure });
  writeSnapshot(join(state.runsDir, `${record.run_id}.json`), record, state.maxRecordBytes);
  return { runId: record.run_id, status: record.status };
}

export function readRun({ state, runId, sourceIdentity, plan } = {}) {
  const id = safeId(runId, "Run ID");
  const record = readRecord(join(state.runsDir, `${id}.json`), state.maxRecordBytes);
  const checked = checkedPlan(sourceIdentity, plan);
  try {
    const validated = runRecord({ sourceIdentity: record.source_identity, plan: checked, runId: record.run_id, status: record.status, nodeStates: record.nodes, pid: record.pid, processIdentity: record.process_identity, ownerToken: record.owner_token, startedAt: record.started_at, updatedAt: record.updated_at, firstFailure: record.first_failure });
    if (validated.run_id !== id || validated.plan_id !== checked.planId || !hasSameSourceIdentity(validated.source_identity, sourceIdentity)) throw new Error("invalid");
  } catch { throw new LocalVerificationStateError("INVALID_RECORD", "Run record is ineligible for this source and plan."); }
  return record;
}

export function activeRuns({ state, sourceIdentity, plan } = {}) {
  return runsForPlan({ state, sourceIdentity, plan }).filter((record) => ["planned", "running", "cancelling"].includes(record.status));
}

export function runsForPlan({ state, sourceIdentity, plan } = {}) {
  const checked = checkedPlan(sourceIdentity, plan);
  let entries;
  try { entries = readdirSync(state.runsDir); } catch (error) { if (error?.code === "ENOENT") return []; throw new LocalVerificationStateError("INVALID_RECORD", "Run storage is unavailable."); }
  return entries
    .filter((name) => /^run_[a-f0-9]{64}\.json$/.test(name))
    .flatMap((name) => {
      try {
        const record = readRun({ state, runId: name.slice(0, -5), sourceIdentity, plan: checked });
        return [record];
      } catch { return []; }
    })
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
}

export function persistReceipt({ state, sourceIdentity, plan, node, status, durationMs, now = new Date().toISOString() } = {}) {
  const checked = checkedPlan(sourceIdentity, plan);
  const approvedNode = checked.nodes.find((candidate) => candidate.nodeId === node?.nodeId && stableJson(candidate) === stableJson(node));
  if (!approvedNode || status !== "passed" || !Number.isInteger(durationMs) || durationMs < 0 || !validTimestamp(now)) throw new LocalVerificationStateError("INVALID_RECEIPT", "Verification receipt is invalid.");
  safeDirectory(state.receiptsDir);
  const existing = readdirSync(state.receiptsDir).filter((name) => name.endsWith(".json"));
  if (existing.length >= state.maxReceipts) throw new LocalVerificationStateError("RETENTION_LIMIT", "Verification receipt retention limit reached.");
  const receiptId = `${checked.planId}-${approvedNode.nodeId}`;
  const record = { schema_version: LOCAL_VERIFICATION_STATE_SCHEMA_VERSION, record_type: "receipt", receipt_id: receiptId, plan_id: checked.planId, node_id: approvedNode.nodeId, source_identity: sourceIdentity, command_digest: digest(approvedNode.command), node_input_digest: approvedNode.inputDigest, status, duration_ms: durationMs, created_at: now };
  writeImmutable(join(state.receiptsDir, `${receiptId}.json`), record, state.maxRecordBytes);
  return { receiptId, status };
}

export function readReceipt({ state, receiptId, sourceIdentity, plan } = {}) {
  const id = safeId(receiptId, "Receipt ID");
  const record = readRecord(join(state.receiptsDir, `${id}.json`), state.maxRecordBytes);
  const checked = checkedPlan(sourceIdentity, plan);
  const node = checked.nodes.find((candidate) => candidate.nodeId === record.node_id);
  if (record.schema_version !== LOCAL_VERIFICATION_STATE_SCHEMA_VERSION || record.record_type !== "receipt" || record.receipt_id !== id || record.plan_id !== checked.planId || !node || record.status !== "passed" || !Number.isInteger(record.duration_ms) || record.duration_ms < 0 || !validTimestamp(record.created_at) || !hasSameSourceIdentity(record.source_identity, sourceIdentity) || record.command_digest !== digest(node.command) || record.node_input_digest !== node.inputDigest) throw new LocalVerificationStateError("INVALID_RECORD", "Receipt record is ineligible.");
  return record;
}

export function timingSamplesForPlan({ state, plan } = {}) {
  const commands = new Map(plan?.nodes?.map((node) => [digest(node.command), node.nodeId]) || []);
  const samples = Object.fromEntries([...commands.values()].map((nodeId) => [nodeId, []]));
  if (commands.size === 0) return samples;
  let entries;
  try { entries = readdirSync(state.receiptsDir); } catch (error) { if (error?.code === "ENOENT") return samples; throw new LocalVerificationStateError("INVALID_RECORD", "Receipt timing history is unavailable."); }
  for (const name of entries.filter((entry) => entry.endsWith(".json")).sort().slice(-MAX_RECEIPTS)) {
    try {
      const record = readRecord(join(state.receiptsDir, name), state.maxRecordBytes);
      const nodeId = commands.get(record.command_digest);
      if (nodeId && record.record_type === "receipt" && record.status === "passed" && Number.isInteger(record.duration_ms) && record.duration_ms >= 0) samples[nodeId].push(record.duration_ms);
    } catch { /* Malformed history is excluded, never repaired or trusted. */ }
  }
  return samples;
}

export function persistShadowComparison({ state, comparison } = {}) {
  if (!/^shadow_[a-f0-9]{64}$/.test(comparison?.comparisonId || "") || !validSourceIdentity(comparison.sourceIdentity) || !/^plan_[a-f0-9]{64}$/.test(comparison.planId || "") || !Array.isArray(comparison.selectedNodeIds) || !["matched", "mismatch"].includes(comparison.outcome) || comparison.fallback !== "pnpm run check" || !validTimestamp(comparison.createdAt)) throw new LocalVerificationStateError("INVALID_SHADOW", "Shadow comparison is outside the bounded evidence contract.");
  const record = { schema_version: LOCAL_VERIFICATION_STATE_SCHEMA_VERSION, record_type: "shadow", comparison_id: comparison.comparisonId, source_identity: comparison.sourceIdentity, plan_id: comparison.planId, selected_node_ids: comparison.selectedNodeIds, reused_node_ids: comparison.reusedNodeIds || [], accelerated_status: comparison.acceleratedStatus, governed_status: comparison.governedStatus, governed_duration_ms: comparison.governedDurationMs, outcome: comparison.outcome, fallback: comparison.fallback, created_at: comparison.createdAt };
  writeImmutable(join(state.shadowsDir, `${record.comparison_id}.json`), record, state.maxRecordBytes);
  return { comparisonId: record.comparison_id, outcome: record.outcome };
}

export function shadowComparisons({ state, sourceIdentity } = {}) {
  let entries;
  try { entries = readdirSync(state.shadowsDir); } catch (error) { if (error?.code === "ENOENT") return []; throw new LocalVerificationStateError("INVALID_RECORD", "Shadow evidence is unavailable."); }
  return entries.filter((name) => /^shadow_[a-f0-9]{64}\.json$/.test(name)).flatMap((name) => {
    try {
      const record = readRecord(join(state.shadowsDir, name), state.maxRecordBytes);
      if (record.record_type !== "shadow" || !hasSameSourceIdentity(record.source_identity, sourceIdentity) || !["matched", "mismatch"].includes(record.outcome)) return [];
      return [{ comparisonId: record.comparison_id, outcome: record.outcome, acceleratedStatus: record.accelerated_status, governedStatus: record.governed_status, governedDurationMs: record.governed_duration_ms }];
    } catch { return []; }
  }).sort((left, right) => left.comparisonId.localeCompare(right.comparisonId));
}
