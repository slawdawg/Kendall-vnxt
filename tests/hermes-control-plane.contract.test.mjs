import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const contractsRoot = new URL("../packages/contracts/src/", import.meta.url);
const hermesRoot = new URL("../packages/contracts/src/hermes-control-plane/", import.meta.url);

const modules = ["index.ts", "ids.ts", "types.ts", "outcome.ts", "evidence.ts", "policy.ts", "events.ts", "review.ts", "schema-json.ts"];
const contractNames = [
  "HermesOutcomeV1",
  "HermesLaneRunV1",
  "DeliveryEvidenceV1",
  "PolicyDecisionV1",
  "ExternalImpactRequestV1",
  "FollowUpWorkV1",
  "HermesLifecycleEventV1",
  "HermesBoardLifecycleEventV1",
  "VerificationRecordV1",
  "ReviewDispositionV1",
];
const resultValues = ["allowed", "deniedPolicy", "deniedExternalImpact", "staleFacts", "retryable", "rework", "blockedTechnical", "completed"];
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function compileNamespace() {
  const outputDir = mkdtempSync(join(tmpdir(), "hermes-contracts-"));
  writeFileSync(join(outputDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  const candidates = [
    join(repoRoot, "apps/dashboard/node_modules/.bin/tsc"),
    join(repoRoot, "../../apps/dashboard/node_modules/.bin/tsc"),
  ];
  const compilerPath = candidates
    .map((candidate) => candidate.replace(/\/\.bin\/tsc$/, "/typescript/lib/typescript.js"))
    .find((candidate) => existsSync(candidate));
  if (!compilerPath) {
    rmSync(outputDir, { recursive: true, force: true });
    return null;
  }
  const tsModule = await import(pathToFileURL(compilerPath).href);
  const ts = tsModule.default ?? tsModule;
  const files = [
    join(repoRoot, "packages/contracts/src/index.ts"),
    ...modules.map((moduleName) => join(repoRoot, "packages/contracts/src/hermes-control-plane", moduleName)),
  ];
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    outDir: outputDir,
    rootDir: join(repoRoot, "packages/contracts/src"),
    skipLibCheck: true,
    strict: true,
  });
  const diagnostics = [...ts.getPreEmitDiagnostics(program)];
  assert.equal(diagnostics.length, 0, `TypeScript contract compilation failed: ${ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: (value) => value, getCurrentDirectory: () => repoRoot, getNewLine: () => "\n" })}`);
  const emitResult = program.emit();
  assert.equal(emitResult.emitSkipped, false, "TypeScript contract emit was skipped");
  return { outputDir, rootPath: join(outputDir, "index.js") };
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractArray(source, name) {
  const match = stripComments(source).match(new RegExp(`export const ${name} = (?:Object\\.freeze\\()?\\[([\\s\\S]*?)\\] as const\\)?;`));
  assert.ok(match, `missing ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

test("Hermes Control Plane is an additive package namespace with explicit exports", async () => {
  const rootIndex = await readFile(new URL("index.ts", contractsRoot), "utf8");
  assert.match(rootIndex, /export \* as HermesControlPlane from "\.\/hermes-control-plane";/);
  for (const moduleName of modules) assert.equal(existsSync(new URL(moduleName, hermesRoot)), true, `missing ${moduleName}`);

  const namespaceIndex = await readFile(new URL("index.ts", hermesRoot), "utf8");
  for (const moduleName of modules.slice(1)) assert.match(namespaceIndex, new RegExp(`export \\* from "\\./${moduleName.replace(".ts", "")}";`));
  const typesSource = await readFile(new URL("types.ts", hermesRoot), "utf8");
  for (const name of contractNames) assert.match(typesSource, new RegExp(`interface ${name} \\{`), `${name} declaration export`);
});

test("Hermes source is metadata-only and has no runtime integration imports", async () => {
  const sources = await Promise.all(modules.map((name) => readFile(new URL(name, hermesRoot), "utf8")));
  const combined = sources.join("\n");
  for (const pattern of [
    /from\s+["']node:/,
    /from\s+["'](?:fs|path|child_process)["']/,
    /workflow-core|dashboard|database|provider|github|adapter|worker.?execution|(?:from|import)[^\n]*queue/i,
    /rawPrompt|completion|transcript|providerPayload|credential|secret|token\b|\bpayload\b/i,
  ]) assert.doesNotMatch(combined, pattern, `forbidden boundary pattern ${pattern}`);
  assert.match(combined, /metadataOnly:\s*true/);
  assert.match(combined, /rawPayloadRetained:\s*false/);
  assert.match(combined, /Reflect\.ownKeys\(record\)/);
});

test("Hermes schema metadata is camelCase-to-snake_case and keeps required fields aligned", async () => {
  const source = await readFile(new URL("schema-json.ts", hermesRoot), "utf8");
  const typesSource = await readFile(new URL("types.ts", hermesRoot), "utf8");
  const types = await readFile(new URL("types.ts", hermesRoot), "utf8");
  assert.deepEqual(extractArray(typesSource, "HERMES_RESULT_VALUES"), resultValues);
  for (const name of contractNames) {
    assert.match(source, new RegExp(`${name}: (?:Object\\.freeze\\()?\\[`), `${name} required metadata`);
    assert.match(source, new RegExp(`${name}: (?:Object\\.freeze\\()?\\[.*_id|${name}: (?:Object\\.freeze\\()?\\[.*schema_version`), `${name} serialized metadata`);
    assert.match(types, new RegExp(`export interface ${name} \\{`));
    assert.match(types, /readonly/);
  }
  assert.match(source, /schemaVersion/);
  assert.match(source, /schema_version/);
});

test("Hermes guards are strict, closed, and fail closed", async () => {
  const sources = await Promise.all(modules.map((name) => readFile(new URL(name, hermesRoot), "utf8")));
  const combined = sources.join("\n");
  for (const name of contractNames) assert.match(combined, new RegExp(`function is${name}\\(`), `${name} guard`);
  assert.match(combined, /isHermesResult/);
  assert.match(combined, /isUtcIsoTimestamp/);
  assert.match(combined, /isOpaqueId/);
  assert.match(combined, /hasExactKeys/);
  assert.match(combined, /isTimestampOrder\(value, \["observedAt", "emittedAt", "expiresAt"\]\)/);
  assert.match(combined, /deniedExternalImpact/);
  assert.match(combined, /externalImpactType|impactType/);
  assert.match(combined, /spend/);
  assert.match(combined, /realUserDeployment/);
  assert.match(combined, /authoritative:\s*false/);
});

test("compiled Hermes guards accept valid V1 records and reject unsafe forms", async (t) => {
  const compiled = await compileNamespace();
  if (!compiled) {
    t.skip("nested TypeScript compiler process is unavailable in this sandbox");
    return;
  }
  const { outputDir, rootPath } = compiled;
  try {
    const rootContracts = await import(`${pathToFileURL(rootPath).href}?guard-test=${Date.now()}`);
    const contracts = rootContracts.HermesControlPlane;
    assert.ok(contracts, "compiled root namespace exports HermesControlPlane");
    for (const guardName of [
      "isHermesOutcomeV1", "isHermesLaneRunV1", "isDeliveryEvidenceV1", "isPolicyDecisionV1",
      "isExternalImpactRequestV1", "isFollowUpWorkV1", "isHermesLifecycleEventV1",
      "isHermesBoardLifecycleEventV1", "isVerificationRecordV1", "isReviewDispositionV1",
      "isReviewHandoffV1",
    ]) assert.equal(typeof contracts[guardName], "function", `${guardName} is exported at runtime`);
    const observedAt = "2026-08-28T00:00:00Z";
    const later = "2026-08-28T01:00:00Z";
    const refs = ["evidence:one"];
    const common = { metadataOnly: true, rawPayloadRetained: false, evidenceRefs: refs, idempotencyKey: "idempotency:one" };
    const outcome = {
      ...common, outcomeId: "outcome:one", schemaVersion: contracts.HERMES_OUTCOME_SCHEMA_VERSION, title: "Outcome", summary: "Bounded work",
      status: "active", result: "allowed", reasonCode: "ready", nextAction: "continue", observedAt, createdAt: observedAt, updatedAt: later,
    };
    const laneRun = {
      ...common, laneRunId: "lane-run:one", outcomeId: outcome.outcomeId, schemaVersion: contracts.HERMES_LANE_RUN_SCHEMA_VERSION, laneType: "developer",
      status: "running", result: "allowed", reasonCode: "ready", nextAction: "continue", heartbeatAt: observedAt,
      staleDeadlineAt: later, timeoutAt: "2026-08-28T02:00:00Z", retryBudget: 2, reworkBudget: 1, evidenceFingerprint: "sha256:one",
      observedAt, createdAt: observedAt, updatedAt: later,
    };
    const evidence = {
      ...common, deliveryEvidenceId: "delivery-evidence:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_DELIVERY_EVIDENCE_SCHEMA_VERSION, evidenceType: "verification", summary: "Checks passed",
      sourceRef: "source:one", observedAt, createdAt: observedAt,
    };
    const decision = {
      ...common, policyDecisionId: "policy-decision:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_POLICY_DECISION_SCHEMA_VERSION, decision: "allowed", reasonCode: "policy_ok", nextAction: "continue",
      observedAt, createdAt: observedAt,
    };
    const impact = {
      ...common, externalImpactRequestId: "external-impact:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_EXTERNAL_IMPACT_REQUEST_SCHEMA_VERSION, impactType: "spend", target: "bounded-target",
      effect: "bounded-effect", scope: "single-operation", expiresAt: later, alternativesConsidered: ["defer"],
      classificationRationale: "Requires a separate decision", createdAt: observedAt,
    };
    const followUp = {
      ...common, followUpWorkId: "follow-up:one", parentOutcomeId: outcome.outcomeId, schemaVersion: contracts.HERMES_FOLLOW_UP_WORK_SCHEMA_VERSION,
      title: "Follow up", summary: "Bounded follow-up", dedupeKey: "dedupe:one", owner: "coordinator", priorityRationale: "Unblocks delivery",
      capacityState: "available", reviewAt: observedAt, expiresAt: later, status: "proposed", result: "rework", reasonCode: "needs_work",
      nextAction: "review", observedAt, createdAt: observedAt,
    };
    const event = {
      ...common, eventId: "event:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_LIFECYCLE_EVENT_SCHEMA_VERSION, eventName: "hermes.outcome.created", result: "allowed",
      reasonCode: "observed", nextAction: "continue", correlationId: "correlation:one", causationId: "causation:one",
      observedAt, idempotencyKey: "idempotency:event-one", emittedAt: observedAt, authoritative: false,
    };
    const verification = {
      ...common, verificationRecordId: "verification:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_VERIFICATION_RECORD_SCHEMA_VERSION, result: "passed", target: "test:contract",
      sourceFingerprint: "sha256:one", developerIdentity: "developer:one", developerHome: "home:developer",
      developerWorkspace: "workspace:developer", observedAt, createdAt: observedAt,
      expectedOutcomeRevision: 1, expectedLaneRevision: 1,
    };
    const disposition = {
      ...common, reviewDispositionId: "review:one", verificationRecordId: verification.verificationRecordId,
      outcomeId: outcome.outcomeId, developerLaneRunId: laneRun.laneRunId,
      schemaVersion: contracts.HERMES_REVIEW_DISPOSITION_SCHEMA_VERSION, disposition: "approve",
      reviewerIdentity: "reviewer:one", reviewerHome: "home:reviewer", reviewerWorkspace: "workspace:reviewer",
      reasonCode: "approved", nextAction: "hold", observedAt: later, createdAt: observedAt,
      expectedOutcomeRevision: 1, expectedLaneRevision: 1,
    };
    const reviewEvent = { ...event, eventId: "event:review-one", idempotencyKey: "idempotency:review-one", eventName: "hermes.review.disposition.recorded" };
    const verificationEvent = { ...event, eventId: "event:verification-one", idempotencyKey: "idempotency:verification-one", eventName: "hermes.verification.recorded" };
    const unavailableReviewerBlockEvent = { ...event, eventId: "event:operator-block-one", idempotencyKey: "idempotency:operator-block-one", eventName: "hermes.review.unavailable_reviewer.blocked" };
    const unavailableReviewerException = { exceptionId: "exception:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId, reason: "reviewer_unavailable", riskClass: "technical_block", compensatingReviewRef: "evidence:compensating", recordedBy: "coordinator:one", recordedAt: observedAt, reviewOrExpiryAt: "2026-08-28T02:00:00Z", metadataOnly: true, rawPayloadRetained: false };
    const developerCapability = { developerCapabilityBindingId: "capability:developer", developerCapabilityProof: "d".repeat(32) };
    const reviewerCapability = { reviewerCapabilityBindingId: "capability:reviewer", reviewerCapabilityProof: "eyJhbGciOiJIUzI1NiJ9.payload.signature" };
    const operatorUnavailableReviewerBlock = { unavailableReviewerBlockId: "block:operator-one", verificationRecordId: verification.verificationRecordId, outcomeId: outcome.outcomeId, developerLaneRunId: laneRun.laneRunId, schemaVersion: "unavailable_reviewer_block.v1", expectedOutcomeRevision: 1, expectedLaneRevision: 1, reasonCode: "reviewer_unavailable", nextAction: "await replacement review", evidenceRefs: [evidence.deliveryEvidenceId], observedAt: later, idempotencyKey: "block:operator-one", createdAt: observedAt, metadataOnly: true, rawPayloadRetained: false };
    const operatorCapability = { operatorCapabilityBindingId: "capability:operator", operatorCapabilityProof: "o".repeat(32) };
    const boardEvent = {
      ...common, schemaVersion: contracts.HERMES_BOARD_LIFECYCLE_EVENT_SCHEMA_VERSION,
      issuerId: "issuer:one", keyId: "key:one", eventId: "event:board-one", idempotencyKey: "idempotency:board-one",
      boardId: "board:one", cardId: "card:one", outcomeId: outcome.outcomeId, laneRunId: laneRun.laneRunId,
      eventName: "hermes.lane.recovered", result: "retryable", reasonCode: "board_observed", nextAction: "continue",
      correlationId: "correlation:board-one", causationId: "causation:board-one", observedAt,
      emittedAt: later, expiresAt: "2026-08-28T02:00:00Z", signatureB64: "AA==", authoritative: false,
    };
    assert.equal(contracts.isHermesOutcomeV1(outcome), true);
    assert.equal(contracts.isHermesLaneRunV1(laneRun), true);
    assert.equal(contracts.isDeliveryEvidenceV1(evidence), true);
    assert.equal(contracts.isPolicyDecisionV1(decision), true);
    assert.equal(contracts.isExternalImpactRequestV1(impact), true);
    assert.equal(contracts.isFollowUpWorkV1(followUp), true);
    assert.equal(contracts.isHermesLifecycleEventV1(event), true);
    assert.equal(contracts.isHermesBoardLifecycleEventV1(boardEvent), true);
    assert.equal(contracts.isHermesLifecycleEventV1(reviewEvent), false);
    assert.equal(contracts.HERMES_LIFECYCLE_EVENT_NAMES.includes("hermes.verification.recorded"), true);
    assert.equal(contracts.HERMES_LIFECYCLE_EVENT_NAMES.includes("hermes.review.unavailable_reviewer.blocked"), true);
    assert.equal(contracts.isHermesLifecycleEventV1(verificationEvent), false);
    assert.equal(contracts.isHermesLifecycleEventV1(unavailableReviewerBlockEvent), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition, ...reviewerCapability }), true);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition, unavailableReviewerException: null, unavailableReviewerBlock: null, developerCapabilityBindingId: null, developerCapabilityProof: null, operatorCapabilityBindingId: null, operatorCapabilityProof: null, ...reviewerCapability }), true);
    const overlongVerificationId = `verification:${"a".repeat(108)}`;
    const overlongDispositionId = `review:${"a".repeat(114)}`;
    const overlongDeveloperIdentity = `developer:${"a".repeat(111)}`;
    const overlongReviewerIdentity = `reviewer:${"a".repeat(112)}`;
    assert.equal(contracts.isReviewHandoffV1({ verification: { ...verification, verificationRecordId: overlongVerificationId }, ...developerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, reviewDispositionId: overlongDispositionId }, ...reviewerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification: { ...verification, developerIdentity: overlongDeveloperIdentity }, ...developerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, reviewerIdentity: overlongReviewerIdentity }, ...reviewerCapability }), false);
    const caseDistinctReview = {
      verification: { ...verification, developerHome: "/Profiles/Developer", developerWorkspace: "/Work/Developer" },
      disposition: { ...disposition, reviewerHome: "/profiles/developer", reviewerWorkspace: "/Work/Reviewer" },
      ...reviewerCapability,
    };
    assert.equal(contracts.isReviewHandoffV1(caseDistinctReview), true);
    assert.equal(contracts.isReviewHandoffV1({ ...caseDistinctReview, disposition: { ...caseDistinctReview.disposition, reviewerIdentity: "DEVELOPER:ONE" } }), false);
    assert.equal(contracts.isReviewHandoffV1({ ...caseDistinctReview, verification: { ...caseDistinctReview.verification, developerIdentity: "developer:ß" }, disposition: { ...caseDistinctReview.disposition, reviewerIdentity: "developer:ss" } }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, ...developerCapability }), true);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, disposition: "technical_block" }, unavailableReviewerException, ...reviewerCapability }), true);
    assert.equal(contracts.isReviewHandoffV1({ verification: { ...verification, target: " test:contract" }, ...developerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, disposition: "technical_block" }, unavailableReviewerException: { ...unavailableReviewerException, reviewOrExpiryAt: later }, ...reviewerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, disposition: "technical_block" }, unavailableReviewerException: { ...unavailableReviewerException, recordedAt: "2026-08-28T01:00:01Z", reviewOrExpiryAt: "2026-08-28T02:00:00Z" }, ...reviewerCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: operatorUnavailableReviewerBlock, ...operatorCapability }), true);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException: { ...unavailableReviewerException, recordedAt: "2026-08-27T23:59:59Z" }, unavailableReviewerBlock: operatorUnavailableReviewerBlock, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException: { ...unavailableReviewerException, reviewOrExpiryAt: later }, unavailableReviewerBlock: operatorUnavailableReviewerBlock, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: operatorUnavailableReviewerBlock, ...operatorCapability, reviewerCapabilityProof: "r".repeat(32) }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: { ...operatorUnavailableReviewerBlock, evidenceRefs: Array.from({ length: 26 }, (_, index) => `evidence:${index}`) }, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: { ...operatorUnavailableReviewerBlock, unavailableReviewerBlockId: `block:${"a".repeat(115)}` }, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: { ...operatorUnavailableReviewerBlock, idempotencyKey: `block:${"a".repeat(175)}` }, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException, unavailableReviewerBlock: { ...operatorUnavailableReviewerBlock, idempotencyKey: "not opaque" }, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, unavailableReviewerException: { ...unavailableReviewerException, exceptionId: `exception:${"a".repeat(111)}` }, unavailableReviewerBlock: operatorUnavailableReviewerBlock, ...operatorCapability }), false);
    assert.equal(contracts.isReviewHandoffV1({ verification, disposition: { ...disposition, disposition: "technical_block" }, unavailableReviewerException: { ...unavailableReviewerException, exceptionId: "not opaque" }, ...reviewerCapability }), false);
    assert.equal(contracts.isHermesBoardLifecycleEventV1({ ...boardEvent, eventName: "hermes.review.disposition.recorded" }), false);
    assert.equal(contracts.isHermesBoardLifecycleEventV1({ ...boardEvent, issuerId: "tenant:job:attempt" }), true);
    assert.equal(contracts.isReviewHandoffV1({ verification: { ...verification, result: "failed", verificationRecordId: "verification:failed", idempotencyKey: "idempotency:failed" }, ...developerCapability }), true);
    assert.equal(Object.isFrozen(contracts.HERMES_RESULT_VALUES), true);
    assert.equal(Object.isFrozen(contracts.HERMES_LIFECYCLE_EVENT_NAMES), true);
    assert.equal(Object.isFrozen(contracts.HERMES_REQUIRED_FIELDS_BY_CONTRACT), true);
    assert.equal(Object.isFrozen(contracts.HERMES_REQUIRED_FIELDS_BY_CONTRACT.HermesLaneRunV1), true);
    assert.equal(Object.isFrozen(contracts.HERMES_SERIALIZED_FIELDS_BY_CONTRACT.HermesFollowUpWorkV1), true);
    assert.deepEqual(contracts.HERMES_REQUIRED_FIELDS_BY_CONTRACT.VerificationRecordV1.slice(-2), ["expectedOutcomeRevision", "expectedLaneRevision"]);
    assert.deepEqual(contracts.HERMES_SERIALIZED_FIELDS_BY_CONTRACT.VerificationRecordV1.slice(-2), ["expected_outcome_revision", "expected_lane_revision"]);
    for (const fieldMetadata of [
      contracts.hermesOutcomeV1Fields,
      contracts.hermesLaneRunV1Fields,
      contracts.deliveryEvidenceV1Fields,
      contracts.policyDecisionV1Fields,
      contracts.externalImpactRequestV1Fields,
      contracts.followUpWorkV1Fields,
      contracts.hermesLifecycleEventV1Fields,
      contracts.hermesBoardLifecycleEventV1Fields,
    ]) assert.equal(Object.isFrozen(fieldMetadata), true);
    for (const name of contractNames) {
      assert.equal(contracts.HERMES_REQUIRED_FIELDS_BY_CONTRACT[name].length, contracts.HERMES_SERIALIZED_FIELDS_BY_CONTRACT[name].length);
      const toSnakeCase = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      assert.deepEqual(
        contracts.HERMES_REQUIRED_FIELDS_BY_CONTRACT[name].map(toSnakeCase),
        contracts.HERMES_SERIALIZED_FIELDS_BY_CONTRACT[name],
        `${name} camelCase to snake_case mapping`,
      );
    }

    const invalidCases = [
      ["unknown result", { ...outcome, result: "unknown" }, contracts.isHermesOutcomeV1],
      ["unknown schema", { ...outcome, schemaVersion: "hermes_outcome.v9" }, contracts.isHermesOutcomeV1],
      ["malformed id", { ...outcome, outcomeId: "../secret" }, contracts.isHermesOutcomeV1],
      ["malformed timestamp", { ...outcome, observedAt: "2026-02-30T00:00:00Z" }, contracts.isHermesOutcomeV1],
      ["missing evidence", { ...outcome, evidenceRefs: [] }, contracts.isHermesOutcomeV1],
      ["invalid idempotency", { ...outcome, idempotencyKey: "" }, contracts.isHermesOutcomeV1],
      ["raw retention", { ...outcome, rawPayloadRetained: true }, contracts.isHermesOutcomeV1],
      ["unsafe metadata text", { ...outcome, summary: "api key=do-not-retain" }, contracts.isHermesOutcomeV1],
      ["provider token text", { ...outcome, summary: "sk_live_123456" }, contracts.isHermesOutcomeV1],
      ["jwt text", { ...outcome, summary: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature" }, contracts.isHermesOutcomeV1],
      ["sensitive id", { ...outcome, outcomeId: "id:ghp_secret" }, contracts.isHermesOutcomeV1],
      ["sensitive idempotency", { ...outcome, idempotencyKey: "id:AKIA1234567890123456" }, contracts.isHermesOutcomeV1],
      ["symbol property", Object.assign({ ...outcome }, { [Symbol("unknown")]: true }), contracts.isHermesOutcomeV1],
      ["non-enumerable property", (() => { const copy = { ...outcome }; Object.defineProperty(copy, "unknown", { value: true }); return copy; })(), contracts.isHermesOutcomeV1],
      ["hostile ownKeys proxy", new Proxy(outcome, { ownKeys() { throw new Error("blocked"); } }), contracts.isHermesOutcomeV1],
      ["hostile getter proxy", new Proxy(outcome, { get(target, key) { if (key === "summary") throw new Error("blocked"); return Reflect.get(target, key); } }), contracts.isHermesOutcomeV1],
      ["sparse evidence refs", { ...outcome, evidenceRefs: Object.assign([], { length: 1 }) }, contracts.isHermesOutcomeV1],
      ["external alternatives missing", { ...impact, alternativesConsidered: [] }, contracts.isExternalImpactRequestV1],
      ["sparse alternatives", { ...impact, alternativesConsidered: Object.assign([], { length: 1 }) }, contracts.isExternalImpactRequestV1],
      ["follow-up dedupe missing", { ...followUp, dedupeKey: "" }, contracts.isFollowUpWorkV1],
      ["event authorizes", { ...event, authoritative: true }, contracts.isHermesLifecycleEventV1],
      ["outcome timestamp order", { ...outcome, updatedAt: "2026-08-27T23:00:00Z" }, contracts.isHermesOutcomeV1],
      ["lane recovery timestamp order", { ...laneRun, timeoutAt: "2026-08-28T00:30:00Z" }, contracts.isHermesLaneRunV1],
      ["lane retry budget", { ...laneRun, retryBudget: -1 }, contracts.isHermesLaneRunV1],
      ["event emission order", { ...event, emittedAt: "2026-08-27T23:00:00Z" }, contracts.isHermesLifecycleEventV1],
      ["board event expires before emission", { ...boardEvent, expiresAt: observedAt }, contracts.isHermesBoardLifecycleEventV1],
      ["board event opaque ID exceeds API bound", { ...boardEvent, boardId: `board:${"x".repeat(120)}` }, contracts.isHermesBoardLifecycleEventV1],
      ["board event authorizes", { ...boardEvent, authoritative: true }, contracts.isHermesBoardLifecycleEventV1],
      ["board event unknown field", { ...boardEvent, unknown: true }, contracts.isHermesBoardLifecycleEventV1],
      ["evidence reference", { ...evidence, evidenceRefs: ["bad"] }, contracts.isDeliveryEvidenceV1],
      ["proofless verification-only handoff", { verification }, contracts.isReviewHandoffV1],
      ["short capability proof", { verification, ...developerCapability, developerCapabilityProof: "d".repeat(23) }, contracts.isReviewHandoffV1],
      ["oversized capability binding", { verification, ...developerCapability, developerCapabilityBindingId: `capability:${"a".repeat(121)}` }, contracts.isReviewHandoffV1],
      ["oversized verification idempotency", { verification: { ...verification, idempotencyKey: `idempotency:${"a".repeat(169)}` }, ...developerCapability }, contracts.isReviewHandoffV1],
      ["oversized disposition idempotency", { verification, disposition: { ...disposition, idempotencyKey: `idempotency:${"a".repeat(169)}` }, ...reviewerCapability }, contracts.isReviewHandoffV1],
      ["passed verification-only handoff with an exception", { verification, unavailableReviewerException, ...developerCapability }, contracts.isReviewHandoffV1],
      ["unavailable reviewer exception without a future review point", { verification, disposition: { ...disposition, disposition: "technical_block" }, unavailableReviewerException: { ...unavailableReviewerException, reviewOrExpiryAt: unavailableReviewerException.recordedAt }, ...reviewerCapability }, contracts.isReviewHandoffV1],
      ["review instant before verification", { verification: { ...verification, observedAt: "2026-08-28T00:00:00.100Z", createdAt: "2026-08-28T00:00:00.100Z" }, disposition: { ...disposition, observedAt, createdAt: observedAt } }, contracts.isReviewHandoffV1],
      ["policy decision", { ...decision, decision: "unknown" }, contracts.isPolicyDecisionV1],
    ];
    for (const [label, value, guard] of invalidCases) assert.equal(guard(value), false, label);
    assert.equal(contracts.isExternalImpactRequestV1({ ...impact, createdAt: "2020-01-01T00:00:00Z", expiresAt: "2020-01-02T00:00:00Z" }), true);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
