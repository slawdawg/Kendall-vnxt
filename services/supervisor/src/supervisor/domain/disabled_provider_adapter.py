from dataclasses import dataclass

from supervisor.domain.worker_registry import WorkerRegistryEntry


_PROVIDER_FIXTURES = {
    "local.ollama.disabled": {
        "endpoint_family": "ollama_openai_compatible_localhost",
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
    http_calls_attempted: bool = False
    model_calls_attempted: bool = False
    network_access_attempted: bool = False
    credential_access_attempted: bool = False
    redaction_checks: tuple[str, ...] = ()
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
            timeout_policy=fixture["timeout_policy"],
            cancellation_policy=fixture["cancellation_policy"],
            retention_policy=fixture["retention_policy"],
        )
