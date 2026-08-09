import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMemoryInboxUploadProxy, MEMORY_INBOX_UPLOAD_PATH } from "./memory-inbox-upload-proxy.mjs";

function listen(server, target) { return new Promise((resolve) => server.listen(target, resolve)); }
function close(server) { return new Promise((resolve) => server.close(resolve)); }
function request(port, path, body, headers) { return new Promise((resolve, reject) => { const req = http.request({ hostname: "127.0.0.1", port, path, method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } }, (res) => { const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") })); }); req.on("error", reject); req.end(body); }); }

test("upload ingress checks operator session and CSRF before streaming bytes to the fixed UDS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-upload-ingress-")); const socketPath = join(directory, "supervisor.sock");
  let supervisor; let dashboard; const received = [];
  try {
    supervisor = http.createServer((request, response) => {
      if (request.url === "/auth/session") return response.end(JSON.stringify({ authenticated: request.headers.cookie === "session=ok; kendall_operator_csrf=csrf-ok", role: "operator" }));
      request.on("data", (chunk) => received.push(chunk)); request.on("end", () => response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } })));
    });
    await listen(supervisor, socketPath);
    const proxy = createMemoryInboxUploadProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
    dashboard = http.createServer(async (request, response) => { if (await proxy(request, response)) return; response.writeHead(404).end("not found"); });
    await listen(dashboard, 0); const port = dashboard.address().port;
    const headers = { cookie: "session=ok; kendall_operator_csrf=csrf-ok", origin: "https://dashboard.test", "x-csrf-token": "csrf-ok", "content-type": "text/plain" };
    const accepted = await request(port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", headers);
    assert.equal(accepted.status, 200); assert.equal(Buffer.concat(received).toString("utf8"), "document bytes");
    received.length = 0;
    const denied = await request(port, MEMORY_INBOX_UPLOAD_PATH, "must not forward", { ...headers, "x-csrf-token": "wrong" });
    assert.equal(denied.status, 403); assert.equal(received.length, 0);
  } finally { if (dashboard?.listening) await close(dashboard); if (supervisor?.listening) await close(supervisor); }
});
