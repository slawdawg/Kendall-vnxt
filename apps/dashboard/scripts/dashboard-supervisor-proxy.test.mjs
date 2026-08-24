import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONTROLS_MUTATION_PATHS, CONTROLS_READ_PATHS, MEMORY_INBOX_MUTATION_PATHS, createSupervisorProxy } from "./dashboard-supervisor-proxy.mjs";

function listen(server, target) { return new Promise((resolve) => server.listen(target, resolve)); }
function close(server) { return new Promise((resolve) => server.close(resolve)); }
function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: options.headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test("session-aware supervisor proxy forwards authenticated LAN API traffic over the fixed UDS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-supervisor-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  let supervisor;
  const forwarded = [];
  let canonicalProjectionOverrides = null;
  let proxy;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") { response.writeHead(request.headers.cookie?.includes("session=ok") ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "operator" })); return; }
      if (request.url === "/pipeline-control-plane/work-packets") { response.end(JSON.stringify({ data: [canonicalPacketWithRawBrowserUnsafeFields()] })); return; }
      if (request.url === "/pipeline-control-plane/work-items/work-item-1/packet") { response.end(JSON.stringify({ data: canonicalPacketWithRawBrowserUnsafeFields() })); return; }
      if (request.url === "/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata") { forwarded.push(request.url); response.end(JSON.stringify({ data: { matched: false } })); return; }
      if (request.url === "/work-items/work-item-1/memory-proposals/proposal-1" || request.url === "/work-items/work-item-1/memory-proposals/proposal-1/ai-draft") { forwarded.push(request.url); response.end(JSON.stringify({ data: { proposalId: "proposal-1" } })); return; }
      if (request.url === "/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write") { forwarded.push(request.url); response.end(JSON.stringify({ data: { proposalId: "proposal-1", revision: 3 } })); return; }
      if (request.url === "/pipeline-control-plane/canonical-operational-projection") { response.end(JSON.stringify({ data: projectionWithRawCanonicalExtensions(canonicalProjectionOverrides || {}) })); return; }
      if (request.url === "/supervisor/runtime-evidence-review-report") { response.end(JSON.stringify({ data: { workItems: [] } })); return; }
      if (request.url === "/operator-views?scope=queue") { forwarded.push(request.url); response.end(JSON.stringify({ data: [] })); return; }
      response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
    });
    await listen(supervisor, socketPath);
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: `https://127.0.0.1:${port}` });
    const allowed = await request(port, "/api/supervisor/pipeline-control-plane/work-packets", { headers: { cookie: "session=ok" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.data[0].packetId, "packet-1");
    assert.equal(allowed.body.data[0].title, "Canonical supervisor packet");
    assert.equal(allowed.body.data[0].history[0].payloadSummary, "Redacted metadata-only lifecycle event.");
    assert.deepEqual(allowed.body.data[0].history[0].evidenceRefs, []);
    assert.doesNotMatch(JSON.stringify(allowed.body), /provider payload|credential token|python-only extension/i);
    const workItemPacket = await request(port, "/api/supervisor/pipeline-control-plane/work-items/work-item-1/packet", { headers: { cookie: "session=ok" } });
    assert.equal(workItemPacket.status, 200);
    assert.equal(workItemPacket.body.data.packetId, "packet-1");
    assert.equal(workItemPacket.body.data.title, "Canonical supervisor packet");
    assert.doesNotMatch(JSON.stringify(workItemPacket.body), /provider payload|credential token|python-only extension/i);
    const retiredProjection = await request(port, "/api/supervisor/pipeline-control-plane/projection", { headers: { cookie: "session=ok" } });
    assert.equal(retiredProjection.status, 404);
    const canonicalOperationalProjection = await request(port, "/api/supervisor/pipeline-control-plane/canonical-operational-projection", { headers: { cookie: "session=ok" } });
    assert.equal(canonicalOperationalProjection.status, 200);
    assert.equal(canonicalOperationalProjection.body.data.workPackets[0].canonicalContract, null);
    assert.doesNotMatch(JSON.stringify(canonicalOperationalProjection.body), /python-only extension/i);
    assert.equal(canonicalOperationalProjection.body.data.selectedPacketDetails[0].actionResultsV1, undefined);
    assert.doesNotMatch(JSON.stringify(canonicalOperationalProjection.body), /raw action result history/i);
    assert.deepEqual(canonicalOperationalProjection.body.data.activeManagerLaneClarity, {
      goal: { summary: "Keep the lane on scope.", sourceRef: "requirement:token-rotation" },
      posture: { state: "on_scope", reason: "Fresh supervisor evidence is available.", nextSafeAction: "verify_pipeline_render", decisionRef: null, qualification: null },
      canonicalState: { phase: "running", freshness: "fresh", evidenceFreshness: "fresh" },
      nextGate: { summary: "Verify the canonical dashboard read.", nextSafeAction: "verify_pipeline_render" },
      criteria: [{ criterionId: "criterion:token-rotation", summary: "Token rotation is tracked as a requirement.", disposition: "met", evidenceRefs: ["evidence:token-rotation"] }],
    });
    assert.doesNotMatch(JSON.stringify(canonicalOperationalProjection.body.data.activeManagerLaneClarity), /rawProviderResponse|python-only extension/i);
    assert.equal(canonicalOperationalProjection.body.data.activeManagerLaneClarity.goal.sourceRef, "requirement:token-rotation");
    assert.deepEqual(canonicalOperationalProjection.body.data.coordinationHealth, {
      observedAt: "2026-08-22T00:00:00.000Z",
      source: "manager_workspace_inventory",
      freshness: "fresh",
      availability: "incomplete",
      activeWorkCount: 2,
      staleOwnerTargetCount: 17,
      staleOwnerProjectedCount: 12,
      dirtyPreserveCount: 3,
      missingWorktreeJournalHold: true,
      nextSafeAction: "Preserve dirty worktrees and refresh canonical stale-owner evidence.",
      metadataOnly: true,
    });
    assert.doesNotMatch(JSON.stringify(canonicalOperationalProjection.body.data.coordinationHealth), /run:coordination|manager:assignment-report|rawProviderResponse|python-only extension/i);
    for (const malformedClarity of [
      ["raw provider payload must not cross"],
      { goal: { summary: "Keep the lane on scope.", sourceRef: "requirement:lane-clarity" }, criteria: ["raw provider payload must not cross"] },
      { goal: "raw provider payload must not cross", criteria: [] },
    ]) {
      canonicalProjectionOverrides = { activeManagerLaneClarity: malformedClarity };
      const malformed = await request(port, "/api/supervisor/pipeline-control-plane/canonical-operational-projection", { headers: { cookie: "session=ok" } });
      assert.equal(malformed.status, 200);
      assert.equal(malformed.body.data.activeManagerLaneClarity, null);
      assert.doesNotMatch(JSON.stringify(malformed.body), /raw provider payload must not cross/i);
    }
    for (const malformedHealth of [
      { schemaVersion: "manager-coordination-health/v0", nextSafeAction: ["raw provider payload must not cross"] },
      { ...projectionWithRawCanonicalExtensions().coordinationHealth, availability: "impossible", rawProviderResponse: "must-not-reach-client" },
      { ...projectionWithRawCanonicalExtensions().coordinationHealth, nextSafeAction: "reasoning traces: must not cross the browser boundary" },
    ]) {
      canonicalProjectionOverrides = { coordinationHealth: malformedHealth };
      const malformed = await request(port, "/api/supervisor/pipeline-control-plane/canonical-operational-projection", { headers: { cookie: "session=ok" } });
      assert.equal(malformed.status, 200);
      assert.equal(malformed.body.data.coordinationHealth, null);
      assert.doesNotMatch(JSON.stringify(malformed.body), /raw provider payload must not cross|must-not-reach-client|reasoning traces/i);
    }
    canonicalProjectionOverrides = null;
    const malformedCanonicalLookup = await request(port, "/api/supervisor/pipeline-control-plane/work-items/work-item-1/packet/extra", { headers: { cookie: "session=ok" } });
    assert.equal(malformedCanonicalLookup.status, 404);
    const canonicalMutation = await request(port, "/api/supervisor/pipeline-control-plane/work-packets", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(canonicalMutation.status, 405);
    const projectionMutation = await request(port, "/api/supervisor/pipeline-control-plane/projection", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(projectionMutation.status, 404);
    const canonicalProjectionMutation = await request(port, "/api/supervisor/pipeline-control-plane/canonical-operational-projection", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(canonicalProjectionMutation.status, 405);
    const legacyList = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok" } });
    assert.equal(legacyList.status, 404);
    const legacyDetail = await request(port, "/api/supervisor/work-packets/legacy-packet-1", { headers: { cookie: "session=ok" } });
    assert.equal(legacyDetail.status, 404);
    const runtimeEvidenceReview = await request(port, "/api/supervisor/supervisor/runtime-evidence-review-report", { headers: { cookie: "session=ok" } });
    assert.equal(runtimeEvidenceReview.status, 200);
    const savedViews = await request(port, "/api/supervisor/operator-views?scope=queue", { headers: { cookie: "session=ok" } });
    assert.equal(savedViews.status, 200);
    assert.deepEqual(forwarded, ["/operator-views?scope=queue"]);
    const artifactSearch = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata", { headers: { cookie: "session=ok" } });
    assert.equal(artifactSearch.status, 200);
    assert.deepEqual(forwarded, ["/operator-views?scope=queue", "/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata"]);
    const artifactMutation = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(artifactMutation.status, 405);
    const recoveryPath = "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write";
    const proposalPatchPath = "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1";
    const proposalDraftPath = `${proposalPatchPath}/ai-draft`;
    const proposalPatchMissingCsrf = await request(port, proposalPatchPath, { method: "PATCH", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(proposalPatchMissingCsrf.status, 403);
    const proposalPatch = await request(port, proposalPatchPath, { method: "PATCH", headers: { cookie: "session=ok; kendall_operator_csrf=csrf-ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok" } });
    assert.equal(proposalPatch.status, 200);
    const proposalDraft = await request(port, proposalDraftPath, { method: "POST", headers: { cookie: "session=ok; kendall_operator_csrf=csrf-ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok" } });
    assert.equal(proposalDraft.status, 200);
    const proposalPatchWrongMethod = await request(port, proposalPatchPath, { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(proposalPatchWrongMethod.status, 405);
    const recoveryMissingCsrf = await request(port, recoveryPath, { method: "POST", body: JSON.stringify({ expectedRevision: 2, recoveryRef: "operator:dead-supervisor" }), headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}`, "content-type": "application/json" } });
    assert.equal(recoveryMissingCsrf.status, 403);
    const recovery = await request(port, recoveryPath, { method: "POST", body: JSON.stringify({ expectedRevision: 2, recoveryRef: "operator:dead-supervisor" }), headers: { cookie: "session=ok; kendall_operator_csrf=csrf-ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok", "content-type": "application/json" } });
    assert.equal(recovery.status, 200);
    assert.deepEqual(recovery.body.data, { proposalId: "proposal-1", revision: 3 });
    const artifactSearchExtra = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata&extra=1", { headers: { cookie: "session=ok" } });
    assert.equal(artifactSearchExtra.status, 404);
    const savedViewsExtra = await request(port, "/api/supervisor/operator-views?scope=queue&extra=1", { headers: { cookie: "session=ok" } });
    assert.equal(savedViewsExtra.status, 404);
    assert.deepEqual(forwarded, ["/operator-views?scope=queue", "/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata", "/work-items/work-item-1/memory-proposals/proposal-1", "/work-items/work-item-1/memory-proposals/proposal-1/ai-draft", "/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write"]);
    const legacyMutation = await request(port, "/api/supervisor/work-packets/legacy-packet-1", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(legacyMutation.status, 404);
    const denied = await request(port, "/api/supervisor/pipeline-control-plane/work-packets");
    assert.equal(denied.status, 401);
    const forwardedRequest = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok", "x-forwarded-for": "127.0.0.1" } });
    assert.equal(forwardedRequest.status, 404);
    const unknown = await request(port, "/api/supervisor/private-admin", { headers: { cookie: "session=ok" } });
    assert.equal(unknown.status, 404);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("artifact writes use their dedicated vault-durability deadline", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-supervisor-proxy-timeout-"));
  const socketPath = join(directory, "supervisor.sock");
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") { response.end(JSON.stringify({ authenticated: true, role: "operator" })); return; }
      if (
        request.url === "/work-items/work-item-1/memory-proposals/proposal-1/ai-draft"
        || request.url === "/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-rebuild"
        || request.url === "/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write"
      ) {
        setTimeout(() => response.end(JSON.stringify({ data: { proposalId: "proposal-1" } })), 40);
        return;
      }
      response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
    });
    await listen(supervisor, socketPath);
    dashboard = http.createServer(async (request, response) => {
      const proxy = createSupervisorProxy({
        supervisorUdsPath: socketPath,
        expectedOrigin: `https://127.0.0.1:${dashboard.address().port}`,
        timeoutMs: 10,
        memoryProposalArtifactWriteTimeoutMs: 100,
      });
      if (await proxy(request, response)) return;
      response.writeHead(404).end(JSON.stringify({ state: "not_found" }));
    });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    const response = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/ai-draft", {
      method: "POST",
      headers: {
        cookie: "session=ok; kendall_operator_csrf=csrf-ok",
        origin: `https://127.0.0.1:${port}`,
        "x-csrf-token": "csrf-ok",
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { proposalId: "proposal-1" });
    const rebuild = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-rebuild", {
      method: "POST",
      headers: {
        cookie: "session=ok; kendall_operator_csrf=csrf-ok",
        origin: `https://127.0.0.1:${port}`,
        "x-csrf-token": "csrf-ok",
      },
    });
    assert.equal(rebuild.status, 200);
    assert.deepEqual(rebuild.body.data, { proposalId: "proposal-1" });
    const recovery = await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write", {
      method: "POST",
      headers: {
        cookie: "session=ok; kendall_operator_csrf=csrf-ok",
        origin: `https://127.0.0.1:${port}`,
        "x-csrf-token": "csrf-ok",
      },
    });
    assert.equal(recovery.status, 200);
    assert.deepEqual(recovery.body.data, { proposalId: "proposal-1" });
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

function canonicalPacketWithRawBrowserUnsafeFields() {
  return {
    packetId: "packet-1",
    title: "provider payload: raw packet title",
    currentStage: "capture",
    status: "waiting",
    truthLabel: "source_owned",
    sourceRef: { refId: "doc:secret", sourceType: "repo_doc", pathOrUrl: "private/provider-payload.txt", title: "credential token", contentSha256: null },
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
    currentEventId: "created",
    history: [{
      eventId: "created",
      eventType: "packet.created",
      previousStage: null,
      targetStage: "capture",
      status: "waiting",
      truthLabel: "source_owned",
      actor: { actorType: "system", actorLabel: "provider payload" },
      occurredAt: "2026-08-17T00:00:00.000Z",
      payloadSummary: "provider payload: raw browser secret",
      evidenceRefs: ["credential token: raw browser secret"],
      metadataOnly: true,
    }],
    canonicalContract: { extension: "python-only extension" },
    evidenceChain: { extension: "python-only extension" },
    productModeMapping: { extension: "python-only extension" },
    metadataOnly: true,
  };
}

function projectionWithRawCanonicalExtensions(overrides = {}) {
  return {
    rawProviderResponse: "python-only extension",
    workPackets: [{
      packetId: "packet-1",
      canonicalContract: { extra: "python-only extension" },
      productModeMapping: { extra: "python-only extension" },
      rawProviderResponse: "python-only extension",
      actionResultsV1: [{ summary: "raw action result history" }],
      sourceRef: { refId: "doc:packet", sourceType: "workflow", pathOrUrl: null, title: "Packet", contentSha256: null, rawProviderResponse: "python-only extension" },
    }],
    selectedPacketDetails: [{
      packetId: "packet-1",
      canonicalContract: { extra: "python-only extension" },
      productModeMapping: { extra: "python-only extension" },
      rawProviderResponse: "python-only extension",
    }],
    activeManagerLaneClarity: {
      goal: { summary: "Keep the lane on scope.", sourceRef: "requirement:token-rotation", rawProviderResponse: "python-only extension" },
      posture: { state: "on_scope", reason: "Fresh supervisor evidence is available.", nextSafeAction: "verify_pipeline_render", decisionRef: null, qualification: null, rawProviderResponse: "python-only extension" },
      canonicalState: { phase: "running", freshness: "fresh", evidenceFreshness: "fresh", rawProviderResponse: "python-only extension" },
      nextGate: { summary: "Verify the canonical dashboard read.", nextSafeAction: "verify_pipeline_render", rawProviderResponse: "python-only extension" },
      criteria: [{ criterionId: "criterion:token-rotation", summary: "Token rotation is tracked as a requirement.", disposition: "met", evidenceRefs: ["evidence:token-rotation"], rawProviderResponse: "python-only extension" }],
      rawProviderResponse: "python-only extension",
    },
    coordinationHealth: {
      schemaVersion: "manager-coordination-health/v0",
      runId: "run:coordination",
      observedAt: "2026-08-22T00:00:00.000Z",
      source: "manager_workspace_inventory",
      freshness: "fresh",
      availability: "incomplete",
      activeWorkCount: 2,
      staleOwnerTargetCount: 17,
      staleOwnerProjectedCount: 12,
      dirtyPreserveCount: 3,
      missingWorktreeJournalHold: true,
      nextSafeAction: "Preserve dirty worktrees and refresh canonical stale-owner evidence.",
      evidenceRefs: ["manager:assignment-report"],
      metadataOnly: true,
      rawPayloadRetained: false,
      rawProviderResponse: "python-only extension",
    },
    ...overrides,
  };
}

test("retired follow-up subresource is never forwarded", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-supervisor-proxy-follow-up-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let proxy;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      request.on("data", () => {});
      request.on("end", () => {
        if (request.url === "/auth/session") {
          response.writeHead(request.headers.cookie === "session=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "operator" }));
          return;
        }
        forwarded.push({ method: request.method, url: request.url });
        response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
      });
    });
    await listen(supervisor, socketPath);
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: `https://127.0.0.1:${port}` });
    const postBody = JSON.stringify({ source: "dashboard" });

    const mutation = await request(port, "/api/supervisor/work-packets/packet-1/learn-follow-up-candidate-work", { method: "POST", body: postBody, headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok", "content-type": "application/json" } });
    assert.equal(mutation.status, 404);
    assert.deepEqual(forwarded, []);

    const unknown = await request(port, "/api/supervisor/work-packets/packet-1/unknown", { method: "POST", body: postBody, headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok", "content-type": "application/json" } });
    assert.equal(unknown.status, 404);
    assert.deepEqual(forwarded, []);

  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("test viewer is limited to fixed pipeline reads before any supervisor forward", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-test-viewer-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") {
        response.writeHead(request.headers.cookie === "viewer=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "test_viewer" }));
        return;
      }
      forwarded.push({ method: request.method, url: request.url });
      response.end(JSON.stringify({ data: [] }));
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    const headers = { cookie: "viewer=ok" };
    assert.equal((await request(port, "/api/supervisor/pipeline-control-plane/projection", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/pipeline-control-plane/canonical-operational-projection", { headers })).status, 200);
    assert.equal((await request(port, "/api/supervisor/work-packets", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet-1", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/pipeline-control-plane/work-items/work-item-1/memory-review", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/llm-wiki-artifact?query=metadata", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/recover-abandoned-write", { method: "POST", headers: { ...headers, origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" }, body: JSON.stringify({ expectedRevision: 2, recoveryRef: "operator:dead-supervisor" }) })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1", { method: "PATCH", headers: { ...headers, origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 404);
    assert.equal((await request(port, "/api/supervisor/audit-events", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet%252Fescape", { headers })).status, 400);
    assert.equal((await request(port, "/api/supervisor/work-packets/%252e%252e", { headers })).status, 400);
    assert.equal((await request(port, "/api/supervisor/work-items/work-item-1/memory-proposals/proposal-1/%2561i-draft", { method: "POST", headers: { cookie: "session=ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 400);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet-1/learn-follow-up-candidate-work", { method: "POST", headers: { ...headers, origin: "https://dashboard.test" } })).status, 404);
    assert.deepEqual(forwarded, [
      { method: "GET", url: "/pipeline-control-plane/canonical-operational-projection" },
    ]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("operator canonical packet reads preserve a literal percent ID without double-decoding", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-percent-packet-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") {
        response.writeHead(request.headers.cookie === "session=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "operator" }));
        return;
      }
      forwarded.push(request.url);
      if (request.url === "/pipeline-control-plane/work-packets/release%25candidate") {
        response.end(JSON.stringify({ data: canonicalPacketWithRawBrowserUnsafeFields() }));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;

    const response = await request(port, "/api/supervisor/pipeline-control-plane/work-packets/release%25candidate", { headers: { cookie: "session=ok" } });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.packetId, "packet-1");
    assert.deepEqual(forwarded, ["/pipeline-control-plane/work-packets/release%25candidate"]);
    assert.equal((await request(port, "/api/supervisor/pipeline-control-plane/work-packets/%252e%252e", { headers: { cookie: "session=ok" } })).status, 400);
    assert.deepEqual(forwarded, ["/pipeline-control-plane/work-packets/release%25candidate"]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("Controls has a finite operator-only no-query proxy contract with a capped read response", async () => {
  assert.equal(CONTROLS_READ_PATHS.size, 33);
  assert.equal(CONTROLS_READ_PATHS.has("/supervisor/epic-6-completion-audit-report"), false);
  assert.deepEqual([...CONTROLS_MUTATION_PATHS], [
    "/pipeline-control-plane/actions/v1/capability",
    "/pipeline-control-plane/approvals/v1",
    "/pipeline-control-plane/actions/v1",
  ]);
  const directory = mkdtempSync(join(tmpdir(), "kendall-controls-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") {
        const viewer = request.headers.cookie?.includes("viewer=ok");
        response.writeHead(200).end(JSON.stringify({ authenticated: true, role: viewer ? "test_viewer" : "operator" }));
        return;
      }
      forwarded.push({ method: request.method, url: request.url, csrf: request.headers["x-csrf-token"] || null });
      if (request.url === "/supervisor/status") {
        response.end(JSON.stringify({ data: { mode: "running" } }));
        return;
      }
      if (request.url === "/supervisor/report-catalog") {
        response.end(JSON.stringify({ data: { report: "x".repeat(1024 * 1024) } }));
        return;
      }
      if (CONTROLS_MUTATION_PATHS.has(request.url)) {
        response.end(JSON.stringify({ data: { capabilityState: "available" } }));
        return;
      }
      response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    const operator = { cookie: "session=ok; kendall_operator_csrf=csrf-ok" };
    assert.equal((await request(port, "/api/supervisor/supervisor/status", { headers: operator })).status, 200);
    assert.equal((await request(port, "/api/supervisor/supervisor/status?extra=1", { headers: operator })).status, 404);
    assert.equal((await request(port, "/api/supervisor/supervisor/status", { method: "POST", headers: operator })).status, 405);
    assert.equal((await request(port, "/api/supervisor/supervisor/status", { headers: { cookie: "viewer=ok" } })).status, 404);
    for (const targetPath of CONTROLS_MUTATION_PATHS) {
      const path = `/api/supervisor${targetPath}`;
      assert.equal((await request(port, path, { method: "POST", headers: { ...operator, origin: "https://dashboard.test", "x-csrf-token": "wrong" } })).status, 403);
      assert.equal((await request(port, `${path}?extra=1`, { method: "POST", headers: { ...operator, origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 404);
      assert.equal((await request(port, path, { method: "GET", headers: { ...operator, origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 405);
      assert.equal((await request(port, path, { method: "POST", headers: { cookie: "viewer=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 404);
      assert.equal((await request(port, path, { method: "POST", headers: { ...operator, origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 200);
    }
    assert.equal((await request(port, "/api/supervisor/supervisor/report-catalog", { headers: operator })).status, 503);
    assert.deepEqual(forwarded.map(({ method, url }) => ({ method, url })), [
      { method: "GET", url: "/supervisor/status" },
      { method: "POST", url: "/pipeline-control-plane/actions/v1/capability" },
      { method: "POST", url: "/pipeline-control-plane/approvals/v1" },
      { method: "POST", url: "/pipeline-control-plane/actions/v1" },
      { method: "GET", url: "/supervisor/report-catalog" },
    ]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("Memory Inbox reads are exact operator-only, no-query proxy capabilities", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-memory-inbox-shell-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") {
        const viewer = request.headers.cookie?.includes("viewer=ok");
        response.writeHead(200).end(JSON.stringify({ authenticated: true, role: viewer ? "test_viewer" : "operator" }));
        return;
      }
      forwarded.push({ method: request.method, url: request.url });
      response.end(JSON.stringify({ data: { schemaVersion: "kendall-memory-inbox-shell/v1", state: "unavailable", freshness: "current", nextSafeAction: "refresh_memory_inbox" } }));
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    for (const target of ["shell", "projection"]) {
      const path = `/api/supervisor/memory-inbox/${target}`;
      assert.equal((await request(port, path, { headers: { cookie: "operator=ok" } })).status, 200);
      assert.equal((await request(port, path, { method: "POST", body: "{}", headers: { cookie: "operator=ok", origin: "https://dashboard.test", "content-type": "application/json" } })).status, 405);
      assert.equal((await request(port, `${path}?state=inbox`, { headers: { cookie: "operator=ok" } })).status, 404);
      assert.equal((await request(port, path, { headers: { cookie: "viewer=ok" } })).status, 404);
    }
    const readerPath = "/api/supervisor/memory-inbox/proposals/proposal-1/revisions/1/reader";
    assert.equal((await request(port, readerPath, { headers: { cookie: "operator=ok" } })).status, 200);
    assert.equal((await request(port, readerPath, { method: "POST", headers: { cookie: "operator=ok", origin: "https://dashboard.test" } })).status, 405);
    assert.equal((await request(port, `${readerPath}?extra=1`, { headers: { cookie: "operator=ok" } })).status, 404);
    assert.equal((await request(port, readerPath, { headers: { cookie: "viewer=ok" } })).status, 404);
    const operator = { cookie: "operator=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok", "content-type": "application/json" };
    for (const decision of ["return", "deny", "approve"]) {
      const path = `/api/supervisor/memory-inbox/proposals/proposal-1/${decision}`;
      assert.equal((await request(port, path, { method: "GET", headers: operator })).status, 405);
      assert.equal((await request(port, `${path}?extra=1`, { method: "POST", headers: operator })).status, 404);
      assert.equal((await request(port, path, { method: "POST", headers: { ...operator, "x-csrf-token": "wrong" } })).status, 403);
      assert.equal((await request(port, path, { method: "POST", headers: { cookie: "viewer=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 404);
      assert.equal((await request(port, path, { method: "POST", body: "{}", headers: operator })).status, 200);
    }
    assert.deepEqual(forwarded, [
      { method: "GET", url: "/memory-inbox/shell" },
      { method: "GET", url: "/memory-inbox/projection" },
      { method: "GET", url: "/memory-inbox/proposals/proposal-1/revisions/1/reader" },
      { method: "POST", url: "/memory-inbox/proposals/proposal-1/return" },
      { method: "POST", url: "/memory-inbox/proposals/proposal-1/deny" },
      { method: "POST", url: "/memory-inbox/proposals/proposal-1/approve" },
    ]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("Memory Inbox text capture is an exact operator-only CSRF capability", async () => {
  assert.deepEqual([...MEMORY_INBOX_MUTATION_PATHS], ["/memory-inbox/text-capture"]);
  const directory = mkdtempSync(join(tmpdir(), "kendall-memory-inbox-capture-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") {
        const viewer = request.headers.cookie?.includes("viewer=ok");
        response.writeHead(200).end(JSON.stringify({ authenticated: true, role: viewer ? "test_viewer" : "operator" }));
        return;
      }
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        forwarded.push({ method: request.method, url: request.url, body: Buffer.concat(chunks).toString("utf8") });
        response.end(JSON.stringify({ data: { schemaVersion: "kendall-memory-inbox-capture/v1", sourceId: "inbox-source:opaque", lifecycleState: "Unprocessed", nextSafeAction: "create_draft" } }));
      });
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    const path = "/api/supervisor/memory-inbox/text-capture";
    const operator = { cookie: "operator=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok", "content-type": "application/json" };
    assert.equal((await request(port, path, { method: "GET", headers: operator })).status, 405);
    assert.equal((await request(port, `${path}?extra=1`, { method: "POST", headers: operator })).status, 404);
    assert.equal((await request(port, path, { method: "POST", headers: { ...operator, "x-csrf-token": "wrong" } })).status, 403);
    assert.equal((await request(port, path, { method: "POST", headers: { cookie: "viewer=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok" } })).status, 404);
    const body = JSON.stringify({ text: "non-sensitive", acknowledgedNonSensitive: true, idempotencyKey: "capture-test-key-0001" });
    assert.equal((await request(port, path, { method: "POST", body, headers: operator })).status, 200);
    assert.deepEqual(forwarded, [{ method: "POST", url: "/memory-inbox/text-capture", body }]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("the disabled Memory Inbox upload path rejects queried and bodied attempts before proxy buffering or supervisor forwarding", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-memory-inbox-upload-gate-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      forwarded.push({ method: request.method, url: request.url });
      response.end(JSON.stringify({ authenticated: true, role: "operator" }));
    });
    await listen(supervisor, socketPath);
    const proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    const rawDocument = "private document bytes that must not be buffered";
    const response = await request(port, "/api/supervisor/memory-inbox/upload", {
      method: "POST", body: rawDocument,
      headers: { cookie: "operator=ok", origin: "https://dashboard.test", "content-type": "application/octet-stream" },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.connection, "close");
    const queriedResponse = await request(port, "/api/supervisor/memory-inbox/upload?enabled=false", {
      method: "POST", body: rawDocument,
      headers: { cookie: "operator=ok", origin: "https://dashboard.test", "content-type": "application/octet-stream" },
    });
    assert.equal(queriedResponse.status, 404);
    assert.equal(queriedResponse.headers.connection, "close");
    assert.deepEqual(forwarded, []);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});
