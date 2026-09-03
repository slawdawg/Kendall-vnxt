import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildHermesProfileManifest,
  evaluateHermesProfileCapability,
  validateMemoryContextProposal,
} from "../scripts/hermes-profile-bootstrap.mjs";

const profileRoot = mkdtempSync(join(tmpdir(), "hermes-profile-fixture-"));
for (const path of ["runtime", "developer", "reviewer", "artifacts"]) mkdirSync(join(profileRoot, path));
test.after(() => rmSync(profileRoot, { recursive: true, force: true }));

const input = Object.freeze({
  runtimeRoot: join(profileRoot, "runtime"),
  outcomeId: "outcome:3-2-profile-fixture",
  laneRunId: "lane-run:3-2-profile-fixture",
  developerWorkspace: join(profileRoot, "developer"),
  reviewerWorkspace: join(profileRoot, "reviewer"),
  artifactRoot: join(profileRoot, "artifacts"),
  policyDecision: Object.freeze({
    policyDecisionId: "policy-decision:3-2-profile-fixture",
    decision: "allowed",
    outcomeId: "outcome:3-2-profile-fixture",
    laneRunId: "lane-run:3-2-profile-fixture",
    schemaVersion: "policy_decision.v1",
    reasonCode: "ordinary_metadata_only",
    evidenceRefs: ["evidence:3-2-profile-fixture"],
    nextAction: "Render the bounded profile plan.",
    observedAt: "2026-09-02T00:00:00.000Z",
    idempotencyKey: "idempotency:3-2-profile-fixture",
    createdAt: "2026-09-02T00:00:00.000Z",
    metadataOnly: true,
    rawPayloadRetained: false,
  }),
});

test("renders exactly five distinct source-only role profiles with closed capabilities", () => {
  const result = buildHermesProfileManifest(input);
  assert.equal(result.status, "allowed");
  assert.deepEqual(result.manifest.roles.map((role) => role.name), ["Coordinator", "Developer", "Reviewer", "Delivery", "Memory"]);
  assert.equal(new Set(result.manifest.roles.map((role) => role.home)).size, 5);
  assert.equal(result.manifest.metadataOnly, true);
  assert.equal(result.manifest.rawPayloadRetained, false);
  const delivery = result.manifest.roles.find((role) => role.name === "Delivery");
  assert.equal(delivery.sourceMutationAllowed, false);
  assert.equal(delivery.networkAllowed, false);
  assert.equal(delivery.credentialAccessAllowed, false);
  assert.ok(delivery.blockedCapabilityIds.includes("source_edit"));
  assert.ok(delivery.blockedCapabilityIds.includes("github_direct"));
  const memory = result.manifest.roles.find((role) => role.name === "Memory");
  assert.equal(memory.contextMode, "cited_context_only");
  assert.ok(memory.blockedCapabilityIds.includes("raw_transcript_ingest"));
  const developer = result.manifest.roles.find((role) => role.name === "Developer");
  const reviewer = result.manifest.roles.find((role) => role.name === "Reviewer");
  assert.deepEqual(developer.writeRoots, [input.developerWorkspace]);
  assert.deepEqual(reviewer.writeRoots, []);
  assert.equal(developer.networkAllowed, false);
  assert.equal(developer.blockedCapabilityIds.includes("source_edit"), false);
  assert.equal(reviewer.networkAllowed, false);
  assert.ok(developer.forbiddenPaths.includes(".env"));
  assert.ok(reviewer.forbiddenPaths.includes("host-credential-store"));
  assert.equal(result.manifest.applyModeRequired, true);
});

test("fails closed on shared review/developer roots and renders only an auditable exception requirement", () => {
  const shared = buildHermesProfileManifest({ ...input, reviewerWorkspace: input.developerWorkspace });
  assert.equal(shared.status, "deniedPolicy");
  assert.equal(shared.reasonCode, "independent_reviewer_required");
  const exception = buildHermesProfileManifest({
    ...input,
    reviewerUnavailable: { exceptionId: "exception:reviewer-unavailable", reason: "capacity", riskClass: "medium", compensatingReviewRef: "evidence:later-review", recordedBy: "operator:fixture", recordedAt: "2026-09-02T00:00:00Z", reviewOrExpiryAt: "2026-09-03T00:00:00Z" },
  });
  assert.equal(exception.status, "blockedTechnical");
  assert.equal(exception.exceptionRequirement.approved, undefined);
  assert.equal(exception.exceptionRequirement.exceptionId, "exception:reviewer-unavailable");
  const unsafe = buildHermesProfileManifest({ ...input, reviewerUnavailable: { ...exception.exceptionRequirement, rawCredential: "must-not-be-retained" } });
  assert.equal(unsafe.status, "deniedPolicy");
  const secret = buildHermesProfileManifest({ ...input, reviewerUnavailable: { ...exception.exceptionRequirement, reason: "Bearer secret" } });
  assert.equal(secret.status, "deniedPolicy");
  const expired = buildHermesProfileManifest({ ...input, reviewerUnavailable: { ...exception.exceptionRequirement, reviewOrExpiryAt: "2026-09-01T00:00:00Z" } });
  assert.equal(expired.status, "deniedPolicy");
});

test("canonicalizes existing profile roots before reviewer isolation", (t) => {
  const root = mkdtempSync(join(tmpdir(), "hermes-profile-canonical-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const runtimeRoot = join(root, "runtime");
  const developerWorkspace = join(root, "developer");
  const reviewerWorkspace = join(root, "reviewer");
  const artifactRoot = join(root, "artifacts");
  for (const path of [runtimeRoot, developerWorkspace, reviewerWorkspace, artifactRoot]) mkdirSync(path);
  const reviewerAlias = join(root, "reviewer-alias");
  symlinkSync(developerWorkspace, reviewerAlias);
  const canonicalInput = { ...input, runtimeRoot, developerWorkspace, reviewerWorkspace, artifactRoot };
  assert.equal(buildHermesProfileManifest({ ...canonicalInput, reviewerWorkspace: reviewerAlias }).status, "deniedPolicy");
  const result = buildHermesProfileManifest(canonicalInput);
  assert.equal(result.status, "allowed");
  assert.deepEqual(result.manifest.roles.find((role) => role.name === "Developer").writeRoots, [developerWorkspace]);
});

test("denies profile requests with cost or real-user impact before side effect", () => {
  for (const classifierReason of ["spend_denied", "real_user_deployment_denied", "uncertain_external_impact_denied"]) {
    const result = buildHermesProfileManifest({ ...input, policyDecision: { ...input.policyDecision, decision: "deniedExternalImpact", reasonCode: classifierReason } });
    assert.equal(result.status, "deniedExternalImpact");
  }
  assert.equal(buildHermesProfileManifest({ ...input, requestedImpact: "ordinary" }).status, "deniedPolicy");
});

test("rejects broad roots and invalid time labels without creating a profile plan", () => {
  assert.equal(buildHermesProfileManifest({ ...input, runtimeRoot: "/" }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, developerWorkspace: "/" }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, artifactRoot: input.runtimeRoot }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, outcomeId: "secret bearer token" }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, policyDecision: { ...input.policyDecision, laneRunId: "lane-run:other" } }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, policyDecision: { ...input.policyDecision, impact: "spend" } }).status, "deniedPolicy");
  assert.equal(buildHermesProfileManifest({ ...input, policyDecision: { decision: "allowed", outcomeId: input.outcomeId, laneRunId: input.laneRunId, metadataOnly: true, rawPayloadRetained: false } }).status, "deniedPolicy");
  assert.equal(validateMemoryContextProposal({
    sourceRef: "docs/a",
    retrievedAt: "not-a-date",
    confidence: "high",
    reviewOrExpiryAt: "2026-09-03T00:00:00.000Z",
    revocationState: "active",
    accessScope: "source_owned_docs",
  }, "2026-09-02T12:00:00.000Z").status, "deniedPolicy");
});

test("returns bounded rework when Delivery attempts a source-changing capability", () => {
  for (const capabilityId of ["source_edit", "write_outside_metadata_scope"]) {
    const result = evaluateHermesProfileCapability({ role: "Delivery", capabilityId });
    assert.deepEqual(result, {
      status: "rework",
      reasonCode: "delivery_source_edit_denied",
      nextAction: "Return bounded source repair to the owning Developer lane.",
    });
  }
});

test("bootstrap stays a source-only plan with only the explicit read-only filesystem import", async () => {
  const source = await readFile(fileURLToPath(new URL("../scripts/hermes-profile-bootstrap.mjs", import.meta.url)), "utf8");
  assert.match(source, /^import \{ realpathSync, statSync \} from "node:fs";/m);
  for (const forbidden of ["node:child_process", "node:net", "node:fs/promises", "fetch(", "writeFile", "mkdir", "rmSync", "unlink", "spawn("]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("keeps Memory context cited, fresh, and revocable", () => {
  const accepted = validateMemoryContextProposal({
    sourceRef: "docs/workflows/hermes-autonomous-delivery.md#profiles",
    retrievedAt: "2026-09-02T00:00:00.000Z",
    confidence: "high",
    reviewOrExpiryAt: "2026-09-03T00:00:00.000Z",
    revocationState: "active",
    accessScope: "source_owned_docs",
  }, "2026-09-02T12:00:00.000Z");
  assert.equal(accepted.status, "allowed");
  assert.equal(accepted.contextMode, "cited_context_only");
  for (const proposal of [
    { sourceRef: "", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "high", reviewOrExpiryAt: "2026-09-03T00:00:00.000Z", revocationState: "active", accessScope: "source_owned_docs" },
    { sourceRef: "docs/a", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "high", reviewOrExpiryAt: "2026-09-01T00:00:00.000Z", revocationState: "active", accessScope: "source_owned_docs" },
    { sourceRef: "docs/a", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "high", reviewOrExpiryAt: "2026-09-03T00:00:00.000Z", revocationState: "revoked", accessScope: "source_owned_docs" },
    { sourceRef: "https://paid-memory.example/context", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "high", reviewOrExpiryAt: "2026-09-03T00:00:00.000Z", revocationState: "active", accessScope: "provider_payload" },
    { sourceRef: "docs/../../host-credential-store", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "high", reviewOrExpiryAt: "2026-09-03T00:00:00.000Z", revocationState: "active", accessScope: "source_owned_docs" },
    { sourceRef: "docs/a", retrievedAt: "2026-09-02T00:00:00.000Z", confidence: "Bearer secret", reviewOrExpiryAt: "2026-09-03T00:00:00.000Z", revocationState: "active", accessScope: "source_owned_docs" },
  ]) {
    assert.equal(validateMemoryContextProposal(proposal, "2026-09-02T12:00:00.000Z").status, "deniedPolicy");
  }
});
