#!/usr/bin/env node

import {
  buildBranchFoundationReportFromGit,
  formatBranchFoundationReport,
  runBranchFoundationApplyLocal,
  runBranchFoundationPushRemote,
} from "./lib/branch-foundation.mjs";
import { pathToFileURL } from "node:url";

const usage = `Usage:
  node ./scripts/branch-foundation.mjs report [--json]
  node ./scripts/branch-foundation.mjs plan [--json]
  node ./scripts/branch-foundation.mjs apply-local --approval "<approval>" [--json]
  node ./scripts/branch-foundation.mjs push-remote --approval "<approval>" [--json]`;

export function runBranchFoundationCli(argv = [], context = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    return {
      status: 1,
      stdout: "",
      stderr: `Unsupported branch foundation argument: ${safeArgumentLabel(parsed.error)}\n\n${usage}\n`,
    };
  }

  const { command, json, approval } = parsed;
  if (!["report", "plan", "apply-local", "push-remote"].includes(command)) {
    return {
      status: 1,
      stdout: "",
      stderr: `Unsupported branch foundation argument: ${safeArgumentLabel(command)}\n\n${usage}\n`,
    };
  }
  if (approval && !["apply-local", "push-remote"].includes(command)) {
    return {
      status: 1,
      stdout: "",
      stderr: `Unsupported branch foundation argument: --approval\n\n${usage}\n`,
    };
  }

  if (command === "apply-local") {
    return formatMutationCliResult(runBranchFoundationApplyLocal({ approval }, commandContext(context)), json);
  }
  if (command === "push-remote") {
    return formatMutationCliResult(runBranchFoundationPushRemote({ approval }, commandContext(context)), json);
  }

  const report = buildBranchFoundationReportFromGit({}, { cwd: context.cwd || process.cwd(), env: context.env || process.env });
  if (json) {
    return {
      status: 0,
      stdout: `${JSON.stringify(report, null, 2)}\n`,
      stderr: "",
    };
  }

  return {
    status: 0,
    stdout: `${formatBranchFoundationReport(report)}\n`,
    stderr: "",
  };
}

function parseArgs(argv) {
  const parsed = {
    command: "report",
    json: false,
    approval: undefined,
    error: "",
  };
  const commandArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--approval") {
      const approval = argv[index + 1];
      if (!approval || approval.startsWith("-")) {
        parsed.error = "--approval";
        return parsed;
      }
      parsed.approval = approval;
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      parsed.error = arg;
      return parsed;
    }
    commandArgs.push(arg);
  }
  if (commandArgs.length > 1) {
    parsed.error = commandArgs[1];
    return parsed;
  }
  parsed.command = commandArgs[0] || "report";
  return parsed;
}

function commandContext(context) {
  return { cwd: context.cwd || process.cwd(), env: context.env || process.env };
}

function formatMutationCliResult(result, json) {
  if (json) {
    return {
      status: result.status,
      stdout: `${JSON.stringify(result, null, 2)}\n`,
      stderr: "",
    };
  }
  const output = `${formatMutationResult(result)}\n`;
  if (result.status === 0) {
    return { status: 0, stdout: output, stderr: "" };
  }
  return { status: result.status, stdout: "", stderr: output };
}

function formatMutationResult(result) {
  const lines = [
    "Branch Foundation Mutation Result",
    `Authority state: ${result.authorityState}`,
    `Approval: ${result.approvalPresent ? "present" : "missing"}`,
    "",
    "Protected branch warnings:",
  ];
  const warnings = Array.isArray(result.protectedBranchWarnings) ? result.protectedBranchWarnings : [];
  if (warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of warnings) {
      lines.push(`- ${warning.severity || "warning"} ${warning.branch || "unknown"}: ${warning.reason || "unknown"}`);
    }
  }
  lines.push("", "Actions:");
  const actions = Array.isArray(result.actions) ? result.actions : [];
  if (actions.length === 0) {
    lines.push("- none");
  } else {
    for (const action of actions) {
      const target = action.branch || action.operation || "unknown";
      const detail = action.refspec
        ? ` ${action.refspec}`
        : action.fromRef
          ? ` from ${action.fromRef}`
          : action.headSha
            ? ` sha=${action.headSha}`
            : "";
      lines.push(`- ${target} ${action.status || "unknown"}${detail} (${formatReason(action.reason || action.operation || "ok")})`);
    }
  }
  return lines.join("\n");
}

function formatReason(reason) {
  return String(reason || "unknown").replace(/_/g, " ");
}

function safeArgumentLabel(value) {
  const label = String(value || "unknown");
  if (/(:\/\/|authorization|bearer|token|secret|password|credential|github_pat|ghp_|gho_|ghu_|ghs_|ghr_|sk-[a-z0-9])/i.test(label)) {
    return "[redacted]";
  }
  return label;
}

function main() {
  const result = runBranchFoundationCli(process.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.status;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  process.exitCode = main();
}
