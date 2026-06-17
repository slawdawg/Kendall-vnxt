#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseLinuxBootstrapArgs, usage } from "./lib/linux-bootstrap/args.mjs";
import { buildEvidence, printSummary } from "./lib/linux-bootstrap/evidence.mjs";
import { createExecutor } from "./lib/linux-bootstrap/executor.mjs";
import { runBootstrapController } from "./lib/linux-bootstrap/controller.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function failUsage(message) {
  console.error(message);
  console.error("");
  console.error(usage());
  process.exit(2);
}

function runLocal(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
    shell: false,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? result.error?.message ?? "",
  };
}

function commandAvailable(command) {
  const result = runLocal(process.platform === "win32" ? "where.exe" : "which", [command]);
  return result.status === 0;
}

function localSyntaxGate() {
  const nodeCheck = runLocal("node", ["--check", "scripts/linux-bootstrap.mjs"]);
  if (nodeCheck.status !== 0) {
    return {
      id: "operator-preflight",
      status: "fail",
      summary: "linux bootstrap entrypoint failed node syntax check",
      recovery: "Fix scripts/linux-bootstrap.mjs syntax before running bootstrap.",
      command: "node --check scripts/linux-bootstrap.mjs",
    };
  }

  const shellCheck = runLocal("bash", ["-n", "scripts/bootstrap-linux.sh", "scripts/validate-linux-install.sh"]);
  if (shellCheck.status !== 0) {
    return {
      id: "operator-preflight",
      status: "fail",
      summary: "Linux shell scripts failed bash syntax check",
      recovery: "Fix bootstrap-linux.sh or validate-linux-install.sh syntax before running bootstrap.",
      command: "bash -n scripts/bootstrap-linux.sh scripts/validate-linux-install.sh",
    };
  }

  for (const tool of ["node", "pnpm", "bash"]) {
    if (!commandAvailable(tool)) {
      return {
        id: "local-preflight",
        status: "fail",
        summary: `${tool} is not available in the local environment`,
        recovery: `Install ${tool} or fix PATH before running bootstrap.`,
        command: `check ${tool} availability`,
      };
    }
  }

  return {
    id: "local-preflight",
    status: "pass",
    summary: "local tools and script syntax are ready",
    recovery: "none",
    command: "node --check, bash -n, and tool availability checks",
  };
}

function run() {
  let options;
  try {
    options = parseLinuxBootstrapArgs(process.argv.slice(2));
  } catch (error) {
    failUsage(error.message);
  }

  const evidence = buildEvidence({ repoRoot, options });
  const executor = createExecutor({ runLocal });
  const result = runBootstrapController({
    repoRoot,
    options,
    executor,
    evidence,
    operatorPreflightGate: localSyntaxGate,
  });

  printSummary(evidence);

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

run();
