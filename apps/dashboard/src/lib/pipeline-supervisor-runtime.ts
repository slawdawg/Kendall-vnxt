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
import {
  isPipelineDashboardProjection,
  normalizePipelineDashboardProjection,
} from "./pipeline-supervisor-projection";
import { isWorkPacketV0View } from "./pipeline-supervisor-projector";
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
  compatibilityProjection: WorkPacketV0View;
};

function canonicalDetailPacket(value: unknown): DashboardCanonicalWorkPacketV1 {
  if (!isAuthoritativeWorkPacketLifecycleView(value)) {
    throw new Error("Canonical WorkPacket detail response is not authoritative lifecycle-shaped.");
  }
  const payload = value as CanonicalSupervisorPacketPayload;
  const compatibilityProjection = projectAuthoritativeWorkPacket(payload);
  if (!isWorkPacketV0View(compatibilityProjection)) {
    throw new Error("Canonical authoritative WorkPacket detail projection failed validation.");
  }
  const canonicalContract = nullableCanonicalExtension(payload.canonicalContract, isPipelineCanonicalContractV1, "canonicalContract");
  const evidenceChain = nullableEvidenceChainExtension(payload.evidenceChain, payload.packetId);
  const productModeMapping = nullableCanonicalExtension(payload.productModeMapping, isPipelineProductModeMappingV0, "productModeMapping");
  validateCanonicalExtensionBindings(payload, canonicalContract, evidenceChain, productModeMapping);
  return {
    authoritativeLifecycle: payload,
    canonicalContract,
    evidenceChain,
    productModeMapping,
    compatibilityProjection,
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

function projectAuthoritativeWorkPacket(packet: AuthoritativeWorkPacketLifecycleView): WorkPacketV0View {
  const stage = legacyStage(packet.currentStage);
  const owner = legacyOwner(packet.currentStage, packet.status);
  const currentEvent = packet.history.find((event) => event.eventId === packet.currentEventId)!;
  const supersededBy = supersededPlanningSource(packet.sourceRef.pathOrUrl);
  const sourceType = packet.sourceRef.sourceType === "prd" || packet.sourceRef.sourceType === "bmad_story" ? "bmad_artifact" as const : "manual" as const;
  const sourceRef: WorkPacketV0View["sourceRefs"][number] = supersededBy === null
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
    durable: true,
    sourceEventId: null,
    actorLabel: event.actor.actorLabel || event.actor.actorId || event.actor.actorType,
  }));
  return {
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
    candidateWork: null,
    workItem: null,
    taskPacket: null,
    routingPreview: null,
    routeSummary: null,
    executionAttempts: [],
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
    artifactRefs: [],
    humanGateActions: [],
    humanGateActionRequests: [],
    laneCards: [],
    memoryProposals: [],
    deliveryEvidence: null,
    learnOutcome: null,
    learnRefill: null,
    alphaMemorySourceStatus: null,
    gateStateValidation: null,
    loopStopStates: [],
    reviewSummaries: [],
    recoveryActions: [],
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

function isOptionalString(value: unknown): boolean {
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
    /\/pipeline-control-plane\/work-items\/[^/]+\/packet \(404\)$/.test(message) ||
    message.startsWith("Canonical WorkPacket")
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
