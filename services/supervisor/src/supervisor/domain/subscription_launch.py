from dataclasses import dataclass


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
                launch_policy_id="subscription-launch-policy-disabled-v1",
                command_template_id="codex-subscription-cli-template-disabled-v1",
            ),
            SubscriptionLaunchTarget(
                target_id="claude.subscription.disabled",
                display_name="Claude subscription CLI target",
                worker_id="subscription.agent.disabled",
                launch_policy_id="subscription-launch-policy-disabled-v1",
                command_template_id="claude-subscription-cli-template-disabled-v1",
            ),
            SubscriptionLaunchTarget(
                target_id="gemini.subscription.disabled",
                display_name="Gemini subscription CLI target",
                worker_id="subscription.agent.disabled",
                launch_policy_id="subscription-launch-policy-disabled-v1",
                command_template_id="gemini-subscription-cli-template-disabled-v1",
            ),
        )

    def get_target(self, target_id: str | None) -> SubscriptionLaunchTarget:
        normalized = (target_id or "").strip().lower()
        aliases = {
            "codex": "codex.subscription.disabled",
            "claude": "claude.subscription.disabled",
            "gemini": "gemini.subscription.disabled",
        }
        normalized = aliases.get(normalized, normalized)
        for target in self.list_targets():
            if target.target_id == normalized:
                return target
        return self.list_targets()[0]


class DisabledSubscriptionLaunchAdapter:
    lifecycle_policy = "disabled_adapter_records_lifecycle_evidence_without_process_launch"

    def lifecycle_evidence(self, target: SubscriptionLaunchTarget) -> dict[str, object]:
        return {
            "adapterId": "subscription-launch-disabled-adapter-v1",
            "targetId": target.target_id,
            "launchPolicyId": target.launch_policy_id,
            "commandTemplateId": target.command_template_id,
            "lifecyclePolicy": self.lifecycle_policy,
            "stateMapping": [
                "planned -> disabled_precheck_recorded",
                "approved -> approval_binding_recorded_without_launch",
                "starting -> simulated_start_rejected_without_spawn",
                "running -> simulated_running_rejected_without_spawn",
                "cancel_requested -> cancellation_recorded_without_signal",
                "cancelled -> terminal_cancelled_without_process",
                "timed_out -> terminal_timed_out_without_process",
                "failed -> terminal_failure_without_process",
            ],
            "timeoutPolicy": "timeout_records_terminal_evidence_without_process_signal",
            "cancellationPolicy": "cancellation_records_terminal_evidence_without_os_signal",
            "cleanupPolicy": "no_process_no_workspace_materialized_cleanup_metadata_only",
            "terminalStates": ["cancelled", "timed_out", "failed", "rejected"],
            "processLaunchAttempted": False,
            "shellExecutionAttempted": False,
            "credentialAccessAttempted": False,
            "externalSendAttempted": False,
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
            "actorRequired": True,
            "timestampRequired": True,
            "expiryRequired": True,
            "staleRejectionPolicy": "reject_if_route_worker_lane_authority_workspace_policy_target_or_command_template_changes",
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
            "truncationMarker": "[subscription-launch-output-redacted]",
            "redactionRequired": True,
            "retentionMetadata": "artifact_references_and_lifecycle_summary_only",
        }
