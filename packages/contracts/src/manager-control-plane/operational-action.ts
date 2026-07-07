import type { EvidenceRefId } from "./ids";
import type {
  ManagerAuthorityDecisionClass,
  ManagerAuthorityFamily,
  ManagerAuthorityStage,
  ManagerMaximumMutationLevel
} from "./authority";
import type { ManagerWorkItemStatus } from "./lifecycle";
import type { ManagerRiskClass } from "./types";

export const MANAGER_OPERATIONAL_ACTION_TYPES = [
  "inspect_state",
  "refresh_projection",
  "queue_work_item",
  "claim_lease",
  "dispatch_apply",
  "start_live_worker",
  "complete_work_item",
  "signal_worker_progress",
  "answer_worker_question",
  "probe_worker_prompt",
  "repair_submit_pending",
  "inspect_worker_recovery",
  "retire_worker",
  "request_bmad_workflow",
  "recover_work_item",
  "deliver_pr",
  "cleanup_workspace",
  "provider_call",
  "unknown_action"
] as const;
export type ManagerOperationalActionType = (typeof MANAGER_OPERATIONAL_ACTION_TYPES)[number];

export const MANAGER_NEEDS_APPROVAL_CATEGORIES = ["product", "authority", "resource", "destination", "safety"] as const;
export type ManagerNeedsApprovalCategory = (typeof MANAGER_NEEDS_APPROVAL_CATEGORIES)[number];

export const MANAGER_OPERATIONAL_ACTION_REASON_CODES = [
  "allowed",
  "missing_evidence",
  "invalid_input",
  "unknown_action",
  "invalid_transition",
  "insufficient_authority",
  "forbidden_action"
] as const;
export type ManagerOperationalActionReasonCode = (typeof MANAGER_OPERATIONAL_ACTION_REASON_CODES)[number];

export const MANAGER_OPERATIONAL_ACTION_RECOVERY_ACTIONS = ["proceed", "inspect", "request_approval", "rollback", "remediate", "block"] as const;
export type ManagerOperationalActionRecoveryAction = (typeof MANAGER_OPERATIONAL_ACTION_RECOVERY_ACTIONS)[number];

export interface ManagerOperationalTransitionRule {
  fromStatus: ManagerWorkItemStatus;
  toStatus: ManagerWorkItemStatus;
}

export interface ManagerOperationalActionPolicy {
  actionType: ManagerOperationalActionType;
  riskClass: ManagerRiskClass;
  authorityFamily: ManagerAuthorityFamily;
  requiredAuthorityStage: ManagerAuthorityStage;
  allowedAuthorityStages: readonly ManagerAuthorityStage[];
  maximumMutationLevel: ManagerMaximumMutationLevel;
  allowedSourceStatuses: readonly ManagerWorkItemStatus[];
  allowedTransitions: readonly ManagerOperationalTransitionRule[];
  needsApprovalWhenBlocked: readonly ManagerNeedsApprovalCategory[];
  forbidden: boolean;
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface ManagerOperationalActionTransitionEvaluation {
  fromStatus: ManagerWorkItemStatus;
  toStatus: ManagerWorkItemStatus;
  allowed: boolean;
}

export interface ManagerOperationalActionEvaluation {
  ok: boolean;
  actionType: ManagerOperationalActionType;
  riskClass: ManagerRiskClass;
  decision: ManagerAuthorityDecisionClass;
  reasonCode: ManagerOperationalActionReasonCode;
  authorityStage: ManagerAuthorityStage;
  requiredAuthorityStage: ManagerAuthorityStage;
  authorityFamily: ManagerAuthorityFamily;
  maximumMutationLevel: ManagerMaximumMutationLevel;
  needsApproval: readonly ManagerNeedsApprovalCategory[];
  recoveryAction: ManagerOperationalActionRecoveryAction;
  transition: ManagerOperationalActionTransitionEvaluation | null;
  evidenceRefs: readonly EvidenceRefId[];
  metadataOnly: true;
  rawPayloadRetained: false;
}

export interface ManagerOperationalGateRecord {
  gateRecordId: EvidenceRefId;
  runId: string;
  workItemId: string;
  actionType: ManagerOperationalActionType;
  authoritySource: string;
  scope: string;
  prNumber?: string | number | null;
  headSha?: string | null;
  expectedBaseBranch?: string | null;
  draft?: boolean | null;
  mergeableState?: "clean" | "mergeable" | null;
  checksHeadSha?: string | null;
  checksStatus?: "passed" | "success" | "green" | null;
  reviewState?: "approved" | null;
  reviewThreadsResolved?: boolean | null;
  localVerificationRefs?: readonly EvidenceRefId[] | null;
  currentHeadRefOid?: string | null;
  currentBaseBranch?: string | null;
  currentDraft?: boolean | null;
  currentMergeableState?: "clean" | "mergeable" | null;
  currentChecksHeadSha?: string | null;
  currentChecksStatus?: "passed" | "success" | "green" | null;
  currentReviewState?: "approved" | null;
  currentReviewThreadsResolved?: boolean | null;
  currentVerificationFresh?: boolean | null;
  currentSnapshotAt?: string | null;
  currentPrSnapshotAt?: string | null;
  currentVerifiedAt?: string | null;
  currentSnapshotTtlMs?: number | null;
  freshnessTtlMs?: number | null;
  currentVerificationRefs?: readonly EvidenceRefId[] | null;
  mergedPrHeadSha?: string | null;
  expectedOwner?: string | null;
  worktreePath?: string | null;
  localBranch?: string | null;
  localBranchSha?: string | null;
  remoteBranch?: string | null;
  remoteBranchSha?: string | null;
  currentExpectedOwner?: string | null;
  currentWorktreePath?: string | null;
  currentLocalBranch?: string | null;
  currentLocalBranchSha?: string | null;
  currentRemoteBranch?: string | null;
  currentRemoteBranchSha?: string | null;
  currentWorktreeState?: "clean" | "removed" | null;
  currentDryRunId?: string | null;
  currentDryRunAt?: string | null;
  dryRunAt?: string | null;
  dryRunTtlMs?: number | null;
  dryRunFresh?: boolean | null;
  deletionScope?: "worktree" | "local_branch" | "remote_branch" | "managed_workspace" | null;
  dryRunId?: string | null;
  rollbackPath?: string | null;
  cleanupDryRunPassed?: boolean | null;
  rawPayloadRetained: false;
}

export const MANAGER_OPERATIONAL_ACTION_POLICIES = [
  {
    actionType: "inspect_state",
    riskClass: "low",
    authorityFamily: "summary_projection",
    requiredAuthorityStage: "backend_proof",
    allowedAuthorityStages: ["backend_proof", "bootstrap_refill", "governor_recovery", "live_worker", "delivery", "pipeline_adapter"],
    maximumMutationLevel: "none",
    allowedSourceStatuses: [],
    allowedTransitions: [],
    needsApprovalWhenBlocked: [],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "refresh_projection",
    riskClass: "low",
    authorityFamily: "summary_projection",
    requiredAuthorityStage: "backend_proof",
    allowedAuthorityStages: ["backend_proof", "bootstrap_refill", "governor_recovery", "live_worker", "delivery", "pipeline_adapter"],
    maximumMutationLevel: "metadata_only",
    allowedSourceStatuses: [],
    allowedTransitions: [],
    needsApprovalWhenBlocked: [],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "queue_work_item",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "bootstrap_refill",
    allowedAuthorityStages: ["bootstrap_refill", "governor_recovery"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [
      { fromStatus: "eligible", toStatus: "queued" },
      { fromStatus: "failed", toStatus: "queued" },
      { fromStatus: "expired", toStatus: "queued" },
      { fromStatus: "refilling", toStatus: "queued" }
    ],
    needsApprovalWhenBlocked: ["authority"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "claim_lease",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "bootstrap_refill",
    allowedAuthorityStages: ["bootstrap_refill", "governor_recovery"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "queued", toStatus: "leased" }],
    needsApprovalWhenBlocked: ["authority", "resource"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "dispatch_apply",
    riskClass: "high",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "bootstrap_refill",
    allowedAuthorityStages: ["bootstrap_refill", "governor_recovery"],
    maximumMutationLevel: "workspace_files",
    allowedSourceStatuses: ["queued"],
    allowedTransitions: [{ fromStatus: "queued", toStatus: "leased" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "start_live_worker",
    riskClass: "high",
    authorityFamily: "live_worker_execution",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "workspace_files",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "leased", toStatus: "running" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "complete_work_item",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "bootstrap_refill",
    allowedAuthorityStages: ["bootstrap_refill", "governor_recovery", "live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [
      { fromStatus: "running", toStatus: "completed" },
      { fromStatus: "running", toStatus: "failed" },
      { fromStatus: "running", toStatus: "blocked" },
      { fromStatus: "running", toStatus: "expired" }
    ],
    needsApprovalWhenBlocked: ["authority"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "signal_worker_progress",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "blocked" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "answer_worker_question",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "blocked" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "probe_worker_prompt",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "blocked" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "repair_submit_pending",
    riskClass: "medium",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "blocked" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "inspect_worker_recovery",
    riskClass: "high",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "blocked" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "retire_worker",
    riskClass: "high",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: ["live_worker"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "running", toStatus: "expired" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "request_bmad_workflow",
    riskClass: "high",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "bootstrap_refill",
    allowedAuthorityStages: ["bootstrap_refill", "governor_recovery"],
    maximumMutationLevel: "workspace_files",
    allowedSourceStatuses: [],
    allowedTransitions: [{ fromStatus: "eligible", toStatus: "refilling" }],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "recover_work_item",
    riskClass: "high",
    authorityFamily: "dispatcher_lifecycle",
    requiredAuthorityStage: "governor_recovery",
    allowedAuthorityStages: ["governor_recovery"],
    maximumMutationLevel: "manager_runtime_state",
    allowedSourceStatuses: [],
    allowedTransitions: [
      { fromStatus: "failed", toStatus: "queued" },
      { fromStatus: "failed", toStatus: "quarantined" },
      { fromStatus: "failed", toStatus: "blocked" },
      { fromStatus: "expired", toStatus: "queued" },
      { fromStatus: "expired", toStatus: "quarantined" }
    ],
    needsApprovalWhenBlocked: ["authority", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "deliver_pr",
    riskClass: "high",
    authorityFamily: "delivery_stewardship",
    requiredAuthorityStage: "delivery",
    allowedAuthorityStages: ["delivery"],
    maximumMutationLevel: "external_system",
    allowedSourceStatuses: ["completed"],
    allowedTransitions: [],
    needsApprovalWhenBlocked: ["authority", "destination", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "cleanup_workspace",
    riskClass: "extreme",
    authorityFamily: "cleanup_stewardship",
    requiredAuthorityStage: "delivery",
    allowedAuthorityStages: ["delivery"],
    maximumMutationLevel: "external_system",
    allowedSourceStatuses: ["closed"],
    allowedTransitions: [],
    needsApprovalWhenBlocked: ["authority", "destination", "safety"],
    forbidden: false,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "provider_call",
    riskClass: "extreme",
    authorityFamily: "provider_access",
    requiredAuthorityStage: "live_worker",
    allowedAuthorityStages: [],
    maximumMutationLevel: "external_system",
    allowedSourceStatuses: [],
    allowedTransitions: [],
    needsApprovalWhenBlocked: ["product", "authority", "resource", "safety"],
    forbidden: true,
    metadataOnly: true,
    rawPayloadRetained: false
  },
  {
    actionType: "unknown_action",
    riskClass: "extreme",
    authorityFamily: "destructive_operation",
    requiredAuthorityStage: "backend_proof",
    allowedAuthorityStages: [],
    maximumMutationLevel: "external_system",
    allowedSourceStatuses: [],
    allowedTransitions: [],
    needsApprovalWhenBlocked: ["product", "authority", "safety"],
    forbidden: true,
    metadataOnly: true,
    rawPayloadRetained: false
  }
] as const satisfies readonly ManagerOperationalActionPolicy[];
