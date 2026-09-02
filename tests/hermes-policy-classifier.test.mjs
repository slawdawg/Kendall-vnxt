import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkflowCoreManagerControlPlane } from "./helpers/manager-control-plane/workflow-core-loader.mjs";

const BASE = Object.freeze({
  outcomeId: "outcome:one",
  laneRunId: "lane-run:one",
  idempotencyKey: "idempotency:one",
  evidenceRefs: ["evidence:one"],
  target: "operator-worktree",
  effect: "run bounded source verification",
  scope: "named operator delivery lane",
  targetClassification: "operatorOnly",
  effectClassification: "metadataOnly",
  alternativesConsidered: ["defer verification"],
  actionClassification: "verification",
  costClassification: "included",
  costCertainty: "known",
  audienceClassification: "namedOperatorOnly",
  audienceCertainty: "known",
  observedAt: "2026-08-28T00:00:00Z",
  evaluationAt: "2026-08-28T00:00:00Z",
  createdAt: "2026-08-28T00:00:00Z",
  expiresAt: "2026-08-28T01:00:00Z",
});

async function classifier() {
  const workflow = await loadWorkflowCoreManagerControlPlane();
  assert.equal(typeof workflow.classifyHermesPolicy, "function");
  return workflow;
}

test("ordinary metadata-only work is allowed and frozen", async () => {
  const { classifyHermesPolicy } = await classifier();
  const result = classifyHermesPolicy(BASE);
  assert.equal(result.policyDecision.decision, "allowed");
  assert.equal(result.externalImpactRequest, null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.policyDecision), true);
  assert.equal(Object.isFrozen(result.policyDecision.evidenceRefs), true);
});

test("spend is denied with a decision-ready request and no capability fields", async () => {
  const { classifyHermesPolicy } = await classifier();
  const result = classifyHermesPolicy({
    ...BASE,
    actionClassification: "spend",
    costClassification: "paidPlan",
    costCertainty: "known",
    target: "paid-resource",
    effect: "enable a paid resource",
  });
  assert.equal(result.policyDecision.decision, "deniedExternalImpact");
  assert.equal(result.externalImpactRequest.impactType, "spend");
  assert.equal(result.externalImpactRequest.metadataOnly, true);
  assert.equal(result.externalImpactRequest.rawPayloadRetained, false);
  assert.equal(Object.isFrozen(result.externalImpactRequest), true);
  assert.deepEqual(
    Object.keys(result.externalImpactRequest).sort(),
    ["externalImpactRequestId", "outcomeId", "laneRunId", "schemaVersion", "impactType", "target", "effect", "scope", "expiresAt", "alternativesConsidered", "classificationRationale", "evidenceRefs", "idempotencyKey", "createdAt", "metadataOnly", "rawPayloadRetained"].sort(),
  );
});

test("real-user deployment is denied, including known non-operator audience", async () => {
  const { classifyHermesPolicy } = await classifier();
  const result = classifyHermesPolicy({
    ...BASE,
    actionClassification: "release",
    audienceClassification: "production",
    audienceCertainty: "known",
    target: "production-route",
    effect: "publish the reviewed change",
  });
  assert.equal(result.policyDecision.decision, "deniedExternalImpact");
  assert.equal(result.externalImpactRequest.impactType, "realUserDeployment");
});

test("unknown cost and audience fail closed to their external-impact classes", async () => {
  const { classifyHermesPolicy } = await classifier();
  const unknownCost = classifyHermesPolicy({ ...BASE, costClassification: "unknown", costCertainty: "uncertain" });
  const unknownAudience = classifyHermesPolicy({ ...BASE, audienceClassification: "unknown", audienceCertainty: "uncertain" });
  assert.equal(unknownCost.policyDecision.decision, "deniedExternalImpact");
  assert.equal(unknownCost.externalImpactRequest.impactType, "spend");
  assert.equal(unknownAudience.policyDecision.decision, "deniedExternalImpact");
  assert.equal(unknownAudience.externalImpactRequest.impactType, "realUserDeployment");
});

test("malformed input and caller-supplied allow requests are denied without an impact record", async () => {
  const { classifyHermesPolicy } = await classifier();
  const malformed = classifyHermesPolicy({ ...BASE, evidenceRefs: [], requestedDecision: "allowed" });
  const unknownAction = classifyHermesPolicy({ ...BASE, actionClassification: "unknown" });
  assert.equal(malformed.policyDecision.decision, "deniedPolicy");
  assert.equal(malformed.externalImpactRequest, null);
  assert.equal(unknownAction.policyDecision.decision, "deniedPolicy");
  assert.equal(unknownAction.externalImpactRequest, null);
});

test("same identity and digest replay the same denial; mismatches conflict", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const first = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "incremental" });
  const replay = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "incremental" }, {
    ...first,
    requestDigest: first.requestDigest,
    status: "active",
  });
  const conflict = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "incremental", scope: "different scope" }, {
    ...first,
    requestDigest: first.requestDigest,
    status: "active",
  });
  assert.equal(replay.replayState, "replayed");
  assert.deepEqual(replay.externalImpactRequest, first.externalImpactRequest);
  assert.equal(conflict.replayState, "conflict");
  assert.notEqual(conflict.policyDecision.decision, "allowed");
});

test("expired, revoked, and consumed records never replay authority", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const first = classifyHermesPolicy({ ...BASE, actionClassification: "release", audienceClassification: "public" });
  for (const status of ["expired", "revoked", "consumed"]) {
    const result = evaluateHermesPolicy({ ...BASE, actionClassification: "release", audienceClassification: "public" }, {
      ...first,
      requestDigest: first.requestDigest,
      status,
    });
    assert.notEqual(result.replayState, "replayed");
    assert.notEqual(result.policyDecision.decision, "allowed");
  }
});

test("active replay requires a paired denial and never trusts an allowed or tampered prior", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const input = { ...BASE, actionClassification: "spend", costClassification: "paidPlan" };
  const denied = classifyHermesPolicy(input);
  const allowedPrior = { ...denied, policyDecision: { ...denied.policyDecision, decision: "allowed" }, status: "active" };
  const tamperedPrior = { ...denied, externalImpactRequest: { ...denied.externalImpactRequest, effect: "different effect" }, status: "active" };
  const tamperedExpiry = { ...denied, externalImpactRequest: { ...denied.externalImpactRequest, expiresAt: "2026-08-28T02:00:00Z" }, status: "active" };
  const tamperedDecisionTimestamp = { ...denied, policyDecision: { ...denied.policyDecision, observedAt: "2026-08-28T00:30:00Z" }, status: "active" };
  const missingPair = { ...denied, externalImpactRequest: null, status: "active" };
  for (const prior of [allowedPrior, tamperedPrior, tamperedExpiry, tamperedDecisionTimestamp]) {
    const result = evaluateHermesPolicy(input, prior);
    assert.equal(result.replayState, "conflict");
    assert.equal(result.policyDecision.decision, "deniedExternalImpact");
    assert.equal(result.externalImpactRequest, null);
  }
  const missingPairResult = evaluateHermesPolicy(input, missingPair);
  assert.equal(missingPairResult.replayState, "conflict");
  assert.equal(missingPairResult.policyDecision.decision, "deniedPolicy");
  assert.equal(missingPairResult.externalImpactRequest, null);
});

test("an external caller-supplied allow is denied as policy input", async () => {
  const { classifyHermesPolicy } = await classifier();
  const result = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", requestedDecision: "allowed" });
  assert.equal(result.policyDecision.decision, "deniedPolicy");
  assert.equal(result.externalImpactRequest, null);
});

test("timestamps are ordered, bounded, normalized, and expire at evaluation time", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const normalized = classifyHermesPolicy({ ...BASE, observedAt: "2026-08-28T00:00:00.000Z", createdAt: "2026-08-27T23:00:00.000Z", expiresAt: "2026-08-28T01:00:00.000Z" });
  assert.equal(normalized.policyDecision.observedAt, "2026-08-28T00:00:00Z");
  for (const invalid of [
    { createdAt: "2026-08-28T01:00:00Z" },
    { expiresAt: "2026-08-28T00:00:00Z" },
    { expiresAt: "2026-08-30T00:00:00Z" },
    { evaluationAt: "2026-08-28T01:00:00Z" },
    { evaluationAt: undefined },
  ]) {
    const result = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", ...invalid });
    assert.equal(result.policyDecision.decision, "deniedPolicy");
    assert.equal(result.externalImpactRequest, null);
  }
  const first = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan" });
  const expired = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", evaluationAt: "2026-08-28T02:00:00Z" }, { ...first, status: "active" });
  assert.notEqual(expired.replayState, "replayed");
  assert.notEqual(expired.policyDecision.decision, "allowed");
});

test("SHA-256 identity separates distinct canonical requests and normalizes collections", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const first = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", evidenceRefs: ["evidence:one", "evidence:two"], alternativesConsidered: ["stop", "defer"] });
  const equivalent = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", evidenceRefs: ["evidence:two", "evidence:one"], alternativesConsidered: ["defer", "stop"], observedAt: "2026-08-28T00:00:00.000Z" }, { ...first, status: "active" });
  const distinct = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan", target: "other-resource" }, { ...first, status: "active" });
  assert.match(first.requestDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(equivalent.replayState, "replayed");
  assert.equal(distinct.replayState, "conflict");
  assert.notEqual(first.requestDigest, distinct.requestDigest);
});

test("same-key ordinary replay is digest-fenced", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const first = classifyHermesPolicy(BASE);
  const replay = evaluateHermesPolicy(BASE, { ...first, status: "active" });
  const changed = evaluateHermesPolicy({ ...BASE, scope: "a different bounded scope" }, { ...first, status: "active" });
  assert.equal(replay.replayState, "replayed");
  assert.equal(replay.policyDecision.decision, "allowed");
  assert.equal(changed.replayState, "conflict");
  assert.equal(changed.policyDecision.decision, "deniedPolicy");
  assert.equal(changed.externalImpactRequest, null);
  assert.notEqual(first.requestDigest, changed.requestDigest);
});

test("accessors, proxies, unknown statuses, and external-to-ordinary reuse fail closed", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const accessor = { ...BASE };
  Object.defineProperty(accessor, "effect", { get() { return "run bounded source verification"; }, enumerable: true });
  assert.doesNotThrow(() => classifyHermesPolicy(accessor));
  assert.equal(classifyHermesPolicy(accessor).policyDecision.decision, "deniedPolicy");
  const proxy = new Proxy({ ...BASE }, { ownKeys() { throw new Error("blocked"); } });
  assert.doesNotThrow(() => classifyHermesPolicy(proxy));
  assert.equal(classifyHermesPolicy(proxy).policyDecision.decision, "deniedPolicy");
  const external = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan" });
  const unknownStatus = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan" }, { ...external, status: "mystery" });
  assert.equal(unknownStatus.replayState, "conflict");
  const ordinaryReuse = evaluateHermesPolicy(BASE, { ...external, status: "active" });
  assert.equal(ordinaryReuse.replayState, "conflict");
  assert.equal(ordinaryReuse.policyDecision.decision, "deniedPolicy");
});

test("both effect fields must be safe and equal; contradictory structured metadata cannot be ordinary", async () => {
  const { classifyHermesPolicy } = await classifier();
  const mismatch = classifyHermesPolicy({ ...BASE, requestedEffect: "different effect" });
  const unsafe = classifyHermesPolicy({ ...BASE, requestedEffect: "use secret" });
  const contradictoryEffect = classifyHermesPolicy({ ...BASE, effectClassification: "publish" });
  const contradictoryTarget = classifyHermesPolicy({ ...BASE, targetClassification: "production" });
  const unknownStructured = classifyHermesPolicy({ ...BASE, targetClassification: "unknown" });
  assert.equal(mismatch.policyDecision.decision, "deniedPolicy");
  assert.equal(unsafe.policyDecision.decision, "deniedPolicy");
  assert.equal(contradictoryEffect.policyDecision.decision, "deniedExternalImpact");
  assert.equal(contradictoryEffect.externalImpactRequest.impactType, "realUserDeployment");
  assert.equal(contradictoryTarget.policyDecision.decision, "deniedExternalImpact");
  assert.equal(unknownStructured.policyDecision.decision, "deniedPolicy");
});

test("evaluation snapshots are immutable and never reread accessor or proxy values", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  let reads = 0;
  const accessor = { ...BASE };
  Object.defineProperty(accessor, "target", { get() { reads += 1; return "operator-worktree"; }, enumerable: true });
  const accessorResult = classifyHermesPolicy(accessor);
  assert.equal(accessorResult.policyDecision.decision, "deniedPolicy");
  assert.equal(reads, 0);
  const proxy = new Proxy({ ...BASE }, { get() { throw new Error("must not read"); }, getOwnPropertyDescriptor() { throw new Error("blocked"); } });
  assert.doesNotThrow(() => evaluateHermesPolicy(proxy));
  assert.equal(evaluateHermesPolicy(proxy).policyDecision.decision, "deniedPolicy");
  let timestampReads = 0;
  const timestamp = { toString() { timestampReads += 1; return BASE.observedAt; } };
  const timestampResult = classifyHermesPolicy({ ...BASE, observedAt: timestamp });
  assert.equal(timestampResult.policyDecision.decision, "deniedPolicy");
  assert.equal(timestampReads, 0);
  const symbolKey = { ...BASE, [Symbol("unknown")]: "reject" };
  assert.equal(classifyHermesPolicy(symbolKey).policyDecision.decision, "deniedPolicy");
});

test("classification vocabularies are closed and explicit unknowns fail safely", async () => {
  const { classifyHermesPolicy } = await classifier();
  for (const field of ["actionClassification", "costClassification", "costCertainty", "audienceClassification", "audienceCertainty", "targetClassification", "effectClassification"]) {
    const result = classifyHermesPolicy({ ...BASE, [field]: "not-a-closed-value" });
    assert.equal(result.policyDecision.decision, "deniedPolicy", field);
    assert.equal(result.externalImpactRequest, null, field);
  }
  const unknownCost = classifyHermesPolicy({ ...BASE, costClassification: "unknown", costCertainty: "unknown" });
  const unknownAudience = classifyHermesPolicy({ ...BASE, audienceClassification: "unknown", audienceCertainty: "unknown" });
  assert.equal(unknownCost.externalImpactRequest.impactType, "spend");
  assert.equal(unknownAudience.externalImpactRequest.impactType, "realUserDeployment");
});

test("semantic public/customer/production text cannot bypass operator-safe structured labels", async () => {
  const { classifyHermesPolicy } = await classifier();
  for (const fields of [
    { target: "public-route", effect: "run bounded source verification" },
    { target: "operator-worktree", effect: "publish the reviewed change" },
    { target: "customer-preview", effect: "run bounded source verification" },
    { target: "production-route", effect: "release reviewed change" },
    { target: "non-operator queue", effect: "run bounded source verification" },
    { target: "non operator audience", effect: "run bounded source verification" },
    { target: "real-user endpoint", effect: "run bounded source verification" },
    { target: "operator-worktree", effect: "user-facing status verification" },
    { target: "operator-worktree", effect: "run bounded source verification", scope: "customer public live route" },
    { target: "operator-worktree", effect: "routing and enabling a live user-facing path" },
    { target: "operator-worktree", effect: "publishes, releases, and deploys change" },
    { target: "prod", effect: "roll out reviewed change" },
    { target: "operator-worktree", effect: "rollout reviewed change" },
    { target: "operator-worktree", effect: "rolling out reviewed change" },
    { target: "operator-worktree", effect: "rolling-out reviewed change" },
  ]) {
    const result = classifyHermesPolicy({ ...BASE, ...fields });
    assert.equal(result.policyDecision.decision, "deniedExternalImpact");
    assert.equal(result.externalImpactRequest.impactType, "realUserDeployment");
  }
  const negatedVerification = classifyHermesPolicy({ ...BASE, effect: "verify no production release", scope: "bounded verification" });
  assert.equal(negatedVerification.policyDecision.decision, "deniedExternalImpact");
  assert.equal(negatedVerification.externalImpactRequest.impactType, "realUserDeployment");
  const splitClause = classifyHermesPolicy({ ...BASE, effect: "verify no release, publish to production" });
  const coordinatedClause = classifyHermesPolicy({ ...BASE, effect: "check no release and publish to production" });
  assert.equal(splitClause.policyDecision.decision, "deniedExternalImpact");
  assert.equal(coordinatedClause.policyDecision.decision, "deniedExternalImpact");
  const localEnable = classifyHermesPolicy({ ...BASE, effect: "enable local metadata check" });
  const localRoute = classifyHermesPolicy({ ...BASE, effect: "route local verification result" });
  const localStructuredEnable = classifyHermesPolicy({ ...BASE, effect: "enable local metadata check", effectClassification: "enable" });
  const localStructuredRoute = classifyHermesPolicy({ ...BASE, effect: "route local verification result", effectClassification: "route" });
  assert.equal(localEnable.policyDecision.decision, "allowed");
  assert.equal(localRoute.policyDecision.decision, "allowed");
  assert.notEqual(localStructuredEnable.policyDecision.decision, "deniedExternalImpact");
  assert.notEqual(localStructuredRoute.policyDecision.decision, "deniedExternalImpact");
  for (const effect of ["do not forget to publish", "do not skip release"]) {
    const ambiguousImperative = classifyHermesPolicy({ ...BASE, effect });
    assert.equal(ambiguousImperative.policyDecision.decision, "deniedExternalImpact", effect);
  }
});

test("audience variants and definite raw Spend semantics fail closed", async () => {
  const { classifyHermesPolicy } = await classifier();
  for (const target of ["customer", "customers", "user", "users", "real users", "non-operators", "external audience"]) {
    const result = classifyHermesPolicy({ ...BASE, target });
    assert.equal(result.policyDecision.decision, "deniedExternalImpact", target);
    assert.equal(result.externalImpactRequest.impactType, "realUserDeployment", target);
  }
  for (const fields of [
    { target: "paid plan account", effect: "run bounded source verification" },
    { target: "operator-worktree", effect: "purchase a resource" },
    { target: "operator-worktree", effect: "run billable incremental usage" },
    { target: "operator-worktree", effect: "charge billing cost" },
    { target: "operator-worktree", effect: "run bounded source verification", scope: "paid add-on resource" },
    { target: "buy resource", effect: "run bounded source verification" },
    { target: "operator-worktree", effect: "bought a plan" },
    { target: "operator-worktree", effect: "purchasing an account" },
    { target: "operator-worktree", effect: "subscribe to a plan" },
    { target: "operator-worktree", effect: "subscription billing" },
    { target: "operator-worktree", effect: "enable a paid API" },
    { target: "operator-worktree", effect: "use an API that costs money" },
    { target: "operator-worktree", effect: "this API incurs a cost" },
    { target: "operator-worktree", effect: "pay payment" },
    { target: "operator-worktree", effect: "spend budget" },
    { target: "operator-worktree", effect: "spending company funds" },
    { target: "operator-worktree", effect: "paid-plan" },
    { target: "operator-worktree", effect: "incremental-billable-usage" },
    { target: "operator-worktree", effect: "incur cost" },
    { target: "operator-worktree", effect: "billing account" },
    { target: "operator-worktree", effect: "cost incurred" },
    { target: "operator-worktree", effect: "cause usage to be billed" },
    { target: "operator-worktree", effect: "usage is invoiced" },
  ]) {
    const result = classifyHermesPolicy({ ...BASE, ...fields });
    assert.equal(result.policyDecision.decision, "deniedExternalImpact");
    assert.equal(result.externalImpactRequest.impactType, "spend");
  }
  const negatedSpend = classifyHermesPolicy({ ...BASE, effect: "verify no paid plan, check no billing" });
  assert.equal(negatedSpend.policyDecision.decision, "deniedExternalImpact");
  assert.equal(negatedSpend.externalImpactRequest.impactType, "spend");
  for (const effect of ["verify cost metadata", "review billing metadata", "review bill metadata", "check cost summary", "inspect billing report"]) {
    const metadataMention = classifyHermesPolicy({ ...BASE, effect });
    assert.equal(metadataMention.policyDecision.decision, "allowed", effect);
    assert.equal(metadataMention.externalImpactRequest, null, effect);
  }
});

test("arrays require canonical own index keys", async () => {
  const { classifyHermesPolicy } = await classifier();
  for (const field of ["evidenceRefs", "alternativesConsidered"]) {
    const array = field === "evidenceRefs" ? ["evidence:one"] : ["defer verification"];
    Object.defineProperty(array, "01", { value: array[0], enumerable: false, configurable: true });
    const result = classifyHermesPolicy({ ...BASE, [field]: array });
    assert.equal(result.policyDecision.decision, "deniedPolicy", field);
    assert.equal(result.externalImpactRequest, null, field);
  }
});

test("plain snapshots reject prototype pollution without mutating global prototypes", async () => {
  const { classifyHermesPolicy } = await classifier();
  const polluted = Object.create(null);
  Object.assign(polluted, BASE);
  Object.defineProperty(polluted, "__proto__", { value: "reject", enumerable: true, configurable: true });
  assert.equal(classifyHermesPolicy(polluted).policyDecision.decision, "deniedPolicy");
  assert.equal(Object.prototype.polluted, undefined);
});

test("any reused external idempotency key conflicts across ordinary/external transitions", async () => {
  const { classifyHermesPolicy, evaluateHermesPolicy } = await classifier();
  const external = classifyHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan" });
  const ordinaryFromExternal = evaluateHermesPolicy(BASE, { ...external, status: "active" });
  assert.equal(ordinaryFromExternal.replayState, "conflict");
  assert.equal(ordinaryFromExternal.policyDecision.decision, "deniedPolicy");
  const ordinary = classifyHermesPolicy(BASE);
  const externalFromOrdinary = evaluateHermesPolicy({ ...BASE, actionClassification: "spend", costClassification: "paidPlan" }, { ...ordinary, status: "active" });
  assert.equal(externalFromOrdinary.replayState, "conflict");
  assert.notEqual(externalFromOrdinary.policyDecision.decision, "allowed");
  assert.equal(externalFromOrdinary.externalImpactRequest, null);
});

test("classifier source remains pure and does not import runtime integrations", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../packages/workflow-core/src/hermes-control-plane/policy-classifier.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'](?:node:|fs|path|child_process)/);
  assert.doesNotMatch(source, /(?:spawn|exec)\s*\(/i);
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:adapter|runtime|provider|github)[^"']*["']/i);
});
