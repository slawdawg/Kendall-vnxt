import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { publishManagerCycleLaneClarity } from "../scripts/lib/manager-control-plane/manager-cycle-lane-clarity-publication.mjs";
import { publishManagerCycleCoordinationHealth } from "../scripts/lib/manager-control-plane/manager-cycle-coordination-health-publication.mjs";
import { runManagerRunLoop } from "../scripts/manager-run-loop.mjs";
import { ledgerCommand } from "../scripts/lib/manager-control-plane/core.mjs";

const laneClarity = {
  schemaVersion: "manager-lane-clarity/v0",
  runId: "run:current",
  eventWatermark: "event:current",
  sourceCursor: "7",
  goal: { summary: "Keep the manager handoff coherent.", sourceRef: "requirement:lane-clarity" },
  criteria: [{ criterionId: "criterion:handoff", summary: "Current evidence is bound.", disposition: "met", evidenceRefs: ["evidence:handoff"] }],
  canonicalState: { phase: "running", freshness: "fresh", evidenceFreshness: "fresh" },
  nextGate: { summary: "Publish the coherent handoff.", nextSafeAction: "publish_handoff" },
  posture: { state: "on_scope", reason: "Current metadata is coherent.", nextSafeAction: "continue", decisionRef: null, qualification: null },
  metadataOnly: true,
  rawPayloadRetained: false,
};

function coherentSummary() {
  return {
    laneClarity,
    lastObservedAt: "2026-07-29T00:00:00.000Z",
  };
}

function coordinationHealth() {
  return {
    schemaVersion: "manager-coordination-health/v0",
    runId: "run:current",
    observedAt: "2026-07-29T00:00:00.000Z",
    source: "manager_workspace_inventory",
    freshness: "fresh",
    availability: "available",
    activeWorkCount: 0,
    staleOwnerTargetCount: 0,
    staleOwnerProjectedCount: 0,
    dirtyPreserveCount: 0,
    missingWorktreeJournalHold: false,
    nextSafeAction: "Continue the normal manager cycle.",
    evidenceRefs: [],
    metadataOnly: true,
    rawPayloadRetained: false,
  };
}

async function startPrivateHandoffSupervisor(socketPath) {
  const records = new Map();
  const requests = [];
  const server = createServer((request, response) => {
    const respond = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
    };
    if (request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const payload = JSON.parse(body);
        records.set(payload.handoffId, payload);
        requests.push({ method: request.method, url: request.url });
        respond(200, { data: payload });
      });
      return;
    }
    requests.push({ method: request.method, url: request.url });
    const handoffId = decodeURIComponent(String(request.url).split("/").at(-1));
    const payload = records.get(handoffId);
    respond(payload ? 200 : 404, { data: payload });
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  return { server, requests };
}

test("cycle Lane Clarity publication is disabled by default without invoking transport", async () => {
  let calls = 0;
  const receipt = await publishManagerCycleLaneClarity(coherentSummary(), {}, {
    sync: async () => { calls += 1; },
  });
  assert.equal(receipt.state, "disabled");
  assert.equal(receipt.attemptCount, 0);
  assert.equal(receipt.rawPayloadRetained, false);
  assert.equal(calls, 0);
});

test("cycle Lane Clarity publication rejects a non-loopback endpoint without invoking transport", async () => {
  let calls = 0;
  const receipt = await publishManagerCycleLaneClarity(coherentSummary(), { laneClaritySupervisorUrl: "https://supervisor.example.com" }, {
    sync: async () => { calls += 1; },
  });
  assert.equal(receipt.state, "rejected");
  assert.equal(receipt.failureCode, "loopback_endpoint_rejected");
  assert.equal(receipt.attemptCount, 0);
  assert.equal(calls, 0);
});

test("cycle Lane Clarity publication binds a deterministic per-run identity and sequence", async () => {
  const calls = [];
  const sync = async (summary, endpoint, context) => {
    calls.push({ summary, endpoint, context });
    return { handoffId: "manager-lane-clarity-handoff:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  };
  const first = await publishManagerCycleLaneClarity(coherentSummary(), { laneClaritySupervisorUrl: "http://127.0.0.1:8100" }, { sync });
  const replay = await publishManagerCycleLaneClarity(coherentSummary(), { laneClaritySupervisorUrl: "http://127.0.0.1:8100" }, { sync });
  assert.equal(first.state, "published");
  assert.equal(first.selectedLaneId, "manager-run:run:current");
  assert.equal(first.sourceSequence, 7);
  assert.equal(first.idempotencyKey, replay.idempotencyKey);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].context.sourceSequence, 7);
  assert.equal(calls[0].context.observedAt, "2026-07-29T00:00:00.000Z");
  assert.equal(calls[0].context.idempotencyKey, calls[1].context.idempotencyKey);
});

test("cycle Lane Clarity publication retries only local transport failures and records a bounded receipt", async () => {
  let calls = 0;
  const receipt = await publishManagerCycleLaneClarity(coherentSummary(), { laneClaritySupervisorUrl: "http://localhost:8100" }, {
    sync: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return { handoffId: "manager-lane-clarity-handoff:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    },
  });
  assert.equal(receipt.state, "published");
  assert.equal(receipt.attemptCount, 2);
  assert.equal(calls, 2);

  calls = 0;
  const rejected = await publishManagerCycleLaneClarity(coherentSummary(), { laneClaritySupervisorUrl: "http://localhost:8100" }, {
    sync: async () => {
      calls += 1;
      throw new TypeError("Lane clarity handoff failed with HTTP 409.");
    },
  });
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.attemptCount, 1);
  assert.equal(calls, 1);
  assert.equal(rejected.rawPayloadRetained, false);
});

test("cycle Lane Clarity publication leaves an unavailable summary local and does not call transport", async () => {
  let calls = 0;
  const receipt = await publishManagerCycleLaneClarity({ laneClarity: { ...laneClarity, posture: { ...laneClarity.posture, state: "not_assessed" } } }, { laneClaritySupervisorUrl: "http://localhost:8100" }, {
    sync: async () => { calls += 1; },
  });
  assert.equal(receipt.state, "unavailable");
  assert.equal(receipt.failureCode, "coherent_lane_clarity_unavailable");
  assert.equal(calls, 0);

  const malformed = await publishManagerCycleLaneClarity({ laneClarity: { ...laneClarity, criteria: [] }, lastObservedAt: "2026-07-29T00:00:00.000Z" }, { laneClaritySupervisorUrl: "http://localhost:8100" }, {
    sync: async () => { calls += 1; },
  });
  assert.equal(malformed.state, "unavailable");
  assert.equal(calls, 0);
});

test("normal manager publication uses the configured private UDS for both handoffs and verifies exact readback", async () => {
  const directory = mkdtempSync(join(tmpdir(), "manager-private-handoff-"));
  const socketPath = join(directory, "supervisor.sock");
  const { server, requests } = await startPrivateHandoffSupervisor(socketPath);
  const context = {
    supervisorTransport: "private_uds",
    supervisorUdsPath: socketPath,
    fetchImpl: () => { throw new Error("private UDS handoffs must not use fetch"); },
  };
  try {
    const laneReceipt = await publishManagerCycleLaneClarity(coherentSummary(), {}, context);
    const coordinationReceipt = await publishManagerCycleCoordinationHealth(coordinationHealth(), {}, context);
    assert.equal(laneReceipt.state, "published");
    assert.equal(laneReceipt.persisted, true);
    assert.match(laneReceipt.endpoint, /^private-uds:/);
    assert.equal(coordinationReceipt.state, "published");
    assert.equal(coordinationReceipt.persisted, true);
    assert.match(coordinationReceipt.endpoint, /^private-uds:/);
    assert.deepEqual(requests.map(({ method, url }) => `${method} ${url}`), [
      "POST /manager-control-plane/lane-clarity-handoffs",
      `GET /manager-control-plane/lane-clarity-handoffs/${encodeURIComponent(laneReceipt.handoffId)}`,
      "POST /manager-control-plane/coordination-health-handoffs",
      `GET /manager-control-plane/coordination-health-handoffs/${encodeURIComponent(coordinationReceipt.handoffId)}`,
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("private UDS mode fails closed without a safe socket path", async () => {
  let calls = 0;
  const receipt = await publishManagerCycleCoordinationHealth(coordinationHealth(), {}, {
    supervisorTransport: "private_uds",
    sync: async () => { calls += 1; },
  });
  assert.equal(receipt.state, "rejected");
  assert.equal(receipt.failureCode, "private_uds_transport_rejected");
  assert.equal(calls, 0);
});

test("private UDS publication marks socket permission failures as sandbox boundaries", async () => {
  const permissionError = new Error("connect: operation not permitted");
  permissionError.code = "EPERM";
  let laneCalls = 0;
  let healthCalls = 0;
  const laneReceipt = await publishManagerCycleLaneClarity(coherentSummary(), {}, {
    supervisorTransport: "private_uds",
    supervisorUdsPath: "/private/supervisor.sock",
    sync: async () => { laneCalls += 1; throw permissionError; },
  });
  const healthReceipt = await publishManagerCycleCoordinationHealth(coordinationHealth(), {}, {
    supervisorTransport: "private_uds",
    supervisorUdsPath: "/private/supervisor.sock",
    sync: async () => { healthCalls += 1; throw permissionError; },
  });
  assert.equal(laneReceipt.state, "unavailable");
  assert.equal(laneReceipt.sandboxBoundary, true);
  assert.equal(laneCalls, 1);
  assert.equal(healthReceipt.state, "unavailable");
  assert.equal(healthReceipt.sandboxBoundary, true);
  assert.equal(healthCalls, 1);
});

test("normal manager cycle publishes only after its coherent plan completes", async () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "manager-runtime-lane-clarity-"));
  try {
    assert.equal(ledgerCommand({ command: "init", runId: "run-current", stateRoot }).status, "ready");
    const packets = [];
    const published = [];
    await runManagerRunLoop(
      { runId: "run-current", stateRoot, maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({ ok: true, status: "ready", summary: {}, blockers: [], warnings: [] }),
        buildContinuousRunPlan: () => ({
          ok: true,
          status: "ready",
          summary: {
            workerCounts: { active: 0, warm: 0, paused: 0 }, usageState: "normal", resourceState: "normal",
            selectedAction: null, applySelectedAction: null, runtimeReadiness: { allowedExecutionMode: "continuous_dry_run" },
            laneClarity, laneClarityObservedAt: "2026-07-29T00:00:00.000Z",
          },
          blockers: [], warnings: [], nextActions: [],
        }),
        publishManagerCycleLaneClarity: async (summary, options) => {
          published.push({ summary, options });
          return { state: "published", attemptCount: 1, metadataOnly: true, rawPayloadRetained: false };
        },
        writePacket: (packet) => packets.push(packet),
        sleep: async () => {},
      },
    );
    assert.equal(published.length, 1);
    assert.equal(published[0].summary.laneClarity, laneClarity);
    assert.equal(published[0].options.laneClaritySupervisorUrl, "http://127.0.0.1:8100");
    assert.equal(packets[0].summary.laneClarityHandoff.state, "published");
  } finally {
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("blocked manager preflight preserves and publishes a coherent preflight lane summary without selecting mutation", async () => {
  const packets = [];
  const published = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({
          ok: false,
          status: "blocked",
          summary: { managerExecutionLaneSummary: coherentSummary() },
          blockers: [{ code: "no-dispatchable-lane", message: "No lane is eligible.", nextAction: "Keep mutation blocked." }],
          warnings: [],
        }),
        buildContinuousRunPlan: () => { throw new Error("blocked preflight must not select a manager plan"); },
        buildManagerCoordinationHealth: () => coordinationHealth(),
        publishManagerCycleLaneClarity: async (summary) => {
          published.push({ kind: "lane", summary });
          return { state: "published", persisted: true, metadataOnly: true, rawPayloadRetained: false };
        },
        publishManagerCycleCoordinationHealth: async (health) => {
          published.push({ kind: "health", health });
          return { state: "published", persisted: true, metadataOnly: true, rawPayloadRetained: false };
        },
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.deepEqual(published.map(({ kind }) => kind), ["lane", "health"]);
    assert.equal(published[0].summary.laneClarity, laneClarity);
    assert.equal(published[1].health.source, "manager_workspace_inventory");
    assert.equal(packets.length, 1);
    assert.equal(packets[0].ok, false);
    assert.equal(packets[0].status, "blocked");
    assert.equal(packets[0].summary.stopReason, "preflight_blocked");
    assert.equal(packets[0].summary.laneClarityHandoff.state, "published");
    assert.equal(packets[0].summary.coordinationHealthHandoff.state, "published");
    assert.deepEqual(packets[0].blockers, [{ code: "no-dispatchable-lane", message: "No lane is eligible.", nextAction: "Keep mutation blocked." }]);
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("blocked manager preflight keeps incoherent lane clarity unavailable without fabricating it", async () => {
  const packets = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({ ok: false, status: "blocked", summary: {}, blockers: [], warnings: [] }),
        buildManagerCoordinationHealth: () => coordinationHealth(),
        publishManagerCycleLaneClarity: async (summary) => {
          assert.equal(summary.laneClarity, null);
          return { state: "unavailable", failureCode: "coherent_lane_clarity_unavailable", metadataOnly: true, rawPayloadRetained: false };
        },
        publishManagerCycleCoordinationHealth: async () => ({ state: "published", persisted: true, metadataOnly: true, rawPayloadRetained: false }),
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.equal(packets[0].status, "blocked");
    assert.equal(packets[0].summary.laneClarityHandoff.state, "unavailable");
    assert.equal(packets[0].summary.coordinationHealthHandoff.state, "published");
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("blocked manager preflight records unavailable handoffs when read-only publication fails", async () => {
  const packets = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({ ok: false, status: "blocked", summary: {}, blockers: [], warnings: [] }),
        buildManagerCoordinationHealth: () => coordinationHealth(),
        publishManagerCycleLaneClarity: async () => { throw new Error("lane handoff unavailable"); },
        publishManagerCycleCoordinationHealth: async () => { throw new Error("health handoff unavailable"); },
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.equal(packets.length, 1);
    assert.equal(packets[0].status, "blocked");
    assert.equal(packets[0].summary.laneClarityHandoff.state, "unavailable");
    assert.equal(packets[0].summary.coordinationHealthHandoff.state, "unavailable");
    assert.equal(packets[0].summary.coordinationHealthHandoff.failureCode, "blocked_preflight_readonly_publication_unavailable");
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("blocked manager preflight writes its packet when canonical health cannot be derived", async () => {
  const packets = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({ ok: false, status: "blocked", summary: {}, blockers: [], warnings: [] }),
        buildManagerCoordinationHealth: () => { throw new Error("inventory unavailable"); },
        publishManagerCycleLaneClarity: async () => ({ state: "unavailable", metadataOnly: true, rawPayloadRetained: false }),
        publishManagerCycleCoordinationHealth: async () => { throw new Error("health publication must not run without canonical health"); },
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.equal(packets.length, 1);
    assert.equal(packets[0].status, "blocked");
    assert.equal(packets[0].summary.coordinationHealth, undefined);
    assert.equal(packets[0].summary.coordinationHealthHandoff.state, "unavailable");
    assert.equal(packets[0].summary.coordinationHealthHandoff.failureCode, "blocked_preflight_readonly_publication_unavailable");
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("blocked manager preflight classifies a read-only publication sandbox boundary without retrying its peer handoff", async () => {
  const packets = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1, laneClaritySupervisorUrl: "http://127.0.0.1:8100" },
      {
        buildPreflight: () => ({ ok: false, status: "blocked", summary: {}, blockers: [], warnings: [] }),
        buildManagerCoordinationHealth: () => coordinationHealth(),
        publishManagerCycleLaneClarity: async () => ({ state: "unavailable", sandboxBoundary: true, metadataOnly: true, rawPayloadRetained: false }),
        publishManagerCycleCoordinationHealth: async () => { throw new Error("peer handoff must not retry after sandbox boundary"); },
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.equal(packets.length, 1);
    assert.equal(packets[0].status, "known_sandbox_boundary");
    assert.equal(packets[0].summary.stopReason, "known_sandbox_boundary");
    assert.equal(packets[0].summary.sandboxBoundaryPacket.boundary, true);
    assert.equal(packets[0].summary.laneClarityHandoff.state, "unavailable");
    assert.equal(packets[0].summary.coordinationHealthHandoff, undefined);
  } finally {
    process.exitCode = originalExitCode;
  }
});

test("sandbox-boundary preflight remains a no-publication stop", async () => {
  const packets = [];
  const originalExitCode = process.exitCode;
  try {
    await runManagerRunLoop(
      { maxIterations: 1, heartbeatEvery: 1 },
      {
        buildPreflight: () => ({
          ok: false,
          status: "blocked",
          summary: {},
          blockers: [{ sandboxBoundary: true, nextAction: "Use the exact approved outside-sandbox command." }],
          warnings: [],
        }),
        buildManagerCoordinationHealth: () => { throw new Error("sandbox boundary must not derive health"); },
        publishManagerCycleLaneClarity: async () => { throw new Error("sandbox boundary must not publish lane clarity"); },
        publishManagerCycleCoordinationHealth: async () => { throw new Error("sandbox boundary must not publish health"); },
        writePacket: (packet) => packets.push(packet),
      },
    );
    assert.equal(packets.length, 1);
    assert.equal(packets[0].status, "known_sandbox_boundary");
    assert.equal(packets[0].summary.laneClarityHandoff, undefined);
    assert.equal(packets[0].summary.coordinationHealthHandoff, undefined);
  } finally {
    process.exitCode = originalExitCode;
  }
});
