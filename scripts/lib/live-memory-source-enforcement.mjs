export const LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY = Object.freeze({
  authorityFamily: "memory-writeback-and-source-mutation",
  allowedOperations: Object.freeze([
    "read_approved_source_ref",
    "inspect_approved_source_metadata",
    "create_memory_proposal",
    "create_dry_run_write_plan",
    "create_draft_write_preview",
    "rebuild_llm_wiki_from_approved_refs",
    "preserve_metadata_evidence",
    "block_unsafe_source_state",
  ]),
  forbiddenOperations: Object.freeze([
    "direct_canonical_obsidian_mutation",
    "llm_wiki_promote_to_canonical_memory",
    "copy_excluded_private_source_content",
    "mutate_source",
    "pipeline_live_runtime_call",
    "retain_raw_payload",
    "derived_authority_escalation",
  ]),
  stopLines: Object.freeze([
    "excluded_source",
    "blocked_source",
    "missing_source",
    "unavailable_source",
    "stale_source",
    "unknown_source",
    "contradictory_source",
    "derived_only_source",
    "missing_explicit_operator_approval",
    "missing_approval_metadata",
    "missing_backup",
    "missing_rollback",
    "missing_audit_event",
    "unscoped_target",
    "raw_payload_retention_forbidden",
    "source_copy_retention_forbidden",
    "unknown_operation",
    "forbidden_operation",
  ]),
  rollbackRequirements: Object.freeze([
    "backup_path",
    "draft_quarantine",
    "proposal_rejection",
    "evidence_preservation",
    "operator_visible_rollback",
    "no_silent_retry",
  ]),
  auditEventSchema: Object.freeze([
    "authorityFamily",
    "operation",
    "decision",
    "reasonCodes",
    "retentionClass",
    "rawPayloadRetained",
    "sourceContentCopied",
    "operatorApprovalRequired",
    "backupRequired",
    "rollbackRequired",
  ]),
  operatorApprovalRequirements: Object.freeze([
    "explicit_operator_approval",
    "approved_source_refs",
    "backup_path",
    "rollback_path",
    "metadata_only_evidence",
    "scoped_target",
    "no_excluded_private_source_content",
    "no_raw_payload_retention",
    "no_source_copy_retention",
  ]),
  progressiveAuthorityPhases: Object.freeze([
    "contract_policy",
    "fake_adapter",
    "dry_run_real_tool",
    "read_only_live",
    "bounded_write",
    "human_approved_execution",
  ]),
});

const BLOCKED_OPERATIONS = Object.freeze([
  "write_back",
  "source_copy",
  "promotion",
  "authority_escalation",
]);

const FORBIDDEN_OPERATION_ALIASES = new Set([
  "direct_canonical_obsidian_mutation",
  "canonical_obsidian_write",
  "mutate_source",
  "source_mutation",
  "promote_llm_wiki_to_canonical",
  "llm_wiki_promote_to_canonical_memory",
  "pipeline_live_runtime_call",
  "retain_raw_payload",
]);

const ALLOWED_OPERATIONS = new Set(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.allowedOperations);

const SAFE_SOURCE_TYPES = new Set([
  "candidate_work",
  "work_item",
  "bmad_artifact",
  "obsidian",
  "github",
  "research",
  "manual",
]);

const KNOWN_ACCESS_STATES = new Set(["allowed", "excluded", "blocked", "missing", "unavailable"]);
const KNOWN_FRESHNESS_STATES = new Set(["fresh", "stale", "unknown"]);
const KNOWN_CANONICALITY_STATES = new Set(["canonical_human_owned", "approved_source_ref", "derived_rebuildable"]);
const KNOWN_CONTRADICTION_STATES = new Set(["none", "contradictory"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function sourceReasonCodes(sourceRef) {
  const reasons = [];
  if (sourceRef === undefined || sourceRef === null) {
    reasons.push("missing_source");
    return reasons;
  }
  if (!isRecord(sourceRef)) {
    reasons.push("unknown_source");
    return reasons;
  }
  if (!isNonBlankString(sourceRef.sourceType)) {
    addReason(reasons, "unknown_source");
  } else if (sourceRef.sourceType === "llm_wiki") {
    addReason(reasons, "derived_only_source");
  } else if (!SAFE_SOURCE_TYPES.has(sourceRef.sourceType)) {
    addReason(reasons, "unknown_source");
  }
  if (!KNOWN_ACCESS_STATES.has(sourceRef.accessState)) {
    addReason(reasons, "unknown_source");
  }
  if (!KNOWN_FRESHNESS_STATES.has(sourceRef.freshness)) {
    addReason(reasons, "unknown_source");
  }
  if (!KNOWN_CANONICALITY_STATES.has(sourceRef.canonicality)) {
    addReason(reasons, "unknown_source");
  }
  if (!KNOWN_CONTRADICTION_STATES.has(sourceRef.contradictionStatus)) {
    addReason(reasons, "unknown_source");
  }
  if (sourceRef.accessState === "excluded") {
    addReason(reasons, "excluded_source");
  }
  if (sourceRef.accessState === "blocked") {
    addReason(reasons, "blocked_source");
  }
  if (sourceRef.accessState === "missing") {
    addReason(reasons, "missing_source");
  }
  if (sourceRef.accessState === "unavailable") {
    addReason(reasons, "unavailable_source");
  }
  if (sourceRef.freshness === "stale") {
    addReason(reasons, "stale_source");
  }
  if (sourceRef.freshness === "unknown") {
    addReason(reasons, "unknown_source");
  }
  if (sourceRef.contradictionStatus === "contradictory") {
    addReason(reasons, "contradictory_source");
  }
  if (sourceRef.canonicality === "derived_rebuildable" || sourceRef.sourceType === "llm_wiki") {
    addReason(reasons, "derived_only_source");
  }
  return reasons;
}

function decisionAuditEvent({ operation, decision, reasonCodes, retentionClass }) {
  const approvalRequired =
    operation === "create_draft_write_preview" ||
    reasonCodes.includes("missing_explicit_operator_approval") ||
    reasonCodes.includes("missing_approval_metadata");
  const recoveryRequired = operation === "create_draft_write_preview" || operation === "create_dry_run_write_plan";
  const backupRequired = recoveryRequired || reasonCodes.includes("missing_backup");
  const rollbackRequired = recoveryRequired || reasonCodes.includes("missing_rollback");

  return {
    authorityFamily: LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.authorityFamily,
    operation,
    decision,
    reasonCodes,
    retentionClass,
    rawPayloadRetained: false,
    sourceContentCopied: false,
    operatorApprovalRequired: approvalRequired,
    backupRequired,
    rollbackRequired,
  };
}

export function evaluateLiveMemorySourceEnforcement(input = {}) {
  const operation = input.operation ?? "unknown_operation";
  const requestedRetention = input.requestedRetention ?? "metadata_only";
  const reasonCodes = [];
  let decision = "allowed";

  if (FORBIDDEN_OPERATION_ALIASES.has(operation)) {
    reasonCodes.push("forbidden_operation");
  } else if (!ALLOWED_OPERATIONS.has(operation)) {
    reasonCodes.push("unknown_operation");
  }

  if (
    requestedRetention !== "metadata_only" &&
    requestedRetention !== "summary"
  ) {
    if (requestedRetention === "source_copy" || requestedRetention === "source_content_copy") {
      reasonCodes.push("source_copy_retention_forbidden");
    } else {
      reasonCodes.push("raw_payload_retention_forbidden");
    }
  }
  if (input.rawPayloadRetained === true) {
    reasonCodes.push("raw_payload_retention_forbidden");
  }
  if (input.sourceContentCopied === true) {
    reasonCodes.push("source_copy_retention_forbidden");
  }

  reasonCodes.push(...sourceReasonCodes(input.sourceRef));

  if (operation === "create_draft_write_preview") {
    if (input.explicitApproval !== true) {
      reasonCodes.push("missing_explicit_operator_approval");
    }
    if (!isNonBlankString(input.approvalRef)) {
      reasonCodes.push("missing_approval_metadata");
    }
    if (!isNonBlankString(input.backupPath)) {
      reasonCodes.push("missing_backup");
    }
    if (!isNonBlankString(input.rollbackPath)) {
      reasonCodes.push("missing_rollback");
    }
  }

  if (operation === "create_dry_run_write_plan") {
    if (!isNonBlankString(input.backupPath)) {
      reasonCodes.push("missing_backup");
    }
    if (!isNonBlankString(input.rollbackPath)) {
      reasonCodes.push("missing_rollback");
    }
  }

  const hardBlocked = reasonCodes.some((reasonCode) =>
    reasonCode !== "missing_explicit_operator_approval" &&
    reasonCode !== "missing_approval_metadata"
  );

  if (hardBlocked) {
    decision = "blocked";
  } else if (
    reasonCodes.includes("missing_explicit_operator_approval") ||
    reasonCodes.includes("missing_approval_metadata")
  ) {
    decision = "requires_human_gate";
  }

  if (decision === "allowed") {
    if (operation === "create_memory_proposal") {
      reasonCodes.push("metadata_proposal_allowed");
    }
    if (operation === "create_draft_write_preview") {
      reasonCodes.push("approved_draft_preview");
    }
    if (operation === "create_dry_run_write_plan") {
      reasonCodes.push("dry_run_write_plan_allowed");
    }
    if (operation === "inspect_approved_source_metadata") {
      reasonCodes.push("approved_source_metadata_inspection");
    }
  }

  return {
    decision,
    authorityFamily: LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.authorityFamily,
    reasonCodes,
    blockedOperations: decision === "blocked" ? [...BLOCKED_OPERATIONS] : [],
    auditEvent: decisionAuditEvent({
      operation,
      decision,
      reasonCodes,
      retentionClass: requestedRetention === "summary" ? "summary" : "metadata_only",
    }),
    recovery: {
      backupPath: isNonBlankString(input.backupPath) ? input.backupPath : null,
      rollbackPath: isNonBlankString(input.rollbackPath) ? input.rollbackPath : null,
      rollbackRequired: operation === "create_draft_write_preview" || operation === "create_dry_run_write_plan",
      preserveEvidence: true,
      silentRetryAllowed: false,
    },
  };
}
