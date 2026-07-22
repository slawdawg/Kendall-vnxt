import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDisclosurePacket,
  DISCLOSURE_PACKET_MAX_UTF8_BYTES,
  disclosurePacketUtf8Bytes,
  evaluateReviewRoute,
  isDisclosurePacketSizeAllowed,
  validateDisclosurePacket,
} from "../scripts/lib/manager-control-plane/core.mjs";

const NOW = "2026-07-22T12:00:00.000Z";
const EXACT_HEAD = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const EVIDENCE_REF = `evidence:sha256:${"c".repeat(64)}`;

function validInput(overrides = {}) {
  return {
    now: NOW,
    immutableReview: { executionJobId: "execution-job:review-35-1", exactHead: EXACT_HEAD, digest: DIGEST },
    authority: { issuerId: "operator", authorityRef: "authority:review-route-35-1", valid: true },
    routePolicy: {
      routeAllowlist: ["report_only", "simulated"],
      adapterAllowlist: ["none"],
      toolAllowlist: ["none"],
      policyState: "ready",
      capabilityState: "supported",
      resourceState: "ready",
    },
    disclosure: {
      disclosurePacketId: "disclosure-packet:review-35-1",
      issuedAt: "2026-07-22T11:55:00.000Z",
      expiresAt: "2026-07-22T12:30:00.000Z",
      routeAllowlist: ["report_only"],
      adapterAllowlist: ["none"],
      toolAllowlist: ["none"],
      evidenceRefs: [EVIDENCE_REF],
      revocationState: "active",
      cancellationState: "active",
      singleUse: true,
    },
    ...overrides,
  };
}

test("review route produces canonical report-only decision and metadata-only disclosure packet", () => {
  const result = evaluateReviewRoute(validInput());

  assert.equal(result.ok, true);
  assert.equal(result.decision.schemaVersion, "review-route-decision/v1");
  assert.equal(result.decision.state, "report_only");
  assert.equal(result.decision.execution, "none");
  assert.equal(result.decision.immutableReview.exactHead, EXACT_HEAD);
  assert.equal(result.decision.immutableReview.digest, DIGEST);
  assert.equal(result.decision.metadataOnly, true);
  assert.equal(result.decision.rawPayloadRetained, false);
  assert.equal(result.packet.schemaVersion, "disclosure-packet/v1");
  assert.equal(result.packet.issuance.singleUse, true);
  assert.equal(result.packet.scope.dataClass, "metadata_only");
  assert.equal(result.packet.metadataOnly, true);
  assert.equal(result.packet.rawPayloadRetained, false);
  assert.deepEqual(validateDisclosurePacket(result.packet, { now: NOW, routePolicy: validInput().routePolicy }), { ok: true, reasons: [] });
});

test("review route is deterministic and simulated stays non-executing", () => {
  const base = validInput();
  const input = { ...base, requestedState: "simulated", disclosure: { ...base.disclosure, routeAllowlist: ["simulated"] } };
  const first = evaluateReviewRoute(input);
  const second = evaluateReviewRoute(input);

  assert.deepEqual(first, second);
  assert.equal(first.decision.state, "simulated");
  assert.equal(first.decision.execution, "none");
  assert.match(first.decision.safeFallback.action, /report_only|re_evaluate/);
});

test("review route fails closed for veto, unsupported capability, resource blocks, expiry, revocation, cancellation, future packets, and reused packets", () => {
  const cases = [
    [validInput({ routePolicy: { ...validInput().routePolicy, policyState: "vetoed" } }), "policy_vetoed"],
    [validInput({ routePolicy: { ...validInput().routePolicy, capabilityState: "unsupported" } }), "capability_unsupported"],
    [validInput({ routePolicy: { ...validInput().routePolicy, resourceState: "blocked" } }), "resource_blocked"],
    [validInput({ disclosure: { ...validInput().disclosure, expiresAt: "2026-07-22T11:59:59.000Z" } }), "packet_expired"],
    [validInput({ disclosure: { ...validInput().disclosure, revocationState: "revoked" } }), "packet_revoked"],
    [validInput({ disclosure: { ...validInput().disclosure, cancellationState: "cancelled" } }), "packet_cancelled"],
    [validInput({ disclosure: { ...validInput().disclosure, issuedAt: "2026-07-22T12:02:00.000Z" } }), "packet_future"],
    [validInput({ consumedDisclosurePacketIds: ["disclosure-packet:review-35-1"] }), "packet_already_used"],
  ];

  for (const [input, expectedReason] of cases) {
    const result = evaluateReviewRoute(input);
    assert.equal(result.ok, false, expectedReason);
    assert.equal(result.decision.state, "blocked", expectedReason);
    assert.equal(result.decision.execution, "none", expectedReason);
    assert.equal(result.decision.controllingReason.code, expectedReason);
  }
});

test("disclosure validation rejects unsafe data, unknown fields, unapproved routes, authority failures, stale immutable identity, and UTF-8 oversize packets", () => {
  const packet = buildDisclosurePacket(validInput());
  const routePolicy = validInput().routePolicy;
  const invalids = [
    [{ ...packet, unexpected: true }, "unknown_field"],
    [{ ...packet, scope: { ...packet.scope, prompt: "no" } }, "forbidden_field"],
    [{ ...packet, routeAllowlist: ["unapproved-route"] }, "route_not_allowed"],
    [{ ...packet, authority: { ...packet.authority, valid: false } }, "authority_invalid"],
    [{ ...packet, immutableReview: { ...packet.immutableReview, exactHead: "c".repeat(40) } }, "immutable_identity_mismatch"],
    [{ ...packet, immutableReview: { ...packet.immutableReview, executionJobId: "execution-job:other" } }, "immutable_identity_mismatch"],
    [{ ...packet, scope: { ...packet.scope, evidenceRefs: ["evidence:é".repeat(9000)] } }, "packet_oversize"],
  ];

  for (const [candidate, expectedReason] of invalids) {
    const validation = validateDisclosurePacket(candidate, {
      now: NOW,
      routePolicy,
      immutableReview: { executionJobId: "execution-job:review-35-1", exactHead: EXACT_HEAD, digest: DIGEST },
    });
    assert.equal(validation.ok, false, expectedReason);
    assert.ok(validation.reasons.includes(expectedReason), `${expectedReason}: ${validation.reasons.join(", ")}`);
  }
});

test("review route rejects unsafe preparation input, live-capable allowlists, secret-like evidence, ambiguous clocks, and state mismatches", () => {
  const base = validInput();
  const cases = [
    [{ ...base, now: "2026-07-22T12:00:00+00:00" }, "now_invalid"],
    [{ ...base, disclosure: { ...base.disclosure, prompt: "no" } }, "forbidden_field"],
    [{ ...base, immutableReview: { ...base.immutableReview, prompt: "no" } }, "forbidden_field"],
    [{ ...base, authority: { ...base.authority, token: "no" } }, "forbidden_field"],
    [{ ...base, disclosure: { ...base.disclosure, revocationState: undefined } }, "packet_malformed"],
    [{ ...base, disclosure: { ...base.disclosure, routeAllowlist: ["live-route"] } }, "route_allowlist_invalid"],
    [{ ...base, disclosure: { ...base.disclosure, adapterAllowlist: ["live-adapter"] } }, "adapter_allowlist_invalid"],
    [{ ...base, disclosure: { ...base.disclosure, toolAllowlist: ["live-tool"] } }, "tool_allowlist_invalid"],
    [{ ...base, disclosure: { ...base.disclosure, evidenceRefs: ["evidence:sk-proj-abcdefghijklmnop"] } }, "forbidden_content"],
    [{ ...base, requestedState: "simulated" }, "requested_route_not_allowed"],
  ];
  for (const [input, expectedReason] of cases) {
    const result = evaluateReviewRoute(input);
    assert.equal(result.ok, false, expectedReason);
    assert.equal(result.decision.state, "blocked", expectedReason);
    assert.equal(result.decision.controllingReason.code, expectedReason);
  }
});

test("review route fails closed instead of throwing for malformed or coercion-hostile input", () => {
  const hostileIdentity = {
    executionJobId: { toString() { throw new Error("no coercion"); } },
    exactHead: EXACT_HEAD,
    digest: DIGEST,
  };
  for (const input of [null, { ...validInput(), immutableReview: hostileIdentity }]) {
    let result;
    assert.doesNotThrow(() => { result = evaluateReviewRoute(input); });
    assert.equal(result.ok, false);
    assert.equal(result.decision.state, "blocked");
    assert.equal(result.decision.controllingReason.code, "packet_malformed");
  }
});

test("disclosure validation rejects timezone-ambiguous and non-serializable packets without throwing", () => {
  const packet = buildDisclosurePacket(validInput());
  const noTimezone = { ...packet, issuance: { ...packet.issuance, issuedAt: "2026-07-22T11:55:00" } };
  const cyclic = { ...packet };
  cyclic.scope = { ...packet.scope, cyclic };
  for (const [candidate, expectedReason] of [[noTimezone, "issuance_invalid"], [cyclic, "packet_malformed"]]) {
    const result = validateDisclosurePacket(candidate, { now: NOW, routePolicy: validInput().routePolicy });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(expectedReason), `${expectedReason}: ${result.reasons.join(", ")}`);
  }
});

test("serialized disclosure ceiling accepts exactly 16 KiB and rejects 16 KiB plus one byte", () => {
  const base = { padding: "" };
  const exact = { padding: "x".repeat(DISCLOSURE_PACKET_MAX_UTF8_BYTES - disclosurePacketUtf8Bytes(base)) };
  const over = { padding: `${exact.padding}x` };
  assert.equal(disclosurePacketUtf8Bytes(exact), DISCLOSURE_PACKET_MAX_UTF8_BYTES);
  assert.equal(isDisclosurePacketSizeAllowed(exact), true);
  assert.equal(disclosurePacketUtf8Bytes(over), DISCLOSURE_PACKET_MAX_UTF8_BYTES + 1);
  assert.equal(isDisclosurePacketSizeAllowed(over), false);
});

test("review-route evaluator has no live adapter, child-process, network, or raw-retention import boundary", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../scripts/lib/manager-control-plane/review-route.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /node:child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|fetch\s*\(|https?:\/\/|OllamaProviderAdapter|get_local_evidence_explanation/i);
  assert.doesNotMatch(source, /raw(?:Prompt|Completion|Transcript)|providerPayload|reasoningTrace/i);
});
