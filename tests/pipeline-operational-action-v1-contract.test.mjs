import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);
const require = createRequire(import.meta.url);

async function loadContract() {
  const ts = require(require.resolve("typescript", { paths: [new URL("../apps/dashboard", import.meta.url).pathname] }));
  const source = await readFile(contractPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const module = { exports: {} };
  Function("module", "exports", output)(module, module.exports);
  return module.exports;
}

function digest(payload) {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function actor(actorId = "operator-1") {
  return { actorType: "operator", actorId, actorLabel: "Operator one" };
}

function contexts() {
  return {
    retry_verification: {
      kind: "retry_verification",
      executionAttemptId: "attempt-1",
      linkedWorkItemId: "work-1",
      linkedPacketId: "packet-1",
      expectedWorkItemState: "ready",
      expectedAttemptStatus: "failed",
      expectedAttemptUpdatedAt: "2026-07-14T20:00:00.000Z",
      expectedPacketCurrentEventId: "event-1",
      expectedLeaseId: "lease-1",
      expectedLeaseFencingToken: 7,
      expectedLeaseActive: false,
    },
    pause: { kind: "pause", expectedRuntimeMode: "running", expectedRuntimeRevision: 3 },
    drain: {
      kind: "drain",
      expectedRuntimeMode: "running",
      expectedRuntimeRevision: 3,
      expectedActiveWorkCount: 2,
      expectedActiveLeaseCount: 1,
      expectedRunningAttemptCount: 1,
    },
    reassign: {
      kind: "reassign",
      linkedWorkItemId: "work-1",
      expectedPacketCurrentEventId: "event-1",
      expectedCurrentOwnerId: "owner-old",
      newOwnerId: "owner-new",
      expectedWorkItemState: "ready",
      expectedActiveLeaseId: null,
      expectedRunningAttemptId: null,
    },
  };
}

function requestFor(contract, actionId, overrides = {}) {
  const policy = contract.PIPELINE_OPERATIONAL_ACTION_V1_POLICY[actionId];
  const actionContext = structuredClone(contexts()[actionId]);
  const targetId = actionId === "retry_verification"
    ? "attempt-1"
    : actionId === "reassign"
      ? "packet-1"
      : contract.PIPELINE_OPERATIONAL_ACTION_V1_RUNTIME_TARGET_ID;
  const payload = contract.pipelineOperationalActionContextDigestPayloadV1(actionId, policy.targetType, targetId, actionContext);
  return {
    schemaVersion: "pipeline-operational-action/v1",
    actionId,
    targetType: policy.targetType,
    targetId,
    actionContext,
    actionContextDigestSha256: digest(payload),
    idempotencyKey: `idem-${actionId.replace("_", "-")}`,
    correlationId: "corr-1",
    requestedBy: actor(),
    requestedAuthorityState: policy.authorityState,
    requestedRiskTier: policy.riskTier,
    approvalId: `approval-${actionId.replace("_", "-")}`,
    serverBound: true,
    evidenceRefs: ["verification:operational-action-v1"],
    metadataOnly: true,
    rawPayloadRetained: false,
    ...overrides,
  };
}

function approvalFor(request, overrides = {}) {
  const {
    idempotencyKey: _idempotencyKey,
    correlationId: _correlationId,
    evidenceRefs: _evidenceRefs,
    ...binding
  } = structuredClone(request);
  return {
    ...binding,
    issuedBy: "supervisor_server",
    issuedAt: "2026-07-14T20:00:00.000Z",
    expiresAt: "2026-07-14T20:05:00.000Z",
    consumed: false,
    consumedAt: null,
    consumedActionIdempotencyKey: null,
    consumedActionRecordId: null,
    ...overrides,
  };
}

test("v1 policy reconciles exact targets, authority families, risks, and context fences", async () => {
  const contract = await loadContract();
  assert.deepEqual(contract.PIPELINE_OPERATIONAL_ACTION_V1_POLICY, {
    retry_verification: { targetType: "execution_attempt", authorityState: "needs_authority_approval", riskTier: "medium" },
    pause: { targetType: "runtime", authorityState: "needs_authority_approval", riskTier: "low" },
    drain: { targetType: "runtime", authorityState: "needs_authority_approval", riskTier: "medium" },
    reassign: { targetType: "work_packet", authorityState: "needs_authority_approval", riskTier: "medium" },
  });
  for (const actionId of contract.PIPELINE_OPERATIONAL_ACTION_V1_IDS) {
    assert.deepEqual(contract.validatePipelineOperationalActionRequestV1(requestFor(contract, actionId)), [], actionId);
  }

  const pause = requestFor(contract, "pause");
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...pause, requestedAuthorityState: "not_required" }).some((issue) => issue.code === "policy_violation"));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...pause, requestedRiskTier: "medium" }).some((issue) => issue.code === "policy_violation"));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...pause, targetId: "manager-run-1" }).some((issue) => issue.code === "target_context_mismatch"));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...pause, serverBound: false }).some((issue) => issue.code === "policy_violation"));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...pause, actionContext: undefined }).some((issue) => issue.code === "invalid_contract"));

  const retry = requestFor(contract, "retry_verification");
  assert.equal(
    retry.actionContextDigestSha256,
    contract.pipelineOperationalActionContextDigestSha256V1(
      retry.actionId,
      retry.targetType,
      retry.targetId,
      retry.actionContext,
    ),
    "contract SHA-256 must match the Node reference digest",
  );
  const missingFence = structuredClone(retry);
  delete missingFence.actionContext.expectedAttemptUpdatedAt;
  assert.ok(contract.validatePipelineOperationalActionRequestV1(missingFence).some((issue) => ["invalid_contract", "stale_fence"].includes(issue.code)));
  const missingWorkItemState = structuredClone(retry);
  delete missingWorkItemState.actionContext.expectedWorkItemState;
  assert.ok(contract.validatePipelineOperationalActionRequestV1(missingWorkItemState).some((issue) => ["invalid_contract", "stale_fence"].includes(issue.code)));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...retry, targetType: "work_packet" }).some((issue) => issue.code === "policy_violation"));

  const reassign = requestFor(contract, "reassign");
  assert.ok(contract.validatePipelineOperationalActionRequestV1({
    ...reassign,
    actionContext: { ...reassign.actionContext, expectedActiveLeaseId: "lease-1" },
  }).some((issue) => ["invalid_contract", "stale_fence"].includes(issue.code)));
});

test("v1 request and approval reject valid-shaped incorrect context digests", async () => {
  const contract = await loadContract();
  const request = requestFor(contract, "retry_verification");
  const wrongDigest = `sha256:${"a".repeat(64)}`;
  assert.notEqual(request.actionContextDigestSha256, wrongDigest);
  assert.ok(contract.validatePipelineOperationalActionRequestV1({
    ...request,
    actionContextDigestSha256: wrongDigest,
  }).some((issue) => issue.code === "context_digest_mismatch"));

  const approval = approvalFor(request);
  assert.ok(contract.validatePipelineOperationalActionApprovalV1({
    ...approval,
    actionContextDigestSha256: wrongDigest,
  }).some((issue) => issue.code === "context_digest_mismatch"));
});

test("v1 authorization fails closed for stale context, digest, actor, expiry, and replay", async () => {
  const contract = await loadContract();
  const request = requestFor(contract, "retry_verification");
  const approval = approvalFor(request);
  assert.deepEqual(contract.validatePipelineOperationalActionAuthorizationV1(request, approval, "2026-07-14T20:01:00.000Z"), []);

  const staleAttempt = structuredClone(approval);
  staleAttempt.actionContext.expectedAttemptStatus = "timed_out";
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(request, staleAttempt, "2026-07-14T20:01:00.000Z").some((issue) => issue.code === "context_digest_mismatch"));
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(request, { ...approval, actionContextDigestSha256: `sha256:${"0".repeat(64)}` }, "2026-07-14T20:01:00.000Z").some((issue) => issue.code === "context_digest_mismatch"));
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(request, { ...approval, requestedBy: actor("operator-2") }, "2026-07-14T20:01:00.000Z").some((issue) => issue.code === "wrong_actor"));
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(request, approval, "2026-07-14T20:05:00.000Z").some((issue) => issue.code === "approval_expired"));

  const consumed = {
    ...approval,
    consumed: true,
    consumedAt: "2026-07-14T20:01:00.000Z",
    consumedActionIdempotencyKey: request.idempotencyKey,
    consumedActionRecordId: "record-1",
  };
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(request, consumed, "2026-07-14T20:02:00.000Z").some((issue) => issue.code === "approval_consumed"));
  assert.ok(contract.validatePipelineOperationalActionAuthorizationV1(
    { ...request, idempotencyKey: "idem-conflict" },
    consumed,
    "2026-07-14T20:02:00.000Z",
  ).some((issue) => issue.code === "replay_conflict"));
});

test("v1 runtime success evidence is explicit while v0 request behavior remains valid", async () => {
  const contract = await loadContract();
  const pause = requestFor(contract, "pause");
  const result = {
    schemaVersion: pause.schemaVersion,
    actionId: pause.actionId,
    targetType: pause.targetType,
    targetId: pause.targetId,
    actionContext: pause.actionContext,
    actionContextDigestSha256: pause.actionContextDigestSha256,
    outcome: "succeeded",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "low",
    typedReason: null,
    successEvidence: {
      kind: "pause",
      resultingRuntimeMode: "paused",
      resultingRuntimeRevision: 4,
      activeWorkCount: 2,
      intakeStopped: true,
      activeWorkPreserved: true,
    },
    evidenceRefs: ["operational-action:pause-result"],
    correlationId: pause.correlationId,
    idempotencyKey: pause.idempotencyKey,
    actionRecordId: "record-1",
    approvalId: pause.approvalId,
    replayed: false,
    serverBound: true,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  assert.deepEqual(contract.validatePipelineOperationalActionResultV1(result), []);
  assert.ok(contract.validatePipelineOperationalActionResultV1({ ...result, successEvidence: { ...result.successEvidence, resultingRuntimeMode: "unknown" } }).some((issue) => issue.code === "inconsistent_result"));

  assert.deepEqual(contract.validatePipelineOperationalActionRequestV0({
    schemaVersion: "pipeline-operational-action/v0",
    actionId: "inspect",
    targetType: "work_packet",
    targetId: "packet-1",
    idempotencyKey: "idem-v0",
    correlationId: "corr-v0",
    requestedBy: { actorType: "manager", actorId: "manager-1" },
    requestedAuthorityState: "not_required",
    requestedRiskTier: "low",
    evidenceRefs: ["verification:v0-preserved"],
    metadataOnly: true,
    rawPayloadRetained: false,
  }), []);
});
