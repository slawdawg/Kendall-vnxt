import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMemoryInboxUploadProxy, MEMORY_INBOX_UPLOAD_PATH } from "./memory-inbox-upload-proxy.mjs";

function listen(server, target) { return new Promise((resolve) => server.listen(target, resolve)); }
function close(server) { return new Promise((resolve) => server.close(resolve)); }
function request(port, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function fixture({ sessionRole = () => "operator", upload = (_request, response) => response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } })), proxyOptions = {}, useCheckContinue = false, onDashboardRequest } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "kendall-upload-ingress-"));
  const socketPath = join(directory, "supervisor.sock");
  const forwarded = [];
  let sessionCalls = 0;
  const supervisor = http.createServer(async (request, response) => {
    if (request.url === "/auth/session") {
      sessionCalls += 1;
      const role = await sessionRole(sessionCalls, request);
      response.end(JSON.stringify({ authenticated: Boolean(role), role }));
      return;
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      forwarded.push({ url: request.url, body: Buffer.concat(chunks) });
      upload(request, response);
    });
  });
  await listen(supervisor, socketPath);
  const proxy = createMemoryInboxUploadProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test", ...proxyOptions });
  const route = async (request, response) => {
    onDashboardRequest?.(request, response);
    if (await proxy(request, response)) return;
    response.writeHead(404).end("not found");
  };
  const dashboard = http.createServer(useCheckContinue ? undefined : route);
  if (useCheckContinue) {
    dashboard.on("request", route);
    dashboard.on("checkContinue", route);
  }
  await listen(dashboard, 0);
  return {
    dashboard,
    forwarded,
    get sessionCalls() { return sessionCalls; },
    port: dashboard.address().port,
    async close() { if (dashboard.listening) await close(dashboard); if (supervisor.listening) await close(supervisor); },
  };
}

const operatorHeaders = {
  cookie: "session=ok; kendall_operator_csrf=csrf-ok",
  origin: "https://dashboard.test",
  "x-csrf-token": "csrf-ok",
  "content-type": "text/plain",
};

test("upload ingress revalidates an operator session after intake before forwarding bytes to the fixed UDS", async () => {
  const target = await fixture({ sessionRole: (call) => call === 1 ? "operator" : null });
  try {
    const denied = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "must not forward", operatorHeaders);
    assert.equal(denied.status, 401);
    assert.equal(target.sessionCalls, 2);
    assert.deepEqual(target.forwarded, []);
  } finally { await target.close(); }
});

test("upload ingress accepts the fixed document capability after both session checks", async () => {
  const target = await fixture();
  try {
    const accepted = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", operatorHeaders);
    assert.equal(accepted.status, 200);
    assert.equal(target.sessionCalls, 2);
    assert.deepEqual(target.forwarded.map(({ url, body }) => ({ url, body: body.toString("utf8") })), [{ url: "/memory-inbox/upload", body: "document bytes" }]);
  } finally { await target.close(); }
});

test("upload ingress rejects query-bearing and denied body requests as terminal exchanges", async () => {
  const target = await fixture();
  try {
    const queried = await request(target.port, `${MEMORY_INBOX_UPLOAD_PATH}?enabled=false`, "ignored bytes", operatorHeaders);
    assert.equal(queried.status, 404);
    assert.equal(queried.headers.connection, "close");
    const denied = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "must not forward", { ...operatorHeaders, "x-csrf-token": "wrong" });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.connection, "close");
    assert.deepEqual(target.forwarded, []);
  } finally { await target.close(); }
});

test("unauthenticated requests cannot probe upload content capabilities or reserved capacity", async () => {
  const target = await fixture({ sessionRole: () => null, proxyOptions: { maxConcurrent: 0 } });
  try {
    const denied = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "bytes", { ...operatorHeaders, "content-type": "application/x-probe" });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.connection, "close");
    assert.equal(target.sessionCalls, 1);
    assert.deepEqual(target.forwarded, []);
  } finally { await target.close(); }
});

test("a reserved authorized upload slot is not observable by an unauthenticated request", async () => {
  let releaseUpload;
  let uploadStartedResolve;
  const uploadStarted = new Promise((resolve) => { uploadStartedResolve = resolve; });
  const target = await fixture({
    sessionRole: (_call, request) => request.headers.cookie?.startsWith("session=first") ? "operator" : null,
    upload: (_request, response) => {
      uploadStartedResolve();
      releaseUpload = () => response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } }));
    },
  });
  try {
    const first = request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", { ...operatorHeaders, cookie: "session=first; kendall_operator_csrf=csrf-ok" });
    await uploadStarted;
    const denied = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "probe", { ...operatorHeaders, cookie: "session=second; kendall_operator_csrf=csrf-ok" });
    assert.equal(denied.status, 401);
    assert.deepEqual(target.forwarded.map(({ body }) => body.toString("utf8")), ["document bytes"]);
    releaseUpload();
    assert.equal((await first).status, 200);
  } finally { await target.close(); }
});

test("an authorized Expect request receives 100-continue only through the protected upload dispatcher", async () => {
  const target = await fixture({ useCheckContinue: true });
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: target.port, path: MEMORY_INBOX_UPLOAD_PATH, method: "POST", headers: { ...operatorHeaders, expect: "100-continue", "content-length": 14 } });
      req.on("continue", () => req.end("document bytes"));
      req.on("response", (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      });
      req.on("error", reject);
      req.flushHeaders();
    });
    assert.deepEqual(result, { status: 200, body: JSON.stringify({ data: { sourceId: "inbox-source:opaque" } }) });
    assert.equal(target.sessionCalls, 2);
    assert.equal(target.forwarded[0].body.toString("utf8"), "document bytes");
  } finally { await target.close(); }
});

test("completed intake clears its idle deadline before a slow supervisor response", async () => {
  const target = await fixture({
    proxyOptions: { idleTimeoutMs: 15 },
    upload: (_request, response) => setTimeout(() => response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } })), 50),
  });
  try {
    const accepted = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", operatorHeaders);
    assert.equal(accepted.status, 200);
  } finally { await target.close(); }
});

test("a client disconnect cancels the UDS upload promptly and releases the reserved slot", async () => {
  let firstUploadStarted;
  let upstreamClosed;
  const firstStarted = new Promise((resolve) => { firstUploadStarted = resolve; });
  const closed = new Promise((resolve) => { upstreamClosed = resolve; });
  let uploads = 0;
  const target = await fixture({
    upload: (_request, response) => {
      uploads += 1;
      if (uploads === 1) {
        firstUploadStarted();
        response.once("close", upstreamClosed);
        return;
      }
      response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } }));
    },
  });
  try {
    const abandoned = http.request({ hostname: "127.0.0.1", port: target.port, path: MEMORY_INBOX_UPLOAD_PATH, method: "POST", headers: { ...operatorHeaders, "content-length": 14 } });
    abandoned.on("error", () => {});
    abandoned.end("document bytes");
    await firstStarted;
    abandoned.destroy();
    await closed;
    const replacement = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", operatorHeaders);
    assert.equal(replacement.status, 200);
    assert.equal(uploads, 2);
  } finally { await target.close(); }
});

test("a client disconnect during delayed revalidation cannot open the UDS upload and releases its slot", async () => {
  let revalidationStarted;
  let releaseRevalidation;
  let dashboardAborted;
  const revalidation = new Promise((resolve) => { revalidationStarted = resolve; });
  const release = new Promise((resolve) => { releaseRevalidation = resolve; });
  const aborted = new Promise((resolve) => { dashboardAborted = resolve; });
  const target = await fixture({
    sessionRole: async (call) => {
      if (call === 1) return "operator";
      revalidationStarted();
      await release;
      return "operator";
    },
    onDashboardRequest: (_request, response) => response.once("close", dashboardAborted),
  });
  try {
    const abandoned = http.request({ hostname: "127.0.0.1", port: target.port, path: MEMORY_INBOX_UPLOAD_PATH, method: "POST", headers: { ...operatorHeaders, "content-length": 14 } });
    abandoned.on("error", () => {});
    abandoned.end("document bytes");
    await revalidation;
    abandoned.destroy();
    await aborted;
    // Allow the delayed session response to complete. The disconnect fence must
    // already have released capacity and forbidden the mutation-capable hop.
    releaseRevalidation();
    const replacement = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", operatorHeaders);
    assert.equal(replacement.status, 200);
    assert.deepEqual(target.forwarded.map(({ body }) => body.toString("utf8")), ["document bytes"]);
  } finally { await target.close(); }
});

test("one upload slot uses one intake-to-supervisor deadline rather than a second forwarding window", async () => {
  let uploads = 0;
  const target = await fixture({
    proxyOptions: { timeoutMs: 150, idleTimeoutMs: 120 },
    upload: (_request, response) => {
      uploads += 1;
      if (uploads === 1) return;
      response.end(JSON.stringify({ data: { sourceId: "inbox-source:opaque" } }));
    },
    useCheckContinue: true,
  });
  try {
    const startedAt = Date.now();
    const timedOut = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: target.port, path: MEMORY_INBOX_UPLOAD_PATH, method: "POST", headers: { ...operatorHeaders, expect: "100-continue", "content-length": 14 } });
      req.once("continue", () => {
        req.write("document ");
        setTimeout(() => req.end("bytes"), 80);
      });
      req.once("response", (response) => {
        response.resume();
        response.once("end", () => resolve({ status: response.statusCode, elapsed: Date.now() - startedAt }));
      });
      req.once("error", reject);
      req.flushHeaders();
    });
    assert.equal(timedOut.status, 408);
    // Intake consumed about 80ms, so the old two-window implementation would
    // hold capacity for roughly 230ms. Leave scheduler headroom but prove the
    // forwarding phase used only the remaining end-to-end budget.
    assert.ok(timedOut.elapsed < 220, `upload slot was held for ${timedOut.elapsed}ms`);
    const replacement = await request(target.port, MEMORY_INBOX_UPLOAD_PATH, "document bytes", operatorHeaders);
    assert.equal(replacement.status, 200);
    assert.equal(uploads, 2);
  } finally { await target.close(); }
});
