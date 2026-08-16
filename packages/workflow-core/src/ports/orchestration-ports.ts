import type { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock, ManagerLifecycleResult } from "../manager-control-plane";
import type { RuntimePortDescriptor, RuntimePortMode } from "./runtime-ports";

/**
 * The only information an orchestration engine may retain about Kendall work.
 * Kendall remains the product-truth boundary; this descriptor does not grant
 * execution, delivery, or cleanup authority.
 */
export interface OrchestrationPortDescriptor extends RuntimePortDescriptor {
  kind: "lifecycle_evidence" | "workspace_execution";
  productTruthBoundary: "kendall_product_truth";
  stateRetention: "kendall_manager_metadata_only";
  toolNativeStateRetained: false;
  nativeQueueStateRetained: false;
  nativeWorkflowStateRetained: false;
  lifecycleTransitionAuthorityRetained: false;
  deliveryAuthorityRetained: false;
  cleanupAuthorityRetained: false;
  rawPayloadRetained: false;
}

export type LifecycleEvidenceOperation = "read" | "record";

export interface LifecycleEvidenceReadInput {
  workItemId: ManagerControlPlane.WorkItemId;
  attemptId?: ManagerControlPlane.ExecutionAttemptId | null;
  operation: "read";
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface LifecycleEvidenceRecordInput {
  workItemId: ManagerControlPlane.WorkItemId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  operation: "record";
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface LifecycleEvidenceView {
  workItemId: ManagerControlPlane.WorkItemId;
  attemptId?: ManagerControlPlane.ExecutionAttemptId | null;
  lifecycleState: ManagerControlPlane.ManagerExecutionAttemptStatus | null;
  evidenceRecords: readonly ManagerControlPlane.EvidenceRef[];
  supervisorOwnsLifecycleTruth: true;
  lifecycleTransitionApplied: false;
  nativeWorkflowStateRetained: false;
  rawPayloadRetained: false;
}

/**
 * A supervisor-owned evidence boundary. Implementations may read or append
 * bounded evidence for an existing attempt, but may not transition a lifecycle
 * or become a second workflow ledger.
 */
export interface LifecycleEvidencePort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: OrchestrationPortDescriptor & { kind: "lifecycle_evidence" };
  read(input: LifecycleEvidenceReadInput): Promise<ManagerLifecycleResult<LifecycleEvidenceView>>;
  record(input: LifecycleEvidenceRecordInput): Promise<ManagerLifecycleResult<LifecycleEvidenceView>>;
}

export type WorkspaceExecutionOutcomeStatus = "not_started" | "blocked" | "completed" | "failed";

export interface WorkspaceExecutionOutcomeInput {
  workItemId: ManagerControlPlane.WorkItemId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  outcome: WorkspaceExecutionOutcomeStatus;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface WorkspaceExecutionOutcome {
  workItemId: ManagerControlPlane.WorkItemId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  outcome: WorkspaceExecutionOutcomeStatus;
  evidenceRecords: readonly ManagerControlPlane.EvidenceRef[];
  supervisorOwnsLifecycleTruth: true;
  lifecycleTransitionApplied: false;
  workspaceMutationAuthorityGranted: false;
  deliveryAuthorityGranted: false;
  cleanupAuthorityGranted: false;
  nativeWorkflowStateRetained: false;
  rawPayloadRetained: false;
}

/**
 * A governed outcome boundary for a workspace that already exists. It records
 * an outcome only; it does not create, mutate, deliver, or clean up a workspace.
 */
export interface WorkspaceExecutionPort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: OrchestrationPortDescriptor & { kind: "workspace_execution" };
  recordOutcome(input: WorkspaceExecutionOutcomeInput): Promise<ManagerLifecycleResult<WorkspaceExecutionOutcome>>;
}

/**
 * Contract-only dependency surface for any future engine evaluation. No engine
 * adapter is supplied by this module, and this composition is not authorization
 * to adopt one.
 */
export interface OrchestrationEnginePorts {
  lifecycleEvidence: LifecycleEvidencePort;
  workspaceExecution: WorkspaceExecutionPort;
}
