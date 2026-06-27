import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const unitNames = {
  target: "kendall-cockpit.target",
  supervisor: "kendall-cockpit-supervisor.service",
  dashboard: "kendall-cockpit-dashboard.service",
};

export function renderCockpitUnits({
  repoRoot,
  pnpmPath,
  uvPath,
  dashboardPort = "3000",
  supervisorPort = "8100",
}) {
  const dataDir = join(repoRoot, ".data");
  const tmpDir = join(dataDir, "tmp");
  const uvCacheDir = join(dataDir, "uv-cache");
  const supervisorUrl = `http://127.0.0.1:${supervisorPort}`;
  const workerEvidenceDir = join(repoRoot, ".kendall-local", "governed-worker-evidence");

  return {
    [unitNames.target]: `[Unit]
Description=Kendall Cockpit
Wants=${unitNames.supervisor} ${unitNames.dashboard}
After=network-online.target

[Install]
WantedBy=default.target
`,
    [unitNames.supervisor]: `[Unit]
Description=Kendall Cockpit Supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${repoRoot}
Environment=SUPERVISOR_ALLOW_DIRTY_REPO=true
Environment=SUPERVISOR_POLL_INTERVAL_SECONDS=1
Environment=UV_CACHE_DIR=${uvCacheDir}
Environment=TEMP=${tmpDir}
Environment=TMP=${tmpDir}
ExecStart=${uvPath} run --directory services/supervisor uvicorn supervisor.api.main:app --host 0.0.0.0 --port ${supervisorPort}
Restart=always
RestartSec=5

[Install]
WantedBy=${unitNames.target}
`,
    [unitNames.dashboard]: `[Unit]
Description=Kendall Cockpit Dashboard
After=${unitNames.supervisor}
Wants=${unitNames.supervisor}

[Service]
Type=simple
WorkingDirectory=${repoRoot}
Environment=NEXT_PUBLIC_SUPERVISOR_URL=${supervisorUrl}
Environment=SUPERVISOR_INTERNAL_URL=${supervisorUrl}
Environment=TEMP=${tmpDir}
Environment=TMP=${tmpDir}
Environment=KENDALL_PIPELINE_WORKER_EVIDENCE_DIR=${workerEvidenceDir}
ExecStart=${pnpmPath} --filter @kendall/dashboard exec next dev --hostname 0.0.0.0 --port ${dashboardPort}
Restart=always
RestartSec=5

[Install]
WantedBy=${unitNames.target}
`,
  };
}

function userSystemdDir() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "systemd", "user");
}

function commandPath(name) {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
  });
  const value = result.stdout.trim();
  if (result.status !== 0 || !value) {
    throw new Error(`Cannot find ${name} on PATH.`);
  }
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function systemctlUser(args) {
  run("systemctl", ["--user", ...args]);
}

function lingerEnabled() {
  try {
    const output = execFileSync("loginctl", ["show-user", process.env.USER || "", "-p", "Linger"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output === "Linger=yes";
  } catch {
    return false;
  }
}

function tryEnableLinger() {
  if (lingerEnabled()) {
    console.log("loginctl linger is already enabled.");
    return;
  }

  const result = spawnSync("loginctl", ["enable-linger", process.env.USER || ""], { stdio: "inherit" });
  if (result.status === 0) {
    console.log("Enabled loginctl linger for boot startup before login.");
    return;
  }

  console.log("\nCould not enable loginctl linger automatically.");
  console.log("For startup immediately after VM boot, run this once:");
  console.log(`  loginctl enable-linger ${process.env.USER || "$USER"}`);
  console.log("If that asks for administrator approval, run it yourself from an admin/root session.");
}

function install({ enableLinger = true } = {}) {
  const dashboardPort = process.env.KENDALL_COCKPIT_DASHBOARD_PORT || "3000";
  const supervisorPort = process.env.KENDALL_COCKPIT_SUPERVISOR_PORT || "8100";
  const units = renderCockpitUnits({
    repoRoot: rootDir,
    pnpmPath: commandPath("pnpm"),
    uvPath: commandPath("uv"),
    dashboardPort,
    supervisorPort,
  });

  mkdirSync(join(rootDir, ".data", "tmp"), { recursive: true });
  mkdirSync(join(rootDir, ".data", "uv-cache"), { recursive: true });
  mkdirSync(join(rootDir, ".kendall-local", "governed-worker-evidence"), { recursive: true });
  mkdirSync(userSystemdDir(), { recursive: true });

  for (const [name, contents] of Object.entries(units)) {
    writeFileSync(join(userSystemdDir(), name), contents);
  }

  systemctlUser(["daemon-reload"]);
  systemctlUser(["enable", "--now", unitNames.target]);

  if (enableLinger) {
    tryEnableLinger();
  }

  console.log("\nKendall cockpit services installed.");
  console.log(`Dashboard: http://127.0.0.1:${dashboardPort}/pipeline`);
  console.log(`Supervisor: http://127.0.0.1:${supervisorPort}/health`);
  console.log("Status: pnpm run cockpit:status");
}

function uninstall() {
  systemctlUser(["disable", "--now", unitNames.target]);
  for (const name of Object.values(unitNames)) {
    rmSync(join(userSystemdDir(), name), { force: true });
  }
  systemctlUser(["daemon-reload"]);
  console.log("Kendall cockpit services removed from user systemd.");
}

function printUnits() {
  const units = renderCockpitUnits({
    repoRoot: rootDir,
    pnpmPath: commandPath("pnpm"),
    uvPath: commandPath("uv"),
    dashboardPort: process.env.KENDALL_COCKPIT_DASHBOARD_PORT || "3000",
    supervisorPort: process.env.KENDALL_COCKPIT_SUPERVISOR_PORT || "8100",
  });
  for (const [name, contents] of Object.entries(units)) {
    console.log(`\n# ${name}\n${contents}`);
  }
}

function main() {
  const command = process.argv[2] || "status";
  if (command === "install") {
    install({ enableLinger: !process.argv.includes("--no-linger") });
    return;
  }
  if (command === "uninstall") {
    uninstall();
    return;
  }
  if (command === "start") {
    systemctlUser(["start", unitNames.target]);
    return;
  }
  if (command === "stop") {
    systemctlUser(["stop", unitNames.target]);
    return;
  }
  if (command === "restart") {
    systemctlUser(["restart", unitNames.target]);
    return;
  }
  if (command === "status") {
    systemctlUser(["status", unitNames.target, unitNames.supervisor, unitNames.dashboard]);
    return;
  }
  if (command === "logs") {
    systemctlUser(["journalctl", "-u", unitNames.supervisor, "-u", unitNames.dashboard, "-f"]);
    return;
  }
  if (command === "print") {
    printUnits();
    return;
  }

  console.error(`Unknown command: ${command}`);
  console.error("Expected one of: install, uninstall, start, stop, restart, status, logs, print");
  process.exit(1);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
