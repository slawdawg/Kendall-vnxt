import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const unitNames = {
  target: "kendall-lan-cockpit.target",
  supervisor: "kendall-lan-supervisor.service",
  dashboard: "kendall-lan-dashboard.service",
};

export function renderLanCockpitUnits({ repoRoot, nodePath, pnpmPath }) {
  const authDir = "%h/kendall-lan-auth";
  const common = `WorkingDirectory=${repoRoot}\nEnvironment=KENDALL_LAN_AUTH_DIR=${authDir}\nEnvironment=KENDALL_PNPM_PATH=${pnpmPath}`;
  return {
    [unitNames.target]: `[Unit]\nDescription=Kendall authenticated Tailnet cockpit\nWants=${unitNames.supervisor} ${unitNames.dashboard}\nAfter=network-online.target\nConflicts=kendall-cockpit.target kendall-lan-auth.target\n\n[Install]\nWantedBy=default.target\n`,
    [unitNames.supervisor]: `[Unit]\nDescription=Kendall authenticated Tailnet supervisor\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\n${common}\nExecStart=${nodePath} scripts/lan-cockpit-runtime.mjs supervisor\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=${unitNames.target}\n`,
    [unitNames.dashboard]: `[Unit]\nDescription=Kendall authenticated Tailnet dashboard\nRequires=${unitNames.supervisor}\nBindsTo=${unitNames.supervisor}\nAfter=${unitNames.supervisor}\n\n[Service]\nType=simple\n${common}\nExecStart=${nodePath} scripts/lan-cockpit-runtime.mjs dashboard\nRestart=on-failure\nRestartSec=10\n\n[Install]\nWantedBy=${unitNames.target}\n`,
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

function install() {
  const units = renderLanCockpitUnits({ repoRoot: rootDir, nodePath: process.execPath, pnpmPath: commandPath("pnpm") });
  mkdirSync(systemdDir(), { recursive: true });
  for (const [name, contents] of Object.entries(units)) writeFileSync(join(systemdDir(), name), contents);
  run(["daemon-reload"]);
  run(["enable", "--now", unitNames.target]);
  console.log("Kendall authenticated Tailnet cockpit installed. Run: pnpm run lan-cockpit:status");
}

function main() {
  const command = process.argv[2] || "status";
  if (command === "print") {
    const units = renderLanCockpitUnits({ repoRoot: rootDir, nodePath: process.execPath, pnpmPath: commandPath("pnpm") });
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
