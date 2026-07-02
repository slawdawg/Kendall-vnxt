import type {
  AuthoritativePacketActor,
  AuthoritativePacketLifecycleEvent,
  AuthoritativePacketSourceRef,
  AuthoritativePacketStage,
  AuthoritativePacketStatus,
  AuthoritativePacketTruthLabel,
} from "@kendall/contracts";

export const AUTHORITATIVE_STAGE_SEQUENCE: readonly AuthoritativePacketStage[] = [
  "capture",
  "classify",
  "route",
  "shape",
  "needs_approval",
  "execute",
  "review",
  "promote",
  "deliver",
  "learn",
];

export const LEGACY_TO_AUTHORITATIVE_STAGE = {
  human_gate: "needs_approval",
} as const;

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
  return AUTHORITATIVE_STAGE_SEQUENCE.includes(value as AuthoritativePacketStage);
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
    evidenceRefs: [...(input.evidenceRefs ?? [])],
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
    evidenceRefs: [...(input.evidenceRefs ?? [])],
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
  if (/\b(raw[\s_-]*(?:prompt|completion)|reasoning[\s_-]*trace|provider[\s_-]*payload|secret|credential)\b/i.test(summary)) {
    throw new Error("Lifecycle event summaries must not retain raw prompt, provider, or secret payloads.");
  }
  return summary.slice(0, 500);
}
