#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import {
  buildBranchFoundationReport,
  buildBranchFoundationReadinessEvidence,
  buildBranchFoundationReportFromGit,
  formatBranchFoundationReadinessEvidence,
  isProtectedBranch,
  protectedBranches,
  requiredBranchLanes,
  validateBranchFoundationMutationCommand,
} from "./lib/branch-foundation.mjs";
import { runBranchFoundationCli } from "./branch-foundation.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export function runBranchFoundationChecks(context = {}) {
  const findings = [];
  const cwd = context.cwd || rootDir;
  const cliRunner = context.runCli || ((args) => runBranchFoundationCli(args, { cwd }));

  checkBranchPolicy(findings);
  checkPackageScripts(findings);
  checkCliNoMutation(findings, { cwd, cliRunner });
  checkMutationCommandSafety(findings, { cwd, cliRunner });

  if (findings.length > 0) {
    return {
      status: 1,
      stdout: "",
      stderr: `Branch foundation checks failed:\n${findings.map((finding) => `- ${finding}`).join("\n")}\n`,
      findings,
    };
  }

  const readiness = buildBranchFoundationReadinessEvidence(buildBranchFoundationReportFromGit({}, { cwd }));

  return {
    status: 0,
    stdout: `Branch foundation checks passed.\n\n${formatBranchFoundationReadinessEvidence(readiness)}\n`,
    stderr: "",
    findings,
    readiness,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runBranchFoundationChecks();
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.status;
}

function checkBranchPolicy(findings) {
  const expectedLanes = [
    ["dev", "development"],
    ["staging", "release_candidate"],
    ["main", "human_gate"],
    ["prod", "production"],
  ];
  const actualLanes = requiredBranchLanes.map((lane) => [lane.branch, lane.role]);
  if (JSON.stringify(actualLanes) !== JSON.stringify(expectedLanes)) {
    findings.push("requiredBranchLanes drifted from dev/staging/main/prod policy");
  }

  for (const branch of ["main", "master", "prod"]) {
    if (!protectedBranches.includes(branch) || !isProtectedBranch(branch)) {
      findings.push(`protected branch policy does not include ${branch}`);
    }
  }

  const report = buildBranchFoundationReport({
    repoRoot: rootDir,
    currentBranch: "main",
    dirtyState: "clean",
    defaultTaskTarget: "dev",
    expectedBase: "main",
    localBranches: { main: { exists: true } },
    remoteBranches: { main: { exists: true } },
  });
  if (report.authorityState !== "report_only") {
    findings.push("report builder default authority state is not report_only");
  }
  if (!report.plannedMutations.every((mutation) => mutation.requiresApproval === true)) {
    findings.push("planned mutations are not approval gated");
  }
}

function checkPackageScripts(findings) {
  const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  if (packageJson.scripts?.["test:branch-foundation"] !== "node --test tests/branch-foundation.test.mjs") {
    findings.push("package.json is missing test:branch-foundation");
  }
  if (packageJson.scripts?.["check:branch-foundation"] !== "node ./scripts/check-branch-foundation.mjs") {
    findings.push("package.json is missing check:branch-foundation");
  }
}

function checkCliNoMutation(findings, context) {
  const before = refSnapshot(context.cwd);
  const report = context.cliRunner(["report", "--json"]);
  const afterReport = refSnapshot(context.cwd);
  const plan = context.cliRunner(["plan", "--json"]);
  const afterPlan = refSnapshot(context.cwd);

  if (before.status !== 0) {
    findings.push(`could not capture Git refs before CLI checks: ${before.stderr}`);
    return;
  }
  if (afterReport.status !== 0) {
    findings.push(`could not capture Git refs after report command: ${afterReport.stderr}`);
    return;
  }
  if (afterPlan.status !== 0) {
    findings.push(`could not capture Git refs after plan command: ${afterPlan.stderr}`);
    return;
  }
  if (report.status !== 0) {
    findings.push(`report command failed: ${report.stderr}`);
  }
  if (plan.status !== 0) {
    findings.push(`plan command failed: ${plan.stderr}`);
  }
  if (before.snapshot !== afterReport.snapshot || before.snapshot !== afterPlan.snapshot) {
    findings.push("branch foundation report/plan mutated Git refs");
  }

  if (report.status === 0) {
    validateCliReportJson(findings, "report", report.stdout);
  }
  if (plan.status === 0) {
    validateCliReportJson(findings, "plan", plan.stdout);
  }
}

function checkMutationCommandSafety(findings, context) {
  const before = refSnapshot(context.cwd);
  const applyLocal = context.cliRunner(["apply-local"]);
  const afterApplyLocal = refSnapshot(context.cwd);
  const pushRemote = context.cliRunner(["push-remote"]);
  const afterPushRemote = refSnapshot(context.cwd);

  if (before.status !== 0 || afterApplyLocal.status !== 0 || afterPushRemote.status !== 0) {
    findings.push("could not prove mutating command refusal left Git state unchanged");
    return;
  }
  if (applyLocal.status === 0 || !/approval required/i.test(applyLocal.stderr)) {
    findings.push("apply-local did not refuse without approval");
  }
  if (pushRemote.status === 0 || !/approval required/i.test(pushRemote.stderr)) {
    findings.push("push-remote did not refuse without approval");
  }
  if (before.snapshot !== afterApplyLocal.snapshot || before.snapshot !== afterPushRemote.snapshot) {
    findings.push("apply-local/push-remote without approval mutated Git state");
  }

  const allowedCommands = [
    ["create_local_branch", ["branch", "dev", "main"]],
    ["push_remote_branch", ["push", "-u", "origin", "refs/heads/dev:refs/heads/dev"]],
  ];
  for (const [operation, command] of allowedCommands) {
    if (!validateBranchFoundationMutationCommand(operation, command)) {
      findings.push(`allowed ${operation} command shape is no longer accepted`);
    }
  }

  const blockedCommands = [
    ["create_local_branch", ["branch", "-f", "dev", "main"]],
    ["create_local_branch", ["branch", "main", "main"]],
    ["push_remote_branch", ["push", "--force", "origin", "refs/heads/dev:refs/heads/dev"]],
    ["push_remote_branch", ["push", "-u", "origin", "+refs/heads/dev:refs/heads/dev"]],
    ["push_remote_branch", ["push", "-u", "origin", "refs/heads/*:refs/heads/*"]],
    ["push_remote_branch", ["push", "-u", "origin", ":refs/heads/dev"]],
    ["push_remote_branch", ["push", "--mirror", "origin"]],
    ["push_remote_branch", ["push", "--all", "origin"]],
    ["push_remote_branch", ["push", "--tags", "origin"]],
  ];
  for (const [operation, command] of blockedCommands) {
    if (validateBranchFoundationMutationCommand(operation, command)) {
      findings.push(`disallowed ${operation} command shape was accepted: ${command.join(" ")}`);
    }
  }
}

function refSnapshot(cwd) {
  const refs = runGit(["for-each-ref", "--format=%(refname):%(objectname)", "refs"], cwd);
  const status = runGit(["-c", "status.refreshIndex=false", "status", "--porcelain=v2", "--branch"], cwd);
  if (refs.status !== 0) {
    return {
      status: refs.status,
      snapshot: "",
      stderr: refs.stderr || "git for-each-ref failed",
    };
  }
  if (status.status !== 0) {
    return {
      status: status.status,
      snapshot: "",
      stderr: status.stderr || "git status failed",
    };
  }
  return {
    status: 0,
    snapshot: `refs:\n${refs.stdout}\nstatus:\n${status.stdout}`,
    stderr: "",
  };
}

function validateCliReportJson(findings, command, stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.authorityState !== "report_only") {
      findings.push(`CLI ${command} did not remain report_only`);
    }
    if (!Array.isArray(parsed.plannedMutations)) {
      findings.push(`CLI ${command} did not emit plannedMutations array`);
      return;
    }
    if (!parsed.plannedMutations.every((mutation) => mutation?.requiresApproval === true)) {
      findings.push(`CLI ${command} emitted a planned mutation without approval gating`);
    }
  } catch (error) {
    findings.push(`CLI ${command} did not emit valid JSON: ${error.message}`);
  }
}

function runGit(args, cwd = rootDir) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || result.error?.message || "").trim(),
  };
}
