// TEST-ONLY legacy fixture. This module is deliberately not exported through
// the manager control-plane runtime barrel and must never be used for runtime
// dispatch, durable claims, or provider execution. Supervisor owns that path.
import { createHash } from "node:crypto";

import {
  CANONICAL_REVIEW_FALLBACK_ORDER,
  CANONICAL_REVIEW_FALLBACK_SCHEMA_VERSION,
  CLAUDE_READONLY_INJECTED_ADAPTER_ID,
  OLLAMA_EXACT_INJECTED_ADAPTER_ID,
  disclosurePacketCanonicalDigest,
  validateDisclosurePacket,
} from "./review-route.mjs";

export const REVIEW_EXECUTION_LEDGER_SCHEMA_VERSION = "review-execution-ledger/v1";
export const REVIEW_EXECUTION_TERMINAL_SCHEMA_VERSION = "review-execution-terminal/v1";
export const APPROVED_OLLAMA_ENDPOINT_REF = "ollama-endpoint:192.168.1.128:11434/v1/chat/completions";
export const APPROVED_OLLAMA_MODEL_REF = "ollama-model:qwen3-14b";
export const CLAUDE_READONLY_ARGV = Object.freeze([
  "claude",
  "-p",
  "Review only the supplied sanitized transient diff scope and return compact finding metadata.",
  "--allowedTools",
  "Read,Grep",
]);

const IDENTITY_FIELDS = Object.freeze(["executionJobId", "exactHead", "digest"]);
const APPROVAL_FIELDS = Object.freeze(["status", "authorityRef", "disclosurePacketId", "exactHead", "reviewScope"]);
const CLAUDE_APPROVAL_FIELDS = Object.freeze([...APPROVAL_FIELDS, "tenantPolicy"]);
const OLLAMA_GATE_FIELDS = Object.freeze(["enabled", "endpointApproved", "modelApproved", "endpointRef", "modelRef"]);
const LEDGER_FIELDS = Object.freeze(["schemaVersion", "revision", "records"]);
const EXACT_HEAD = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:/-]{1,180}$/;
const TERMINAL_STATUSES = new Set(["completed", "failed", "timed_out", "cancelled", "inconclusive"]);

/**
 * Creates a serializable ledger seed. Persistence is deliberately left to a
 * separately governed store; callers must atomically replace the returned
 * ledger after a successful terminal transition.
 */
export function createReviewExecutionLedger() {
  return { schemaVersion: REVIEW_EXECUTION_LEDGER_SCHEMA_VERSION, revision: 0, records: [] };
}

/**
 * Executes exactly one injected review adapter fixture. This module never imports a
 * provider SDK, child-process API, network API, or supervisor/dashboard code.
 * Private diff material is held only in a local variable between the injected
 * materializer and injected adapter, then discarded before the terminal record
 * is returned.
 */
export async function executeInjectedReview(input = {}) {
  const prepared = prepareExecution(input);
  if (!prepared.ok) return unrecordedUnsatisfied(prepared.code);

  const { packet, routeId, adapterId, ledger, currentImmutableReview, expectedLedgerRevision } = prepared;
  if (!sameIdentity(packet.immutableReview, currentImmutableReview)) {
    return commitTerminal(ledger, packet, terminal(routeId, adapterId, "stale", "immutable_identity_stale", false, null), expectedLedgerRevision);
  }
  if (ledger.records.some((record) => record.disclosurePacketId === packet.disclosurePacketId && record.consumed === true)) {
    return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_unsatisfied", "packet_already_used", false, null), expectedLedgerRevision);
  }

  let transientDiff = null;
  try {
    transientDiff = normalizeTransientDiff(await input.transientDiffMaterializer(copyScope(packet.scope)), packet.scope.pathScope);
    if (!transientDiff) return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_unsatisfied", "transient_scope_invalid", false, null), expectedLedgerRevision);
    const adapterResult = await input.adapter.execute({
      adapterId,
      argv: routeId === "claude_readonly" ? [...CLAUDE_READONLY_ARGV] : null,
      allowedTools: routeId === "claude_readonly" ? ["Read", "Grep"] : [],
      immutableReview: { ...packet.immutableReview },
      packetId: packet.disclosurePacketId,
      packetDigest: disclosurePacketCanonicalDigest(packet),
      transientScope: copyScope(packet.scope),
      exactGate: routeId === "ollama_exact" ? copyExactGate(input.ollamaExactGate) : null,
      transientDiff,
    });
    const normalized = normalizeAdapterResult(adapterResult);
    if (!normalized) return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_unsatisfied", "adapter_result_invalid", true, null), expectedLedgerRevision);
    if (normalized.status !== "completed") return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_unsatisfied", `adapter_${normalized.status}`, true, normalized.findingCount), expectedLedgerRevision);
    return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_satisfied", "review_completed", true, normalized.findingCount), expectedLedgerRevision);
  } catch (error) {
    return commitTerminal(ledger, packet, terminal(routeId, adapterId, "review_unsatisfied", `adapter_exception:${safeErrorName(error)}`, true, null), expectedLedgerRevision);
  } finally {
    transientDiff = null;
  }
}

/** Apply one terminal result and its compact evidence as a single pure transition. */
export function commitTerminal(ledger, packet, nextTerminal, expectedRevision = ledger?.revision) {
  const normalizedLedger = copyLedger(ledger);
  if (!normalizedLedger || !Number.isInteger(expectedRevision) || normalizedLedger.revision !== expectedRevision || !validPacketIdentity(packet) || !validTerminal(nextTerminal)) return unrecordedUnsatisfied("terminal_commit_invalid");
  const record = {
    recordId: `review-terminal:sha256:${createHash("sha256").update(`${packet.disclosurePacketId}:${nextTerminal.code}:${normalizedLedger.revision}`).digest("hex")}`,
    disclosurePacketId: packet.disclosurePacketId,
    immutableReview: { ...packet.immutableReview },
    routeId: nextTerminal.routeId,
    adapterId: nextTerminal.adapterId,
    state: nextTerminal.state,
    code: nextTerminal.code,
    consumed: nextTerminal.invoked === true,
    evidence: {
      packetDigest: disclosurePacketCanonicalDigest(packet),
      pathScope: packet.scope.pathScope.map(({ path, diffDigest }) => ({ path, diffDigest })),
      findingCount: nextTerminal.findingCount,
      rawPayloadRetained: false,
      execution: "injected_adapter",
    },
  };
  return {
    ok: true,
    terminal: { ...nextTerminal, schemaVersion: REVIEW_EXECUTION_TERMINAL_SCHEMA_VERSION, deliveryEvidenceEligible: false, rawPayloadRetained: false },
    ledger: { schemaVersion: REVIEW_EXECUTION_LEDGER_SCHEMA_VERSION, revision: normalizedLedger.revision + 1, records: [...normalizedLedger.records, record] },
    atomicCommit: { expectedRevision, nextRevision: normalizedLedger.revision + 1 },
  };
}

function prepareExecution(input) {
  if (!isPlainObject(input) || !isPlainObject(input.packet) || !isPlainObject(input.fallbackDecision) || !isPlainObject(input.currentImmutableReview)
    || !isPlainObject(input.adapter) || typeof input.adapter.execute !== "function" || typeof input.transientDiffMaterializer !== "function") return { ok: false, code: "execution_input_invalid" };
  const routeId = validatedFallbackRoute(input.fallbackDecision);
  if (!routeId) return { ok: false, code: "fallback_decision_invalid" };
  const packet = input.packet;
  // Validate the packet's own immutable identity first; current-identity drift
  // becomes a terminal stale record below rather than an unrecorded rejection.
  const packetValidation = validateDisclosurePacket(packet, { now: input.now, routePolicy: input.routePolicy });
  if (!packetValidation.ok || packet.scope.dataClass !== "sanitized_path_scoped_private_diff" || packet.scope.pathScope.length === 0) return { ok: false, code: "packet_invalid" };
  const currentImmutableReview = copyIdentity(input.currentImmutableReview);
  const ledger = copyLedger(input.ledger === undefined ? createReviewExecutionLedger() : input.ledger);
  if (!currentImmutableReview || !ledger) return { ok: false, code: "execution_input_invalid" };
  const expectedLedgerRevision = input.expectedLedgerRevision === undefined ? ledger.revision : input.expectedLedgerRevision;
  if (!Number.isInteger(expectedLedgerRevision) || expectedLedgerRevision !== ledger.revision) return { ok: false, code: "ledger_revision_stale" };
  const adapterId = routeId === "claude_readonly" ? CLAUDE_READONLY_INJECTED_ADAPTER_ID : OLLAMA_EXACT_INJECTED_ADAPTER_ID;
  if (input.adapter.adapterId !== adapterId || !packet.routeAllowlist.includes(routeId) || !packet.adapterAllowlist.includes(adapterId)) return { ok: false, code: "adapter_not_allowlisted" };
  if (routeId === "claude_readonly") {
    if (!sameStringSet(packet.toolAllowlist, ["Read", "Grep"]) || !validClaudeApproval(input.approval, packet)) return { ok: false, code: "claude_approval_invalid" };
    if (CLAUDE_READONLY_ARGV.includes("--max-budget-usd") || !Object.isFrozen(CLAUDE_READONLY_ARGV)) return { ok: false, code: "claude_argv_invalid" };
  } else if (!sameStringSet(packet.toolAllowlist, ["none"]) || !validOllamaApproval(input.approval, packet) || !validExactGate(input.ollamaExactGate)) {
    return { ok: false, code: "ollama_review_gate_invalid" };
  }
  return { ok: true, packet, routeId, adapterId, currentImmutableReview, ledger, expectedLedgerRevision };
}

function terminal(routeId, adapterId, state, code, invoked, findingCount) {
  return { routeId, adapterId, state, code, invoked, findingCount };
}

function unrecordedUnsatisfied(code) {
  return {
    ok: false,
    terminal: {
      schemaVersion: REVIEW_EXECUTION_TERMINAL_SCHEMA_VERSION,
      routeId: null,
      adapterId: null,
      state: "review_unsatisfied",
      code,
      invoked: false,
      findingCount: null,
      deliveryEvidenceEligible: false,
      rawPayloadRetained: false,
    },
    ledger: null,
  };
}

function validClaudeApproval(value, packet) {
  return exactObject(value, CLAUDE_APPROVAL_FIELDS)
    && validApprovalBinding(value, packet)
    && value.tenantPolicy === "approved";
}

function validOllamaApproval(value, packet) {
  return exactObject(value, APPROVAL_FIELDS) && validApprovalBinding(value, packet);
}

function validApprovalBinding(value, packet) {
  return value.status === "accepted"
    && value.authorityRef === packet.authority.authorityRef
    && value.disclosurePacketId === packet.disclosurePacketId
    && value.exactHead === packet.immutableReview.exactHead
    && value.reviewScope === "sanitized_path_scoped_private_diff";
}

function validExactGate(value) {
  return exactObject(value, OLLAMA_GATE_FIELDS)
    && value.enabled === true
    && value.endpointApproved === true
    && value.modelApproved === true
    && value.endpointRef === APPROVED_OLLAMA_ENDPOINT_REF
    && value.modelRef === APPROVED_OLLAMA_MODEL_REF;
}

function copyExactGate(value) {
  return validExactGate(value) ? { endpointRef: value.endpointRef, modelRef: value.modelRef } : null;
}

function normalizeAdapterResult(value) {
  if (!exactObject(value, ["status", "findingCount"]) || !TERMINAL_STATUSES.has(value.status) || !Number.isInteger(value.findingCount) || value.findingCount < 0 || value.findingCount > 1000) return null;
  return { status: value.status, findingCount: value.findingCount };
}

/** The materializer may return only one sanitized text body for each digest-bound path. */
function normalizeTransientDiff(value, pathScope) {
  if (!Array.isArray(value) || value.length !== pathScope.length) return null;
  const files = [];
  for (let index = 0; index < pathScope.length; index += 1) {
    const entry = value[index];
    const expected = pathScope[index];
    if (!exactObject(entry, ["path", "text"]) || entry.path !== expected.path || typeof entry.text !== "string") return null;
    const digest = `sha256:${createHash("sha256").update(entry.text).digest("hex")}`;
    if (digest !== expected.diffDigest) return null;
    files.push({ path: entry.path, text: entry.text });
  }
  return files;
}

function validTerminal(value) {
  return isPlainObject(value)
    && ["claude_readonly", "ollama_exact"].includes(value.routeId)
    && [CLAUDE_READONLY_INJECTED_ADAPTER_ID, OLLAMA_EXACT_INJECTED_ADAPTER_ID].includes(value.adapterId)
    && ["review_satisfied", "review_unsatisfied", "stale"].includes(value.state)
    && typeof value.code === "string" && SAFE_ID.test(value.code.replace(/:/g, "-"))
    && typeof value.invoked === "boolean"
    && (value.findingCount === null || (Number.isInteger(value.findingCount) && value.findingCount >= 0 && value.findingCount <= 1000));
}

function copyLedger(value) {
  if (!exactObject(value, LEDGER_FIELDS) || value.schemaVersion !== REVIEW_EXECUTION_LEDGER_SCHEMA_VERSION || !Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.records) || value.records.length > 1024 || !value.records.every(validLedgerRecord)) return null;
  return { schemaVersion: value.schemaVersion, revision: value.revision, records: value.records.map((record) => ({ ...record })) };
}

function validLedgerRecord(value) {
  return isPlainObject(value)
    && safeId(value.recordId)
    && safeId(value.disclosurePacketId)
    && copyIdentity(value.immutableReview)
    && ["claude_readonly", "ollama_exact"].includes(value.routeId)
    && [CLAUDE_READONLY_INJECTED_ADAPTER_ID, OLLAMA_EXACT_INJECTED_ADAPTER_ID].includes(value.adapterId)
    && ["review_satisfied", "review_unsatisfied", "stale"].includes(value.state)
    && typeof value.code === "string"
    && typeof value.consumed === "boolean"
    && isPlainObject(value.evidence)
    && value.evidence.rawPayloadRetained === false
    && value.evidence.execution === "injected_adapter";
}

function validatedFallbackRoute(value) {
  if (!isPlainObject(value)
    || value.schemaVersion !== CANONICAL_REVIEW_FALLBACK_SCHEMA_VERSION
    || value.state !== "report_only"
    || value.execution !== "none"
    || value.metadataOnly !== true
    || value.rawPayloadRetained !== false
    || !Array.isArray(value.orderedRouteIds)
    || value.orderedRouteIds.length !== CANONICAL_REVIEW_FALLBACK_ORDER.length
    || value.orderedRouteIds.some((routeId, index) => routeId !== CANONICAL_REVIEW_FALLBACK_ORDER[index])
    || !isPlainObject(value.controllingReason)
    || typeof value.controllingReason.code !== "string") return null;
  if (value.selectedRouteId === "claude_readonly" && value.controllingReason.code === "claude_prepared" && sameStringSet(value.skippedRouteIds, [])) return "claude_readonly";
  if (value.selectedRouteId === "ollama_exact" && value.controllingReason.code === "ollama_prepared" && sameStringSet(value.skippedRouteIds, ["claude_readonly"])) return "ollama_exact";
  return null;
}

function validPacketIdentity(packet) {
  return isPlainObject(packet) && safeId(packet.disclosurePacketId) && copyIdentity(packet.immutableReview) && isPlainObject(packet.scope) && Array.isArray(packet.scope.pathScope);
}

function copyIdentity(value) {
  return exactObject(value, IDENTITY_FIELDS) && safeId(value.executionJobId) && EXACT_HEAD.test(value.exactHead) && DIGEST.test(value.digest)
    ? { executionJobId: value.executionJobId, exactHead: value.exactHead, digest: value.digest }
    : null;
}

function copyScope(scope) {
  return { dataClass: scope.dataClass, pathScope: scope.pathScope.map(({ path, diffDigest }) => ({ path, diffDigest })) };
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.executionJobId === right.executionJobId && left.exactHead === right.exactHead && left.digest === right.digest);
}

function sameStringSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value) => expected.includes(value)) && new Set(actual).size === actual.length;
}

function safeErrorName(error) {
  return error && typeof error === "object" && typeof error.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(error.name) ? error.name : "Error";
}

function safeId(value) {
  return typeof value === "string" && SAFE_ID.test(value);
}

function exactObject(value, fields) {
  if (!isPlainObject(value)) return false;
  const names = Object.keys(value);
  return names.length === fields.length && names.every((name) => fields.includes(name));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
