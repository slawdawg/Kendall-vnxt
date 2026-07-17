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

test("mediates one fixed authenticated UDS GET with no-store and stable denial", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-packet-detail-"));
  const socketPath = join(directory, "supervisor.sock");
  const observed = [];
  const supervisor = http.createServer((req, res) => {
    observed.push({ method: req.method, url: req.url, cookie: req.headers.cookie, mediator: req.headers["x-kendall-dashboard-mediator"] });
    if (!req.headers.cookie) {
      res.writeHead(401).end(JSON.stringify({ detail: "Sign-in required." }));
      return;
    }
    res.setHeader("content-type", "application/json");
    const packetId = decodeURIComponent(req.url.split("/").at(-1));
    res.end(JSON.stringify({
      schemaVersion: "kendall-authenticated-packet-detail/v1",
      state: "available",
      packet: { packetId, title: "Safe title", status: "shaping", currentStage: "shaping", truthLabel: "source_owned", evidence: null },
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
  assert.deepEqual(observed, [{ method: "GET", url: "/internal/dashboard/packet-detail/packet-1", cookie: "kendall_operator_session=opaque", mediator: "packet-detail/v1" }]);

  const colonId = await request(port, "/api/packet-detail/packet%3A1", { headers: { cookie: "kendall_operator_session=opaque" } });
  assert.equal(colonId.status, 200);
  assert.equal(colonId.body.packet.packetId, "packet:1");
  assert.equal(observed.length, 2);

  const denied = await request(port, "/api/packet-detail/does-not-exist");
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.body, { state: "sign_in_required" });
  assert.equal(observed.length, 2);

  const mutation = await request(port, "/api/packet-detail/packet-1", { method: "POST" });
  assert.equal(mutation.status, 405);
  const forwarded = await request(port, "/api/packet-detail/packet-1", { headers: { "x-forwarded-for": "127.0.0.1" } });
  assert.equal(forwarded.status, 400);
  assert.equal(observed.length, 2);

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
