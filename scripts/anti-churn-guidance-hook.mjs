#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ChurnEventWriterError,
  readChurnEventInputFile,
  recordChurnEvent,
} from "./lib/anti-churn-event-writer.mjs";
import { readLaneChurnEvents } from "./lib/anti-churn-event-reader.mjs";
import { assertWorkspaceStateStorage } from "./lib/codex-workspace-state.mjs";
import { evaluateApplySafeGate } from "./lib/anti-churn-apply-safe-gate.mjs";
import { prepareApplySafeTransactionPreflight } from "./lib/anti-churn-hook-transaction-store.mjs";
import { applyPreparedHookTransaction } from "./lib/anti-churn-source-apply.mjs";
import { finalizeHookTransactionVerification } from "./lib/anti-churn-verification-rollback.mjs";
import {
  classifyGuidanceCandidates,
  dedupeGuidanceCandidates,
} from "./lib/anti-churn-guidance-candidate-classifier.mjs";

export function runAntiChurnGuidanceHookCli(argv = process.argv.slice(2), options = {}) {
  const [command, ...args] = argv;
  if (command === "record-event") {
    const parsed = parseRecordEventArgs(args);
    const input = {
      ...readChurnEventInputFile(parsed.eventFile),
      laneId: parsed.lane,
    };
    const result = recordChurnEvent(input, {
      env: options.env || process.env,
    });
    return {
      schemaVersion: 1,
      status: result.status,
      eventId: result.eventId,
      eventStore: result.eventStore,
      globalEventStore: result.globalEventStore,
      warnings: result.warnings,
    };
  }

  if (command === "read-events") {
    const parsed = parseReadEventsArgs(args);
    const result = readLaneChurnEvents({
      laneId: parsed.lane,
      includeMetadata: parsed.includeMetadata,
    }, {
      env: options.env || process.env,
    });
    return {
      schemaVersion: 1,
      status: result.status,
      lane: result.lane,
      eventCount: result.events.length,
      eventStore: result.eventStore,
      warnings: result.warnings,
      metadata: result.metadata,
      requiresAuthority: result.requiresAuthority,
      chatFallbackUsed: result.chatFallbackUsed,
    };
  }

  if (command === "evaluate") {
    return evaluateLane(args, options);
  }

  if (command?.startsWith("--")) {
    return evaluateLane(argv, options);
  }

  return shapeInputError("Only record-event, read-events, and evaluate are supported in this story slice.");
}

function evaluateLane(args, options) {
  let parsed;
  try {
    parsed = parseEvaluateArgs(args);
  } catch (error) {
    return shapeInputError(error.message, { lane: null });
  }

  try {
    const storageProof = assertWorkspaceStateStorage({}, {
      cwd: options.cwd,
      env: options.env || process.env,
    });
    const readResult = readLaneChurnEvents({
      laneId: parsed.lane,
      includeMetadata: parsed.includeMetadata,
    }, {
      env: options.env || process.env,
    });
    const scopedReadResult = scopeReadResultToLesson(readResult, parsed.lesson);
    const classified = classifyGuidanceCandidates(readResult);
    const scopedClassified = classifyGuidanceCandidates(scopedReadResult);
    const deduped = dedupeGuidanceCandidates(classified.candidates, {
      sourceSnapshots: options.sourceSnapshots,
      cwd: options.cwd,
    });
    const scopedDeduped = parsed.lesson
      ? dedupeGuidanceCandidates(scopedClassified.candidates, {
        sourceSnapshots: options.sourceSnapshots,
        cwd: options.cwd,
      })
      : deduped;
    const effectiveClassified = parsed.lesson ? scopedClassified : classified;
    const effectiveReadResult = parsed.lesson ? scopedReadResult : readResult;

    const candidatePool = [
      ...effectiveClassified.candidates,
      ...scopedDeduped.candidates,
      ...scopedDeduped.proposals,
    ];
    const applySafeCandidates = candidatePool.filter(isApplySafeWritableCandidate);
    const applySafeGate = parsed.mode === "apply-safe"
      ? evaluateApplySafeGate({
        manifest: options.laneManifest,
        now: options.now,
        candidates: applySafeCandidates,
      })
      : null;
    const transactionPreflight = parsed.mode === "apply-safe" && applySafeGate?.status === "passed"
      ? prepareApplySafeTransactionPreflight({
        lane: parsed.lane,
        candidates: applySafeCandidates,
        plannedSourceUpdates: options.plannedSourceUpdates,
        now: options.now,
      }, {
        stateRoot: options.transactionStateRoot,
        cwd: options.cwd,
        env: options.env || process.env,
        sourceSnapshots: options.sourceSnapshots,
      })
      : null;
    const sourceApplyResult = parsed.mode === "apply-safe" && transactionPreflight?.status === "prepared"
      ? applyPreparedHookTransaction({
        transaction: transactionPreflight.transaction,
        transactionPath: transactionPreflight.transactionPath,
        candidateId: transactionPreflight.candidateId,
      }, {
        cwd: options.cwd,
        now: options.now,
      })
      : null;
    const verificationFinalizeResult = parsed.mode === "apply-safe" && sourceApplyResult?.status === "applied"
      ? finalizeHookTransactionVerification({
        transaction: transactionPreflight.transaction,
        transactionPath: transactionPreflight.transactionPath,
        candidateId: transactionPreflight.candidateId,
        verificationResult: resolveVerificationResult(transactionPreflight.transaction, options),
        narrowerVerificationResult: options.narrowerVerificationResult,
      }, {
        cwd: options.cwd,
        now: options.now,
      })
      : null;

    return shapeEvaluationResult({
      parsed,
      readResult: effectiveReadResult,
      classified: effectiveClassified,
      deduped: scopedDeduped,
      ignoredPathVerified: isIgnoredPathVerified(storageProof.proof),
      applySafeGate,
      transactionPreflight,
      sourceApplyResult,
      verificationFinalizeResult,
    });
  } catch (error) {
    return shapeInputError(error.message, { lane: parsed.lane || null, ignoredPathVerified: false });
  }
}

function isApplySafeWritableCandidate(candidate = {}) {
  const requiredAuthority = [
    ...copyArray(candidate.requiresAuthority),
    ...copyArray(candidate.verificationPlan?.requiresAuthority),
  ];
  return candidate.autonomyTier !== "tier-3-block-and-ask"
    && candidate.noOpReason !== "requires-higher-authority"
    && candidate.status !== "requires-higher-authority"
    && candidate.verificationPlan?.status !== "requires-higher-authority"
    && requiredAuthority.length === 0;
}

function parseRecordEventArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--lane") {
      parsed.lane = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--event-file") {
      parsed.eventFile = args[index + 1];
      index += 1;
      continue;
    }
    throw new ChurnEventWriterError("INVALID_RECORD_EVENT_ARGS", `Unsupported record-event argument: ${arg}`);
  }
  if (!parsed.lane || !parsed.eventFile) {
    throw new ChurnEventWriterError("INVALID_RECORD_EVENT_ARGS", "record-event requires --lane and --event-file.");
  }
  return parsed;
}

function parseReadEventsArgs(args) {
  const parsed = {
    format: "json",
    includeMetadata: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--lane") {
      parsed.lane = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--format") {
      parsed.format = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--include-metadata") {
      parsed.includeMetadata = true;
      continue;
    }
    throw new ChurnEventWriterError("INVALID_READ_EVENTS_ARGS", `Unsupported read-events argument: ${arg}`);
  }
  if (!parsed.lane) {
    throw new ChurnEventWriterError("INVALID_READ_EVENTS_ARGS", "read-events requires --lane.");
  }
  if (parsed.format !== "json") {
    throw new ChurnEventWriterError("INVALID_READ_EVENTS_ARGS", "read-events only supports --format json.");
  }
  return parsed;
}

function parseEvaluateArgs(args) {
  const parsed = {
    format: "human",
    mode: "dry-run",
    includeMetadata: false,
    lesson: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--lane") {
      parsed.lane = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--format") {
      parsed.format = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.mode = "dry-run";
      continue;
    }
    if (arg === "--apply-safe") {
      parsed.mode = "apply-safe";
      continue;
    }
    if (arg === "--lesson") {
      parsed.lesson = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--include-metadata") {
      parsed.includeMetadata = true;
      continue;
    }
    throw new ChurnEventWriterError("INVALID_EVALUATE_ARGS", `Unsupported evaluate argument: ${arg}`);
  }
  if (!parsed.lane) {
    throw new ChurnEventWriterError("INVALID_EVALUATE_ARGS", "evaluate requires --lane.");
  }
  if (!["human", "json"].includes(parsed.format)) {
    throw new ChurnEventWriterError("INVALID_EVALUATE_ARGS", "evaluate only supports human output or --format json.");
  }
  if (parsed.lesson !== null && (typeof parsed.lesson !== "string" || parsed.lesson.trim() === "")) {
    throw new ChurnEventWriterError("INVALID_EVALUATE_ARGS", "evaluate --lesson requires a lesson id.");
  }
  return parsed;
}

function shapeEvaluationResult({ parsed, readResult, classified, deduped, ignoredPathVerified, applySafeGate, transactionPreflight, sourceApplyResult, verificationFinalizeResult }) {
  const skipped = [...classified.skipped, ...deduped.skipped, ...deduped.proposals];
  const proposals = [...deduped.proposals];
  const warnings = [...classified.warnings, ...deduped.warnings];
  const requiresAuthority = copyArray(classified.requiresAuthority);
  const verification = uniquePlans([
    ...classified.candidates.map((candidate) => candidate.verificationPlan || candidate.verification),
    ...proposals.map((proposal) => proposal.verificationPlan || proposal.verification),
  ].filter(Boolean));
  const result = {
    schemaVersion: 1,
    lane: classified.lane || parsed.lane || null,
    mode: parsed.mode,
    status: classified.status === "success" ? "success" : "input-error",
    exitCode: classified.status === "success" ? 0 : 1,
    lessonsEvaluated: readResult.events.length,
    eventStore: classified.eventStore || readResult.eventStore || null,
    ignoredPathVerified,
    transactionId: null,
    applied: [],
    proposals,
    skipped,
    warnings,
    requiresAuthority,
    filesChanged: [],
    verification,
    residualRisks: [],
    localEventStorage: [
      {
        lane: classified.lane || parsed.lane || null,
        eventStore: classified.eventStore || readResult.eventStore || null,
        eventCount: readResult.events.length,
      },
    ],
  };

  if (parsed.mode === "apply-safe") {
    const gate = applySafeGate || evaluateApplySafeGate();
    const transaction = transactionPreflight || {
      status: "not-requested",
      transactionId: null,
      warnings: [],
      requiresAuthority: [],
      residualRisks: [],
    };
    const sourceApply = sourceApplyResult || {
      status: "not-requested",
      transactionId: null,
      filesChanged: [],
      applied: [],
      verification: [],
      warnings: [],
      requiresAuthority: [],
      residualRisks: [],
    };
    const verificationFinalize = verificationFinalizeResult || null;
    const status = gate.status === "requires-higher-authority"
      || transaction.status === "requires-higher-authority"
      || transaction.status === "manual-inspection-required"
      || sourceApply.status === "requires-higher-authority"
      || verificationFinalize?.status === "requires-higher-authority"
      ? "requires-higher-authority"
      : verificationFinalize?.status === "verification-failed"
        ? "verification-failed"
        : verificationFinalize?.status === "verification-pending-approval"
          ? "verification-pending-approval"
      : "success";
    const gateRequiresAuthority = Array.isArray(gate.requiresAuthority) ? gate.requiresAuthority : [];
    const transactionRequiresAuthority = Array.isArray(transaction.requiresAuthority) ? transaction.requiresAuthority : [];
    const sourceApplyRequiresAuthority = Array.isArray(sourceApply.requiresAuthority) ? sourceApply.requiresAuthority : [];
    const verificationRequiresAuthority = Array.isArray(verificationFinalize?.requiresAuthority) ? verificationFinalize.requiresAuthority : [];
    const finalApplied = verificationFinalize?.applied?.length ? verificationFinalize.applied : sourceApply.applied;
    const finalFilesChanged = verificationFinalize ? verificationFinalize.filesChanged : sourceApply.filesChanged;
    const finalVerification = verificationFinalize?.verification?.length ? verificationFinalize.verification : sourceApply.verification;
    return {
      ...result,
      status,
      exitCode: verificationFinalize?.exitCode ?? (status === "requires-higher-authority" ? 3 : 0),
      transactionId: sourceApply.transactionId || (transaction.status === "prepared" ? transaction.transactionId : null),
      applied: finalApplied.length ? finalApplied : result.applied,
      proposals: verificationFinalize?.proposals?.length ? [...result.proposals, ...verificationFinalize.proposals] : result.proposals,
      warnings: [...result.warnings, ...gate.warnings, ...transaction.warnings, ...sourceApply.warnings, ...(verificationFinalize?.warnings || [])],
      requiresAuthority: [
        ...result.requiresAuthority,
        ...gateRequiresAuthority.map((entry) => ({
          lane: result.lane,
          ...entry,
        })),
        ...transactionRequiresAuthority.map((entry) => ({
          lane: result.lane,
          ...entry,
        })),
        ...sourceApplyRequiresAuthority.map((entry) => ({
          lane: result.lane,
          ...entry,
        })),
        ...verificationRequiresAuthority.map((entry) => ({
          lane: result.lane,
          ...entry,
        })),
      ],
      filesChanged: finalFilesChanged.length ? finalFilesChanged : result.filesChanged,
      verification: finalVerification.length ? finalVerification : result.verification,
      residualRisks: [...result.residualRisks, ...gate.residualRisks, ...transaction.residualRisks, ...sourceApply.residualRisks, ...(verificationFinalize?.residualRisks || [])],
    };
  }

  return result;
}

function resolveVerificationResult(transaction, options = {}) {
  if (options.verificationResult) {
    return options.verificationResult;
  }
  if (typeof options.verificationRunner === "function") {
    return options.verificationRunner({
      targetFile: transaction.targetFile,
      command: transaction.verificationCommand,
      transactionId: transaction.transactionId,
    });
  }
  return {
    status: "approval-required",
    command: transaction.verificationCommand,
    summary: "Verification runner unavailable during embedded finalization.",
  };
}

function shapeInputError(message, overrides = {}) {
  return {
    schemaVersion: 1,
    lane: overrides.lane ?? null,
    mode: "dry-run",
    status: "input-error",
    exitCode: 1,
    lessonsEvaluated: 0,
    eventStore: null,
    ignoredPathVerified: overrides.ignoredPathVerified ?? false,
    transactionId: null,
    applied: [],
    proposals: [],
    skipped: [],
    warnings: [message],
    requiresAuthority: [],
    filesChanged: [],
    verification: [],
    residualRisks: [],
    localEventStorage: [],
  };
}

function scopeReadResultToLesson(readResult, lesson) {
  if (!lesson || !Array.isArray(readResult.events)) {
    return readResult;
  }
  const scopedEvents = readResult.events.filter((event) => {
    return event.eventId === lesson || event.candidateId === lesson;
  });
  return {
    ...readResult,
    events: scopedEvents,
    status: scopedEvents.length > 0 ? readResult.status : "insufficient-evidence",
    warnings: scopedEvents.length > 0
      ? readResult.warnings
      : [...readResult.warnings, `lesson-not-found:${lesson}`],
  };
}

function formatHumanEvaluationResult(result) {
  return [
    "Anti-Churn Hook Result",
    `Lane: ${result.lane || "(none)"}`,
    `Mode: ${result.mode}`,
    `Status: ${result.status}`,
    `Exit code: ${result.exitCode}`,
    `Lessons evaluated: ${result.lessonsEvaluated}`,
    `Proposals prepared: ${formatCountWithReasons(result.proposals, "candidateId")}`,
    `No-op reasons: ${formatReasons(result.skipped)}`,
    `Required authority: ${formatAuthority(result.requiresAuthority)}`,
    `Warnings: ${result.warnings.length ? result.warnings.join("; ") : "none"}`,
    `Files changed: ${result.filesChanged.length ? result.filesChanged.join(", ") : "none"}`,
    `Verification: ${formatVerification(result.verification)}`,
    `Residual risks: ${result.residualRisks.length ? result.residualRisks.join("; ") : "none"}`,
    `Local event storage: ${formatLocalEventStorage(result.localEventStorage)}`,
  ].join("\n");
}

function formatCountWithReasons(items, idField) {
  if (!items.length) {
    return "0";
  }
  return items
    .map((item) => `${item[idField] || "unknown"}:${item.noOpReason || item.decision || "proposal"}`)
    .join(", ");
}

function formatReasons(items) {
  if (!items.length) {
    return "none";
  }
  return items
    .map((item) => `${item.noOpReason || "unknown"}:${item.sourceEventId || item.candidateId || "unknown"}`)
    .join(", ");
}

function formatAuthority(items) {
  if (!items.length) {
    return "none";
  }
  return items
    .map((item) => item.reason || item.behavior || item.authority || "authority-required")
    .join(", ");
}

function formatLocalEventStorage(items) {
  if (!items.length) {
    return "none";
  }
  return items
    .map((item) => `${item.eventStore || "unknown"} (${item.eventCount} events)`)
    .join(", ");
}

function copyArray(value) {
  return Array.isArray(value) ? value.map((item) => ({ ...item })) : [];
}

function uniquePlans(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const key = typeof value === "string" ? value : JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function formatVerification(items) {
  if (!items.length) {
    return "none";
  }
  return items
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      return `${item.target || "unknown"}: ${item.command || item.status || "unmapped"}`;
    })
    .join("; ");
}

function isIgnoredPathVerified(proof) {
  return Boolean(proof?.outsideTrackedSource || proof?.gitIgnored);
}

if (resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const isJson = argv.includes("--format") && argv[argv.indexOf("--format") + 1] === "json";
  const isEvaluation = argv[0] === "evaluate" || argv[0]?.startsWith("--");
  try {
    const result = runAntiChurnGuidanceHookCli(argv);
    const output = isEvaluation && !isJson
      ? formatHumanEvaluationResult(result)
      : JSON.stringify(result);
    process.stdout.write(`${output}\n`);
    process.exitCode = result.exitCode || 0;
  } catch (error) {
    const payload = {
      schemaVersion: 1,
      status: "input-error",
      code: error.code || "ANTI_CHURN_GUIDANCE_HOOK_ERROR",
      message: error.message,
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  }
}
