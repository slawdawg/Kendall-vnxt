import {
  AUTHORITATIVE_PACKET_STAGES,
  isKnownAuthoritativePacketStage,
  type AuthoritativePacketActor,
  type AuthoritativePacketLifecycleEvent,
  type AuthoritativePacketSourceRef,
  type AuthoritativePacketStage,
  type AuthoritativePacketStatus,
  type AuthoritativePacketTruthLabel,
} from "@kendall/contracts";

export {
  AUTHORITATIVE_PACKET_STAGES,
  AUTHORITATIVE_PACKET_STATUSES,
  AUTHORITATIVE_PACKET_CLOSED_STATUSES,
  AUTHORITATIVE_PACKET_DISPATCHABLE_STAGES,
  AUTHORITATIVE_PACKET_DISPATCHABLE_STATUSES,
  AUTHORITATIVE_PACKET_LIVE_PROGRESS_STAGES,
  AUTHORITATIVE_PACKET_LIVE_PROGRESS_STATUSES,
  AUTHORITATIVE_PACKET_STAGE_PRD_SEMANTICS,
  PIPELINE_LIFECYCLE_STAGE_TO_AUTHORITATIVE,
  isClosedAuthoritativePacketStatus,
  isDispatchableAuthoritativePacketState,
  isKnownAuthoritativePacketStage,
  isKnownAuthoritativePacketStatus,
  isLiveProgressAuthoritativePacketState,
  type AuthoritativePacketStateLike,
  type PipelineLifecycleStageResolutionV0,
  type PipelineLifecycleStageSemanticV0,
} from "@kendall/contracts";

export const AUTHORITATIVE_STAGE_SEQUENCE: readonly AuthoritativePacketStage[] = AUTHORITATIVE_PACKET_STAGES;

export const LEGACY_TO_AUTHORITATIVE_STAGE = {
  human_gate: "needs_approval",
} as const;

const FORBIDDEN_LIFECYCLE_TEXT =
  /\b(?:raw[\s_-]*(?:prompts?|completions?|transcripts?)|reasoning[\s_-]*traces?|provider[\s_-]*payloads?|secrets?(?:[\s_-]*(?:key|token|value|id))?|credentials?(?:[\s_-]*(?:key|token|value|id))?|(?:terminal|tmux|pane)[\s_-]*scrollbacks?)\b/i;

export interface CreateLifecycleEventInput {
  packetId: string;
  targetStage?: AuthoritativePacketStage;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  eventId: string;
  occurredAt: string;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey?: string | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export interface TransitionLifecycleEventInput {
  packetId: string;
  previousStage: AuthoritativePacketStage;
  targetStage: AuthoritativePacketStage;
  status?: AuthoritativePacketStatus;
  truthLabel?: AuthoritativePacketTruthLabel;
  sourceRef: AuthoritativePacketSourceRef;
  actor: AuthoritativePacketActor;
  eventId: string;
  occurredAt: string;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey?: string | null;
  payloadSummary?: string;
  evidenceRefs?: string[];
}

export function isAuthoritativePacketStage(value: string): value is AuthoritativePacketStage {
  return isKnownAuthoritativePacketStage(value);
}

export function createWorkPacketCreatedEvent(input: CreateLifecycleEventInput): AuthoritativePacketLifecycleEvent {
  const targetStage = input.targetStage ?? "capture";
  assertStage(targetStage);
  assertMetadataSource(input.sourceRef);

  return {
    eventId: input.eventId,
    packetId: input.packetId,
    schemaVersion: 1,
    eventType: "packet.created",
    previousStage: null,
    targetStage,
    status: input.status ?? "waiting",
    truthLabel: input.truthLabel ?? "source_owned",
    sourceRef: input.sourceRef,
    actor: input.actor,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    payloadSummary: safeSummary(input.payloadSummary),
    evidenceRefs: safeEvidenceRefs(input.evidenceRefs),
    metadataOnly: true,
  };
}

export function createWorkPacketTransitionEvent(input: TransitionLifecycleEventInput): AuthoritativePacketLifecycleEvent {
  assertStage(input.previousStage);
  assertStage(input.targetStage);
  assertMetadataSource(input.sourceRef);

  return {
    eventId: input.eventId,
    packetId: input.packetId,
    schemaVersion: 1,
    eventType: "packet.stage_transitioned",
    previousStage: input.previousStage,
    targetStage: input.targetStage,
    status: input.status ?? "active",
    truthLabel: input.truthLabel ?? "source_owned",
    sourceRef: input.sourceRef,
    actor: input.actor,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId ?? null,
    causationId: input.causationId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    payloadSummary: safeSummary(input.payloadSummary),
    evidenceRefs: safeEvidenceRefs(input.evidenceRefs),
    metadataOnly: true,
  };
}

function assertStage(stage: AuthoritativePacketStage): void {
  if (!isAuthoritativePacketStage(stage)) {
    throw new Error(`Unknown authoritative packet stage: ${stage}`);
  }
}

function assertMetadataSource(sourceRef: AuthoritativePacketSourceRef): void {
  if (!sourceRef.refId || !sourceRef.sourceType) {
    throw new Error("Authoritative WorkPacket lifecycle requires a metadata source ref.");
  }
}

function safeSummary(value: string | undefined): string {
  const summary = (value ?? "Metadata-only lifecycle event.").trim();
  if (!summary) {
    return "Metadata-only lifecycle event.";
  }
  if (FORBIDDEN_LIFECYCLE_TEXT.test(summary)) {
    throw new Error("Lifecycle event summaries must not retain raw prompt, provider, or secret payloads.");
  }
  return summary.slice(0, 500);
}

function safeEvidenceRefs(value: string[] | undefined): string[] {
  return (value ?? []).map((ref) => {
    if (typeof ref !== "string") {
      throw new Error("Lifecycle event evidence refs must be strings.");
    }
    const safeRef = ref.trim();
    if (!safeRef) {
      throw new Error("Lifecycle event evidence refs must not be blank.");
    }
    if (FORBIDDEN_LIFECYCLE_TEXT.test(safeRef)) {
      throw new Error("Lifecycle event evidence refs must not retain raw prompt, provider, or secret payloads.");
    }
    return safeRef;
  });
}
