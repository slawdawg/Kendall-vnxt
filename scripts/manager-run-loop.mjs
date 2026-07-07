#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  buildBmadCodeReviewRequestPlan,
  buildContinuousRunPlan,
  buildPreflight,
  buildRuntimeReadinessPlan,
  ledgerCommand,
  parseCommonArgs,
  readManagerCapabilityPosture,
  writeManagerCapabilityPosture,
} from "./lib/manager-control-plane/core.mjs";

function writePacket(packet, options) {
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

function knownCommandClass(command = "") {
  const parsed = splitKnownNodeCommand(command);
  if (!parsed) return "unsupported";
  const [, args] = parsed;
  const script = String(args[0] || "").split("/").pop() || "node-script";
  const subcommand = script === "codex-workspace.mjs" && args[1] ? `:${args[1]}` : "";
  return `${script}${subcommand}`;
}

function knownCommandFingerprint(command = "") {
  const parsed = splitKnownNodeCommand(command);
  if (!parsed) return "unsupported";
  const [, args] = parsed;
  const script = String(args[0] || "").split("/").pop() || "node-script";
  const subcommand = script === "codex-workspace.mjs" && args[1] ? String(args[1]) : "";
  const optionStart = subcommand ? 2 : 1;
  const normalizedArgs = normalizeCommandArguments(args.slice(optionStart));
  if (!normalizedArgs) return "unsupported";
  return [script, subcommand, ...normalizedArgs].filter((value) => value !== "").join("|");
}

function normalizeCommandArguments(args = []) {
  const ignoredFlags = new Set(["--apply", "--dry-run", "--summary-json"]);
  const singletonFlags = new Set(["--state-root", "--owner", "--run-id", "--limit", "--worker-id", "--session-name", "--assignment-id", "--task-id"]);
  const seenSingletonFlags = new Set();
  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || "");
    if (!arg || ignoredFlags.has(arg)) continue;
    if (arg.startsWith("--")) {
      const [flag, inlineValue] = arg.split(/=(.*)/s, 2);
      if (ignoredFlags.has(flag)) continue;
      if (singletonFlags.has(flag)) {
        if (seenSingletonFlags.has(flag)) return null;
        seenSingletonFlags.add(flag);
      }
      if (inlineValue !== undefined) {
        normalized.push(`${flag}=${inlineValue}`);
        continue;
      }
      const next = args[index + 1];
      if (next !== undefined && !String(next).startsWith("--")) {
        normalized.push(`${flag}=${String(next)}`);
        index += 1;
      } else {
        normalized.push(flag);
      }
      continue;
    }
    normalized.push(arg);
  }
  return normalized.sort();
}

function commandFailure(code, command, details = {}) {
  const messages = {
    "continuous-command-missing-summary-json": "Continuous command must emit --summary-json.",
    "continuous-command-json-parse-failed": "Continuous command did not emit parseable summary JSON.",
    "continuous-command-json-non-object": "Continuous command emitted non-object summary JSON.",
  };
  return {
    ok: false,
    code,
    message: messages[code] || "Continuous command failed.",
    status: Number.isInteger(details.status) ? details.status : null,
    commandClass: knownCommandClass(command),
  };
}

function runKnownInProcessNodeCommand(args = []) {
  const [script, ...scriptArgs] = args;
  if (script !== "./scripts/manager-bmad-code-review.mjs") {
    return null;
  }
  const options = parseCommonArgs(scriptArgs);
  const packet = buildBmadCodeReviewRequestPlan(options);
  return { ok: packet?.ok !== false, packet };
}

function runKnownNodeCommand(command = "") {
  const parsed = splitKnownNodeCommand(command);
  if (!parsed) {
    return commandFailure("unsupported-continuous-command", command);
  }
  const [cmd, args] = parsed;
  const workspaceDispatchApply = args[0] === "./scripts/codex-workspace.mjs" && args[1] === "dispatch-next" && args.includes("--apply");
  if (!workspaceDispatchApply && !args.includes("--summary-json")) {
    return commandFailure("continuous-command-missing-summary-json", command);
  }
  const result = spawnSync(cmd, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
    timeout: 30000,
  });
  if (result.error) {
    const fallback = result.error.code === "EPERM" ? runKnownInProcessNodeCommand(args) : null;
    return fallback || commandFailure("continuous-command-spawn-failed", command);
  }
  if ((result.status ?? 0) !== 0) {
    return commandFailure("continuous-command-exit-nonzero", command, { status: result.status });
  }
  const stdout = String(result.stdout || "").trim();
  try {
    const packet = JSON.parse(stdout || "{}");
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      return commandFailure("continuous-command-json-non-object", command);
    }
    return { ok: true, packet };
  } catch {
    return commandFailure("continuous-command-json-parse-failed", command);
  }
}

function selectedTargetKey(action = {}) {
  return String(
    action.targetKey ||
      action.target ||
      action.targetId ||
      action.routingDecision?.selectedAction?.assignmentId ||
      action.routingDecision?.selectedAction?.laneId ||
      action.routingDecision?.selectedAction?.branch ||
      "",
  ).trim();
}

function normalizeDryRunSelectionProof(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const targetComponents = canonicalTargetComponents(value.targetComponents || value.components || []);
  const target = String(
    value.targetKey ||
      value.target ||
      value.targetId ||
      value.selectedLane ||
      value.assignmentId ||
      value.itemId ||
      value.laneId ||
      value.branch ||
      "",
  ).trim();
  return {
    code: String(value.code || value.actionCode || value.selectedActionCode || "").trim(),
    mutationClass: String(value.mutationClass || value.class || value.selectedMutationClass || "").trim(),
    target: target || targetComponents.join("|"),
    targetComponents: targetComponents.length > 0 ? targetComponents : canonicalTargetComponents(target ? target.split("|") : []),
    allowed: typeof value.allowed === "boolean" ? value.allowed : undefined,
    status: normalizePacketStatus(value.status || value.readinessState || value.state || ""),
  };
}

function dryRunSelectionProof(packet = {}) {
  const candidates = [
    packet.continuousAction,
    packet.continuousSelection,
    packet.selectedAction,
    packet.selected,
    packet.summary?.continuousAction,
    packet.summary?.continuousSelection,
    packet.summary?.selectedAction,
    packet.summary?.selected,
    packet.summary?.dryRunSelection,
    packet.dispatch,
    packet.summary?.dispatch,
  ];
  for (const candidate of candidates) {
    const proof = normalizeDryRunSelectionProof(candidate);
    if (proof && (proof.code || proof.mutationClass || proof.target)) return proof;
  }
  return null;
}

function dryRunSelectionProofs(packet = {}) {
  const candidates = [
    packet.continuousAction,
    packet.continuousSelection,
    packet.selectedAction,
    packet.selected,
    packet.summary?.continuousAction,
    packet.summary?.continuousSelection,
    packet.summary?.selectedAction,
    packet.summary?.selected,
    packet.summary?.dryRunSelection,
    packet.dispatch,
    packet.summary?.dispatch,
  ];
  return candidates
    .map((candidate) => normalizeDryRunSelectionProof(candidate))
    .filter((proof) => proof && (proof.code || proof.mutationClass || proof.target || proof.targetComponents.length > 0));
}

function dryRunStillAllowsApply(selected = {}, packet = {}) {
  const expected = {
    code: String(selected.code || "").trim(),
    mutationClass: String(selected.mutationClass || "").trim(),
    target: selectedTargetKey(selected),
    targetComponents: canonicalTargetComponents(selected.targetComponents || selectedTargetKey(selected).split("|")),
  };
  const proof = dryRunSelectionProof(packet);
  if (!proof) return false;
  const proofs = dryRunSelectionProofs(packet);
  if (proofs.some((candidate) => proofMatchesExpected(candidate, expected) && !selectionProofIsReady(candidate))) return false;
  if (!selectionProofIsReady(proof)) return false;
  if (!expected.code || !expected.mutationClass || expected.targetComponents.length === 0 || proof.targetComponents.length === 0) return false;
  return proof.code === expected.code &&
    proof.mutationClass === expected.mutationClass &&
    sameCanonicalComponents(proof.targetComponents, expected.targetComponents);
}

function normalizePacketStatus(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}

function canonicalTargetComponents(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || "").split("|"))
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .sort();
}

function sameCanonicalComponents(left = [], right = []) {
  const leftSet = canonicalTargetComponents(left);
  const rightSet = canonicalTargetComponents(right);
  return leftSet.length === rightSet.length && leftSet.every((value, index) => value === rightSet[index]);
}

function selectionProofIsReady(proof = {}) {
  return proof.allowed === true && proof.status === "ready";
}

function proofMatchesExpected(proof = {}, expected = {}) {
  if (expected.code && proof.code && proof.code !== expected.code) return false;
  if (expected.mutationClass && proof.mutationClass && proof.mutationClass !== expected.mutationClass) return false;
  if (proof.targetComponents.length > 0 && expected.targetComponents.length > 0) {
    return sameCanonicalComponents(proof.targetComponents, expected.targetComponents);
  }
  return true;
}

function recordSelfRepairAttempt(selected = {}, iteration = 0, options = {}) {
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
function packetBlockers(packet = {}) {
  const direct = Array.isArray(packet?.blockers) ? packet.blockers : [];
  const summary = Array.isArray(packet?.summary?.blockers) ? packet.summary.blockers : [];
  return [...direct, ...summary];
}

function parseStrictBlockerCount(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function packetHasBlockers(packet = {}) {
  if (!packet || typeof packet !== "object") return true;
  if (Object.prototype.hasOwnProperty.call(packet, "blockers") && !Array.isArray(packet.blockers)) return true;
  if (Object.prototype.hasOwnProperty.call(packet?.summary || {}, "blockers") && !Array.isArray(packet.summary.blockers)) return true;
  if (normalizePacketStatus(packet.status) === "blocked" || normalizePacketStatus(packet.summary?.status) === "blocked") return true;
  const packetBlockerCount = parseStrictBlockerCount(packet.blockerCount);
  const summaryBlockerCount = parseStrictBlockerCount(packet.summary?.blockerCount);
  if (packetBlockerCount === null || summaryBlockerCount === null) return true;
  return packetBlockers(packet).length > 0 || packetBlockerCount > 0 || summaryBlockerCount > 0;
}

function selectedActionShape(action = {}, commandKey = "") {
  const targetComponents = canonicalTargetComponents(action.targetComponents || selectedTargetKey(action).split("|"));
  const command = action[commandKey] || "";
  return {
    code: String(action.code || "").trim(),
    mutationClass: String(action.mutationClass || "").trim(),
    commandClass: knownCommandClass(command),
    commandFingerprint: knownCommandFingerprint(command),
    target: selectedTargetKey(action),
    targetComponents,
  };
}

function selectedActionsMatchForApply(selected = {}, applySelected = {}) {
  const dryRun = selectedActionShape(selected, "dryRunCommand");
  const apply = selectedActionShape(applySelected, "applyCommand");
  return Boolean(
    dryRun.code &&
      dryRun.code === apply.code &&
      dryRun.mutationClass &&
      dryRun.mutationClass === apply.mutationClass &&
      dryRun.commandClass !== "unsupported" &&
      dryRun.commandClass === apply.commandClass &&
      dryRun.commandFingerprint !== "unsupported" &&
      dryRun.commandFingerprint === apply.commandFingerprint &&
      dryRun.targetComponents.length > 0 &&
      workerMutationTargetProofReady(dryRun.mutationClass, dryRun.targetComponents) &&
      sameCanonicalComponents(dryRun.targetComponents, apply.targetComponents) &&
      (!dryRun.target || !apply.target || dryRun.target === apply.target),
  );
}

function workerMutationTargetProofReady(mutationClass = "", targetComponents = []) {
  if (!String(mutationClass || "").startsWith("manager_owned_worker_")) return true;
  return canonicalTargetComponents(targetComponents).some((component) => /^(worker|session|assignment|task):/.test(component));
}

function dryRunOnlyMutationClass(mutationClass = "") {
  return new Set(["assignment_workspace_claim_only", "assignment_heartbeat_metadata_only"]).has(String(mutationClass || ""));
}

function workspaceDispatchApplyGate(action = {}) {
  return action?.mutationClass === "assignment_workspace_claim_only" && action?.dryRunOnly === true
    ? {
        ok: false,
        status: "blocked_dry_run_only_mutation_class",
        nextAction: "Do not apply dispatch mutation without exact target compare-and-swap support.",
      }
    : { ok: true, status: "not_workspace_dispatch_apply" };
}

function sanitizeExecutionBlockers(blockers = [], fallback = {}) {
  const source = Array.isArray(blockers) && blockers.length > 0 ? blockers : [fallback];
  return source
    .filter((blocker) => blocker && typeof blocker === "object")
    .map((blocker) => ({
      code: String(blocker.code || fallback.code || "continuous-execution-blocked").slice(0, 100),
      message: String(blocker.message || fallback.message || "Continuous execution is blocked.").slice(0, 180),
      nextAction: String(blocker.nextAction || fallback.nextAction || "Inspect manager run loop evidence.").slice(0, 220),
      ...(blocker.commandClass || fallback.commandClass ? { commandClass: String(blocker.commandClass || fallback.commandClass).slice(0, 120) } : {}),
      ...(Number.isInteger(blocker.status ?? fallback.status) ? { status: blocker.status ?? fallback.status } : {}),
    }));
}

function commandFailureBlocker(result = {}, fallbackCode, fallbackMessage, nextAction) {
  return {
    code: result.code || fallbackCode,
    message: fallbackMessage,
    nextAction,
    commandClass: result.commandClass || "unknown",
    ...(Number.isInteger(result.status) ? { status: result.status } : {}),
  };
}

function commandFlagCount(command = "", flag = "") {
  const tokens = tokenizeKnownCommand(command);
  if (!tokens) return Number.POSITIVE_INFINITY;
  return tokens.filter((token) => token === flag || token.startsWith(`${flag}=`)).length;
}

function commandModeShapeValid({ dryRunCommand = "", applyCommand = "" } = {}) {
  return {
    dryRunHasApply: commandFlagCount(dryRunCommand, "--apply") > 0,
    applyCount: commandFlagCount(applyCommand, "--apply"),
    applyDryRunCount: commandFlagCount(applyCommand, "--dry-run"),
  };
}

function compactPreflightForContinuous(preflight = {}) {
  const blockersMalformed = Object.prototype.hasOwnProperty.call(preflight || {}, "blockers") && !Array.isArray(preflight.blockers);
  const blockers = blockersMalformed
    ? [{ code: "preflight-blockers-malformed", message: "Preflight blockers field is malformed.", nextAction: "Refresh preflight evidence before enabling continuous apply." }]
    : Array.isArray(preflight.blockers) ? preflight.blockers : [];
  const explicitBlockerCount = parseStrictBlockerCount(preflight.blockerCount);
  const blockerCount = explicitBlockerCount === null ? null : Math.max(explicitBlockerCount, blockers.length);
  return {
    status: blockersMalformed || blockerCount === null ? "blocked" : preflight.status || "unknown",
    blockerCount,
    blockers,
    warnings: Array.isArray(preflight.warnings) ? preflight.warnings : [],
  };
}

export function executeContinuousSelectedAction({ selected = null, applySelected = null, runCommand = runKnownNodeCommand } = {}) {
  const result = {
    ok: true,
    status: "ready",
    summary: {},
    blockers: [],
    nextActions: [],
    continueLoop: false,
  };
  if (!selected) return result;

  const dryRunMode = commandModeShapeValid({ dryRunCommand: selected.dryRunCommand, applyCommand: "" });
  if (dryRunMode.dryRunHasApply) {
    result.ok = false;
    result.status = "blocked";
    result.summary.dryRun = { ok: false, status: "blocked_dry_run_command_mode_mismatch", blockers: [] };
    result.summary.stopLines = ["stop_continuous_mode_after_dry_run_command_mode_mismatch"];
    result.blockers = [{
      code: "continuous-dry-run-command-mode-mismatch",
      message: "Continuous dry-run command must not include --apply.",
      nextAction: "Stop continuous mode and refresh the selected dry-run command before execution.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-dry-run-command-mode-mismatch", summary: "Selected dry-run command has invalid mode flags.", nextAction: "Stop continuous mode and refresh the selected dry-run command before execution." }];
    return result;
  }
  if (applySelected && (knownCommandFingerprint(selected.dryRunCommand) === "unsupported" || knownCommandFingerprint(applySelected.applyCommand) === "unsupported")) {
    result.ok = false;
    result.status = "blocked";
    result.summary.dryRun = { ok: false, status: "blocked_selected_action_command_fingerprint", blockers: [] };
    result.summary.apply = { ok: false, status: "blocked_selected_action_command_fingerprint", blockers: [] };
    result.summary.stopLines = ["stop_continuous_mode_after_selected_action_command_fingerprint"];
    result.blockers = [{
      code: "continuous-selected-action-command-fingerprint",
      message: "Selected dry-run and apply commands must have supported, unambiguous singleton target flags before execution.",
      nextAction: "Refresh the selected action command before dry-run or apply.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-selected-action-command-fingerprint", summary: "Selected action command fingerprint is unsupported.", nextAction: "Refresh the selected action command before execution." }];
    return result;
  }

  const dryRun = runCommand(selected.dryRunCommand);
  const dryRunBlockers = packetBlockers(dryRun.packet);
  result.summary.dryRun = { ok: dryRun.ok, status: dryRun.packet?.status || null, blockers: dryRunBlockers.length > 0 ? sanitizeExecutionBlockers(dryRunBlockers, { code: "continuous-dry-run-blocked", message: "Continuous dry-run is blocked." }) : [] };
  const dryRunSelectedProofStillReady = applySelected ? dryRunStillAllowsApply(applySelected, dryRun.packet) : false;
  if (!dryRun.ok || dryRun.packet?.ok === false || normalizePacketStatus(dryRun.packet?.status) === "blocked" || (packetHasBlockers(dryRun.packet) && !dryRunSelectedProofStillReady)) {
    result.ok = false;
    result.status = "blocked";
    result.blockers = sanitizeExecutionBlockers(dryRunBlockers, commandFailureBlocker(
      dryRun,
      "continuous-dry-run-failed",
      "Continuous dry-run failed or returned blockers.",
      "Inspect manager run loop dry-run command class and packet blockers.",
    ));
    result.summary.blockers = result.blockers;
    return result;
  }
  if (!applySelected) {
    result.summary.apply = { ok: true, status: "skipped_runtime_mode_not_apply_ready", blockers: [] };
    return result;
  }
  if (selected.readOnly) {
    result.summary.apply = { ok: true, status: "not_needed_read_only", blockers: [] };
    return result;
  }
  const dispatchApplyGate = workspaceDispatchApplyGate(applySelected);
  if (selected.dryRunOnly === true || applySelected.dryRunOnly === true || dryRunOnlyMutationClass(applySelected.mutationClass) || dispatchApplyGate.ok === false) {
    result.ok = false;
    result.status = "blocked";
    result.summary.apply = { ok: false, status: "blocked_dry_run_only_mutation_class", blockers: [] };
    result.summary.stopLines = ["stop_continuous_mode_before_dry_run_only_apply"];
    result.blockers = [{
      code: "continuous-apply-dry-run-only-mutation-class",
      message: "Selected mutation class is dry-run-only in this runtime-readiness slice.",
      nextAction: "Do not apply dispatch or lane-advance mutation without exact target compare-and-swap support.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-apply-dry-run-only-mutation-class", summary: "Selected mutation class is dry-run-only.", nextAction: "Keep the action in dry-run mode until exact target apply support exists." }];
    return result;
  }
  const commandMode = commandModeShapeValid({ dryRunCommand: selected.dryRunCommand, applyCommand: applySelected.applyCommand });
  if (commandMode.applyCount !== 1 || commandMode.applyDryRunCount > 0) {
    result.ok = false;
    result.status = "blocked";
    result.summary.apply = { ok: false, status: "blocked_apply_command_mode_mismatch", blockers: [] };
    result.summary.stopLines = ["stop_continuous_mode_after_apply_command_mode_mismatch"];
    result.blockers = [{
      code: "continuous-apply-command-mode-mismatch",
      message: "Continuous apply requires a dry-run command without --apply and an apply command with exactly one --apply and no --dry-run.",
      nextAction: "Stop continuous mode and refresh the selected apply command before mutation.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-apply-command-mode-mismatch", summary: "Selected apply command has invalid mode flags.", nextAction: "Stop continuous mode and refresh the selected apply command before mutation." }];
    return result;
  }
  if (!selectedActionsMatchForApply(selected, applySelected)) {
    result.ok = false;
    result.status = "blocked";
    result.summary.apply = { ok: false, status: "blocked_selected_action_pair_mismatch", blockers: [] };
    result.summary.selectedAction = null;
    result.summary.stopLines = ["stop_continuous_mode_after_selected_action_pair_mismatch"];
    result.blockers = [{
      code: "continuous-selected-action-pair-mismatch",
      message: "Selected dry-run and apply actions do not describe the same command family, action code, mutation class, and canonical target.",
      nextAction: "Stop continuous mode and refresh the manager cycle packet before applying mutation.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-selected-action-pair-mismatch", summary: "Selected dry-run and apply actions do not describe the same mutation target.", nextAction: "Stop continuous mode and refresh the manager cycle packet before applying mutation." }];
    return result;
  }
  if (!dryRunStillAllowsApply(applySelected, dryRun.packet)) {
    result.ok = false;
    result.status = "blocked";
    result.summary.apply = { ok: false, status: "blocked_dry_run_selection_mismatch", blockers: [] };
    result.summary.selectedAction = null;
    result.summary.stopLines = ["stop_continuous_mode_after_dry_run_selection_mismatch"];
    result.blockers = [{
      code: "continuous-dry-run-selection-mismatch",
      message: "Selected action proof changed, was blocked, was disallowed, or was absent during dry-run refresh.",
      nextAction: "Stop continuous mode and refresh the manager cycle packet before applying mutation.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-dry-run-selection-mismatch", summary: "Selected action proof changed, was blocked, was disallowed, or was absent during dry-run refresh.", nextAction: "Stop continuous mode and refresh the manager cycle packet before applying mutation." }];
    return result;
  }

  const apply = runCommand(applySelected.applyCommand);
  const applyBlockers = packetBlockers(apply.packet);
  result.summary.apply = { ok: apply.ok, status: apply.packet?.status || null, blockers: applyBlockers.length > 0 ? sanitizeExecutionBlockers(applyBlockers, { code: "continuous-apply-blocked", message: "Continuous apply is blocked." }) : [] };
  if (!apply.ok || apply.packet?.ok === false || normalizePacketStatus(apply.packet?.status) === "blocked" || packetHasBlockers(apply.packet)) {
    result.ok = false;
    result.status = "blocked";
    result.blockers = sanitizeExecutionBlockers(applyBlockers, commandFailureBlocker(
      apply,
      "continuous-apply-failed",
      "Continuous apply failed or returned blockers.",
      "Inspect manager run loop apply command class and packet blockers.",
    ));
    result.summary.blockers = result.blockers;
    return result;
  }
  if (!dryRunStillAllowsApply(applySelected, apply.packet)) {
    result.ok = false;
    result.status = "blocked";
    result.summary.apply = { ...result.summary.apply, status: "blocked_apply_selection_mismatch" };
    result.summary.stopLines = ["stop_continuous_mode_after_apply_selection_mismatch"];
    result.blockers = [{
      code: "continuous-apply-selection-mismatch",
      message: "Apply result proof does not match the selected action target.",
      nextAction: "Stop continuous mode and inspect apply result target evidence before reporting success.",
    }];
    result.summary.blockers = result.blockers;
    result.nextActions = [{ code: "continuous-apply-selection-mismatch", summary: "Apply result proof does not match the selected mutation target.", nextAction: "Stop continuous mode and inspect apply result target evidence before reporting success." }];
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runManagerRunLoop(options = parseCommonArgs(process.argv.slice(2)), context = {}) {
  const buildPreflightFn = context.buildPreflight || buildPreflight;
  const buildContinuousRunPlanFn = context.buildContinuousRunPlan || buildContinuousRunPlan;
  const executeContinuousSelectedActionFn = context.executeContinuousSelectedAction || executeContinuousSelectedAction;
  const writePacketFn = context.writePacket || writePacket;
  const sleepFn = context.sleep || sleep;
  const preflight = buildPreflightFn(options);
  if (!preflight.ok) {
    const sandboxBoundary = firstSandboxBoundary(preflight);
    const runtimeReadiness = buildRuntimeReadinessPlan(
      { runtimeMode: options.runtimeMode || "continuous_dry_run" },
      {
        cycleStatus: "blocked",
        usage: { state: options.usageState || "unknown" },
        resources: { state: options.resourceState || "unknown" },
        preflight: { status: preflight.status, blockerCount: preflight.blockers?.length || 0 },
        selectedAction: null,
      },
    );
    writePacketFn({
      ok: false,
      status: sandboxBoundary ? "known_sandbox_boundary" : "blocked",
      summary: {
        mode: "continuous",
        phase: "preflight",
        timestamp: new Date().toISOString(),
        stopReason: sandboxBoundary ? "known_sandbox_boundary" : "preflight_blocked",
        ...(sandboxBoundary ? { sandboxBoundaryPacket: sandboxBoundary } : {}),
        runtimeReadiness: runtimeReadiness.summary,
        blockers: preflight.blockers,
        warnings: preflight.warnings,
      },
      blockers: preflight.blockers,
      warnings: preflight.warnings,
    }, options);
    process.exitCode = 1;
    return;
  }

  const preflightContext = compactPreflightForContinuous(preflight);
  const maxIterations = options.maxIterations ?? 0;
  let iteration = 0;
  while (maxIterations === 0 || iteration < maxIterations) {
    iteration += 1;
    const persistedCapabilityPosture = readManagerCapabilityPosture(options);
    if (persistedCapabilityPosture.ok === false || persistedCapabilityPosture.status === "warning") {
      writePacketFn({
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
      }, options);
      process.exitCode = 1;
      break;
    }

    const plan = buildContinuousRunPlanFn(options, {
      preflight: preflightContext,
      preflightStatus: preflight,
      persistedManagerCapabilityPosture: persistedCapabilityPosture.summary?.managerCapabilityPosture || null,
    });
    const postureWrite = plan.ok !== false && plan.summary?.managerCapabilityPosture
      ? writeManagerCapabilityPosture(plan.summary.managerCapabilityPosture, options)
      : null;
    const selected = plan.summary?.selectedAction || null;
    const applySelected = plan.summary?.applySelectedAction || null;
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
          targetKey: selected.targetKey,
          targetComponents: selected.targetComponents,
        } : null,
        applySelectedAction: applySelected ? {
          code: applySelected.code,
          mutationClass: applySelected.mutationClass,
          authority: applySelected.authority,
          targetKey: applySelected.targetKey,
          targetComponents: applySelected.targetComponents,
        } : null,
        runtimeReadiness: plan.summary?.runtimeReadiness,
        blockers: plan.blockers || [],
        warnings: [...(persistedCapabilityPosture.warnings || []), ...(postureWrite?.warnings || []), ...(plan.warnings || [])],
      },
      blockers: plan.blockers || [],
      warnings: [...(persistedCapabilityPosture.warnings || []), ...(postureWrite?.warnings || []), ...(plan.warnings || [])],
      nextActions: plan.nextActions || [],
    };

    if (!plan.ok) {
      writePacketFn(result, options);
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
      writePacketFn(result, options);
      process.exitCode = 1;
      break;
    }
    if (selected) {
      const execution = executeContinuousSelectedActionFn({ selected, applySelected });
      Object.assign(result.summary, execution.summary);
      if (execution.summary.selectedAction === null) result.summary.selectedAction = null;
      if (execution.nextActions.length > 0) result.nextActions = execution.nextActions;
      if (!execution.ok) {
        result.ok = false;
        result.status = execution.status;
        result.blockers = execution.blockers;
        result.summary.blockers = result.blockers;
        writePacketFn(result, options);
        process.exitCode = 1;
        break;
      }
      const selfRepairAttempt = recordSelfRepairAttempt(selected, iteration, options);
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
        writePacketFn(result, options);
        process.exitCode = 1;
        break;
      }
      if (execution.continueLoop) {
        writePacketFn(result, options);
        if (maxIterations !== 0 && iteration >= maxIterations) break;
        await sleepFn(Math.max(1000, options.intervalMs || 60000));
        continue;
      }
    }
    if (iteration % Math.max(1, options.heartbeatEvery || 1) === 0 || selected) {
      writePacketFn(result, options);
    }
    if (maxIterations !== 0 && iteration >= maxIterations) break;
    await sleepFn(Math.max(1000, options.intervalMs || 60000));
  }
}

function firstSandboxBoundary(packet = {}) {
  const notices = [
    ...(Array.isArray(packet.blockers) ? packet.blockers : []),
    ...(Array.isArray(packet.warnings) ? packet.warnings : []),
  ];
  const notice = notices.find((item) => item?.sandboxBoundary === true || item?.sandboxBoundaryPacket?.boundary === true);
  if (!notice) return null;
  return notice.sandboxBoundaryPacket || {
    boundary: true,
    class: "sandbox",
    signature: notice.sandboxSignatureClass || "known_sandbox_boundary",
    command: notice.commandShape || currentInvocationCommand(),
    safe_rerun: notice.safe_rerun || "exact_command_outside_sandbox_when_read_only",
    mutation: notice.mutation || "none",
    next_action: notice.nextAction || "Request approval to rerun the exact same read-only manager command outside the sandbox once.",
  };
}

function currentInvocationCommand() {
  return ["node", "./scripts/manager-run-loop.mjs", ...process.argv.slice(2)]
    .map((part) => (/^[A-Za-z0-9_./:=@+-]+$/.test(String(part)) ? String(part) : `'${String(part).replaceAll("'", "'\"'\"'")}'`))
    .join(" ");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runManagerRunLoop();
}
