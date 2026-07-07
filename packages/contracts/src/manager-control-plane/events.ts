import type {
  EvidenceRefId,
  ManagerCausationId,
  ManagerCorrelationId,
  ManagerEventId,
  ManagerIdempotencyKey,
  ManagerRunId
} from "./ids";

export const MANAGER_CONTROL_PLANE_EVENT_NAMES = [
  "dispatcher.work.queued",
  "dispatcher.lease.claimed",
  "dispatcher.lease.heartbeat",
  "dispatcher.lease.expired",
  "dispatcher.attempt.completed",
  "dispatcher.attempt.failed",
  "dispatcher.refill.started",
  "dispatcher.refill.completed",
  "dispatcher.authority.blocked",
  "dispatcher.candidate.blocked",
  "dispatcher.review.required",
  "dispatcher.summary.updated",
  "dispatcher.summary.stale",
  "dispatcher.progress.observed",
  "dispatcher.policy.blocked_action",
  "dispatcher.recovery.attempted",
  "dispatcher.work_supply.empty",
  "manager.run.started",
  "manager.run.steered",
  "manager.ledger.appended",
  "manager.question.recorded",
  "manager.checkpoint.recorded",
  "manager.resource.snapshot",
  "manager.usage.snapshot",
  "manager.blocker.recorded",
  "manager.recovery.blocked",
  "manager.replay.summarized"
] as const;

export type ManagerControlPlaneEventName = (typeof MANAGER_CONTROL_PLANE_EVENT_NAMES)[number];

export type ManagerActorType = "manager" | "dispatcher" | "worker" | "operator" | "system";
export type ManagerRedactionBoundary = "metadata_only" | "summary_only" | "fixture_only";
export type ManagerProjectionBehavior = "updates_summary" | "records_evidence" | "blocks_action" | "no_projection";
export const MANAGER_CONTROL_PLANE_EVENT_SCHEMA_VERSION = "manager_control_plane_event.v1" as const;

export interface ManagerControlPlaneEvent {
  eventId: ManagerEventId;
  schemaVersion: typeof MANAGER_CONTROL_PLANE_EVENT_SCHEMA_VERSION;
  eventName: ManagerControlPlaneEventName;
  runId: ManagerRunId;
  actorType: ManagerActorType;
  actorId: string;
  occurredAt: string;
  correlationId: ManagerCorrelationId;
  causationId?: ManagerCausationId | null;
  idempotencyKey: ManagerIdempotencyKey;
  redactionBoundary: ManagerRedactionBoundary;
  projectionBehavior: ManagerProjectionBehavior;
  evidenceRefs: readonly EvidenceRefId[];
  payloadSummary: string;
}
