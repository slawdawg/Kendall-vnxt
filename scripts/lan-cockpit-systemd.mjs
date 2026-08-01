import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTailnetHostname } from "./lan-cockpit-runtime.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const unitNames = {
  target: "kendall-lan-cockpit.target",
  supervisor: "kendall-lan-supervisor.service",
  dashboard: "kendall-lan-dashboard.service",
};
const legacyCockpitUnits = [
  "kendall-cockpit.target",
  "kendall-cockpit-supervisor.service",
  "kendall-cockpit-dashboard.service",
  "kendall-lan-auth.target",
  "kendall-lan-auth-supervisor.service",
  "kendall-lan-auth-dashboard.service",
];

export function renderLanCockpitUnits({ repoRoot, nodePath, pnpmPath, uvPath, canonicalHostname, dashboardBindMode = "tailnet-ip", allowAllInterfaces = false }) {
  const hostname = normalizeTailnetHostname(canonicalHostname);
  if (!["tailnet-ip", "all-interfaces"].includes(dashboardBindMode)) throw new Error("Kendall Tailnet cockpit bind mode is invalid.");
  if (dashboardBindMode === "all-interfaces" && !allowAllInterfaces) throw new Error("Kendall Tailnet cockpit all-interface bind requires explicit approval.");
  const authDir = "%h/kendall-lan-auth";
  const common = `WorkingDirectory=${repoRoot}\nEnvironment=KENDALL_LAN_AUTH_DIR=${authDir}\nEnvironment=KENDALL_PNPM_PATH=${pnpmPath}\nEnvironment=KENDALL_UV_PATH=${uvPath}\nEnvironment=KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME=${hostname}\nEnvironment=KENDALL_DASHBOARD_BIND_MODE=${dashboardBindMode}${allowAllInterfaces ? "\nEnvironment=KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES=true" : ""}`;
  const legacyUnitList = legacyCockpitUnits.join(" ");
  return {
    [unitNames.target]: `[Unit]\nDescription=Kendall authenticated Tailnet cockpit\nWants=${unitNames.supervisor} ${unitNames.dashboard}\nAfter=network-online.target\nConflicts=${legacyUnitList}\nBefore=${legacyUnitList}\n\n[Install]\nWantedBy=default.target\n`,
    [unitNames.supervisor]: `[Unit]\nDescription=Kendall authenticated Tailnet supervisor\nPartOf=${unitNames.target}\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\n${common}\nExecStart=${nodePath} scripts/lan-cockpit-runtime.mjs supervisor\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=${unitNames.target}\n`,
    [unitNames.dashboard]: `[Unit]\nDescription=Kendall authenticated Tailnet dashboard\nPartOf=${unitNames.target}\nRequires=${unitNames.supervisor}\nBindsTo=${unitNames.supervisor}\nAfter=${unitNames.supervisor}\n\n[Service]\nType=simple\n${common}\nExecStart=${nodePath} scripts/lan-cockpit-runtime.mjs dashboard\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=${unitNames.target}\n`,
  };
}

function commandPath(name) {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`Cannot find ${name} on PATH.`);
  return result.stdout.trim();
}

function systemdDir() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user");
}

function run(args) {
  const result = spawnSync("systemctl", ["--user", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function unitIsActive(unit) {
  const result = spawnSync("systemctl", ["--user", "is-active", unit], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 && result.stdout.trim() === "active";
}

function unitIsEnabled(unit) {
  const result = spawnSync("systemctl", ["--user", "is-enabled", unit], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return result.status === 0 && result.stdout.trim() === "enabled";
}

function stopLegacyCockpitUnits() {
  for (const unit of legacyCockpitUnits) {
    if (unitIsActive(unit)) run(["stop", unit]);
  }
  for (const target of ["kendall-cockpit.target", "kendall-lan-auth.target"]) {
    if (unitIsEnabled(target)) run(["disable", target]);
  }
}

function install() {
  const canonicalHostname = process.env.KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME;
  const dashboardBindMode = process.env.KENDALL_DASHBOARD_BIND_MODE || "tailnet-ip";
  const allowAllInterfaces = process.env.KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES === "true";
  const units = renderLanCockpitUnits({
    repoRoot: rootDir,
    nodePath: process.execPath,
    pnpmPath: commandPath("pnpm"),
    uvPath: commandPath("uv"),
    canonicalHostname,
    dashboardBindMode,
    allowAllInterfaces,
  });
  execFileSync(process.execPath, ["scripts/lan-cockpit-runtime.mjs", "preflight"], { cwd: rootDir, stdio: "inherit", env: process.env });
  mkdirSync(systemdDir(), { recursive: true });
  for (const [name, contents] of Object.entries(units)) writeFileSync(join(systemdDir(), name), contents);
  // A target conflict alone does not stop independently enabled child services.
  // Fence those old cockpit units before the Tailnet dashboard claims port 3000.
  stopLegacyCockpitUnits();
  run(["daemon-reload"]);
  run(["enable", "--now", unitNames.target]);
  console.log("Kendall authenticated Tailnet cockpit installed. Run: pnpm run lan-cockpit:status");
}

function main() {
  const command = process.argv[2] || "status";
  if (command === "print") {
    const canonicalHostname = process.env.KENDALL_TAILNET_DASHBOARD_CANONICAL_HOSTNAME;
    const dashboardBindMode = process.env.KENDALL_DASHBOARD_BIND_MODE || "tailnet-ip";
    const allowAllInterfaces = process.env.KENDALL_DASHBOARD_ALLOW_ALL_INTERFACES === "true";
    const units = renderLanCockpitUnits({
      repoRoot: rootDir,
      nodePath: process.execPath,
      pnpmPath: commandPath("pnpm"),
      uvPath: commandPath("uv"),
      canonicalHostname,
      dashboardBindMode,
      allowAllInterfaces,
    });
    for (const [name, contents] of Object.entries(units)) console.log(`\n# ${name}\n${contents}`);
    return;
  }
  if (command === "install") return install();
  if (command === "status") return run(["status", unitNames.target, unitNames.supervisor, unitNames.dashboard]);
  if (command === "restart") {
    run(["restart", unitNames.supervisor]);
    return run(["restart", unitNames.dashboard]);
  }
  console.error("Expected install, print, status, or restart.");
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
