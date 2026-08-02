import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAuthProxy, safeReturnPath, supervisorSessionIsValid, supervisorSessionRole } from "./dashboard-auth-proxy.mjs";

const listen = (server, target) => new Promise((resolve) => server.listen(target, resolve));
const close = (server) => new Promise((resolve) => server.close(resolve));

test("auth proxy forwards only fixed auth routes and preserves safe return paths", async () => {
  assert.equal(safeReturnPath("/pipeline/packets/packet-1?focus=detail"), "/pipeline/packets/packet-1?focus=detail");
  assert.equal(safeReturnPath("https://evil.example/"), "/pipeline");
  assert.equal(safeReturnPath("//evil.example/"), "/pipeline");
  const directory = mkdtempSync(join(tmpdir(), "kendall-auth-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const seen = [];
  const supervisor = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie, origin: req.headers.origin });
    if (req.url === "/auth/login" && req.method === "POST") {
      res.setHeader("set-cookie", "kendall_operator_session=opaque; Secure; HttpOnly; SameSite=Strict");
      res.end(JSON.stringify({ authenticated: true, csrfToken: "csrf-value", role: "operator" }));
      return;
    }
    res.end(JSON.stringify({ authenticated: true, role: "operator" }));
  });
  await listen(supervisor, socketPath);
  let proxy;
  const dashboard = http.createServer(async (req, res) => { if (await proxy(req, res)) return; res.writeHead(404).end(); });
  await listen(dashboard, 0);
  const port = dashboard.address().port;
  proxy = createAuthProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
  const result = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: "/auth/login", method: "POST", headers: { origin: "https://dashboard.test", cookie: "kendall_operator_session=old", "content-type": "application/json" } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end(JSON.stringify({ password: "redacted" }));
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.match(result.headers["set-cookie"][0], /HttpOnly/);
  assert.match(result.headers["set-cookie"][1], /kendall_operator_csrf=/);
  assert.deepEqual(seen, [{ method: "POST", url: "/auth/login", cookie: "kendall_operator_session=old", origin: "https://dashboard.test" }]);
  assert.equal(await supervisorSessionIsValid({ supervisorUdsPath: socketPath, cookie: "kendall_operator_session=opaque" }), true);
  assert.equal(await supervisorSessionRole({ supervisorUdsPath: socketPath, cookie: "kendall_operator_session=opaque" }), "operator");
  assert.equal(await supervisorSessionRole({ supervisorUdsPath: socketPath, cookie: "" }), null);
  await close(dashboard);
  await close(supervisor);
});

test("auth proxy forwards logout session and CSRF cookies and clears both on success", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-auth-logout-proxy-"));
  const socketPath = join(directory, "supervisor.sock");
  const seen = [];
  const supervisor = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie, csrf: req.headers["x-csrf-token"], origin: req.headers.origin });
    res.setHeader("set-cookie", ["kendall_operator_session=; Max-Age=0; Secure; HttpOnly; SameSite=Strict; Path=/"]);
    res.end(JSON.stringify({ signedOut: true }));
  });
  await listen(supervisor, socketPath);
  let proxy;
  const dashboard = http.createServer(async (req, res) => { if (await proxy(req, res)) return; res.writeHead(404).end(); });
  await listen(dashboard, 0);
  const port = dashboard.address().port;
  proxy = createAuthProxy({ supervisorUdsPath: socketPath, expectedOrigin: "https://dashboard.test" });
  const result = await new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/auth/logout",
      method: "POST",
      headers: {
        origin: "https://dashboard.test",
        cookie: "kendall_operator_session=session-value; kendall_operator_csrf=csrf-value",
        "x-csrf-token": "csrf-value",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
  assert.equal(result.status, 200);
  assert.equal(result.body, JSON.stringify({ signedOut: true }));
  assert.deepEqual(seen, [{
    method: "POST",
    url: "/auth/logout",
    cookie: "kendall_operator_session=session-value; kendall_operator_csrf=csrf-value",
    csrf: "csrf-value",
    origin: "https://dashboard.test",
  }]);
  assert.equal(result.headers["set-cookie"].length, 2);
  assert.match(result.headers["set-cookie"][0], /kendall_operator_session=.*Max-Age=0/);
  assert.match(result.headers["set-cookie"][1], /kendall_operator_csrf=; Max-Age=0/);
  await close(dashboard);
  await close(supervisor);
});
