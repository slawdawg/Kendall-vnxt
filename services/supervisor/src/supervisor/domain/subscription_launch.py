from dataclasses import dataclass


EPIC_8_SUBSCRIPTION_LAUNCH_POLICY_ID = "epic-8-first-subscription-launch-policy-v1"

SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS = (
    ".env",
    ".env.*",
    ".git",
    ".ssh",
    ".aws",
    ".azure",
    ".config/gh",
    ".docker",
    "AppData/Roaming/Claude",
    "AppData/Roaming/Codex",
    "AppData/Roaming/npm",
    "AppData/Local/Google/Chrome/User Data",
    "AppData/Local/Microsoft/Edge/User Data",
    "services/supervisor/.venv",
    "**/*secret*",
    "**/*credential*",
    "**/*token*",
)


@dataclass(frozen=True)
class SubscriptionLaunchTarget:
    target_id: str
    display_name: str
    worker_id: str
    launch_policy_id: str
    command_template_id: str
    enabled: bool = False
    disabled_reason: str = "subscription_agent_target_not_enabled"
    approval_required: bool = True
    process_launch_allowed: bool = False
    command_execution_allowed: bool = False
    credential_access_allowed: bool = False
    external_send_allowed: bool = False


class SubscriptionLaunchRegistry:
    def list_targets(self) -> tuple[SubscriptionLaunchTarget, ...]:
        return (
            SubscriptionLaunchTarget(
                target_id="codex.subscription.disabled",
                display_name="Codex subscription CLI target",
                worker_id="subscription.agent.disabled",
                launch_policy_id=EPIC_8_SUBSCRIPTION_LAUNCH_POLICY_ID,
                command_template_id="codex-subscription-cli-template-disabled-v1",
            ),
            SubscriptionLaunchTarget(
                target_id="claude.subscription.disabled",
                display_name="Claude subscription CLI target",
                worker_id="subscription.agent.disabled",
                launch_policy_id=EPIC_8_SUBSCRIPTION_LAUNCH_POLICY_ID,
                command_template_id="claude-subscription-cli-template-disabled-v1",
            ),
            SubscriptionLaunchTarget(
                target_id="gemini.subscription.disabled",
                display_name="Gemini subscription CLI target",
                worker_id="subscription.agent.disabled",
                launch_policy_id=EPIC_8_SUBSCRIPTION_LAUNCH_POLICY_ID,
                command_template_id="gemini-subscription-cli-template-disabled-v1",
            ),
        )

    def find_target(self, target_id: str | None) -> SubscriptionLaunchTarget | None:
        normalized = (target_id or "").strip().lower()
        if not normalized:
            return None
        aliases = {
            "codex": "codex.subscription.disabled",
            "claude": "claude.subscription.disabled",
            "gemini": "gemini.subscription.disabled",
        }
        normalized = aliases.get(normalized, normalized)
        for target in self.list_targets():
            if target.target_id == normalized:
                return target
        return None

    def get_target(self, target_id: str | None) -> SubscriptionLaunchTarget:
        return self.find_target(target_id) or self.list_targets()[0]


class DisabledSubscriptionLaunchAdapter:
    lifecycle_policy = "disabled_adapter_records_lifecycle_evidence_without_process_launch"
    blocked_reason_ids = (
        "launch_policy_not_approved",
        "missing_approval_actor",
        "missing_approval_timestamp",
        "missing_approval_expiry",
        "permission_envelope_not_approved",
        "command_template_not_executable",
        "real_process_launch_not_approved",
    )
    stale_tracked_fields = (
        "workItemId",
        "attemptId",
        "routeDecisionId",
        "workerId",
        "lane",
        "authorityMode",
        "workspacePlanId",
        "launchPolicyId",
        "targetId",
        "commandTemplateId",
        "commandTemplateExecutionStatus",
        "approvalActor",
        "approvalTimestamp",
        "permissionEnvelope",
        "environmentAllowlist",
        "blockedCredentialSessionPaths",
        "artifactLimits",
        "redactionPolicy",
        "outputPolicy",
        "startupTimeoutPolicy",
        "runTimeoutPolicy",
        "cancellationTimeoutPolicy",
        "heartbeatPolicy",
        "childProcessTreeTrackingPolicy",
        "orphanDetectionPolicy",
        "terminalStateReconciliationPolicy",
        "idempotentCleanupPolicy",
        "approvalExpiry",
        "rollbackPolicy",
        "verificationCommand",
        "allowedOutputMode",
    )

    def lifecycle_evidence(self, target: SubscriptionLaunchTarget) -> dict[str, object]:
        return {
            "adapterId": "subscription-launch-disabled-adapter-v1",
            "targetId": target.target_id,
            "launchPolicyId": target.launch_policy_id,
            "commandTemplateId": target.command_template_id,
            "commandTemplateExecutable": False,
            "lifecyclePolicy": self.lifecycle_policy,
            "dryRunMode": "disabled_metadata_only",
            "stateMapping": [
                "planned -> disabled_precheck_recorded",
                "approved -> approval_binding_recorded_without_launch",
                "starting -> simulated_start_rejected_without_spawn",
                "running -> simulated_running_rejected_without_spawn",
                "cancel_requested -> cancellation_recorded_without_signal",
                "cancelled -> terminal_cancelled_without_process",
                "timed_out -> terminal_timed_out_without_process",
                "failed -> terminal_failure_without_process",
                "completed -> terminal_completed_without_process",
                "rejected -> terminal_rejected_without_process",
            ],
            "timeoutPolicy": "timeout_records_terminal_evidence_without_process_signal",
            "cancellationPolicy": "cancellation_records_terminal_evidence_without_os_signal",
            "cleanupPolicy": "no_process_no_workspace_materialized_cleanup_metadata_only",
            "heartbeatPolicy": "heartbeat_metadata_only_no_process_polling",
            "childProcessTreeTrackingPolicy": "no_child_process_tree_created_tracking_metadata_only",
            "orphanDetectionPolicy": "orphan_detection_records_no_process_tree_to_scan",
            "terminalStateReconciliationPolicy": "terminal_reconciliation_metadata_only_without_process_status",
            "idempotentCleanupPolicy": "cleanup_is_metadata_only_and_idempotent_without_deletion",
            "rollbackPolicy": "rollback_records_global_disable_without_resource_deletion",
            "terminalStates": ["cancelled", "timed_out", "failed", "completed", "rejected"],
            "processLaunchAttempted": False,
            "shellExecutionAttempted": False,
            "credentialAccessAttempted": False,
            "externalSendAttempted": False,
        }

    def readiness_evidence(self, target: SubscriptionLaunchTarget) -> dict[str, object]:
        return {
            "status": "blocked_pending_exact_launch_approval",
            "targetId": target.target_id,
            "launchPolicyId": target.launch_policy_id,
            "blockedReasonIds": list(self.blocked_reason_ids),
            "missingEnvelopeFields": [
                "approvalActor",
                "approvalTimestamp",
                "approvalExpiry",
            ],
            "rejectedEnvelopeFields": {
                "permissionEnvelope": "not_approved_for_real_launch",
                "commandTemplateExecutionStatus": "not_executable_by_kendall",
                "processLaunchPermission": "not_approved",
            },
            "staleEnvelopeFields": [],
            "staleTrackedFields": list(self.stale_tracked_fields),
            "staleApprovalConsequence": "block_launch_and_require_new_exact_approval",
            "commandTemplateId": target.command_template_id,
            "commandTemplateExecutable": False,
            "dashboardControls": "disabled_readiness_only",
            "processLaunchAllowed": False,
            "executionAllowed": False,
        }

    def approval_binding(self, *, work_item_id: str, attempt_id: str, route_decision_id: str, workspace_plan_id: str, target: SubscriptionLaunchTarget) -> dict[str, object]:
        return {
            "workItemId": work_item_id,
            "attemptId": attempt_id,
            "routeDecisionId": route_decision_id,
            "workerId": target.worker_id,
            "lane": "subscription_agent",
            "authorityMode": "operator_approval_required",
            "workspacePlanId": workspace_plan_id,
            "launchPolicyId": target.launch_policy_id,
            "targetId": target.target_id,
            "commandTemplateId": target.command_template_id,
            "commandTemplateExecutionStatus": "not_executable_by_kendall",
            "permissionEnvelope": "not_approved_for_real_launch",
            "approvalActor": None,
            "approvalTimestamp": None,
            "approvalExpiry": None,
            "environmentAllowlist": ["PATH"],
            "blockedCredentialSessionPaths": list(SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS),
            "artifactLimits": {
                "rawOutputBytes": 0,
                "artifactReferenceOnly": True,
                "sourceMutationAllowed": False,
            },
            "redactionPolicy": "required",
            "truncationPolicy": "truncate_to_approved_artifact_limits",
            "outputPolicy": "artifact_references_only_no_raw_output",
            "startupTimeoutSeconds": 10,
            "runTimeoutSeconds": 30,
            "cancellationTimeoutSeconds": 5,
            "startupTimeoutPolicy": "metadata_only_no_process_start",
            "runTimeoutPolicy": "metadata_only_no_process_run",
            "cancellationTimeoutPolicy": "metadata_only_no_process_signal",
            "heartbeatPolicy": "heartbeat_metadata_only_no_process_polling",
            "childProcessTreeTrackingPolicy": "no_child_process_tree_created_tracking_metadata_only",
            "orphanDetectionPolicy": "orphan_detection_records_no_process_tree_to_scan",
            "terminalStateReconciliationPolicy": "terminal_reconciliation_metadata_only_without_process_status",
            "idempotentCleanupPolicy": "cleanup_is_metadata_only_and_idempotent_without_deletion",
            "rollbackPolicy": "rollback_records_global_disable_without_resource_deletion",
            "verificationCommand": "pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q -k subscription_agent_launch",
            "allowedOutputMode": "summary_and_artifact_references_only",
            "actorRequired": True,
            "timestampRequired": True,
            "expiryRequired": True,
            "staleTrackedFields": list(self.stale_tracked_fields),
            "staleRejectionPolicy": "reject_if_any_exact_launch_envelope_field_changes_or_is_missing",
            "staleApprovalConsequence": "block_launch_and_require_new_exact_approval",
        }

    def workspace_contract(self, *, attempt_id: str, target: SubscriptionLaunchTarget) -> dict[str, object]:
        return {
            "workspacePlanId": f"subscription-workspace-plan-{attempt_id}",
            "targetId": target.target_id,
            "materializationMode": "artifact_only_no_workspace_created",
            "artifactRoot": f"_bmad-output/subscription-launch/{attempt_id}",
            "writeRoots": [],
            "forbiddenPaths": list(SUBSCRIPTION_LAUNCH_FORBIDDEN_PATHS),
            "environmentPolicy": "deny_inheritance_allowlist_only",
            "environmentAllowlist": ["PATH"],
            "sessionBoundary": "forbid_shell_profiles_ssh_browser_tokens_and_subscription_sessions",
            "permissionEnvelope": "not_approved_for_real_launch",
            "outputPolicy": "artifact_references_only_no_raw_output",
            "heartbeatPolicy": "heartbeat_metadata_only_no_process_polling",
            "childProcessTreeTrackingPolicy": "no_child_process_tree_created_tracking_metadata_only",
            "orphanDetectionPolicy": "orphan_detection_records_no_process_tree_to_scan",
            "terminalStateReconciliationPolicy": "terminal_reconciliation_metadata_only_without_process_status",
            "idempotentCleanupPolicy": "cleanup_is_metadata_only_and_idempotent_without_deletion",
            "rollbackPolicy": "rollback_records_global_disable_without_resource_deletion",
            "sourceMutationAllowed": False,
            "commandsAllowed": False,
            "credentialAccessAllowed": False,
            "externalSendAllowed": False,
        }

    def output_contract(self, *, attempt_id: str) -> dict[str, object]:
        return {
            "outputContractId": f"subscription-output-contract-{attempt_id}",
            "stdoutRetention": "summary_only",
            "stderrRetention": "summary_only",
            "rawOutputStored": False,
            "maxCapturedBytes": 0,
            "boundedByteCounts": {"stdout": 0, "stderr": 0, "generatedFiles": 2},
            "artifactReferenceOnly": True,
            "artifactReferences": [
                {
                    "artifactId": f"subscription-output-summary-{attempt_id}",
                    "artifactKind": "simulated_output_summary",
                    "path": f"_bmad-output/subscription-launch/{attempt_id}/output-summary.json",
                    "rawPayloadStored": False,
                    "operatorReviewRequired": True,
                },
                {
                    "artifactId": f"subscription-generated-patch-{attempt_id}",
                    "artifactKind": "simulated_generated_patch",
                    "path": f"_bmad-output/subscription-launch/{attempt_id}/generated.patch",
                    "applied": False,
                    "operatorReviewRequired": True,
                },
            ],
            "workflowEventRawOutputAllowed": False,
            "truncationMarker": "[subscription-launch-output-redacted]",
            "redactionRequired": True,
            "truncationApplied": False,
            "generatedPatchHandling": "artifact_only_operator_review_required",
            "retentionMetadata": "artifact_references_and_lifecycle_summary_only",
        }
