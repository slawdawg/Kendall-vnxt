import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { evaluatePrivateEvidencePacket, PRIVATE_EVIDENCE_POLICY_DEFAULTS } from "../scripts/lib/private-evidence-packet-policy.mjs";

const NOW = "2026-07-18T20:00:00.000Z";
const activeAuthorityPolicy = JSON.parse(readFileSync(new URL("../docs/workflows/local-provider-authority-policy-v1.json", import.meta.url), "utf8"));
const authorityOnHold = activeAuthorityPolicy.status === "hold_conflicting_source_vm" && activeAuthorityPolicy.approvedSourceVm === null;
const authorityApproved = activeAuthorityPolicy.status === "approved" && typeof activeAuthorityPolicy.approvedSourceVm === "string";
const enablementApproved = activeAuthorityPolicy.enablement?.status === "approved";
const ollamaEligible = authorityApproved && enablementApproved;

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

test("active authority state governs exact Ollama backup packets", () => {
  assert.equal(authorityOnHold || authorityApproved, true);
  assert.equal(activeAuthorityPolicy.approvedSourceVm, authorityApproved ? "192.168.1.8" : null);
  for (const sourceVm of ["192.168.1.118", "192.168.1.8"]) {
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
      routeProof: { endpoint: "http://192.168.1.128:11434/v1/chat/completions", model: "qwen3:14b", sourceVm, connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, metadataOnly: true, rawPayloadRetained: false, publicExposure: false, credentialsRead: false, modelDiscovery: false, endpointDiscovery: false, reviewPass: false, activationAllowed: false },
    }), { now: NOW });
    const selected = ollamaEligible && sourceVm === activeAuthorityPolicy.approvedSourceVm;
    assert.equal(packet.status, selected ? "READY" : "HOLD", sourceVm);
    assert.equal(packet.sendEligible, selected, sourceVm);
    if (!selected) {
      assert.ok(
        packet.blockers.includes(
          authorityOnHold ? "ollama_authority_policy_unresolved" : enablementApproved ? "Ollama route proof is missing or outside the approved controls" : "ollama_enablement_authority_unresolved",
        ),
        sourceVm,
      );
    }
  }
});

test("long-lived private-evidence modules reload a revoked authority record for every decision", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "kendall-private-authority-policy-"));
  const policyDirectory = join(temporaryRoot, "docs", "workflows");
  const moduleDirectory = join(temporaryRoot, "scripts", "lib");
  const policyPath = join(policyDirectory, "local-provider-authority-policy-v1.json");
  const routeModulePath = join(moduleDirectory, "review-gated-low-risk-route-policy.mjs");
  const privateModulePath = join(moduleDirectory, "private-evidence-packet-policy.mjs");
  mkdirSync(policyDirectory, { recursive: true });
  mkdirSync(moduleDirectory, { recursive: true });
  copyFileSync(new URL("../scripts/lib/review-gated-low-risk-route-policy.mjs", import.meta.url), routeModulePath);
  copyFileSync(new URL("../scripts/lib/private-evidence-packet-policy.mjs", import.meta.url), privateModulePath);
  const approved = {
    schemaVersion: 1,
    authorityFamily: "local-provider-execution",
    status: "approved",
    approvedSourceVm: "192.168.1.8",
    candidateSourceVms: [
      { sourceVm: "192.168.1.118", claim: "accepted_operator_approval", provenanceRef: "docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md" },
      { sourceVm: "192.168.1.8", claim: "accepted_operator_successor_approval", provenanceRef: "docs/architecture/kendall-vnxt-local-provider-source-vm-approval-2026-08-15.md" },
    ],
    route: { endpoint: "http://192.168.1.128:11434/v1/chat/completions", model: "qwen3:14b", connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, retentionMode: "metadata-only" },
    defaults: { allowLocalProviderCalls: false, allowOllamaProviderCalls: false, allowAutomaticOllamaLocalEvidence: false },
    enablement: { status: "approved", claim: "accepted_operator_enablement_approval", provenanceRef: "docs/architecture/kendall-vnxt-local-provider-enablement-approval-v1.md", expiresAt: "2099-01-01T00:00:00Z" },
    decisionRequired: ["A reviewed successor is required before local-provider enablement."],
    stopLines: ["Do not make a provider call until enablement is reviewed."],
    rollback: {
      environment: {
        SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS: "false",
        SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS: "false",
        SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE: "false",
      },
      verification: "Confirm the disabled state and zero adapter calls.",
    },
  };
  const packet = valid({
    provider: "ollama", routeRole: "backup-review", fallbackUsed: true, primaryFailure: "HTTP 429",
    endpoint: approved.route.endpoint, model: approved.route.model, destinationAllowlist: ["ollama"],
    routeProof: { endpoint: approved.route.endpoint, model: approved.route.model, sourceVm: approved.approvedSourceVm, connectTimeoutSeconds: 2, totalTimeoutSeconds: 120, localHostVerified: true, localHostVerificationRef: "local-host:runtime-interface-attested", metadataOnly: true, rawPayloadRetained: false, publicExposure: false, credentialsRead: false, modelDiscovery: false, endpointDiscovery: false, reviewPass: false, activationAllowed: false },
  });
  try {
    writeFileSync(policyPath, JSON.stringify(approved), "utf8");
    const isolatedPolicy = await import(`${pathToFileURL(privateModulePath).href}?authority-reload=${Date.now()}`);
    assert.equal(isolatedPolicy.evaluatePrivateEvidencePacket(packet, { now: NOW }).status, "READY");
    writeFileSync(policyPath, JSON.stringify({ ...approved, status: "hold_conflicting_source_vm", approvedSourceVm: null }), "utf8");
    const revoked = isolatedPolicy.evaluatePrivateEvidencePacket(packet, { now: NOW });
    assert.equal(revoked.status, "HOLD");
    assert.ok(revoked.blockers.includes("ollama_authority_policy_unresolved"));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
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
