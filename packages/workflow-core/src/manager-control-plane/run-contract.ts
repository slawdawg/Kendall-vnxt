import type { ManagerControlPlane } from "@kendall/contracts";
import { lifecycleError, lifecycleOk, type ManagerLifecycleResult } from "./result";

export interface DefaultBackendProofRunContractInput {
  runId: string;
  createdAt: string;
  sourceRef?: ManagerControlPlane.ManagerSourceRef;
  verificationCommand?: ManagerControlPlane.VerificationTarget;
  evidencePath?: string;
}

export interface RunContractOperationRequest {
  operation: string;
  authorityFamily: ManagerControlPlane.ManagerAuthorityFamily;
  scope: string;
  target: string;
  evidenceRefs: readonly string[];
  authorityDecisionId?: ManagerControlPlane.AuthorityDecisionId;
  policyId?: ManagerControlPlane.ManagerPolicyId;
  createdAt?: string;
}

export interface RunContractOperationDecision {
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  authorityStage: ManagerControlPlane.ManagerAuthorityStage;
  decision: ManagerControlPlane.ManagerAuthorityDecisionClass;
  authorityFamily: ManagerControlPlane.ManagerAuthorityFamily;
  operation: string;
  policyId: ManagerControlPlane.ManagerPolicyId;
  scope: string;
  allowedTargets: readonly string[];
  requiredEvidenceRefs: readonly string[];
  stopReason: string | null;
  createdAt: string;
}

export interface ManagerRunStartStateInput {
  sourceRefs?: readonly ManagerControlPlane.ManagerSourceRef[];
  createdAt?: string;
  runtimeStatePath?: string;
  desiredWorkers?: number;
  maxWorkers?: number;
  authorityProfile?: string;
  evidenceRefs?: readonly string[];
}

export interface ManagerRunControlStateInput {
  requestedAction: string;
  affectedScope?: string;
  focusSurface?: string;
  targetWorkers?: number;
  createdAt?: string;
  evidenceRefs?: readonly string[];
  externalMutation?: {
    operation: string;
    authorityFamily: ManagerControlPlane.ManagerAuthorityFamily;
    target: string;
  } | null;
}

const BACKEND_PROOF_ALLOWED_OPERATIONS = new Set([
  "contract.validate",
  "fixture.load",
  "memory_dispatcher.refill",
  "memory_dispatcher.claim",
  "memory_dispatcher.heartbeat",
  "memory_dispatcher.complete",
  "memory_dispatcher.fail",
  "memory_dispatcher.recover",
  "manager_run.start",
  "manager_run.steer",
  "summary_json.emit",
  "pipeline_projection.read"
]);

const SOURCE_OWNED_TYPES = new Set(["prd", "bmad_artifact", "research", "repo_source"]);
const ALLOWED_AUTHORITY_PROFILES = new Set(["backend_proof"]);

const BACKEND_PROOF_FORBIDDEN_FAMILIES = new Set<ManagerControlPlane.ManagerAuthorityFamily>([
  "live_worker_execution",
  "delivery_stewardship",
  "cleanup_stewardship",
  "provider_access",
  "secret_access",
  "destructive_operation",
  "external_service_installation"
]);

export function buildDefaultBackendProofRunContract(
  input: Partial<DefaultBackendProofRunContractInput> = {}
): ManagerControlPlane.ImplementationRunContract {
  const runId = (input.runId ?? "run-1") as ManagerControlPlane.ManagerRunId;
  const createdAt = input.createdAt ?? "2026-06-30T00:00:00.000Z";
  const sourceRef = input.sourceRef ?? {
    sourceRefId: "source-manager-control-plane-prd" as ManagerControlPlane.ManagerSourceRefId,
    sourceType: "prd",
    label: "Manager Control Plane PRD",
    pathOrUrl: "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-28-manager-control-plane/prd.md",
    sourceSpan: "FR-6I",
    summaryOnly: true
  };
  const verificationCommand = input.verificationCommand ?? {
    verificationTargetId: "verify-manager-run-contract" as ManagerControlPlane.VerificationTargetId,
    commandId: "manager-run-contract-test",
    command: "node --test tests/manager-control-plane.run-contract.test.mjs",
    expectedResult: "passes"
  };
  const evidencePath = input.evidencePath ?? "tests/fixtures/manager-control-plane/implementation-run-contracts/backend-proof-default.json";

  return {
    implementationRunContractId: `${runId}-contract` as ManagerControlPlane.ImplementationRunContractId,
    runId,
    scope: "backend proof for manager control-plane contracts, deterministic helpers, fixtures, and bounded local evidence",
    outOfScope: [
      "live worker mutation",
      "Git delivery or PR mutation",
      "cleanup apply",
      "provider calls",
      "sensitive credential access",
      "external service installation"
    ],
    sourceRefs: [sourceRef],
    requiredArtifacts: [
      "manager control-plane contract schema",
      "authority ledger classification helper",
      "backend-proof verification evidence"
    ],
    taskGraph: [
      {
        taskId: "backend-proof-contract",
        title: "Validate backend-proof implementation run contract",
        requirementIds: ["FR-2", "FR-6I"],
        authorityClass: "allowed_unattended",
        allowedExecutionMode: "deterministic_script",
        verificationCommandId: verificationCommand.commandId,
        evidenceArtifact: evidencePath,
        dependencyImpact: "contract-only deterministic helper",
        completionCondition: "focused run-contract and full manager-control-plane checks pass"
      }
    ],
    authorityStage: "backend_proof",
    allowedExecutionMode: "deterministic_script",
    authorityFamilies: ["contract_definition", "safe_work_eligibility", "dispatcher_lifecycle", "summary_projection", "runtime_state"],
    stopLines: [
      "no_live_worker_mutation",
      "no_git_delivery",
      "no_cleanup_apply",
      "no_provider_calls",
      "no_secret_access",
      "no_destructive_operations",
      "no_external_service_installation"
    ],
    verificationCommands: [verificationCommand],
    evidencePaths: [evidencePath],
    completionCriteria: [
      "implementation run contract validates",
      "gated operations classify as forbidden under backend_proof",
      "unrelated eligible backend-proof work remains allowed"
    ],
    resumeProtocol: {
      reconcileDispatcherState: true,
      reconcileRuntimeLedger: true,
      reconcileWorkerSessions: false,
      reconcileWorkspaceAssignments: false,
      reconcileGitState: false,
      reconcilePrState: false,
      nextActionOnMismatch: "block_and_record_before_mutation"
    },
    deliveryPhase: null,
    preauthorizations: [],
    evidenceRefs: ["evidence-run-contract" as ManagerControlPlane.EvidenceRefId],
    createdAt,
    updatedAt: createdAt
  };
}

export function validateImplementationRunContract(
  contract: ManagerControlPlane.ImplementationRunContract
): ManagerLifecycleResult<ManagerControlPlane.ImplementationRunContract> {
  const evidenceRefs = contract.evidenceRefs ?? [];
  const missing = [];
  if (!contract.implementationRunContractId) missing.push("implementationRunContractId");
  if (!contract.runId) missing.push("runId");
  if (!contract.scope?.trim()) missing.push("scope");
  if (!contract.outOfScope?.length) missing.push("outOfScope");
  if (!contract.sourceRefs?.length) missing.push("sourceRefs");
  if (!contract.authorityFamilies?.length) missing.push("authorityFamilies");
  if (!contract.authorityStage) missing.push("authorityStage");
  if (!contract.allowedExecutionMode) missing.push("allowedExecutionMode");
  if (!contract.stopLines?.length) missing.push("stopLines");
  if (!contract.verificationCommands?.length) missing.push("verificationCommands");
  if (!contract.evidencePaths?.length) missing.push("evidencePaths");
  if (!contract.completionCriteria?.length) missing.push("completionCriteria");
  if (!contract.resumeProtocol?.nextActionOnMismatch) missing.push("resumeProtocol");
  if (!contract.taskGraph?.length) missing.push("taskGraph");
  if (!contract.requiredArtifacts?.length) missing.push("requiredArtifacts");
  if (!contract.preauthorizations) missing.push("preauthorizations");
  if (!contract.evidenceRefs?.length) missing.push("evidenceRefs");
  if (!contract.createdAt || !contract.updatedAt) missing.push("timestamps");

  if (missing.length > 0) {
    return lifecycleError("missing_evidence", `Implementation Run Contract missing required fields: ${missing.join(", ")}`, evidenceRefs);
  }

  if (contract.authorityStage === "backend_proof") {
    const forbiddenStopLines = [
      "no_live_worker_mutation",
      "no_git_delivery",
      "no_cleanup_apply",
      "no_provider_calls",
      "no_secret_access",
      "no_destructive_operations",
      "no_external_service_installation"
    ];
    const missingStopLines = forbiddenStopLines.filter((stopLine) => !contract.stopLines.includes(stopLine));
    if (missingStopLines.length > 0 || contract.deliveryPhase) {
      return lifecycleError("authority_blocked", "Backend-proof contract must block delivery, live, cleanup, provider, and sensitive credential operations.", evidenceRefs);
    }
  }

  return lifecycleOk(contract, evidenceRefs);
}

export function classifyRunContractOperation(
  contract: ManagerControlPlane.ImplementationRunContract,
  request: RunContractOperationRequest
): RunContractOperationDecision {
  const requiredEvidenceRefs = request.evidenceRefs;
  const baseDecision = {
    authorityDecisionId: (request.authorityDecisionId ?? `${contract.runId}-${normalizeStopReason(request.operation)}-decision`) as ManagerControlPlane.AuthorityDecisionId,
    authorityStage: contract.authorityStage,
    authorityFamily: request.authorityFamily,
    operation: request.operation,
    policyId: (request.policyId ?? `${contract.runId}-run-contract-policy`) as ManagerControlPlane.ManagerPolicyId,
    scope: request.scope,
    requiredEvidenceRefs,
    createdAt: request.createdAt ?? contract.updatedAt
  };

  if (contract.authorityStage === "backend_proof" && BACKEND_PROOF_FORBIDDEN_FAMILIES.has(request.authorityFamily)) {
    return {
      ...baseDecision,
      decision: "forbidden",
      allowedTargets: [],
      stopReason: `backend_proof_forbids_${normalizeStopReason(request.authorityFamily)}`
    };
  }

  if (!contract.authorityFamilies.includes(request.authorityFamily)) {
    return {
      ...baseDecision,
      decision: "block_and_record",
      allowedTargets: [],
      stopReason: `authority_contract_excludes_${normalizeStopReason(request.authorityFamily)}`
    };
  }

  if (!request.target.trim() || request.evidenceRefs.length === 0) {
    return {
      ...baseDecision,
      decision: "block_and_record",
      allowedTargets: [],
      stopReason: "authority_contract_requires_target_and_evidence"
    };
  }

  if (contract.authorityStage === "backend_proof" && BACKEND_PROOF_ALLOWED_OPERATIONS.has(request.operation)) {
    return {
      ...baseDecision,
      decision: "allowed_unattended",
      allowedTargets: [request.target],
      stopReason: null
    };
  }

  return {
    ...baseDecision,
    decision: "block_and_record",
    allowedTargets: [],
    stopReason: `authority_contract_requires_review_for_${normalizeStopReason(request.operation)}`
  };
}

export function buildManagerRunStartState(
  contract: ManagerControlPlane.ImplementationRunContract,
  input: ManagerRunStartStateInput = {}
): ManagerLifecycleResult<ManagerControlPlane.ManagerRunStartState> {
  const explicitSources = (input.sourceRefs ?? []).filter(isSourceOwnedRef);
  const defaultSources = contract.sourceRefs.filter(isSourceOwnedRef);
  const hasExplicitInput = (input.sourceRefs ?? []).length > 0;
  const explicit = explicitSources.length > 0;
  const sourceRef = explicit ? explicitSources[0] : defaultSources[0];
  const evidenceRefs = toEvidenceRefIds(input.evidenceRefs ?? contract.evidenceRefs);
  if (evidenceRefs.length === 0) {
    return lifecycleError("missing_evidence", "Manager run start state requires evidence refs.", evidenceRefs);
  }

  const authorityProfile = input.authorityProfile ?? "backend_proof";
  if (!ALLOWED_AUTHORITY_PROFILES.has(authorityProfile) || authorityProfile !== contract.authorityStage) {
    return lifecycleError("authority_blocked", `Manager run authority profile is not allowed for ${contract.authorityStage}.`, evidenceRefs);
  }

  if (hasExplicitInput && explicitSources.length === 0) {
    return lifecycleError("missing_evidence", "Explicit manager run source evidence is not source-owned.", evidenceRefs);
  }

  if (!sourceRef) {
    return lifecycleError("missing_evidence", "No source-owned manager run evidence exists for startup.", evidenceRefs);
  }

  const createdAt = input.createdAt ?? contract.updatedAt;
  const runtimeStatePath = normalizeRuntimeStatePath(input.runtimeStatePath, contract.runId);
  if (!runtimeStatePath) {
    return lifecycleError("invalid_input", "Manager run runtime state path is unsafe.", evidenceRefs);
  }
  const requestedMaxWorkers = normalizeWorkerCount(input.maxWorkers ?? input.desiredWorkers ?? 6);
  const desiredWorkers = Math.min(normalizeWorkerCount(input.desiredWorkers ?? requestedMaxWorkers), requestedMaxWorkers);
  const maxWorkers = requestedMaxWorkers;
  const startState: ManagerControlPlane.ManagerRunStartState = {
    runId: contract.runId,
    sourceRef: explicit ? sourceRef : markInferredSource(sourceRef),
    sourceSelection: explicit ? "explicit" : "inferred_assumption",
    sourceSelectionReason: explicit ? "operator supplied source-owned evidence" : "[ASSUMPTION] selected first source-owned run contract evidence",
    targetWorkerPolicy: {
      desiredWorkers,
      maxWorkers,
      activeWorkHandling: "drain_current_safe_work_before_target_changes",
      killHealthyWorkersByDefault: false
    },
    authorityProfile,
    authorityStage: contract.authorityStage,
    runtimeStatePath,
    controlState: "starting",
    evidenceRefs,
    createdAt,
    updatedAt: createdAt
  };

  return lifecycleOk(startState, evidenceRefs);
}

export function buildManagerRunControlState(
  contract: ManagerControlPlane.ImplementationRunContract,
  input: ManagerRunControlStateInput
): ManagerLifecycleResult<ManagerControlPlane.ManagerRunControlStateRecord> {
  const evidenceRefs = toEvidenceRefIds(input.evidenceRefs ?? contract.evidenceRefs);
  const createdAt = input.createdAt ?? contract.updatedAt;
  const command = normalizeSteeringAction(input.requestedAction);
  const futureDispatch = buildControlFutureDispatch(command, input);
  const affectedScope = input.affectedScope || futureDispatch.scope;
  const acceptedLocal = classifyRunContractOperation(contract, {
    operation: "manager_run.steer",
    authorityFamily: "runtime_state",
    scope: affectedScope,
    target: `manager-runs/${contract.runId}/control-state`,
    evidenceRefs,
    createdAt
  });

  const externalDecision = input.externalMutation
    ? classifyRunContractOperation(contract, {
        operation: input.externalMutation.operation,
        authorityFamily: input.externalMutation.authorityFamily,
        scope: affectedScope,
        target: input.externalMutation.target,
        evidenceRefs,
        createdAt
      })
    : null;

  if (acceptedLocal.decision !== "allowed_unattended") {
    const record = managerControlNeedsReviewRecord(contract, input, {
      createdAt,
      evidenceRefs,
      affectedScope,
      reason: acceptedLocal.stopReason ?? "manager_run_steering_requires_review",
      authorityDecisionId: acceptedLocal.authorityDecisionId
    });
    return lifecycleOk(record, evidenceRefs);
  }

  if (externalDecision && externalDecision.decision !== "allowed_unattended") {
    const record = managerControlNeedsReviewRecord(contract, input, {
      createdAt,
      evidenceRefs,
      affectedScope,
      reason: externalDecision.stopReason ?? "external_mutation_requires_review",
      authorityDecisionId: externalDecision.authorityDecisionId
    });
    return lifecycleOk(record, evidenceRefs);
  }

  if (command === "unknown") {
    const record = managerControlNeedsReviewRecord(contract, input, {
      createdAt,
      evidenceRefs,
      affectedScope,
      reason: "unsupported_steering_instruction",
      authorityDecisionId: `${contract.runId}-unsupported-steering-decision` as ManagerControlPlane.AuthorityDecisionId
    });
    return lifecycleOk(record, evidenceRefs);
  }

  const activeWorkPolicy = buildControlActiveWorkPolicy(command, input);
  const operatorReport = buildControlOperatorReport(command, futureDispatch, activeWorkPolicy, input);
  const record: ManagerControlPlane.ManagerRunControlStateRecord = {
    runId: contract.runId,
    controlState: controlStateForCommand(command),
    requestedAction: command,
    affectedScope,
    authorityBasis: "operator-live-steering",
    authorityDecisionId: acceptedLocal.authorityDecisionId,
    authorityStage: contract.authorityStage,
    nextAction: nextActionForCommand(command, input),
    futureDispatch,
    activeWorkPolicy,
    operatorReport,
    blocker: null,
    needsReviewReason: null,
    retentionClass: "metadata_only",
    evidenceRefs,
    createdAt
  };
  return lifecycleOk(record, evidenceRefs);
}

function isSourceOwnedRef(sourceRef: ManagerControlPlane.ManagerSourceRef): boolean {
  return SOURCE_OWNED_TYPES.has(sourceRef.sourceType) && Boolean(sourceRef.label?.trim());
}

function markInferredSource(sourceRef: ManagerControlPlane.ManagerSourceRef): ManagerControlPlane.ManagerSourceRef {
  const label = sourceRef.label.startsWith("[ASSUMPTION]") ? sourceRef.label : `[ASSUMPTION] ${sourceRef.label}`;
  return { ...sourceRef, label };
}

function normalizeWorkerCount(value: number): number {
  if (!Number.isFinite(value)) return 6;
  return Math.max(0, Math.min(6, Math.trunc(value)));
}

function normalizeRuntimeStatePath(value: string | undefined, runId: string): string {
  const fallback = `workspace-state:manager-runs/${runId}`;
  const candidate = (value ?? fallback).trim();
  if (!candidate || candidate.includes("..") || /[\u0000-\u001f\u007f]/.test(candidate)) return "";
  if (candidate.startsWith("workspace-state:manager-runs/")) {
    const stateRunId = candidate.slice("workspace-state:manager-runs/".length).replace(/\/+$/, "");
    return stateRunId === runId ? candidate : "";
  }
  if (candidate.startsWith("/tmp/") && candidate.endsWith(`/manager-runs/${runId}`)) return candidate;
  return "";
}

function normalizeSteeringAction(value: string): string {
  const command = value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (["pause", "resume", "quiet_mode", "status", "focus_surface", "reduce_worker_count", "show_testable_work"].includes(command)) return command;
  if (["stop_after_current_lanes", "stop_after_current", "drain_and_stop"].includes(command)) return "stop_after_current_lanes";
  return "unknown";
}

function controlStateForCommand(command: string): ManagerControlPlane.ManagerRunControlState {
  if (command === "pause") return "operator_paused";
  if (command === "stop_after_current_lanes") return "drain";
  if (command === "quiet_mode") return "quiet";
  if (command === "status" || command === "show_testable_work") return "status_only";
  if (command === "resume" || command === "focus_surface" || command === "reduce_worker_count") return "active";
  return "needs_review";
}

function buildControlFutureDispatch(command: string, input: ManagerRunControlStateInput): ManagerControlPlane.ManagerRunFutureDispatchState {
  if (command === "pause") return { action: "pause_new_dispatch", newDispatchAllowed: false, scope: "all-new-work" };
  if (command === "resume") return { action: "resume_dispatch_when_governors_allow", newDispatchAllowed: true, scope: "governed-safe-work" };
  if (command === "stop_after_current_lanes") return { action: "drain_and_stop", newDispatchAllowed: false, scope: "no-new-lanes" };
  if (command === "focus_surface") return { action: "drain_and_shift_focus", newDispatchAllowed: true, scope: "focused-surface", focusSurface: input.focusSurface ?? input.affectedScope ?? "" };
  if (command === "reduce_worker_count") return { action: "reduce_worker_target", newDispatchAllowed: true, scope: "bounded-worker-pool", targetWorkers: normalizeWorkerCount(input.targetWorkers ?? 5) };
  if (command === "quiet_mode") return { action: "reduce_progress_beacon_frequency", newDispatchAllowed: true, scope: "reporting-cadence" };
  if (command === "status") return { action: "report_current_status", newDispatchAllowed: false, scope: "report-only" };
  if (command === "show_testable_work") return { action: "report_testable_work", newDispatchAllowed: false, scope: "report-only" };
  return { action: "request_supported_steering_instruction", newDispatchAllowed: false, scope: "needs-review" };
}

function buildControlActiveWorkPolicy(command: string, input: ManagerRunControlStateInput): ManagerControlPlane.ManagerRunActiveWorkPolicy {
  if (["pause", "stop_after_current_lanes", "focus_surface", "reduce_worker_count"].includes(command)) {
    return {
      defaultAction: command === "focus_surface" ? "drain_current_safe_work_then_shift" : "drain_active_safe_work",
      activeWorkHandling: command === "reduce_worker_count" ? "let_safe_current_steps_checkpoint_before_reducing" : "let_safe_current_steps_checkpoint",
      killHealthyWorkersByDefault: false
    };
  }
  return {
    defaultAction: "keep_healthy_work_running",
    activeWorkHandling: input.externalMutation ? "block_external_mutation_before_worker_change" : "no_worker_interruption",
    killHealthyWorkersByDefault: false
  };
}

function buildControlOperatorReport(
  command: string,
  futureDispatch: ManagerControlPlane.ManagerRunFutureDispatchState,
  activeWorkPolicy: ManagerControlPlane.ManagerRunActiveWorkPolicy,
  input: ManagerRunControlStateInput
): ManagerControlPlane.ManagerRunOperatorReport {
  return {
    whatChanged: controlWhatChanged(command, futureDispatch, input),
    whyItMatters: "The manager records steering as local metadata before changing any external execution surface.",
    whatHappensNext: nextActionForCommand(command, input) || activeWorkPolicy.defaultAction
  };
}

function controlWhatChanged(command: string, futureDispatch: ManagerControlPlane.ManagerRunFutureDispatchState, input: ManagerRunControlStateInput): string {
  if (command === "focus_surface") return `New dispatch will focus on ${futureDispatch.focusSurface}; active safe work will drain first.`;
  if (command === "reduce_worker_count") return `Worker target will be reduced to ${futureDispatch.targetWorkers}.`;
  if (command === "pause") return "New dispatch is paused by operator instruction.";
  if (command === "resume") return "New dispatch may resume when governors allow it.";
  if (command === "stop_after_current_lanes") return "The run will stop after current safe lanes reach checkpoints.";
  if (command === "quiet_mode") return "Progress reports will use a quieter cadence.";
  if (command === "status") return "The manager will report current run state.";
  if (command === "show_testable_work") return "The manager will report user-facing work ready to test.";
  if (input.externalMutation) return "External mutation was blocked and recorded for review.";
  return "The steering instruction needs review.";
}

function nextActionForCommand(command: string, input: ManagerRunControlStateInput): string {
  if (command === "pause") return "Record the instruction, stop new dispatch, and let active safe checkpoints finish.";
  if (command === "resume") return "Re-evaluate usage, resources, and safe backlog before dispatching new work.";
  if (command === "stop_after_current_lanes") return "Drain active lanes, summarize progress, perform housekeeping, and stop.";
  if (command === "focus_surface") return "Drain current safe work, then dispatch new lanes only for the focused surface.";
  if (command === "reduce_worker_count") return "Let current safe steps checkpoint, then reduce the worker target.";
  if (command === "quiet_mode") return "Send only heartbeat, blocker, decision, or daily-use checkpoint reports.";
  if (command === "status") return "Return the current cycle report without changing dispatch.";
  if (command === "show_testable_work") return "Return daily-use checkpoints and where to test them.";
  if (input.externalMutation) return "Keep external mutation blocked until a later authority stage allows it.";
  return "Ask for a supported steering command before changing dispatch.";
}

function managerControlNeedsReviewRecord(
  contract: ManagerControlPlane.ImplementationRunContract,
  input: ManagerRunControlStateInput,
  context: {
    createdAt: string;
    evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
    affectedScope: string;
    reason: string;
    authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  }
): ManagerControlPlane.ManagerRunControlStateRecord {
  const futureDispatch = { action: "blocked_needs_review", newDispatchAllowed: false, scope: context.affectedScope || "needs-review" };
  const activeWorkPolicy = buildControlActiveWorkPolicy("unknown", input);
  return {
    runId: contract.runId,
    controlState: "needs_review",
    requestedAction: normalizeSteeringAction(input.requestedAction),
    affectedScope: context.affectedScope || "needs-review",
    authorityBasis: "operator-live-steering",
    authorityDecisionId: context.authorityDecisionId,
    authorityStage: contract.authorityStage,
    nextAction: "Keep the requested change blocked and ask for review before external mutation.",
    futureDispatch,
    activeWorkPolicy,
    operatorReport: {
      whatChanged: `Requested change was blocked and recorded for review: ${context.reason}.`,
      whyItMatters: `The active authority contract does not allow this operation unattended because ${context.reason}.`,
      whatHappensNext: "Continue unrelated safe local work, use a supported steering instruction, or wait for explicit authority."
    },
    blocker: context.reason,
    needsReviewReason: context.reason,
    retentionClass: "metadata_only",
    evidenceRefs: context.evidenceRefs,
    createdAt: context.createdAt
  };
}

function normalizeStopReason(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function toEvidenceRefIds(value: readonly string[]): readonly ManagerControlPlane.EvidenceRefId[] {
  return value as readonly ManagerControlPlane.EvidenceRefId[];
}
