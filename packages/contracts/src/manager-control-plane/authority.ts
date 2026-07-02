import type { AuthorityDecisionId, ManagerPolicyId, ManagerPreauthorizationId, ManagerRunId } from "./ids";

export const MANAGER_AUTHORITY_STAGES = [
  "backend_proof",
  "bootstrap_refill",
  "governor_recovery",
  "live_worker",
  "delivery",
  "pipeline_adapter"
] as const;
export type ManagerAuthorityStage = (typeof MANAGER_AUTHORITY_STAGES)[number];

export const MANAGER_AUTHORITY_DECISION_CLASSES = [
  "allowed_unattended",
  "requires_preauthorization",
  "block_and_record",
  "forbidden"
] as const;
export type ManagerAuthorityDecisionClass = (typeof MANAGER_AUTHORITY_DECISION_CLASSES)[number];

export type ManagerAuthorityFamily =
  | "contract_definition"
  | "safe_work_eligibility"
  | "dispatcher_lifecycle"
  | "summary_projection"
  | "runtime_state"
  | "live_worker_execution"
  | "delivery_stewardship"
  | "cleanup_stewardship"
  | "provider_access"
  | "secret_access"
  | "destructive_operation"
  | "external_service_installation";

export type ManagerMaximumMutationLevel =
  | "none"
  | "metadata_only"
  | "manager_runtime_state"
  | "workspace_files"
  | "external_system";

export interface ManagerAuthorityDecision {
  authorityDecisionId: AuthorityDecisionId;
  authorityStage: ManagerAuthorityStage;
  decision: ManagerAuthorityDecisionClass;
  authorityFamily: ManagerAuthorityFamily;
  operation: string;
  policyId: ManagerPolicyId;
  scope: string;
  allowedTargets: readonly string[];
  requiredEvidenceRefs: readonly string[];
  stopReason: string | null;
  createdAt: string;
}

export interface ManagerRunPreauthorization {
  preauthorizationId: ManagerPreauthorizationId;
  runId: ManagerRunId;
  authorityFamily: ManagerAuthorityFamily;
  operation: string;
  scope: string;
  commandId: string;
  commandPattern?: string | null;
  allowedTargets: readonly string[];
  maximumMutationLevel: ManagerMaximumMutationLevel;
  expiresAt?: string | null;
  requiredEvidenceRefs: readonly string[];
  rollbackOrRecoveryNote: string;
  approvalRef: string;
  stopLines: readonly string[];
  createdAt: string;
}
