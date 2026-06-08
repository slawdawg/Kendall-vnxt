from dataclasses import dataclass
from enum import StrEnum

from supervisor.domain.routing import ExecutionLane


class WorkerAdapterType(StrEnum):
    INTERNAL_UTILITY = "internal_utility"
    LOCAL_OPENAI_COMPATIBLE = "local_openai_compatible"
    SUBSCRIPTION_HANDOFF = "subscription_handoff"
    SUBSCRIPTION_AGENT = "subscription_agent"
    PREMIUM_APPROVAL = "premium_approval"


class WorkerHealthStatus(StrEnum):
    ONLINE = "online"
    DISABLED = "disabled"


@dataclass(frozen=True)
class WorkerRegistryEntry:
    worker_id: str
    display_name: str
    lane: ExecutionLane
    adapter_type: WorkerAdapterType
    capabilities: tuple[str, ...]
    permissions: tuple[str, ...]
    health: WorkerHealthStatus
    queue_depth: int = 0
    max_parallel_jobs: int = 1
    disabled_reason: str | None = None


class StaticWorkerRegistry:
    def list_workers(self) -> tuple[WorkerRegistryEntry, ...]:
        return (
            WorkerRegistryEntry(
                worker_id="utility.internal",
                display_name="Internal utility worker",
                lane=ExecutionLane.UTILITY,
                adapter_type=WorkerAdapterType.INTERNAL_UTILITY,
                capabilities=("path_scope_check", "repo_inventory", "event_evidence"),
                permissions=("internal_functions_only", "no_shell", "no_model_calls"),
                health=WorkerHealthStatus.ONLINE,
                max_parallel_jobs=1,
            ),
            WorkerRegistryEntry(
                worker_id="local.readonly.mock",
                display_name="Local read-only AI worker",
                lane=ExecutionLane.LOCAL_READONLY,
                adapter_type=WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE,
                capabilities=("evidence_summary", "log_review", "failure_explanation"),
                permissions=("read_only_evidence_packets", "no_file_writes", "no_commands"),
                health=WorkerHealthStatus.ONLINE,
            ),
            WorkerRegistryEntry(
                worker_id="local.ollama.disabled",
                display_name="Ollama OpenAI-compatible local worker",
                lane=ExecutionLane.LOCAL_READONLY,
                adapter_type=WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE,
                capabilities=("evidence_summary", "log_review", "failure_explanation"),
                permissions=("provider_disabled", "no_http_calls", "no_model_calls"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="ollama_local_provider_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="local.lmstudio.disabled",
                display_name="LM Studio OpenAI-compatible local worker",
                lane=ExecutionLane.LOCAL_READONLY,
                adapter_type=WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE,
                capabilities=("evidence_summary", "log_review", "failure_explanation"),
                permissions=("provider_disabled", "no_http_calls", "no_model_calls"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="lmstudio_local_provider_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="local.vllm.disabled",
                display_name="vLLM OpenAI-compatible local worker",
                lane=ExecutionLane.LOCAL_READONLY,
                adapter_type=WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE,
                capabilities=("evidence_summary", "batch_summary", "failure_explanation"),
                permissions=("provider_disabled", "no_http_calls", "no_model_calls"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="vllm_local_provider_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="local.llamacpp.disabled",
                display_name="llama.cpp OpenAI-compatible local worker",
                lane=ExecutionLane.LOCAL_READONLY,
                adapter_type=WorkerAdapterType.LOCAL_OPENAI_COMPATIBLE,
                capabilities=("evidence_summary", "small_model_review", "failure_explanation"),
                permissions=("provider_disabled", "no_http_calls", "no_model_calls"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="llamacpp_local_provider_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="subscription.handoff",
                display_name="Subscription handoff target",
                lane=ExecutionLane.SUBSCRIPTION_HANDOFF,
                adapter_type=WorkerAdapterType.SUBSCRIPTION_HANDOFF,
                capabilities=("handoff_package", "implementation_context", "review_context"),
                permissions=("package_only", "no_agent_launch"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="direct_subscription_launch_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="subscription.agent.disabled",
                display_name="Disabled subscription agent launch stub",
                lane=ExecutionLane.SUBSCRIPTION_AGENT,
                adapter_type=WorkerAdapterType.SUBSCRIPTION_AGENT,
                capabilities=("launch_estimate", "launch_instructions", "approval_requirements"),
                permissions=("stub_only", "no_process_launch", "no_cli_agent_calls"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="subscription_agent_process_launch_not_enabled",
            ),
            WorkerRegistryEntry(
                worker_id="premium.approval",
                display_name="Premium approval lane",
                lane=ExecutionLane.PREMIUM_APPROVAL,
                adapter_type=WorkerAdapterType.PREMIUM_APPROVAL,
                capabilities=("architecture_review", "security_review", "high_impact_validation"),
                permissions=("approval_artifact_only", "no_premium_execution"),
                health=WorkerHealthStatus.DISABLED,
                disabled_reason="premium_execution_requires_operator_approval_flow",
            ),
        )
