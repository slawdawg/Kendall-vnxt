import type { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock, ManagerLifecycleResult } from "../manager-control-plane";
import type {
  DispatcherClaimInput,
  DispatcherClaimResult,
  DispatcherCloseoutInput,
  DispatcherCloseoutResult,
  DispatcherHeartbeatInput,
  DispatcherHeartbeatResult,
  DispatcherRecoveryInput,
  DispatcherRecoveryResult,
  DispatcherRefillInput,
  DispatcherRefillResult
} from "./dispatcher-port";

export type RuntimePortMode = "backend_proof" | "local_proof" | "live_adapter" | "simulated_adapter";
export type RuntimePortKind =
  | "queue"
  | "verification"
  | "session"
  | "policy"
  | "lifecycle_evidence"
  | "workspace_execution";
export type RuntimeProductTruthBoundary = "kendall_product_truth";
export type RuntimeStateRetention = "kendall_manager_metadata_only" | "tool_native_metadata" | "external_runtime_state";

export interface RuntimePortDescriptor {
  kind: RuntimePortKind;
  mode: RuntimePortMode;
  adapterId: string;
  authorityStage: ManagerControlPlane.ManagerAuthorityStage;
  productTruthBoundary: RuntimeProductTruthBoundary;
  localProofOnly: boolean;
  stateRetention: RuntimeStateRetention;
  toolNativeStateRetained: boolean;
  nativeQueueStateRetained: boolean;
  rawPayloadRetained: false;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface QueueRuntimePort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: RuntimePortDescriptor & { kind: "queue" };
  refill(input: DispatcherRefillInput): Promise<ManagerLifecycleResult<DispatcherRefillResult>>;
  claim(input: DispatcherClaimInput): Promise<ManagerLifecycleResult<DispatcherClaimResult>>;
  heartbeat(input: DispatcherHeartbeatInput): Promise<ManagerLifecycleResult<DispatcherHeartbeatResult>>;
  complete(input: DispatcherCloseoutInput): Promise<ManagerLifecycleResult<DispatcherCloseoutResult>>;
  fail(input: DispatcherCloseoutInput): Promise<ManagerLifecycleResult<DispatcherCloseoutResult>>;
  recoverExpiredLeases(input: DispatcherRecoveryInput): Promise<ManagerLifecycleResult<DispatcherRecoveryResult>>;
  summarize(): Promise<ManagerControlPlane.ManagerExecutionLaneSummary>;
}

export interface VerificationRuntimeInput {
  target: ManagerControlPlane.VerificationTarget;
  workItemId?: ManagerControlPlane.WorkItemId | null;
  attemptId?: ManagerControlPlane.ExecutionAttemptId | null;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface VerificationRuntimeTargetProof {
  verificationTargetId: ManagerControlPlane.VerificationTargetId;
  commandId: string;
  commandDigest: string;
  expectedResultDigest: string;
}

export interface VerificationRuntimeResult {
  status: "metadata_proof_only" | "blocked";
  target: VerificationRuntimeTargetProof;
  workItemId?: ManagerControlPlane.WorkItemId | null;
  attemptId?: ManagerControlPlane.ExecutionAttemptId | null;
  evidenceRecords: readonly ManagerControlPlane.EvidenceRef[];
  fixtureBackedExpectedEvidencePresent: false;
  commandExecutionAttempted: false;
  rawPayloadRetained: false;
}

export interface VerificationRuntimePort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: RuntimePortDescriptor & { kind: "verification" };
  verify(input: VerificationRuntimeInput): Promise<ManagerLifecycleResult<VerificationRuntimeResult>>;
}

export interface SessionRuntimeInput {
  workItemId: ManagerControlPlane.WorkItemId;
  branchName: string;
  worktreePath: string;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface SessionRuntimeResult {
  sessionId: string;
  workItemId: ManagerControlPlane.WorkItemId;
  branchName: string;
  worktreePath: string;
  approvedWorkspaceRoot: string;
  processLaunchAttempted: false;
  filesystemMutationAttempted: false;
  credentialAccessAttempted: false;
  networkAccessAttempted: false;
  rawPayloadRetained: false;
}

export interface SessionRuntimePort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: RuntimePortDescriptor & { kind: "session" };
  prepareSession(input: SessionRuntimeInput): Promise<ManagerLifecycleResult<SessionRuntimeResult>>;
}

export interface PolicyRuntimeInput {
  authorityFamily: ManagerControlPlane.ManagerAuthorityFamily;
  operation: string;
  scope: string;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface PolicyRuntimeResult {
  decision: ManagerControlPlane.ManagerAuthorityDecision;
  allowed: boolean;
  simulatedOnly: true;
  wouldAllowIfAuthoritative: boolean;
  blockers: readonly string[];
  rawPayloadRetained: false;
}

export interface PolicyRuntimePort {
  readonly mode: RuntimePortMode;
  readonly clock: ManagerClock;
  readonly descriptor: RuntimePortDescriptor & { kind: "policy" };
  evaluate(input: PolicyRuntimeInput): Promise<ManagerLifecycleResult<PolicyRuntimeResult>>;
}

export interface RuntimePorts {
  queue: QueueRuntimePort;
  verification: VerificationRuntimePort;
  session: SessionRuntimePort;
  policy: PolicyRuntimePort;
}
