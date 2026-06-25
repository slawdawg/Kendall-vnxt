import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY,
  evaluateLiveMemorySourceEnforcement,
} from "../scripts/lib/live-memory-source-enforcement.mjs";

const policyDoc = readFileSync("docs/workflows/live-memory-source-enforcement.md", "utf8");

function baseInput(overrides = {}) {
  return {
    operation: "create_memory_proposal",
    sourceRef: {
      sourceType: "obsidian",
      accessState: "allowed",
      freshness: "fresh",
      canonicality: "canonical_human_owned",
      contradictionStatus: "none",
    },
    explicitApproval: false,
    approvalRef: null,
    backupPath: null,
    rollbackPath: null,
    requestedRetention: "metadata_only",
    ...overrides,
  };
}

function assertAuditEventMatchesSchema(result) {
  assert.deepEqual(
    Object.keys(result.auditEvent).sort(),
    [...LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.auditEventSchema].sort()
  );
}

test("policy document defines the bounded authority contract", () => {
  assert.equal(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.authorityFamily, "memory-writeback-and-source-mutation");
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.allowedOperations.includes("create_memory_proposal"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.allowedOperations.includes("create_draft_write_preview"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.forbiddenOperations.includes("direct_canonical_obsidian_mutation"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.forbiddenOperations.includes("llm_wiki_promote_to_canonical_memory"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.stopLines.includes("excluded_source"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.stopLines.includes("unavailable_source"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.stopLines.includes("missing_backup"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.rollbackRequirements.includes("backup_path"));
  assert.ok(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.operatorApprovalRequirements.includes("explicit_operator_approval"));
  assert.deepEqual(LIVE_MEMORY_SOURCE_ENFORCEMENT_POLICY.progressiveAuthorityPhases, [
    "contract_policy",
    "fake_adapter",
    "dry_run_real_tool",
    "read_only_live",
    "bounded_write",
    "human_approved_execution",
  ]);

  for (const required of [
    "memory-writeback-and-source-mutation",
    "direct canonical Obsidian mutation is forbidden",
    "LLM-Wiki is derived, disposable, and rebuildable",
    "metadata-only evidence",
    "contract/policy first",
    "fake adapter",
    "dry-run real-tool",
    "read-only live",
    "bounded write",
    "human-approved execution",
  ]) {
    assert.match(policyDoc, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("safe proposal creation is allowed as metadata-only evidence", () => {
  const result = evaluateLiveMemorySourceEnforcement(baseInput());

  assert.equal(result.decision, "allowed");
  assert.equal(result.authorityFamily, "memory-writeback-and-source-mutation");
  assert.deepEqual(result.reasonCodes, ["metadata_proposal_allowed"]);
  assert.equal(result.auditEvent.rawPayloadRetained, false);
  assert.equal(result.auditEvent.retentionClass, "metadata_only");
  assert.equal(result.auditEvent.sourceContentCopied, false);
  assertAuditEventMatchesSchema(result);
});

test("draft write preview requires explicit approval metadata, backup path, and rollback path", () => {
  const withoutApproval = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    approvalRef: "approval:story-7-1-fixture",
    backupPath: "backups/proposal-1.md",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(withoutApproval.decision, "requires_human_gate");
  assert.ok(withoutApproval.reasonCodes.includes("missing_explicit_operator_approval"));

  const withoutApprovalMetadata = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: true,
    approvalRef: "   ",
    backupPath: "backups/proposal-1.md",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(withoutApprovalMetadata.decision, "requires_human_gate");
  assert.ok(withoutApprovalMetadata.reasonCodes.includes("missing_approval_metadata"));

  const withoutBackup = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: true,
    approvalRef: "approval:story-7-1-fixture",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(withoutBackup.decision, "blocked");
  assert.ok(withoutBackup.reasonCodes.includes("missing_backup"));

  const withoutRollback = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: true,
    approvalRef: "approval:story-7-1-fixture",
    backupPath: "backups/proposal-1.md",
  }));
  assert.equal(withoutRollback.decision, "blocked");
  assert.ok(withoutRollback.reasonCodes.includes("missing_rollback"));

  const approved = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: true,
    approvalRef: "approval:story-7-1-fixture",
    backupPath: "backups/proposal-1.md",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(approved.decision, "allowed");
  assert.ok(approved.reasonCodes.includes("approved_draft_preview"));
  assert.equal(approved.recovery.backupPath, "backups/proposal-1.md");
  assert.equal(approved.recovery.rollbackPath, "rollbacks/proposal-1.md");
});

test("direct canonical writes, source mutation, and LLM-Wiki promotion are blocked", () => {
  for (const operation of [
    "direct_canonical_obsidian_mutation",
    "mutate_source",
    "promote_llm_wiki_to_canonical",
  ]) {
    const result = evaluateLiveMemorySourceEnforcement(baseInput({ operation }));
    assert.equal(result.decision, "blocked", operation);
    assert.ok(result.reasonCodes.includes("forbidden_operation"), operation);
  }
});

test("unsafe source states block write-back, source copying, promotion, and authority escalation", () => {
  const cases = [
    ["excluded_source", { accessState: "excluded" }],
    ["blocked_source", { accessState: "blocked" }],
    ["missing_source", { accessState: "missing" }],
    ["unavailable_source", { accessState: "unavailable" }],
    ["stale_source", { freshness: "stale" }],
    ["unknown_source", { freshness: "unknown" }],
    ["contradictory_source", { contradictionStatus: "contradictory" }],
    ["derived_only_source", { sourceType: "llm_wiki", canonicality: "derived_rebuildable" }],
  ];

  for (const [expectedReason, sourceRef] of cases) {
    const result = evaluateLiveMemorySourceEnforcement(baseInput({
      operation: "create_draft_write_preview",
      explicitApproval: true,
      approvalRef: "approval:story-7-1-fixture",
      backupPath: "backups/proposal-1.md",
      rollbackPath: "rollbacks/proposal-1.md",
      sourceRef: {
        sourceType: "obsidian",
        accessState: "allowed",
        freshness: "fresh",
        canonicality: "canonical_human_owned",
        contradictionStatus: "none",
        ...sourceRef,
      },
    }));
    assert.equal(result.decision, "blocked", expectedReason);
    assert.ok(result.reasonCodes.includes(expectedReason), expectedReason);
    assert.ok(result.blockedOperations.includes("write_back"), expectedReason);
    assert.ok(result.blockedOperations.includes("source_copy"), expectedReason);
    assert.ok(result.blockedOperations.includes("promotion"), expectedReason);
    assert.ok(result.blockedOperations.includes("authority_escalation"), expectedReason);
  }
});

test("missing or malformed source metadata fails closed", () => {
  const cases = [
    ["missing source ref", undefined, "missing_source"],
    ["non-object source ref", "obsidian:daily", "unknown_source"],
    ["missing source type", {
      accessState: "allowed",
      freshness: "fresh",
      canonicality: "canonical_human_owned",
      contradictionStatus: "none",
    }, "unknown_source"],
    ["unknown access state", {
      sourceType: "obsidian",
      accessState: "maybe",
      freshness: "fresh",
      canonicality: "canonical_human_owned",
      contradictionStatus: "none",
    }, "unknown_source"],
  ];

  for (const [label, sourceRef, expectedReason] of cases) {
    const result = evaluateLiveMemorySourceEnforcement(baseInput({ sourceRef }));
    assert.equal(result.decision, "blocked", label);
    assert.ok(result.reasonCodes.includes(expectedReason), label);
    assert.ok(result.blockedOperations.includes("write_back"), label);
  }
});

test("truthy malformed approval and blank backup evidence fail closed", () => {
  const malformedApproval = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: "false",
    approvalRef: "approval:story-7-1-fixture",
    backupPath: "backups/proposal-1.md",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(malformedApproval.decision, "requires_human_gate");
  assert.ok(malformedApproval.reasonCodes.includes("missing_explicit_operator_approval"));

  const blankBackup = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
    explicitApproval: true,
    approvalRef: "approval:story-7-1-fixture",
    backupPath: "   ",
    rollbackPath: "rollbacks/proposal-1.md",
  }));
  assert.equal(blankBackup.decision, "blocked");
  assert.ok(blankBackup.reasonCodes.includes("missing_backup"));
});

test("raw payload and source-copy retention are blocked for otherwise safe operations", () => {
  const result = evaluateLiveMemorySourceEnforcement(baseInput({
    requestedRetention: "raw_payload",
  }));

  assert.equal(result.decision, "blocked");
  assert.ok(result.reasonCodes.includes("raw_payload_retention_forbidden"));

  const rawPayloadFlag = evaluateLiveMemorySourceEnforcement(baseInput({
    rawPayloadRetained: true,
  }));
  assert.equal(rawPayloadFlag.decision, "blocked");
  assert.ok(rawPayloadFlag.reasonCodes.includes("raw_payload_retention_forbidden"));

  const sourceCopyFlag = evaluateLiveMemorySourceEnforcement(baseInput({
    sourceContentCopied: true,
  }));
  assert.equal(sourceCopyFlag.decision, "blocked");
  assert.ok(sourceCopyFlag.reasonCodes.includes("source_copy_retention_forbidden"));
});

test("blocked draft preview audit event reports approval and recovery requirements", () => {
  const result = evaluateLiveMemorySourceEnforcement(baseInput({
    operation: "create_draft_write_preview",
  }));

  assert.equal(result.decision, "blocked");
  assert.equal(result.auditEvent.operatorApprovalRequired, true);
  assert.equal(result.auditEvent.backupRequired, true);
  assert.equal(result.auditEvent.rollbackRequired, true);
  assert.equal(result.auditEvent.rawPayloadRetained, false);
  assert.equal(result.auditEvent.sourceContentCopied, false);
  assertAuditEventMatchesSchema(result);
});
