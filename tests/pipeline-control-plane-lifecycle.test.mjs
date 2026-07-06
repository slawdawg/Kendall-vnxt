import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { buildCyclePacket } from "../scripts/lib/manager-control-plane/core.mjs";

const contractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);
const corePath = new URL("../packages/workflow-core/src/pipeline-control-plane/index.ts", import.meta.url);
const contractsIndexPath = new URL("../packages/contracts/src/index.ts", import.meta.url);
const workflowCoreIndexPath = new URL("../packages/workflow-core/src/index.ts", import.meta.url);
const dashboardSupervisorPath = new URL("../apps/dashboard/src/lib/supervisor.ts", import.meta.url);
const dashboardRequire = createRequire(new URL("../apps/dashboard/package.json", import.meta.url));
const repoRequire = createRequire(new URL("../package.json", import.meta.url));
const repoRootPath = process.cwd();

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractConstArray(source, exportName) {
  const withoutComments = stripComments(source);
  const match = withoutComments.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `missing exported const array ${exportName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function tscPath() {
  return (
    resolvePackagePath(dashboardRequire, "typescript/bin/tsc") ||
    resolvePackagePath(repoRequire, "typescript/bin/tsc") ||
    resolveViaPnpm("typescript/bin/tsc") ||
    missingTypescriptDependency()
  );
}

function typescriptModule() {
  const modulePath =
    resolvePackagePath(dashboardRequire, "typescript") ||
    resolvePackagePath(repoRequire, "typescript") ||
    resolveViaPnpm("typescript");
  if (!modulePath) {
    missingTypescriptDependency();
  }
  return createRequire(modulePath)("typescript");
}

function resolvePackagePath(requireFn, specifier) {
  try {
    return requireFn.resolve(specifier);
  } catch {
    return null;
  }
}

function resolveViaPnpm(specifier) {
  const script = `process.stdout.write(require.resolve(${JSON.stringify(specifier)}))`;
  const result = spawnSync("pnpm", ["exec", "node", "-e", script], { cwd: repoRootPath, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}

function missingTypescriptDependency() {
  throw new Error("TypeScript dependency is unavailable; run pnpm install before compile-backed lifecycle tests.");
}

test("authoritative pipeline control plane lifecycle contracts are namespaced and metadata-only", async () => {
  const [contractSource, coreSource, contractsIndex, workflowCoreIndex] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(corePath, "utf8"),
    readFile(contractsIndexPath, "utf8"),
    readFile(workflowCoreIndexPath, "utf8"),
  ]);

  for (const stage of ["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]) {
    assert.match(contractSource, new RegExp(`"${stage}"`));
  }
  assert.match(coreSource, /AUTHORITATIVE_STAGE_SEQUENCE:\s*readonly AuthoritativePacketStage\[\]\s*=\s*AUTHORITATIVE_PACKET_STAGES/);

  for (const exportedName of [
    "AuthoritativePacketStage",
    "AuthoritativePacketSourceRef",
    "AuthoritativePacketLifecycleEvent",
    "AuthoritativeWorkPacketLifecycleView",
    "CreateAuthoritativeWorkPacketRequest",
    "TransitionAuthoritativeWorkPacketRequest",
    "PipelineDashboardProjectionV0",
    "PipelineProjectionSourceLabelV0",
    "PipelineProjectionFreshnessStateV0",
    "PipelineProjectionEmptyReasonV0",
    "PipelineBackendReachabilityV0",
    "PipelineFixtureModeV0",
    "PipelineTruthSummaryV0",
    "PipelineStageSummaryV0",
    "PipelineDashboardWorkPacketV0",
    "PipelineManagerSummaryV0",
    "PipelineQueueSummaryV0",
  ]) {
    assert.match(contractSource, new RegExp(`export (const|type|interface) ${exportedName}\\b`));
  }

  assert.match(contractSource, /AUTHORITATIVE_PACKET_STAGE_LABELS/);
  for (const projectionLiteral of [
    "live",
    "stale",
    "fixture",
    "simulated",
    "dry_run",
    "unavailable",
    "unknown",
    "healthy_empty",
    "source_exhausted",
    "cleanup_gated",
    "failure_budget_hit",
    "backend_unavailable",
    "projection_stale",
    "healthy_idle",
    "waiting_for_approval",
  ]) {
    assert.match(contractSource, new RegExp(`"${projectionLiteral}"`), `missing projection literal ${projectionLiteral}`);
  }
  assert.match(contractSource, /staleAfterSeconds:\s*number;/);
  assert.match(contractSource, /visibleLabelRequired:\s*true;/);
  assert.match(contractSource, /canSatisfyLiveProof:\s*false;/);
  assert.match(contractSource, /activeLeaseCount:\s*number \| null;/);
  assert.match(contractSource, /activeWorkerCount:\s*number \| null;/);
  assert.match(contractSource, /warmWorkerCount:\s*number \| null;/);
  assert.match(contractSource, /reliabilityState:/);
  assert.match(contractSource, /evidenceRefs:\s*string\[\];/);
  assert.match(contractSource, /PipelineWorkerSummaryV0/);
  assert.match(contractSource, /workerSummary:\s*PipelineWorkerSummaryV0;/);
  assert.match(contractSource, /PipelineReliabilityProblemV0/);
  assert.match(contractSource, /reliabilityProblems:\s*PipelineReliabilityProblemV0\[\];/);
  assert.match(contractSource, /PipelineGatedControlV0/);
  assert.match(contractSource, /gatedControls:\s*PipelineGatedControlV0\[\];/);
  assert.match(contractSource, /kill_worker/);
  assert.match(contractSource, /github_mutation/);
  assert.match(contractSource, /terminal_access/);
  assert.match(contractSource, /raw_payload_retention/);
  assert.match(contractSource, /activeCount:\s*number \| null;/);
  assert.match(contractSource, /dispatchableCount:\s*number \| null;/);
  assert.match(contractSource, /blockedCount:\s*number \| null;/);
  assert.match(contractSource, /gatedCount:\s*number \| null;/);
  assert.match(contractSource, /closedCount:\s*number \| null;/);
  assert.match(contractSource, /staleCount:\s*number \| null;/);
  assert.match(contractSource, /refillingCount:\s*number \| null;/);
  assert.match(contractSource, /unknownCount:\s*number \| null;/);
  assert.match(contractSource, /needs_approval:\s*"Needs Approval"/);
  assert.match(contractSource, /metadataOnly:\s*true;/);
  assert.match(coreSource, /LEGACY_TO_AUTHORITATIVE_STAGE/);
  assert.match(coreSource, /human_gate:\s*"needs_approval"/);
  assert.match(coreSource, /createWorkPacketCreatedEvent/);
  assert.match(coreSource, /createWorkPacketTransitionEvent/);
  assert.match(coreSource, /raw\[\\s_-\]\*\(\?:prompts\?\|completions\?\|transcripts\?\)/);
  assert.match(coreSource, /\(\?:terminal\|tmux\|pane\)\[\\s_-\]\*\(\?:scrollbacks\?\|texts\?\|outputs\?\|stdouts\?\|stderrs\?\)/);
  assert.doesNotMatch(contractSource.replaceAll("credential_or_provider_change", ""), /\b(?:rawPrompt|rawCompletion|reasoningTrace|providerPayload|secret|credential)\??:/);
  assert.match(contractsIndex, /export \* from "\.\/pipeline-control-plane";/);
  assert.match(workflowCoreIndex, /export \* from "\.\/pipeline-control-plane";/);
});

test("operational action contracts define capability-gated metadata-only requests and results", async () => {
  const contractSource = await readFile(contractPath, "utf8");

  for (const exportedName of [
    "PIPELINE_OPERATIONAL_ACTION_SCHEMA_VERSION",
    "PIPELINE_OPERATIONAL_ACTION_RISK_TIERS",
    "PIPELINE_OPERATIONAL_ACTION_CAPABILITY_STATES",
    "PIPELINE_OPERATIONAL_ACTION_AUTHORITY_STATES",
    "PIPELINE_OPERATIONAL_ACTION_TYPED_REASONS",
    "PIPELINE_OPERATIONAL_ACTION_IDS",
    "PipelineOperationalActionRiskTierV0",
    "PipelineOperationalActionCapabilityStateV0",
    "PipelineOperationalActionAuthorityStateV0",
    "PipelineOperationalActionRequestedAuthorityStateV0",
    "PipelineOperationalActionTypedReasonV0",
    "PipelineOperationalActionEvidenceRefsV0",
    "PipelineOperationalActionRequestV0",
    "PipelineOperationalActionResultV0",
    "PipelineOperationalActionCapabilityV0",
    "PipelineOperationalRuntimeReadinessV0",
    "isPipelineOperationalActionIdV0",
    "isPipelineOperationalActionEvidenceRefsV0",
    "validatePipelineOperationalActionRequestV0",
    "validatePipelineOperationalActionResultV0",
    "validatePipelineOperationalActionCapabilityV0",
    "validatePipelineOperationalRuntimeReadinessV0",
  ]) {
    assert.match(contractSource, new RegExp(`export (const|type|interface|function) ${exportedName}\\b`), `missing ${exportedName}`);
  }

  assert.deepEqual(extractConstArray(contractSource, "PIPELINE_OPERATIONAL_ACTION_IDS"), [
    "inspect",
    "refresh_projection",
    "dispatch_apply",
    "mark_viewed",
    "retry_verification",
    "requeue",
    "mark_tested",
    "kill_worker",
    "mutate_source",
    "push_branch",
    "open_pr",
    "merge",
    "delete_branch",
    "cleanup",
    "credential_or_provider_change",
  ]);
  assert.doesNotMatch(contractSource, /PipelineOperationalActionIdV0[^\n=]*=[^;]*string\s*&/, "action ids must not have arbitrary string escape hatches");
  assert.match(contractSource, /isPipelineOperationalActionIdV0[\s\S]*PIPELINE_OPERATIONAL_ACTION_IDS[\s\S]*includes\(value\)/);

  for (const literal of [
    "pipeline-operational-action/v0",
    "pipeline-operational-runtime-readiness/v0",
    "available",
    "unavailable",
    "gated",
    "simulated",
    "low",
    "medium",
    "high",
    "extreme",
    "inspect",
    "refresh_projection",
    "dispatch_apply",
    "mark_viewed",
    "retry_verification",
    "requeue",
    "mark_tested",
    "kill_worker",
    "mutate_source",
    "push_branch",
    "open_pr",
    "merge",
    "delete_branch",
    "cleanup",
    "credential_or_provider_change",
    "blocked_by_policy",
    "blocked_by_approval",
    "runtime_unavailable",
    "projection_stale",
  ]) {
    assert.match(contractSource, new RegExp(`"${literal}"`), `missing operational action literal ${literal}`);
  }

  for (const requiredField of [
    "schemaVersion",
    "actionId",
    "targetType",
    "targetId",
    "idempotencyKey",
    "correlationId",
    "requestedBy",
    "requestedAuthorityState",
    "requestedRiskTier",
    "outcome",
    "resultingStage",
    "resultingStatus",
    "capabilityState",
    "riskTier",
    "typedReason",
    "expectedResultSummary",
    "freshnessState",
    "expiresAt",
    "evidenceRefs",
    "metadataOnly",
    "rawPayloadRetained",
  ]) {
    assert.match(contractSource, new RegExp(`${requiredField}:`), `missing required operational action field ${requiredField}`);
  }

  assert.doesNotMatch(contractSource, /operatorNote[?]?:/);
  assert.doesNotMatch(contractSource, /expectedResult:\s*string/);
  assert.match(contractSource, /PipelineOperationalActionRequestedAuthorityStateV0 = Exclude<PipelineOperationalActionAuthorityStateV0, "allowed">/);
  assert.match(contractSource, /evidenceRefs:\s*PipelineOperationalActionEvidenceRefsV0;/);
  assert.match(contractSource, /PipelineOperationalActionEvidenceRefsV0 = \[string, \.\.\.string\[\]\]/);
  assert.match(contractSource, /metadataOnly:\s*true;/);
  assert.match(contractSource, /rawPayloadRetained:\s*false;/);
  assert.doesNotMatch(contractSource.replaceAll("credential_or_provider_change", ""), /\b(?:rawPrompt|rawCompletion|reasoningTrace|providerPayload|secret|credential)\??:/);
});

test("operational action contracts validate runtime objects without throwing", async () => {
  const {
    validatePipelineOperationalActionRequestV0,
    validatePipelineOperationalActionResultV0,
    validatePipelineOperationalActionCapabilityV0,
    validatePipelineOperationalRuntimeReadinessV0,
    isPipelineOperationalActionIdV0,
    isPipelineOperationalActionEvidenceRefsV0,
  } = await loadCompiledContractModule();

  const validEvidence = ["verification:operational-action-contract"];
  const validRequest = {
    schemaVersion: "pipeline-operational-action/v0",
    actionId: "retry_verification",
    targetType: "execution_attempt",
    targetId: "attempt-1",
    idempotencyKey: "idem-1",
    correlationId: "corr-1",
    requestedBy: { actorType: "manager", actorId: "manager-test" },
    requestedAuthorityState: "needs_authority_approval",
    requestedRiskTier: "medium",
    operatorIntentSummary: "Retry focused verification through existing gates.",
    evidenceRefs: validEvidence,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  const approvalEvidenceRef = (
    authorityState,
    actionId,
    targetId = "codex/example",
    correlationId = "corr-1",
    idempotencyKey = "idem-1",
  ) => `evidence:approval-${authorityState}:${actionId}:${evidenceToken(targetId)}:${evidenceToken(correlationId)}:${evidenceToken(idempotencyKey)}`;
  const contextEvidenceRef = (
    actionId,
    targetId = "codex/example",
    correlationId = "corr-1",
    idempotencyKey = "idem-1",
  ) => `evidence:${actionId}-context:${evidenceToken(targetId)}:${evidenceToken(correlationId)}:${evidenceToken(idempotencyKey)}`;
  const capabilityApprovalEvidenceRef = (
    authorityState,
    actionId,
    targetId = "codex/example",
  ) => `evidence:capability-approval-${authorityState}:${actionId}:${evidenceToken(targetId)}`;
  const evidenceToken = (value) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    const normalized = value
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "id";
    return `${normalized}-${(hash >>> 0).toString(36).padStart(7, "0").slice(0, 7)}`;
  };

  assert.equal(isPipelineOperationalActionIdV0("merge"), true);
  assert.equal(isPipelineOperationalActionIdV0("custom_merge"), false);
  assert.equal(isPipelineOperationalActionEvidenceRefsV0(validEvidence), true);
  assert.equal(isPipelineOperationalActionEvidenceRefsV0(["artifact:0123456789abcdef0123456789abcdef01234567"]), true);
  assert.equal(isPipelineOperationalActionEvidenceRefsV0(["manager-cycle:manager-20260701-001"]), true);
  assert.equal(isPipelineOperationalActionEvidenceRefsV0(["raw transcript copied into evidence"]), false);
  assert.equal(isPipelineOperationalActionEvidenceRefsV0(["evidence:sk-testtoken123456789"]), false);
  assert.deepEqual(validatePipelineOperationalActionRequestV0(validRequest), []);
  assert.deepEqual(validatePipelineOperationalActionRequestV0({
    ...validRequest,
    targetId: "a",
    correlationId: "1",
    idempotencyKey: "b",
    requestedBy: { actorType: "manager", actorId: "m" },
  }), []);
  assert.deepEqual(validatePipelineOperationalActionRequestV0({
    ...validRequest,
    actionId: "inspect",
    targetType: "manager_run",
    requestedAuthorityState: "not_required",
    requestedRiskTier: "low",
  }), []);

  const readOnlyApprovalRequestIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    actionId: "refresh_projection",
    targetType: "projection",
    requestedAuthorityState: "needs_authority_approval",
    requestedRiskTier: "low",
  }).map((issue) => issue.code);
  assert.ok(readOnlyApprovalRequestIssues.includes("policy_violation"));

  const unknownRequestFieldIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    command: "git push",
  }).map((issue) => issue.code);
  assert.ok(unknownRequestFieldIssues.includes("forbidden_field"));

  const malformedRequestIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    schemaVersion: "old",
    actionId: "custom_merge",
    targetType: "worker",
    targetId: 12,
    correlationId: "",
    idempotencyKey: null,
    requestedBy: { actorType: "alien" },
    requestedAuthorityState: "allowed",
    requestedRiskTier: "low",
    evidenceRefs: [],
    metadataOnly: false,
    rawPayloadRetained: true,
    operatorIntentSummary: "sk-testtoken123456789",
    rawPrompt: "do not keep raw prompts",
  }).map((issue) => issue.code);
  for (const expectedCode of ["bad_schema_version", "unknown_action_id", "blank_identifier", "request_cannot_self_authorize", "evidence_required", "bad_retention_flag", "unsafe_metadata_retention", "invalid_actor", "forbidden_field"]) {
    assert.ok(malformedRequestIssues.includes(expectedCode), `missing request issue ${expectedCode}`);
  }

  const nestedMetadataIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    requestedBy: {
      actorType: "manager",
      actorId: "sk-testtoken123456789",
      actorLabel: "Manager",
      providerPayload: { copied: "not retained" },
    },
    metadata: {
      note: "sk-nestedtoken123456789",
      copiedSummary: "raw prompt copied here",
      sourceNote: "provider payload copied here",
      terminalNote: "terminal output copied here",
      sourceCopySummary: "source copy retained here",
      consoleLogSummary: "console log retained here",
    },
  }).map((issue) => issue.code);
  assert.ok(nestedMetadataIssues.includes("unsafe_metadata_retention"));
  assert.ok(nestedMetadataIssues.includes("forbidden_field"));

  for (const alias of ["password", "apiKey", "accessToken", "authToken", "privateKey", "passphrase"]) {
    const credentialAliasIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      requestedBy: {
        actorType: "manager",
        actorId: "manager-test",
        [alias]: "retained credential alias",
      },
      operatorIntentSummary: `Do not retain ${alias} values.`,
    }).map((issue) => issue.code);
    assert.ok(credentialAliasIssues.includes("forbidden_field"), `missing forbidden field issue for ${alias}`);
    assert.ok(credentialAliasIssues.includes("unsafe_metadata_retention"), `missing metadata issue for ${alias}`);
  }

  const cyclicMetadata = { note: "metadata summary" };
  cyclicMetadata.self = cyclicMetadata;
  const cyclicMetadataIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    requestedBy: { actorType: "manager", actorId: "manager-test", details: cyclicMetadata },
  }).map((issue) => issue.code);
  assert.ok(cyclicMetadataIssues.includes("forbidden_field"));

  const sharedMetadata = { note: "metadata summary" };
  const sharedAcyclicIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    requestedBy: {
      actorType: "manager",
      actorId: "manager-test",
      firstDetails: sharedMetadata,
      secondDetails: sharedMetadata,
    },
  }).map((issue) => issue.code);
  assert.ok(sharedAcyclicIssues.includes("forbidden_field"));

  const unsafeIdentifierIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    targetId: "sk-targettoken123456789",
    correlationId: "raw prompt marker",
    idempotencyKey: "token:key",
  }).map((issue) => issue.code);
  assert.ok(unsafeIdentifierIssues.includes("unsafe_metadata_retention"));

  const retainedWhitespaceIdentifierIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    targetId: " attempt-1 ",
    correlationId: "corr-1\n",
    idempotencyKey: "\tidem-1",
    requestedBy: { actorType: "manager", actorId: " manager-test", actorLabel: "Manager\n" },
  }).map((issue) => issue.code);
  assert.ok(retainedWhitespaceIdentifierIssues.includes("unsafe_metadata_retention"));

  const actorIdentityIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    requestedBy: { actorType: "manager", actorId: "Manager/../Test", actorLabel: "Manager" },
  }).map((issue) => issue.code);
  assert.ok(actorIdentityIssues.includes("unsafe_metadata_retention"));

  const nonCanonicalIdentifierIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    targetId: "Attempt-1",
    correlationId: "corr 1",
    idempotencyKey: "idem--1",
  }).map((issue) => issue.code);
  assert.ok(nonCanonicalIdentifierIssues.includes("unsafe_metadata_retention"));

  const pathLikeIdentifierIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    targetId: "codex/../main",
    correlationId: "./corr-1",
    idempotencyKey: "idem//1",
  }).map((issue) => issue.code);
  assert.ok(pathLikeIdentifierIssues.includes("unsafe_metadata_retention"));

  const readOnlyRequestAuthorityIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    actionId: "inspect",
    targetType: "manager_run",
    requestedRiskTier: "low",
    requestedAuthorityState: "needs_safety_approval",
  }).map((issue) => issue.code);
  assert.ok(readOnlyRequestAuthorityIssues.includes("policy_violation"));

  const requestPolicyIssues = validatePipelineOperationalActionRequestV0({
    ...validRequest,
    actionId: "merge",
    targetType: "worker",
    requestedRiskTier: "low",
  }).map((issue) => issue.code);
  assert.ok(requestPolicyIssues.includes("policy_violation"));

  for (const request of [
    { actionId: "merge", targetType: "branch", requestedRiskTier: "extreme", requestedAuthorityState: "needs_authority_approval" },
    { actionId: "delete_branch", targetType: "branch", requestedRiskTier: "extreme", requestedAuthorityState: "needs_authority_approval" },
    { actionId: "cleanup", targetType: "workspace", requestedRiskTier: "extreme", requestedAuthorityState: "needs_authority_approval" },
    { actionId: "credential_or_provider_change", targetType: "runtime", requestedRiskTier: "extreme", requestedAuthorityState: "needs_safety_approval" },
    { actionId: "dispatch_apply", targetType: "work_item", requestedRiskTier: "high", requestedAuthorityState: "needs_product_approval" },
    { actionId: "kill_worker", targetType: "worker", requestedRiskTier: "high", requestedAuthorityState: "needs_safety_approval" },
  ]) {
    const authorityIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      ...request,
    }).map((issue) => issue.code);
    assert.ok(authorityIssues.includes("policy_violation"), `missing request authority policy issue for ${request.actionId}`);
  }

  let deepMetadata = { note: "metadata summary" };
  for (let index = 0; index < 64; index += 1) {
    deepMetadata = { child: deepMetadata };
  }
  let deepMetadataIssues = [];
  assert.doesNotThrow(() => {
    deepMetadataIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      requestedBy: { actorType: "manager", actorId: "manager-test", details: deepMetadata },
    });
  });
  assert.ok(deepMetadataIssues.map((issue) => issue.code).includes("forbidden_field"));

  const wideMetadata = { branches: [] };
  for (let index = 0; index < 1300; index += 1) {
    wideMetadata.branches.push({ index, note: "metadata summary" });
  }
  let wideMetadataIssues = [];
  assert.doesNotThrow(() => {
    wideMetadataIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      requestedBy: { actorType: "manager", actorId: "manager-test", details: wideMetadata },
    });
  });
  assert.ok(wideMetadataIssues.map((issue) => issue.code).includes("forbidden_field"));
  assert.ok(wideMetadataIssues.length < 20);

  const validCapability = {
    actionId: "inspect",
    targetType: "manager_run",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "low",
    typedReason: null,
    expectedResultSummary: "Inspect compact manager cycle state.",
    correlationRequired: true,
    idempotencyRequired: true,
    evidenceRefs: validEvidence,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  assert.deepEqual(validatePipelineOperationalActionCapabilityV0(validCapability), []);

  const readOnlyApprovalCapabilityIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    actionId: "refresh_projection",
    targetType: "projection",
    authorityState: "needs_authority_approval",
  }).map((issue) => issue.code);
  assert.ok(readOnlyApprovalCapabilityIssues.includes("policy_violation"));

  const availableCapabilityReasonIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    typedReason: "blocked_by_policy",
  }).map((issue) => issue.code);
  assert.ok(availableCapabilityReasonIssues.includes("inconsistent_result"));

  const invalidCapabilityIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    actionId: "merge",
    targetType: "worker",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "low",
    typedReason: null,
    expectedResultSummary: 42,
    correlationRequired: false,
    idempotencyRequired: false,
    evidenceRefs: ["evidence:raw-provider-payload"],
    metadataOnly: true,
    rawPayloadRetained: true,
  }).map((issue) => issue.code);
  for (const expectedCode of ["policy_violation", "unsafe_metadata_retention", "evidence_required", "bad_retention_flag"]) {
    assert.ok(invalidCapabilityIssues.includes(expectedCode), `missing capability issue ${expectedCode}`);
  }

  const unknownCapabilityFieldIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    apply: true,
  }).map((issue) => issue.code);
  assert.ok(unknownCapabilityFieldIssues.includes("forbidden_field"));

  const capabilityWhitespaceTargetIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    targetId: " manager-test ",
  }).map((issue) => issue.code);
  assert.ok(capabilityWhitespaceTargetIssues.includes("unsafe_metadata_retention"));

  const capabilityIdentityTargetIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    targetId: "Manager/../Test",
  }).map((issue) => issue.code);
  assert.ok(capabilityIdentityTargetIssues.includes("unsafe_metadata_retention"));

  const gatedCapabilityIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    capabilityState: "gated",
    authorityState: "needs_authority_approval",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(gatedCapabilityIssues.includes("inconsistent_result"));

  const nonAllowedAvailableCapabilityIssues = validatePipelineOperationalActionCapabilityV0({
    ...validCapability,
    authorityState: "blocked",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(nonAllowedAvailableCapabilityIssues.includes("inconsistent_result"));

  for (const capability of [
    { actionId: "merge", targetType: "branch", riskTier: "extreme", authorityState: "needs_authority_approval" },
    { actionId: "delete_branch", targetType: "branch", riskTier: "extreme", authorityState: "needs_authority_approval" },
    { actionId: "cleanup", targetType: "workspace", riskTier: "extreme", authorityState: "needs_authority_approval" },
    { actionId: "credential_or_provider_change", targetType: "runtime", riskTier: "extreme", authorityState: "needs_safety_approval" },
    { actionId: "dispatch_apply", targetType: "work_item", riskTier: "high", authorityState: "needs_product_approval" },
    { actionId: "kill_worker", targetType: "worker", riskTier: "high", authorityState: "needs_safety_approval" },
  ]) {
    const authorityIssues = validatePipelineOperationalActionCapabilityV0({
      ...validCapability,
      ...capability,
      capabilityState: "gated",
      typedReason: "blocked_by_approval",
    }).map((issue) => issue.code);
    assert.ok(authorityIssues.includes("policy_violation"), `missing capability authority policy issue for ${capability.actionId}`);
  }

  const validResult = {
    schemaVersion: "pipeline-operational-action/v0",
    actionId: "inspect",
    targetType: "manager_run",
    targetId: "manager-test",
    outcome: "succeeded",
    resultingStage: "execute",
    resultingStatus: "active",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "low",
    typedReason: null,
    evidenceRefs: validEvidence,
    correlationId: "corr-1",
    idempotencyKey: "idem-1",
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  assert.deepEqual(validatePipelineOperationalActionResultV0(validResult), []);
  const readOnlyApprovalResultIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "refresh_projection",
    targetType: "projection",
    authorityState: "needs_authority_approval",
    outcome: "blocked",
    capabilityState: "gated",
    typedReason: "runtime_unavailable",
    resultingStatus: "blocked",
  }).map((issue) => issue.code);
  assert.ok(readOnlyApprovalResultIssues.includes("policy_violation"));

  const unknownResultFieldIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    payload: { action: "merge" },
  }).map((issue) => issue.code);
  assert.ok(unknownResultFieldIssues.includes("forbidden_field"));

  const successfulResultReasonIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    typedReason: "blocked_by_policy",
  }).map((issue) => issue.code);
  assert.ok(successfulResultReasonIssues.includes("inconsistent_result"));

  const mergeSuccessEvidenceRefs = [
    ...validEvidence,
    approvalEvidenceRef("needs_safety_approval", "merge"),
    contextEvidenceRef("merge"),
    "evidence:merge-head-sha-0123456789abcdef0123456789abcdef01234567",
    "evidence:merge-base-dev",
    "evidence:merge-pr-42",
    "evidence:merge-checks-passed-head-0123456789abcdef0123456789abcdef01234567:pr-42",
    "evidence:merge-review-threads-resolved-head-0123456789abcdef0123456789abcdef01234567:pr-42",
    "evidence:merge-mergeable",
    "evidence:merge-pr-non-draft",
    "evidence:merge-requested-changes-cleared",
    "evidence:merge-expected-base-policy-dev",
    "evidence:merge-high-risk-diff-excluded",
    "verification:merge-local-head-0123456789abcdef0123456789abcdef01234567:base-dev:pr-42",
  ];
  const deliverySuccessEvidence = {
    push_branch: [
      approvalEvidenceRef("needs_authority_approval", "push_branch"),
      contextEvidenceRef("push_branch"),
      `evidence:push-branch-ref-${evidenceToken("codex/example")}`,
      "evidence:push-branch-remote-origin",
      "evidence:push-branch-head-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:push-branch-result-pushed",
    ],
    open_pr: [
      approvalEvidenceRef("needs_authority_approval", "open_pr"),
      contextEvidenceRef("open_pr"),
      `evidence:open-pr-branch-${evidenceToken("codex/example")}`,
      "evidence:open-pr-base-dev",
      "evidence:open-pr-pr-42",
      "evidence:open-pr-result-opened",
    ],
    delete_branch: [
      approvalEvidenceRef("needs_safety_approval", "delete_branch"),
      contextEvidenceRef("delete_branch"),
      `evidence:delete-branch-ref-${evidenceToken("codex/example")}`,
      "evidence:delete-branch-head-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:delete-branch-result-deleted",
      "evidence:delete-branch-merged-pr-42",
      "evidence:delete-branch-lane-owner-manager-test",
      "evidence:delete-branch-local-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:delete-branch-remote-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:delete-branch-delivery-head-match-0123456789abcdef0123456789abcdef01234567",
    ],
    cleanup: [
      approvalEvidenceRef("needs_safety_approval", "cleanup", "workspace-1"),
      contextEvidenceRef("cleanup", "workspace-1"),
      `evidence:cleanup-workspace-${evidenceToken("workspace-1")}`,
      "evidence:cleanup-pr-42",
      "evidence:cleanup-head-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:cleanup-dry-run",
      "evidence:cleanup-result-clean",
      "evidence:cleanup-merged-pr-42",
      "evidence:cleanup-lane-owner-manager-test",
      "evidence:cleanup-worktree-identity-workspace-1",
      "evidence:cleanup-local-branch-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:cleanup-remote-branch-sha-0123456789abcdef0123456789abcdef01234567",
      "evidence:cleanup-delivery-head-match-0123456789abcdef0123456789abcdef01234567",
    ],
  };

  const genericMergeSuccessEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: [...validEvidence, "evidence:approval-needs_safety_approval"],
  }).map((issue) => issue.code);
  assert.ok(genericMergeSuccessEvidenceIssues.includes("policy_violation"));

  assert.deepEqual(validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs,
  }), []);

  const maxIdentifier = "a" + "b".repeat(198) + "c";
  const maxIdentifierEvidence = approvalEvidenceRef("needs_product_approval", "mark_viewed", maxIdentifier, maxIdentifier, maxIdentifier);
  assert.equal(maxIdentifierEvidence.length <= 180, true);
  assert.deepEqual(validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "mark_viewed",
    targetType: "work_packet",
    targetId: maxIdentifier,
    correlationId: maxIdentifier,
    idempotencyKey: maxIdentifier,
    riskTier: "low",
    authorityState: "allowed",
    evidenceRefs: [...validEvidence, maxIdentifierEvidence],
  }), []);

  const incompleteMergeSuccessEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs.filter((ref) => !ref.startsWith("evidence:merge-review-threads-")),
  }).map((issue) => issue.code);
  assert.ok(incompleteMergeSuccessEvidenceIssues.includes("policy_violation"));

  const missingMergeBaseEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs.filter((ref) => ref !== "evidence:merge-base-dev"),
  }).map((issue) => issue.code);
  assert.ok(missingMergeBaseEvidenceIssues.includes("policy_violation"));

  const missingMergePrEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs.filter((ref) => ref !== "evidence:merge-pr-42"),
  }).map((issue) => issue.code);
  assert.ok(missingMergePrEvidenceIssues.includes("policy_violation"));

  for (const requiredRef of [
    "evidence:merge-pr-non-draft",
    "evidence:merge-requested-changes-cleared",
    "evidence:merge-expected-base-policy-dev",
    "evidence:merge-high-risk-diff-excluded",
  ]) {
    const missingMergeSafetyEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId: "merge",
      targetType: "branch",
      targetId: "codex/example",
      resultingStage: "deliver",
      authorityState: "allowed",
      riskTier: "extreme",
      evidenceRefs: mergeSuccessEvidenceRefs.filter((ref) => ref !== requiredRef),
    }).map((issue) => issue.code);
    assert.ok(missingMergeSafetyEvidenceIssues.includes("policy_violation"), `missing merge safety evidence ${requiredRef}`);
  }

  for (const [label, replacement] of [
    ["head", "verification:merge-local-head-fedcba9876543210fedcba9876543210fedcba98:base-dev:pr-42"],
    ["base", "verification:merge-local-head-0123456789abcdef0123456789abcdef01234567:base-main:pr-42"],
    ["pr", "verification:merge-local-head-0123456789abcdef0123456789abcdef01234567:base-dev:pr-43"],
  ]) {
    const mismatchedMergeEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId: "merge",
      targetType: "branch",
      targetId: "codex/example",
      resultingStage: "deliver",
      authorityState: "allowed",
      riskTier: "extreme",
      evidenceRefs: mergeSuccessEvidenceRefs.map((ref) => ref.startsWith("verification:merge-local-") ? replacement : ref),
    }).map((issue) => issue.code);
    assert.ok(mismatchedMergeEvidenceIssues.includes("policy_violation"), `missing merge ${label} binding issue`);
  }

  const mismatchedMergeChecksEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs.map((ref) => ref.startsWith("evidence:merge-checks-") ? "evidence:merge-checks-passed-head-fedcba9876543210fedcba9876543210fedcba98:pr-42" : ref),
  }).map((issue) => issue.code);
  assert.ok(mismatchedMergeChecksEvidenceIssues.includes("policy_violation"));

  const pathTraversalEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    evidenceRefs: [...validEvidence, "artifact:../escape"],
  }).map((issue) => issue.code);
  assert.ok(pathTraversalEvidenceIssues.includes("evidence_required"));

  const genericMergeLocalEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: mergeSuccessEvidenceRefs.map((ref) => ref.startsWith("verification:merge-local-") ? "test:merge-local-focused-check" : ref),
  }).map((issue) => issue.code);
  assert.ok(genericMergeLocalEvidenceIssues.includes("policy_violation"));

  for (const [actionId, evidenceRefs] of Object.entries(deliverySuccessEvidence)) {
    const targetType = actionId === "cleanup" ? "workspace" : "branch";
    const riskTier = actionId === "push_branch" || actionId === "open_pr" ? "high" : "extreme";
    const resultingStage = actionId === "cleanup" ? "terminal" : "deliver";
    const missingSpecificEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId,
      targetType,
      targetId: actionId === "cleanup" ? "workspace-1" : "codex/example",
      resultingStage,
      authorityState: "allowed",
      riskTier,
      evidenceRefs: [...validEvidence, evidenceRefs[0]],
    }).map((issue) => issue.code);
    assert.ok(missingSpecificEvidenceIssues.includes("policy_violation"), `missing action-specific evidence issue for ${actionId}`);

    assert.deepEqual(validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId,
      targetType,
      targetId: actionId === "cleanup" ? "workspace-1" : "codex/example",
      resultingStage,
      authorityState: "allowed",
      riskTier,
      evidenceRefs: [...validEvidence, ...evidenceRefs],
    }), [], `expected complete action-specific evidence for ${actionId}`);

    const targetBoundEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId,
      targetType,
      targetId: actionId === "cleanup" ? "workspace-1" : "codex/example",
      resultingStage,
      authorityState: "allowed",
      riskTier,
      evidenceRefs: [...validEvidence, ...evidenceRefs.filter((ref) => !ref.includes("-context:")), contextEvidenceRef(actionId, "wrong-target")],
    }).map((issue) => issue.code);
    assert.ok(targetBoundEvidenceIssues.includes("policy_violation"), `missing target-bound evidence issue for ${actionId}`);

    if (actionId === "delete_branch" || actionId === "cleanup") {
      for (const requiredRef of evidenceRefs.filter((ref) =>
        /(?:merged-pr|lane-owner|worktree-identity|local-(?:branch-)?sha|remote-(?:branch-)?sha|delivery-head-match)/.test(ref)
      )) {
        const missingSafetyEvidenceIssues = validatePipelineOperationalActionResultV0({
          ...validResult,
          actionId,
          targetType,
          targetId: actionId === "cleanup" ? "workspace-1" : "codex/example",
          resultingStage,
          authorityState: "allowed",
          riskTier,
          evidenceRefs: [...validEvidence, ...evidenceRefs.filter((ref) => ref !== requiredRef)],
        }).map((issue) => issue.code);
        assert.ok(missingSafetyEvidenceIssues.includes("policy_violation"), `missing cleanup/delete safety evidence ${requiredRef}`);
      }
    }
  }

  const mutatingSuccessEvidence = {
    dispatch_apply: {
      targetType: "work_item",
      targetId: "lane-ready",
      riskTier: "high",
      resultingStage: "execute",
      resultingStatus: "active",
      evidenceRefs: [
        approvalEvidenceRef("needs_authority_approval", "dispatch_apply", "lane-ready"),
        contextEvidenceRef("dispatch_apply", "lane-ready"),
        `evidence:dispatch-apply-lane-${evidenceToken("lane-ready")}`,
        "evidence:dispatch-apply-workspace-20260704-lane-ready",
        "evidence:dispatch-apply-result-claimed",
      ],
    },
    kill_worker: {
      targetType: "worker",
      targetId: "codex-1",
      riskTier: "high",
      resultingStage: "terminal",
      resultingStatus: "complete",
      evidenceRefs: [
        approvalEvidenceRef("needs_authority_approval", "kill_worker", "codex-1"),
        contextEvidenceRef("kill_worker", "codex-1"),
        `evidence:kill-worker-target-${evidenceToken("codex-1")}`,
        "evidence:kill-worker-result-terminated",
      ],
    },
    mutate_source: {
      targetType: "work_packet",
      targetId: "packet-1",
      riskTier: "high",
      resultingStage: "execute",
      resultingStatus: "active",
      evidenceRefs: [
        approvalEvidenceRef("needs_authority_approval", "mutate_source", "packet-1"),
        contextEvidenceRef("mutate_source", "packet-1"),
        `evidence:mutate-source-ref-${evidenceToken("packet-1")}`,
        "evidence:mutate-source-result-updated",
      ],
    },
    retry_verification: {
      targetType: "execution_attempt",
      targetId: "attempt-1",
      riskTier: "medium",
      resultingStage: "execute",
      resultingStatus: "active",
      evidenceRefs: [
        approvalEvidenceRef("needs_authority_approval", "retry_verification", "attempt-1"),
        contextEvidenceRef("retry_verification", "attempt-1"),
        `evidence:retry-verification-ref-${evidenceToken("attempt-1")}`,
        "evidence:retry-verification-result-queued",
      ],
    },
    requeue: {
      targetType: "work_item",
      targetId: "item-1",
      riskTier: "medium",
      resultingStage: "execute",
      resultingStatus: "waiting",
      evidenceRefs: [
        approvalEvidenceRef("needs_authority_approval", "requeue", "item-1"),
        contextEvidenceRef("requeue", "item-1"),
        `evidence:requeue-item-${evidenceToken("item-1")}`,
        "evidence:requeue-result-queued",
      ],
    },
    credential_or_provider_change: {
      targetType: "runtime",
      targetId: "runtime-1",
      riskTier: "extreme",
      resultingStage: "execute",
      resultingStatus: "active",
      evidenceRefs: [
        approvalEvidenceRef("needs_resource_approval", "credential_or_provider_change", "runtime-1"),
        contextEvidenceRef("credential_or_provider_change", "runtime-1"),
        `evidence:provider-change-target-${evidenceToken("runtime-1")}`,
        "evidence:provider-change-result-updated",
      ],
    },
  };

  for (const [actionId, config] of Object.entries(mutatingSuccessEvidence)) {
    const missingConcreteEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId,
      targetType: config.targetType,
      targetId: config.targetId,
      resultingStage: config.resultingStage,
      resultingStatus: config.resultingStatus,
      authorityState: "allowed",
      riskTier: config.riskTier,
      evidenceRefs: [...validEvidence, config.evidenceRefs[0], config.evidenceRefs[1]],
    }).map((issue) => issue.code);
    assert.ok(missingConcreteEvidenceIssues.includes("policy_violation"), `missing concrete success evidence issue for ${actionId}`);

    assert.deepEqual(validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId,
      targetType: config.targetType,
      targetId: config.targetId,
      resultingStage: config.resultingStage,
      resultingStatus: config.resultingStatus,
      authorityState: "allowed",
      riskTier: config.riskTier,
      evidenceRefs: [...validEvidence, ...config.evidenceRefs],
    }), [], `expected complete mutating success evidence for ${actionId}`);
  }

  for (const targetId of ["lane,ready:branch@1", "a" + "b".repeat(198) + "c"]) {
    assert.deepEqual(validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId: "dispatch_apply",
      targetType: "work_item",
      targetId,
      resultingStage: "execute",
      resultingStatus: "active",
      authorityState: "allowed",
      riskTier: "high",
      evidenceRefs: [
        ...validEvidence,
        approvalEvidenceRef("needs_authority_approval", "dispatch_apply", targetId),
        contextEvidenceRef("dispatch_apply", targetId),
        `evidence:dispatch-apply-lane-${evidenceToken(targetId)}`,
        `evidence:dispatch-apply-workspace-${evidenceToken(`workspace-${targetId}`)}`,
        "evidence:dispatch-apply-result-claimed",
      ],
    }), [], `expected bounded success evidence for target ${targetId}`);
  }

  const missingApprovalEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
  }).map((issue) => issue.code);
  assert.ok(missingApprovalEvidenceIssues.includes("policy_violation"));

  const misleadingApprovalEvidenceIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    authorityState: "allowed",
    riskTier: "extreme",
    evidenceRefs: [...validEvidence, "evidence:not-approval-needs_safety_approval-denied"],
  }).map((issue) => issue.code);
  assert.ok(misleadingApprovalEvidenceIssues.includes("policy_violation"));

  const allowedBlockedWithoutApprovalIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    outcome: "blocked",
    resultingStage: "deliver",
    capabilityState: "gated",
    authorityState: "allowed",
    riskTier: "extreme",
    typedReason: "blocked_by_approval",
    evidenceRefs: validEvidence,
  }).map((issue) => issue.code);
  assert.ok(allowedBlockedWithoutApprovalIssues.includes("policy_violation"));

  const allowedBlockedWithApprovalIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    outcome: "blocked",
    resultingStage: "deliver",
    resultingStatus: "blocked",
    capabilityState: "gated",
    authorityState: "allowed",
    riskTier: "extreme",
    typedReason: "blocked_by_approval",
    evidenceRefs: [...validEvidence, approvalEvidenceRef("needs_safety_approval", "merge")],
  }).map((issue) => issue.code);
  assert.ok(allowedBlockedWithApprovalIssues.includes("inconsistent_result"));

  assert.deepEqual(validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "retry_verification",
    targetType: "execution_attempt",
    targetId: "attempt-1",
    outcome: "failed",
    resultingStage: "execute",
    resultingStatus: "failed",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "medium",
    typedReason: "verification_failed",
    evidenceRefs: [
      ...validEvidence,
      approvalEvidenceRef("needs_authority_approval", "retry_verification", "attempt-1"),
      contextEvidenceRef("retry_verification", "attempt-1"),
    ],
  }), []);

  const allowedFailedWithoutContextIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "retry_verification",
    targetType: "execution_attempt",
    targetId: "attempt-1",
    outcome: "failed",
    resultingStage: "execute",
    resultingStatus: "failed",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "medium",
    typedReason: "verification_failed",
    evidenceRefs: [...validEvidence, approvalEvidenceRef("needs_authority_approval", "retry_verification", "attempt-1")],
  }).map((issue) => issue.code);
  assert.ok(allowedFailedWithoutContextIssues.includes("inconsistent_result"));

  const blockedActiveStatusIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    outcome: "blocked",
    capabilityState: "gated",
    authorityState: "blocked",
    typedReason: "blocked_by_approval",
  }).map((issue) => issue.code);
  assert.ok(blockedActiveStatusIssues.includes("inconsistent_result"));

  for (const resultingStage of ["unknown", "deferred"]) {
    const successfulUnknownStageIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      resultingStage,
    }).map((issue) => issue.code);
    assert.ok(successfulUnknownStageIssues.includes("inconsistent_result"), `missing succeeded stage issue for ${resultingStage}`);
  }

  const failedActiveStatusIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    outcome: "failed",
    capabilityState: "gated",
    authorityState: "blocked",
    typedReason: "verification_failed",
  }).map((issue) => issue.code);
  assert.ok(failedActiveStatusIssues.includes("inconsistent_result"));

  const simulatedActiveStatusIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    outcome: "simulated",
    capabilityState: "simulated",
    authorityState: "blocked",
    typedReason: "blocked_by_policy",
  }).map((issue) => issue.code);
  assert.ok(simulatedActiveStatusIssues.includes("inconsistent_result"));

  for (const outcome of ["blocked", "failed", "simulated"]) {
    const wrongAuthorityResultIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      actionId: "merge",
      targetType: "branch",
      targetId: "codex/example",
      outcome,
      resultingStage: "deliver",
      capabilityState: outcome === "simulated" ? "simulated" : "gated",
      authorityState: "needs_authority_approval",
      riskTier: "extreme",
      typedReason: "blocked_by_approval",
    }).map((issue) => issue.code);
    assert.ok(wrongAuthorityResultIssues.includes("policy_violation"), `missing result authority policy issue for ${outcome}`);
  }

  const wrongAuthoritySucceededIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "merge",
    targetType: "branch",
    targetId: "codex/example",
    resultingStage: "deliver",
    capabilityState: "available",
    authorityState: "needs_authority_approval",
    riskTier: "extreme",
    typedReason: null,
    evidenceRefs: [...validEvidence, approvalEvidenceRef("needs_safety_approval", "merge")],
  }).map((issue) => issue.code);
  assert.ok(wrongAuthoritySucceededIssues.includes("policy_violation"));

  for (const result of [
    { actionId: "mark_viewed", targetType: "work_packet", riskTier: "low" },
    { actionId: "retry_verification", targetType: "execution_attempt", riskTier: "medium" },
    { actionId: "requeue", targetType: "work_item", riskTier: "medium" },
    { actionId: "mark_tested", targetType: "work_packet", riskTier: "medium" },
  ]) {
    const missingLowMediumApprovalIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      ...result,
      targetId: "approval-gated-target",
      resultingStage: "execute",
      resultingStatus: "active",
      authorityState: "allowed",
      evidenceRefs: validEvidence,
    }).map((issue) => issue.code);
    assert.ok(missingLowMediumApprovalIssues.includes("policy_violation"), `missing approval evidence issue for ${result.actionId}`);
  }

  assert.deepEqual(validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "mark_viewed",
    targetType: "work_packet",
    targetId: "packet-1",
    riskTier: "low",
    authorityState: "allowed",
    evidenceRefs: [...validEvidence, approvalEvidenceRef("needs_product_approval", "mark_viewed", "packet-1")],
  }), []);

  const simulatedResultIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    outcome: "simulated",
    capabilityState: "simulated",
    authorityState: "needs_authority_approval",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(simulatedResultIssues.includes("inconsistent_result"));

  const invalidResultIssues = validatePipelineOperationalActionResultV0({
    ...validResult,
    actionId: "cleanup",
    targetType: "workspace",
    outcome: "succeeded",
    capabilityState: "unavailable",
    authorityState: "blocked",
    riskTier: "low",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(invalidResultIssues.includes("policy_violation"));
  assert.ok(invalidResultIssues.includes("inconsistent_result"));

  const hostileTopLevel = new Proxy({}, {
    ownKeys() {
      return ["actionId", "schemaVersion"];
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true };
    },
    get() {
      throw new Error("trap");
    },
  });
  let hostileTopLevelIssues = [];
  assert.doesNotThrow(() => {
    hostileTopLevelIssues = validatePipelineOperationalActionRequestV0(hostileTopLevel);
  });
  assert.ok(hostileTopLevelIssues.map((issue) => issue.code).includes("forbidden_field"));

  const hostileRequestedBy = new Proxy({}, {
    ownKeys() {
      throw new Error("trap");
    },
    get() {
      throw new Error("trap");
    },
  });
  let hostileRequestedByIssues = [];
  assert.doesNotThrow(() => {
    hostileRequestedByIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      requestedBy: hostileRequestedBy,
    });
  });
  assert.ok(hostileRequestedByIssues.map((issue) => issue.code).includes("forbidden_field"));

  const hostilePrimitive = {
    toString() {
      throw new Error("trap");
    },
    valueOf() {
      throw new Error("trap");
    },
  };
  let hostilePrimitiveIssues = [];
  assert.doesNotThrow(() => {
    hostilePrimitiveIssues = validatePipelineOperationalActionRequestV0({
      ...validRequest,
      requestedBy: { actorType: hostilePrimitive, actorId: hostilePrimitive },
    });
  });
  assert.ok(hostilePrimitiveIssues.map((issue) => issue.code).includes("invalid_actor"));

  const hostileEvidenceRefs = new Proxy([], {
    get() {
      throw new Error("trap");
    },
  });
  let hostileEvidenceIssues = [];
  assert.doesNotThrow(() => {
    hostileEvidenceIssues = validatePipelineOperationalActionResultV0({
      ...validResult,
      evidenceRefs: hostileEvidenceRefs,
    });
  });
  assert.ok(hostileEvidenceIssues.map((issue) => issue.code).includes("evidence_required"));

  const { proxy: revokedTopLevel, revoke: revokeTopLevel } = Proxy.revocable({}, {});
  revokeTopLevel();
  let revokedTopLevelIssues = [];
  assert.doesNotThrow(() => {
    revokedTopLevelIssues = validatePipelineOperationalActionRequestV0(revokedTopLevel);
  });
  assert.ok(revokedTopLevelIssues.map((issue) => issue.code).includes("forbidden_field"));

  const { proxy: revokedNestedArray, revoke: revokeNestedArray } = Proxy.revocable([], {});
  revokeNestedArray();
  let revokedNestedArrayIssues = [];
  assert.doesNotThrow(() => {
    revokedNestedArrayIssues = validatePipelineOperationalRuntimeReadinessV0({
      actionCapabilities: revokedNestedArray,
    });
  });
  assert.ok(revokedNestedArrayIssues.map((issue) => issue.code).includes("forbidden_field"));
  assert.ok(revokedNestedArrayIssues.map((issue) => issue.code).includes("invalid_enum"));

  const stateRoot = await mkdtemp(join(tmpdir(), "operational-action-contract-cycle-"));
  try {
  const readyCycle = buildCyclePacket(
    { stateRoot, desiredWorkers: 1, runId: "manager-test", now: new Date().toISOString() },
    {
      preflightStatus: { status: "ready" },
      usageContext: { status: "normal" },
      resourceContext: { status: "normal" },
      workerStatus: { status: "ready" },
      assignmentSummary: { summary: { backlogStatusCounts: { assignable: 1 } } },
      dispatchPreview: {
        counts: { dispatchable: 1, active: 0 },
        candidateStateCounts: { assignable: 1 },
        mutation: "none; dry-run summary only",
      },
    },
  );
  const validReadiness = readyCycle.summary.operationalActions;
  assert.deepEqual(validatePipelineOperationalRuntimeReadinessV0(validReadiness), []);
  const readinessCapabilities = new Map(validReadiness.actionCapabilities.map((capability) => [capability.actionId, capability]));
  assert.equal(readinessCapabilities.get("dispatch_apply").capabilityState, "gated");
  assert.equal(readinessCapabilities.get("dispatch_apply").authorityState, "needs_authority_approval");
  assert.equal(readinessCapabilities.get("dispatch_apply").typedReason, "blocked_by_approval");
  for (const capability of validReadiness.actionCapabilities) {
    assert.deepEqual(validatePipelineOperationalActionCapabilityV0(capability), []);
  }

  const unknownReadinessFieldIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    mutation: "none; read-only operational action readiness projection",
  }).map((issue) => issue.code);
  assert.ok(unknownReadinessFieldIssues.includes("forbidden_field"));

  const missingCapabilityIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    actionCapabilities: validReadiness.actionCapabilities.slice(1),
  }).map((issue) => issue.code);
  assert.ok(missingCapabilityIssues.includes("inconsistent_result"));

  const missingReadOnlyCapabilityIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    actionCapabilities: validReadiness.actionCapabilities.map((capability) =>
      capability.actionId === "refresh_projection"
        ? { ...capability, capabilityState: "gated", authorityState: "blocked", typedReason: "runtime_unavailable" }
        : capability,
    ),
  }).map((issue) => issue.code);
  assert.ok(missingReadOnlyCapabilityIssues.includes("inconsistent_result"));

  const duplicateCapabilityIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    actionCapabilities: [...validReadiness.actionCapabilities, validReadiness.actionCapabilities[0]],
  }).map((issue) => issue.code);
  assert.ok(duplicateCapabilityIssues.includes("inconsistent_result"));

  const degradedMissingHighRiskCapabilityIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    readinessState: "degraded",
    capabilityState: "gated",
    typedReason: "runtime_unavailable",
    actionCapabilities: validReadiness.actionCapabilities.filter((capability) => capability.actionId !== "merge"),
  }).map((issue) => issue.code);
  assert.ok(degradedMissingHighRiskCapabilityIssues.includes("inconsistent_result"));

  const readyReasonIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    typedReason: "blocked_by_policy",
  }).map((issue) => issue.code);
  assert.ok(readyReasonIssues.includes("inconsistent_result"));

  const degradedMissingReasonIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    readinessState: "degraded",
    capabilityState: "gated",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(degradedMissingReasonIssues.includes("inconsistent_result"));

  const contradictoryReadyIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    readinessState: "ready",
    capabilityState: "gated",
    typedReason: "runtime_unavailable",
  }).map((issue) => issue.code);
  assert.ok(contradictoryReadyIssues.includes("inconsistent_result"));

  const disabledReadyIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    operationalMode: "disabled",
  }).map((issue) => issue.code);
  assert.ok(disabledReadyIssues.includes("inconsistent_result"));

  const unavailableReadyIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    operationalMode: "unavailable",
  }).map((issue) => issue.code);
  assert.ok(unavailableReadyIssues.includes("inconsistent_result"));

  const unknownAvailableReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    readinessState: "unknown",
    operationalMode: "unknown",
    freshnessState: "unknown",
    capabilityState: "available",
    typedReason: null,
  }).map((issue) => issue.code);
  assert.ok(unknownAvailableReadinessIssues.includes("inconsistent_result"));

  const staleDegradedReadiness = buildCyclePacket(
    { stateRoot, desiredWorkers: 1, runId: "manager-test", now: "not-a-date" },
    {
      preflightStatus: { status: "ready" },
      usageContext: { status: "normal" },
      resourceContext: { status: "normal" },
      workerStatus: { status: "ready" },
      assignmentSummary: { summary: { backlogStatusCounts: { assignable: 1 } } },
      dispatchPreview: {
        counts: { dispatchable: 1, active: 0 },
        candidateStateCounts: { assignable: 1 },
        mutation: "none; dry-run summary only",
      },
    },
  ).summary.operationalActions;
  assert.equal(staleDegradedReadiness.readinessState, "degraded");
  assert.equal(staleDegradedReadiness.freshnessState, "stale");
  assert.equal(staleDegradedReadiness.typedReason, "projection_stale");
  assert.equal(
    staleDegradedReadiness.actionCapabilities.find((capability) => capability.actionId === "refresh_projection")?.typedReason,
    "projection_stale",
  );
  const staleDegradedReadinessIssues = validatePipelineOperationalRuntimeReadinessV0(staleDegradedReadiness).map((issue) => issue.code);
  assert.ok(staleDegradedReadinessIssues.includes("stale_or_unparseable_readiness"));

  const futureReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    checkedAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
  }).map((issue) => issue.code);
  assert.ok(futureReadinessIssues.includes("stale_or_unparseable_readiness"));

  const checkedAfterExpiresIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    checkedAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
  }).map((issue) => issue.code);
  assert.ok(checkedAfterExpiresIssues.includes("stale_or_unparseable_readiness"));

  const expiredReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    checkedAt: "2020-01-01T00:00:00.000Z",
    expiresAt: "2020-01-01T00:05:00.000Z",
  }).map((issue) => issue.code);
  assert.ok(expiredReadinessIssues.includes("stale_or_unparseable_readiness"));

  const overlongReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
  }).map((issue) => issue.code);
  assert.ok(overlongReadinessIssues.includes("stale_or_unparseable_readiness"));

  const unsafeReadinessSummaryIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    summary: "raw prompt provider payload",
  }).map((issue) => issue.code);
  assert.ok(unsafeReadinessSummaryIssues.includes("unsafe_metadata_retention"));

  const malformedReadinessEvidenceIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    evidenceRefs: ["bad evidence ref"],
  }).map((issue) => issue.code);
  assert.ok(malformedReadinessEvidenceIssues.includes("evidence_required"));

  const excessiveReadinessEvidenceIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    evidenceRefs: Array.from({ length: 25 }, (_, index) => `verification:readiness-${index}`),
  }).map((issue) => issue.code);
  assert.ok(excessiveReadinessEvidenceIssues.includes("evidence_required"));

  const targetlessApprovedDispatchCapabilityIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    operationalMode: "bounded_write",
    actionCapabilities: validReadiness.actionCapabilities.map((capability) =>
      capability.actionId === "dispatch_apply"
        ? {
            ...capability,
            targetId: null,
            capabilityState: "available",
            authorityState: "allowed",
            typedReason: null,
            evidenceRefs: [
              "operational-action:dispatch_apply",
              "manager-cycle:manager-test",
              "evidence:capability-approval-needs_authority_approval:dispatch_apply:unknown-0",
            ],
          }
        : capability,
    ),
  }).map((issue) => issue.code);
  assert.ok(targetlessApprovedDispatchCapabilityIssues.includes("blank_identifier"));

  const readOnlyApprovedDispatchReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    operationalMode: "read_only",
    actionCapabilities: validReadiness.actionCapabilities.map((capability) =>
      capability.actionId === "dispatch_apply"
        ? {
            ...capability,
            targetId: "lane-ready",
            capabilityState: "available",
            authorityState: "allowed",
            typedReason: null,
            evidenceRefs: [
              "operational-action:dispatch_apply",
              "manager-cycle:manager-test",
              capabilityApprovalEvidenceRef("needs_authority_approval", "dispatch_apply", "lane-ready"),
            ],
          }
        : capability,
    ),
  }).map((issue) => issue.code);
  assert.ok(readOnlyApprovedDispatchReadinessIssues.includes("inconsistent_result"));

  const boundedWriteMissingDispatchApprovalIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    operationalMode: "bounded_write",
    actionCapabilities: validReadiness.actionCapabilities.map((capability) =>
      capability.actionId === "dispatch_apply"
        ? {
            ...capability,
            targetId: "lane-ready",
            capabilityState: "available",
            authorityState: "allowed",
            typedReason: null,
            evidenceRefs: [
              "operational-action:dispatch_apply",
              "manager-cycle:manager-test",
            ],
          }
        : capability,
    ),
  }).map((issue) => issue.code);
  assert.ok(boundedWriteMissingDispatchApprovalIssues.includes("policy_violation"));

  const invalidReadinessIssues = validatePipelineOperationalRuntimeReadinessV0({
    ...validReadiness,
    schemaVersion: "old",
    actionSchemaVersion: "old-action",
    freshnessState: "stale",
    summary: "provider payload sk-testtoken123456789",
    checkedAt: "not-a-date",
    expiresAt: "2020-01-01T00:00:00.000Z",
    actionCapabilities: "not-array",
    rawPayloadRetained: true,
    credential: "do not retain credentials",
  }).map((issue) => issue.code);
  for (const expectedCode of ["bad_schema_version", "stale_or_unparseable_readiness", "invalid_enum", "bad_retention_flag", "unsafe_metadata_retention", "forbidden_field"]) {
    assert.ok(invalidReadinessIssues.includes(expectedCode), `missing readiness issue ${expectedCode}`);
  }
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("authoritative lifecycle rules create metadata-only creation and transition events", async () => {
  const {
    createWorkPacketCreatedEvent,
    createWorkPacketTransitionEvent,
    isAuthoritativePacketStage,
  } = await loadCompiledLifecycleModule();

  assert.equal(isAuthoritativePacketStage("needs_approval"), true);
  assert.equal(isAuthoritativePacketStage("human_gate"), false);

  const sourceRef = {
    refId: "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
    sourceType: "prd",
    pathOrUrl: "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
    title: "Backend-backed pipeline control plane",
  };
  const actor = { actorType: "manager", actorId: "manager-test", actorLabel: "Manager" };

  const created = createWorkPacketCreatedEvent({
    packetId: "packet-story-1-1",
    eventId: "event-created",
    occurredAt: "2026-07-02T00:00:00.000Z",
    sourceRef,
    actor,
    idempotencyKey: "create-1-1",
    evidenceRefs: ["story:1-1"],
  });
  assert.equal(created.eventType, "packet.created");
  assert.equal(created.previousStage, null);
  assert.equal(created.targetStage, "capture");
  assert.equal(created.metadataOnly, true);
  assert.equal(created.sourceRef.refId, sourceRef.refId);
  assert.deepEqual(created.evidenceRefs, ["story:1-1"]);

  const transitioned = createWorkPacketTransitionEvent({
    packetId: "packet-story-1-1",
    previousStage: "shape",
    targetStage: "needs_approval",
    eventId: "event-needs-approval",
    occurredAt: "2026-07-02T00:01:00.000Z",
    sourceRef,
    actor,
    payloadSummary: "Accepted transition to needs approval.",
  });
  assert.equal(transitioned.eventType, "packet.stage_transitioned");
  assert.equal(transitioned.previousStage, "shape");
  assert.equal(transitioned.targetStage, "needs_approval");
  assert.equal(transitioned.metadataOnly, true);

  assert.throws(
    () => createWorkPacketCreatedEvent({
      packetId: "packet-story-1-1",
      eventId: "event-unsafe",
      occurredAt: "2026-07-02T00:00:00.000Z",
      sourceRef,
      actor,
      payloadSummary: "rawPrompt must not be stored",
    }),
    /must not retain raw prompt/,
  );

  const unsafeMarkers = [
    ["raw-completion", "raw completion must not be stored"],
    ["raw-prompts-plural", "raw prompts must not be stored"],
    ["provider-payload", "provider payload must not be stored"],
    ["provider-payloads-plural", "provider payloads must not be stored"],
    ["reasoning-trace", "reasoning trace must not be stored"],
    ["reasoning-traces-plural", "reasoning traces must not be stored"],
    ["secret", "secret must not be stored"],
    ["secret-key", "secret_key must not be stored"],
    ["credential", "credential must not be stored"],
    ["credential-id", "credential_id must not be stored"],
    ["terminal-scrollback", "terminal scrollback must not be stored"],
    ["terminal-scrollback-plural", "terminal scrollbacks must not be stored"],
    ["terminal-output", "terminal output must not be stored"],
    ["terminal-stdout", "terminal stdout must not be stored"],
    ["terminal-stderr", "terminal stderr must not be stored"],
    ["tmux-scrollback", "tmux scrollback must not be stored"],
    ["tmux-output", "tmux output must not be stored"],
    ["tmux-underscore-scrollback", "tmux_scrollback must not be stored"],
    ["pane-scrollback", "pane scrollback must not be stored"],
    ["pane-text", "pane text must not be stored"],
    ["raw-transcript", "raw transcript must not be stored"],
  ];

  for (const [caseId, payloadSummary] of unsafeMarkers) {
    assert.throws(
      () => createWorkPacketTransitionEvent({
        packetId: "packet-story-1-1",
        previousStage: "capture",
        targetStage: "classify",
        eventId: `event-unsafe-${caseId}`,
        occurredAt: "2026-07-02T00:02:00.000Z",
        sourceRef,
        actor,
        payloadSummary,
      }),
      /must not retain raw prompt/,
      caseId,
    );
  }

  for (const [caseId, marker] of unsafeMarkers) {
    const evidenceRef = `evidence:${marker.replaceAll(" ", "-")}`;
    assert.throws(
      () => createWorkPacketTransitionEvent({
        packetId: "packet-story-1-1",
        previousStage: "capture",
        targetStage: "classify",
        eventId: `event-unsafe-ref-${caseId}`,
        occurredAt: "2026-07-02T00:03:00.000Z",
        sourceRef,
        actor,
        evidenceRefs: [evidenceRef],
      }),
      /must not retain raw prompt/,
      `evidence ref ${caseId}`,
    );
  }

  assert.throws(
    () => createWorkPacketCreatedEvent({
      packetId: "packet-story-1-1",
      eventId: "event-unsafe-ref",
      occurredAt: "2026-07-02T00:00:00.000Z",
      sourceRef,
      actor,
      evidenceRefs: ["tmux-pane-scrollback:do-not-store"],
    }),
    /must not retain raw prompt/,
  );

  assert.throws(
    () => createWorkPacketCreatedEvent({
      packetId: "packet-story-1-1",
      eventId: "event-non-string-ref",
      occurredAt: "2026-07-02T00:00:00.000Z",
      sourceRef,
      actor,
      evidenceRefs: [42],
    }),
    /evidence refs must be strings/,
  );

  assert.equal(
    createWorkPacketCreatedEvent({
      packetId: "packet-story-1-1",
      eventId: "event-blank-summary",
      occurredAt: "2026-07-02T00:00:00.000Z",
      sourceRef,
      actor,
      payloadSummary: "   ",
    }).payloadSummary,
    "Metadata-only lifecycle event.",
  );
});

test("authoritative lifecycle stage contract maps PRD semantics and blocks non-dispatchable states", async () => {
  const {
    AUTHORITATIVE_PACKET_STAGES,
    AUTHORITATIVE_PACKET_STATUSES,
    AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS,
    PIPELINE_LIFECYCLE_STAGE_TO_AUTHORITATIVE,
    isDispatchableAuthoritativePacketState,
    isKnownAuthoritativePacketStage,
    isLiveProgressAuthoritativePacketState,
  } = await loadCompiledLifecycleModule();

  assert.deepEqual(AUTHORITATIVE_PACKET_STAGES, [
    "capture",
    "classify",
    "route",
    "shape",
    "needs_approval",
    "execute",
    "review",
    "promote",
    "deliver",
    "learn",
  ]);
  assert.deepEqual(AUTHORITATIVE_PACKET_STATUSES, ["active", "waiting", "blocked", "failed", "complete", "deferred"]);

  assert.deepEqual(PIPELINE_LIFECYCLE_STAGE_TO_AUTHORITATIVE, {
    intake: "capture",
    route: "route",
    shape: "shape",
    approval: "needs_approval",
    execute: "execute",
    review: "review",
    promote: "promote",
    deliver: "deliver",
    learn: "learn",
    terminal: "terminal",
    deferred: "deferred",
    unknown: "unknown",
  });

  assert.equal(AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS.capture, "intake");
  assert.equal(AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS.classify, "intake");
  assert.equal(AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS.needs_approval, "approval");
  assert.equal(isKnownAuthoritativePacketStage("execute"), true);
  assert.equal(isKnownAuthoritativePacketStage("unknown"), false);

  assert.equal(isDispatchableAuthoritativePacketState({ currentStage: "route", status: "waiting" }), true);
  assert.equal(isLiveProgressAuthoritativePacketState({ currentStage: "execute", status: "active" }), true);
  assert.equal(isLiveProgressAuthoritativePacketState({ currentStage: "needs_approval", status: "active" }), false);

  for (const state of [
    null,
    undefined,
    { currentStage: "unknown", status: "waiting" },
    { currentStage: "terminal", status: "active" },
    { currentStage: "terminal", status: "waiting" },
    { currentStage: "deferred", status: "waiting" },
    { currentStage: "learn", status: "complete" },
    { currentStage: "route", status: "complete" },
    { currentStage: "execute", status: "deferred" },
    { currentStage: "execute", status: "failed" },
    { currentStage: "route", status: "unknown" },
    { targetStage: "execute", status: "active" },
    { targetStage: "execute", status: "waiting" },
    { currentStage: "route", targetStage: "execute", status: "waiting" },
  ]) {
    assert.equal(isDispatchableAuthoritativePacketState(state), false, `${JSON.stringify(state)} must not dispatch`);
    assert.equal(isLiveProgressAuthoritativePacketState(state), false, `${JSON.stringify(state)} must not count as live progress`);
  }
});

test("dashboard projection contract validator accepts explicit states and rejects bad labels", async () => {
  const dashboardSupervisorSource = await readFile(dashboardSupervisorPath, "utf8");
  const { getPipelineDashboardProjection, setProjectionEnvelope, setProjectionPayload, setResponseOk } = loadDashboardSupervisorModule(dashboardSupervisorSource);

  const liveProjection = projectionContractFixture();
  setProjectionPayload(liveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), liveProjection);

  const legacySelectedDetail = { ...liveProjection.selectedPacketDetails[0] };
  delete legacySelectedDetail.latestTransitionEventRef;
  delete legacySelectedDetail.recentTransitionEventRefs;
  delete legacySelectedDetail.latestMovementSummary;
  delete legacySelectedDetail.canSatisfyLiveMovementProof;
  const legacyCompatibleProjection = projectionContractFixture({
    selectedPacketDetails: [legacySelectedDetail],
  });
  setProjectionPayload(legacyCompatibleProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), legacyCompatibleProjection);

  const legacyAdditiveManagerProjection = projectionContractFixture({
    managerSummary: { ...liveProjection.managerSummary, reliabilityState: "ready" },
  });
  delete legacyAdditiveManagerProjection.managerSummary.evidenceRefs;
  delete legacyAdditiveManagerProjection.managerSummary.healthySourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.exhaustedSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.blockedSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.gatedSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.staleSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.unavailableSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.refillingSourceCount;
  delete legacyAdditiveManagerProjection.managerSummary.unknownSourceCount;
  setProjectionPayload(legacyAdditiveManagerProjection);
  const normalizedLegacyManagerProjection = await getPipelineDashboardProjection();
  assert.equal(normalizedLegacyManagerProjection.managerSummary.reliabilityState, "ready");
  assert.equal(normalizedLegacyManagerProjection.managerSummary.evidenceRefs.length, 0);
  assert.equal(normalizedLegacyManagerProjection.managerSummary.healthySourceCount, null);

  const legacyWorkerProjection = projectionContractFixture();
  delete legacyWorkerProjection.workerSummary;
  delete legacyWorkerProjection.reliabilityProblems;
  setProjectionPayload(legacyWorkerProjection);
  const normalizedLegacyWorkerProjection = await getPipelineDashboardProjection();
  assert.equal(normalizedLegacyWorkerProjection.workerSummary.stateSource, "unknown");
  assert.equal(normalizedLegacyWorkerProjection.workerSummary.warmCount, null);
  assert.equal(normalizedLegacyWorkerProjection.workerSummary.evidenceRefs.length, 0);
  assert.equal(normalizedLegacyWorkerProjection.reliabilityProblems.length, 0);

  const partialWorkerProjection = projectionContractFixture({
    workerSummary: {
      warmCount: 1,
      activeCount: 0,
      workerRefs: ["worker:codex-2"],
      evidenceRefs: ["worker:codex-2"],
    },
  });
  delete partialWorkerProjection.workerSummary.waitingCount;
  delete partialWorkerProjection.workerSummary.stalledCount;
  delete partialWorkerProjection.workerSummary.failedCount;
  delete partialWorkerProjection.workerSummary.drainingCount;
  delete partialWorkerProjection.workerSummary.killedCount;
  delete partialWorkerProjection.workerSummary.completeCount;
  delete partialWorkerProjection.workerSummary.unavailableCount;
  delete partialWorkerProjection.workerSummary.unknownCount;
  delete partialWorkerProjection.workerSummary.summary;
  delete partialWorkerProjection.workerSummary.metadataOnly;
  setProjectionPayload(partialWorkerProjection);
  const normalizedPartialWorkerProjection = await getPipelineDashboardProjection();
  assert.equal(normalizedPartialWorkerProjection.workerSummary.warmCount, 1);
  assert.equal(normalizedPartialWorkerProjection.workerSummary.stalledCount, null);
  assert.equal(normalizedPartialWorkerProjection.workerSummary.summary, "Worker runtime state is not connected to the supervisor projection.");

  const fixtureEnabledProjection = projectionContractFixture({
    sourceLabel: "fixture",
    freshnessState: "unknown",
    backendReachability: {
      state: "unknown",
      checkedAt: "2026-07-02T17:00:00.000Z",
      reason: "unknown",
      summary: "Fixture projection is local test data.",
    },
    fixtureMode: {
      enabled: true,
      reason: "contract fixture enabled for test",
      allowedForEnvironment: true,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      label: "fixture",
      emptyReason: "unknown",
      backendEmpty: false,
      backendUnavailable: false,
      fixtureBacked: true,
      stale: false,
      summary: "Fixture projection is explicit and non-live.",
    },
    managerSummary: {
      stateSource: "unknown",
      freshnessState: "unknown",
      activeLeaseCount: null,
      activeWorkerCount: null,
      warmWorkerCount: null,
      blockedQueueCount: null,
      dispatchableQueueCount: null,
      closedQueueCount: null,
      sourceExhausted: false,
      inactivityReason: "unknown",
      summary: "Fixture projection has no live manager authority.",
      metadataOnly: true,
    },
    queueSummary: {
      activeCount: null,
      dispatchableCount: null,
      blockedCount: null,
      gatedCount: null,
      closedCount: null,
      staleCount: null,
      refillingCount: null,
      unknownCount: null,
      emptyReason: "unknown",
      sourceExhausted: false,
      summary: "Fixture projection has no live queue authority.",
    },
    workPackets: [],
    selectedPacketDetails: [],
    sourceStates: [],
    reliabilityProblems: [],
    evidenceRefs: ["fixture:projection-contract"],
  });
  setProjectionPayload(fixtureEnabledProjection);
  const acceptedFixtureProjection = await getPipelineDashboardProjection();
  assert.equal(acceptedFixtureProjection.sourceLabel, "fixture");
  assert.equal(acceptedFixtureProjection.fixtureMode.enabled, true);
  assert.equal(acceptedFixtureProjection.fixtureMode.visibleLabelRequired, true);
  assert.equal(acceptedFixtureProjection.fixtureMode.canSatisfyLiveProof, false);
  assert.equal(acceptedFixtureProjection.truthSummary.fixtureBacked, true);

  const healthyEmptyLiveProjection = projectionContractFixture({
    truthSummary: {
      ...liveProjection.truthSummary,
      emptyReason: "healthy_empty",
      backendEmpty: true,
      summary: "Live backend projection has no queued work.",
    },
    queueSummary: {
      ...liveProjection.queueSummary,
      activeCount: 0,
      dispatchableCount: 0,
      gatedCount: 0,
      emptyReason: "healthy_empty",
      summary: "Queue is healthy and empty.",
    },
    managerSummary: {
      ...liveProjection.managerSummary,
      reliabilityState: "healthy_idle",
      dispatchableQueueCount: 0,
      inactivityReason: "healthy_empty",
    },
    workPackets: [],
    selectedPacketDetails: [],
    sourceStates: [],
    reliabilityProblems: [],
    evidenceRefs: ["supervisor:healthy-empty"],
  });
  setProjectionPayload(healthyEmptyLiveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), healthyEmptyLiveProjection);

  const sourceExhaustedProjection = projectionContractFixture({
    truthSummary: {
      ...liveProjection.truthSummary,
      summary: "Closed packets remain visible while approved source work is exhausted.",
    },
    managerSummary: {
      ...liveProjection.managerSummary,
      reliabilityState: "source_exhausted",
      sourceExhausted: true,
      inactivityReason: "source_exhausted",
      dispatchableQueueCount: 0,
      summary: "Manager has no dispatchable work because approved source is exhausted.",
    },
    queueSummary: {
      ...liveProjection.queueSummary,
      activeCount: 0,
      dispatchableCount: 0,
      closedCount: 1,
      emptyReason: "source_exhausted",
      sourceExhausted: true,
      summary: "Queue is exhausted for the approved source.",
    },
    sourceStates: [
      {
        ...liveProjection.sourceStates[0],
        state: "exhausted",
        summary: "Approved source work is exhausted.",
        evidenceRefs: ["evidence:source-exhausted"],
      },
    ],
    workPackets: [{ ...liveProjection.workPackets[0], status: "complete" }],
    selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], status: "complete", canSatisfyLiveMovementProof: false }],
    reliabilityProblems: [],
    evidenceRefs: ["evidence:source-exhausted"],
  });
  setProjectionPayload(sourceExhaustedProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), sourceExhaustedProjection);

  const zeroPacketSourceExhaustedProjection = projectionContractFixture({
    truthSummary: {
      ...liveProjection.truthSummary,
      emptyReason: "source_exhausted",
      backendEmpty: true,
      summary: "No backend WorkPackets are present; approved source work is exhausted.",
    },
    managerSummary: {
      ...liveProjection.managerSummary,
      reliabilityState: "source_exhausted",
      sourceExhausted: true,
      inactivityReason: "source_exhausted",
      dispatchableQueueCount: 0,
      blockedQueueCount: 0,
      closedQueueCount: 0,
      summary: "Manager has no dispatchable work because approved source is exhausted.",
    },
    queueSummary: {
      ...liveProjection.queueSummary,
      activeCount: 0,
      dispatchableCount: 0,
      blockedCount: 0,
      gatedCount: 0,
      closedCount: 0,
      staleCount: 0,
      refillingCount: 0,
      unknownCount: 0,
      emptyReason: "source_exhausted",
      sourceExhausted: true,
      summary: "Queue is exhausted for the approved source.",
    },
    sourceStates: [
      {
        ...liveProjection.sourceStates[0],
        state: "exhausted",
        summary: "Approved source work is exhausted.",
        evidenceRefs: ["evidence:source-exhausted"],
      },
    ],
    workPackets: [],
    selectedPacketDetails: [],
    reliabilityProblems: [],
    evidenceRefs: ["evidence:source-exhausted"],
  });
  setProjectionPayload(zeroPacketSourceExhaustedProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), zeroPacketSourceExhaustedProjection);

  const staleOpenLiveProjection = projectionContractFixture({
    sourceUpdatedAt: "2026-07-02T16:59:00.000Z",
  });
  setProjectionPayload(staleOpenLiveProjection);
  assert.deepEqual(await getPipelineDashboardProjection(), staleOpenLiveProjection);

  for (const [caseId, override] of [
    ["bad-source-label", { sourceLabel: "tmux_active" }],
    ["bad-freshness-state", { freshnessState: "terminal_idle" }],
    ["fixture-live-proof", { fixtureMode: { ...liveProjection.fixtureMode, canSatisfyLiveProof: true } }],
    ["fixture-live-labels", { fixtureMode: { ...liveProjection.fixtureMode, enabled: true, canSatisfyLiveProof: false } }],
    [
      "stale-timestamp-without-open-packet",
      {
        sourceUpdatedAt: "2026-07-02T16:59:00.000Z",
        workPackets: [{ ...liveProjection.workPackets[0], status: "complete" }],
        selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], status: "complete" }],
      },
    ],
    ["future-timestamp-live-freshness", { sourceUpdatedAt: "2026-07-02T17:00:01.000Z" }],
    ["missing-stage-summary", { stageSummaries: liveProjection.stageSummaries.slice(1) }],
    ["duplicate-stage-summary", { stageSummaries: [liveProjection.stageSummaries[0], ...liveProjection.stageSummaries.slice(0, -1)] }],
    ["mismatched-selected-detail", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], packetId: "packet-other" }] }],
    ["bad-source-states", { sourceStates: [{ ...liveProjection.sourceStates[0], state: "empty" }] }],
    [
      "source-exhausted-without-source-state",
      {
        truthSummary: { ...liveProjection.truthSummary, emptyReason: "source_exhausted" },
        queueSummary: { ...liveProjection.queueSummary, sourceExhausted: true, emptyReason: "source_exhausted" },
        sourceStates: [{ ...liveProjection.sourceStates[0], state: "healthy" }],
      },
    ],
    ["bad-gated-count", { queueSummary: { ...liveProjection.queueSummary, gatedCount: -1 } }],
    ["bad-active-count", { queueSummary: { ...liveProjection.queueSummary, activeCount: -1 } }],
    [
      "source-exhausted-without-evidence",
      {
        managerSummary: { ...liveProjection.managerSummary, sourceExhausted: true, inactivityReason: "source_exhausted" },
        queueSummary: { ...liveProjection.queueSummary, sourceExhausted: true, emptyReason: "source_exhausted" },
        sourceStates: [{ ...liveProjection.sourceStates[0], state: "exhausted", evidenceRefs: [] }],
      },
    ],
    [
      "source-exhausted-reliability-without-evidence",
      {
        managerSummary: { ...liveProjection.managerSummary, reliabilityState: "source_exhausted" },
        sourceStates: [{ ...liveProjection.sourceStates[0], state: "healthy", evidenceRefs: ["evidence:source-healthy"] }],
      },
    ],
    [
      "source-exhausted-with-open-packet",
      {
        managerSummary: { ...liveProjection.managerSummary, sourceExhausted: true, inactivityReason: "source_exhausted" },
        queueSummary: { ...liveProjection.queueSummary, sourceExhausted: true, emptyReason: "source_exhausted" },
        sourceStates: [{ ...liveProjection.sourceStates[0], state: "exhausted", evidenceRefs: ["evidence:source-exhausted"] }],
      },
    ],
    ["bad-latest-transition-event-ref", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], latestTransitionEventRef: 42 }] }],
    ["bad-recent-transition-event-refs", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], recentTransitionEventRefs: ["event:ok", 42] }] }],
    ["bad-latest-movement-summary", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], latestMovementSummary: 42 }] }],
    ["bad-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], canSatisfyLiveMovementProof: "true" }] }],
    ["stale-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], truthLabel: "stale", canSatisfyLiveMovementProof: true }] }],
    ["fixture-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], truthLabel: "fixture", canSatisfyLiveMovementProof: true }] }],
    ["simulated-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], truthLabel: "simulated", canSatisfyLiveMovementProof: true }] }],
    ["dry-run-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], truthLabel: "dry_run", canSatisfyLiveMovementProof: true }] }],
    ["unknown-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], truthLabel: "unknown", canSatisfyLiveMovementProof: true }] }],
    ["complete-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], status: "complete", canSatisfyLiveMovementProof: true }] }],
    ["learn-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], currentStage: "learn", canSatisfyLiveMovementProof: true }] }],
    ["missing-latest-ref-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], latestTransitionEventRef: null, canSatisfyLiveMovementProof: true }] }],
    ["missing-recent-ref-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], recentTransitionEventRefs: [], canSatisfyLiveMovementProof: true }] }],
    ["blank-summary-live-movement-proof", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], latestMovementSummary: "   ", canSatisfyLiveMovementProof: true }] }],
    ["bad-packet-updated-at", { workPackets: [{ ...liveProjection.workPackets[0], updatedAt: "not-a-date" }] }],
    ["manager-raw-count", { managerSummary: { ...liveProjection.managerSummary, activeWorkerCount: -1 } }],
    ["manager-bad-reliability-state", { managerSummary: { ...liveProjection.managerSummary, reliabilityState: "tmux_running" } }],
    ["manager-bad-evidence-refs", { managerSummary: { ...liveProjection.managerSummary, evidenceRefs: ["manager:evidence", 42] } }],
    ["manager-unsafe-evidence-refs", { managerSummary: { ...liveProjection.managerSummary, evidenceRefs: ["tmux-pane-scrollback:must-not-render"] } }],
    ["worker-bad-count", { workerSummary: { ...liveProjection.workerSummary, warmCount: -1 } }],
    ["worker-bad-state-source", { workerSummary: { ...liveProjection.workerSummary, stateSource: "tmux" } }],
    ["worker-bad-worker-refs", { workerSummary: { ...liveProjection.workerSummary, workerRefs: ["worker:codex-1", 42] } }],
    ["worker-non-worker-ref", { workerSummary: { ...liveProjection.workerSummary, workerRefs: ["evidence:codex-1"] } }],
    ["worker-terminal-output-ref", { workerSummary: { ...liveProjection.workerSummary, evidenceRefs: ["terminal-output:codex-1"] } }],
    ["worker-unsafe-worker-refs", { workerSummary: { ...liveProjection.workerSummary, workerRefs: ["tmux-pane-scrollback:must-not-render"] } }],
    ["worker-unsafe-evidence-refs", { workerSummary: { ...liveProjection.workerSummary, evidenceRefs: ["provider-payload:must-not-render"] } }],
    ["bad-reliability-problem-kind", { reliabilityProblems: [{ ...liveProjection.reliabilityProblems[0], kind: "idle" }] }],
    ["bad-reliability-problem-evidence", { reliabilityProblems: [{ ...liveProjection.reliabilityProblems[0], evidenceRefs: ["terminal-output:must-not-render"] }] }],
    ["bad-gated-control-operation", { gatedControls: [{ ...liveProjection.gatedControls[0], operation: "run_shell" }] }],
    ["bad-gated-control-status", { gatedControls: [{ ...liveProjection.gatedControls[0], status: "running" }] }],
    ["bad-gated-control-worker-ref", { gatedControls: [{ ...liveProjection.gatedControls[0], workerRefs: ["evidence:codex-1"] }] }],
    ["bad-gated-control-evidence", { gatedControls: [{ ...liveProjection.gatedControls[0], evidenceRefs: ["provider-payload:must-not-render"] }] }],
    ["bad-gated-control-stop-line", { gatedControls: [{ ...liveProjection.gatedControls[0], stopLine: "   " }] }],
    ["executable-gated-control-command", { gatedControls: [{ ...liveProjection.gatedControls[0], command: "tmux kill-session" }] }],
    ["executable-gated-control-script", { gatedControls: [{ ...liveProjection.gatedControls[0], script: "tmux kill-session" }] }],
    ["executable-gated-control-text", { gatedControls: [{ ...liveProjection.gatedControls[0], nextAction: "Run tmux kill-session now." }] }],
    ["idle-problem-with-active-worker", { workerSummary: { ...liveProjection.workerSummary, activeCount: 1 } }],
    ["idle-problem-with-draining-worker", { workerSummary: { ...liveProjection.workerSummary, drainingCount: 1 } }],
    [
      "idle-problem-with-fixture-projection",
      {
        sourceLabel: "fixture",
        fixtureMode: { ...liveProjection.fixtureMode, enabled: true, canSatisfyLiveProof: false },
        truthSummary: { ...liveProjection.truthSummary, label: "fixture", fixtureBacked: true },
      },
    ],
    ["source-state-unsafe-evidence-refs", { sourceStates: [{ ...liveProjection.sourceStates[0], evidenceRefs: ["provider-payload:must-not-render"] }] }],
    ["packet-unsafe-evidence-refs", { workPackets: [{ ...liveProjection.workPackets[0], evidenceRefs: ["raw-prompt:must-not-render"] }] }],
    ["detail-unsafe-evidence-refs", { selectedPacketDetails: [{ ...liveProjection.selectedPacketDetails[0], evidenceRefs: ["secret_key:must-not-render"] }] }],
    ["bad-evidence-refs", { evidenceRefs: [42] }],
    ["unsafe-evidence-refs", { evidenceRefs: ["terminal-scrollback:must-not-render"] }],
  ]) {
    setProjectionPayload(projectionContractFixture(override));
    await assert.rejects(
      () => getPipelineDashboardProjection(),
      /Invalid projection payload/,
      `${caseId} should fail dashboard projection validation`,
    );
  }

  setProjectionEnvelope({});
  await assert.rejects(
    () => getPipelineDashboardProjection(),
    /Malformed response/,
    "missing data envelope should fail before validation",
  );

  setProjectionEnvelope({ data: liveProjection });
  setResponseOk(false);
  await assert.rejects(
    () => getPipelineDashboardProjection(),
    /Request failed/,
    "non-OK projection response should fail before validation",
  );
});

async function loadCompiledLifecycleModule() {
  const outDir = await mkdtemp(join(tmpdir(), "pipeline-control-plane-lifecycle-"));
  const tsconfigPath = join(outDir, "tsconfig.json");
  const repoRoot = process.cwd();
  await writeFile(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          verbatimModuleSyntax: true,
          baseUrl: repoRoot,
          rootDir: repoRoot,
          outDir: join(outDir, "dist"),
          paths: {
            "@kendall/contracts": ["packages/contracts/src/pipeline-control-plane/index.ts"],
          },
        },
        include: [
          join(repoRoot, "packages/contracts/src/pipeline-control-plane/index.ts"),
          join(repoRoot, "packages/workflow-core/src/pipeline-control-plane/index.ts"),
        ],
      },
      null,
      2,
    ),
  );
  const result = spawnSync("node", [tscPath(), "-p", tsconfigPath], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || result.error?.message || `tsc exited with status ${result.status} signal ${result.signal}`,
  );
  const distRoot = join(outDir, "dist");
  await writeFile(join(distRoot, "package.json"), JSON.stringify({ type: "module" }));
  const packageScope = join(distRoot, "node_modules", "@kendall");
  await mkdir(packageScope, { recursive: true });
  await mkdir(join(packageScope, "contracts"), { recursive: true });
  await writeFile(
    join(packageScope, "contracts", "package.json"),
    JSON.stringify({ type: "module", exports: { ".": "./index.js" } }),
  );
  await writeFile(join(packageScope, "contracts", "index.js"), "export * from '../../../packages/contracts/src/pipeline-control-plane/index.js';\n");
  const modulePath = join(outDir, "dist/packages/workflow-core/src/pipeline-control-plane/index.js");
  return import(pathToFileURL(modulePath).href);
}

async function loadCompiledContractModule() {
  const outDir = await mkdtemp(join(tmpdir(), "pipeline-control-plane-contract-"));
  const tsconfigPath = join(outDir, "tsconfig.json");
  await writeFile(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          verbatimModuleSyntax: true,
          baseUrl: repoRootPath,
          rootDir: repoRootPath,
          outDir: join(outDir, "dist"),
        },
        include: [join(repoRootPath, "packages/contracts/src/pipeline-control-plane/index.ts")],
      },
      null,
      2,
    ),
  );
  const result = spawnSync("node", [tscPath(), "-p", tsconfigPath], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || result.error?.message || `tsc exited with status ${result.status} signal ${result.signal}`,
  );
  const distRoot = join(outDir, "dist");
  await writeFile(join(distRoot, "package.json"), JSON.stringify({ type: "module" }));
  return import(pathToFileURL(join(distRoot, "packages/contracts/src/pipeline-control-plane/index.js")).href);
}

function projectionContractFixture(overrides = {}) {
  const now = "2026-07-02T17:00:00.000Z";
  const base = {
    schemaVersion: "pipeline-dashboard-projection/v0",
    projectionId: "pipeline-projection:test",
    generatedAt: now,
    sourceUpdatedAt: now,
    sourceLabel: "live",
    freshnessState: "live",
    staleAfterSeconds: 15,
    backendReachability: {
      state: "reachable",
      checkedAt: now,
      reason: null,
      summary: "Projection endpoint reachable.",
    },
    fixtureMode: {
      enabled: false,
      reason: null,
      allowedForEnvironment: false,
      visibleLabelRequired: true,
      canSatisfyLiveProof: false,
    },
    truthSummary: {
      label: "live",
      emptyReason: null,
      backendEmpty: false,
      backendUnavailable: false,
      fixtureBacked: false,
      stale: false,
      summary: "Live projection.",
    },
    stageSummaries: projectionStageSummaryFixtures(),
    sourceStates: [
      {
        sourceId: "story:3-2",
        sourceRef: "story:3-2",
        sourceKind: "bmad_story",
        state: "healthy",
        summary: "Source is available for projection contract testing.",
        evidenceRefs: ["story:3-2"],
        updatedAt: now,
        metadataOnly: true,
      },
    ],
    workPackets: [
      {
        packetId: "packet-contract-live",
        title: "Contract live packet",
        currentStage: "execute",
        status: "active",
        truthLabel: "live",
        sourceRef: {
          refId: "story:3-2",
          sourceType: "bmad_story",
          pathOrUrl: "_bmad-output/implementation-artifacts/3-2-projection-state-test-coverage.md",
          title: "Story 3.2",
        },
        blocker: null,
        nextAction: "Advance toward Review.",
        evidenceRefs: ["story:3-2"],
        updatedAt: now,
        metadataOnly: true,
      },
    ],
    selectedPacketDetails: [
      {
        packetId: "packet-contract-live",
        sourceRefs: [
          {
            refId: "story:3-2",
            sourceType: "bmad_story",
            pathOrUrl: "_bmad-output/implementation-artifacts/3-2-projection-state-test-coverage.md",
            title: "Story 3.2",
          },
        ],
        evidenceRefs: ["story:3-2"],
        currentStage: "execute",
        status: "active",
        truthLabel: "live",
        blocker: null,
        nextAction: "Advance toward Review.",
        latestTransitionEventRef: "event:event-contract-transition",
        recentTransitionEventRefs: ["event:event-contract-created", "event:event-contract-transition"],
        latestMovementSummary: "Accepted transition to execute for live projection proof.",
        canSatisfyLiveMovementProof: true,
        metadataOnly: true,
      },
    ],
    managerSummary: {
      stateSource: "supervisor_projection",
      reliabilityState: "ready",
      freshnessState: "live",
      activeLeaseCount: 0,
      activeWorkerCount: 0,
      warmWorkerCount: 0,
      blockedQueueCount: 0,
      dispatchableQueueCount: 1,
      closedQueueCount: 0,
      healthySourceCount: 0,
      exhaustedSourceCount: 0,
      blockedSourceCount: 0,
      gatedSourceCount: 0,
      staleSourceCount: 0,
      unavailableSourceCount: 0,
      refillingSourceCount: 0,
      unknownSourceCount: 0,
      sourceExhausted: false,
      inactivityReason: null,
      evidenceRefs: ["manager:projection-contract"],
      summary: "Projection contract manager summary.",
      metadataOnly: true,
    },
    workerSummary: {
      stateSource: "manager_summary",
      freshnessState: "live",
      warmCount: 1,
      activeCount: 0,
      waitingCount: 0,
      stalledCount: 0,
      failedCount: 0,
      drainingCount: 0,
      killedCount: 0,
      completeCount: 0,
      unavailableCount: 0,
      unknownCount: 0,
      workerRefs: ["worker:codex-2", "worker:codex-3"],
      evidenceRefs: ["worker:codex-2", "worker:codex-3"],
      summary: "Projection contract worker summary.",
      metadataOnly: true,
    },
    reliabilityProblems: [
      {
        problemId: "problem:idle-with-ready-work",
        kind: "idle_with_ready_work",
        severity: "attention",
        likelyIssue: "manager",
        summary: "Ready work exists but no worker is progressing it.",
        evidenceRefs: ["queue:dispatchable", "worker:no-live-progress"],
        metadataOnly: true,
      },
    ],
    gatedControls: [
      {
        controlId: "control:kill-worker",
        operation: "kill_worker",
        status: "gated",
        authorityFamily: "worker-process-control",
        stopLine: "Do not kill workers from pipeline reliability metadata.",
        nextAction: "Request explicit worker-control approval before any kill action.",
        packetId: null,
        workerRefs: ["worker:codex-2"],
        evidenceRefs: ["control:kill-worker", "worker:codex-2"],
        metadataOnly: true,
      },
    ],
    queueSummary: {
      activeCount: 0,
      dispatchableCount: 1,
      blockedCount: 0,
      gatedCount: 0,
      closedCount: 0,
      staleCount: 0,
      refillingCount: 0,
      unknownCount: 0,
      emptyReason: null,
      sourceExhausted: false,
      summary: "Projection contract queue summary.",
    },
    evidenceRefs: ["story:3-2"],
  };
  return {
    ...base,
    ...overrides,
    backendReachability: { ...base.backendReachability, ...(overrides.backendReachability ?? {}) },
    fixtureMode: { ...base.fixtureMode, ...(overrides.fixtureMode ?? {}) },
    truthSummary: { ...base.truthSummary, ...(overrides.truthSummary ?? {}) },
    managerSummary: { ...base.managerSummary, ...(overrides.managerSummary ?? {}) },
    workerSummary: { ...base.workerSummary, ...(overrides.workerSummary ?? {}) },
    reliabilityProblems: overrides.reliabilityProblems ?? base.reliabilityProblems,
    gatedControls: overrides.gatedControls ?? base.gatedControls,
    queueSummary: { ...base.queueSummary, ...(overrides.queueSummary ?? {}) },
    stageSummaries: overrides.stageSummaries ?? base.stageSummaries,
    sourceStates: overrides.sourceStates ?? base.sourceStates,
    workPackets: overrides.workPackets ?? base.workPackets,
    selectedPacketDetails: overrides.selectedPacketDetails ?? base.selectedPacketDetails,
    evidenceRefs: overrides.evidenceRefs ?? base.evidenceRefs,
  };
}

function projectionStageSummaryFixtures() {
  const labels = new Map([
    ["capture", "Capture"],
    ["classify", "Classify"],
    ["route", "Route"],
    ["shape", "Shape"],
    ["needs_approval", "Needs Approval"],
    ["execute", "Execute"],
    ["review", "Review"],
    ["promote", "Promote"],
    ["deliver", "Deliver"],
    ["learn", "Learn"],
  ]);
  return [...labels].map(([stage, label]) => ({
    stage,
    label,
    packetCount: stage === "execute" ? 1 : 0,
    sourceLabel: "live",
    freshnessState: "live",
    emptyReason: stage === "execute" ? null : "healthy_empty",
  }));
}

function loadDashboardSupervisorModule(source) {
  const ts = typescriptModule();
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  let projectionPayload = projectionContractFixture();
  let projectionEnvelope = { data: projectionPayload };
  let responseOk = true;
  const context = {
    exports: {},
    module: { exports: {} },
    process: {
      env: {
        NEXT_PUBLIC_SUPERVISOR_URL: "http://supervisor.test",
      },
    },
    fetch: async (url, options) => {
      assert.equal(url, "http://supervisor.test/pipeline-control-plane/projection");
      assert.equal(options.cache, "no-store");
      return {
        ok: responseOk,
        async json() {
          return projectionEnvelope;
        },
      };
    },
    require: (specifier) => {
      if (specifier === "@kendall/contracts") {
        return {
          AUTHORITATIVE_PACKET_STAGES: [
            "capture",
            "classify",
            "route",
            "shape",
            "needs_approval",
            "execute",
            "review",
            "promote",
            "deliver",
            "learn",
          ],
        };
      }
      throw new Error(`Unexpected dashboard supervisor import: ${specifier}`);
    },
  };
  context.exports = context.module.exports;
  vm.runInNewContext(output, context, { filename: "supervisor.ts" });
  return {
    ...context.module.exports,
    setProjectionEnvelope(nextProjectionEnvelope) {
      projectionEnvelope = nextProjectionEnvelope;
    },
    setProjectionPayload(nextProjectionPayload) {
      projectionPayload = nextProjectionPayload;
      projectionEnvelope = { data: projectionPayload };
      responseOk = true;
    },
    setResponseOk(nextResponseOk) {
      responseOk = nextResponseOk;
    },
  };
}
