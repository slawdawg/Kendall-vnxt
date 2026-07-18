import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePolicyActivationEligibility } from "../scripts/lib/review-gated-low-risk-policy-eligibility.mjs";

const now = "2026-07-17T12:00:00.000Z";

function validInput() {
  const state = {
    owner: "fake-owner",
    worktree: "/managed/fake-worktree",
    baseSha: "fake-base-123",
    headSha: "fake-head-456",
    diffHash: "fake-diff-789",
  };
  return {
    state,
    admission: {
      status: "READY",
      approved: true,
      ...state,
      approval: { approvedAt: now },
      evidence: { review: true, checks: true, rollback: true, exactHead: true },
      active: false,
      allowed: false,
      metadataOnly: true,
      execution: { attempted: false, applied: false, filesystemWrites: false, gitMutations: false, providerCalls: false, workerLaunch: false },
      authorityDecision: { allowed: false, active: false },
    },
    pilotResult: {
      completed: true,
      synthetic: false,
      status: "PASS",
      resultId: "pilot-result-1",
      completedAt: now,
      ...state,
    },
    retrospective: {
      accepted: true,
      reference: "retrospective:pilot-1",
      acceptedBy: "operator@example.test",
      acceptedAt: now,
    },
    policy: { explicit: true, mode: "standard-delivery", batchMode: "per-epic" },
  };
}

test("policy activation eligibility is separate and remains inactive", () => {
  const packet = evaluatePolicyActivationEligibility(validInput(), { now });
  assert.equal(packet.status, "READY");
  assert.equal(packet.eligible, true);
  assert.equal(packet.active, false);
  assert.equal(packet.allowed, false);
  assert.equal(packet.execution.mutation, "none");
  assert.equal(packet.metadataOnly, true);
});

test("policy activation holds missing, synthetic, stale, or mismatched post-pilot evidence", () => {
  for (const mutate of [
    (input) => { input.pilotResult.completed = false; },
    (input) => { input.pilotResult.synthetic = true; },
    (input) => { input.pilotResult.headSha = "other-head"; },
    (input) => { input.retrospective.accepted = false; },
    (input) => { input.policy.batchMode = "automatic"; },
    (input) => { input.pilotResult.completedAt = "2026-07-17T11:00:00.000Z"; },
    (input) => { input.pilotResult.provenance = "fixture"; },
    (input) => { input.pilotResult.evidenceClass = "readiness"; },
    (input) => { input.pilotResult.rawPrompt = "forbidden"; },
    (input) => { input.raw_prompt = "forbidden"; },
    (input) => { input.api_key = "forbidden"; },
    (input) => { input["access-token"] = "forbidden"; },
    (input) => { input.provider_payload = "forbidden"; },
    (input) => { input.pilotResult.note = "raw prompt TOPSECRET"; },
    (input) => { input.admission.approval = { approvedAt: "2026-07-17T11:00:00.000Z" }; },
    (input) => { input.admission.active = true; },
    (input) => { input.admission.execution = { attempted: true }; },
    (input) => { input.apiKeyValue = "opaque"; },
    (input) => { input.rawCompletionText = "opaque"; },
    (input) => { input.providerPayloadObject = "opaque"; },
    (input) => { input.secretBlob = "opaque"; },
    (input) => { input.apiKeyMaterial = "opaque"; },
    (input) => { input.tokenValue2 = "opaque"; },
    (input) => { input.promptResult = "opaque"; },
    (input) => { input.credentialStore = "opaque"; },
    (input) => { input.authorizationHeader = "opaque"; },
    (input) => { input.accessKey = "opaque"; },
    (input) => { input.authToken = "opaque"; },
    (input) => { input.sessionToken = "opaque"; },
    (input) => { input.oauthToken = "opaque"; },
    (input) => { input.clientSecret = "opaque"; },
    (input) => { input.encryptionKey = "opaque"; },
    (input) => { input.signingKey = "opaque"; },
  ]) {
    const input = validInput();
    mutate(input);
    const packet = evaluatePolicyActivationEligibility(input, { now });
    assert.equal(packet.status, "HOLD");
    assert.equal(packet.allowed, false);
  }
});

test("policy activation redacts sensitive binding values", () => {
  const input = validInput();
  input.state.owner = "secret token TOPSECRET";
  const packet = evaluatePolicyActivationEligibility(input, { now });
  assert.doesNotMatch(JSON.stringify(packet), /TOPSECRET/);
  assert.equal(packet.metadataOnly, true);
});

test("policy activation requires a bound prior admission checkpoint", () => {
  const input = validInput();
  delete input.admission;
  const packet = evaluatePolicyActivationEligibility(input, { now });
  assert.equal(packet.status, "HOLD");
  assert.match(packet.blockers.join("; "), /prior approved pilot-admission/);
});
