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
  let proxy;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") { response.writeHead(request.headers.cookie === "session=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "operator" })); return; }
      if (request.url === "/pipeline-control-plane/work-packets") { response.end(JSON.stringify({ data: [{ packetId: "packet-1" }] })); return; }
      if (request.url === "/work-packets") { response.end(JSON.stringify({ data: [{ packetId: "legacy-packet-1" }] })); return; }
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
    assert.deepEqual(allowed.body.data, [{ packetId: "packet-1" }]);
    const canonicalMutation = await request(port, "/api/supervisor/pipeline-control-plane/work-packets", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(canonicalMutation.status, 405);
    const projectionMutation = await request(port, "/api/supervisor/pipeline-control-plane/projection", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(projectionMutation.status, 405);
    const legacy = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok" } });
    assert.equal(legacy.status, 200);
    assert.deepEqual(legacy.body.data, [{ packetId: "legacy-packet-1" }]);
    const runtimeEvidenceReview = await request(port, "/api/supervisor/supervisor/runtime-evidence-review-report", { headers: { cookie: "session=ok" } });
    assert.equal(runtimeEvidenceReview.status, 200);
    const savedViews = await request(port, "/api/supervisor/operator-views?scope=queue", { headers: { cookie: "session=ok" } });
    assert.equal(savedViews.status, 200);
    assert.deepEqual(forwarded, ["/operator-views?scope=queue"]);
    const savedViewsExtra = await request(port, "/api/supervisor/operator-views?scope=queue&extra=1", { headers: { cookie: "session=ok" } });
    assert.equal(savedViewsExtra.status, 404);
    assert.deepEqual(forwarded, ["/operator-views?scope=queue"]);
    const legacyMutation = await request(port, "/api/supervisor/work-packets/legacy-packet-1", { method: "POST", headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}` } });
    assert.equal(legacyMutation.status, 405);
    const denied = await request(port, "/api/supervisor/pipeline-control-plane/work-packets");
    assert.equal(denied.status, 401);
    const forwardedRequest = await request(port, "/api/supervisor/work-packets", { headers: { cookie: "session=ok", "x-forwarded-for": "127.0.0.1" } });
    assert.equal(forwardedRequest.status, 400);
    const unknown = await request(port, "/api/supervisor/private-admin", { headers: { cookie: "session=ok" } });
    assert.equal(unknown.status, 404);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("authenticated POST forwards the follow-up subresource exactly and rejects unknown targets", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-supervisor-proxy-follow-up-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let supervisor;
  let proxy;
  let dashboard;
  try {
    supervisor = http.createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (request.url === "/auth/session") {
          response.writeHead(request.headers.cookie === "session=ok" ? 200 : 401).end(JSON.stringify({ authenticated: true, role: "operator" }));
          return;
        }
        forwarded.push({ method: request.method, url: request.url, body, origin: request.headers.origin || null, csrf: request.headers["x-csrf-token"] || null });
        if (request.url === "/work-packets/packet-1/learn-follow-up-candidate-work") {
          response.end(JSON.stringify({ data: { candidateWorkId: "candidate-1" } }));
          return;
        }
        response.writeHead(404).end(JSON.stringify({ detail: "not found" }));
      });
    });
    await listen(supervisor, socketPath);
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end(JSON.stringify({ state: "not_found" })); });
    await listen(dashboard, 0);
    const port = dashboard.address().port;
    proxy = createSupervisorProxy({ supervisorUdsPath: socketPath, expectedOrigin: `https://127.0.0.1:${port}` });
    const postBody = JSON.stringify({ source: "dashboard" });

    const unauthenticatedMutation = await request(port, "/api/supervisor/work-packets/packet-1/learn-follow-up-candidate-work", { method: "POST", body: postBody, headers: { origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok" } });
    assert.equal(unauthenticatedMutation.status, 401);
    assert.deepEqual(forwarded, []);

    const mutation = await request(port, "/api/supervisor/work-packets/packet-1/learn-follow-up-candidate-work", { method: "POST", body: postBody, headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok", "content-type": "application/json" } });
    assert.equal(mutation.status, 200);
    assert.deepEqual(mutation.body.data, { candidateWorkId: "candidate-1" });
    assert.deepEqual(forwarded, [{ method: "POST", url: "/work-packets/packet-1/learn-follow-up-candidate-work", body: postBody, origin: `https://127.0.0.1:${port}`, csrf: "csrf-ok" }]);

    const unknown = await request(port, "/api/supervisor/work-packets/packet-1/unknown", { method: "POST", body: postBody, headers: { cookie: "session=ok", origin: `https://127.0.0.1:${port}`, "x-csrf-token": "csrf-ok", "content-type": "application/json" } });
    assert.equal(unknown.status, 404);
    assert.deepEqual(forwarded, [{ method: "POST", url: "/work-packets/packet-1/learn-follow-up-candidate-work", body: postBody, origin: `https://127.0.0.1:${port}`, csrf: "csrf-ok" }]);

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
    assert.equal((await request(port, "/api/supervisor/pipeline-control-plane/projection", { headers })).status, 200);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet-1", { headers })).status, 200);
    assert.equal((await request(port, "/api/supervisor/audit-events", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet%252Fescape", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-packets/%252e%252e", { headers })).status, 404);
    assert.equal((await request(port, "/api/supervisor/work-packets/packet-1/learn-follow-up-candidate-work", { method: "POST", headers: { ...headers, origin: "https://dashboard.test" } })).status, 405);
    assert.deepEqual(forwarded, [
      { method: "GET", url: "/pipeline-control-plane/projection" },
      { method: "GET", url: "/work-packets/packet-1" },
    ]);
  } finally {
    if (dashboard?.listening) await close(dashboard);
    if (supervisor?.listening) await close(supervisor);
  }
});

test("Controls has a finite operator-only no-query proxy contract with a capped read response", async () => {
  assert.equal(CONTROLS_READ_PATHS.size, 34);
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
    assert.deepEqual(forwarded, [{ method: "GET", url: "/memory-inbox/shell" }, { method: "GET", url: "/memory-inbox/projection" }]);
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
