#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import {
  buildContinuousRunPlan,
  buildPreflight,
  ledgerCommand,
  parseCommonArgs,
  readManagerCapabilityPosture,
  writeManagerCapabilityPosture,
} from "./lib/manager-control-plane/core.mjs";

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

function recordSelfRepairAttempt(selected = {}, iteration = 0) {
  if (selected.selfRepair !== true) return null;
  return ledgerCommand({
    ...options,
    command: "append-event",
    eventType: "manager_self_repair_attempt",
    summary: `Continuous mode selected manager self-repair action ${selected.code || "unknown"}.`,
    authorityBasis: selected.authority || "manager-self-repair-existing-gates",
    recoveryPath: "Inspect self-repair budget and park or classify churn before adding handlers.",
    advisorActionCode: selected.code || "",
    advisorWorkClass: selected.workClass || "",
    capabilityName: selected.managerCapability || "",
    sourceRefs: [`cycle:${options.runId || "manager-run"}`, selected.managerCapability ? `manager:capability:${selected.managerCapability}` : "manager:continuous-run"],
    evidenceRefs: [`self-repair:${selected.code || "unknown"}`],
    idempotencyKey: `${options.runId || "manager-run"}:self-repair:${selected.code || "unknown"}:${iteration}`,
  });
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
    const persistedCapabilityPosture = readManagerCapabilityPosture(options);
    if (persistedCapabilityPosture.ok === false || persistedCapabilityPosture.status === "warning") {
      writePacket({
        ok: false,
        status: "blocked",
        timestamp: new Date().toISOString(),
        summary: {
          mode: "continuous",
          iteration,
          timestamp: new Date().toISOString(),
          phase: "capability-posture-read",
          capabilityPosturePersistence: {
            readStatus: persistedCapabilityPosture.status,
            writeStatus: "not_written",
            path: persistedCapabilityPosture.summary?.path || null,
            rawPayloadRetained: false,
          },
          blockers: persistedCapabilityPosture.blockers?.length
            ? persistedCapabilityPosture.blockers
            : [{ code: "capability-posture-read-unverified", message: "Continuous mode could not verify persisted capability posture before selecting manager actions.", nextAction: "Inspect or replace capability-posture.json before rerunning continuous mode." }],
          warnings: persistedCapabilityPosture.warnings || [],
        },
        blockers: persistedCapabilityPosture.blockers?.length
          ? persistedCapabilityPosture.blockers
          : [{ code: "capability-posture-read-unverified", message: "Continuous mode could not verify persisted capability posture before selecting manager actions.", nextAction: "Inspect or replace capability-posture.json before rerunning continuous mode." }],
        warnings: persistedCapabilityPosture.warnings || [],
      });
      process.exitCode = 1;
      break;
    }
    const plan = buildContinuousRunPlan(options, {
      persistedManagerCapabilityPosture: persistedCapabilityPosture.summary?.managerCapabilityPosture || null,
    });
    const postureWrite = plan.ok !== false && plan.summary?.managerCapabilityPosture
      ? writeManagerCapabilityPosture(plan.summary.managerCapabilityPosture, options)
      : null;
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
        managerCapabilityPosture: plan.summary?.managerCapabilityPosture || null,
        capabilityHolds: plan.summary?.capabilityHolds || null,
        capabilityPosturePersistence: {
          readStatus: persistedCapabilityPosture.status,
          writeStatus: postureWrite?.status || "not_written",
          path: postureWrite?.summary?.path || persistedCapabilityPosture.summary?.path || null,
          rawPayloadRetained: false,
        },
        selectedAction: selected ? {
          code: selected.code,
          mutationClass: selected.mutationClass,
          authority: selected.authority,
        } : null,
        blockers: plan.blockers || [],
        warnings: [...(persistedCapabilityPosture.warnings || []), ...(postureWrite?.warnings || []), ...(plan.warnings || [])],
      },
      blockers: plan.blockers || [],
      warnings: [...(persistedCapabilityPosture.warnings || []), ...(postureWrite?.warnings || []), ...(plan.warnings || [])],
      nextActions: plan.nextActions || [],
    };
    if (!plan.ok) {
      writePacket(result);
      process.exitCode = 1;
      break;
    }
    if (postureWrite?.ok === false) {
      result.ok = false;
      result.status = "blocked";
      result.blockers = postureWrite.blockers?.length
        ? postureWrite.blockers
        : [{ code: "capability-posture-persistence-failed", message: "Continuous mode could not persist manager capability posture before apply.", nextAction: "Inspect capability posture path and rerun continuous mode after fixing persistence." }];
      result.summary.blockers = result.blockers;
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
      const selfRepairAttempt = recordSelfRepairAttempt(selected, iteration);
      if (selfRepairAttempt) {
        result.summary.selfRepairAttempt = {
          status: selfRepairAttempt.status,
          eventType: selfRepairAttempt.summary?.event?.eventType || null,
          eventName: selfRepairAttempt.summary?.event?.eventName || null,
          duplicateIgnored: selfRepairAttempt.summary?.duplicateIgnored === true,
          rawPayloadRetained: false,
        };
        result.summary.warnings = [
          ...(result.summary.warnings || []),
          ...(selfRepairAttempt.warnings || []),
          ...(!selfRepairAttempt.ok ? (selfRepairAttempt.blockers || []) : []),
        ];
      }
      if (selfRepairAttempt && !selfRepairAttempt.ok) {
        result.ok = false;
        result.status = "blocked";
        result.blockers = selfRepairAttempt.blockers?.length
          ? selfRepairAttempt.blockers
          : [{ code: "self-repair-attempt-record-failed", message: "Continuous mode could not record self-repair budget evidence before apply.", nextAction: "Inspect manager ledger state before retrying self-repair." }];
        result.summary.blockers = result.blockers;
        writePacket(result);
        process.exitCode = 1;
        break;
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
