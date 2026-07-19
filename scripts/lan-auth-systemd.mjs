import { spawnSync } from "node:child_process";
import { closeSync, constants, existsSync, fchmodSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
export const unitNames = {
  target: "kendall-lan-auth.target",
  supervisor: "kendall-lan-auth-supervisor.service",
  dashboard: "kendall-lan-auth-dashboard.service",
};
export const legacyTarget = "kendall-cockpit.target";
const envMarker = "# Managed by Kendall_Nxt LAN-auth systemd integration v1";
const managedMarkerPrefix = "# Managed by Kendall_Nxt LAN-auth systemd integration";

function urlHost(address) {
  return isIP(address) === 6 ? new URL(`https://[${address}]`).hostname : address;
}

function quoteEnv(value) {
  if (/[\u0000-\u001f\u007f]/.test(String(value))) throw new Error("Environment values cannot contain control characters.");
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$")}"`;
}

function rejectUnitUnsafePath(pathValue, label) {
  if (!isAbsolute(pathValue) || /[\s%\\\u0000-\u001f\u007f]/.test(pathValue)) {
    throw new Error(`${label} contains characters unsafe for a systemd unit.`);
  }
}

function privateAncestors(pathValue, label) {
  let current = dirname(pathValue);
  while (true) {
    if (!existsSync(current)) {
      if (current === "/") break;
      current = dirname(current);
      continue;
    }
    const details = lstatSync(current);
    const stickySharedTemp = (details.mode & 0o1000) !== 0 && (details.mode & 0o022) === 0o022 && current !== dirname(pathValue);
    if (details.isSymbolicLink() || !details.isDirectory() || ((details.mode & 0o022) !== 0 && !stickySharedTemp)) {
      throw new Error(`${label} parent directory is unsafe.`);
    }
    if (current === "/") break;
    current = dirname(current);
  }
}

function privatePath(pathValue, label, { directory = false } = {}) {
  if (!isAbsolute(pathValue)) throw new Error(`${label} must be an absolute path.`);
  privateAncestors(pathValue, label);
  const details = lstatSync(pathValue);
  if (details.isSymbolicLink() || (directory ? !details.isDirectory() : !details.isFile())) {
    throw new Error(`${label} must be a private, non-symlink ${directory ? "directory" : "file"}.`);
  }
  if (details.uid !== process.getuid?.() || (details.mode & 0o077) !== 0) {
    throw new Error(`${label} must be owned by the current user and not group/world accessible.`);
  }
  return pathValue;
}

export function resolveLanAuthConfig({
  repoRoot = rootDir,
  lanAddress = process.env.KENDALL_LAN_AUTH_BIND_ADDRESS || process.env.KENDALL_DASHBOARD_BIND_ADDRESS,
  authDir = process.env.KENDALL_LAN_AUTH_DIR || join(homedir(), "kendall-lan-auth"),
  dashboardPort = process.env.KENDALL_DASHBOARD_PORT || "3000",
  systemdEnvFile = process.env.KENDALL_LAN_AUTH_ENV_FILE || join(authDir, "lan-auth.env"),
  validateFiles = true,
} = {}) {
  if (!isAbsolute(repoRoot)) throw new Error("Repository root must be absolute.");
  const normalizedAddress = String(lanAddress || "").toLowerCase();
  const ipVersion = isIP(lanAddress);
  const ipv4Parts = ipVersion === 4 ? normalizedAddress.split(".").map(Number) : [];
  const ipv4Unsafe = ipVersion === 4 && (ipv4Parts[0] === 0 || ipv4Parts[0] === 127);
  const ipv6Parts = ipVersion === 6 ? expandIpv6(normalizedAddress) : null;
  const ipv6Unsafe = ipVersion === 6 && ipv6Parts && (
    ipv6Parts.every((part) => part === 0) ||
    (ipv6Parts.slice(0, 7).every((part) => part === 0) && ipv6Parts[7] === 1) ||
    (ipv6Parts.slice(0, 5).every((part) => part === 0) && ipv6Parts[5] === 0xffff)
  );
  if (!lanAddress || ipVersion === 0 || ipv4Unsafe || ipv6Unsafe) {
    throw new Error("KENDALL_LAN_AUTH_BIND_ADDRESS must be a numeric, non-wildcard LAN address.");
  }
  lanAddress = normalizedAddress;
  if (!/^\d+$/.test(String(dashboardPort)) || String(Number(dashboardPort)) !== String(dashboardPort) || Number(dashboardPort) < 1 || Number(dashboardPort) > 65535) {
    throw new Error("KENDALL_DASHBOARD_PORT must be a valid TCP port.");
  }
  rejectUnitUnsafePath(repoRoot, "Repository root");
  rejectUnitUnsafePath(authDir, "LAN-auth directory");
  rejectUnitUnsafePath(systemdEnvFile, "LAN-auth environment file");
  repoRoot = resolvePath(repoRoot);
  authDir = resolvePath(authDir);
  systemdEnvFile = resolvePath(systemdEnvFile);
  const host = urlHost(lanAddress);
  const paths = {
    authDir,
    bootstrapPasswordFile: join(authDir, "bootstrap-password"),
    certificateFile: join(authDir, "dashboard.crt"),
    keyFile: join(authDir, "dashboard.key"),
    supervisorUdsPath: join(authDir, "supervisor.sock"),
  };
  const userUnitDir = resolvePath(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user");
  const generatedUnitPaths = Object.values(unitNames).map((name) => join(userUnitDir, name));
  if ([systemdEnvFile, ...Object.values(paths)].some((pathValue, index, all) => all.indexOf(pathValue) !== index) || generatedUnitPaths.includes(systemdEnvFile) || systemdEnvFile.startsWith(`${userUnitDir}/`)) {
    throw new Error("LAN-auth environment and credential paths must not overlap.");
  }
  if (validateFiles) {
    privatePath(authDir, "LAN-auth directory", { directory: true });
    privatePath(paths.bootstrapPasswordFile, "LAN-auth bootstrap password file");
    privatePath(paths.certificateFile, "LAN-auth certificate file");
    privatePath(paths.keyFile, "LAN-auth key file");
    if (!existsSync(dirname(paths.supervisorUdsPath))) throw new Error("LAN-auth UDS parent directory is missing.");
    privatePath(dirname(paths.supervisorUdsPath), "LAN-auth UDS parent", { directory: true });
    privateAncestors(systemdEnvFile, "LAN-auth environment file");
    if (existsSync(systemdEnvFile)) privatePath(systemdEnvFile, "LAN-auth environment file");
    if (existsSync(paths.supervisorUdsPath)) {
      const uds = lstatSync(paths.supervisorUdsPath);
      if (uds.isSymbolicLink() || !uds.isSocket() || uds.uid !== process.getuid?.()) {
        throw new Error("LAN-auth supervisor UDS must be a socket owned by the current user.");
      }
    }
  }
  const canonicalPort = String(Number(dashboardPort));
  const portSuffix = canonicalPort === "443" ? "" : `:${canonicalPort}`;
  return {
    repoRoot,
    lanAddress,
    urlHost: host,
    dashboardPort: canonicalPort,
    dashboardOrigin: `https://${host}${portSuffix}`,
    dashboardAllowedHost: `${host}${portSuffix}`,
    systemdEnvFile,
    ...paths,
  };
}

function expandIpv6(address) {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parsePart = (part) => {
    if (!part.includes(".")) return [Number.parseInt(part, 16)];
    const octets = part.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return [Number.NaN];
    return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
  };
  const left = halves[0] ? halves[0].split(":").filter(Boolean).flatMap(parsePart) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":").filter(Boolean).flatMap(parsePart) : [];
  const zeroCount = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (zeroCount < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const parts = [...left, ...Array.from({ length: zeroCount }, () => 0), ...right];
  return parts.length === 8 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff) ? parts : null;
}

export function renderLanAuthEnvironment(config) {
  return `${envMarker}
KENDALL_LAN_AUTH_ENABLED=true
KENDALL_SUPERVISOR_TRANSPORT=private_uds
KENDALL_DASHBOARD_BIND_ADDRESS=${quoteEnv(config.lanAddress)}
KENDALL_DASHBOARD_PORT=${quoteEnv(config.dashboardPort)}
KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE=${quoteEnv(config.bootstrapPasswordFile)}
KENDALL_SUPERVISOR_UDS_PATH=${quoteEnv(config.supervisorUdsPath)}
KENDALL_DASHBOARD_TLS_CERT_FILE=${quoteEnv(config.certificateFile)}
KENDALL_DASHBOARD_TLS_KEY_FILE=${quoteEnv(config.keyFile)}
KENDALL_DASHBOARD_ORIGIN=${quoteEnv(config.dashboardOrigin)}
KENDALL_DASHBOARD_ALLOWED_HOST=${quoteEnv(config.dashboardAllowedHost)}
SUPERVISOR_CORS_ORIGINS=${quoteEnv(config.dashboardOrigin)}
SUPERVISOR_PORT=8000
`;
}

export function renderLanAuthUnits({ config, pnpmPath, uvPath, nodePath = process.execPath }) {
  if (!config) throw new Error("LAN-auth units require absolute paths and a resolved configuration.");
  rejectUnitUnsafePath(pnpmPath, "pnpm path");
  rejectUnitUnsafePath(uvPath, "uv path");
  rejectUnitUnsafePath(nodePath, "node path");
  const envFile = config.systemdEnvFile;
  const pathValue = [dirname(nodePath), process.env.PATH || "/usr/local/bin:/usr/bin:/bin"].filter((value, index, values) => values.indexOf(value) === index).join(":");
  if (/[\s%\\\u0000-\u001f\u007f]/.test(pathValue)) throw new Error("PATH contains characters unsafe for a systemd unit.");
  return {
    [unitNames.target]: `${envMarker}
[Unit]
Description=Kendall LAN-authenticated dashboard
Requires=${unitNames.supervisor} ${unitNames.dashboard}
After=network-online.target
Wants=network-online.target
Conflicts=${legacyTarget}

[Install]
WantedBy=default.target
`,
    [unitNames.supervisor]: `${envMarker}
[Unit]
Description=Kendall LAN-auth supervisor
After=network-online.target
Wants=network-online.target
PartOf=${unitNames.target}

[Service]
Type=simple
WorkingDirectory=${config.repoRoot}
Environment=PATH=${pathValue}
EnvironmentFile=${envFile}
ExecStart=${uvPath} run --directory services/supervisor supervisor
Restart=on-failure
RestartSec=5

[Install]
WantedBy=${unitNames.target}
`,
    [unitNames.dashboard]: `${envMarker}
[Unit]
Description=Kendall LAN-auth dashboard
Requires=${unitNames.supervisor}
BindsTo=${unitNames.supervisor}
After=${unitNames.supervisor}
PartOf=${unitNames.target}

[Service]
Type=simple
WorkingDirectory=${config.repoRoot}
Environment=PATH=${pathValue}
EnvironmentFile=${envFile}
ExecStart=${pnpmPath} run dev:dashboard
Restart=on-failure
RestartSec=5

[Install]
WantedBy=${unitNames.target}
`,
  };
}

function userSystemdDir() {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user");
}

function commandPath(name) {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  const value = result.stdout.trim();
  if (result.status !== 0 || !value) throw new Error(`Cannot find ${name} on PATH.`);
  return value;
}

function systemctlUser(args, { allowNotLoaded = false, allowInactive = false, allowDisabled = false } = {}) {
  const result = spawnSync("systemctl", ["--user", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (
    result.status !== 0 &&
    !(
      (allowNotLoaded && /not loaded|not found|could not be found/i.test(`${result.stdout}\n${result.stderr}`)) ||
      (allowInactive && /inactive/i.test(`${result.stdout}\n${result.stderr}`)) ||
      (allowDisabled && /disabled/i.test(`${result.stdout}\n${result.stderr}`))
    )
  ) {
    throw new Error((result.stderr || result.stdout || `systemctl ${args.join(" ")} failed`).trim());
  }
  return result;
}

function journalctlUser(args) {
  const result = spawnSync("journalctl", ["--user-unit", unitNames.supervisor, "--user-unit", unitNames.dashboard, ...args], { encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`journalctl exited with status ${result.status}.`);
  return result;
}

function managedFileContents(pathValue) {
  let details;
  try { details = lstatSync(pathValue); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (details.isSymbolicLink() || !details.isFile()) throw new Error(`Refusing unmanaged LAN-auth path: ${pathValue}`);
  const contents = readFileSync(pathValue, "utf8");
  if (!contents.startsWith(managedMarkerPrefix)) throw new Error(`Refusing to overwrite unmanaged LAN-auth path: ${pathValue}`);
  return contents;
}

function writeManagedFile(pathValue, contents, mode = 0o600) {
  mkdirSync(dirname(pathValue), { recursive: true, mode: 0o700 });
  const existing = managedFileContents(pathValue);
  const fd = openSync(pathValue, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0), mode);
  try {
    writeFileSync(fd, contents, { encoding: "utf8" });
    fchmodSync(fd, mode);
  } finally {
    closeSync(fd);
  }
  return existing;
}

function removeManagedFile(pathValue) {
  if (managedFileContents(pathValue) === null) return false;
  rmSync(pathValue);
  return true;
}

export function legacyWasActive({ systemctl = systemctlUser } = {}) {
  const result = systemctl(["is-active", legacyTarget], { allowNotLoaded: true, allowInactive: true });
  return result.status === 0 && result.stdout.trim() === "active";
}

export function legacyWasEnabled({ systemctl = systemctlUser } = {}) {
  const result = systemctl(["is-enabled", legacyTarget], { allowNotLoaded: true, allowDisabled: true });
  return result.status === 0 && result.stdout.trim() === "enabled";
}

export function stopLegacyCockpit({ systemctl = systemctlUser } = {}) {
  for (const service of ["kendall-cockpit-supervisor.service", "kendall-cockpit-dashboard.service", legacyTarget]) {
    systemctl(["stop", service], { allowNotLoaded: true });
  }
  systemctl(["disable", legacyTarget], { allowNotLoaded: true });
}

export function installLanAuth({ enable = true } = {}) {
  const config = resolveLanAuthConfig();
  const units = renderLanAuthUnits({ config, pnpmPath: commandPath("pnpm"), uvPath: commandPath("uv"), nodePath: commandPath("node") });
  mkdirSync(userSystemdDir(), { recursive: true, mode: 0o700 });
  const files = [[config.systemdEnvFile, renderLanAuthEnvironment(config), 0o600], ...Object.entries(units).map(([name, contents]) => [join(userSystemdDir(), name), contents, 0o644])];
  const previous = new Map();
  const legacyActive = legacyWasActive();
  const legacyEnabled = legacyWasEnabled();
  const lanActive = (() => { const result = systemctlUser(["is-active", unitNames.target], { allowNotLoaded: true }); return result.status === 0 && result.stdout.trim() === "active"; })();
  try {
    for (const [pathValue, contents, mode] of files) {
      previous.set(pathValue, managedFileContents(pathValue));
      writeManagedFile(pathValue, contents, mode);
    }
    stopLegacyCockpit();
    systemctlUser(["daemon-reload"]);
    if (enable) systemctlUser(lanActive ? ["restart", unitNames.target] : ["enable", "--now", unitNames.target]);
  } catch (error) {
    try { systemctlUser(["disable", "--now", unitNames.target], { allowNotLoaded: true }); } catch {}
    for (const [pathValue, contents] of previous) {
      if (contents === null) { if (existsSync(pathValue)) rmSync(pathValue); }
      else writeFileSync(pathValue, contents, { mode: pathValue === config.systemdEnvFile ? 0o600 : 0o644 });
    }
    try { systemctlUser(["daemon-reload"]); } catch {}
    if (lanActive) { try { systemctlUser(["start", unitNames.target]); } catch {} }
    if (legacyEnabled) { try { systemctlUser(["enable", legacyTarget], { allowNotLoaded: true }); } catch {} }
    if (legacyActive) { try { systemctlUser(["start", legacyTarget]); } catch {} }
    throw error;
  }
  console.log(`Installed ${unitNames.target}, ${unitNames.supervisor}, and ${unitNames.dashboard}.`);
  console.log(`Dashboard: ${config.dashboardOrigin}`);
  console.log(`Supervisor transport: ${config.supervisorUdsPath}`);
}

export function uninstallLanAuth() {
  const errors = [];
  const unitPaths = Object.values(unitNames).map((name) => join(userSystemdDir(), name));
  const supervisorPath = join(userSystemdDir(), unitNames.supervisor);
  const managedUnits = new Map();
  for (const pathValue of unitPaths) managedUnits.set(pathValue, managedFileContents(pathValue));
  let envFile = process.env.KENDALL_LAN_AUTH_ENV_FILE || null;
  if (!envFile && managedUnits.get(supervisorPath)) {
    const match = managedUnits.get(supervisorPath).match(/^EnvironmentFile=(.+)$/m);
    envFile = match?.[1] || null;
  }
  if (envFile) managedFileContents(envFile);
  systemctlUser(["disable", "--now", unitNames.target], { allowNotLoaded: true });
  for (const pathValue of unitPaths) {
    try { removeManagedFile(pathValue); } catch (error) { errors.push(error); }
  }
  if (envFile) {
    try { removeManagedFile(envFile); } catch (error) { errors.push(error); }
  }
  try { systemctlUser(["daemon-reload"]); } catch (error) { errors.push(error); }
  if (errors.length) throw new Error(errors.map((error) => error.message).join("; "));
  console.log("LAN-auth user-systemd units removed; auth material was preserved.");
}

function control(command) {
  systemctlUser([command, unitNames.target], { allowNotLoaded: command === "stop" });
}

function main() {
  const command = process.argv[2] || "status";
  if (command === "install") return installLanAuth();
  if (command === "uninstall") return uninstallLanAuth();
  if (["start", "stop", "restart"].includes(command)) return control(command);
  if (command === "status") return systemctlUser(["status", unitNames.target, unitNames.supervisor, unitNames.dashboard]);
  if (command === "logs") return journalctlUser(["-f"]);
  if (command === "print") {
    const config = resolveLanAuthConfig({ validateFiles: false });
    const units = renderLanAuthUnits({ config, pnpmPath: commandPath("pnpm"), uvPath: commandPath("uv"), nodePath: commandPath("node") });
    for (const [name, contents] of Object.entries(units)) console.log(`\n# ${name}\n${contents}`);
    console.log(`\n# ${config.systemdEnvFile}\n${renderLanAuthEnvironment(config)}`);
    return;
  }
  throw new Error("Expected one of: install, uninstall, start, stop, restart, status, logs, print");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
