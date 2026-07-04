import assert from "node:assert/strict";
import test from "node:test";

import { buildUsageResourceRoutingDecision } from "../scripts/manager-usage-resource-routing.mjs";

const NOW_MS = Date.parse("2026-07-01T12:00:00.000Z");
const FRESH_SAMPLE = "2026-07-01T11:59:00.000Z";

test("low provider usage holds dispatch without applying worker mutation", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "low", provider: "codex", remainingPercent: 2, sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "normal", cpuLoadPercent: 20, memoryUsedPercent: 40, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 3,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.allowed, false);
  assert.equal(decision.selectedAction, null);
  assert.ok(decision.blockedReasons.includes("usage.low"));
  assert.ok(decision.stopLines.includes("no_dispatch_apply"));
  assert.equal(decision.policyInputs.usage.state, "low");
  assert.equal(decision.policyInputs.usage.stale, false);
});

test("stale usage samples are marked stale instead of treated as fresh", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", stale: true, provider: "codex" },
    resourceSample: { state: "normal" },
    readyQueueCount: 1,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.allowed, false);
  assert.ok(decision.blockedReasons.includes("usage.stale"));
  assert.equal(decision.policyInputs.usage.state, "stale");
  assert.equal(decision.policyInputs.usage.stale, true);
});

test("high host resource pressure holds dispatch and names recovery action", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", provider: "codex", remainingPercent: 60, sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "high", cpuLoadPercent: 94, memoryUsedPercent: 88, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 2,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.ok(decision.blockedReasons.includes("resource.high"));
  assert.match(decision.nextAction, /pause dispatch/i);
  assert.equal(decision.policyInputs.resource.state, "high");
});

test("healthy usage and resources can only route to dispatch-next dry-run", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", provider: "codex", remainingPercent: 65, sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "normal", cpuLoadPercent: 25, memoryUsedPercent: 50, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 4,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "ready");
  assert.equal(decision.allowed, true);
  assert.equal(decision.selectedAction.code, "dispatch-next-dry-run");
  assert.match(decision.selectedAction.command, /dispatch-next --dry-run --summary-json --owner runner-a/);
  assert.doesNotMatch(decision.selectedAction.command, /--apply/);
  assert.equal(decision.workerMutationAllowed, false);
  assert.equal(decision.dispatchApplyAllowed, false);
  assert.equal(decision.deliveryAllowed, false);
  assert.equal(decision.cleanupAllowed, false);
  assert.ok(decision.stopLines.includes("no_delivery"));
  assert.ok(decision.stopLines.includes("no_cleanup"));
});

test("missing measured samples fail closed instead of routing from labels only", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "normal", cpuLoadPercent: 25, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 2,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.allowed, false);
  assert.equal(decision.selectedAction, null);
  assert.ok(decision.blockedReasons.includes("usage.remaining_percent_missing"));
  assert.ok(decision.blockedReasons.includes("resource.memory_used_percent_missing"));
});

test("missing sample freshness fails closed as stale", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", remainingPercent: 65 },
    resourceSample: { state: "normal", cpuLoadPercent: 25, memoryUsedPercent: 50 },
    readyQueueCount: 2,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.ok(decision.blockedReasons.includes("usage.stale"));
  assert.ok(decision.blockedReasons.includes("resource.stale"));
});

test("invalid telemetry percentages fail closed instead of clamping healthy", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "runner-a",
    usageSample: { state: "normal", provider: "codex", remainingPercent: 65, sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "normal", cpuLoadPercent: -20, memoryUsedPercent: 50, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 2,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.ok(decision.blockedReasons.includes("resource.cpu_load_percent_invalid"));
});

test("invalid owner blocks dispatch preview instead of rewriting attribution", () => {
  const decision = buildUsageResourceRoutingDecision({
    owner: "--apply",
    usageSample: { state: "normal", provider: "codex", remainingPercent: 65, sampledAt: FRESH_SAMPLE },
    resourceSample: { state: "normal", cpuLoadPercent: 25, memoryUsedPercent: 50, sampledAt: FRESH_SAMPLE },
    readyQueueCount: 2,
    nowMs: NOW_MS,
  });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.selectedAction, null);
  assert.ok(decision.blockedReasons.includes("owner.invalid"));
});

test("null caller payloads produce blocked decisions instead of crashes", () => {
  const decision = buildUsageResourceRoutingDecision(null);
  assert.equal(decision.status, "blocked");
  assert.ok(decision.blockedReasons.includes("owner.invalid"));
  assert.ok(decision.blockedReasons.includes("usage.stale"));
  assert.ok(decision.blockedReasons.includes("resource.stale"));
});

test("summary packet remains metadata-only without sensitive payload fields", () => {
  const packet = {
    ok: true,
    status: "ready",
    summary: buildUsageResourceRoutingDecision({
      owner: "runner-a",
      usageSample: { state: "normal", remainingPercent: 65, sampledAt: FRESH_SAMPLE },
      resourceSample: { state: "normal", cpuLoadPercent: 25, memoryUsedPercent: 50, sampledAt: FRESH_SAMPLE },
      readyQueueCount: 2,
      nowMs: NOW_MS,
    }),
  };

  assert.equal(packet.status, "ready");
  assert.equal(packet.summary.rawPayloadRetained, false);
  assert.equal(packet.summary.sourceContentCopied, false);
  assert.match(packet.summary.nextAction, /dispatch-next --dry-run/);
  assert.doesNotMatch(JSON.stringify(packet), /raw prompt|completion|reasoning trace|provider payload|secret/i);
});
