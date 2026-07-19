import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePrivateEvidencePacket, PRIVATE_EVIDENCE_POLICY_DEFAULTS } from "../scripts/lib/private-evidence-packet-policy.mjs";

const NOW = "2026-07-18T20:00:00.000Z";

function valid(overrides = {}) {
  return {
    packetId: "packet-private-001",
    purpose: "bounded review of named work-item evidence",
    taskType: "review",
    dataClassification: "work-item-evidence",
    scopeRef: "work-item:alpha",
    authorityEvidenceRef: "authority:operator-consent-2026-07-18",
    sourceClass: "work-item-evidence",
    sourceRefs: ["work-item:alpha", "evidence:summary"],
    provider: "claude",
    routeRole: "primary-review",
    fallbackUsed: false,
    operatorConsent: true,
    boundaryExceptionVerified: true,
    platformDisclosureVeto: false,
    boundaryVerificationStatus: "verified",
    boundaryVerificationRef: "verify:private-evidence-boundary",
    redactionApplied: true,
    redactionStatus: "applied",
    redactionRef: "redact:packet-private-001",
    forbiddenClassesPresent: false,
    broadDump: false,
    providerMemory: false,
    rawPayloadRetained: false,
    providerPayloadRetained: false,
    retentionMode: "metadata-only",
    contextBytes: 24000,
    expiresAt: "2026-07-18T21:00:00.000Z",
    revocationRef: "revoke:packet-private-001",
    rollbackRef: "rollback:packet-private-001",
    destinationAllowlist: ["claude"],
    contextDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    contextDigestAlgorithm: "sha256",
    revocationStatus: "active",
    revoked: false,
    rollbackReady: true,
    routeProof: { model: "claude", executable: "claude", mode: "print", authenticated: true, maxBudgetUsd: 1, allowedTools: ["Read", "Grep", "Glob"], disallowedTools: ["Edit", "Write", "Bash", "WebFetch", "WebSearch"], sourceScope: "named-evidence-only", metadataOnly: true, rawPayloadRetained: false, reviewPass: false, activationAllowed: false },
    ...overrides,
  };
}

test("allows explicitly consented bounded private work-item evidence for Claude", () => {
  const packet = evaluatePrivateEvidencePacket(valid(), { now: NOW });
  assert.equal(packet.status, "READY");
  assert.equal(packet.sendEligible, true);
  assert.equal(packet.activationAllowed, false);
  assert.equal(packet.execution.providerCall, false);
});

test("requires the exact Ollama backup route and approved Claude failure", () => {
  const packet = evaluatePrivateEvidencePacket(valid({
    provider: "ollama",
    routeRole: "backup-review",
    fallbackUsed: true,
    primaryFailure: "HTTP 429",
    endpoint: "http://192.168.1.128:11434/v1/chat/completions",
    model: "qwen3:14b",
    destinationAllowlist: ["ollama"],
    contextDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    contextDigestAlgorithm: "sha256",
    revocationStatus: "active",
    revoked: false,
    rollbackReady: true,
    routeProof: { endpoint: "http://192.168.1.128:11434/v1/chat/completions", model: "qwen3:14b", sourceVm: "192.168.1.8", connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, metadataOnly: true, rawPayloadRetained: false, publicExposure: false, credentialsRead: false, modelDiscovery: false, endpointDiscovery: false, reviewPass: false, activationAllowed: false },
  }), { now: NOW });
  assert.equal(packet.status, "READY");
});

test("rejects Ollama destination and fallback metadata on Claude packets", () => {
  for (const key of ["endpoint", "model", "primaryFailure"]) {
    const packet = evaluatePrivateEvidencePacket(valid({ [key]: key === "primaryFailure" ? "HTTP 429" : "ollama-only" }), { now: NOW });
    assert.equal(packet.status, "HOLD", key);
    assert.ok(packet.blockers.some((blocker) => blocker.includes("Ollama destination")), key);
  }
});

test("holds forbidden classes, broad dumps, missing consent, and unsafe retention", () => {
  for (const mutate of [
    (input) => { input.forbiddenClassesPresent = true; },
    (input) => { input.broadDump = true; },
    (input) => { input.operatorConsent = false; },
    (input) => { input.sourceRefs = ["vault/private/credentials.md"]; },
    (input) => { input.providerMemory = true; },
    (input) => { input.contextBytes = PRIVATE_EVIDENCE_POLICY_DEFAULTS.maxContextBytes + 1; },
    (input) => { input.expiresAt = "2026-02-31T20:00:00.000Z"; },
  ]) {
    const input = valid();
    mutate(input);
    assert.equal(evaluatePrivateEvidencePacket(input, { now: NOW }).status, "HOLD");
  }
});

test("closes route-proof schema and rejects duplicate or undisclosed tools", () => {
  for (const mutate of [
    (input) => { input.routeProof.rawPayload = "forbidden"; },
    (input) => { input.routeProof.allowedTools = ["Read", "Read", "Glob"]; },
    (input) => { input.routeProof.allowedTools = ["Read", "Grep", "Glob", "Bash"]; },
  ]) {
    const input = valid();
    mutate(input);
    assert.equal(evaluatePrivateEvidencePacket(input, { now: NOW }).status, "HOLD");
  }
});

test("rejects invalid calendar timestamps instead of Date-normalizing them", () => {
  const input = valid({ expiresAt: "2026-02-31T20:00:00.000Z" });
  const packet = evaluatePrivateEvidencePacket(input, { now: NOW });
  assert.equal(packet.status, "HOLD");
  assert.ok(packet.blockers.some((blocker) => blocker.includes("expiresAt")));
});

test("requires trusted caller time and rejects separator-obfuscated sensitive markers", () => {
  const futureControlled = valid({ now: "2099-01-01T00:00:00.000Z", expiresAt: "2099-01-01T01:00:00.000Z" });
  assert.equal(evaluatePrivateEvidencePacket(futureControlled).status, "HOLD");
  const sensitive = valid({ purpose: "review raw/prompt metadata" });
  assert.equal(evaluatePrivateEvidencePacket(sensitive, { now: NOW }).status, "HOLD");
});

test("typed references require a non-empty suffix", () => {
  const input = valid({ authorityEvidenceRef: "authority:" });
  const packet = evaluatePrivateEvidencePacket(input, { now: NOW });
  assert.equal(packet.status, "HOLD");
  assert.ok(packet.blockers.some((blocker) => blocker.includes("authorityEvidenceRef")));
});
