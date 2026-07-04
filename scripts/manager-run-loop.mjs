#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { buildContinuousRunPlan, buildPreflight, parseCommonArgs } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));

function writePacket(packet) {
  const payload = options.summaryJson ? packet : packet.summary?.report || packet.summary || packet;
  console.log(options.summaryJson ? JSON.stringify(payload) : String(payload));
}

function tokenizeKnownCommand(command = "") {
  const tokens = [];
  let current = "";
  let quote = "";
  for (const char of String(command || "").trim()) {
    if (quote) {
      if (char === quote) {
        quote = "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) return null;
  if (current) tokens.push(current);
  return tokens;
}

function splitKnownNodeCommand(command = "") {
  const parts = tokenizeKnownCommand(command);
  if (!parts) {
    return null;
  }
  if (parts[0] !== "node") {
    return null;
  }
  const script = parts[1] || "";
  const allowedManagerScript = script.startsWith("./scripts/manager-");
  const allowedWorkspaceDispatch = script === "./scripts/codex-workspace.mjs" && parts[2] === "dispatch-next";
  if (!allowedManagerScript && !allowedWorkspaceDispatch) {
    return null;
  }
  return [process.execPath, [script, ...parts.slice(2)]];
}

function runKnownNodeCommand(command = "") {
  const parsed = splitKnownNodeCommand(command);
  if (!parsed) {
    return { ok: false, error: `Unsupported continuous command: ${command}` };
  }
  const [cmd, args] = parsed;
  const workspaceDispatchApply = args[0] === "./scripts/codex-workspace.mjs" && args[1] === "dispatch-next" && args.includes("--apply");
  if (!workspaceDispatchApply && !args.includes("--summary-json")) {
    return { ok: false, error: `Continuous command must emit --summary-json: ${command}` };
  }
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30000,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if ((result.status ?? 0) !== 0) {
    return { ok: false, error: String(result.stderr || result.stdout || "command failed").trim(), status: result.status };
  }
  const stdout = String(result.stdout || "").trim();
  try {
    const packet = JSON.parse(stdout || "{}");
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      return { ok: false, error: "Continuous command emitted non-object summary JSON." };
    }
    return { ok: true, packet };
  } catch {
    return {
      ok: false,
      error: "Continuous command did not emit parseable summary JSON.",
      stdoutPreview: stdout.slice(0, 500),
    };
  }
}

function dryRunStillAllowsApply(selected = {}, packet = {}) {
  if (selected.code === "continuous-dispatch-apply") {
    return packet?.dispatch?.allowed === true && Boolean(packet?.dispatch?.selectedLane || packet?.selected?.assignmentId || packet?.selected?.itemId);
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const preflight = buildPreflight(options);
if (!preflight.ok) {
  writePacket({
    ok: false,
    status: "blocked",
    summary: {
      mode: "continuous",
      phase: "preflight",
      timestamp: new Date().toISOString(),
      blockers: preflight.blockers,
      warnings: preflight.warnings,
    },
    blockers: preflight.blockers,
    warnings: preflight.warnings,
  });
  process.exitCode = 1;
} else {
  const maxIterations = options.maxIterations ?? 0;
  let iteration = 0;
  while (maxIterations === 0 || iteration < maxIterations) {
    iteration += 1;
    const plan = buildContinuousRunPlan(options);
    const selected = plan.summary?.selectedAction || null;
    const result = {
      ok: plan.ok,
      status: plan.status,
      timestamp: new Date().toISOString(),
      summary: {
        mode: "continuous",
        iteration,
        timestamp: new Date().toISOString(),
        workerCounts: plan.summary?.workerCounts,
        usageState: plan.summary?.usageState,
        resourceState: plan.summary?.resourceState,
        selectedAction: selected ? {
          code: selected.code,
          mutationClass: selected.mutationClass,
          authority: selected.authority,
        } : null,
        blockers: plan.blockers || [],
        warnings: plan.warnings || [],
      },
      blockers: plan.blockers || [],
      warnings: plan.warnings || [],
      nextActions: plan.nextActions || [],
    };
    if (!plan.ok) {
      writePacket(result);
      process.exitCode = 1;
      break;
    }
    if (selected) {
      const dryRun = runKnownNodeCommand(selected.dryRunCommand);
      result.summary.dryRun = { ok: dryRun.ok, status: dryRun.packet?.status || null, blockers: dryRun.packet?.blockers || [] };
      if (!dryRun.ok || dryRun.packet?.ok === false || dryRun.packet?.status === "blocked") {
        result.ok = false;
        result.status = "blocked";
        result.blockers = dryRun.packet?.blockers || [{ code: "continuous-dry-run-failed", message: dryRun.error || "Continuous dry-run failed.", nextAction: "Inspect manager run loop dry-run command." }];
        result.summary.blockers = result.blockers;
        writePacket(result);
        process.exitCode = 1;
        break;
      }
      if (!dryRunStillAllowsApply(selected, dryRun.packet)) {
        result.summary.apply = { ok: true, status: "skipped_dry_run_no_selection", blockers: [] };
        result.summary.selectedAction = null;
        result.nextActions = [{ code: "continuous-dry-run-no-selection", summary: "Selected action disappeared during dry-run refresh.", nextAction: "Refresh the manager cycle packet before applying mutation." }];
        writePacket(result);
        if (maxIterations !== 0 && iteration >= maxIterations) break;
        await sleep(Math.max(1000, options.intervalMs || 60000));
        continue;
      }
      if (selected.readOnly) {
        result.summary.apply = { ok: true, status: "not_needed_read_only", blockers: [] };
      } else {
        const apply = runKnownNodeCommand(selected.applyCommand);
        result.summary.apply = { ok: apply.ok, status: apply.packet?.status || null, blockers: apply.packet?.blockers || [] };
        if (!apply.ok || apply.packet?.ok === false || apply.packet?.status === "blocked") {
          result.ok = false;
          result.status = "blocked";
          result.blockers = apply.packet?.blockers || [{ code: "continuous-apply-failed", message: apply.error || "Continuous apply failed.", nextAction: "Inspect manager run loop apply command." }];
          result.summary.blockers = result.blockers;
          writePacket(result);
          process.exitCode = 1;
          break;
        }
      }
    }
    if (iteration % Math.max(1, options.heartbeatEvery || 1) === 0 || selected) {
      writePacket(result);
    }
    if (maxIterations !== 0 && iteration >= maxIterations) break;
    await sleep(Math.max(1000, options.intervalMs || 60000));
  }
}
