import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSupervisorProxy } from "./dashboard-supervisor-proxy.mjs";

function listen(server, target) { return new Promise((resolve) => server.listen(target, resolve)); }
function close(server) { return new Promise((resolve) => server.close(resolve)); }
function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: options.method || "GET", headers: options.headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test("session-aware supervisor proxy forwards authenticated LAN API traffic over the fixed UDS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-supervisor-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const supervisor = http.createServer((request, response) => {
    if (request.url === "/auth/session") { response.writeHead(request.headers.cookie === "session=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true })); return; }
    if (request.url === "/work-packets") { response.end(JSON.stringify({ data: [{ packetId: "packet-1" }] })); return; }
    response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
  });
  await listen(supervisor, socketPath);
  let proxy;
  const dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(); });
  await listen(dashboard, 0);
  const port = dashboard.address().port;
  proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: `https://127.0.0.1:${port}` });
  const allowed = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok" } });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body.data, [{ packetId: "packet-1" }]);
  const denied = await request(port, "/api/supervisor/work-packets");
  assert.equal(denied.status, 401);
  const forwarded = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok", "x-forwarded-for": "127.0.0.1" } });
  assert.equal(forwarded.status, 400);
  await close(dashboard);
  await close(supervisor);
});
