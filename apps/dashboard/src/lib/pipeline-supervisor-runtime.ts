import type {
  AuthoritativeWorkPacketLifecycleView,
  PipelineDashboardProjectionV0,
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

function requestLegacyJson<T>(path: string, options: SupervisorReadOptions = {}): Promise<T> {
  return requestJson<T>(path, options);
}

const SAFE_PACKET_ID = /^[A-Za-z0-9._:%-]+$/;
const LEGACY_PACKET_ID = /^(?:work_item|candidate_work):[A-Za-z0-9._:%-]+$/;
const AUTHORITATIVE_STAGES = new Set(["capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]);
const AUTHORITATIVE_STATUSES = new Set(["active", "waiting", "blocked", "failed", "complete", "deferred"]);
const AUTHORITATIVE_TRUTH_LABELS = new Set(["source_owned", "derived_projection", "operator_asserted"]);
const AUTHORITATIVE_SOURCE_TYPES = new Set(["prd", "bmad_story", "operator_input", "workflow", "repo_doc"]);
const AUTHORITATIVE_ACTOR_TYPES = new Set(["system", "operator", "manager", "worker"]);
const AUTHORITATIVE_EVENT_TYPES = new Set([
  "packet.created",
  "packet.stage_transitioned",
  "packet.operational_action_applied",
  "packet.parallel_work_graph_refreshed",
]);

function isCanonicalShapeError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.startsWith("Canonical WorkPacket response"));
}

function canonicalDetailPacket(value: unknown): WorkPacketV0View {
  if (!isAuthoritativeWorkPacketLifecycleView(value)) {
    throw new Error("Canonical WorkPacket detail response is not authoritative lifecycle-shaped.");
  }
  const packet = projectAuthoritativeWorkPacket(value);
  if (!isWorkPacketV0View(packet)) {
    throw new Error("Canonical authoritative WorkPacket detail projection failed validation.");
  }
  return packet;
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
  const sourceRef = {
    refId: packet.sourceRef.refId,
    sourceType: packet.sourceRef.sourceType === "prd" || packet.sourceRef.sourceType === "bmad_story" ? "bmad_artifact" as const : "manual" as const,
    label: packet.sourceRef.title || packet.sourceRef.refId,
    pathOrUrl: packet.sourceRef.pathOrUrl ?? null,
    freshness: "unknown" as const,
    accessState: "allowed" as const,
    canonical: true,
    summaryOnly: true,
    blockedReason: null,
  };
  const eventRefs = packet.history.map((event) => `event:${event.eventId}`);
  const suppliedEvidenceRefs = packet.history.flatMap((event) => event.evidenceRefs);
  const readyToTestEvidenceRefs = packet.readyToTest?.evidenceRefs ?? [];
  const evidenceRefs = [...new Set([...eventRefs, ...suppliedEvidenceRefs, ...readyToTestEvidenceRefs])];
  const transitionEvents = packet.history.map((event) => ({
    eventId: event.eventId,
    eventType: event.eventType,
    summary: event.payloadSummary,
    createdAt: event.occurredAt,
    sourceStage: event.previousStage == null ? null : legacyStage(event.previousStage),
    targetStage: legacyStage(event.targetStage),
    sourceOwner: event.previousStage == null ? null : legacyOwner(event.previousStage, "active"),
    targetOwner: legacyOwner(event.targetStage, event.status),
    sourceStatus: null,
    targetStatus: event.status,
    reasonCodes: ["supervisor.authoritative_lifecycle_event", `supervisor.truth.${event.truthLabel}`],
    evidenceRefs: [...new Set([`event:${event.eventId}`, ...event.evidenceRefs])],
    durable: true,
    sourceEventId: null,
    actorLabel: event.actor.actorLabel || event.actor.actorId || event.actor.actorType,
  }));
  return {
    packetId: packet.packetId,
    title: packet.title,
    requestedOutcome: currentEvent.payloadSummary,
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
  const actor = event.actor as Record<string, unknown> | null;
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
    isSetValue(actor.actorType, AUTHORITATIVE_ACTOR_TYPES) &&
    isOptionalString(actor.actorId) &&
    isOptionalString(actor.actorLabel) &&
    isDateString(event.occurredAt) &&
    isNonEmptyString(event.payloadSummary) &&
    Array.isArray(event.evidenceRefs) &&
    event.evidenceRefs.every(isSafeCanonicalRef) &&
    event.metadataOnly === true;
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

type CanonicalPacketCollection =
  | { kind: "authoritative"; packets: WorkPacketV0View[] }
  | { kind: "legacy"; packets: WorkPacketV0View[] };

function canonicalPackets(value: unknown): CanonicalPacketCollection {
  if (!Array.isArray(value)) {
    throw new Error("Canonical WorkPacket response is not a collection.");
  }
  if (value.length > 0 && value.every((packet) => isAuthoritativeWorkPacketLifecycleView(packet))) {
    const packets = value.map((packet) => projectAuthoritativeWorkPacket(packet));
    if (packets.some((packet) => !isWorkPacketV0View(packet)) || new Set(packets.map((packet) => packet.packetId)).size !== packets.length) {
      throw new Error("Canonical WorkPacket response authoritative projection failed validation.");
    }
    return { kind: "authoritative", packets };
  }
  if (value.some((packet) => isAuthoritativeWorkPacketLifecycleView(packet)) || value.some((packet) => !isWorkPacketV0View(packet))) {
    throw new Error("Canonical WorkPacket response is not WorkPacketV0-shaped.");
  }
  return { kind: "legacy", packets: value };
}

function mergeWorkPackets(canonical: WorkPacketV0View[], legacy: WorkPacketV0View[]): WorkPacketV0View[] {
  const merged = new Map<string, WorkPacketV0View>();
  for (const packet of legacy) merged.set(packet.packetId, packet);
  for (const packet of canonical) merged.set(packet.packetId, packet);
  return [...merged.values()];
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "message" in error && typeof error.message === "string" && /\(404\)$/.test(error.message));
}

export async function getWorkPacket(packetId: string, options?: SupervisorReadOptions): Promise<WorkPacketV0View> {
  const canonicalPath = `/pipeline-control-plane/work-packets/${encodeURIComponent(packetId)}`;
  const legacyPath = `/work-packets/${encodeURIComponent(packetId)}`;
  try {
    return canonicalDetailPacket(await requestJson<unknown>(canonicalPath, options));
  } catch (error) {
    if (!isNotFoundError(error) || typeof packetId !== "string" || !SAFE_PACKET_ID.test(packetId) || !LEGACY_PACKET_ID.test(packetId)) throw error;
    return requestLegacyJson<WorkPacketV0View>(legacyPath, options);
  }
}

export async function getWorkPackets(): Promise<WorkPacketV0View[]> {
  let canonical: CanonicalPacketCollection;
  try {
    canonical = canonicalPackets(await requestJson<unknown>("/pipeline-control-plane/work-packets"));
  } catch (error) {
    if (!isNotFoundError(error) && !isCanonicalShapeError(error)) throw error;
    return requestLegacyJson<WorkPacketV0View[]>("/work-packets");
  }
  if (canonical.kind === "authoritative") return canonical.packets;
  try {
    const legacy = await requestLegacyJson<WorkPacketV0View[]>("/work-packets");
    return mergeWorkPackets(canonical.packets, legacy);
  } catch (error) {
    if (isNotFoundError(error)) return canonical.packets;
    throw error;
  }
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
