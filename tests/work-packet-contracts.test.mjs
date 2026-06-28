import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workPacketPath = new URL("../packages/contracts/src/work-packet.ts", import.meta.url);
const indexPath = new URL("../packages/contracts/src/index.ts", import.meta.url);

test("WorkPacketV0 contracts are exported and preserve metadata-only evidence", async () => {
  const [workPacketSource, indexSource] = await Promise.all([
    readFile(workPacketPath, "utf8"),
    readFile(indexPath, "utf8")
  ]);

  for (const exportedName of [
    "HUMAN_GATE_ACTION_TYPES_V0",
    "PipelineStage",
    "WorkPacketOwner",
    "WorkPacketV0View",
    "SourceRefV0",
    "EvidenceRefV0",
    "ArtifactRefV0",
    "HumanGateActionV0",
    "WorkPacketExecutionAttemptSummaryV0",
    "WorkPacketLaneCardV0",
    "MODEL_ROLES_V0",
    "MODEL_ROLE_POLICIES_V0",
    "ModelRoleV0",
    "ModelInputRefV0",
    "ModelPolicyReadinessGateV0",
    "ModelMetadataSummaryV0",
    "ModelRolePolicyV0",
    "ModelRequestPacketV0",
    "ModelResultPacketV0",
    "MemoryProposalV0",
    "RecoveryActionV0",
    "LlmWikiRebuildPreviewV0"
  ]) {
    assert.match(workPacketSource, new RegExp(`export (const|type|interface) ${exportedName}\\b`));
  }

  for (const actionType of [
    "approve_route",
    "approve_execution",
    "approve_provider_exception",
    "approve_memory_proposal",
    "approve_delivery",
    "reject_packet",
    "edit_packet",
    "request_clarification",
    "downgrade_to_reference",
    "send_back_to_shape",
    "send_back_to_research",
    "cancel_worker",
    "discard_result",
    "rerun_smaller",
    "reroute"
  ]) {
    assert.match(workPacketSource, new RegExp(`"${actionType}"`), `missing typed Human Gate action ${actionType}`);
  }

  assert.doesNotMatch(workPacketSource, /\|\s*"approve"\b/);
  assert.doesNotMatch(workPacketSource, /\|\s*"revise"\b/);
  assert.doesNotMatch(workPacketSource, /\|\s*"send_back"\b/);
  assert.match(workPacketSource, /export type HumanGateActionFamilyV0/);
  assert.match(workPacketSource, /export type HumanGateActionStatusV0/);
  assert.match(workPacketSource, /type:\s*HumanGateActionTypeV0;/);
  assert.match(workPacketSource, /family:\s*HumanGateActionFamilyV0;/);
  assert.match(workPacketSource, /uiCopy:\s*string;/);
  assert.match(workPacketSource, /status:\s*HumanGateActionStatusV0;/);
  assert.match(workPacketSource, /authorityFamily:\s*string;/);
  assert.match(workPacketSource, /payload:\s*HumanGateActionPayloadBindingV0;/);
  assert.match(workPacketSource, /stopLines:\s*string\[\];/);
  assert.match(workPacketSource, /rollbackPath:\s*string;/);
  assert.match(workPacketSource, /resultingStage:\s*PipelineStage;/);
  assert.match(workPacketSource, /resultingOwner:\s*WorkPacketOwner;/);
  assert.match(workPacketSource, /auditEventType:\s*string;/);
  assert.match(workPacketSource, /disabledReason\?:\s*string;/);
  const humanGateActionBlock = workPacketSource.match(/export interface HumanGateActionV0 \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(humanGateActionBlock, /actionType:/);
  assert.doesNotMatch(humanGateActionBlock, /availability:/);
  assert.doesNotMatch(humanGateActionBlock, /summary:/);
  assert.match(humanGateActionBlock, /reasonCodes:\s*string\[\];/);

  assert.match(workPacketSource, /rawPayloadRetained:\s*false;/);
  assert.match(workPacketSource, /writeBackAllowed:\s*false;/);
  assert.match(workPacketSource, /rebuildPreview\?:\s*LlmWikiRebuildPreviewV0 \| null;/);
  assert.match(workPacketSource, /rebuildDryRunPlan\?:\s*LlmWikiRebuildDryRunPlanV0 \| null;/);
  assert.match(workPacketSource, /previewId:\s*string;/);
  assert.match(workPacketSource, /inputRefs:\s*WorkPacketRefIdV0\[\];/);
  assert.match(workPacketSource, /memoryProposalRefs:\s*WorkPacketRefIdV0\[\];/);
  assert.match(workPacketSource, /plannedOutputScope:\s*string;/);
  assert.match(workPacketSource, /stopLine:\s*string;/);
  assert.match(workPacketSource, /planId:\s*string;/);
  assert.match(workPacketSource, /operationMode:\s*"dry_run";/);
  assert.match(workPacketSource, /plannedDerivedSections:\s*string\[\];/);
  assert.match(workPacketSource, /disposableTargetNamespace:\s*string;/);
  assert.match(workPacketSource, /stopLines:\s*string\[\];/);
  assert.match(workPacketSource, /discardRecoveryPath:\s*string;/);
  assert.match(workPacketSource, /writePerformed:\s*false;/);
  assert.match(workPacketSource, /backupCreated:\s*false;/);
  assert.match(workPacketSource, /durableWriteAllowed:\s*false;/);
  assert.match(workPacketSource, /executionAttempts:\s*WorkPacketExecutionAttemptSummaryV0\[\];/);
  assert.match(workPacketSource, /export interface WorkPacketStageTransitionEventV0/);
  assert.match(workPacketSource, /transitionEvents:\s*WorkPacketStageTransitionEventV0\[\];/);
  assert.match(workPacketSource, /durable:\s*boolean;/);
  assert.doesNotMatch(workPacketSource, /executionAttempts:\s*ExecutionAttemptView\[\];/);
  assert.match(workPacketSource, /accessState:\s*"allowed";/);
  assert.match(workPacketSource, /accessState:\s*"excluded" \| "missing" \| "blocked";/);
  assert.match(workPacketSource, /summaryOnly:\s*true;/);
  assert.match(workPacketSource, /export type WorkPacketNonEmptyRefIdsV0 = \[WorkPacketRefIdV0, \.\.\.WorkPacketRefIdV0\[\]\];/);

  const memoryProposalBlock = workPacketSource.match(/export interface MemoryProposalV0 \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(memoryProposalBlock, "missing MemoryProposalV0 contract");
  for (const fieldPattern of [
    /proposalId:\s*string;/,
    /packetId:\s*string;/,
    /sourceRefs:\s*WorkPacketNonEmptyRefIdsV0;/,
    /evidenceRefs:\s*WorkPacketNonEmptyRefIdsV0;/,
    /targetVaultPath\?:\s*string \| null;/,
    /targetVaultFolder:\s*string;/,
    /proposalType:\s*MemoryProposalTypeV0;/,
    /suggestedContentSummary:\s*string;/,
    /patchSummary\?:\s*string \| null;/,
    /sensitivity:\s*MemoryProposalSensitivityV0;/,
    /freshness:\s*MemoryProposalFreshnessV0;/,
    /contradictionStatus:\s*MemoryProposalContradictionStatusV0;/,
    /confidence:\s*MemoryProposalConfidenceV0;/,
    /operatorAction:\s*MemoryProposalOperatorActionV0;/,
    /decisionNeededContext\?:\s*string \| null;/,
    /backupRecoveryPath:\s*string;/,
    /writeBackStatus:\s*MemoryProposalWriteBackStatusV0;/,
    /writeBackAllowed:\s*false;/
  ]) {
    assert.match(memoryProposalBlock, fieldPattern);
  }

  for (const exportedName of [
    "MemoryProposalTypeV0",
    "MemoryProposalSensitivityV0",
    "MemoryProposalFreshnessV0",
    "MemoryProposalContradictionStatusV0",
    "MemoryProposalConfidenceV0",
    "MemoryProposalOperatorActionV0",
    "MemoryProposalWriteBackStatusV0"
  ]) {
    assert.match(workPacketSource, new RegExp(`export type ${exportedName}\\b`));
  }

  for (const requiredLiteral of [
    "pending_human_approval",
    "approved",
    "rejected",
    "deferred",
    "edit_needed",
    "stale",
    "contradictory",
    "blocked",
    "new_note",
    "append_note",
    "decision_record",
    "error_book_entry",
    "possible",
    "confirmed",
    "approved_for_future",
    "review_gated"
  ]) {
    assert.match(workPacketSource, new RegExp(`"${requiredLiteral}"`), `missing memory proposal literal ${requiredLiteral}`);
  }

  for (const forbiddenField of [
    "rawPrompt",
    "rawCompletion",
    "reasoningTrace",
    "providerPayload",
    "secret",
    "credential",
    "Record<string, unknown>"
  ]) {
    assert.doesNotMatch(workPacketSource, new RegExp(`\\b${forbiddenField}\\b`));
  }

  assert.match(indexSource, /export \* from "\.\/work-packet";/);
});

test("Model role policy wrappers are contract-only and Ollama-first", async () => {
  const workPacketSource = await readFile(workPacketPath, "utf8");

  const roleTuple = workPacketSource.match(/export const MODEL_ROLES_V0 = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  const roles = [...roleTuple.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(roles, ["classifier", "summarizer", "route_explainer", "memory_digest", "evidence_explainer"]);

  for (const exportedName of [
    "ModelRoleV0",
    "ModelPolicyBackendV0",
    "ModelAllowedInputRefKindV0",
    "ModelInputRefV0",
    "ModelPolicyReadinessGateV0",
    "ModelMetadataSummaryV0",
    "ModelRolePolicyV0",
    "ModelRequestPacketForRoleV0",
    "ModelRequestPacketV0",
    "ModelResultPacketBaseV0",
    "ModelResultPacketV0",
    "ModelResultPacketStatusV0"
  ]) {
    assert.match(workPacketSource, new RegExp(`export (type|interface) ${exportedName}\\b`));
  }

  assert.match(workPacketSource, /backend:\s*ModelPolicyBackendV0;/);
  assert.match(workPacketSource, /export type ModelPolicyBackendV0 = "ollama_adapter_first";/);
  assert.match(workPacketSource, /allowedInputRefKinds:\s*readonly ModelAllowedInputRefKindV0\[\];/);
  assert.match(workPacketSource, /timeoutMs:\s*number;/);
  assert.match(workPacketSource, /fallbackPath:\s*string;/);
  assert.match(workPacketSource, /operatorVisibleFailureState:\s*string;/);
  assert.match(workPacketSource, /enforcementState:\s*"contract_only";/);
  assert.match(workPacketSource, /readinessFollowUp:\s*"story_5_3_required";/);
  assert.match(workPacketSource, /readinessGate:\s*ModelPolicyReadinessGateV0;/);
  assert.match(workPacketSource, /followUpStory:\s*"5-3-prepare-implementation-readiness-evidence";/);
  assert.match(workPacketSource, /authorityFamily:\s*"local-provider-execution";/);
  assert.match(workPacketSource, /verificationEvidenceRefs:\s*WorkPacketRefIdV0\[\];/);
  assert.match(workPacketSource, /operatorApprovalPath:\s*string;/);
  assert.match(workPacketSource, /retentionPolicy:\s*"metadata_only";/);
  assert.match(workPacketSource, /metadataSummary:\s*ModelMetadataSummaryV0;/);
  assert.match(workPacketSource, /redactionState:\s*"metadata_only";/);
  assert.match(workPacketSource, /maxLabelChars:\s*number;/);
  assert.match(workPacketSource, /evidenceRefs:\s*EvidenceRefV0\[\];/);
  assert.match(workPacketSource, /artifactRefs:\s*ArtifactRefV0\[\];/);
  assert.match(workPacketSource, /export interface ModelRequestPacketForRoleV0<R extends ModelRoleV0>/);
  assert.match(workPacketSource, /role:\s*R;/);
  assert.match(workPacketSource, /rolePolicy:\s*ModelRolePolicyV0<R>;/);
  assert.match(workPacketSource, /allowedInputs:\s*ModelInputRefV0\[\];/);
  assert.match(workPacketSource, /inputKind:\s*ModelAllowedInputRefKindV0;/);
  assert.match(workPacketSource, /stopLines:\s*readonly string\[\];/);

  const policyRecord = workPacketSource.match(/export const MODEL_ROLE_POLICIES_BY_ROLE_V0 = \{([\s\S]*?)\n\} as const satisfies \{ readonly \[R in ModelRoleV0\]: ModelRolePolicyV0<R> \};/)?.[1] ?? "";
  assert.ok(policyRecord, "missing MODEL_ROLE_POLICIES_BY_ROLE_V0 catalog");
  const policyKeys = [...policyRecord.matchAll(/^  ([a-z_]+): \{/gm)].map((match) => match[1]);
  assert.deepEqual(policyKeys, roles, "policy record should contain exactly one entry per role");
  assert.equal(new Set(policyKeys).size, roles.length, "policy record should not duplicate roles");
  assert.match(workPacketSource, /export const MODEL_ROLE_POLICIES_V0 = MODEL_ROLES_V0\.map\(\(role\) => MODEL_ROLE_POLICIES_BY_ROLE_V0\[role\]\);/);

  for (const role of roles) {
    const rolePolicy = policyRecord.match(new RegExp(`  ${role}: \\{[\\s\\S]*?role: "${role}"[\\s\\S]*?\\n  \\}`))?.[0] ?? "";
    assert.ok(rolePolicy, `missing policy for model role ${role}`);
    assert.match(rolePolicy, /backend:\s*"ollama_adapter_first"/);
    assert.match(rolePolicy, /allowedInputRefKinds:\s*\[[\s\S]*?\]/);
    assert.match(rolePolicy, /timeoutMs:\s*\d+/);
    assert.match(rolePolicy, /fallbackPath:\s*"[^"]+"/);
    assert.match(rolePolicy, /retentionPolicy:\s*"metadata_only"/);
    assert.match(rolePolicy, /operatorVisibleFailureState:\s*"[^"]+"/);
    assert.match(rolePolicy, /enforcementState:\s*"contract_only"/);
    assert.match(rolePolicy, /readinessFollowUp:\s*"story_5_3_required"/);
    assert.match(rolePolicy, /readinessGate:\s*\{[\s\S]*?followUpStory:\s*"5-3-prepare-implementation-readiness-evidence"[\s\S]*?authorityFamily:\s*"local-provider-execution"[\s\S]*?verificationEvidenceRefs:\s*\[[\s\S]*?\][\s\S]*?operatorApprovalPath:\s*"[^"]+"[\s\S]*?enforcementState:\s*"blocked_until_readiness"[\s\S]*?stopLines:\s*\[[\s\S]*?\][\s\S]*?\}/);
    assert.match(rolePolicy, /stopLines:\s*\[[\s\S]*?\]/);
  }

  assert.match(workPacketSource, /authorityState:\s*"contract_only" \| "blocked_until_readiness" \| "approval_required";/);
  assert.doesNotMatch(workPacketSource, /"succeeded_metadata_only"/);
  const resultPacketBlock = workPacketSource.match(/export type ModelResultPacketV0 = \{[\s\S]*?\n\}\[ModelRoleV0\];/)?.[0] ?? "";
  assert.ok(resultPacketBlock, "missing ModelResultPacketV0 union");
  assert.doesNotMatch(resultPacketBlock, /summary:\s*string;/);
  assert.doesNotMatch(workPacketSource, /providerRegistry|providerRouter|gatewayReplacement|endpointDiscovery|modelDiscovery/);
  assert.doesNotMatch(workPacketSource, /OllamaProviderAdapter|fetch\(|XMLHttpRequest|WebSocket|EventSource/);
  assert.doesNotMatch(workPacketSource, /enforceModelRolePolicy|executeModelRequest|runModelRequest|callModelEndpoint/);
  assert.doesNotMatch(workPacketSource, /inputBody|outputBody|modelBody|completionBody|promptBody|providerResponse|providerOutput|requestPayload|responsePayload|reasoning/);
});
