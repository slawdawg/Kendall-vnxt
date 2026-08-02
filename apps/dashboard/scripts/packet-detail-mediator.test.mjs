import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPacketDetailMediator } from "./packet-detail-mediator.mjs";

function listen(server, target) {
  return new Promise((resolve) => server.listen(target, resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: options.headers, timeout: 3000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function unavailableWorkGraph(packetId) {
  return {
    schemaVersion: "parallel-work-graph-evidence/v0",
    sourceSchemaVersion: "parallel-execution-graph-reservation/v1",
    availability: "unavailable",
    packetId,
    executionJobId: null,
    reportIdentity: null,
    generatedAt: null,
    freshnessState: "unavailable",
    waveMembership: "unavailable",
    dependencyState: "unavailable",
    reservation: { status: "unavailable", owner: null, reasonCode: "parallel_report_unavailable" },
    capacity: { posture: "unavailable", reasonCode: "parallel_capacity_unavailable" },
    reason: "No current supervisor-validated parallel wave evidence is available for this packet.",
    nextSafeAction: "Refresh the advisory planning evidence; this detail does not dispatch work, call a provider, or establish delivery eligibility.",
    evidenceRefs: [],
    metadataOnly: true,
    rawPayloadRetained: false,
    retention: "metadata_only_evidence_references",
  };
}

test("mediates one fixed authenticated UDS GET with no-store and stable denial", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-packet-detail-"));
  const socketPath = join(directory, "supervisor.sock");
  const observed = [];
  let sessionRevokedAfterRead = false;
  const supervisor = http.createServer((req, res) => {
    observed.push({ method: req.method, url: req.url, cookie: req.headers.cookie, mediator: req.headers["x-kendall-dashboard-mediator"] });
    if (!req.headers.cookie) {
      res.writeHead(401).end(JSON.stringify({ detail: "Sign-in required." }));
      return;
    }
    res.setHeader("content-type", "application/json");
    if (req.url === "/auth/session") {
      if (sessionRevokedAfterRead) {
        res.writeHead(401).end(JSON.stringify({ authenticated: false }));
        return;
      }
      res.end(JSON.stringify({ authenticated: true, role: "test_viewer" }));
      return;
    }
    const packetId = decodeURIComponent(req.url.split("/").at(-1));
    if (packetId === "revoked-after-read") sessionRevokedAfterRead = true;
    const workGraph = unavailableWorkGraph(packetId);
    if (packetId === "malformed") workGraph.reason = "raw provider payload copied here";
    if (packetId === "bad-report-identity") workGraph.reportIdentity = "report:unsafe";
    if (packetId === "nested-extra") workGraph.reservation.secretToken = "forbidden";
    if (packetId === "packet-extra") {
      res.end(JSON.stringify({ schemaVersion: "kendall-authenticated-packet-detail/v1", state: "available", packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null, workGraph, rawPayload: "forbidden" } }));
      return;
    }
    if (packetId === "top-level-extra") {
      res.end(JSON.stringify({ schemaVersion: "kendall-authenticated-packet-detail/v1", state: "available", packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null, workGraph }, rawPayload: "forbidden" }));
      return;
    }
    if (packetId === "unavailable-extra") {
      res.end(JSON.stringify({ schemaVersion: "kendall-authenticated-packet-detail/v1", state: "unavailable", packet: { rawPayload: "forbidden" } }));
      return;
    }
    if (packetId === "legacy") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null },
      }));
      return;
    }
    if (packetId === "legacy-extra") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null, rawPayload: "forbidden" },
      }));
      return;
    }
    if (packetId === "legacy-raw") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: { packetId, title: "raw provider payload copied here", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null },
      }));
      return;
    }
    if (packetId === "legacy-incomplete-evidence") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: { effectiveDecision: "go" } },
      }));
      return;
    }
    if (packetId === "legacy-inverted-evidence") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: {
          packetId,
          title: "Safe title",
          status: "shaping",
          currentStage: "shaping",
          truthLabel: "source_owned",
          evidence: {
            schemaVersion: "pipeline-epic-25-evidence-chain/v1",
            evidenceClass: "source_owned",
            checkedAt: "2026-07-22T12:05:00.000Z",
            expiresAt: "2026-07-22T12:00:00.000Z",
            freshnessState: "fresh",
            effectiveDecision: "hold",
            typedBlockers: [],
          },
        },
      }));
      return;
    }
    if (["legacy-equal-evidence", "legacy-long-evidence", "legacy-offset-evidence"].includes(packetId)) {
      const evidence = {
        schemaVersion: "pipeline-epic-25-evidence-chain/v1",
        evidenceClass: "source_owned",
        checkedAt: "2026-07-22T12:00:00.000Z",
        expiresAt: "2026-07-22T12:05:00.000Z",
        freshnessState: "fresh",
        effectiveDecision: "hold",
        typedBlockers: [],
      };
      if (packetId === "legacy-equal-evidence") evidence.expiresAt = evidence.checkedAt;
      if (packetId === "legacy-long-evidence") evidence.expiresAt = "2026-07-22T12:05:00.000001Z";
      if (packetId === "legacy-offset-evidence") evidence.checkedAt = "2026-07-22T12:00:00+00:00";
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence },
      }));
      return;
    }
    if (packetId === "legacy-microsecond-evidence") {
      res.end(JSON.stringify({
        schemaVersion: "kendall-authenticated-packet-detail/v1",
        state: "available",
        packet: {
          packetId,
          title: "Safe title",
          status: "shaping",
          currentStage: "shaping",
          truthLabel: "source_owned",
          evidence: {
            schemaVersion: "pipeline-epic-25-evidence-chain/v1",
            evidenceClass: "source_owned",
            checkedAt: "2026-07-22T12:00:00.123456Z",
            expiresAt: "2026-07-22T12:05:00.123456Z",
            freshnessState: "fresh",
            effectiveDecision: "hold",
            typedBlockers: [],
          },
        },
      }));
      return;
    }
    res.end(JSON.stringify({
      schemaVersion: "kendall-authenticated-packet-detail/v1",
      state: "available",
      packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null, workGraph },
    }));
  });
  await listen(supervisor, socketPath);

  let mediator;
  const dashboard = http.createServer(async (req, res) => {
    if (mediator && await mediator(req, res)) return;
    res.writeHead(404).end();
  });
  await listen(dashboard, 0);
  const port = dashboard.address().port;
  mediator = createPacketDetailMediator({ supervisorUdsPath: socketPath, expectedHost: `127.0.0.1:${port}` });

  const allowed = await request(port, "/api/packet-detail/packet-1", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers["cache-control"], "no-store");
  assert.equal(allowed.body.packet.packetId, "packet-1");
  assert.deepEqual(observed, [
    { method: "GET", url: "/internal/dashboard/packet-detail/packet-1", cookie: "kendall_operator_session=opaque", mediator: "packet-detail/v1" },
    { method: "GET", url: "/auth/session", cookie: "kendall_operator_session=opaque", mediator: undefined },
  ]);

  const colonId = await request(port, "/api/packet-detail/packet%3A1", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(colonId.status, 200);
  assert.equal(colonId.body.packet.packetId, "packet:1");
  assert.equal(observed.length, 4);

  const revokedDuringRead = await request(port, "/api/packet-detail/revoked-after-read", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(revokedDuringRead.status, 401);
  assert.deepEqual(revokedDuringRead.body, { state: "sign_in_required" });
  sessionRevokedAfterRead = false;

  const legacy = await request(port, "/api/packet-detail/legacy", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacy.status, 200);
  assert.equal(legacy.body.packet.workGraph.availability, "unavailable");
  assert.equal(legacy.body.packet.workGraph.packetId, "legacy");
  assert.equal(legacy.body.packet.workGraph.rawPayloadRetained, false);

  const legacyExtra = await request(port, "/api/packet-detail/legacy-extra", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacyExtra.status, 503);
  assert.deepEqual(legacyExtra.body, { state: "unavailable", message: "Attestation readback unavailable" });

  const legacyRaw = await request(port, "/api/packet-detail/legacy-raw", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacyRaw.status, 503);
  assert.deepEqual(legacyRaw.body, { state: "unavailable", message: "Attestation readback unavailable" });

  const legacyIncompleteEvidence = await request(port, "/api/packet-detail/legacy-incomplete-evidence", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacyIncompleteEvidence.status, 503);
  assert.deepEqual(legacyIncompleteEvidence.body, { state: "unavailable", message: "Attestation readback unavailable" });

  const legacyInvertedEvidence = await request(port, "/api/packet-detail/legacy-inverted-evidence", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacyInvertedEvidence.status, 503);
  assert.deepEqual(legacyInvertedEvidence.body, { state: "unavailable", message: "Attestation readback unavailable" });

  for (const packetId of ["legacy-equal-evidence", "legacy-long-evidence", "legacy-offset-evidence"]) {
    const response = await request(port, `/api/packet-detail/${packetId}`, { headers: { cookie: "kendall_operator_session=opaque" } });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { state: "unavailable", message: "Attestation readback unavailable" });
  }

  const legacyMicrosecondEvidence = await request(port, "/api/packet-detail/legacy-microsecond-evidence", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(legacyMicrosecondEvidence.status, 200);
  assert.equal(legacyMicrosecondEvidence.body.packet.workGraph.availability, "unavailable");

  const malformed = await request(port, "/api/packet-detail/malformed", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(malformed.status, 503);
  assert.deepEqual(malformed.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const badReportIdentity = await request(port, "/api/packet-detail/bad-report-identity", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(badReportIdentity.status, 503);
  assert.deepEqual(badReportIdentity.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const packetExtra = await request(port, "/api/packet-detail/packet-extra", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(packetExtra.status, 503);
  assert.deepEqual(packetExtra.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const topLevelExtra = await request(port, "/api/packet-detail/top-level-extra", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(topLevelExtra.status, 503);
  assert.deepEqual(topLevelExtra.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const nestedExtra = await request(port, "/api/packet-detail/nested-extra", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(nestedExtra.status, 503);
  assert.deepEqual(nestedExtra.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const unavailableExtra = await request(port, "/api/packet-detail/unavailable-extra", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(unavailableExtra.status, 503);
  assert.deepEqual(unavailableExtra.body, { state: "unavailable", message: "Attestation readback unavailable" });

  const denied = await request(port, "/api/packet-detail/does-not-exist");
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.body, { state: "sign_in_required" });
  assert.equal(observed.length, 36);

  const mutation = await request(port, "/api/packet-detail/packet-1", { method: "POST" });
  assert.equal(mutation.status, 405);
  const forwarded = await request(port, "/api/packet-detail/packet-1", { headers: { "x-forwarded-for": "127.0.0.1" } });
  assert.equal(forwarded.status, 400);
  assert.equal(observed.length, 36);

  await close(dashboard);
  await close(supervisor);
});

test("maps UDS timeout and in-flight exhaustion to bounded unavailable state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-packet-detail-timeout-"));
  const socketPath = join(directory, "supervisor.sock");
  const supervisor = http.createServer((_req, res) => {
    const trickle = setInterval(() => res.write(" "), 5);
    res.on("close", () => clearInterval(trickle));
  });
  await listen(supervisor, socketPath);
  let mediator;
  const dashboard = http.createServer(async (req, res) => { if (await mediator(req, res)) return; res.writeHead(404).end(); });
  await listen(dashboard, 0);
  const port = dashboard.address().port;
  mediator = createPacketDetailMediator({ supervisorUdsPath: socketPath, expectedHost: `127.0.0.1:${port}`, timeoutMs: 25, maxInFlight: 1 });
  const first = request(port, "/api/packet-detail/packet-1", { headers: { cookie: "session=x" } });
  const second = await request(port, "/api/packet-detail/packet-1", { headers: { cookie: "session=y" } });
  assert.equal(second.status, 503);
  assert.deepEqual(second.body, { state: "unavailable", message: "Attestation readback unavailable" });
  const firstResult = await first;
  assert.equal(firstResult.status, 503);
  assert.equal(firstResult.headers["cache-control"], "no-store");
  await close(dashboard);
  await close(supervisor);
});
