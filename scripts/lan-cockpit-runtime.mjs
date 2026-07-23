import { spawn, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { isIP } from "node:net";
import { join } from "node:path";

function fail(message) {
  throw new Error(`Kendall LAN cockpit: ${message}`);
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

export function lanCockpitEnvironment(environment = process.env, run = spawnSync) {
  const authDir = environment.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth");
  const address = resolveTailnetIpv4(run);
  const certificatePath = join(authDir, "dashboard.crt");
  assertCertificateMatchesAddress(certificatePath, address);
  return {
    ...environment,
    KENDALL_LAN_AUTH_ENABLED: "true",
    KENDALL_SUPERVISOR_TRANSPORT: "private_uds",
    KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE: join(authDir, "bootstrap-password"),
    KENDALL_SUPERVISOR_UDS_PATH: join(authDir, "supervisor.sock"),
    KENDALL_DASHBOARD_BIND_ADDRESS: address,
    KENDALL_DASHBOARD_PORT: "3000",
    KENDALL_DASHBOARD_TLS_CERT_FILE: certificatePath,
    KENDALL_DASHBOARD_TLS_KEY_FILE: join(authDir, "dashboard.key"),
    KENDALL_DASHBOARD_ORIGIN: `https://${address}:3000`,
    KENDALL_DASHBOARD_ALLOWED_HOST: `${address}:3000`,
    SUPERVISOR_CORS_ORIGINS: `https://${address}:3000`,
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
  if (mode !== "supervisor" && mode !== "dashboard") fail("expected supervisor or dashboard mode.");
  const pnpmPath = process.env.KENDALL_PNPM_PATH;
  if (!pnpmPath) fail("KENDALL_PNPM_PATH is required.");
  const environment = lanCockpitEnvironment();
  if (mode === "dashboard") await waitForPrivateSupervisorStartupGate(environment.KENDALL_SUPERVISOR_UDS_PATH);
  const child = spawn(pnpmPath, ["run", mode === "supervisor" ? "dev:supervisor" : "dev:dashboard"], {
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
