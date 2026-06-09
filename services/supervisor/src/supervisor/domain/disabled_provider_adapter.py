from dataclasses import dataclass

from supervisor.domain.worker_registry import WorkerRegistryEntry


@dataclass(frozen=True)
class DisabledProviderProof:
    worker_id: str
    provider_label: str
    disabled_reason: str
    endpoint_policy: str
    http_calls_attempted: bool = False
    model_calls_attempted: bool = False
    network_access_attempted: bool = False
    credential_access_attempted: bool = False
    redaction_checks: tuple[str, ...] = (
        "no_secrets_in_prompt_fixture",
        "no_environment_values_in_payload",
        "no_provider_request_body_retention",
    )


class DisabledLocalProviderAdapter:
    endpoint_policy = "deny_all_local_provider_endpoints_until_provider_specific_policy_approval"

    def prove_disabled(self, worker: WorkerRegistryEntry) -> DisabledProviderProof:
        return DisabledProviderProof(
            worker_id=worker.worker_id,
            provider_label=worker.display_name,
            disabled_reason=worker.disabled_reason or "provider_disabled",
            endpoint_policy=self.endpoint_policy,
        )
