import { spawn, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { isIP } from "node:net";
import { join } from "node:path";

function fail(message) {
  throw new Error(`Kendall LAN cockpit: ${message}`);
}

export function tailnetOriginStatePath(authDir) {
  return join(authDir, "tailnet-origin.json");
}

export function tailnetRuntimeStatePath(authDir) {
  return join(authDir, "tailnet-runtime.json");
}

export function writeTailnetOriginState(authDir, origin) {
  const statePath = tailnetOriginStatePath(authDir);
  writeFileSync(statePath, JSON.stringify({ origin }), { encoding: "utf8", mode: 0o600 });
  chmodSync(statePath, 0o600);
}

export function assertTailnetOriginState(authDir, expectedOrigin, read = readFileSync) {
  let payload;
  try { payload = JSON.parse(read(tailnetOriginStatePath(authDir), "utf8")); } catch { fail("supervisor Tailnet origin state is unavailable or invalid."); }
  if (!payload || payload.origin !== expectedOrigin) fail("supervisor Tailnet origin does not match the dashboard; restart the paired cockpit after rotating the address or certificate.");
}

export function writeTailnetRuntimeState(authDir, state) {
  const statePath = tailnetRuntimeStatePath(authDir);
  writeFileSync(statePath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(statePath, 0o600);
}

export function assertTailnetRuntimeState(authDir, expectedState, read = readFileSync) {
  let payload;
  try { payload = JSON.parse(read(tailnetRuntimeStatePath(authDir), "utf8")); } catch { fail("supervisor Tailnet runtime state is unavailable or invalid."); }
  for (const key of ["schemaVersion", "origin", "allowedHost", "revision", "bindAddress"]) {
    if (!payload || payload[key] !== expectedState[key]) fail("supervisor Tailnet runtime state does not match the dashboard; restart the paired cockpit after inspecting the canonical runtime configuration.");
  }
}

export function resolveTailnetIpv4(run = spawnSync) {
  const result = run("tailscale", ["ip", "-4"], { encoding: "utf8" });
  const address = result?.stdout?.trim();
  if (result?.status !== 0 || !address || isIP(address) !== 4) {
    fail("Tailscale IPv4 is unavailable; authenticate Tailscale before starting the cockpit.");
  }
  const [first, second] = address.split(".").map(Number);
  if (first !== 100 || second < 64 || second > 127) {
    fail("Tailscale returned an address outside the Tailnet IPv4 range.");
  }
  return address;
}

export function assertCertificateMatchesAddress(certificatePath, address) {
  if (!existsSync(certificatePath)) fail("dashboard certificate is unavailable.");
  const certificate = new X509Certificate(readFileSync(certificatePath));
  if (certificate.checkIP(address) !== address) {
    fail(`dashboard certificate SAN does not match current Tailscale address ${address}. Reissue the certificate before restart.`);
  }
}

export function normalizeTailnetHostname(value) {
  if (typeof value !== "string" || !value || /[\s/:?#@\\]/.test(value) || isIP(value) !== 0) fail("Tailnet canonical hostname is invalid.");
  const hostname = value.toLowerCase().replace(/\.$/, "");
  if (!hostname || !hostname.includes(".") || hostname.length > 253 || !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    fail("Tailnet canonical hostname is invalid.");
  }
  return hostname;
}

export function resolveTailnetDnsName(run = spawnSync) {
  const result = run("tailscale", ["status", "--json"], { encoding: "utf8" });
  let dnsName;
  try { dnsName = JSON.parse(result?.stdout || "").Self?.DNSName; } catch { /* handled below */ }
  if (result?.status !== 0 || !dnsName) fail("Tailscale MagicDNS name is unavailable; authenticate Tailscale and enable MagicDNS before hostname cutover.");
  return normalizeTailnetHostname(dnsName);
}

export function resolveCanonicalTailnetHostname(environment = process.env, run = spawnSync) {
  const configured = environment.KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME;
  if (!configured) return null;
  const hostname = normalizeTailnetHostname(configured);
  if (hostname !== resolveTailnetDnsName(run)) fail("configured Tailnet canonical hostname does not match this Tailscale node.");
  return hostname;
}

export function certificateCoversIdentity(certificate, address, hostname = null) {
  if (hostname) {
    if (!/(?:^|,\s*)DNS:/i.test(String(certificate.subjectAltName || "")) || !certificate.checkHost(hostname)) fail(`dashboard certificate DNS SAN does not match canonical hostname ${hostname}. Reissue the certificate before restart.`);
    return;
  }
  if (certificate.checkIP(address) !== address) fail(`dashboard certificate SAN does not match current Tailscale address ${address}. Reissue the certificate before restart.`);
}

export function assertCertificateMatchesIdentity(certificatePath, address, hostname = null) {
  if (!existsSync(certificatePath)) fail("dashboard certificate is unavailable.");
  certificateCoversIdentity(new X509Certificate(readFileSync(certificatePath)), address, hostname);
}

export function resolveDashboardBindAddress(environment, tailnetAddress) {
  const mode = environment.KENDALL_DASHBOARD_BIND_MODE || "tailnet-ip";
  if (mode === "tailnet-ip") return tailnetAddress;
  if (mode === "all-interfaces" && environment.KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES === "true") return "0.0.0.0";
  fail("dashboard bind mode must be tailnet-ip, or all-interfaces with explicit KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true.");
}

export function resolveRuntimeRevision(environment = process.env, run = spawnSync) {
  const configured = environment.KENDALL_DASHBOARD_RUNTIME_REVISION;
  if (configured && /^[0-9a-f]{7,64}$/i.test(configured)) return configured.toLowerCase();
  const result = run("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const revision = result?.stdout?.trim();
  if (result?.status !== 0 || !/^[0-9a-f]{7,64}$/i.test(revision || "")) fail("canonical runtime revision is unavailable; set KENDALL_DASHBOARD_RUNTIME_REVISION to the deployed commit.");
  return revision.toLowerCase();
}

export function lanCockpitEnvironment(environment = process.env, run = spawnSync) {
  const authDir = environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth");
  const address = resolveTailnetIpv4(run);
  const hostname = resolveCanonicalTailnetHostname(environment, run);
  const certificatePath = join(authDir, "dashboard.crt");
  assertCertificateMatchesIdentity(certificatePath, address, hostname);
  const bindAddress = resolveDashboardBindAddress(environment, address);
  const rawPort = environment.KENDALL_DASHBOARD_PORT || "3000";
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) fail("dashboard port is invalid.");
  const port = String(Number(rawPort));
  const identityHost = hostname || address;
  const urlHost = isIP(identityHost) === 6 ? `[${identityHost}]` : identityHost;
  const portSuffix = port === "443" ? "" : `:${port}`;
  const origin = `https://${urlHost}${portSuffix}`;
  const allowedHost = `${urlHost}${portSuffix}`;
  const revision = resolveRuntimeRevision(environment, run);
  return {
    ...environment,
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_SUPERVISOR_TRANSPORT: "private_uds",
    KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE: join(authDir, "bootstrap-password"),
    KENDALL_SUPERVISOR_UDS_PATH: join(authDir, "supervisor.sock"),
    KENDALL_DASHBOARD_BIND_ADDRESS: bindAddress,
    KENDALL_DASHBOARD_PORT: port,
    KENDALL_DASHBOARD_TLS_CERT_FILE: certificatePath,
    KENDALL_DASHBOARD_TLS_KEY_FILE: join(authDir, "dashboard.key"),
    KENDALL_DASHBOARD_ORIGIN: origin,
    KENDALL_DASHBOARD_ALLOWED_HOST: allowedHost,
    KENDALL_DASHBOARD_RUNTIME_REVISION: revision,
    SUPERVISOR_CORS_ORIGINS: origin,
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function privateSupervisorStartupGateReady(socketPath) {
  return new Promise((resolve) => {
    const request = http.request({
      socketPath,
      path: "/internal/lan-auth/startup-gate",
      method: "GET",
      headers: { accept: "application/json" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(response.statusCode === 200 && payload?.transport === "private_uds" && payload?.bootstrapValidated === true && payload?.supervisorUdsPath === socketPath);
        } catch {
          resolve(false);
        }
      });
    });
    request.setTimeout(1_000, () => request.destroy());
    request.on("error", () => resolve(false));
    request.end();
  });
}

export async function waitForPrivateSupervisorStartupGate(socketPath, { check = privateSupervisorStartupGateReady, delay = sleep, attempts = 80 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check(socketPath)) return;
    if (attempt + 1 < attempts) await delay(250);
  }
  fail("private supervisor startup gate did not become ready within 20 seconds.");
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "supervisor" && mode !== "dashboard" && mode !== "preflight") fail("expected supervisor, dashboard, or preflight mode.");
  const pnpmPath = process.env.KENDALL_PNPM_PATH;
  const uvPath = process.env.KENDALL_UV_PATH;
  if (mode === "dashboard" && !pnpmPath) fail("KENDALL_PNPM_PATH is required for the dashboard.");
  if (mode === "supervisor" && !uvPath) fail("KENDALL_UV_PATH is required for the supervisor.");
  const environment = lanCockpitEnvironment();
  const runtimeState = {
    schemaVersion: "kendall-tailnet-runtime/v1",
    origin: environment.KENDALL_DASHBOARD_ORIGIN,
    allowedHost: environment.KENDALL_DASHBOARD_ALLOWED_HOST,
    revision: environment.KENDALL_DASHBOARD_RUNTIME_REVISION,
    bindAddress: environment.KENDALL_DASHBOARD_BIND_ADDRESS,
  };
  if (mode === "preflight") {
    process.stdout.write(`${JSON.stringify({ schemaVersion: "kendall-tailnet-runtime-preflight/v1", state: "ready", ...runtimeState })}\n`);
    return;
  }
  if (mode === "supervisor") {
    writeTailnetOriginState(environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth"), environment.KENDALL_DASHBOARD_ORIGIN);
    writeTailnetRuntimeState(environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth"), runtimeState);
  }
  if (mode === "dashboard") {
    await waitForPrivateSupervisorStartupGate(environment.KENDALL_SUPERVISOR_UDS_PATH);
    assertTailnetRuntimeState(environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth"), runtimeState);
  }
  const command = mode === "supervisor" ? uvPath : pnpmPath;
  const args = mode === "supervisor"
    ? ["run", "--directory", "services/supervisor", "supervisor"]
    : ["run", "dev:dashboard"];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", (error) => fail(`could not start ${mode}: ${error.message}`));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
