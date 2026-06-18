import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { runBootstrapController } from "../../scripts/lib/linux-bootstrap/controller.mjs";
import { buildEvidence } from "../../scripts/lib/linux-bootstrap/evidence.mjs";
import { validateBootstrapEvidence } from "../../scripts/lib/linux-bootstrap/evidence-schema.mjs";

const repoRoot = process.cwd();

function options(overrides = {}) {
  return {
    mode: "verify-only",
    target: "local",
    user: "",
    hostname: "",
    evidence: "docs/linux-install/evidence/test-controller-evidence-delete-me.json",
    approvalId: "",
    ...overrides,
  };
}

function localIdentityOutput(overrides = {}) {
  const identity = {
    user: "ubuntu",
    uid: "1000",
    hostname: "ubuntu-host",
    arch: "x86_64",
    home: "/home/ubuntu",
    os_id: "ubuntu",
    os_version: "26.04",
    sudo: "available",
    disk_available_kb: "8388608",
    network: "github-dns-ok",
    ...overrides,
  };
  return Object.entries(identity)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function validatorOutput() {
  return JSON.stringify({
    schema: "kendall-linux-install-evidence/v1",
    generated_at: "2026-06-17T00:00:00.000Z",
    mode: "verify",
    target: {
      alias: "local",
      user: "ubuntu",
      hostname: "ubuntu-host",
      repo: "/home/ubuntu/Kendall_Nxt",
      minimumOsVersion: "26.04",
      nodeRange: ">=22 <25",
      address_source: "local-session",
    },
    authority: { level: "verify", approval_id: null },
    checks: [
      { id: "git", status: "pass", summary: "git version 2.53.0" },
      { id: "node", status: "pass", summary: "v22.22.1" },
      { id: "pnpm", status: "pass", summary: "11.5.2" },
      { id: "repo", status: "pass", summary: "repo found at /home/ubuntu/Kendall_Nxt on branch main" },
    ],
    checks_summary: { pass: 4, fail: 0, warn: 0 },
    mutations: [],
    redactions: [],
    result: "pass",
  });
}

function fakeExecutor({ repoAction = "existing", identity = localIdentityOutput() } = {}) {
  const calls = [];
  return {
    calls,
    command(command, args = [], options = {}) {
      calls.push(["command", command, args]);
      if (command === "bash" && args[0] === "-s" && options.input?.includes("bootstrap-linux")) {
        return { status: 0, stdout: "install ok", stderr: "" };
      }
      if (command === "bash" && args.includes("scripts/validate-linux-install.sh")) {
        return { status: 0, stdout: validatorOutput(), stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
    shell(command) {
      calls.push(["shell", command]);
      if (command.includes("id -un")) {
        return { status: 0, stdout: identity, stderr: "" };
      }
      if (command.includes("git clone")) {
        return { status: 0, stdout: `repo_action=${repoAction}\n`, stderr: "" };
      }
      if (command.includes("pnpm run setup")) {
        return { status: 0, stdout: "setup ok", stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    },
  };
}

function localPreflightGate() {
  return {
    id: "local-preflight",
    status: "pass",
    summary: "local ready",
    recovery: "none",
    command: "test",
  };
}

function removeEvidence(path) {
  const fullPath = join(repoRoot, path);
  if (existsSync(fullPath)) {
    rmSync(fullPath);
  }
}

test("plan mode emits full local gate sequence and writes no evidence", () => {
  const planOptions = options({ mode: "plan", evidence: "" });
  const evidence = buildEvidence({ repoRoot, options: planOptions });
  const executor = fakeExecutor();

  const result = runBootstrapController({
    repoRoot,
    options: planOptions,
    executor,
    evidence,
    operatorPreflightGate: localPreflightGate,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.wroteEvidence, false);
  assert.deepEqual(evidence.mutations, []);
  assert.deepEqual(
    evidence.gates.map((gate) => gate.id),
    [
      "command-contract",
      "local-preflight",
      "evidence-path",
      "local-identity",
      "base-tools",
      "repo-state",
      "install-script",
      "full-verify",
      "evidence-write",
      "manual-auth-summary",
    ],
  );
  assert(evidence.gates.some((gate) => gate.command === "scripts/bootstrap-linux.sh --install-kendall-vnxt"));
  assert.equal(evidence.gates.find((gate) => gate.id === "evidence-path").status, "skip");
  assert.deepEqual(executor.calls, []);
});

test("doctor mode runs read-only verification and writes no evidence", () => {
  const doctorOptions = options({ mode: "doctor", evidence: "" });
  const evidence = buildEvidence({ repoRoot, options: doctorOptions });
  const executor = fakeExecutor();

  const result = runBootstrapController({
    repoRoot,
    options: doctorOptions,
    executor,
    evidence,
    operatorPreflightGate: localPreflightGate,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.wroteEvidence, false);
  assert.deepEqual(evidence.mutations, []);
  assert(evidence.gates.some((gate) => gate.id === "full-verify" && gate.status === "pass"));
  assert(executor.calls.some((call) => call[0] === "command" && call[2].includes("scripts/validate-linux-install.sh")));
});

test("verify-only blocks unsupported local identity and writes failure evidence", () => {
  const verifyOptions = options();
  removeEvidence(verifyOptions.evidence);
  mkdirSync(join(repoRoot, "docs", "linux-install", "evidence"), { recursive: true });
  const evidence = buildEvidence({ repoRoot, options: verifyOptions });

  const result = runBootstrapController({
    repoRoot,
    options: verifyOptions,
    executor: fakeExecutor({ identity: localIdentityOutput({ os_version: "24.04" }) }),
    evidence,
    operatorPreflightGate: localPreflightGate,
  });

  assert.equal(result.exitCode, 1);
  const parsed = JSON.parse(readFileSync(join(repoRoot, verifyOptions.evidence), "utf8"));
  assert.equal(parsed.result, "fail");
  assert(parsed.gates.some((gate) => gate.id === "local-identity" && gate.status === "fail"));
  assert.deepEqual(parsed.mutations, ["evidence-file"]);
  assert.equal(parsed.manual_tasks.find((task) => task.id === "tailscale-login").status, "manual-post-install");
  assert.deepEqual(validateBootstrapEvidence(parsed), []);
  removeEvidence(verifyOptions.evidence);
});

test("invalid evidence path stops before local identity work", () => {
  const verifyOptions = options({ evidence: "../outside-bootstrap-evidence.json" });
  const evidence = buildEvidence({ repoRoot, options: verifyOptions });
  const executor = fakeExecutor();

  const result = runBootstrapController({
    repoRoot,
    options: verifyOptions,
    executor,
    evidence,
    operatorPreflightGate: localPreflightGate,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.wroteEvidence, false);
  assert(evidence.gates.some((gate) => gate.id === "evidence-path" && gate.status === "fail"));
  assert.deepEqual(evidence.mutations, []);
  assert.deepEqual(executor.calls, []);
});

test("verify-only records tool versions and repo state from validator output", () => {
  const verifyOptions = options();
  removeEvidence(verifyOptions.evidence);
  mkdirSync(join(repoRoot, "docs", "linux-install", "evidence"), { recursive: true });
  const evidence = buildEvidence({ repoRoot, options: verifyOptions });
  const executor = fakeExecutor();

  const result = runBootstrapController({
    repoRoot,
    options: verifyOptions,
    executor,
    evidence,
    operatorPreflightGate: localPreflightGate,
  });

  assert.equal(result.exitCode, 0);
  const parsed = JSON.parse(readFileSync(join(repoRoot, verifyOptions.evidence), "utf8"));
  assert.equal(parsed.tool_versions.find((tool) => tool.id === "node").summary, "v22.22.1");
  assert.equal(parsed.repo_state.id, "repo");
  assert.equal(parsed.validation_summary.pass, 4);
  assert.equal(parsed.target.address_source, "local-session");
  assert.deepEqual(parsed.mutations, ["evidence-file"]);
  assert(!evidence.gates.some((gate) => gate.command === "scripts/bootstrap-linux.sh --install-kendall-vnxt" && gate.status !== "skip"));
  assert(!executor.calls.some((call) => call[0] === "shell" && call[1].includes("git clone")));
  assert(!executor.calls.some((call) => call[0] === "shell" && call[1].includes("pnpm run setup")));
  assert(!executor.calls.some((call) => call[0] === "command" && call[1] === "bash" && call[2][0] === "-s"));
  assert.deepEqual(validateBootstrapEvidence(parsed), []);
  removeEvidence(verifyOptions.evidence);
});
