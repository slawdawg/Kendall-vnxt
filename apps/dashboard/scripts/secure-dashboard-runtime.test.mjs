import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyLanAuthSecurityHeaders, LanAuthConfigurationError, assertSupervisorStartupGate, isAllowedDashboardHost, isDashboardEntryRoute, isDashboardStaticAsset, isProtectedNextRoute, parseNumericLanBind, resolveCanonicalDashboardIdentity, resolveDashboardRuntime, runtimeHealthPayload } from "./secure-dashboard-runtime.mjs";

test("LAN auth responses include HSTS while local HTTP stays unchanged", () => {
  const headers = new Map();
  const response = { setHeader(name, value) { headers.set(name, value); } };
  applyLanAuthSecurityHeaders(response, { lanAuthEnabled: true });
  assert.equal(headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
  headers.clear();
  applyLanAuthSecurityHeaders(response, { lanAuthEnabled: false });
  assert.equal(headers.has("strict-transport-security"), false);
});

test("disabled LAN auth is loopback-only HTTP", () => {
  assert.deepEqual(resolveDashboardRuntime({}), { lanAuthEnabled: false, host: "127.0.0.1", protocol: "http" });
  assert.deepEqual(resolveDashboardRuntime({ KENDALL_DASHBOARD_HOST: "0.0.0.0" }), { lanAuthEnabled: false, host: "127.0.0.1", protocol: "http" });
  assert.deepEqual(resolveDashboardRuntime({ KENDALL_DASHBOARD_CONTAINER_MODE: "true", KENDALL_DASHBOARD_HOST: "0.0.0.0" }), { lanAuthEnabled: false, host: "0.0.0.0", protocol: "http" });
});

test("LAN auth gates every dashboard page and defaults unknown app paths to deny", () => {
  for (const url of ["/", "/active-work", "/active-work/", "/attention", "/audit", "/controls", "/pipeline", "/pipeline/packets/packet-1", "/proposed-work", "/queue", "/settings", "/work-items/item-1"]) {
    assert.equal(isDashboardEntryRoute({ url }), true, url);
    assert.equal(isProtectedNextRoute({ url }), true, url);
  }
  assert.equal(isDashboardEntryRoute({ url: "/api/work-items" }), true);
  assert.equal(isProtectedNextRoute({ url: "/api/work-items" }), true);
  assert.equal(isDashboardEntryRoute({ url: "/pipeline/packets/rework%3Aabc" }), true);
  assert.equal(isDashboardEntryRoute({ url: "/unknown-app-route" }), false);
  assert.equal(isProtectedNextRoute({ url: "/unknown-app-route" }), true);
  assert.equal(isProtectedNextRoute({ url: "/api/packet-detail/packet-1" }), false);
  assert.equal(isProtectedNextRoute({ url: "/_next/static/app.js" }), false);
  assert.equal(isDashboardStaticAsset({ url: "/_next/static/app.js" }), true);
  assert.equal(isDashboardStaticAsset({ url: "/_next/static/chunks/%5Bturbopack%5D-client.js" }), true);
  assert.equal(isDashboardStaticAsset({ url: "/_next/static/%2e%2e/secret.js" }), false);
  assert.equal(isDashboardStaticAsset({ url: "/_next/static/..%2fsecret.js" }), false);
  assert.equal(isDashboardStaticAsset({ url: "/_next/static/%5Csecret.js" }), false);
  assert.equal(isDashboardStaticAsset({ url: "/_next/%252e%252e%252fsecret.js" }), false);
  assert.equal(isDashboardStaticAsset({ url: "/favicon.ico?cache=1" }), true);
  for (const url of ["/pipeline%2Fpackets%2Fpacket-1", "/pipeline%2fpackets%2fpacket-1", "/pipeline%5Cpackets%5Cpacket-1", "/pipeline%2e%2e%2fadmin", "/foo/%2e%2e/pipeline", "/foo/%2e%2e%2fpipeline", "/pipeline%ZZ"]) {
    assert.equal(isProtectedNextRoute({ url }), true, url);
  }
});

test("numeric LAN parser rejects wildcard, loopback, hostnames and localhost", () => {
  for (const value of ["0.0.0.0", "::", "0:0:0:0:0:0:0:0", "127.0.0.1", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "0:0:0:0:0:ffff:7f00:1", "::ffff:192.168.1.8", "localhost", "dashboard.local", " 192.168.1.8", ""]) {
    assert.throws(() => parseNumericLanBind(value), LanAuthConfigurationError);
  }
  assert.equal(parseNumericLanBind("192.168.1.8"), "192.168.1.8");
});

test("LAN auth validates private mandatory files and fixed UDS path", () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-lan-auth-"));
  chmodSync(directory, 0o700);
  const files = ["cert", "key", "bootstrap"].map((name) => join(directory, name));
  for (const file of files) { writeFileSync(file, "private"); chmodSync(file, 0o600); }
  const env = { KENDALL_LAN_AUTH_ENABLED: "true", KENDALL_DASHBOARD_BIND_ADDRESS: "192.168.1.8", KENDALL_DASHBOARD_TLS_CERT_FILE: files[0], KENDALL_DASHBOARD_TLS_KEY_FILE: files[1], KENDALL_SUPERVISOR_UDS_PATH: "/run/kendall/supervisor.sock" };
  assert.equal(resolveDashboardRuntime(env).protocol, "https");
  assert.throws(() => resolveDashboardRuntime({ ...env, KENDALL_SUPERVISOR_UDS_PATH: "relative.sock" }), LanAuthConfigurationError);
  assert.throws(() => resolveDashboardRuntime({ ...env, KENDALL_DASHBOARD_TLS_CERT_FILE: files[0] + "-missing" }), LanAuthConfigurationError);
  chmodSync(files[0], 0o644);
  assert.throws(() => resolveDashboardRuntime(env), LanAuthConfigurationError);
});

test("LAN auth exposes one configured canonical HTTPS identity and rejects arbitrary Host headers", () => {
  const identity = resolveCanonicalDashboardIdentity({
    KENDALL_DASHBOARD_ORIGIN: "https://kendallvnxt-1.tail045dec.ts.net:3000",
    KENDALL_DASHBOARD_ALLOWED_HOST: "kendallvnxt-1.tail045dec.ts.net:3000",
  }, 3000);
  assert.deepEqual(identity, {
    origin: "https://kendallvnxt-1.tail045dec.ts.net:3000",
    allowedHost: "kendallvnxt-1.tail045dec.ts.net:3000",
  });
  assert.equal(isAllowedDashboardHost({ headers: { host: identity.allowedHost } }, identity), true);
  assert.equal(isAllowedDashboardHost({ headers: { host: "attacker.invalid" } }, identity), false);
  assert.deepEqual(resolveCanonicalDashboardIdentity({
    KENDALL_DASHBOARD_ORIGIN: "https://[fd7a:115c:a1e0::9e3b:9a64]:3000",
    KENDALL_DASHBOARD_ALLOWED_HOST: "[fd7a:115c:a1e0::9e3b:9a64]:3000",
  }, 3000), {
    origin: "https://[fd7a:115c:a1e0::9e3b:9a64]:3000",
    allowedHost: "[fd7a:115c:a1e0::9e3b:9a64]:3000",
  });
  assert.throws(() => resolveCanonicalDashboardIdentity({
    KENDALL_DASHBOARD_ORIGIN: "https://kendallvnxt-1.tail045dec.ts.net:3000",
    KENDALL_DASHBOARD_ALLOWED_HOST: "other.tail045dec.ts.net:3000",
  }, 3000), LanAuthConfigurationError);
  assert.deepEqual(runtimeHealthPayload(identity, { KENDALL_DASHBOARD_RUNTIME_REVISION: "0139bc69" }), {
    schemaVersion: "kendall-dashboard-runtime-health/v1",
    state: "ready",
    origin: "https://kendallvnxt-1.tail045dec.ts.net:3000",
    revision: "0139bc69",
  });
});

test("LAN auth permits all-interface binding only with an explicit safety switch", () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-lan-auth-all-interfaces-"));
  chmodSync(directory, 0o700);
  const files = ["cert", "key"].map((name) => join(directory, name));
  for (const file of files) { writeFileSync(file, "private"); chmodSync(file, 0o600); }
  const env = {
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_DASHBOARD_BIND_ADDRESS: "0.0.0.0",
    KENDALL_DASHBOARD_TLS_CERT_FILE: files[0],
    KENDALL_DASHBOARD_TLS_KEY_FILE: files[1],
    KENDALL_SUPERVISOR_UDS_PATH: "/run/kendall/supervisor.sock",
  };
  assert.throws(() => resolveDashboardRuntime(env), LanAuthConfigurationError);
  assert.equal(resolveDashboardRuntime({ ...env, KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES: "true" }).host, "0.0.0.0");
});

test("LAN auth requires the supervisor-owned bootstrap startup gate over the fixed UDS", async () => {
  const directory = mkdtempSync(join(tmpdir(), "kendall-lan-auth-gate-"));
  const socketPath = join(directory, "supervisor.sock");
  const server = http.createServer((request, response) => {
    assert.equal(request.url, "/internal/lan-auth/startup-gate");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ schemaVersion: "kendall-lan-auth-startup-gate/v1", transport: "private_uds", bootstrapValidated: true, supervisorUdsPath: socketPath }));
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  await assertSupervisorStartupGate({ lanAuthEnabled: true, supervisorUdsPath: socketPath });
  await new Promise((resolve) => server.close(resolve));
});
