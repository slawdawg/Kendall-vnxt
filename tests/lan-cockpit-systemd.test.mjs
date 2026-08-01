import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderLanCockpitUnits } from "../scripts/lan-cockpit-systemd.mjs";
import { assertTailnetOriginState, assertTailnetRuntimeState, certificateCoversIdentity, normalizeTailnetHostname, resolveCanonicalTailnetHostname, resolveDashboardBindAddress, resolveDashboardTlsPaths, resolveRuntimeRevision, tailnetOriginStatePath, tailnetRuntimeStatePath, waitForPrivateSupervisorStartupGate, writeTailnetOriginState, writeTailnetRuntimeState } from "../scripts/lan-cockpit-runtime.mjs";

test("renders private-UDS authenticated Tailnet cockpit units", () => {
  const units = renderLanCockpitUnits({ repoRoot: "/home/kendall/Kendall_Nxt", nodePath: "/usr/bin/node", pnpmPath: "/usr/bin/pnpm", uvPath: "/home/kendall/.local/bin/uv", canonicalHostname: "kendallvnxt-1.tail045dec.ts.net", certificatePath: "/home/kendall/kendall-lan-auth/dashboard-leaf.crt", keyPath: "/home/kendall/kendall-lan-auth/dashboard-leaf.key" });
  assert.match(units["kendall-lan-cockpit.target"], /WantedBy=default\.target/);
  assert.match(units["kendall-lan-cockpit.target"], /Conflicts=kendall-cockpit\.target kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service kendall-lan-auth\.target kendall-lan-auth-supervisor\.service kendall-lan-auth-dashboard\.service/);
  assert.match(units["kendall-lan-cockpit.target"], /Before=kendall-cockpit\.target kendall-cockpit-supervisor\.service kendall-cockpit-dashboard\.service kendall-lan-auth\.target kendall-lan-auth-supervisor\.service kendall-lan-auth-dashboard\.service/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_LAN_AUTH_DIR=%h\/kendall-lan-auth/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_UV_PATH=\/home\/kendall\/\.local\/bin\/uv/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME=kendallvnxt-1\.tail045dec\.ts\.net/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_DASHBOARD_TLS_CERT_FILE=\/home\/kendall\/kendall-lan-auth\/dashboard-leaf\.crt/);
  assert.match(units["kendall-lan-supervisor.service"], /KENDALL_DASHBOARD_TLS_KEY_FILE=\/home\/kendall\/kendall-lan-auth\/dashboard-leaf\.key/);
  assert.match(units["kendall-lan-supervisor.service"], /PartOf=kendall-lan-cockpit\.target/);
  assert.match(units["kendall-lan-supervisor.service"], /lan-cockpit-runtime\.mjs supervisor/);
  assert.doesNotMatch(units["kendall-lan-supervisor.service"], /SUPERVISOR_PORT|0\.0\.0\.0/);
  assert.match(units["kendall-lan-dashboard.service"], /lan-cockpit-runtime\.mjs dashboard/);
  assert.match(units["kendall-lan-dashboard.service"], /After=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /PartOf=kendall-lan-cockpit\.target/);
  assert.match(units["kendall-lan-dashboard.service"], /Requires=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /BindsTo=kendall-lan-supervisor\.service/);
  assert.match(units["kendall-lan-dashboard.service"], /KENDALL_DASHBOARD_TLS_CERT_FILE=\/home\/kendall\/kendall-lan-auth\/dashboard-leaf\.crt/);
  assert.match(units["kendall-lan-dashboard.service"], /KENDALL_DASHBOARD_TLS_KEY_FILE=\/home\/kendall\/kendall-lan-auth\/dashboard-leaf\.key/);
  assert.doesNotMatch(units["kendall-lan-dashboard.service"], /NEXT_PUBLIC_SUPERVISOR_URL|SUPERVISOR_INTERNAL_URL/);
});

test("Tailnet unit generation requires a hostname and explicit all-interface admission", () => {
  const base = { repoRoot: "/home/kendall/Kendall_Nxt", nodePath: "/usr/bin/node", pnpmPath: "/usr/bin/pnpm", uvPath: "/home/kendall/.local/bin/uv" };
  assert.throws(() => renderLanCockpitUnits(base), /canonical hostname/);
  assert.throws(() => renderLanCockpitUnits({ ...base, canonicalHostname: "kendallvnxt-1.tail045dec.ts.net", dashboardBindMode: "all-interfaces" }), /explicit approval/);
  assert.match(renderLanCockpitUnits({ ...base, canonicalHostname: "kendallvnxt-1.tail045dec.ts.net", dashboardBindMode: "all-interfaces", allowAllInterfaces: true })["kendall-lan-dashboard.service"], /KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true/);
  assert.throws(() => renderLanCockpitUnits({ ...base, canonicalHostname: "kendallvnxt-1.tail045dec.ts.net", certificatePath: "/private/dashboard-leaf.crt" }), /configured together/);
  assert.throws(() => renderLanCockpitUnits({ ...base, canonicalHostname: "kendallvnxt-1.tail045dec.ts.net", certificatePath: "/private/dashboard-leaf.crt\nEnvironment=UNSAFE", keyPath: "/private/dashboard-leaf.key" }), /cannot contain whitespace/);
});

test("Tailnet installer fences legacy port-3000 cockpit services and starts the supervisor through resolved uv", () => {
  const installerSource = readFileSync(new URL("../scripts/lan-cockpit-systemd.mjs", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../scripts/lan-cockpit-runtime.mjs", import.meta.url), "utf8");
  for (const legacyUnit of [
    "kendall-cockpit-supervisor.service",
    "kendall-cockpit-dashboard.service",
    "kendall-lan-auth-supervisor.service",
    "kendall-lan-auth-dashboard.service",
  ]) {
    assert.match(installerSource, new RegExp(`"${legacyUnit}"`));
  }
  assert.match(installerSource, /stopLegacyCockpitUnits\(\);/);
  assert.match(installerSource, /if \(unitIsActive\(unit\)\) run\(\["stop", unit\]\);/);
  assert.match(runtimeSource, /KENDALL_UV_PATH is required for the supervisor/);
  assert.match(runtimeSource, /\["run", "--directory", "services\/supervisor", "supervisor"\]/);
});

test("waits for the private supervisor startup gate before launching the dashboard", async () => {
  let checks = 0;
  let delays = 0;
  await waitForPrivateSupervisorStartupGate("/private/supervisor.sock", {
    check: async (socketPath) => {
      assert.equal(socketPath, "/private/supervisor.sock");
      checks += 1;
      return checks === 3;
    },
    delay: async () => { delays += 1; },
    attempts: 3,
  });
  assert.equal(checks, 3);
  assert.equal(delays, 2);
});

test("rejects a dashboard origin that does not match the freshly started supervisor", () => {
  const authDir = "/private/kendall-lan-auth";
  assert.equal(tailnetOriginStatePath(authDir), "/private/kendall-lan-auth/tailnet-origin.json");
  assert.doesNotThrow(() => assertTailnetOriginState(authDir, "https://100.86.154.99:3000", () => JSON.stringify({ origin: "https://100.86.154.99:3000" })));
  assert.throws(() => assertTailnetOriginState(authDir, "https://100.86.154.99:3000", () => JSON.stringify({ origin: "https://100.86.154.98:3000" })), /does not match/);
});

test("records only the paired Tailnet origin with private file permissions", () => {
  const authDir = mkdtempSync(join(tmpdir(), "kendall-tailnet-origin-"));
  const origin = "https://100.86.154.99:3000";
  writeTailnetOriginState(authDir, origin);
  const statePath = tailnetOriginStatePath(authDir);
  assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")), { origin });
  assert.equal(statSync(statePath).mode & 0o777, 0o600);
});

test("canonical Tailnet hostname is explicit, node-bound, and certificate-gated", () => {
  const run = (command, args) => {
    assert.equal(command, "tailscale");
    assert.deepEqual(args, ["status", "--json"]);
    return { status: 0, stdout: JSON.stringify({ Self: { DNSName: "kendallvnxt-1.tail045dec.ts.net." } }) };
  };
  assert.equal(normalizeTailnetHostname("KENDALLVNXT-1.tail045dec.ts.net."), "kendallvnxt-1.tail045dec.ts.net");
  assert.equal(resolveCanonicalTailnetHostname({ KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME: "kendallvnxt-1.tail045dec.ts.net" }, run), "kendallvnxt-1.tail045dec.ts.net");
  assert.throws(() => resolveCanonicalTailnetHostname({ KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME: "other.tail045dec.ts.net" }, run), /does not match/);
  assert.doesNotThrow(() => certificateCoversIdentity({ subjectAltName: "DNS:kendallvnxt-1.tail045dec.ts.net", checkHost: (host) => host }, "100.86.154.99", "kendallvnxt-1.tail045dec.ts.net"));
  assert.throws(() => certificateCoversIdentity({ subjectAltName: "DNS:other.tail045dec.ts.net", checkHost: () => undefined }, "100.86.154.99", "kendallvnxt-1.tail045dec.ts.net"), /DNS SAN/);
  assert.throws(() => certificateCoversIdentity({ subjectAltName: "", checkHost: (host) => host }, "100.86.154.99", "kendallvnxt-1.tail045dec.ts.net"), /DNS SAN/);
});

test("runtime bind and revision state are explicit and must match across the paired services", () => {
  assert.equal(resolveDashboardBindAddress({}, "100.86.154.99"), "100.86.154.99");
  assert.throws(() => resolveDashboardBindAddress({ KENDALL_DASHBOARD_BIND_MODE: "all-interfaces" }, "100.86.154.99"), /explicit/);
  assert.equal(resolveDashboardBindAddress({ KENDALL_DASHBOARD_BIND_MODE: "all-interfaces", KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES: "true" }, "100.86.154.99"), "0.0.0.0");
  assert.equal(resolveRuntimeRevision({ KENDALL_DASHBOARD_RUNTIME_REVISION: "0139bc69" }), "0139bc69");
  const authDir = mkdtempSync(join(tmpdir(), "kendall-tailnet-runtime-"));
  const state = {
    schemaVersion: "kendall-tailnet-runtime/v1",
    origin: "https://kendallvnxt-1.tail045dec.ts.net:3000",
    allowedHost: "kendallvnxt-1.tail045dec.ts.net:3000",
    revision: "0139bc69",
    bindAddress: "100.86.154.99",
  };
  writeTailnetRuntimeState(authDir, state);
  assert.equal(tailnetRuntimeStatePath(authDir), `${authDir}/tailnet-runtime.json`);
  assert.doesNotThrow(() => assertTailnetRuntimeState(authDir, state));
  assert.throws(() => assertTailnetRuntimeState(authDir, { ...state, revision: "different" }), /does not match/);
  assert.equal(statSync(tailnetRuntimeStatePath(authDir)).mode & 0o777, 0o600);
});

test("Tailnet runtime keeps the CA trust root separate from explicit private leaf paths", () => {
  const authDir = "/private/kendall-lan-auth";
  assert.deepEqual(resolveDashboardTlsPaths({
    KENDALL_DASHBOARD_TLS_CERT_FILE: `${authDir}/dashboard-leaf.crt`,
    KENDALL_DASHBOARD_TLS_KEY_FILE: `${authDir}/dashboard-leaf.key`,
  }, authDir), {
    certificatePath: `${authDir}/dashboard-leaf.crt`,
    keyPath: `${authDir}/dashboard-leaf.key`,
  });
  assert.throws(() => resolveDashboardTlsPaths({ KENDALL_DASHBOARD_TLS_CERT_FILE: "/tmp/leaf.crt" }, authDir), /private LAN auth directory/);
  assert.throws(() => resolveDashboardTlsPaths({ KENDALL_DASHBOARD_TLS_KEY_FILE: authDir }, authDir), /distinct file/);
});
