#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectCopiedWorktreeExecutionAttempts,
  commandArgsForTask,
  expectedResponseForTask,
  validateCopiedWorktreeExecutionAttempt,
} from "./governed-worker-copied-worktree-execution.mjs";

export const GOVERNED_WORKER_EVIDENCE_SNAPSHOT_VERSION = "governed_worker_copied_worktree_evidence_snapshot.v0";
export const DEFAULT_LOCAL_EVIDENCE_ROOT = ".kendall-local/governed-worker-evidence";

const RAW_MARKER_PATTERN = /raw_prompt|provider_payload|authorization|bearer|token|secret|password|credential|sk-[a-z0-9_-]+/i;
const ALLOWED_SNAPSHOT_FIELDS = new Set([
  "schema_version",
  "generated_at",
  "metadata_only",
  "raw_payload_retained",
  "dashboard_consumption",
  "attempts",
  "errors",
]);
const ALLOWED_ENTRY_FIELDS = new Set([
  "source_id",
  "worker",
  "task_id",
  "mode",
  "authority_level",
  "execution_state",
  "command_path",
  "expected_response",
  "observed_response",
  "output_contract_diagnostic",
  "proposal_target_file",
  "proposal_change_kind",
  "proposal_summary",
  "exit_code",
  "timed_out",
  "observed_at",
  "evidence_ref",
  "status_event_ref",
  "copied_tracked_files",
  "copy_bytes",
  "copy_retained",
  "network_allowed",
  "session_inheritance_allowed",
  "source_mutation_allowed",
  "tools_allowed",
  "raw_output_retained",
  "affects_trust",
  "affects_routing",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasRawMarker(value) {
  if (typeof value === "string") {
    return RAW_MARKER_PATTERN.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasRawMarker(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => hasRawMarker(item));
  }
  return false;
}

function safeSourceId(attempt, index) {
  const source = `${attempt.attempt_id}:${attempt.worker}:${attempt.execution_state}:${attempt.observed_at}:${index}`;
  return source.replace(/[^a-z0-9:._-]/gi, "_");
}

export function copiedWorktreeAttemptToPipelineEvidence(attempt, index = 0) {
  const validation = validateCopiedWorktreeExecutionAttempt(attempt);
  if (!validation.ok) {
    return { ok: false, evidence: null, validation };
  }
  const evidence = {
    source_id: safeSourceId(attempt, index),
    worker: attempt.worker,
    task_id: attempt.task_id,
    mode: attempt.mode,
    authority_level: attempt.authority_level,
    execution_state: attempt.execution_state,
    command_path: attempt.command_path,
    expected_response: attempt.expected_response,
    observed_response: attempt.observed_response,
    output_contract_diagnostic: attempt.output_contract_diagnostic,
    ...(attempt.task_id === "starter_patch_proposal" ? {
      proposal_target_file: attempt.proposal_target_file,
      proposal_change_kind: attempt.proposal_change_kind,
      proposal_summary: attempt.proposal_summary,
    } : {}),
    exit_code: attempt.exit_code,
    timed_out: attempt.timed_out,
    observed_at: attempt.observed_at,
    evidence_ref: attempt.evidence_ref,
    status_event_ref: `${attempt.evidence_ref}:status-event`,
    copied_tracked_files: attempt.copied_tracked_files,
    copy_bytes: attempt.copy_bytes,
    copy_retained: attempt.copy_retained,
    network_allowed: attempt.network_allowed,
    session_inheritance_allowed: attempt.session_inheritance_allowed,
    source_mutation_allowed: attempt.source_mutation_allowed,
    tools_allowed: attempt.tools_allowed,
    raw_output_retained: attempt.raw_output_retained,
    affects_trust: attempt.affects_trust,
    affects_routing: attempt.affects_routing,
  };
  return { ok: validatePipelineEvidenceEntry(evidence).ok, evidence, validation };
}

export function validatePipelineEvidenceEntry(entry) {
  const reasons = [];
  const add = (field, reason = "invalid_pipeline_evidence_entry") => reasons.push({ field, reason });
  if (!isRecord(entry)) {
    add("$");
  }
  const input = isRecord(entry) ? entry : {};
  for (const key of Object.keys(input)) {
    if (!ALLOWED_ENTRY_FIELDS.has(key)) {
      add(key, "unexpected_field");
    }
  }
  if (hasRawMarker(input)) {
    add("$", "raw_or_secret_marker");
  }
  if (typeof input.source_id !== "string" || input.source_id.trim().length === 0) {
    add("source_id");
  }
  const taskId = typeof input.task_id === "string" ? input.task_id : "copy_execution_sentinel";
  if (input.expected_response !== expectedResponseForTask(taskId)) {
    add("expected_response");
  }
  const reconstructed = {
    attempt_id: taskId === "copy_execution_sentinel" ? `copy-exec:${input.worker}` : `copy-exec:${input.worker}:${taskId}`,
    worker: input.worker,
    mode: input.mode,
    authority_level: input.authority_level,
    execution_state: input.execution_state,
    command_path: input.command_path,
    command_args: input.worker === "claude" && input.command_path !== null ? commandArgsForTask(input.worker, taskId) : [],
    expected_response: input.expected_response,
    task_id: taskId,
    observed_response: input.observed_response,
    output_contract_diagnostic: input.output_contract_diagnostic,
    ...(taskId === "starter_patch_proposal" ? {
      proposal_target_file: input.proposal_target_file,
      proposal_change_kind: input.proposal_change_kind,
      proposal_summary: input.proposal_summary,
    } : {}),
    exit_code: input.exit_code,
    timed_out: input.timed_out,
    timeout_ms: 1000,
    observed_at: input.observed_at,
    evidence_ref: input.evidence_ref,
    shell_used: false,
    source_worktree: "/tmp/source-worktree",
    execution_cwd: "/tmp/kendall-worker-copy-exec-SNAPSHOT1",
    copied_tracked_files: input.copied_tracked_files,
    copy_bytes: input.copy_bytes,
    copy_retained: input.copy_retained,
    network_allowed: input.network_allowed,
    session_inheritance_allowed: input.session_inheritance_allowed,
    source_mutation_allowed: input.source_mutation_allowed,
    tools_allowed: input.tools_allowed,
    raw_output_retained: input.raw_output_retained,
    affects_trust: input.affects_trust,
    affects_routing: input.affects_routing,
  };
  const attemptValidation = validateCopiedWorktreeExecutionAttempt(reconstructed);
  if (!attemptValidation.ok) {
    add("$", "copied_worktree_contract_mismatch");
  }
  if (input.status_event_ref !== `${input.evidence_ref}:status-event`) {
    add("status_event_ref");
  }
  return { ok: reasons.length === 0, reasons };
}

export function buildGovernedWorkerEvidenceSnapshot({ attempts, generatedAt = new Date().toISOString() }) {
  const entries = [];
  const errors = [];
  for (const [index, attempt] of attempts.entries()) {
    const converted = copiedWorktreeAttemptToPipelineEvidence(attempt, index);
    if (converted.ok) {
      entries.push(converted.evidence);
    } else {
      errors.push({ attempt_id: converted.validation.attempt_id, worker: converted.validation.worker, reasons: converted.validation.field_reasons });
    }
  }
  const snapshot = {
    schema_version: GOVERNED_WORKER_EVIDENCE_SNAPSHOT_VERSION,
    generated_at: generatedAt,
    metadata_only: true,
    raw_payload_retained: false,
    dashboard_consumption: "no_live_calls",
    attempts: entries,
    errors,
  };
  return { snapshot, validation: validateGovernedWorkerEvidenceSnapshot(snapshot) };
}

export function validateGovernedWorkerEvidenceSnapshot(snapshot) {
  const reasons = [];
  const add = (field, reason = "invalid_evidence_snapshot") => reasons.push({ field, reason });
  if (!isRecord(snapshot)) {
    add("$");
  }
  const input = isRecord(snapshot) ? snapshot : {};
  for (const key of Object.keys(input)) {
    if (!ALLOWED_SNAPSHOT_FIELDS.has(key)) {
      add(key, "unexpected_field");
    }
  }
  if (hasRawMarker(input)) {
    add("$", "raw_or_secret_marker");
  }
  if (input.schema_version !== GOVERNED_WORKER_EVIDENCE_SNAPSHOT_VERSION) {
    add("schema_version");
  }
  if (!Number.isFinite(Date.parse(input.generated_at))) {
    add("generated_at");
  }
  if (input.metadata_only !== true) {
    add("metadata_only");
  }
  if (input.raw_payload_retained !== false) {
    add("raw_payload_retained");
  }
  if (input.dashboard_consumption !== "no_live_calls") {
    add("dashboard_consumption");
  }
  if (!Array.isArray(input.attempts)) {
    add("attempts");
  } else {
    input.attempts.forEach((entry, index) => {
      const validation = validatePipelineEvidenceEntry(entry);
      if (!validation.ok) {
        add(`attempts.${index}`, "invalid_pipeline_evidence_entry");
      }
    });
  }
  if (!Array.isArray(input.errors)) {
    add("errors");
  } else if (hasRawMarker(input.errors)) {
    add("errors", "raw_or_secret_marker");
  }
  return { ok: reasons.length === 0, reasons };
}

export function resolveDefaultEvidenceOutputPath({ cwd = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  const stamp = generatedAt.replace(/[^0-9a-z]/gi, "").slice(0, 14) || "snapshot";
  return resolve(cwd, DEFAULT_LOCAL_EVIDENCE_ROOT, `copied-worktree-${stamp}.json`);
}

function realpathNearestExistingAncestor(pathValue) {
  return realpathSync(nearestExistingAncestor(pathValue));
}

function nearestExistingAncestor(pathValue) {
  let current = pathValue;
  while (!existsSync(current)) {
    const next = dirname(current);
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
}

function pathIsUnder(parent, child) {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function validateEvidenceOutputPath(outputPath, { cwd = process.cwd(), sourceWorktree = null } = {}) {
  const reasons = [];
  if (typeof outputPath !== "string" || !isAbsolute(outputPath)) {
    reasons.push({ field: "output", reason: "output_not_absolute" });
    return { ok: false, reasons, resolvedPath: outputPath };
  }
  const resolvedPath = resolve(outputPath);
  const evidenceRoot = resolve(cwd, DEFAULT_LOCAL_EVIDENCE_ROOT);
  const sourceRoot = resolve(cwd);
  const tmpRoot = realpathSync("/tmp");
  const parent = dirname(resolvedPath);
  const relativeToEvidenceRoot = relative(evidenceRoot, resolvedPath);
  const relativeToSourceRoot = relative(sourceRoot, resolvedPath);
  const relativeToTmp = relative(tmpRoot, resolvedPath);
  const underEvidenceRoot = relativeToEvidenceRoot !== "" && !relativeToEvidenceRoot.startsWith("..") && !isAbsolute(relativeToEvidenceRoot);
  const underSourceRoot = relativeToSourceRoot !== "" && !relativeToSourceRoot.startsWith("..") && !isAbsolute(relativeToSourceRoot);
  const underTmp = relativeToTmp !== "" && !relativeToTmp.startsWith("..") && !isAbsolute(relativeToTmp);
  if (!underEvidenceRoot && !underTmp) {
    reasons.push({ field: "output", reason: "output_outside_safe_roots" });
  }
  if (underSourceRoot && !underEvidenceRoot) {
    reasons.push({ field: "output", reason: "output_inside_source_worktree" });
  }
  if (existsSync(resolvedPath)) {
    reasons.push({ field: "output", reason: "output_exists" });
  }
  if (basename(resolvedPath).startsWith(".")) {
    reasons.push({ field: "output", reason: "hidden_output_file" });
  }
  if (!resolvedPath.endsWith(".json")) {
    reasons.push({ field: "output", reason: "output_not_json" });
  }
  const realSourceRoot = existsSync(sourceRoot) ? realpathSync(sourceRoot) : sourceRoot;
  const realExplicitSourceRoot = typeof sourceWorktree === "string" && isAbsolute(sourceWorktree) && existsSync(sourceWorktree)
    ? realpathSync(sourceWorktree)
    : null;
  const realParentAnchor = realpathNearestExistingAncestor(parent);
  const parentExists = existsSync(parent);
  const realParent = parentExists ? realpathSync(parent) : realParentAnchor;
  const realParentUnderSource = pathIsUnder(realSourceRoot, realParent);
  const realParentUnderExplicitSource = realExplicitSourceRoot !== null
    && realExplicitSourceRoot !== realSourceRoot
    && pathIsUnder(realExplicitSourceRoot, realParent);
  if (realParentUnderExplicitSource) {
    reasons.push({ field: "output", reason: "output_inside_source_worktree" });
  }
  if (realParentUnderSource && !underEvidenceRoot) {
    reasons.push({ field: "output", reason: "output_realpath_inside_source_worktree" });
  }
  if (underTmp && !pathIsUnder(tmpRoot, realParentAnchor)) {
    reasons.push({ field: "output", reason: "output_realpath_outside_tmp" });
  }
  if (underEvidenceRoot && existsSync(evidenceRoot)) {
    const realEvidenceRoot = realpathSync(evidenceRoot);
    if (!pathIsUnder(realEvidenceRoot, realParentAnchor)) {
      reasons.push({ field: "output", reason: "output_realpath_outside_evidence_root" });
    }
  }
  if (underEvidenceRoot && !existsSync(evidenceRoot)) {
    const evidenceAnchor = nearestExistingAncestor(evidenceRoot);
    const realEvidenceAnchor = realpathSync(evidenceAnchor);
    if (resolve(evidenceAnchor) !== realEvidenceAnchor && resolve(evidenceAnchor) !== sourceRoot) {
      reasons.push({ field: "output", reason: "output_symlinked_evidence_ancestor" });
    }
  }
  if (parentExists) {
    if (!statSync(realParent).isDirectory()) {
      reasons.push({ field: "output", reason: "output_parent_not_directory" });
    }
  }
  return { ok: reasons.length === 0, reasons, resolvedPath };
}

export function validateEvidenceInputPath(inputPath, { cwd = process.cwd() } = {}) {
  const reasons = [];
  if (typeof inputPath !== "string" || !isAbsolute(inputPath)) {
    reasons.push({ field: "input_results", reason: "input_not_absolute" });
    return { ok: false, reasons, resolvedPath: inputPath };
  }
  const resolvedPath = resolve(inputPath);
  const evidenceRoot = resolve(cwd, DEFAULT_LOCAL_EVIDENCE_ROOT);
  const tmpRoot = realpathSync("/tmp");
  const relativeToEvidenceRoot = relative(evidenceRoot, resolvedPath);
  const relativeToTmp = relative(tmpRoot, resolvedPath);
  const underEvidenceRoot = relativeToEvidenceRoot !== "" && !relativeToEvidenceRoot.startsWith("..") && !isAbsolute(relativeToEvidenceRoot);
  const underTmp = relativeToTmp !== "" && !relativeToTmp.startsWith("..") && !isAbsolute(relativeToTmp);
  if (!underEvidenceRoot && !underTmp) {
    reasons.push({ field: "input_results", reason: "input_outside_safe_roots" });
  }
  if (!resolvedPath.endsWith(".json")) {
    reasons.push({ field: "input_results", reason: "input_not_json" });
  }
  return { ok: reasons.length === 0, reasons, resolvedPath };
}

export function writeGovernedWorkerEvidenceSnapshot(snapshot, outputPath, options = {}) {
  const validation = validateGovernedWorkerEvidenceSnapshot(snapshot);
  if (!validation.ok) {
    return { ok: false, output_path: null, errors: validation.reasons };
  }
  const pathValidation = validateEvidenceOutputPath(outputPath, options);
  if (!pathValidation.ok) {
    return { ok: false, output_path: pathValidation.resolvedPath, errors: pathValidation.reasons };
  }
  mkdirSync(dirname(pathValidation.resolvedPath), { recursive: true });
  try {
    writeFileSync(pathValidation.resolvedPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    return { ok: false, output_path: pathValidation.resolvedPath, errors: [{ field: "output", reason: error.code === "EEXIST" ? "output_exists" : "output_write_failed" }] };
  }
  return { ok: true, output_path: pathValidation.resolvedPath, errors: [] };
}

function parseArgs(args) {
  const outputIndex = args.indexOf("--output");
  const observedAtIndex = args.indexOf("--observed-at");
  const inputIndex = args.indexOf("--input-results");
  const sourceIndex = args.indexOf("--source-worktree");
  const generatedAt = observedAtIndex >= 0 && typeof args[observedAtIndex + 1] === "string" ? args[observedAtIndex + 1] : new Date().toISOString();
  const output = outputIndex >= 0 && typeof args[outputIndex + 1] === "string" ? args[outputIndex + 1] : resolveDefaultEvidenceOutputPath({ generatedAt });
  const inputResults = inputIndex >= 0 && typeof args[inputIndex + 1] === "string" ? args[inputIndex + 1] : null;
  const sourceValueMissing = sourceIndex >= 0 && (typeof args[sourceIndex + 1] !== "string" || args[sourceIndex + 1].startsWith("--"));
  const requestedSourceWorktree = sourceIndex >= 0 && !sourceValueMissing ? args[sourceIndex + 1] : process.cwd();
  const sourceValidation = sourceValueMissing
    ? { sourceWorktree: null, errors: [{ field: "source_worktree", reason: "source_worktree_missing" }] }
    : validateSourceWorktreeArg(requestedSourceWorktree);
  return { output, generatedAt, inputResults, sourceWorktree: sourceValidation.sourceWorktree, errors: sourceValidation.errors };
}

function validateSourceWorktreeArg(sourceWorktree) {
  if (typeof sourceWorktree !== "string" || !isAbsolute(sourceWorktree)) {
    return { sourceWorktree, errors: [{ field: "source_worktree", reason: "source_worktree_not_absolute" }] };
  }
  try {
    const realSourceWorktree = realpathSync(sourceWorktree);
    if (!statSync(realSourceWorktree).isDirectory()) {
      return { sourceWorktree: realSourceWorktree, errors: [{ field: "source_worktree", reason: "source_worktree_not_directory" }] };
    }
    return { sourceWorktree: realSourceWorktree, errors: [] };
  } catch {
    return { sourceWorktree, errors: [{ field: "source_worktree", reason: "source_worktree_unreadable" }] };
  }
}

function attemptsFromInputResults(inputResults) {
  const pathValidation = validateEvidenceInputPath(inputResults);
  if (!pathValidation.ok) {
    return { attempts: [], errors: pathValidation.reasons };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(pathValidation.resolvedPath, "utf8"));
  } catch {
    return { attempts: [], errors: [{ field: "input_results", reason: "input_unreadable_or_invalid_json" }] };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
    return { attempts: [], errors: [{ field: "input_results", reason: "input_missing_results" }] };
  }
  return { attempts: parsed.results.map((result) => result.attempt).filter(Boolean), errors: [] };
}

function main() {
  const args = process.argv.slice(2);
  const { output, generatedAt, inputResults, sourceWorktree, errors } = parseArgs(args);
  if (errors.length > 0) {
    console.log(JSON.stringify({ ok: false, output_path: null, errors }, null, 2));
    process.exit(1);
  }
  const collected = inputResults
    ? attemptsFromInputResults(inputResults)
    : { attempts: collectCopiedWorktreeExecutionAttempts({ observedAt: generatedAt, sourceWorktree }).map((result) => result.attempt), errors: [] };
  if (collected.errors.length > 0) {
    console.log(JSON.stringify({ ok: false, output_path: null, errors: collected.errors }, null, 2));
    process.exit(1);
  }
  const { snapshot, validation } = buildGovernedWorkerEvidenceSnapshot({ attempts: collected.attempts, generatedAt });
  const result = validation.ok
    ? writeGovernedWorkerEvidenceSnapshot(snapshot, output, { sourceWorktree })
    : { ok: false, output_path: null, errors: validation.reasons };
  console.log(JSON.stringify({ ...result, snapshot }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
