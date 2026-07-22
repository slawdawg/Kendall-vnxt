import {
  MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS,
  MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS,
  MANAGER_TERMINAL_EVENT_REQUEST_FIELDS,
  MANAGER_TERMINAL_EVENT_VIEW_FIELDS,
  SUPERVISOR_TERMINAL_EVENT_PROJECTION_FIELDS,
  SUPERVISOR_TERMINAL_EVENT_PROJECTION_REQUIRED_FIELDS,
  SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_FIELDS,
  SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_REQUIRED_FIELDS,
} from "./terminal-event";

export const MANAGER_CONTROL_PLANE_SCHEMA_VERSION = "manager_control_plane.v1" as const;

/** API boundary fields for the supervisor-owned terminal-event contract. */
export const MANAGER_TERMINAL_EVENT_REQUEST_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_REQUEST_FIELDS;
export const MANAGER_TERMINAL_EVENT_VIEW_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_VIEW_FIELDS;
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS;
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS;
export const SUPERVISOR_TERMINAL_EVENT_PROJECTION_SERIALIZED_FIELDS = SUPERVISOR_TERMINAL_EVENT_PROJECTION_FIELDS;
export const SUPERVISOR_TERMINAL_EVENT_PROJECTION_REQUIRED_SERIALIZED_FIELDS = SUPERVISOR_TERMINAL_EVENT_PROJECTION_REQUIRED_FIELDS;
export const SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_SERIALIZED_FIELDS = SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_FIELDS;
export const SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS = SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_REQUIRED_FIELDS;

export const CANDIDATE_WORK_PACKET_SERIALIZED_FIELDS = [
  "candidate_work_packet_id",
  "run_id",
  "source_refs",
  "proposed_slice",
  "acceptance_criteria",
  "verification_targets",
  "risk_class",
  "dependency_hints",
  "dedupe_key",
  "authority_class",
  "authority_stage",
  "status",
  "policy_id",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const MANAGER_SOURCE_REF_SERIALIZED_FIELDS = [
  "source_ref_id",
  "source_type",
  "label",
  "path_or_url",
  "source_span",
  "summary_only"
] as const;

export const MANAGER_RUN_TARGET_WORKER_POLICY_SERIALIZED_FIELDS = [
  "desired_workers",
  "max_workers",
  "active_work_handling",
  "kill_healthy_workers_by_default"
] as const;

export const MANAGER_RUN_START_STATE_SERIALIZED_FIELDS = [
  "run_id",
  "source_ref",
  "source_selection",
  "source_selection_reason",
  "target_worker_policy",
  "authority_profile",
  "authority_stage",
  "runtime_state_path",
  "control_state",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const MANAGER_RUN_FUTURE_DISPATCH_STATE_SERIALIZED_FIELDS = [
  "action",
  "new_dispatch_allowed",
  "scope",
  "target_workers",
  "focus_surface"
] as const;

export const MANAGER_RUN_ACTIVE_WORK_POLICY_SERIALIZED_FIELDS = [
  "default_action",
  "active_work_handling",
  "kill_healthy_workers_by_default"
] as const;

export const MANAGER_RUN_OPERATOR_REPORT_SERIALIZED_FIELDS = [
  "what_changed",
  "why_it_matters",
  "what_happens_next"
] as const;

export const MANAGER_RUN_CONTROL_STATE_SERIALIZED_FIELDS = [
  "run_id",
  "control_state",
  "requested_action",
  "affected_scope",
  "authority_basis",
  "authority_decision_id",
  "authority_stage",
  "next_action",
  "future_dispatch",
  "active_work_policy",
  "operator_report",
  "blocker",
  "needs_review_reason",
  "retention_class",
  "evidence_refs",
  "created_at"
] as const;

export const MANAGER_RUNTIME_LEDGER_FILE_SET_SERIALIZED_FIELDS = [
  "run_id",
  "root",
  "mission_path",
  "events_path",
  "workers_path",
  "dispatcher_summary_path",
  "checkpoints_path",
  "questions_path",
  "resource_snapshots_path",
  "usage_snapshots_path"
] as const;

export const MANAGER_RUNTIME_RECOVERY_BLOCKER_SERIALIZED_FIELDS = [
  "code",
  "file",
  "reason",
  "safe_repair_action",
  "evidence_refs"
] as const;

export const MANAGER_RUNTIME_LEDGER_EVENT_SERIALIZED_FIELDS = [
  "event_id",
  "schema_version",
  "event_name",
  "run_id",
  "actor_type",
  "actor_id",
  "authority_basis",
  "source_refs",
  "result",
  "blocker",
  "recovery_path",
  "evidence_refs",
  "correlation_id",
  "causation_id",
  "ordering_key",
  "idempotency_key",
  "redaction_boundary",
  "projection_behavior",
  "summary",
  "raw_payload_retained",
  "created_at"
] as const;

export const MANAGER_RUNTIME_LEDGER_REPLAY_SUMMARY_SERIALIZED_FIELDS = [
  "run_id",
  "mission",
  "authority_stage",
  "control_state",
  "event_watermark",
  "outstanding_blockers",
  "open_questions",
  "latest_checkpoints",
  "latest_resource_state",
  "latest_usage_state",
  "next_safe_action",
  "recovery_blockers",
  "raw_payload_retained",
  "evidence_refs"
] as const;

export const VERIFICATION_TARGET_SERIALIZED_FIELDS = [
  "verification_target_id",
  "command_id",
  "command",
  "expected_result"
] as const;

export const WORK_ITEM_SERIALIZED_FIELDS = [
  "work_item_id",
  "run_id",
  "candidate_work_packet_id",
  "source_refs",
  "dedupe_key",
  "title",
  "slice_type",
  "status",
  "priority",
  "authority_class",
  "authority_decision_id",
  "verification_targets",
  "dependencies",
  "attempt_count",
  "lease_id",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const LEASE_SERIALIZED_FIELDS = [
  "lease_id",
  "work_item_id",
  "worker_id",
  "attempt_id",
  "state",
  "claimed_at",
  "heartbeat_at",
  "expires_at",
  "attempt",
  "idempotency_key",
  "authority_decision_id",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const EXECUTION_ATTEMPT_SERIALIZED_FIELDS = [
  "attempt_id",
  "lease_id",
  "work_item_id",
  "worker_id",
  "state",
  "started_at",
  "finished_at",
  "result_summary",
  "failure_reason",
  "authority_decision_id",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const REFILL_JOB_SERIALIZED_FIELDS = [
  "refill_job_id",
  "source_refs",
  "trigger_reason",
  "low_watermark",
  "high_watermark",
  "lock_id",
  "source_identity",
  "source_revision",
  "candidate_count",
  "queued_count",
  "needs_review_count",
  "blocked_count",
  "authority_class",
  "state",
  "started_at",
  "finished_at",
  "result",
  "terminal_disposition",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const CHANGE_SURFACE_SERIALIZED_FIELDS = [
  "proof_status",
  "paths"
] as const;

export const RESERVATION_LEASE_SERIALIZED_FIELDS = [
  "schema_version",
  "reservation_lease_id",
  "status",
  "reason_code",
  "reason",
  "owner",
  "worktree_path",
  "evidence_refs",
  "conflicting_execution_job_ids",
  "expires_at",
  "mutation"
] as const;

export const EXECUTION_JOB_SERIALIZED_FIELDS = [
  "schema_version",
  "execution_job_id",
  "candidate_id",
  "purpose",
  "owner",
  "worktree",
  "read_write_mode",
  "change_surface",
  "immutable_review",
  "baseline_scope",
  "dependencies",
  "evidence_refs",
  "verification_targets",
  "lifecycle_status",
  "reservation_lease",
  "recovery_state",
  "next_safe_action"
] as const;

export const PARALLEL_CAPACITY_DECISION_SERIALIZED_FIELDS = [
  "schema_version",
  "posture",
  "writer_cap",
  "read_only_cap",
  "total_cap",
  "external_route_allowance",
  "reason_code",
  "reason",
  "next_safe_action"
] as const;

export const PARALLEL_SUITABILITY_REPORT_SERIALIZED_FIELDS = [
  "schema_version",
  "generated_at",
  "recommendation",
  "execution_jobs",
  "reservation_leases",
  "mutation",
  "raw_payload_retained",
  "retention",
  "stop_lines"
] as const;

export const EVIDENCE_REF_SERIALIZED_FIELDS = [
  "evidence_ref_id",
  "evidence_type",
  "label",
  "artifact_path",
  "retention_class",
  "raw_payload_retained",
  "created_at"
] as const;

export const MANAGER_RUN_PREAUTHORIZATION_SERIALIZED_FIELDS = [
  "preauthorization_id",
  "run_id",
  "authority_family",
  "operation",
  "scope",
  "command_id",
  "command_pattern",
  "allowed_targets",
  "maximum_mutation_level",
  "expires_at",
  "required_evidence_refs",
  "rollback_or_recovery_note",
  "approval_ref",
  "stop_lines",
  "created_at"
] as const;

export const IMPLEMENTATION_RUN_TASK_SERIALIZED_FIELDS = [
  "task_id",
  "title",
  "requirement_ids",
  "authority_class",
  "allowed_execution_mode",
  "verification_command_id",
  "evidence_artifact",
  "dependency_impact",
  "completion_condition"
] as const;

export const IMPLEMENTATION_RUN_RESUME_PROTOCOL_SERIALIZED_FIELDS = [
  "reconcile_dispatcher_state",
  "reconcile_runtime_ledger",
  "reconcile_worker_sessions",
  "reconcile_workspace_assignments",
  "reconcile_git_state",
  "reconcile_pr_state",
  "next_action_on_mismatch"
] as const;

export const IMPLEMENTATION_RUN_DELIVERY_PHASE_SERIALIZED_FIELDS = [
  "branch_scope",
  "target_base",
  "exact_head_protection",
  "review_thread_requirement",
  "check_requirement",
  "local_verification_commands",
  "allowed_cleanup_targets",
  "rollback_path",
  "stop_lines"
] as const;

export const IMPLEMENTATION_RUN_CONTRACT_SERIALIZED_FIELDS = [
  "implementation_run_contract_id",
  "run_id",
  "scope",
  "out_of_scope",
  "source_refs",
  "required_artifacts",
  "task_graph",
  "authority_stage",
  "allowed_execution_mode",
  "authority_families",
  "stop_lines",
  "verification_commands",
  "evidence_paths",
  "completion_criteria",
  "resume_protocol",
  "delivery_phase",
  "preauthorizations",
  "evidence_refs",
  "created_at",
  "updated_at"
] as const;

export const MANAGER_EXECUTION_LANE_SUMMARY_SERIALIZED_FIELDS = [
  "run_id",
  "proof_mode",
  "state_source",
  "last_observed_at",
  "last_meaningful_progress_at",
  "freshness",
  "unknown_reason",
  "authority_blocked_reason",
  "authority_stop_reason",
  "current_phase",
  "next_action",
  "operator_attention_required",
  "attention_reason",
  "recovery_status",
  "recovery_attempt_count",
  "last_recovery_at",
  "safe_work_available_count",
  "metadata_only_queued_count",
  "unsafe_or_gated_work_count",
  "evidence_freshness",
  "event_watermark",
  "source_cursor",
  "authority_stage",
  "authority_class",
  "terminal_disposition",
  "queued_work_item_ids",
  "active_work_item_ids",
  "evidence_refs",
  "evidence_links",
  "state_counts",
  "raw_state_labels",
  "blockers",
  "warnings",
  "feedback_routes",
  "affected_delivery_gates",
  "feedback_record_policy",
  "feedback_unrelated_lane_policy",
  "feedback_retention",
  "feedback_raw_payload_retained"
] as const;

export const MANAGER_AUTHORITY_DECISION_SERIALIZED_FIELDS = [
  "authority_decision_id",
  "authority_stage",
  "decision",
  "authority_family",
  "operation",
  "policy_id",
  "scope",
  "allowed_targets",
  "required_evidence_refs",
  "stop_reason",
  "created_at"
] as const;

export const MANAGER_CONTROL_PLANE_EVENT_SERIALIZED_FIELDS = [
  "event_id",
  "schema_version",
  "event_name",
  "run_id",
  "actor_type",
  "actor_id",
  "occurred_at",
  "correlation_id",
  "causation_id",
  "idempotency_key",
  "redaction_boundary",
  "projection_behavior",
  "evidence_refs",
  "payload_summary"
] as const;

export const MANAGER_CONTROL_PLANE_SERIALIZED_FIELDS_BY_CONTRACT = {
  CandidateWorkPacket: CANDIDATE_WORK_PACKET_SERIALIZED_FIELDS,
  ManagerSourceRef: MANAGER_SOURCE_REF_SERIALIZED_FIELDS,
  ManagerRunTargetWorkerPolicy: MANAGER_RUN_TARGET_WORKER_POLICY_SERIALIZED_FIELDS,
  ManagerRunStartState: MANAGER_RUN_START_STATE_SERIALIZED_FIELDS,
  ManagerRunFutureDispatchState: MANAGER_RUN_FUTURE_DISPATCH_STATE_SERIALIZED_FIELDS,
  ManagerRunActiveWorkPolicy: MANAGER_RUN_ACTIVE_WORK_POLICY_SERIALIZED_FIELDS,
  ManagerRunOperatorReport: MANAGER_RUN_OPERATOR_REPORT_SERIALIZED_FIELDS,
  ManagerRunControlState: MANAGER_RUN_CONTROL_STATE_SERIALIZED_FIELDS,
  ManagerRuntimeLedgerFileSet: MANAGER_RUNTIME_LEDGER_FILE_SET_SERIALIZED_FIELDS,
  ManagerRuntimeRecoveryBlocker: MANAGER_RUNTIME_RECOVERY_BLOCKER_SERIALIZED_FIELDS,
  ManagerRuntimeLedgerEventRecord: MANAGER_RUNTIME_LEDGER_EVENT_SERIALIZED_FIELDS,
  ManagerRuntimeLedgerReplaySummary: MANAGER_RUNTIME_LEDGER_REPLAY_SUMMARY_SERIALIZED_FIELDS,
  VerificationTarget: VERIFICATION_TARGET_SERIALIZED_FIELDS,
  WorkItem: WORK_ITEM_SERIALIZED_FIELDS,
  Lease: LEASE_SERIALIZED_FIELDS,
  ExecutionAttempt: EXECUTION_ATTEMPT_SERIALIZED_FIELDS,
  RefillJob: REFILL_JOB_SERIALIZED_FIELDS,
  ChangeSurface: CHANGE_SURFACE_SERIALIZED_FIELDS,
  ReservationLease: RESERVATION_LEASE_SERIALIZED_FIELDS,
  ExecutionJob: EXECUTION_JOB_SERIALIZED_FIELDS,
  ParallelCapacityDecision: PARALLEL_CAPACITY_DECISION_SERIALIZED_FIELDS,
  ParallelSuitabilityReport: PARALLEL_SUITABILITY_REPORT_SERIALIZED_FIELDS,
  EvidenceRef: EVIDENCE_REF_SERIALIZED_FIELDS,
  ManagerRunPreauthorization: MANAGER_RUN_PREAUTHORIZATION_SERIALIZED_FIELDS,
  ImplementationRunTask: IMPLEMENTATION_RUN_TASK_SERIALIZED_FIELDS,
  ImplementationRunResumeProtocol: IMPLEMENTATION_RUN_RESUME_PROTOCOL_SERIALIZED_FIELDS,
  ImplementationRunDeliveryPhase: IMPLEMENTATION_RUN_DELIVERY_PHASE_SERIALIZED_FIELDS,
  ImplementationRunContract: IMPLEMENTATION_RUN_CONTRACT_SERIALIZED_FIELDS,
  ManagerExecutionLaneSummary: MANAGER_EXECUTION_LANE_SUMMARY_SERIALIZED_FIELDS,
  ManagerAuthorityDecision: MANAGER_AUTHORITY_DECISION_SERIALIZED_FIELDS,
  ManagerControlPlaneEvent: MANAGER_CONTROL_PLANE_EVENT_SERIALIZED_FIELDS,
  ManagerTerminalEventRequest: MANAGER_TERMINAL_EVENT_REQUEST_SERIALIZED_FIELDS,
  ManagerTerminalEventView: MANAGER_TERMINAL_EVENT_VIEW_SERIALIZED_FIELDS,
  ManagerTerminalEventApiEnvelope: MANAGER_TERMINAL_EVENT_API_ENVELOPE_SERIALIZED_FIELDS,
  SupervisorTerminalEventProjection: SUPERVISOR_TERMINAL_EVENT_PROJECTION_SERIALIZED_FIELDS,
  SupervisorTerminalEventProjectionApiEnvelope: SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_SERIALIZED_FIELDS,
} as const;

export const MANAGER_CONTROL_PLANE_REQUIRED_FIELDS_BY_CONTRACT = {
  ManagerTerminalEventApiEnvelope: MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS,
  SupervisorTerminalEventProjection: SUPERVISOR_TERMINAL_EVENT_PROJECTION_REQUIRED_SERIALIZED_FIELDS,
  SupervisorTerminalEventProjectionApiEnvelope: SUPERVISOR_TERMINAL_EVENT_PROJECTION_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS,
  ChangeSurface: CHANGE_SURFACE_SERIALIZED_FIELDS,
  ReservationLease: RESERVATION_LEASE_SERIALIZED_FIELDS,
  ExecutionJob: EXECUTION_JOB_SERIALIZED_FIELDS,
  ParallelCapacityDecision: PARALLEL_CAPACITY_DECISION_SERIALIZED_FIELDS,
  ParallelSuitabilityReport: PARALLEL_SUITABILITY_REPORT_SERIALIZED_FIELDS,
  CandidateWorkPacket: [
    "candidate_work_packet_id",
    "run_id",
    "source_refs",
    "proposed_slice",
    "acceptance_criteria",
    "verification_targets",
    "risk_class",
    "dependency_hints",
    "dedupe_key",
    "authority_class",
    "authority_stage",
    "status",
    "policy_id",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  ManagerSourceRef: ["source_ref_id", "source_type", "label", "summary_only"],
  ManagerRunTargetWorkerPolicy: ["desired_workers", "max_workers", "active_work_handling", "kill_healthy_workers_by_default"],
  ManagerRunStartState: [
    "run_id",
    "source_ref",
    "source_selection",
    "source_selection_reason",
    "target_worker_policy",
    "authority_profile",
    "authority_stage",
    "runtime_state_path",
    "control_state",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  ManagerRunFutureDispatchState: ["action", "new_dispatch_allowed", "scope"],
  ManagerRunActiveWorkPolicy: ["default_action", "active_work_handling", "kill_healthy_workers_by_default"],
  ManagerRunOperatorReport: ["what_changed", "why_it_matters", "what_happens_next"],
  ManagerRunControlState: [
    "run_id",
    "control_state",
    "requested_action",
    "affected_scope",
    "authority_basis",
    "authority_stage",
    "next_action",
    "future_dispatch",
    "active_work_policy",
    "operator_report",
    "retention_class",
    "evidence_refs",
    "created_at"
  ],
  ManagerRuntimeLedgerFileSet: [
    "run_id",
    "root",
    "mission_path",
    "events_path",
    "workers_path",
    "dispatcher_summary_path",
    "checkpoints_path",
    "questions_path",
    "resource_snapshots_path",
    "usage_snapshots_path"
  ],
  ManagerRuntimeRecoveryBlocker: ["code", "reason", "safe_repair_action", "evidence_refs"],
  ManagerRuntimeLedgerEventRecord: [
    "event_id",
    "schema_version",
    "event_name",
    "run_id",
    "actor_type",
    "actor_id",
    "authority_basis",
    "source_refs",
    "result",
    "evidence_refs",
    "correlation_id",
    "causation_id",
    "ordering_key",
    "idempotency_key",
    "redaction_boundary",
    "projection_behavior",
    "summary",
    "raw_payload_retained",
    "created_at"
  ],
  ManagerRuntimeLedgerReplaySummary: [
    "run_id",
    "mission",
    "authority_stage",
    "control_state",
    "event_watermark",
    "outstanding_blockers",
    "open_questions",
    "latest_checkpoints",
    "latest_resource_state",
    "latest_usage_state",
    "next_safe_action",
    "recovery_blockers",
    "raw_payload_retained",
    "evidence_refs"
  ],
  VerificationTarget: ["verification_target_id", "command_id", "command", "expected_result"],
  WorkItem: [
    "work_item_id",
    "run_id",
    "candidate_work_packet_id",
    "source_refs",
    "dedupe_key",
    "title",
    "slice_type",
    "status",
    "priority",
    "authority_class",
    "authority_decision_id",
    "verification_targets",
    "dependencies",
    "attempt_count",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  Lease: [
    "lease_id",
    "work_item_id",
    "worker_id",
    "attempt_id",
    "state",
    "claimed_at",
    "expires_at",
    "attempt",
    "idempotency_key",
    "authority_decision_id",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  ExecutionAttempt: [
    "attempt_id",
    "lease_id",
    "work_item_id",
    "worker_id",
    "state",
    "started_at",
    "authority_decision_id",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  RefillJob: [
    "refill_job_id",
    "source_refs",
    "trigger_reason",
    "low_watermark",
    "high_watermark",
    "lock_id",
    "candidate_count",
    "queued_count",
    "needs_review_count",
    "blocked_count",
    "authority_class",
    "state",
    "started_at",
    "result",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  EvidenceRef: ["evidence_ref_id", "evidence_type", "label", "retention_class", "raw_payload_retained", "created_at"],
  ManagerRunPreauthorization: [
    "preauthorization_id",
    "run_id",
    "authority_family",
    "operation",
    "scope",
    "command_id",
    "allowed_targets",
    "maximum_mutation_level",
    "required_evidence_refs",
    "rollback_or_recovery_note",
    "approval_ref",
    "stop_lines",
    "created_at"
  ],
  ImplementationRunTask: [
    "task_id",
    "title",
    "requirement_ids",
    "authority_class",
    "allowed_execution_mode",
    "verification_command_id",
    "evidence_artifact",
    "dependency_impact",
    "completion_condition"
  ],
  ImplementationRunResumeProtocol: [
    "reconcile_dispatcher_state",
    "reconcile_runtime_ledger",
    "reconcile_worker_sessions",
    "reconcile_workspace_assignments",
    "reconcile_git_state",
    "reconcile_pr_state",
    "next_action_on_mismatch"
  ],
  ImplementationRunDeliveryPhase: [
    "branch_scope",
    "target_base",
    "exact_head_protection",
    "review_thread_requirement",
    "check_requirement",
    "local_verification_commands",
    "allowed_cleanup_targets",
    "rollback_path",
    "stop_lines"
  ],
  ImplementationRunContract: [
    "implementation_run_contract_id",
    "run_id",
    "scope",
    "out_of_scope",
    "source_refs",
    "required_artifacts",
    "task_graph",
    "authority_stage",
    "allowed_execution_mode",
    "authority_families",
    "stop_lines",
    "verification_commands",
    "evidence_paths",
    "completion_criteria",
    "resume_protocol",
    "preauthorizations",
    "evidence_refs",
    "created_at",
    "updated_at"
  ],
  ManagerExecutionLaneSummary: [
    "run_id",
    "proof_mode",
    "state_source",
    "last_observed_at",
    "freshness",
    "current_phase",
    "next_action",
    "operator_attention_required",
    "safe_work_available_count",
    "unsafe_or_gated_work_count",
    "evidence_freshness",
    "event_watermark",
    "source_cursor",
    "authority_stage",
    "authority_class",
    "queued_work_item_ids",
    "active_work_item_ids",
    "evidence_refs",
    "evidence_links",
    "state_counts",
    "raw_state_labels",
    "feedback_routes",
    "affected_delivery_gates",
    "feedback_record_policy",
    "feedback_unrelated_lane_policy",
    "feedback_retention",
    "feedback_raw_payload_retained",
    "blockers",
    "warnings"
  ],
  ManagerAuthorityDecision: [
    "authority_decision_id",
    "authority_stage",
    "decision",
    "authority_family",
    "operation",
    "policy_id",
    "scope",
    "allowed_targets",
    "required_evidence_refs",
    "stop_reason",
    "created_at"
  ],
  ManagerControlPlaneEvent: [
    "event_id",
    "schema_version",
    "event_name",
    "run_id",
    "actor_type",
    "actor_id",
    "occurred_at",
    "correlation_id",
    "idempotency_key",
    "redaction_boundary",
    "projection_behavior",
    "evidence_refs",
    "payload_summary"
  ],
  ManagerTerminalEventRequest: [
    "eventId",
    "eventType",
    "runId",
    "sourceIdentity",
    "sourceRevision",
    "reconciliationCounts",
    "unresolvedApprovalGatedWork",
    "evidenceRefs",
    "resumeRequirement",
    "nextManagerAction",
    "idempotencyKey",
    "metadataOnly",
    "rawPayloadRetained",
  ],
  ManagerTerminalEventView: [
    "eventId",
    "eventType",
    "runId",
    "sourceIdentity",
    "sourceRevision",
    "reconciliationCounts",
    "unresolvedApprovalGatedWork",
    "evidenceRefs",
    "resumeRequirement",
    "nextManagerAction",
    "idempotencyKey",
    "metadataOnly",
    "rawPayloadRetained",
    "owner",
    "createdAt",
  ],
} as const;
