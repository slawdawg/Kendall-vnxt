from dataclasses import dataclass

from supervisor.domain.worker_registry import WorkerRegistryEntry


_PROVIDER_FIXTURES = {
    "local.ollama.disabled": {
        "endpoint_family": "ollama_openai_compatible_localhost",
        "prompt_construction_sources": (
            "work_item_title",
            "requested_outcome",
            "routing_decision_summary",
            "workflow_event_summaries",
            "local_evidence_packet_summaries",
            "execution_attempt_metadata",
            "workspace_isolation_summary",
        ),
        "rejected_prompt_sources": (
            "secrets",
            "environment_variables",
            "credential_paths",
            "raw_provider_payloads",
            "unrelated_local_files",
            "full_filesystem_snapshots",
        ),
        "retained_evidence_classes": (
            "prompt_summary",
            "response_summary",
            "model_id",
            "endpoint_family",
            "timeout_state",
            "cancellation_state",
            "redaction_state",
            "truncation_state",
            "artifact_references",
        ),
        "attempt_state_mapping": (
            "planned -> provider_precheck_only",
            "cancel_requested -> request_abort_recorded",
            "cancelled -> terminal_cancelled_without_payload",
            "timed_out -> terminal_timed_out_without_payload",
            "failed -> terminal_failure_without_raw_payload",
        ),
        "retry_policy": "retry_requires_new_route_decision_and_fresh_approval",
        "redaction_checks": (
            "ollama_prompt_fixture_excludes_env_values",
            "ollama_payload_fixture_excludes_secret_paths",
            "ollama_response_fixture_retains_summary_only",
        ),
        "timeout_policy": "disabled_fixture_requires_connect_timeout_and_total_timeout_before_enablement",
        "cancellation_policy": "disabled_fixture_requires_request_abort_and_attempt_cancel_mapping",
        "retention_policy": "disabled_fixture_forbids_raw_prompt_or_completion_retention",
    },
    "local.lmstudio.disabled": {
        "endpoint_family": "lm_studio_openai_compatible_localhost",
        "redaction_checks": (
            "lmstudio_prompt_fixture_excludes_env_values",
            "lmstudio_payload_fixture_excludes_secret_paths",
            "lmstudio_response_fixture_retains_summary_only",
        ),
        "timeout_policy": "disabled_fixture_requires_connect_timeout_and_total_timeout_before_enablement",
        "cancellation_policy": "disabled_fixture_requires_request_abort_and_attempt_cancel_mapping",
        "retention_policy": "disabled_fixture_forbids_raw_prompt_or_completion_retention",
    },
    "local.vllm.disabled": {
        "endpoint_family": "vllm_openai_compatible_localhost",
        "redaction_checks": (
            "vllm_prompt_fixture_excludes_env_values",
            "vllm_payload_fixture_excludes_secret_paths",
            "vllm_batch_response_fixture_retains_summary_only",
        ),
        "timeout_policy": "disabled_fixture_requires_queue_timeout_and_total_timeout_before_enablement",
        "cancellation_policy": "disabled_fixture_requires_request_abort_and_batch_job_cancel_mapping",
        "retention_policy": "disabled_fixture_forbids_raw_prompt_completion_or_batch_payload_retention",
    },
    "local.llamacpp.disabled": {
        "endpoint_family": "llamacpp_openai_compatible_localhost",
        "redaction_checks": (
            "llamacpp_prompt_fixture_excludes_env_values",
            "llamacpp_payload_fixture_excludes_secret_paths",
            "llamacpp_response_fixture_retains_summary_only",
        ),
        "timeout_policy": "disabled_fixture_requires_short_context_timeout_and_total_timeout_before_enablement",
        "cancellation_policy": "disabled_fixture_requires_request_abort_and_attempt_cancel_mapping",
        "retention_policy": "disabled_fixture_forbids_raw_prompt_or_completion_retention",
    },
}


@dataclass(frozen=True)
class DisabledProviderProof:
    worker_id: str
    provider_label: str
    disabled_reason: str
    endpoint_family: str
    endpoint_policy: str
    registry_state: str = "disabled"
    broad_gate_enabled: bool = False
    provider_specific_gate_enabled: bool = False
    model_id_configured: bool = False
    adapter_ready: bool = False
    http_calls_attempted: bool = False
    model_calls_attempted: bool = False
    network_access_attempted: bool = False
    credential_access_attempted: bool = False
    redaction_checks: tuple[str, ...] = ()
    prompt_construction_sources: tuple[str, ...] = ()
    rejected_prompt_sources: tuple[str, ...] = ()
    retained_evidence_classes: tuple[str, ...] = ()
    raw_prompt_retention_allowed: bool = False
    raw_completion_retention_allowed: bool = False
    connect_timeout_seconds: int | None = None
    total_timeout_seconds: int | None = None
    attempt_state_mapping: tuple[str, ...] = ()
    retry_policy: str = ""
    timeout_policy: str = ""
    cancellation_policy: str = ""
    retention_policy: str = ""


class DisabledLocalProviderAdapter:
    endpoint_policy = "deny_all_local_provider_endpoints_until_provider_specific_policy_approval"

    def prove_disabled(self, worker: WorkerRegistryEntry) -> DisabledProviderProof:
        fixture = _PROVIDER_FIXTURES.get(
            worker.worker_id,
            {
                "endpoint_family": "unknown_openai_compatible_provider",
                "redaction_checks": (
                    "no_secrets_in_prompt_fixture",
                    "no_environment_values_in_payload",
                    "no_provider_request_body_retention",
                ),
                "prompt_construction_sources": (),
                "rejected_prompt_sources": ("secrets", "environment_variables", "credential_paths"),
                "retained_evidence_classes": ("metadata", "redaction_state", "artifact_references"),
                "attempt_state_mapping": (),
                "retry_policy": "retry_requires_new_route_decision_and_fresh_approval",
                "timeout_policy": "disabled_fixture_requires_timeout_policy_before_enablement",
                "cancellation_policy": "disabled_fixture_requires_cancellation_policy_before_enablement",
                "retention_policy": "disabled_fixture_forbids_raw_prompt_or_completion_retention",
            },
        )
        return DisabledProviderProof(
            worker_id=worker.worker_id,
            provider_label=worker.display_name,
            disabled_reason=worker.disabled_reason or "provider_disabled",
            endpoint_family=fixture["endpoint_family"],
            endpoint_policy=self.endpoint_policy,
            redaction_checks=tuple(fixture["redaction_checks"]),
            prompt_construction_sources=tuple(fixture.get("prompt_construction_sources", ())),
            rejected_prompt_sources=tuple(fixture.get("rejected_prompt_sources", ())),
            retained_evidence_classes=tuple(fixture.get("retained_evidence_classes", ())),
            attempt_state_mapping=tuple(fixture.get("attempt_state_mapping", ())),
            retry_policy=fixture.get("retry_policy", ""),
            timeout_policy=fixture["timeout_policy"],
            cancellation_policy=fixture["cancellation_policy"],
            retention_policy=fixture["retention_policy"],
        )
