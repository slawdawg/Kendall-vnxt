import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDisclosurePacket,
  DISCLOSURE_PACKET_MAX_UTF8_BYTES,
  disclosurePacketCanonicalDigest,
  disclosurePacketUtf8Bytes,
  evaluateReviewRoute,
  evaluateSimulatedReview,
  isDisclosurePacketSizeAllowed,
  selectCanonicalReviewFallback,
  validateDisclosurePacket,
} from "../scripts/lib/manager-control-plane/core.mjs";
import {
  APPROVED_OLLAMA_ENDPOINT_REF,
  APPROVED_OLLAMA_MODEL_REF,
  CLAUDE_READONLY_ARGV,
  createReviewExecutionLedger,
  executeInjectedReview,
} from "../scripts/lib/manager-control-plane/review-executor.mjs";

const NOW = "2026-07-22T12:00:00.000Z";
const EXACT_HEAD = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const EVIDENCE_REF = `evidence:sha256:${"c".repeat(64)}`;
const REVIEW_PATH = "packages/contracts/src/manager-control-plane/review-route.ts";
const REVIEW_TEXT = "sanitized transient diff body";
const REVIEW_DIFF_DIGEST = `sha256:${createHash("sha256").update(REVIEW_TEXT).digest("hex")}`;

function transientFiles(text = REVIEW_TEXT) {
  return [{ path: REVIEW_PATH, text }];
}

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
  assert.equal(result.decision.schemaVersion, "review-route-decision/v2");
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

test("sanitized path-scoped private-diff packets retain only paths and digests", () => {
  const input = validInput({
    disclosure: {
      ...validInput().disclosure,
      dataClass: "sanitized_path_scoped_private_diff",
      pathScope: [{ path: "services/supervisor/src/supervisor/application/service.py", diffDigest: `sha256:${"d".repeat(64)}` }],
    },
  });
  const result = evaluateReviewRoute(input);
  assert.equal(result.ok, true);
  assert.equal(result.packet.scope.dataClass, "sanitized_path_scoped_private_diff");
  assert.deepEqual(result.packet.scope.pathScope, input.disclosure.pathScope);
  assert.equal(result.packet.metadataOnly, true);
  assert.equal(result.packet.rawPayloadRetained, false);

  for (const pathScope of [
    [],
    [{ path: "../outside.patch", diffDigest: `sha256:${"d".repeat(64)}` }],
    [{ path: ".env", diffDigest: `sha256:${"d".repeat(64)}` }],
    [{ path: "services/.env.production", diffDigest: `sha256:${"d".repeat(64)}` }],
    [{ path: "fixtures/.git/config", diffDigest: `sha256:${"d".repeat(64)}` }],
    [{ path: "docs/safe.md", diffDigest: "diff body must never be retained" }],
  ]) {
    const rejected = evaluateReviewRoute(validInput({ disclosure: { ...input.disclosure, pathScope } }));
    assert.equal(rejected.ok, false);
  }
});

test("canonical review fallback selects Claude, exact Ollama, then bounded BMAD without execution", () => {
  const ready = { claude: { state: "ready" }, ollama: { state: "ready", exactApprovedGate: true, reviewApproval: true }, bmad: { state: "ready", boundedScope: true } };
  const claude = selectCanonicalReviewFallback(ready);
  assert.equal(claude.selectedRouteId, "claude_readonly");
  assert.equal(claude.execution, "none");

  const ollama = selectCanonicalReviewFallback({ ...ready, claude: { state: "tenant_policy_vetoed" } });
  assert.equal(ollama.selectedRouteId, "ollama_exact");
  assert.deepEqual(ollama.skippedRouteIds, ["claude_readonly"]);
  assert.equal(ollama.execution, "none");

  const bmad = selectCanonicalReviewFallback({ ...ready, claude: { state: "unavailable" }, ollama: { state: "review_dispatch_not_implemented", exactApprovedGate: true, reviewApproval: false } });
  assert.equal(bmad.selectedRouteId, "bmad_local");
  assert.equal(bmad.execution, "none");

  const blocked = selectCanonicalReviewFallback({ ...ready, claude: { state: "tenant_policy_vetoed" }, ollama: { state: "approval_missing", exactApprovedGate: true, reviewApproval: false }, bmad: { state: "unavailable", boundedScope: false } });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.controllingReason.code, "review_unsatisfied");
});

function injectedExecutionInput(routeId, overrides = {}) {
  const base = validInput();
  const adapterId = routeId === "claude_readonly" ? "claude-readonly-injected/v1" : "ollama-exact-injected/v1";
  const toolAllowlist = routeId === "claude_readonly" ? ["Read", "Grep"] : ["none"];
  const packet = buildDisclosurePacket({
    ...base,
    disclosure: {
      ...base.disclosure,
      disclosurePacketId: `disclosure-packet:${routeId}-35-1`,
      routeAllowlist: [routeId],
      adapterAllowlist: [adapterId],
      toolAllowlist,
      dataClass: "sanitized_path_scoped_private_diff",
      pathScope: [{ path: REVIEW_PATH, diffDigest: REVIEW_DIFF_DIGEST }],
    },
  });
  return {
    now: NOW,
    routePolicy: { ...base.routePolicy, routeAllowlist: [routeId], adapterAllowlist: [adapterId], toolAllowlist },
    packet,
    fallbackDecision: selectCanonicalReviewFallback(routeId === "claude_readonly"
      ? { claude: { state: "ready" }, ollama: { state: "ready", exactApprovedGate: true, reviewApproval: true }, bmad: { state: "ready", boundedScope: true } }
      : { claude: { state: "tenant_policy_vetoed" }, ollama: { state: "ready", exactApprovedGate: true, reviewApproval: true }, bmad: { state: "ready", boundedScope: true } }),
    currentImmutableReview: base.immutableReview,
    ledger: createReviewExecutionLedger(),
    approval: {
      status: "accepted",
      authorityRef: base.authority.authorityRef,
      disclosurePacketId: packet.disclosurePacketId,
      exactHead: EXACT_HEAD,
      reviewScope: "sanitized_path_scoped_private_diff",
      ...(routeId === "claude_readonly" ? { tenantPolicy: "approved" } : {}),
    },
    ollamaExactGate: { enabled: true, endpointApproved: true, modelApproved: true, endpointRef: APPROVED_OLLAMA_ENDPOINT_REF, modelRef: APPROVED_OLLAMA_MODEL_REF },
    ...overrides,
  };
}

test("injected Claude executor uses fixed argv-only Read/Grep scope and retains no transient diff", async () => {
  let invocation = null;
  const privateBody = REVIEW_TEXT;
  const result = await executeInjectedReview(injectedExecutionInput("claude_readonly", {
    transientDiffMaterializer: async () => transientFiles(privateBody),
    adapter: {
      adapterId: "claude-readonly-injected/v1",
      execute: async (received) => {
        invocation = received;
        assert.equal(received.transientDiff[0].text, privateBody);
        return { status: "completed", findingCount: 2 };
      },
    },
  }));

  assert.deepEqual(invocation.argv, CLAUDE_READONLY_ARGV);
  assert.deepEqual(invocation.allowedTools, ["Read", "Grep"]);
  assert.equal(invocation.argv.includes("--max-budget-usd"), false);
  assert.equal(Object.hasOwn(invocation, "shell"), false);
  assert.deepEqual(invocation.transientScope.pathScope, [{ path: REVIEW_PATH, diffDigest: REVIEW_DIFF_DIGEST }]);
  assert.equal(result.terminal.state, "review_satisfied");
  assert.equal(result.terminal.rawPayloadRetained, false);
  assert.equal(result.terminal.deliveryEvidenceEligible, false);
  assert.equal(result.ledger.revision, 1);
  assert.equal(result.ledger.records[0].consumed, true);
  assert.equal(JSON.stringify(result).includes(privateBody), false);
  assert.deepEqual(result.atomicCommit, { expectedRevision: 0, nextRevision: 1 });
});

test("injected exact Ollama fallback binds review approval and compact exact gate facts", async () => {
  const selection = selectCanonicalReviewFallback({
    claude: { state: "tenant_policy_vetoed" },
    ollama: { state: "ready", exactApprovedGate: true, reviewApproval: true },
    bmad: { state: "ready", boundedScope: true },
  });
  let invocation = null;
  const result = await executeInjectedReview(injectedExecutionInput("ollama_exact", {
    fallbackDecision: selection,
    transientDiffMaterializer: async () => transientFiles(),
    adapter: {
      adapterId: "ollama-exact-injected/v1",
      execute: async (received) => {
        invocation = received;
        return { status: "completed", findingCount: 0 };
      },
    },
  }));

  assert.equal(result.terminal.state, "review_satisfied");
  assert.equal(invocation.argv, null);
  assert.deepEqual(invocation.allowedTools, []);
  assert.deepEqual(invocation.exactGate, { endpointRef: APPROVED_OLLAMA_ENDPOINT_REF, modelRef: APPROVED_OLLAMA_MODEL_REF });
  assert.equal(result.ledger.records[0].adapterId, "ollama-exact-injected/v1");

  const rejected = await executeInjectedReview(injectedExecutionInput("ollama_exact", {
    fallbackDecision: selection,
    approval: { ...injectedExecutionInput("ollama_exact").approval, disclosurePacketId: "disclosure-packet:other" },
    transientDiffMaterializer: async () => transientFiles(),
    adapter: { adapterId: "ollama-exact-injected/v1", execute: async () => ({ status: "completed", findingCount: 0 }) },
  }));
  assert.equal(rejected.terminal.state, "review_unsatisfied");
  assert.equal(rejected.terminal.code, "ollama_review_gate_invalid");

  const forged = await executeInjectedReview(injectedExecutionInput("ollama_exact", {
    fallbackDecision: { ...selection, skippedRouteIds: [], controllingReason: { ...selection.controllingReason } },
    transientDiffMaterializer: async () => transientFiles(),
    adapter: { adapterId: "ollama-exact-injected/v1", execute: async () => ({ status: "completed", findingCount: 0 }) },
  }));
  assert.equal(forged.terminal.code, "fallback_decision_invalid");

  const unpinned = await executeInjectedReview(injectedExecutionInput("ollama_exact", {
    fallbackDecision: selection,
    ollamaExactGate: { enabled: true, endpointApproved: true, modelApproved: true, endpointRef: "ollama-endpoint:other", modelRef: APPROVED_OLLAMA_MODEL_REF },
    transientDiffMaterializer: async () => transientFiles(),
    adapter: { adapterId: "ollama-exact-injected/v1", execute: async () => ({ status: "completed", findingCount: 0 }) },
  }));
  assert.equal(unpinned.terminal.code, "ollama_review_gate_invalid");
});

test("injected executor atomically records stale, failed, and inconclusive outcomes as non-deliverable", async () => {
  let staleCalls = 0;
  const stale = await executeInjectedReview(injectedExecutionInput("claude_readonly", {
    currentImmutableReview: { executionJobId: "execution-job:review-35-1", exactHead: "e".repeat(40), digest: DIGEST },
    transientDiffMaterializer: async () => transientFiles(),
    adapter: { adapterId: "claude-readonly-injected/v1", execute: async () => { staleCalls += 1; return { status: "completed", findingCount: 0 }; } },
  }));
  assert.equal(stale.terminal.state, "stale");
  assert.equal(stale.ledger.records[0].consumed, false);
  assert.equal(staleCalls, 0);

  for (const status of ["failed", "inconclusive"]) {
    const result = await executeInjectedReview(injectedExecutionInput("claude_readonly", {
      transientDiffMaterializer: async () => transientFiles(),
      adapter: { adapterId: "claude-readonly-injected/v1", execute: async () => ({ status, findingCount: 0 }) },
    }));
    assert.equal(result.terminal.state, "review_unsatisfied");
    assert.equal(result.terminal.deliveryEvidenceEligible, false);
    assert.equal(result.terminal.rawPayloadRetained, false);
    assert.equal(result.ledger.records[0].consumed, true);
  }

  const staleLedger = createReviewExecutionLedger();
  const revisionConflict = await executeInjectedReview(injectedExecutionInput("claude_readonly", {
    ledger: staleLedger,
    expectedLedgerRevision: 1,
    transientDiffMaterializer: async () => transientFiles(),
    adapter: { adapterId: "claude-readonly-injected/v1", execute: async () => ({ status: "completed", findingCount: 0 }) },
  }));
  assert.equal(revisionConflict.terminal.code, "ledger_revision_stale");
  assert.equal(revisionConflict.ledger, null);
});

test("injected executor rejects a transient body that is not digest-bound to its packet", async () => {
  const result = await executeInjectedReview(injectedExecutionInput("claude_readonly", {
    transientDiffMaterializer: async () => transientFiles("different body"),
    adapter: { adapterId: "claude-readonly-injected/v1", execute: async () => ({ status: "completed", findingCount: 0 }) },
  }));
  assert.equal(result.terminal.code, "transient_scope_invalid");
  assert.equal(result.terminal.state, "review_unsatisfied");
});

test("injected executor remains an unbound gateway with no live provider import", async () => {
  const source = await readFile(new URL("../scripts/lib/manager-control-plane/review-executor.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*node:(?:child_process|http|https|net|tls)/m);
  assert.doesNotMatch(source, /^import .*supervisor/m);
  assert.doesNotMatch(source, /^import .*dashboard/m);
  assert.match(source, /injected review adapter/);
  assert.match(source, /atomically replace the returned/);
});

test("review route accepts bounded source-bearing metadata IDs while still rejecting credential-like IDs", () => {
  const base = validInput();
  const sourceMetadata = validInput({
    immutableReview: { ...base.immutableReview, executionJobId: "execution-job:source-work-eligible" },
    authority: { ...base.authority, authorityRef: "authority:source-work-eligible" },
    disclosure: { ...base.disclosure, disclosurePacketId: "disclosure-packet:source-work-eligible" },
  });
  const result = evaluateReviewRoute(sourceMetadata);

  assert.equal(result.ok, true);
  assert.equal(result.packet.disclosurePacketId, "disclosure-packet:source-work-eligible");
  assert.deepEqual(validateDisclosurePacket(result.packet, { now: NOW, routePolicy: sourceMetadata.routePolicy }), { ok: true, reasons: [] });

  const credentialLike = evaluateReviewRoute(validInput({
    immutableReview: { ...base.immutableReview, executionJobId: "execution-job:ghp-abcdefghijklmnop" },
  }));
  assert.equal(credentialLike.ok, false);
  assert.equal(credentialLike.decision.controllingReason.code, "forbidden_content");

  for (const sensitiveMetadata of [
    validInput({ immutableReview: { ...base.immutableReview, executionJobId: "execution-job:prompt-work-eligible" } }),
    validInput({ authority: { ...base.authority, authorityRef: "authority:secret-work-eligible" } }),
    validInput({ disclosure: { ...base.disclosure, disclosurePacketId: "disclosure-packet:customer-work-eligible" } }),
  ]) {
    const sensitiveResult = evaluateReviewRoute(sensitiveMetadata);
    assert.equal(sensitiveResult.ok, false);
    assert.equal(sensitiveResult.decision.controllingReason.code, "forbidden_content");
  }
});

test("simulated route preserves the same narrow source metadata identifier contract", () => {
  const base = validInput();
  const sourceMetadata = validInput({
    requestedState: "simulated",
    immutableReview: { ...base.immutableReview, executionJobId: "execution-job:source-work-eligible" },
    authority: { ...base.authority, authorityRef: "authority:source-work-eligible" },
    routePolicy: { ...base.routePolicy, adapterAllowlist: ["none", "simulated-review-fixture/v1"] },
    disclosure: {
      ...base.disclosure,
      disclosurePacketId: "disclosure-packet:source-work-eligible",
      routeAllowlist: ["simulated"],
      adapterAllowlist: ["simulated-review-fixture/v1"],
    },
  });
  const preparation = evaluateReviewRoute(sourceMetadata);
  assert.equal(preparation.ok, true);

  const result = evaluateSimulatedReview({
    packet: preparation.packet,
    decision: preparation.decision,
    now: NOW,
    routePolicy: sourceMetadata.routePolicy,
    currentImmutableReview: sourceMetadata.immutableReview,
  });
  assert.equal(result.state, "completed");
  assert.equal(result.reviewedHead, EXACT_HEAD);
  assert.equal(result.execution, "none");
});

test("direct packet builder requires explicit issuance state before validation", () => {
  const base = validInput();
  const incompleteDisclosure = { ...base.disclosure };
  delete incompleteDisclosure.revocationState;
  delete incompleteDisclosure.cancellationState;
  delete incompleteDisclosure.singleUse;

  const packet = buildDisclosurePacket({ ...base, disclosure: incompleteDisclosure });
  assert.equal(packet.issuance.revocationState, undefined);
  assert.equal(packet.issuance.cancellationState, undefined);
  assert.equal(packet.issuance.singleUse, undefined);
  const validation = validateDisclosurePacket(packet, { now: NOW, routePolicy: base.routePolicy });
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes("issuance_invalid"));
  assert.ok(validation.reasons.includes("single_use_required"));
});

test("review route is deterministic and simulated stays non-executing", () => {
  const base = validInput();
  const input = {
    ...base,
    requestedState: "simulated",
    routePolicy: { ...base.routePolicy, adapterAllowlist: ["none", "simulated-review-fixture/v1"] },
    disclosure: { ...base.disclosure, routeAllowlist: ["simulated"], adapterAllowlist: ["simulated-review-fixture/v1"] },
  };
  const first = evaluateReviewRoute(input);
  const second = evaluateReviewRoute(input);

  assert.deepEqual(first, second);
  assert.equal(first.decision.state, "simulated");
  assert.equal(first.decision.execution, "none");
  assert.match(first.decision.safeFallback.action, /report_only|re_evaluate/);
});

function simulatedInput(overrides = {}) {
  const base = validInput();
  const preparation = evaluateReviewRoute({
    ...base,
    requestedState: "simulated",
    routePolicy: { ...base.routePolicy, adapterAllowlist: ["none", "simulated-review-fixture/v1"] },
    disclosure: { ...base.disclosure, routeAllowlist: ["simulated"], adapterAllowlist: ["simulated-review-fixture/v1"] },
  });
  return {
    packet: preparation.packet,
    decision: preparation.decision,
    now: NOW,
    routePolicy: { ...base.routePolicy, adapterAllowlist: ["none", "simulated-review-fixture/v1"] },
    currentImmutableReview: base.immutableReview,
    ...overrides,
  };
}

test("simulated adapter returns a deterministic metadata-only normalized finding", () => {
  const first = evaluateSimulatedReview(simulatedInput());
  const second = evaluateSimulatedReview(simulatedInput());

  assert.deepEqual(first, second);
  assert.equal(first.state, "completed");
  assert.equal(first.code, "simulated_completed");
  assert.equal(first.execution, "none");
  assert.equal(first.deliveryEvidenceEligible, false);
  assert.equal(first.findings.length, 1);
  assert.equal(first.disclosurePacketId, "disclosure-packet:review-35-1");
  assert.match(first.decisionId, /^review-route-decision:sha256:/);
  const prepared = simulatedInput();
  assert.equal(prepared.decision.disclosurePacketDigest, disclosurePacketCanonicalDigest(prepared.packet));
  assert.equal(first.disclosurePacketDigest, prepared.decision.disclosurePacketDigest);
  assert.deepEqual(Object.keys(first.findings[0]).sort(), ["digest", "findingId", "lineOrRange", "pathOrRef", "remediation", "reviewedHead", "rule", "schemaVersion", "severity", "summary"].sort());
  assert.equal(first.findings[0].reviewedHead, EXACT_HEAD);
  assert.equal(first.findings[0].digest, DIGEST);
});

test("simulated adapter marks changed identity stale and deduplicates only its exact key", () => {
  const first = evaluateSimulatedReview(simulatedInput());
  const deduplicated = evaluateSimulatedReview(simulatedInput({ priorFindings: first.findings }));
  assert.equal(deduplicated.state, "completed");
  assert.equal(deduplicated.code, "simulated_deduplicated");
  assert.deepEqual(deduplicated.findings, []);

  const distinct = { ...first.findings[0], lineOrRange: "2" };
  distinct.findingId = `normalized-finding:sha256:${createHash("sha256").update(`${distinct.reviewedHead}:${distinct.digest}:${distinct.pathOrRef}:${distinct.lineOrRange}:${distinct.rule}`).digest("hex")}`;
  const distinctResult = evaluateSimulatedReview(simulatedInput({ priorFindings: [distinct] }));
  assert.equal(distinctResult.state, "completed");
  assert.equal(distinctResult.findings.length, 1);

  const stale = evaluateSimulatedReview(simulatedInput({ currentImmutableReview: { ...validInput().immutableReview, exactHead: "d".repeat(40) } }));
  assert.equal(stale.state, "stale");
  assert.equal(stale.code, "immutable_identity_stale");
  assert.equal(stale.deliveryEvidenceEligible, false);
  assert.deepEqual(stale.findings, []);
});

test("simulated adapter returns typed no-findings fallback without execution", () => {
  const cases = [
    [{ fallback: "timeout" }, "simulation_timeout"],
    [{ routePolicy: { ...simulatedInput().routePolicy, policyState: "vetoed" } }, "policy_vetoed"],
    [{ routePolicy: { ...simulatedInput().routePolicy, capabilityState: "unsupported" } }, "capability_unsupported"],
    [{ routePolicy: { ...simulatedInput().routePolicy, resourceState: "blocked" } }, "resource_blocked"],
  ];
  for (const [overrides, code] of cases) {
    const result = evaluateSimulatedReview(simulatedInput(overrides));
    assert.equal(result.state, "blocked");
    assert.equal(result.code, code);
    assert.deepEqual(result.findings, []);
    assert.equal(result.deliveryEvidenceEligible, false);
    assert.equal(result.execution, "none");
  }
});

test("simulated adapter rejects malformed identities and duplicate finding keys", () => {
  const first = evaluateSimulatedReview(simulatedInput());
  const duplicate = evaluateSimulatedReview(simulatedInput({ priorFindings: [first.findings[0], { ...first.findings[0], findingId: "normalized-finding:duplicate" }] }));
  assert.equal(duplicate.state, "blocked");
  assert.equal(duplicate.findings.length, 0);
  const hostile = new Proxy(simulatedInput(), { getOwnPropertyDescriptor() { throw new Error("trap"); } });
  assert.equal(evaluateSimulatedReview(hostile).state, "blocked");
  let descriptorReads = 0;
  const stateful = new Proxy(simulatedInput(), {
    getOwnPropertyDescriptor(target, key) {
      descriptorReads += 1;
      if (descriptorReads > 12) throw new Error("late trap");
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const statefulResult = evaluateSimulatedReview(stateful);
  assert.equal(statefulResult.state, "blocked");
  assert.equal(statefulResult.code, "decision_invalid");
  let serialized = false;
  const hookedFinding = { ...first.findings[0], toJSON() { serialized = true; return {}; } };
  assert.equal(evaluateSimulatedReview(simulatedInput({ priorFindings: [hookedFinding] })).state, "blocked");
  assert.equal(serialized, false);
});

test("simulated adapter binds canonical simulated authority and supplied one-time consumption", () => {
  const prepared = simulatedInput();
  const reportOnly = evaluateReviewRoute(validInput());
  const forged = evaluateSimulatedReview({ ...prepared, packet: reportOnly.packet, decision: { ...prepared.decision, disclosurePacketId: reportOnly.packet.disclosurePacketId } });
  assert.equal(forged.state, "blocked");
  assert.equal(forged.code, "decision_invalid");

  const forgedScopePacket = {
    ...prepared.packet,
    scope: { ...prepared.packet.scope, evidenceRefs: [`evidence:sha256:${"e".repeat(64)}`] },
  };
  const forgedScope = evaluateSimulatedReview({ ...prepared, packet: forgedScopePacket });
  assert.equal(forgedScope.state, "blocked");
  assert.equal(forgedScope.code, "decision_invalid");

  let digestHookCalled = false;
  const hookedPacket = { ...prepared.packet, toJSON() { digestHookCalled = true; return {}; } };
  assert.equal(disclosurePacketCanonicalDigest(hookedPacket), null);
  assert.equal(digestHookCalled, false);

  let nestedGetterCalled = false;
  const nestedPacket = { ...prepared.packet, scope: { ...prepared.packet.scope } };
  Object.defineProperty(nestedPacket.scope, "evidenceRefs", {
    enumerable: true,
    get() { nestedGetterCalled = true; return prepared.packet.scope.evidenceRefs; },
  });
  const nestedResult = evaluateSimulatedReview({ ...prepared, packet: nestedPacket });
  assert.equal(nestedResult.state, "blocked");
  assert.equal(nestedResult.code, "decision_invalid");
  assert.equal(nestedGetterCalled, false);

  let policyGetterCalled = false;
  const nestedPolicy = { ...prepared.routePolicy };
  Object.defineProperty(nestedPolicy, "routeAllowlist", {
    enumerable: true,
    get() { policyGetterCalled = true; return prepared.routePolicy.routeAllowlist; },
  });
  const policyResult = evaluateSimulatedReview({ ...prepared, routePolicy: nestedPolicy });
  assert.equal(policyResult.state, "blocked");
  assert.equal(policyResult.code, "decision_invalid");
  assert.equal(policyGetterCalled, false);

  for (const field of ["consumedDisclosurePacketIds", "priorFindings"]) {
    let arrayGetterCalled = false;
    const accessorArray = [];
    Object.defineProperty(accessorArray, "0", {
      enumerable: true,
      get() { arrayGetterCalled = true; return field === "priorFindings" ? first.findings[0] : "disclosure-packet:consumed"; },
    });
    const accessorResult = evaluateSimulatedReview(simulatedInput({ [field]: accessorArray }));
    assert.equal(accessorResult.state, "blocked");
    assert.equal(accessorResult.code, "decision_invalid");
    assert.equal(arrayGetterCalled, false);
  }

  for (const [field, entries] of [["consumedDisclosurePacketIds", ["disclosure-packet:consumed"]], ["priorFindings", []]]) {
    let proxyGetCalled = false;
    const proxyArray = new Proxy(entries, {
      get(target, key, receiver) { proxyGetCalled = true; return Reflect.get(target, key, receiver); },
    });
    const proxyResult = evaluateSimulatedReview(simulatedInput({ [field]: proxyArray }));
    assert.equal(proxyResult.state, "completed");
    assert.equal(proxyGetCalled, false);
  }

  let priorFindingGetCalled = false;
  const proxyFinding = new Proxy(evaluateSimulatedReview(simulatedInput()).findings[0], {
    get(target, key, receiver) { priorFindingGetCalled = true; return Reflect.get(target, key, receiver); },
  });
  const proxyFindingResult = evaluateSimulatedReview(simulatedInput({ priorFindings: [proxyFinding] }));
  assert.equal(proxyFindingResult.state, "completed");
  assert.equal(proxyFindingResult.code, "simulated_deduplicated");
  assert.equal(priorFindingGetCalled, false);

  const consumed = evaluateSimulatedReview(simulatedInput({ consumedDisclosurePacketIds: [prepared.packet.disclosurePacketId] }));
  assert.equal(consumed.state, "blocked");
  assert.equal(consumed.code, "packet_already_used");
  assert.deepEqual(consumed.findings, []);

  const first = evaluateSimulatedReview(simulatedInput());
  const altered = { ...first.findings[0], summary: "Different bounded text." };
  const result = evaluateSimulatedReview(simulatedInput({ priorFindings: [altered] }));
  assert.equal(result.state, "blocked");
  assert.equal(result.findings.length, 0);

  const reversedRange = { ...first.findings[0], lineOrRange: "10-2" };
  reversedRange.findingId = `normalized-finding:sha256:${createHash("sha256").update(`${reversedRange.reviewedHead}:${reversedRange.digest}:${reversedRange.pathOrRef}:${reversedRange.lineOrRange}:${reversedRange.rule}`).digest("hex")}`;
  assert.equal(evaluateSimulatedReview(simulatedInput({ priorFindings: [reversedRange] })).state, "blocked");

  const forgedAuthority = evaluateSimulatedReview(simulatedInput({ decision: { ...prepared.decision, authorityEvidence: { ...prepared.decision.authorityEvidence, authorityRef: "authority:forged" } } }));
  assert.equal(forgedAuthority.state, "blocked");

  const oversizedPrior = evaluateSimulatedReview(simulatedInput({ priorFindings: Array.from({ length: 33 }, (_, index) => ({ ...first.findings[0], findingId: `normalized-finding:${index}`, lineOrRange: String(index + 1) })) }));
  assert.equal(oversizedPrior.state, "blocked");
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
    [{ ...base, disclosure: { ...base.disclosure, routeAllowlist: ["live-route"] } }, "packet_malformed"],
    [{ ...base, disclosure: { ...base.disclosure, adapterAllowlist: ["live-adapter"] } }, "packet_malformed"],
    [{ ...base, disclosure: { ...base.disclosure, toolAllowlist: ["live-tool"] } }, "packet_malformed"],
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

test("review route rejects duplicate and oversized disclosure arrays before normalization", () => {
  const base = validInput();
  const tooManyEvidenceRefs = Array.from({ length: 33 }, (_, index) => `evidence:sha256:${index.toString(16).padStart(64, "0")}`);
  const cases = [
    { ...base, disclosure: { ...base.disclosure, routeAllowlist: ["report_only", "report_only"] } },
    { ...base, disclosure: { ...base.disclosure, adapterAllowlist: ["none", "none"] } },
    { ...base, disclosure: { ...base.disclosure, toolAllowlist: ["none", "none"] } },
    { ...base, disclosure: { ...base.disclosure, evidenceRefs: [EVIDENCE_REF, EVIDENCE_REF] } },
    { ...base, disclosure: { ...base.disclosure, evidenceRefs: tooManyEvidenceRefs } },
  ];
  for (const input of cases) {
    const result = evaluateReviewRoute(input);
    assert.equal(result.ok, false);
    assert.equal(result.decision.state, "blocked");
    assert.equal(result.decision.controllingReason.code, "packet_malformed");
    assert.equal(result.packet, null);
  }
});

test("review route rejects top-level private fields, unsupported requested states, live policy extras, and malformed consumption metadata", () => {
  const base = validInput();
  const cases = [
    [{ ...base, prompt: "private input" }, "forbidden_field"],
    [{ ...base, requestedState: "live" }, "requested_state_invalid"],
    [{ ...base, routePolicy: { ...base.routePolicy, routeAllowlist: ["report_only", "live-route"] } }, "route_policy_invalid"],
    [{ ...base, routePolicy: { ...base.routePolicy, adapterAllowlist: ["none", "live-adapter"] } }, "route_policy_invalid"],
    [{ ...base, routePolicy: { ...base.routePolicy, toolAllowlist: ["none", "live-tool"] } }, "route_policy_invalid"],
    [{ ...base, consumedDisclosurePacketIds: "disclosure-packet:review-35-1" }, "consumed_packet_ids_invalid"],
    [{ ...base, consumedDisclosurePacketIds: ["disclosure-packet:review-35-1", 42] }, "consumed_packet_ids_invalid"],
  ];
  for (const [input, expectedReason] of cases) {
    const result = evaluateReviewRoute(input);
    assert.equal(result.ok, false, expectedReason);
    assert.equal(result.decision.state, "blocked", expectedReason);
    assert.equal(result.decision.controllingReason.code, expectedReason);
  }
});

test("review route rejects forbidden nested route-policy fields before packet preparation", () => {
  const base = validInput();
  for (const routePolicy of [
    { ...base.routePolicy, prompt: "private route input" },
    { ...base.routePolicy, rawPayload: "private route input" },
  ]) {
    const result = evaluateReviewRoute({ ...base, routePolicy });
    assert.equal(result.ok, false);
    assert.equal(result.decision.state, "blocked");
    assert.equal(result.decision.controllingReason.code, "route_policy_invalid");
    assert.equal(result.packet, null);
  }
});

test("review route rejects serialization hooks and nonplain arrays before disclosure sizing", () => {
  const packet = buildDisclosurePacket(validInput());
  const hookedAllowlist = ["report_only"];
  hookedAllowlist.toJSON = () => ["report_only", "raw prompt text"];
  const hookedObject = { padding: "safe", toJSON() { return "raw prompt text"; } };
  const validation = validateDisclosurePacket({ ...packet, routeAllowlist: hookedAllowlist }, { now: NOW, routePolicy: validInput().routePolicy });
  assert.equal(validation.ok, false);
  assert.ok(validation.reasons.includes("route_allowlist_invalid"));
  assert.equal(disclosurePacketUtf8Bytes(hookedAllowlist), null);
  assert.equal(disclosurePacketUtf8Bytes(hookedObject), null);
  assert.equal(evaluateReviewRoute({ ...validInput(), disclosure: { ...validInput().disclosure, routeAllowlist: hookedAllowlist } }).decision.controllingReason.code, "packet_malformed");

  const proxyGetKeys = [];
  const proxyAllowlist = new Proxy(["report_only"], {
    get(target, key, receiver) { proxyGetKeys.push(String(key)); return Reflect.get(target, key, receiver); },
  });
  const proxyResult = evaluateReviewRoute({ ...validInput(), disclosure: { ...validInput().disclosure, routeAllowlist: proxyAllowlist } });
  assert.equal(proxyResult.ok, true);
  assert.equal(proxyResult.decision.state, "report_only");
  assert.deepEqual(proxyGetKeys, []);
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

test("review route fails closed for throwing top-level and route-policy traps", () => {
  const throwingInput = new Proxy({}, { getPrototypeOf() { throw new Error("no prototype access"); } });
  const routePolicy = { ...validInput().routePolicy };
  Object.defineProperty(routePolicy, "routeAllowlist", { enumerable: true, get() { throw new Error("no policy getter"); } });
  for (const [input, expectedReason] of [[throwingInput, "packet_malformed"], [{ ...validInput(), routePolicy }, "route_policy_invalid"]]) {
    let result;
    assert.doesNotThrow(() => { result = evaluateReviewRoute(input); });
    assert.equal(result.ok, false);
    assert.equal(result.decision.state, "blocked");
    assert.equal(result.decision.controllingReason.code, expectedReason);
  }
});

test("direct disclosure validation fails closed for throwing packet traps", () => {
  const trappedPacket = new Proxy(buildDisclosurePacket(validInput()), {
    get(target, property, receiver) {
      if (property === "schemaVersion") throw new Error("no packet getter");
      return Reflect.get(target, property, receiver);
    },
  });
  let result;
  assert.doesNotThrow(() => { result = validateDisclosurePacket(trappedPacket, { now: NOW, routePolicy: validInput().routePolicy }); });
  assert.deepEqual(result, { ok: false, reasons: ["packet_malformed"] });
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

test("simulated adapter has no live, process, network, browser, or local-explanation boundary", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../scripts/lib/manager-control-plane/simulated-review-adapter.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /node:(?:child_process|fs|http|https|net)|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfetch\s*\(|https?:\/\/|OllamaProviderAdapter|get_local_evidence_explanation|\bclaude\b|\bollama\b/i);
  assert.match(source, /SIMULATED_REVIEW_ADAPTER_ID/);
  assert.match(source, /execution:\s*"none"/);
});

test("manager control-plane drift check requires the report-only route test as a focused test segment", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const checker = await readFile(new URL("../scripts/check-manager-control-plane.mjs", import.meta.url), "utf8");
  const focused = "node ./scripts/run-manager-control-plane-fast-tests.mjs focused && node --test tests/manager-review-route.test.mjs";
  assert.equal(packageJson.scripts["test:manager-control-plane:focused"], focused);
  assert.match(checker, /\["test:manager-control-plane:focused", "node \.\/scripts\/run-manager-control-plane-fast-tests\.mjs focused && node --test tests\/manager-review-route\.test\.mjs"\]/);
  assert.match(checker, /\["test:supervisor", "node \.\/scripts\/run-supervisor-tests\.mjs"\]/);
  assert.equal(packageJson.scripts["test:supervisor:review-route"], "node ./scripts/run-supervisor-tests.mjs tests/integration/test_review_route_packet.py -q");
  assert.match(checker, /\["test:supervisor:review-route", "node \.\/scripts\/run-supervisor-tests\.mjs tests\/integration\/test_review_route_packet\.py -q"\]/);
  assert.match(checker, /assertAggregateIncludes\("check", "pnpm run test:supervisor:review-route", failures\)/);
  assert.match(checker, /options\.pytestArgs\.length > 0 \? options\.pytestArgs : \["tests"\]/);
  assert.match(checker, /"services\/supervisor\/src\/supervisor\/domain\/review_route\.py"/);
  assert.match(checker, /"services\/supervisor\/tests\/integration\/test_review_route_packet\.py"/);
  assert.match(checker, /"scripts\/lib\/manager-control-plane\/simulated-review-adapter\.mjs"/);
});
