import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = new URL("../packages/contracts/src/pipeline-control-plane/index.ts", import.meta.url);
const timestampFixturePath = new URL("./fixtures/pipeline-operational-action-v1-timestamps.json", import.meta.url);
const resultParityFixturePath = new URL("./fixtures/pipeline-operational-action-v1-result-parity.json", import.meta.url);
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
      expectedWorkItemUpdatedAt: "2026-07-14T19:59:59.000Z",
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
      expectedWorkItemUpdatedAt: "2026-07-14T19:59:59.000Z",
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

function withReboundContext(contract, request, contextOverrides) {
  const rebound = structuredClone(request);
  Object.assign(rebound.actionContext, contextOverrides);
  rebound.actionContextDigestSha256 = contract.pipelineOperationalActionContextDigestSha256V1(
    rebound.actionId,
    rebound.targetType,
    rebound.targetId,
    rebound.actionContext,
  );
  return rebound;
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
  const missingWorkItemRevision = structuredClone(retry);
  delete missingWorkItemRevision.actionContext.expectedWorkItemUpdatedAt;
  assert.ok(contract.validatePipelineOperationalActionRequestV1(missingWorkItemRevision).some((issue) => ["invalid_contract", "stale_fence"].includes(issue.code)));
  assert.ok(contract.validatePipelineOperationalActionRequestV1({ ...retry, targetType: "work_packet" }).some((issue) => issue.code === "policy_violation"));

  const reassign = requestFor(contract, "reassign");
  assert.ok(contract.validatePipelineOperationalActionRequestV1({
    ...reassign,
    actionContext: { ...reassign.actionContext, expectedActiveLeaseId: "lease-1" },
  }).some((issue) => ["invalid_contract", "stale_fence"].includes(issue.code)));
});

test("v1 timestamps enforce the shared canonical RFC3339 parity fixture", async () => {
  const contract = await loadContract();
  const fixture = JSON.parse(await readFile(timestampFixturePath, "utf8"));
  for (const timestamp of fixture.accepted) {
    const request = requestFor(contract, "reassign");
    request.actionContext.expectedWorkItemUpdatedAt = timestamp;
    request.actionContextDigestSha256 = digest(
      contract.pipelineOperationalActionContextDigestPayloadV1(
        request.actionId,
        request.targetType,
        request.targetId,
        request.actionContext,
      ),
    );
    assert.deepEqual(
      contract.validatePipelineOperationalActionRequestV1(request),
      [],
      `TypeScript rejected shared positive timestamp ${timestamp}`,
    );
  }
  for (const timestamp of fixture.rejected) {
    const request = requestFor(contract, "reassign");
    request.actionContext.expectedWorkItemUpdatedAt = timestamp;
    request.actionContextDigestSha256 = digest(
      contract.pipelineOperationalActionContextDigestPayloadV1(
        request.actionId,
        request.targetType,
        request.targetId,
        request.actionContext,
      ),
    );
    assert.ok(
      contract.validatePipelineOperationalActionRequestV1(request).some(
        (issue) => issue.field === "actionContext" || issue.field === "actionContext.expectedWorkItemUpdatedAt",
      ),
      `TypeScript accepted shared negative timestamp ${timestamp}`,
    );
  }

  const approvalRequest = requestFor(contract, "pause");
  for (const timestamp of fixture.accepted) {
    const approval = approvalFor(approvalRequest, {
      consumed: true,
      consumedAt: timestamp,
      consumedActionIdempotencyKey: approvalRequest.idempotencyKey,
      consumedActionRecordId: "record-1",
    });
    assert.deepEqual(
      contract.validatePipelineOperationalActionApprovalV1(approval),
      [],
      `TypeScript rejected shared positive approval timestamp ${timestamp}`,
    );
  }
  for (const timestamp of fixture.rejected) {
    assert.ok(
      contract.validatePipelineOperationalActionApprovalV1({
        ...approvalFor(approvalRequest),
        issuedAt: timestamp,
      }).some((issue) => issue.field === "expiresAt" || issue.field === "consumed"),
      `TypeScript accepted shared negative approval timestamp ${timestamp}`,
    );
  }
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

test("v1 identifiers accept exact persistence bounds and reject max plus one", async () => {
  const contract = await loadContract();
  const validate = contract.validatePipelineOperationalActionRequestV1;

  for (const [field, maxLength] of [["correlationId", 36], ["idempotencyKey", 160], ["approvalId", 120]]) {
    assert.deepEqual(validate(requestFor(contract, "retry_verification", { [field]: "a".repeat(maxLength) })), [], `${field} exact max`);
    assert.ok(
      validate(requestFor(contract, "retry_verification", { [field]: "a".repeat(maxLength + 1) }))
        .some((issue) => issue.field === field && issue.code === "invalid_contract"),
      `${field} max plus one`,
    );
  }

  for (const [field, maxLength] of [
    ["linkedWorkItemId", 36],
    ["linkedPacketId", 80],
    ["expectedPacketCurrentEventId", 80],
    ["expectedLeaseId", 36],
  ]) {
    assert.deepEqual(
      validate(withReboundContext(contract, requestFor(contract, "retry_verification"), { [field]: "a".repeat(maxLength) })),
      [],
      `actionContext.${field} exact max`,
    );
    assert.ok(
      validate(withReboundContext(contract, requestFor(contract, "retry_verification"), { [field]: "a".repeat(maxLength + 1) }))
        .some((issue) => issue.field === `actionContext.${field}` && ["invalid_contract", "stale_fence"].includes(issue.code)),
      `actionContext.${field} max plus one`,
    );
  }

  assert.deepEqual(
    validate(withReboundContext(contract, requestFor(contract, "reassign"), { newOwnerId: "a".repeat(100) })),
    [],
    "owner exact max",
  );
  assert.ok(
    validate(withReboundContext(contract, requestFor(contract, "reassign"), { newOwnerId: "a".repeat(101) }))
      .some((issue) => issue.field === "actionContext.newOwnerId" && issue.code === "invalid_contract"),
    "owner max plus one",
  );

  const attemptAtMax = requestFor(contract, "retry_verification", { targetId: "a".repeat(36) });
  attemptAtMax.actionContext.executionAttemptId = attemptAtMax.targetId;
  attemptAtMax.actionContextDigestSha256 = contract.pipelineOperationalActionContextDigestSha256V1(
    attemptAtMax.actionId,
    attemptAtMax.targetType,
    attemptAtMax.targetId,
    attemptAtMax.actionContext,
  );
  assert.deepEqual(validate(attemptAtMax), [], "attempt target exact max");

  const attemptTooLong = structuredClone(attemptAtMax);
  attemptTooLong.targetId = "a".repeat(37);
  attemptTooLong.actionContext.executionAttemptId = attemptTooLong.targetId;
  attemptTooLong.actionContextDigestSha256 = contract.pipelineOperationalActionContextDigestSha256V1(
    attemptTooLong.actionId,
    attemptTooLong.targetType,
    attemptTooLong.targetId,
    attemptTooLong.actionContext,
  );
  assert.ok(validate(attemptTooLong).some((issue) => issue.field === "targetId" && issue.code === "invalid_contract"));
});

test("v1 identifier and evidence-ref grammar rejects repeated separators and invalid prefixes at exact bounds", async () => {
  const contract = await loadContract();
  const validate = contract.validatePipelineOperationalActionRequestV1;
  assert.deepEqual(
    validate(withReboundContext(contract, requestFor(contract, "reassign"), { newOwnerId: "owner-new" })),
    [],
  );
  assert.ok(validate(
    withReboundContext(contract, requestFor(contract, "reassign"), { newOwnerId: "owner--new" }),
  ).some((issue) => issue.field === "actionContext.newOwnerId" && issue.code === "invalid_contract"));

  const maxEvidenceRef = `evidence:${"A".repeat(160)}`;
  assert.deepEqual(validate(requestFor(contract, "retry_verification", { evidenceRefs: [maxEvidenceRef] })), []);
  for (const invalidRef of [
    `evidence:${"A".repeat(161)}`,
    "capability:retry-verification",
    "evidence:../retry-verification",
  ]) {
    assert.ok(validate(requestFor(contract, "retry_verification", { evidenceRefs: [invalidRef] }))
      .some((issue) => issue.field === "evidenceRefs" && issue.code === "invalid_contract"), invalidRef);
  }
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
  const retry = requestFor(contract, "retry_verification");
  const retryResult = {
    schemaVersion: retry.schemaVersion,
    actionId: retry.actionId,
    targetType: retry.targetType,
    targetId: retry.targetId,
    actionContext: retry.actionContext,
    actionContextDigestSha256: retry.actionContextDigestSha256,
    outcome: "succeeded",
    capabilityState: "available",
    authorityState: "allowed",
    riskTier: "medium",
    typedReason: null,
    successEvidence: {
      kind: "retry_verification",
      originalAttemptId: retry.targetId,
      retryIntentId: `verification-retry-${"a".repeat(32)}`,
      linkedWorkItemId: retry.actionContext.linkedWorkItemId,
      linkedPacketId: retry.actionContext.linkedPacketId,
      resultingPacketCurrentEventId: "event-retry-result",
      originalAttemptPreserved: true,
      providerOrWorkerLaunched: false,
    },
    evidenceRefs: ["operational-action:retry-result"],
    correlationId: retry.correlationId,
    idempotencyKey: retry.idempotencyKey,
    actionRecordId: "record-retry",
    approvalId: retry.approvalId,
    replayed: false,
    serverBound: true,
    metadataOnly: true,
    rawPayloadRetained: false,
  };
  assert.deepEqual(contract.validatePipelineOperationalActionResultV1(retryResult), []);
  const parityFixture = JSON.parse(await readFile(resultParityFixturePath, "utf8"));
  for (const invalidCase of parityFixture.invalidRetrySuccessEvidenceCases) {
    const candidate = structuredClone(retryResult);
    Object.assign(candidate.successEvidence, invalidCase.patch || {});
    if (invalidCase.useExpectedPacketCurrentEventId) {
      candidate.successEvidence.resultingPacketCurrentEventId = candidate.actionContext.expectedPacketCurrentEventId;
    }
    assert.ok(
      contract.validatePipelineOperationalActionResultV1(candidate).some((issue) => issue.code === "inconsistent_result"),
      invalidCase.name,
    );
  }
  assert.ok(contract.validatePipelineOperationalActionResultV1({
    ...retryResult,
    successEvidence: { ...retryResult.successEvidence, retryIntentId: `verification-retry-${"a".repeat(62)}` },
  }).some((issue) => issue.code === "inconsistent_result"));
  const legacyRetryAttemptResult = structuredClone(retryResult);
  legacyRetryAttemptResult.successEvidence.retryAttemptId = legacyRetryAttemptResult.successEvidence.retryIntentId;
  delete legacyRetryAttemptResult.successEvidence.retryIntentId;
  assert.ok(contract.validatePipelineOperationalActionResultV1(legacyRetryAttemptResult).some((issue) => issue.code === "inconsistent_result"));

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
      activeLeaseCount: 1,
      runningAttemptCount: 1,
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
