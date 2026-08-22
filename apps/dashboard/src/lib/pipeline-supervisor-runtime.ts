import {
  AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES,
  isPipelineCanonicalContractV1,
  isPipelineProductModeMappingV0,
  validatePipelineEpic25EvidenceChainV0,
  validatePipelineEpic25EvidenceChainV1,
} from "@kendall/contracts";
import type {
  AuthoritativeWorkPacketLifecycleView,
  PipelineCanonicalContractV1,
  PipelineDashboardProjectionV0,
  PipelineEpic25EvidenceChainReadV0,
  PipelineEpic25EvidenceChainReadV1,
  PipelineProductModeMappingV0,
  WorkPacketV0View,
} from "@kendall/contracts";
import type {
  DashboardCanonicalManagerLaneClarityV1,
  DashboardCanonicalOperationalProjectionV1,
} from "./pipeline/canonical-operational-projection";
import {
  isDashboardCoordinationHealthInput,
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";
import { requestSupervisorJson, type SupervisorReadOptions } from "./dashboard-supervisor-transport";

function requestJson<T>(path: string, options: SupervisorReadOptions = {}): Promise<T> {
  return requestSupervisorJson<T>(path, { ...options, timeoutMs: options.timeoutMs ?? 10_000, rejectServerLanAuth: true });
}

const AUTHORITATIVE_STAGES = new Set(["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]);
const AUTHORITATIVE_STATUSES = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const AUTHORITATIVE_TRUTH_LABELS = new Set(["source_owned", "derived_projection", "operator_asserted"]);
const AUTHORITATIVE_SOURCE_TYPES = new Set(["prd", "bmad_story", "operator_input", "workflow", "repo_doc"]);
const AUTHORITATIVE_ACTOR_TYPES = new Set(["system", "operator", "manager", "worker"]);
const AUTHORITATIVE_EVENT_TYPES = new Set<string>(AUTHORITATIVE_PACKET_LIFECYCLE_EVENT_TYPES);
const AUTHORITATIVE_PLANNING_SOURCE_PATH = "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md";
const CURRENT_OPERATIONAL_ACTION_LOOP_PRD_PATH = "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md";
const PLANNING_SOURCE_MARKER = "_bmad-output/planning-artifacts/prds/";
const EVIDENCE_CHAIN_ALLOWED_FUTURE_SKEW_MS = 60_000;
const UNSAFE_LIFECYCLE_TEXT_RE = /\b(raw[\s_-]*(prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?([\s_-]*(key|token|value|id))?|credentials?([\s_-]*(key|token|value|id))?|(terminal|tmux|pane)[\s_-]*(scrollbacks?|texts?|outputs?|stdouts?|stderrs?))\b/i;
const UNSAFE_LANE_CLARITY_TEXT_RE = /\b(?:raw[_-]?payload|provider[_-]?payload|secret|token|credential|password|api[_-]?key|private[_-]?key)\b|\bbearer\s+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const TOKEN_LIKE_LANE_CLARITY_VALUE_RE = /(?<![A-Za-z0-9])(?:sk-(?:proj-)?[A-Za-z0-9][A-Za-z0-9_-]{7,}|gh[pousr]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,}|AKIA[A-Z0-9]{8,}|ASIA[A-Z0-9]{8,}|glpat-[A-Za-z0-9_-]{8,}|npm_[A-Za-z0-9]{8,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|eyJ[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])|(?<![A-Za-z0-9])[A-Za-z]{2,12}[-_](?=(?:[A-Za-z0-9]*\d){2})[A-Za-z0-9]{20,}(?![A-Za-z0-9])|^(?=[A-Za-z0-9+/]{48,}={0,2}$)(?=.*[0-9+/=])[A-Za-z0-9+/]+={0,2}$|^(?=[a-f0-9]{40,}$)(?=.*[0-9])[a-f0-9]+$/i;
const LANE_CLARITY_CONTROL_CHARACTER_RE = /[\x00-\x1f\x7f]/;
const LANE_CLARITY_PEM_OR_HIGH_ENTROPY_RE = /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----|(?<![A-Za-z0-9])[A-Za-z0-9+/]{48,}={0,2}(?![A-Za-z0-9])/i;
const MANAGER_SOURCE_LANE_CLARITY_REF_RE = /^manager-source-[a-f0-9]{40}$/;
const CANONICAL_LANE_CLARITY_PHASES = new Set(["queued", "leased", "running", "refilling", "completed", "failed", "expired", "blocked", "needs_review", "closed", "manager_only", "unknown", "no_safe_work", "authoritative_backlog_exhausted", "unverified", "simulated"]);
const CANONICAL_LANE_CLARITY_FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const CANONICAL_LANE_CLARITY_EVIDENCE_FRESHNESS = new Set(["fresh", "stale", "missing", "unknown"]);
const CANONICAL_LANE_CLARITY_DISPOSITIONS = new Set(["met", "in_progress", "blocked", "not_assessed"]);
const CANONICAL_LANE_CLARITY_QUALIFICATIONS = new Set(["operator_drift_concern", "second_qualified_recovery_detour"]);

type CanonicalSupervisorPacketPayload = AuthoritativeWorkPacketLifecycleView & {
  canonicalContract?: unknown;
  evidenceChain?: unknown;
  productModeMapping?: unknown;
};

/**
 * Dashboard-owned canonical read model. The compatibility projection is a
 * temporary, read-only adapter for components that have not yet retired V0.
 */
export type DashboardCanonicalWorkPacketV1 = {
  authoritativeLifecycle: AuthoritativeWorkPacketLifecycleView;
  canonicalContract: PipelineCanonicalContractV1 | null;
  evidenceChain: PipelineEpic25EvidenceChainReadV0 | PipelineEpic25EvidenceChainReadV1 | null;
  productModeMapping: PipelineProductModeMappingV0 | null;
  presentation: DashboardCanonicalPresentationV1;
};

export type DashboardCanonicalMemoryProposalV1 = {
  proposalRouteId: string; proposalId: string; revision: number; label: string; status: string; summary: string; sourceRefs: string[]; evidenceRefs: string[];
  targetVaultPath: string | null; targetVaultFolder: string; proposalType: string; suggestedContentSummary: string; aiDraftEligible: boolean; llmWikiArtifactSearchEligible: boolean;
  patchSummary: string | null; sensitivity: string; freshness: string; contradictionStatus: string; confidence: string;
  operatorAction: string; decisionNeededContext: string | null; backupRecoveryPath: string; writeBackStatus: string;
  writeBackAllowed: false;
};

export type DashboardCanonicalWorkItemMemoryReviewV1 = {
  schemaVersion: "work-item-memory-review/v1"; workItemId: string; authoritativePacketId: string | null;
  proposals: DashboardCanonicalMemoryProposalV1[];
  llmWikiReadiness: {
    decisionState: "ready" | "blocked" | "not_configured"; canonicality: "derived_disposable_rebuildable";
    allowedInputs: string[]; blockedReasons: string[]; nextActions: string[]; boundarySummary: string;
    durableWriteAllowed: false;
    rebuildPreview: { previewId: string; inputRefs: string[]; memoryProposalRefs: string[]; plannedOutputScope: string; retentionClass: "metadata_only"; stopLine: string } | null;
    rebuildDryRunPlan: { planId: string; inputRefs: string[]; plannedDerivedSections: string[]; disposableTargetNamespace: string; retentionClass: "metadata_only"; stopLines: string[]; discardRecoveryPath: string; writePerformed: false } | null;
  } | null;
  metadataOnly: true; rawPayloadRetained: false; canonicalMutationAllowed: false; sourceMutationAllowed: false;
};

/**
 * Versioned dashboard presentation assembled only from the authoritative
 * lifecycle response. The property set intentionally mirrors the current
 * cockpit/detail display requirements while the V0 projector is retired.
 */
export type DashboardCanonicalPresentationV1 = {
  schemaVersion: "dashboard-canonical-presentation/v1";
  packetId: string;
  title: string;
  requestedOutcome: string;
  currentStage: "capture" | "classify" | "route" | "shape" | "human_gate" | "execute" | "review" | "promote" | "deliver" | "learn";
  currentOwner: "kendall" | "operator" | "local_model" | "hermes_worker_mock" | "codex_worker" | "claude_reviewer" | "github" | "memory_review" | "blocked";
  status: "active" | "waiting" | "blocked" | "failed" | "complete" | "deferred";
  lifecycleState: {
    source: "workflow_event";
    stage: "capture" | "classify" | "route" | "shape" | "human_gate" | "execute" | "review" | "promote" | "deliver" | "learn";
    owner: "kendall" | "operator" | "local_model" | "hermes_worker_mock" | "codex_worker" | "claude_reviewer" | "github" | "memory_review" | "blocked";
    status: "active" | "waiting" | "blocked" | "failed" | "complete" | "deferred";
    reasonCodes: string[];
    authoritativeRef: string;
    derivedFromRefs: string[];
    transitionEventRefs: string[];
    latestTransitionEventRef: string | null;
    attemptRef: null;
    metadataOnly: true;
    sourceMutationAllowed: false;
    providerCallsAllowed: false;
    workerLaunchAllowed: false;
    githubMutationAllowed: false;
    cleanupAllowed: false;
  };
  riskLevel: "low" | "medium" | "high";
  priority: "low" | "normal" | "high" | "urgent";
  sourceRefs: Array<{
    refId: string;
    sourceType: "bmad_artifact" | "manual";
    label: string;
    pathOrUrl: string | null;
    freshness: "unknown" | "stale";
    accessState: "allowed" | "blocked";
    canonical: true;
    summaryOnly: true;
    blockedReason: string | null;
  }>;
  evidenceRefs: Array<{
    refId: string;
    evidenceType: "event";
    label: string;
    artifactPath: null;
    retentionClass: "metadata_only";
    rawPayloadRetained: false;
  }>;
  transitionEvents: Array<{
    eventId: string;
    eventType: string;
    summary: string;
    createdAt: string;
    sourceStage: DashboardCanonicalPresentationV1["currentStage"] | null;
    targetStage: DashboardCanonicalPresentationV1["currentStage"];
    sourceOwner: DashboardCanonicalPresentationV1["currentOwner"] | null;
    targetOwner: DashboardCanonicalPresentationV1["currentOwner"];
    sourceStatus: null;
    targetStatus: DashboardCanonicalPresentationV1["status"];
    reasonCodes: string[];
    evidenceRefs: string[];
    durable: true;
    sourceEventId: null;
    actorLabel: string;
  }>;
};

function canonicalDetailPacket(value: unknown): DashboardCanonicalWorkPacketV1 {
  if (!isAuthoritativeWorkPacketLifecycleView(value)) {
    throw new Error("Canonical WorkPacket detail response is not authoritative lifecycle-shaped.");
  }
  const payload = value as CanonicalSupervisorPacketPayload;
  const presentation = projectAuthoritativeWorkPacket(payload);
  const canonicalContract = nullableCanonicalExtension(payload.canonicalContract, isPipelineCanonicalContractV1, "canonicalContract");
  const evidenceChain = nullableEvidenceChainExtension(payload.evidenceChain, payload.packetId);
  const productModeMapping = nullableCanonicalExtension(payload.productModeMapping, isPipelineProductModeMappingV0, "productModeMapping");
  validateCanonicalExtensionBindings(payload, canonicalContract, evidenceChain, productModeMapping);
  return {
    authoritativeLifecycle: payload,
    canonicalContract,
    evidenceChain,
    productModeMapping,
    presentation,
  };
}

function nullableCanonicalExtension<T>(value: unknown, validator: (candidate: unknown) => candidate is T, field: string): T | null {
  if (value == null) return null;
  if (!validator(value)) throw new Error(`Canonical WorkPacket ${field} extension is invalid.`);
  return value;
}

function nullableEvidenceChainExtension(
  value: unknown,
  authoritativePacketId: string,
): PipelineEpic25EvidenceChainReadV0 | PipelineEpic25EvidenceChainReadV1 | null {
  if (value == null) return null;
  const chain = value as { authoritativePacketId?: unknown };
  if (chain.authoritativePacketId !== authoritativePacketId) {
    throw new Error("Canonical WorkPacket evidenceChain does not bind its authoritative packet identity.");
  }
  const readRecord = evidenceChainReadRecord(value);
  const baseRecord = { ...readRecord };
  delete baseRecord.chainDigestSha256;
  delete baseRecord.freshnessState;
  delete baseRecord.effectiveDecision;
  delete baseRecord.typedBlockers;
  const structuralCheckMs = typeof baseRecord.checkedAt === "string" ? Date.parse(baseRecord.checkedAt) : Number.NaN;
  if (!Number.isFinite(structuralCheckMs) || structuralCheckMs > Date.now() + EVIDENCE_CHAIN_ALLOWED_FUTURE_SKEW_MS) {
    throw new Error("Canonical WorkPacket evidenceChain extension is invalid.");
  }
  if (validatePipelineEpic25EvidenceChainV0(baseRecord, structuralCheckMs).length === 0 && isEvidenceChainReadExtension(readRecord, false)) {
    return value as PipelineEpic25EvidenceChainReadV0;
  }
  if (validatePipelineEpic25EvidenceChainV1(baseRecord, structuralCheckMs).length === 0 && isEvidenceChainReadExtension(readRecord, true)) {
    return value as PipelineEpic25EvidenceChainReadV1;
  }
  throw new Error("Canonical WorkPacket evidenceChain extension is invalid.");
}

function evidenceChainReadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Canonical WorkPacket evidenceChain extension is invalid.");
  }
  return value as Record<string, unknown>;
}

function isEvidenceChainReadExtension(value: Record<string, unknown>, isV1: boolean): boolean {
  const allowedBlockers = isV1
    ? new Set(["evidence_chain_stale", "live_evidence_unavailable", "policy_profile_stale", "source_revision_attestation_required", "retention_policy_expired", "retention_policy_unverified", "quality_gate_not_passed"])
    : new Set(["evidence_chain_stale", "live_evidence_unavailable", "policy_profile_upgrade_required", "legacy_upgrade_unavailable"]);
  if (!(typeof value.chainDigestSha256 === "string" && /^sha256:[0-9a-f]{64}$/.test(value.chainDigestSha256) &&
    (value.freshnessState === "fresh" || value.freshnessState === "stale") &&
    (value.effectiveDecision === "go" || value.effectiveDecision === "hold" || value.effectiveDecision === "limited_rollout") &&
    Array.isArray(value.typedBlockers) && value.typedBlockers.every((blocker) => typeof blocker === "string" && allowedBlockers.has(blocker)))) {
    return false;
  }
  const blockers = value.typedBlockers as string[];
  const freshnessOrRetentionBlockers = new Set([
    "evidence_chain_stale",
    "policy_profile_stale",
    "retention_policy_expired",
    "retention_policy_unverified",
    "policy_profile_upgrade_required",
    "legacy_upgrade_unavailable",
  ]);
  if (value.effectiveDecision === "go" && blockers.length > 0) return false;
  if (value.freshnessState === "fresh") return !blockers.some((blocker) => freshnessOrRetentionBlockers.has(blocker));
  return value.effectiveDecision === "hold" && blockers.some((blocker) => freshnessOrRetentionBlockers.has(blocker));
}

function validateCanonicalExtensionBindings(
  packet: CanonicalSupervisorPacketPayload,
  canonicalContract: PipelineCanonicalContractV1 | null,
  evidenceChain: PipelineEpic25EvidenceChainReadV0 | PipelineEpic25EvidenceChainReadV1 | null,
  productModeMapping: PipelineProductModeMappingV0 | null,
): void {
  if (evidenceChain && evidenceChain.authoritativePacketId !== packet.packetId) {
    throw new Error("Canonical WorkPacket evidenceChain does not bind its authoritative packet identity.");
  }
  if (canonicalContract && !sameAuthoritativeSourceRef(canonicalContract.canonicalSource.provenance.sourceRef, packet.sourceRef)) {
    throw new Error("Canonical WorkPacket canonicalContract provenance does not bind its authoritative source.");
  }
  if (productModeMapping && !canonicalContract) {
    throw new Error("Canonical WorkPacket productModeMapping requires its canonical contract.");
  }
  if (canonicalContract && productModeMapping && productModeMapping.requestedProductMode !== canonicalContract.productMode) {
    throw new Error("Canonical WorkPacket productModeMapping does not match the canonical contract mode.");
  }
}

function sameAuthoritativeSourceRef(left: unknown, right: unknown): boolean {
  if (!left || typeof left !== "object" || !right || typeof right !== "object") return false;
  const leftRef = left as Record<string, unknown>;
  const rightRef = right as Record<string, unknown>;
  return ["refId", "sourceType", "pathOrUrl", "title", "contentSha256"].every((field) => (leftRef[field] ?? null) === (rightRef[field] ?? null));
}

function isAuthoritativeWorkPacketLifecycleView(value: unknown): value is AuthoritativeWorkPacketLifecycleView {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<AuthoritativeWorkPacketLifecycleView>;
  if (
    !isSafeCanonicalRef(packet.packetId) ||
    !isNonEmptyString(packet.title) ||
    !isSetValue(packet.currentStage, AUTHORITATIVE_STAGES) ||
    !isSetValue(packet.status, AUTHORITATIVE_STATUSES) ||
    !isSetValue(packet.truthLabel, AUTHORITATIVE_TRUTH_LABELS) ||
    !isAuthoritativeSourceRef(packet.sourceRef) ||
    !isDateString(packet.createdAt) ||
    !isDateString(packet.updatedAt) ||
    !isSafeCanonicalRef(packet.currentEventId) ||
    !isAuthoritativeReadyToTest(packet.readyToTest) ||
    !Array.isArray(packet.history) ||
    packet.history.length === 0 ||
    packet.metadataOnly !== true
  ) {
    return false;
  }
  const events = packet.history as unknown[];
  if (!events.every((event) => isAuthoritativeLifecycleEvent(event, packet.packetId as string))) return false;
  const currentEvents = events.filter((event) => (event as { eventId?: unknown }).eventId === packet.currentEventId);
  if (currentEvents.length !== 1) return false;
  const currentEvent = currentEvents[0] as Record<string, unknown>;
  return currentEvent.targetStage === packet.currentStage &&
    currentEvent.status === packet.status &&
    currentEvent.truthLabel === packet.truthLabel;
}

function projectAuthoritativeWorkPacket(packet: AuthoritativeWorkPacketLifecycleView): DashboardCanonicalPresentationV1 {
  const stage = legacyStage(packet.currentStage);
  const owner = legacyOwner(packet.currentStage, packet.status);
  const currentEvent = packet.history.find((event) => event.eventId === packet.currentEventId)!;
  const supersededBy = supersededPlanningSource(packet.sourceRef.pathOrUrl);
  const sourceType = packet.sourceRef.sourceType === "prd" || packet.sourceRef.sourceType === "bmad_story" ? "bmad_artifact" as const : "manual" as const;
  const sourceRef: DashboardCanonicalPresentationV1["sourceRefs"][number] = supersededBy === null
    ? {
        refId: packet.sourceRef.refId,
        sourceType,
        label: packet.sourceRef.title || packet.sourceRef.refId,
        pathOrUrl: packet.sourceRef.pathOrUrl ?? null,
        freshness: "unknown",
        accessState: "allowed",
        canonical: true,
        summaryOnly: true,
        blockedReason: null,
      }
    : {
        refId: packet.sourceRef.refId,
        sourceType,
        label: packet.sourceRef.title || packet.sourceRef.refId,
        pathOrUrl: null,
        freshness: "stale",
        accessState: "blocked",
        canonical: true,
        summaryOnly: true,
        blockedReason: `Source is superseded by ${supersededBy}.`,
      };
  const eventRefs = packet.history.map((event) => `event:${event.eventId}`);
  const suppliedEvidenceRefs = projectionSafeLifecycleRefs(packet.history.flatMap((event) => event.evidenceRefs));
  const readyToTestEvidenceRefs = projectionSafeLifecycleRefs(packet.readyToTest?.evidenceRefs ?? []);
  const evidenceRefs = [...new Set([...eventRefs, ...suppliedEvidenceRefs, ...readyToTestEvidenceRefs])];
  const transitionEvents = packet.history.map((event) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    summary: projectionSafeLifecycleSummary(event.payloadSummary),
    createdAt: event.occurredAt,
    sourceStage: event.previousStage == null ? null : legacyStage(event.previousStage),
    targetStage: legacyStage(event.targetStage),
    sourceOwner: event.previousStage == null ? null : legacyOwner(event.previousStage, "active"),
    targetOwner: legacyOwner(event.targetStage, event.status),
    sourceStatus: null,
    targetStatus: event.status,
    reasonCodes: ["supervisor.authoritative_lifecycle_event", `supervisor.truth.${event.truthLabel}`],
    evidenceRefs: [...new Set([`event:${event.eventId}`, ...projectionSafeLifecycleRefs(event.evidenceRefs)])],
    durable: true as const,
    sourceEventId: null,
    actorLabel: event.actor.actorLabel || event.actor.actorId || event.actor.actorType,
  }));
  return {
    schemaVersion: "dashboard-canonical-presentation/v1",
    packetId: packet.packetId,
    title: packet.title,
    requestedOutcome: projectionSafeLifecycleSummary(currentEvent.payloadSummary),
    currentStage: stage,
    currentOwner: owner,
    status: packet.status,
    lifecycleState: {
      source: "workflow_event",
      stage,
      owner,
      status: packet.status,
      reasonCodes: [
        "supervisor.authoritative_work_packet",
        `supervisor.truth.${packet.truthLabel}`,
        `supervisor.stage.${packet.currentStage}`,
      ],
      authoritativeRef: `authoritative_work_packet:${packet.packetId}`,
      derivedFromRefs: [sourceRef.refId, ...eventRefs],
      transitionEventRefs: eventRefs,
      latestTransitionEventRef: `event:${packet.currentEventId}`,
      attemptRef: null,
      metadataOnly: true,
      sourceMutationAllowed: false,
      providerCallsAllowed: false,
      workerLaunchAllowed: false,
      githubMutationAllowed: false,
      cleanupAllowed: false,
    },
    riskLevel: "medium",
    priority: "normal",
    transitionEvents,
    sourceRefs: [sourceRef],
    evidenceRefs: evidenceRefs.map((refId) => ({
      refId,
      evidenceType: "event",
      label: refId.startsWith("event:") ? "Supervisor authoritative lifecycle event" : "Supervisor authoritative lifecycle evidence",
      artifactPath: null,
      retentionClass: "metadata_only",
      rawPayloadRetained: false,
    })),
  };
}

function isAuthoritativeSourceRef(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const sourceRef = value as Record<string, unknown>;
  return isSafeCanonicalRef(sourceRef.refId) &&
    isSetValue(sourceRef.sourceType, AUTHORITATIVE_SOURCE_TYPES) &&
    isOptionalString(sourceRef.pathOrUrl) &&
    isOptionalString(sourceRef.title) &&
    (sourceRef.contentSha256 == null || (typeof sourceRef.contentSha256 === "string" && /^[0-9a-f]{64}$/i.test(sourceRef.contentSha256)));
}

function isAuthoritativeLifecycleEvent(value: unknown, packetId: string): boolean {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const actor = event.actor;
  return isSafeCanonicalRef(event.eventId) &&
    event.packetId === packetId &&
    event.schemaVersion === 1 &&
    isSetValue(event.eventType, AUTHORITATIVE_EVENT_TYPES) &&
    (event.previousStage == null || isSetValue(event.previousStage, AUTHORITATIVE_STAGES)) &&
    isSetValue(event.targetStage, AUTHORITATIVE_STAGES) &&
    isSetValue(event.status, AUTHORITATIVE_STATUSES) &&
    isSetValue(event.truthLabel, AUTHORITATIVE_TRUTH_LABELS) &&
    isAuthoritativeSourceRef(event.sourceRef) &&
    actor !== null &&
    typeof actor === "object" &&
    !Array.isArray(actor) &&
    actor !== undefined &&
    isSetValue((actor as Record<string, unknown>).actorType, AUTHORITATIVE_ACTOR_TYPES) &&
    isOptionalString((actor as Record<string, unknown>).actorId) &&
    isOptionalString((actor as Record<string, unknown>).actorLabel) &&
    isDateString(event.occurredAt) &&
    isNonEmptyString(event.payloadSummary) &&
    Array.isArray(event.evidenceRefs) &&
    event.evidenceRefs.every(isSafeCanonicalRef) &&
    event.metadataOnly === true;
}

function isAuthoritativeReadyToTest(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const readyToTest = value as Record<string, unknown>;
  return isSafeCanonicalRef(readyToTest.readyId) &&
    isNonEmptyString(readyToTest.userFacingSummary) &&
    isNonEmptyString(readyToTest.testableSurface) &&
    Array.isArray(readyToTest.verificationRefs) &&
    readyToTest.verificationRefs.every(isSafeCanonicalRef) &&
    Array.isArray(readyToTest.evidenceRefs) &&
    readyToTest.evidenceRefs.every(isSafeCanonicalRef) &&
    readyToTest.metadataOnly === true &&
    readyToTest.rawPayloadRetained === false;
}

function supersededPlanningSource(pathOrUrl: string | null | undefined): string | null {
  if (typeof pathOrUrl !== "string") return null;
  let normalized = pathOrUrl.trim().replace(/\\/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  const markerIndex = normalized.indexOf(PLANNING_SOURCE_MARKER);
  if (markerIndex >= 0) normalized = normalized.slice(markerIndex);
  if (normalized === AUTHORITATIVE_PLANNING_SOURCE_PATH || normalized === CURRENT_OPERATIONAL_ACTION_LOOP_PRD_PATH) return null;
  return normalized.startsWith(PLANNING_SOURCE_MARKER) && normalized.endsWith("/prd.md")
    ? AUTHORITATIVE_PLANNING_SOURCE_PATH
    : null;
}

function projectionSafeLifecycleSummary(summary: string | null | undefined): string {
  const value = (summary || "Metadata-only lifecycle event.").trim();
  if (!value) return "Metadata-only lifecycle event.";
  if (UNSAFE_LIFECYCLE_TEXT_RE.test(value)) return "Redacted metadata-only lifecycle summary.";
  return value.slice(0, 500);
}

function projectionSafeLifecycleRefs(refs: string[]): string[] {
  return refs.flatMap((ref) => {
    const value = ref.trim();
    return value.length > 0 && value.length <= 500 && !UNSAFE_LIFECYCLE_TEXT_RE.test(value) ? [value] : [];
  });
}

function legacyStage(stage: AuthoritativeWorkPacketLifecycleView["currentStage"]): WorkPacketV0View["currentStage"] {
  return stage === "needs_approval" ? "human_gate" : stage;
}

function legacyOwner(
  stage: AuthoritativeWorkPacketLifecycleView["currentStage"],
  status: AuthoritativeWorkPacketLifecycleView["status"],
): WorkPacketV0View["currentOwner"] {
  if (status === "blocked" || status === "failed") return "blocked";
  return stage === "needs_approval" ? "operator" : "kendall";
}

function isSetValue(value: unknown, values: ReadonlySet<string>): value is string {
  return typeof value === "string" && values.has(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isSafeCanonicalRef(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const normalized = value.trim().toLowerCase();
  return !normalized.startsWith("fixture:") && !normalized.startsWith("demo:");
}

function canonicalPackets(value: unknown): DashboardCanonicalWorkPacketV1[] {
  if (!Array.isArray(value)) {
    throw new Error("Canonical WorkPacket response is not a collection.");
  }
  if (!value.every((packet) => isAuthoritativeWorkPacketLifecycleView(packet))) {
    throw new Error("Canonical WorkPacket response is not authoritative lifecycle-shaped.");
  }
  const packets = value.map(canonicalDetailPacket);
  if (new Set(packets.map((packet) => packet.authoritativeLifecycle.packetId)).size !== packets.length) {
    throw new Error("Canonical WorkPacket response authoritative projection failed validation.");
  }
  return packets;
}

export async function getWorkPacket(packetId: string, options?: SupervisorReadOptions): Promise<DashboardCanonicalWorkPacketV1> {
  const canonicalPath = `/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`;
  return canonicalDetailPacket(await requestJson<unknown>(canonicalPath, options));
}

export async function getWorkPacketForWorkItem(workItemId: string, options?: SupervisorReadOptions): Promise<DashboardCanonicalWorkPacketV1 | null> {
  const canonicalPath = `/pipeline-control-plane/work-items/${encodeURIComponent(workItemId)}/packet`;
  try {
    return canonicalDetailPacket(await requestJson<unknown>(canonicalPath, options));
  } catch (error) {
    if (isCanonicalWorkItemPacketUnavailable(error)) return null;
    throw error;
  }
}

export async function getWorkItemMemoryReview(workItemId: string, options?: SupervisorReadOptions): Promise<DashboardCanonicalWorkItemMemoryReviewV1 | null> {
  const path = `/pipeline-control-plane/work-items/${encodeURIComponent(workItemId)}/memory-review`;
  try {
    const review = canonicalWorkItemMemoryReview(await requestJson<unknown>(path, options));
    if (review.workItemId !== workItemId) throw new Error("WorkItem memory review identity does not bind its requested WorkItem.");
    return review;
  } catch (error) {
    if (isCanonicalWorkItemMemoryReviewUnavailable(error)) return null;
    throw error;
  }
}

function canonicalWorkItemMemoryReview(value: unknown): DashboardCanonicalWorkItemMemoryReviewV1 {
  const review = canonicalMemoryReviewRecord(value, [
    "schemaVersion", "workItemId", "authoritativePacketId", "proposals", "llmWikiReadiness",
    "metadataOnly", "rawPayloadRetained", "canonicalMutationAllowed", "sourceMutationAllowed",
  ]);
  if (review.schemaVersion !== "work-item-memory-review/v1" || !isNonEmptyString(review.workItemId) ||
    !isOptionalString(review.authoritativePacketId) || !Array.isArray(review.proposals) ||
    review.metadataOnly !== true || review.rawPayloadRetained !== false ||
    review.canonicalMutationAllowed !== false || review.sourceMutationAllowed !== false) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return {
    schemaVersion: review.schemaVersion,
    workItemId: review.workItemId,
    authoritativePacketId: review.authoritativePacketId ?? null,
    proposals: review.proposals.map(canonicalMemoryProposal),
    llmWikiReadiness: review.llmWikiReadiness == null ? null : canonicalMemoryReadiness(review.llmWikiReadiness),
    metadataOnly: true,
    rawPayloadRetained: false,
    canonicalMutationAllowed: false,
    sourceMutationAllowed: false,
  };
}

function canonicalMemoryReviewRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Canonical WorkItem memory review is malformed.");
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return record;
}

function canonicalMemoryStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) throw new Error("Canonical WorkItem memory review is malformed.");
  return [...value];
}

const MEMORY_PROPOSAL_ENUMS = {
  status: new Set(["not_applicable", "proposed", "pending_human_approval", "approved", "rejected", "deferred", "edit_needed", "blocked", "stale", "contradictory"]),
  proposalType: new Set(["new_note", "append_note", "link_notes", "tag_update", "decision_record", "error_book_entry", "user_facing_documentation"]),
  sensitivity: new Set(["low", "medium", "high"]),
  freshness: new Set(["fresh", "stale", "conflicting", "unknown"]),
  contradictionStatus: new Set(["none", "possible", "confirmed"]),
  confidence: new Set(["low", "medium", "high"]),
  operatorAction: new Set(["approve", "edit", "reject", "defer", "blocked"]),
  writeBackStatus: new Set(["not_started", "blocked", "review_gated", "approved_for_future", "deferred"]),
} as const;

function canonicalMemoryProposal(value: unknown): DashboardCanonicalMemoryProposalV1 {
  const proposal = canonicalMemoryReviewRecord(value, [
    "proposalRouteId", "proposalId", "revision", "label", "status", "summary", "sourceRefs", "evidenceRefs", "targetVaultPath",
    "targetVaultFolder", "proposalType", "suggestedContentSummary", "patchSummary", "sensitivity", "aiDraftEligible", "llmWikiArtifactSearchEligible",
    "freshness", "contradictionStatus", "confidence", "operatorAction", "decisionNeededContext",
    "backupRecoveryPath", "writeBackStatus", "writeBackAllowed",
  ]);
  const requiredStrings = [
    "proposalRouteId", "proposalId", "label", "status", "summary", "targetVaultFolder", "proposalType",
    "suggestedContentSummary", "sensitivity", "freshness", "contradictionStatus", "confidence",
    "operatorAction", "backupRecoveryPath", "writeBackStatus",
  ];
  if (!requiredStrings.every((key) => typeof proposal[key] === "string") || !/^[A-Za-z0-9_-]+$/.test(proposal.proposalRouteId as string) || !Number.isSafeInteger(proposal.revision) || (proposal.revision as number) < 1 ||
    !isOptionalString(proposal.targetVaultPath) || !isOptionalString(proposal.patchSummary) ||
    !isOptionalString(proposal.decisionNeededContext) || (proposal.aiDraftEligible !== undefined && typeof proposal.aiDraftEligible !== "boolean") ||
    (proposal.llmWikiArtifactSearchEligible !== undefined && typeof proposal.llmWikiArtifactSearchEligible !== "boolean") || proposal.writeBackAllowed !== false) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  if (!Object.entries(MEMORY_PROPOSAL_ENUMS).every(([key, values]) => isSetValue(proposal[key], values))) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return {
    proposalRouteId: proposal.proposalRouteId as string, proposalId: proposal.proposalId as string, revision: proposal.revision as number, label: proposal.label as string, status: proposal.status as string,
    summary: proposal.summary as string, sourceRefs: canonicalMemoryStringArray(proposal.sourceRefs),
    evidenceRefs: canonicalMemoryStringArray(proposal.evidenceRefs), targetVaultPath: proposal.targetVaultPath ?? null,
    targetVaultFolder: proposal.targetVaultFolder as string, proposalType: proposal.proposalType as string, aiDraftEligible: proposal.aiDraftEligible === true,
    llmWikiArtifactSearchEligible: proposal.llmWikiArtifactSearchEligible === true,
    suggestedContentSummary: proposal.suggestedContentSummary as string, patchSummary: proposal.patchSummary ?? null,
    sensitivity: proposal.sensitivity as string, freshness: proposal.freshness as string,
    contradictionStatus: proposal.contradictionStatus as string, confidence: proposal.confidence as string,
    operatorAction: proposal.operatorAction as string, decisionNeededContext: proposal.decisionNeededContext ?? null,
    backupRecoveryPath: proposal.backupRecoveryPath as string, writeBackStatus: proposal.writeBackStatus as string,
    writeBackAllowed: false,
  };
}

function canonicalMemoryReadiness(value: unknown): DashboardCanonicalWorkItemMemoryReviewV1["llmWikiReadiness"] {
  const readiness = canonicalMemoryReviewRecord(value, [
    "decisionState", "canonicality", "allowedInputs", "blockedReasons", "nextActions", "boundarySummary",
    "rebuildPreview", "rebuildDryRunPlan", "durableWriteAllowed",
  ]);
  if (!isSetValue(readiness.decisionState, new Set(["ready", "blocked", "not_configured"])) ||
    readiness.canonicality !== "derived_disposable_rebuildable" || !isNonEmptyString(readiness.boundarySummary) ||
    readiness.durableWriteAllowed !== false) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return {
    decisionState: readiness.decisionState as "ready" | "blocked" | "not_configured",
    canonicality: "derived_disposable_rebuildable",
    allowedInputs: canonicalMemoryStringArray(readiness.allowedInputs),
    blockedReasons: canonicalMemoryStringArray(readiness.blockedReasons),
    nextActions: canonicalMemoryStringArray(readiness.nextActions),
    boundarySummary: readiness.boundarySummary as string,
    rebuildPreview: readiness.rebuildPreview == null ? null : canonicalMemoryPreview(readiness.rebuildPreview),
    rebuildDryRunPlan: readiness.rebuildDryRunPlan == null ? null : canonicalMemoryDryRunPlan(readiness.rebuildDryRunPlan),
    durableWriteAllowed: false,
  };
}

function canonicalMemoryPreview(value: unknown): NonNullable<DashboardCanonicalWorkItemMemoryReviewV1["llmWikiReadiness"]>["rebuildPreview"] {
  const preview = canonicalMemoryReviewRecord(value, ["previewId", "inputRefs", "memoryProposalRefs", "plannedOutputScope", "retentionClass", "stopLine"]);
  if (!isNonEmptyString(preview.previewId) || !isNonEmptyString(preview.plannedOutputScope) ||
    !isNonEmptyString(preview.stopLine) || preview.retentionClass !== "metadata_only") {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return { previewId: preview.previewId, inputRefs: canonicalMemoryStringArray(preview.inputRefs), memoryProposalRefs: canonicalMemoryStringArray(preview.memoryProposalRefs), plannedOutputScope: preview.plannedOutputScope, retentionClass: "metadata_only", stopLine: preview.stopLine };
}

function canonicalMemoryDryRunPlan(value: unknown): NonNullable<DashboardCanonicalWorkItemMemoryReviewV1["llmWikiReadiness"]>["rebuildDryRunPlan"] {
  const plan = canonicalMemoryReviewRecord(value, ["planId", "inputRefs", "plannedDerivedSections", "disposableTargetNamespace", "retentionClass", "stopLines", "discardRecoveryPath", "writePerformed"]);
  if (!isNonEmptyString(plan.planId) || !isNonEmptyString(plan.disposableTargetNamespace) ||
    !isNonEmptyString(plan.discardRecoveryPath) || plan.retentionClass !== "metadata_only" || plan.writePerformed !== false) {
    throw new Error("Canonical WorkItem memory review is malformed.");
  }
  return { planId: plan.planId, inputRefs: canonicalMemoryStringArray(plan.inputRefs), plannedDerivedSections: canonicalMemoryStringArray(plan.plannedDerivedSections), disposableTargetNamespace: plan.disposableTargetNamespace, retentionClass: "metadata_only", stopLines: canonicalMemoryStringArray(plan.stopLines), discardRecoveryPath: plan.discardRecoveryPath, writePerformed: false };
}

export async function getWorkPackets(): Promise<DashboardCanonicalWorkPacketV1[]> {
  return canonicalPackets(await requestJson<unknown>("/pipeline-control-plane/work-packets"));
}

function isCanonicalWorkItemPacketUnavailable(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : null;
  return message !== null && (
    /\/pipeline-control-plane\/work-items\/[^/]+\/(?:packet|memory-review) \(404\)$/.test(message) ||
    message.startsWith("Canonical WorkPacket")
  );
}

function isCanonicalWorkItemMemoryReviewUnavailable(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : null;
  return message !== null && (
    /\/pipeline-control-plane\/work-items\/[^/]+\/memory-review \(404\)$/.test(message) ||
    message === "Canonical WorkItem memory review is malformed."
  );
}

export async function getPipelineDashboardProjection(): Promise<PipelineDashboardProjectionV0> {
  const projection = normalizePipelineDashboardProjection(
    await requestJson<Partial<PipelineDashboardProjectionV0>>("/pipeline-control-plane/projection"),
  );
  if (!isPipelineDashboardProjection(projection)) {
    throw new Error("Invalid projection payload");
  }
  return projection;
}

/**
 * The normal cockpit read uses this separately versioned supervisor boundary.
 * The V0 endpoint remains available only for the explicitly inventoried
 * compatibility consumers while their source-zero retirement proof is pending.
 */
export async function getDashboardCanonicalOperationalProjection(): Promise<DashboardCanonicalOperationalProjectionV1> {
  const projection = await requestJson<unknown>("/pipeline-control-plane/canonical-operational-projection");
  if (!isDashboardCanonicalOperationalProjection(projection)) {
    throw new Error("Invalid canonical operational projection payload");
  }
  return projection;
}

function isDashboardCanonicalOperationalProjection(value: unknown): value is DashboardCanonicalOperationalProjectionV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const projection = value as Record<string, unknown>;
  const allowed = new Set([
    "schemaVersion", "projectionId", "generatedAt", "sourceUpdatedAt", "sourceLabel", "freshnessState", "staleAfterSeconds",
    "backendReachability", "fixtureMode", "truthSummary", "stageSummaries", "sourceStates", "workPackets", "selectedPacketDetails",
    "managerSummary", "activeManagerLaneClarity", "coordinationHealth", "workerSummary", "reliabilityProblems", "gatedControls",
    "runtimeReadiness", "actionCapabilities", "actionCapabilitiesV1", "executeAdmission", "queueSummary", "evidenceRefs",
  ]);
  return projection.schemaVersion === "dashboard-canonical-operational-projection/v1"
    && Object.keys(projection).every((key) => allowed.has(key))
    && typeof projection.projectionId === "string"
    && typeof projection.generatedAt === "string"
    && typeof projection.sourceUpdatedAt === "string"
    && Array.isArray(projection.workPackets)
    && Array.isArray(projection.selectedPacketDetails)
    && Array.isArray(projection.stageSummaries)
    && Array.isArray(projection.sourceStates)
    && Array.isArray(projection.evidenceRefs)
    && projection.workPackets.every(isCanonicalOperationalWorkPacket)
    && projection.selectedPacketDetails.every(isCanonicalOperationalSelectedDetail)
    && (projection.activeManagerLaneClarity === undefined
      || projection.activeManagerLaneClarity === null
      || isDashboardCanonicalManagerLaneClarity(projection.activeManagerLaneClarity))
    && (projection.coordinationHealth === undefined
      || projection.coordinationHealth === null
      || isDashboardCoordinationHealthInput(projection.coordinationHealth));
}

const CANONICAL_LANE_CLARITY_KEYS = new Set(["goal", "posture", "canonicalState", "nextGate", "criteria"]);
const CANONICAL_LANE_CLARITY_GOAL_KEYS = new Set(["summary", "sourceRef"]);
const CANONICAL_LANE_CLARITY_POSTURE_KEYS = new Set(["state", "reason", "nextSafeAction", "decisionRef", "qualification"]);
const CANONICAL_LANE_CLARITY_STATE_KEYS = new Set(["phase", "freshness", "evidenceFreshness"]);
const CANONICAL_LANE_CLARITY_NEXT_GATE_KEYS = new Set(["summary", "nextSafeAction"]);
const CANONICAL_LANE_CLARITY_CRITERION_KEYS = new Set(["criterionId", "summary", "disposition", "evidenceRefs"]);

/** Validate the compact Lane Clarity client DTO independently from the V0 projection schema. */
export function isDashboardCanonicalManagerLaneClarity(value: unknown): value is DashboardCanonicalManagerLaneClarityV1 {
  if (!hasOnlyKeys(value, CANONICAL_LANE_CLARITY_KEYS)) return false;
  const clarity = value as Record<string, unknown>;
  if (!hasOnlyKeys(clarity.goal, CANONICAL_LANE_CLARITY_GOAL_KEYS) || !hasOnlyKeys(clarity.posture, CANONICAL_LANE_CLARITY_POSTURE_KEYS)
    || !hasOnlyKeys(clarity.canonicalState, CANONICAL_LANE_CLARITY_STATE_KEYS) || !hasOnlyKeys(clarity.nextGate, CANONICAL_LANE_CLARITY_NEXT_GATE_KEYS)
    || !Array.isArray(clarity.criteria) || clarity.criteria.length > 24) return false;
  const goal = clarity.goal as Record<string, unknown>;
  const posture = clarity.posture as Record<string, unknown>;
  const canonicalState = clarity.canonicalState as Record<string, unknown>;
  const nextGate = clarity.nextGate as Record<string, unknown>;
  const assessed = posture.state === "on_scope" || posture.state === "pivot_required";
  return isSafeCanonicalLaneClarityText(goal.summary)
    && isSafeCanonicalLaneClarityRef(goal.sourceRef)
    && (posture.state === "on_scope" || posture.state === "pivot_required" || posture.state === "not_assessed")
    && isSafeCanonicalLaneClarityText(posture.reason)
    && isSafeCanonicalLaneClarityText(posture.nextSafeAction)
    && (posture.decisionRef === null || isSafeCanonicalLaneClarityRef(posture.decisionRef))
    && (posture.qualification === null || (typeof posture.qualification === "string" && CANONICAL_LANE_CLARITY_QUALIFICATIONS.has(posture.qualification)))
    && (assessed ? clarity.criteria.length > 0 : true)
    && (!assessed || (canonicalState.freshness === "fresh" && canonicalState.evidenceFreshness === "fresh"))
    && (posture.state === "pivot_required"
      ? (typeof posture.decisionRef === "string" && typeof posture.qualification === "string")
      : (posture.decisionRef === null && posture.qualification === null))
    && typeof canonicalState.phase === "string" && CANONICAL_LANE_CLARITY_PHASES.has(canonicalState.phase)
    && typeof canonicalState.freshness === "string" && CANONICAL_LANE_CLARITY_FRESHNESS.has(canonicalState.freshness)
    && typeof canonicalState.evidenceFreshness === "string" && CANONICAL_LANE_CLARITY_EVIDENCE_FRESHNESS.has(canonicalState.evidenceFreshness)
    && isSafeCanonicalLaneClarityText(nextGate.summary)
    && isSafeCanonicalLaneClarityText(nextGate.nextSafeAction)
    && clarity.criteria.every(isDashboardCanonicalLaneClarityCriterion);
}

function isDashboardCanonicalLaneClarityCriterion(value: unknown): boolean {
  if (!hasOnlyKeys(value, CANONICAL_LANE_CLARITY_CRITERION_KEYS)) return false;
  const criterion = value as Record<string, unknown>;
  return isSafeCanonicalLaneClarityRef(criterion.criterionId)
    && isSafeCanonicalLaneClarityText(criterion.summary)
    && typeof criterion.disposition === "string" && CANONICAL_LANE_CLARITY_DISPOSITIONS.has(criterion.disposition)
    && Array.isArray(criterion.evidenceRefs) && criterion.evidenceRefs.length > 0 && criterion.evidenceRefs.length <= 20
    && criterion.evidenceRefs.every(isSafeCanonicalLaneClarityRef);
}

function isSafeCanonicalLaneClarityText(value: unknown): value is string {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= 500
    && !LANE_CLARITY_CONTROL_CHARACTER_RE.test(value)
    && !UNSAFE_LIFECYCLE_TEXT_RE.test(value)
    && !UNSAFE_LANE_CLARITY_TEXT_RE.test(value)
    && !TOKEN_LIKE_LANE_CLARITY_VALUE_RE.test(value)
    && !LANE_CLARITY_PEM_OR_HIGH_ENTROPY_RE.test(value);
}

function isSafeCanonicalLaneClarityRef(value: unknown): value is string {
  return typeof value === "string"
    && value.trim() === value
    && value.length > 0
    && value.length <= 255
    && !LANE_CLARITY_CONTROL_CHARACTER_RE.test(value)
    && !UNSAFE_LIFECYCLE_TEXT_RE.test(value)
    // References use the supervisor's metadata-reference contract, not the
    // stricter free-text contract. For example, requirement:token-rotation is
    // an opaque semantic ref, not credential material.
    && (!TOKEN_LIKE_LANE_CLARITY_VALUE_RE.test(value) || MANAGER_SOURCE_LANE_CLARITY_REF_RE.test(value))
    && !LANE_CLARITY_PEM_OR_HIGH_ENTROPY_RE.test(value)
    && (!value.toLowerCase().startsWith("manager-source-") || MANAGER_SOURCE_LANE_CLARITY_REF_RE.test(value))
    && !value.toLowerCase().startsWith("fixture:")
    && !value.toLowerCase().startsWith("demo:");
}

const CANONICAL_OPERATIONAL_WORK_PACKET_KEYS = new Set([
  "packetId", "title", "currentStage", "status", "truthLabel", "sourceRef", "canonicalContract", "productModeMapping",
  "blocker", "nextAction", "unblocker", "readyToTest", "evidenceRefs", "workItemId", "queueLease", "executionAttempts",
  "correlationIds", "updatedAt", "metadataOnly",
]);

const CANONICAL_OPERATIONAL_SELECTED_DETAIL_KEYS = new Set([
  "packetId", "sourceRefs", "canonicalContract", "productModeMapping", "evidenceRefs", "currentStage", "status", "truthLabel",
  "blocker", "nextAction", "unblocker", "readyToTest", "latestTransitionEventRef", "recentTransitionEventRefs", "latestMovementSummary",
  "canSatisfyLiveMovementProof", "parentPacketId", "lineageKind", "operatorTestState", "operatorTestNote", "actionCapabilities",
  "actionCapabilitiesV1", "actionResults", "reviewRoute", "workGraph", "workItemId", "queueLease", "executionAttempts",
  "correlationIds", "metadataOnly",
]);

function hasOnlyKeys(value: unknown, allowed: ReadonlySet<string>): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowed.has(key));
}

function isCanonicalOperationalWorkPacket(value: unknown): boolean {
  return hasOnlyKeys(value, CANONICAL_OPERATIONAL_WORK_PACKET_KEYS)
    && typeof value.packetId === "string"
    && value.canonicalContract === null
    && value.productModeMapping === null
    && Array.isArray(value.evidenceRefs);
}

function isCanonicalOperationalSelectedDetail(value: unknown): boolean {
  return hasOnlyKeys(value, CANONICAL_OPERATIONAL_SELECTED_DETAIL_KEYS)
    && typeof value.packetId === "string"
    && value.canonicalContract === null
    && value.productModeMapping === null
    && Array.isArray(value.sourceRefs)
    && Array.isArray(value.evidenceRefs);
}
