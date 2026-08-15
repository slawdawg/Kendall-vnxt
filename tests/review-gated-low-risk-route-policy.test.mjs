import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFakeReviewInput } from "../scripts/lib/review-gated-low-risk-fake-adapter.mjs";
import { evaluateGovernedReadOnlyReview } from "../scripts/lib/review-gated-low-risk-read-only-review.mjs";
import { BOUNDED_ROUTE_POLICY_DEFAULTS, evaluateBoundedReviewRoute, parseJsonRejectingDuplicateKeys, parseLocalProviderAuthorityPolicy, parseLocalProviderAuthorityPolicyDocument, selectOrderedReviewRoute } from "../scripts/lib/review-gated-low-risk-route-policy.mjs";

const activeAuthorityPolicy = JSON.parse(readFileSync(new URL("../docs/workflows/local-provider-authority-policy-v1.json", import.meta.url), "utf8"));
const authorityOnHold = activeAuthorityPolicy.status === "hold_conflicting_source_vm" && activeAuthorityPolicy.approvedSourceVm === null;
const authorityApproved = activeAuthorityPolicy.status === "approved" && typeof activeAuthorityPolicy.approvedSourceVm === "string";

function validOllamaBackup(sourceVm) {
  return {
    role: "backup-review",
    provider: "ollama",
    endpoint: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaEndpoint,
    model: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaModel,
    sourceVm,
    connectTimeoutSeconds: 2,
    totalTimeoutSeconds: 120,
    metadataOnly: true,
    rawPayloadRetained: false,
    publicExposure: false,
    credentialsRead: false,
    modelDiscovery: false,
    endpointDiscovery: false,
    reviewPass: false,
    activationAllowed: false,
    fallbackUsed: true,
    primaryFailure: "rate-limited",
  };
}

test("only a complete reviewed authority policy can select a source VM", () => {
  const validApprovedPolicy = {
    schemaVersion: 1,
    authorityFamily: "local-provider-execution",
    status: "approved",
    approvedSourceVm: "192.168.1.118",
    candidateSourceVms: [
      { sourceVm: "192.168.1.118", claim: "accepted_operator_approval", provenanceRef: "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md" },
      { sourceVm: "192.168.1.8", claim: "current_routed_source_observation", provenanceRef: "docs/architecture/kendall-vnxt-llm-orchestration-lane-model-2026-06-10.md" },
    ],
    route: { endpoint: "http://192.168.1.128:11434/v1/chat/completions", model: "qwen3:14b", connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, retentionMode: "metadata-only" },
    defaults: { allowLocalProviderCalls: false, allowOllamaProviderCalls: false, allowAutomaticOllamaLocalEvidence: false },
  };
  assert.equal(parseLocalProviderAuthorityPolicy(validApprovedPolicy).approvedSourceVm, "192.168.1.118");
  for (const malformed of [
    { ...validApprovedPolicy, candidateSourceVms: [validApprovedPolicy.candidateSourceVms[0], validApprovedPolicy.candidateSourceVms[0]] },
    { ...validApprovedPolicy, candidateSourceVms: [{ ...validApprovedPolicy.candidateSourceVms[0], sourceVm: " 192.168.1.118 " }, validApprovedPolicy.candidateSourceVms[1]] },
    { ...validApprovedPolicy, approvedSourceVm: "192.168.1.9" },
    { ...validApprovedPolicy, approvedSourceVm: " 192.168.1.118 " },
    { ...validApprovedPolicy, route: { ...validApprovedPolicy.route, endpoint: " http://192.168.1.128:11434/v1/chat/completions " } },
    { ...validApprovedPolicy, route: { ...validApprovedPolicy.route, totalTimeoutSeconds: 121 } },
    { ...validApprovedPolicy, defaults: { ...validApprovedPolicy.defaults, allowOllamaProviderCalls: true } },
  ]) {
    const parsed = parseLocalProviderAuthorityPolicy(malformed);
    assert.equal(parsed.status, "invalid");
    assert.equal(parsed.approvedSourceVm, null);
  }
});

test("duplicate authority-policy JSON members fail closed before validation", () => {
  assert.throws(
    () => parseJsonRejectingDuplicateKeys('{"status":"hold_conflicting_source_vm","status":"approved"}'),
    /Duplicate JSON object key: status/,
  );
  assert.throws(
    () => parseJsonRejectingDuplicateKeys('{"route":{"endpoint":"one","endpoint":"two"}}'),
    /Duplicate JSON object key: endpoint/,
  );
  assert.equal(
    parseLocalProviderAuthorityPolicyDocument('{"schemaVersion":1,"schemaVersion":1}').status,
    "invalid",
  );
  assert.equal(
    parseLocalProviderAuthorityPolicyDocument(JSON.stringify(activeAuthorityPolicy).replace('"schemaVersion":1', '"schemaVersion":1.0')).status,
    "hold_conflicting_source_vm",
  );
  assert.equal(
    parseLocalProviderAuthorityPolicyDocument(JSON.stringify(activeAuthorityPolicy).replace('{', '{\u00a0')).status,
    "invalid",
  );
});

test("active authority state governs Ollama source-VM eligibility", () => {
  assert.equal(authorityOnHold || authorityApproved, true);
  assert.equal(BOUNDED_ROUTE_POLICY_DEFAULTS.localProviderAuthorityStatus, activeAuthorityPolicy.status);
  assert.equal(BOUNDED_ROUTE_POLICY_DEFAULTS.localProviderAuthorityResolved, authorityApproved);
  assert.equal(BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaSourceVm, authorityApproved ? activeAuthorityPolicy.approvedSourceVm : null);
  for (const sourceVm of ["192.168.1.118", "192.168.1.8"]) {
    const packet = evaluateBoundedReviewRoute(validOllamaBackup(sourceVm));
    const selected = authorityApproved && sourceVm === activeAuthorityPolicy.approvedSourceVm;
    assert.equal(packet.status, selected ? "READY" : "HOLD", sourceVm);
    assert.equal(packet.reviewEligible, selected, sourceVm);
    assert.equal(packet.activationEligible, false, sourceVm);
    assert.equal(packet.allowed, selected, sourceVm);
    assert.equal(packet.disabledReason, selected ? null : "ollama_authority_policy_unresolved", sourceVm);
    if (!selected) assert.ok(packet.blockers.includes("ollama_authority_policy_unresolved"), sourceVm);
  }
});

test("Ollama route rejects endpoint/model relabeling and authority bypass", () => {
  for (const mutate of [
    (input) => { input.endpoint = "http://127.0.0.1:11434/v1/chat/completions"; },
    (input) => { input.model = "gpt-5.6"; },
    (input) => { input.sourceVm = "127.0.0.1"; },
    (input) => { input.reviewPass = true; },
    (input) => { input.rawPayloadRetained = true; },
    (input) => { delete input.publicExposure; },
    (input) => { input.credentialsRead = "false"; },
    (input) => { input.rawPrompt = "forbidden"; },
  ]) {
    const input = {
      role: "backup-review", provider: "ollama",
      endpoint: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaEndpoint, model: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaModel,
      sourceVm: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaSourceVm, connectTimeoutSeconds: 2, totalTimeoutSeconds: 120,
      metadataOnly: true, rawPayloadRetained: false,
      publicExposure: false, credentialsRead: false, modelDiscovery: false, endpointDiscovery: false,
      reviewPass: false, activationAllowed: false, fallbackUsed: true, primaryFailure: "rate-limited",
    };
    mutate(input);
    const packet = evaluateBoundedReviewRoute(input);
    assert.equal(packet.status, "HOLD");
    assert.equal(packet.reviewEligible, false);
  }
});

test("approved Claude primary route is review eligible but cannot grant activation", () => {
  const packet = evaluateBoundedReviewRoute({
    role: "primary-review",
    provider: "claude",
    model: "claude",
    executable: "claude",
    mode: "print",
    authenticated: true,
    maxBudgetUsd: 1,
    allowedTools: ["Read", "Grep", "Glob"],
    disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"],
    sourceScope: "named-evidence-only",
    metadataOnly: true,
    rawPayloadRetained: false,
    reviewPass: false,
    activationAllowed: false,
    fallbackUsed: false,
  });
  assert.equal(packet.status, "READY");
  assert.equal(packet.reviewEligible, true);
  assert.equal(packet.activationEligible, false);
  assert.equal(packet.allowed, true);
  assert.equal(packet.priority, 1);
});

test("Claude primary route requires explicit no-fallback metadata", () => {
  const base = {
    role: "primary-review", provider: "claude", model: "claude", executable: "claude", mode: "print", authenticated: true,
    maxBudgetUsd: 1, allowedTools: ["Read", "Grep", "Glob"], disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"],
    sourceScope: "named-evidence-only", metadataOnly: true, rawPayloadRetained: false, reviewPass: false, activationAllowed: false,
  };
  assert.equal(evaluateBoundedReviewRoute({ ...base, fallbackUsed: true }).status, "HOLD");
  assert.equal(evaluateBoundedReviewRoute({ ...base, fallbackUsed: false, primaryFailure: "rate-limited" }).status, "HOLD");
  assert.equal(evaluateBoundedReviewRoute({ ...base, fallbackUsed: false }).status, "READY");
});

test("ordered selection follows the active Ollama authority state", () => {
  const primary = {
    provider: "claude", model: "claude", executable: "claude", mode: "print", authenticated: true, maxBudgetUsd: 1,
    allowedTools: ["Read", "Grep", "Glob"], disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"],
    sourceScope: "named-evidence-only", metadataOnly: true, rawPayloadRetained: false,
    reviewPass: false, activationAllowed: false,
  };
  const backup = {
    provider: "ollama", endpoint: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaEndpoint, model: BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaModel,
    sourceVm: authorityApproved ? activeAuthorityPolicy.approvedSourceVm : "192.168.1.8", connectTimeoutSeconds: 2, totalTimeoutSeconds: 120,
    metadataOnly: true, rawPayloadRetained: false, publicExposure: false, credentialsRead: false,
    modelDiscovery: false, endpointDiscovery: false, reviewPass: false, activationAllowed: false,
  };
  assert.equal(selectOrderedReviewRoute({ primary, backup }).selected, "claude");
  const fallback = selectOrderedReviewRoute({ primary, backup, primaryFailure: "rate-limited" });
  assert.equal(fallback.status, authorityApproved ? "READY" : "HOLD");
  assert.equal(fallback.selected, authorityApproved ? "ollama" : null);
  assert.equal(fallback.fallbackUsed, authorityApproved);
  if (authorityOnHold) assert.ok(fallback.backup.blockers.includes("ollama_authority_policy_unresolved"));
  assert.equal(selectOrderedReviewRoute({ primary, backup, primaryFailure: "HTTP 429" }).status, authorityApproved ? "READY" : "HOLD");
  assert.equal(selectOrderedReviewRoute({ primary, backup, primaryFailure: "malformed" }).status, "HOLD");
});

test("ordered Claude and Ollama routes are governed review models but cannot grant authority", () => {
  for (const model of ["qwen3:14b", "claude"]) {
    const fake = buildFakeReviewInput("PASS", "2026-07-18T12:00:00.000Z");
    const input = {
      operation: fake.operation,
      reviewRecord: fake.review,
      state: fake.state,
      authority: fake.authority,
      route: {
        available: true,
        mode: "metadata-only",
        provider: model === "claude" ? "claude" : "ollama",
        role: model === "claude" ? "primary-review" : "backup-review",
        fallbackUsed: model !== "claude",
        primaryFailure: model === "claude" ? undefined : "HTTP 429",
        executable: model === "claude" ? "claude" : undefined,
        cliMode: model === "claude" ? "print" : undefined,
        authenticated: model === "claude" ? true : undefined,
        maxBudgetUsd: model === "claude" ? 1 : undefined,
        allowedTools: model === "claude" ? ["Read", "Grep", "Glob"] : undefined,
        disallowedTools: model === "claude" ? ["Edit", "Write", "Bash", "WebFetch", "WebSearch"] : undefined,
        sourceScope: model === "claude" ? "named-evidence-only" : undefined,
        endpoint: model !== "claude" ? BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaEndpoint : undefined,
        sourceVm: model !== "claude" ? BOUNDED_ROUTE_POLICY_DEFAULTS.ollamaSourceVm : undefined,
        connectTimeoutSeconds: model !== "claude" ? 2 : undefined,
        totalTimeoutSeconds: model !== "claude" ? 120 : undefined,
        publicExposure: model !== "claude" ? false : undefined,
        credentialsRead: model !== "claude" ? false : undefined,
        modelDiscovery: model !== "claude" ? false : undefined,
        endpointDiscovery: model !== "claude" ? false : undefined,
        metadataOnly: true,
        rawPayloadRetained: false,
        reviewPass: false,
        activationAllowed: false,
        model: "5.6 Luna",
        effort: "high",
      },
      result: { status: "PASS", resultId: "result-route-policy", summary: "Bounded metadata-only review summary.", reviewedAt: "2026-07-18T12:00:00.000Z" },
      sourcePacket: { packetId: "packet-route-policy", sourceRefs: ["source:metadata-only"] },
    };
    input.route.model = model;
    input.route.rationale = `Explicitly approved ${model} ordered review route.`;
    input.reviewRecord.model = model;
    input.privateEvidencePacket = {
      packetId: `packet-${model.replaceAll(":", "-")}`,
      purpose: "bounded review of named work-item evidence",
      taskType: "review",
      dataClassification: "work-item-evidence",
      scopeRef: "work-item:route-policy",
      authorityEvidenceRef: "authority:operator-consent-2026-07-18",
      sourceClass: "work-item-evidence",
      sourceRefs: ["work-item:route-policy"],
      provider: model === "claude" ? "claude" : "ollama",
      routeRole: model === "claude" ? "primary-review" : "backup-review",
      fallbackUsed: model !== "claude",
      primaryFailure: model === "claude" ? undefined : "HTTP 429",
      endpoint: model === "claude" ? undefined : "http://192.168.1.128:11434/v1/chat/completions",
      model: model === "claude" ? undefined : "qwen3:14b",
      operatorConsent: true,
      boundaryExceptionVerified: true,
      platformDisclosureVeto: false,
      boundaryVerificationStatus: "verified",
      boundaryVerificationRef: "verify:route-policy",
      redactionApplied: true,
      redactionStatus: "applied",
      redactionRef: "redact:route-policy",
      forbiddenClassesPresent: false,
      broadDump: false,
      providerMemory: false,
      rawPayloadRetained: false,
      providerPayloadRetained: false,
      retentionMode: "metadata-only",
      contextBytes: 12000,
      contextDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      contextDigestAlgorithm: "sha256",
      expiresAt: "2026-07-18T13:00:00.000Z",
      revocationRef: "revoke:route-policy",
      revocationStatus: "active",
      revoked: false,
      rollbackRef: "rollback:route-policy",
      rollbackReady: true,
      destinationAllowlist: [model === "claude" ? "claude" : "ollama"],
      routeProof: model === "claude"
        ? { model: "claude", executable: "claude", mode: "print", authenticated: true, maxBudgetUsd: 1, allowedTools: ["Read", "Grep", "Glob"], disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"], sourceScope: "named-evidence-only", metadataOnly: true, rawPayloadRetained: false, reviewPass: false, activationAllowed: false }
        : { endpoint: "http://192.168.1.128:11434/v1/chat/completions", model: "qwen3:14b", sourceVm: "192.168.1.8", connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, metadataOnly: true, rawPayloadRetained: false, publicExposure: false, credentialsRead: false, modelDiscovery: false, endpointDiscovery: false, reviewPass: false, activationAllowed: false },
    };
    const packet = evaluateGovernedReadOnlyReview(input, { now: "2026-07-18T12:00:00.000Z" });
    assert.equal(packet.status, model === "claude" ? "eligible" : "hold", model);
    assert.equal(packet.authorityDecision.allowed, false);
  }
});

test("direct Ollama or Claude metadata cannot bypass ordered route provenance", () => {
  const fake = buildFakeReviewInput("PASS", "2026-07-18T12:00:00.000Z");
  const base = {
    operation: fake.operation, reviewRecord: fake.review, state: fake.state, authority: fake.authority,
    result: { status: "PASS", resultId: "result-direct-route", summary: "Bounded metadata-only review summary.", reviewedAt: "2026-07-18T12:00:00.000Z" },
    sourcePacket: { packetId: "packet-direct-route", sourceRefs: ["source:metadata-only"] },
  };
  for (const provider of ["claude", "ollama"]) {
    const packet = evaluateGovernedReadOnlyReview({
      ...base,
      route: { available: true, mode: "metadata-only", provider, model: provider === "claude" ? "claude" : "qwen3:14b", effort: "high", rationale: "Direct route without ordered selector provenance." },
    }, { now: "2026-07-18T12:00:00.000Z" });
    assert.equal(packet.status, "hold", provider);
    assert.ok(packet.blockers.some((blocker) => /ordered|primary|fallback/i.test(blocker)), provider);
  }
});

test("Claude route rejects broader tools, budget, scope, and authority claims", () => {
  for (const mutate of [
    (input) => { input.allowedTools = ["Read", "Bash"]; },
    (input) => { input.model = "gpt-5.6"; },
    (input) => { input.maxBudgetUsd = 1.01; },
    (input) => { input.sourceScope = "whole-repository"; },
    (input) => { input.activationAllowed = true; },
    (input) => { input.rawPayloadRetained = true; },
    (input) => { input.disallowedTools = "Bash"; },
    (input) => { input.providerPayload = "forbidden"; },
  ]) {
    const input = {
      role: "primary-review", provider: "claude", executable: "claude", mode: "print", authenticated: true,
      maxBudgetUsd: 1, allowedTools: ["Read", "Grep", "Glob"], sourceScope: "named-evidence-only",
      disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"], metadataOnly: true, rawPayloadRetained: false,
      reviewPass: false, activationAllowed: false,
    };
    mutate(input);
    const packet = evaluateBoundedReviewRoute(input);
    assert.equal(packet.status, "HOLD");
    assert.equal(packet.activationEligible, false);
  }
});
