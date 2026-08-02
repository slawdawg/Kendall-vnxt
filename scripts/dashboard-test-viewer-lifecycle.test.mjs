import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "./dashboard-test-viewer-lifecycle.mjs";

function listen(server, target) { return new Promise((resolve) => server.listen(target, resolve)); }
function close(server) { return new Promise((resolve) => server.close(resolve)); }

test("local helper generates a private secret, uses only the fixed UDS lifecycle, and revokes it", async () => {
  const authDir = mkdtempSync(join(tmpdir(), "kendall-test-viewer-"));
  const socketPath = join(authDir, "supervisor.sock");
  const passwordPath = join(authDir, "test-viewer-password");
  const requests = [];
  let enabled = false;
  let configured = false;
  const supervisor = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({ method: request.method, url: request.url, action: payload.action, passwordLength: typeof payload.password === "string" ? payload.password.length : null });
      if (payload.action === "enable" || payload.action === "rotate") { enabled = true; configured = true; }
      if (payload.action === "revoke") enabled = false;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ schemaVersion: "kendall-test-viewer-lifecycle/v1", role: "test_viewer", configured, enabled, rotated: payload.action === "rotate" }));
    });
  });
  try {
    await listen(supervisor, socketPath);
    const environment = { KENDALL_LAN_AUTH_DIR: authDir, KENDALL_SUPERVISOR_UDS_PATH: socketPath, KENDALL_TEST_VIEWER_PASSWORD_FILE: passwordPath };
    const enabled = await main(["enable"], environment);
    assert.equal(enabled.enabled, true);
    assert.equal(statSync(passwordPath).mode & 0o777, 0o600);
    const first = readFileSync(passwordPath, "utf8");
    assert.match(first, /^[A-Za-z0-9_-]{40,}\n$/);
    await main(["rotate"], environment);
    const rotated = readFileSync(passwordPath, "utf8");
    assert.notEqual(rotated, first);
    const revoked = await main(["revoke"], environment);
    assert.equal(revoked.enabled, false);
    assert.equal(existsSync(passwordPath), false);
    assert.deepEqual(requests.map(({ method, url, action }) => ({ method, url, action })), [
      { method: "POST", url: "/internal/lan-auth/test-viewer", action: "status" },
      { method: "POST", url: "/internal/lan-auth/test-viewer", action: "enable" },
      { method: "POST", url: "/internal/lan-auth/test-viewer", action: "rotate" },
      { method: "POST", url: "/internal/lan-auth/test-viewer", action: "revoke" },
    ]);
    assert.ok(requests.filter((request) => ["enable", "rotate"].includes(request.action)).every((request) => request.passwordLength >= 40));
  } finally {
    if (supervisor.listening) await close(supervisor);
  }
});

test("reclaims a stale private lifecycle lock without exposing the credential", async () => {
  const authDir = mkdtempSync(join(tmpdir(), "kendall-test-viewer-stale-lock-"));
  const socketPath = join(authDir, "supervisor.sock");
  const passwordPath = join(authDir, "test-viewer-password");
  const supervisor = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ schemaVersion: "kendall-test-viewer-lifecycle/v1", role: "test_viewer", configured: false, enabled: false, rotated: payload.action === "rotate" }));
    });
  });
  try {
    await listen(supervisor, socketPath);
    writeFileSync(`${passwordPath}.lock`, "999999\n", { mode: 0o600 });
    const environment = { KENDALL_LAN_AUTH_DIR: authDir, KENDALL_SUPERVISOR_UDS_PATH: socketPath, KENDALL_TEST_VIEWER_PASSWORD_FILE: passwordPath };
    const status = await main(["status"], environment);
    assert.equal(status.enabled, false);
    assert.equal(existsSync(`${passwordPath}.lock`), false);
  } finally {
    if (supervisor.listening) await close(supervisor);
  }
});
