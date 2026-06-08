import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
const runRemoteChecks = args.has("--remote");
const strict = args.has("--strict");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: pnpm run doctor:github -- [--remote] [--strict]

Checks local Git/GitHub delivery readiness without changing credentials.

Options:
  --remote   Also fetch origin and test git ls-remote against origin/main.
  --strict   Treat warnings as failures.
`);
  process.exit(0);
}

const findings = [];

function run(command, commandArgs, options = {}) {
  const result = spawnSync(resolveCommand(command), resolveArgs(command, commandArgs), {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function resolveCommand(command) {
  if (process.platform === "win32" && command === "pnpm") {
    return "pnpm.cmd";
  }
  return command;
}

function resolveArgs(_command, commandArgs) {
  return commandArgs;
}

function ok(message) {
  findings.push({ level: "OK", message });
}

function warn(message) {
  findings.push({ level: "WARN", message });
}

function fail(message) {
  findings.push({ level: "FAIL", message });
}

function commandOutput(command, commandArgs) {
  const result = run(command, commandArgs);
  return result.code === 0 ? result.stdout : "";
}

function includesGhCredentialHelper(value) {
  return /\bgh(\.exe)?\b.*auth\s+git-credential/i.test(value);
}

function verifyGitAvailable() {
  const result = run("git", ["--version"]);
  if (result.code !== 0) {
    fail("git is not available on PATH.");
    return false;
  }
  ok(result.stdout);
  return true;
}

function verifyRepository() {
  const result = run("git", ["rev-parse", "--is-inside-work-tree"]);
  if (result.code !== 0 || result.stdout !== "true") {
    fail("Current directory is not inside a Git work tree.");
    return false;
  }
  ok("Repository work tree detected.");
  return true;
}

function verifyOrigin() {
  const result = run("git", ["remote", "get-url", "origin"]);
  if (result.code !== 0 || !result.stdout) {
    fail("origin remote is missing.");
    return "";
  }

  ok(`origin remote is configured: ${redactRemoteUrl(result.stdout)}`);
  if (!/github\.com[:/]/i.test(result.stdout)) {
    warn("origin does not look like a GitHub remote; GitHub delivery automation may not apply.");
  }
  return result.stdout;
}

function verifyCredentialConfig() {
  const helpers = commandOutput("git", ["config", "--show-origin", "--get-all", "credential.helper"]);
  const githubHelpers = commandOutput("git", ["config", "--show-origin", "--get-all", "credential.https://github.com.helper"]);
  const store = commandOutput("git", ["config", "--global", "--get", "credential.credentialStore"]);

  if (helpers) {
    ok(`credential.helper configured: ${singleLine(helpers)}`);
  } else {
    warn("credential.helper is not configured; Git may prompt or fail during remote delivery.");
  }

  if (githubHelpers) {
    if (includesGhCredentialHelper(githubHelpers)) {
      warn("GitHub-specific gh auth git-credential helper is configured. If Git remote operations fail, remove that helper and prefer Git Credential Manager.");
    } else {
      ok(`GitHub-specific credential helper configured: ${singleLine(githubHelpers)}`);
    }
  } else {
    ok("No GitHub-specific credential helper override is configured.");
  }

  if (process.platform === "win32") {
    if (store.toLowerCase() === "dpapi") {
      ok("Git Credential Manager credentialStore is dpapi.");
    } else if (store) {
      warn(`Git Credential Manager credentialStore is ${store}; dpapi is the known-good Windows setting for this repo.`);
    } else {
      warn("Git Credential Manager credentialStore is not set; dpapi is the known-good Windows setting for this repo.");
    }
  }
}

function verifyGhStatus() {
  const result = run("gh", ["auth", "status"]);
  if (result.code === 0) {
    ok("GitHub CLI auth status is available.");
    return;
  }

  warn("GitHub CLI auth is not available. This is acceptable for normal Git pushes when Git Credential Manager works and for Codex connector-backed PR automation. It is only required for workflows that explicitly shell out to gh.");
}

function verifyRemoteConnectivity() {
  if (!runRemoteChecks) {
    warn("Remote connectivity was not checked. Re-run with `pnpm run doctor:github -- --remote` before live delivery.");
    return;
  }

  const fetchResult = run("git", ["fetch", "origin"], { timeout: 120_000 });
  if (fetchResult.code !== 0) {
    fail(`git fetch origin failed: ${remoteFailureMessage(fetchResult.stderr || fetchResult.stdout)}`);
    return;
  }
  ok("git fetch origin succeeded.");

  const lsRemote = run("git", ["ls-remote", "--heads", "origin", "main"], { timeout: 120_000 });
  if (lsRemote.code !== 0 || !lsRemote.stdout) {
    fail(`git ls-remote origin main failed: ${remoteFailureMessage(lsRemote.stderr || lsRemote.stdout)}`);
    return;
  }
  ok("git ls-remote origin main succeeded.");

  const aheadBehind = run("git", ["rev-list", "--left-right", "--count", "origin/main...HEAD"]);
  if (aheadBehind.code === 0 && aheadBehind.stdout) {
    const [behind = "?", ahead = "?"] = aheadBehind.stdout.split(/\s+/);
    ok(`Local branch divergence from origin/main: behind ${behind}, ahead ${ahead}.`);
  } else {
    warn("Could not compute local divergence from origin/main.");
  }
}

function redactRemoteUrl(value) {
  return value.replace(/(https?:\/\/)([^/@\s]+)@/i, "$1<redacted>@");
}

function singleLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function remoteFailureMessage(value) {
  const message = singleLine(value);
  if (/key not valid for use in specified state|protecteddata|dpapi|access is denied/i.test(message)) {
    return `${message} Credential storage appears unavailable in this execution context; run \`git credential-manager diagnose\` and refresh GitHub credentials from an interactive user session.`;
  }
  if (/could not read username|\/dev\/tty|terminal prompts disabled/i.test(message)) {
    return `${message} Git could not prompt for credentials; refresh credentials interactively or configure an SSH remote.`;
  }
  return message;
}

if (verifyGitAvailable() && verifyRepository()) {
  verifyOrigin();
  verifyCredentialConfig();
  verifyGhStatus();
  verifyRemoteConnectivity();
}

for (const finding of findings) {
  const printer = finding.level === "FAIL" ? console.error : console.log;
  printer(`${finding.level}: ${finding.message}`);
}

const failures = findings.filter((finding) => finding.level === "FAIL");
const warnings = findings.filter((finding) => finding.level === "WARN");

if (failures.length > 0 || (strict && warnings.length > 0)) {
  process.exit(1);
}

console.log("GitHub sync doctor completed.");
