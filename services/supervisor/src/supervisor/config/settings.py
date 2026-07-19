from functools import lru_cache
import os
from pathlib import Path
import re
import stat
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Kendall Supervisor"
    database_url: str = Field(
        default="sqlite+aiosqlite:///./.data/supervisor.db",
        alias="SUPERVISOR_DATABASE_URL",
    )
    poll_interval_seconds: int = Field(default=5, alias="SUPERVISOR_POLL_INTERVAL_SECONDS")
    enable_background: bool = Field(default=True, alias="SUPERVISOR_ENABLE_BACKGROUND")
    supervisor_port: int = Field(default=8000, ge=1, le=65535, alias="SUPERVISOR_PORT")
    lan_auth_enabled: bool = Field(default=False, alias="KENDALL_LAN_AUTH_ENABLED")
    lan_auth_bootstrap_password_file: str | None = Field(
        default=None,
        alias="KENDALL_DASHBOARD_BOOTSTRAP_PASSWORD_FILE",
    )
    supervisor_uds_path: str | None = Field(default=None, alias="KENDALL_SUPERVISOR_UDS_PATH")
    supervisor_transport: str = Field(default="loopback", alias="KENDALL_SUPERVISOR_TRANSPORT")
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="SUPERVISOR_CORS_ORIGINS",
    )
    cors_origin_regex: str = Field(
        default=r"^https?://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\]):3000$",
        alias="SUPERVISOR_CORS_ORIGIN_REGEX",
    )
    allow_dirty_repo: bool = Field(default=False, alias="SUPERVISOR_ALLOW_DIRTY_REPO")
    allow_remote_delivery: bool = Field(default=False, alias="SUPERVISOR_ALLOW_REMOTE_DELIVERY")
    allow_subscription_agent_launch: bool = Field(default=False, alias="SUPERVISOR_ALLOW_SUBSCRIPTION_AGENT_LAUNCH")
    allow_codex_subscription_agent_launch: bool = Field(
        default=False,
        alias="SUPERVISOR_ALLOW_CODEX_SUBSCRIPTION_AGENT_LAUNCH",
    )
    allow_claude_subscription_agent_launch: bool = Field(
        default=False,
        alias="SUPERVISOR_ALLOW_CLAUDE_SUBSCRIPTION_AGENT_LAUNCH",
    )
    allow_gemini_subscription_agent_launch: bool = Field(
        default=False,
        alias="SUPERVISOR_ALLOW_GEMINI_SUBSCRIPTION_AGENT_LAUNCH",
    )
    accepted_subscription_runtime_approval_ids: str = Field(
        default="",
        alias="SUPERVISOR_ACCEPTED_SUBSCRIPTION_RUNTIME_APPROVAL_IDS",
    )
    allow_local_provider_calls: bool = Field(default=True, alias="SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS")
    allow_ollama_provider_calls: bool = Field(default=True, alias="SUPERVISOR_ALLOW_OLLAMA_PROVIDER_CALLS")
    allow_automatic_ollama_local_evidence: bool = Field(default=True, alias="SUPERVISOR_ALLOW_AUTOMATIC_OLLAMA_LOCAL_EVIDENCE")
    ollama_endpoint_url: str | None = Field(
        default="http://192.168.1.128:11434/v1/chat/completions",
        alias="SUPERVISOR_OLLAMA_ENDPOINT_URL",
    )
    ollama_approved_endpoint_url: str = Field(
        default="http://192.168.1.128:11434/v1/chat/completions",
        alias="SUPERVISOR_OLLAMA_APPROVED_ENDPOINT_URL",
    )
    ollama_approved_source_vm: str = Field(default="192.168.1.8", alias="SUPERVISOR_OLLAMA_APPROVED_SOURCE_VM")
    ollama_model_id: str | None = Field(default="qwen3:14b", alias="SUPERVISOR_OLLAMA_MODEL_ID")
    ollama_approved_model_id: str = Field(default="qwen3:14b", alias="SUPERVISOR_OLLAMA_APPROVED_MODEL_ID")
    # Keep canonical route values bounded and parseable from string-valued env
    # vars; the provider gate separately rejects any non-canonical override.
    ollama_connect_timeout_seconds: int = Field(default=2, ge=1, le=120, alias="SUPERVISOR_OLLAMA_CONNECT_TIMEOUT_SECONDS")
    ollama_total_timeout_seconds: int = Field(default=120, ge=1, le=600, alias="SUPERVISOR_OLLAMA_TOTAL_TIMEOUT_SECONDS")
    allow_premium_execution: bool = Field(default=False, alias="SUPERVISOR_ALLOW_PREMIUM_EXECUTION")
    allow_arbitrary_shell_execution: bool = Field(default=False, alias="SUPERVISOR_ALLOW_ARBITRARY_SHELL_EXECUTION")
    allow_worker_source_mutation: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_SOURCE_MUTATION")
    allow_worker_network: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_NETWORK")
    allow_worker_credentials: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_CREDENTIALS")
    pipeline_product_mode: Literal["contract_only", "operator_review", "local_proof", "read_only", "bounded_write"] = Field(
        default="contract_only",
        alias="SUPERVISOR_PIPELINE_PRODUCT_MODE",
    )
    pipeline_epic_25_source_revision: str | None = Field(
        default=None,
        pattern=r"^[a-f0-9]{40}$",
        alias="SUPERVISOR_PIPELINE_EPIC_25_SOURCE_REVISION",
    )
    enable_local_dogfood_attestation: bool = Field(
        default=False,
        alias="SUPERVISOR_ENABLE_LOCAL_DOGFOOD_ATTESTATION",
    )
    local_dogfood_attestation_issuer_registry: str = Field(
        default="[]",
        alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ISSUER_REGISTRY",
    )
    local_dogfood_attestation_socket_path: str | None = Field(
        default=None, alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_SOCKET_PATH"
    )
    local_dogfood_attestation_api_socket_path: str | None = Field(
        default=None, alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_API_SOCKET_PATH"
    )
    local_dogfood_attestation_envelope_secret_file: str | None = Field(
        default=None, alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_ENVELOPE_SECRET_FILE"
    )
    local_dogfood_attestation_bind_host: str = Field(
        default="127.0.0.1", alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_BIND_HOST"
    )
    local_dogfood_attestation_trust_proxy_headers: bool = Field(
        default=False, alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_TRUST_PROXY_HEADERS"
    )
    local_dogfood_attestation_no_proxy: bool = Field(
        default=True, alias="SUPERVISOR_LOCAL_DOGFOOD_ATTESTATION_NO_PROXY"
    )
    obsidian_memory_config_path: str | None = Field(default=None, alias="SUPERVISOR_OBSIDIAN_MEMORY_CONFIG")
    lease_ttl_seconds: int = 30
    review_wip_limit: int = Field(default=1, ge=1, alias="SUPERVISOR_REVIEW_WIP_LIMIT")
    deliver_wip_limit: int = Field(default=1, ge=1, alias="SUPERVISOR_DELIVER_WIP_LIMIT")
    verification_wip_limit: int = Field(default=1, ge=1, alias="SUPERVISOR_VERIFICATION_WIP_LIMIT")
    operator_testing_wip_limit: int = Field(default=1, ge=1, alias="SUPERVISOR_OPERATOR_TESTING_WIP_LIMIT")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def ensure_data_dir(self) -> None:
        if self.database_url.startswith("sqlite"):
            Path(".data").mkdir(exist_ok=True)

    def validate_local_dogfood_attestation_deployment(self) -> None:
        """Fail startup closed; this feature is private-UDS and local-only."""
        if not self.enable_local_dogfood_attestation:
            return
        from ipaddress import ip_address
        try:
            loopback = ip_address(self.local_dogfood_attestation_bind_host).is_loopback
        except ValueError:
            loopback = False
        if (
            not loopback
            or not self.local_dogfood_attestation_no_proxy
            or self.local_dogfood_attestation_trust_proxy_headers
            or not self.local_dogfood_attestation_envelope_secret_file
            or not (self.local_dogfood_attestation_api_socket_path or self.supervisor_uds_path)
        ):
            raise ValueError(
                "local dogfood attestation requires a private API UDS, loopback configuration, "
                "no proxy headers, and an envelope secret file"
            )
        if self.lan_auth_enabled and self.local_dogfood_attestation_api_socket_path and self.local_dogfood_attestation_api_socket_path != self.supervisor_uds_path:
            raise ValueError("LAN-auth local dogfood attestation must use the authenticated supervisor UDS")
        secret_path = Path(self.local_dogfood_attestation_envelope_secret_file)
        try:
            secret_info = secret_path.lstat()
            parent_info = secret_path.parent.lstat()
        except OSError as exc:
            raise ValueError("local dogfood attestation envelope secret file must exist and be owner-readable only") from exc
        if (
            stat.S_ISLNK(secret_info.st_mode)
            or not stat.S_ISREG(secret_info.st_mode)
            or secret_info.st_uid != os.geteuid()
            or secret_info.st_mode & 0o077
            or stat.S_ISLNK(parent_info.st_mode)
            or not stat.S_ISDIR(parent_info.st_mode)
            or parent_info.st_uid != os.geteuid()
            or parent_info.st_mode & 0o077
        ):
            raise ValueError("local dogfood attestation envelope secret file must exist and be owner-readable only")
        try:
            from supervisor.application.local_dogfood_attestation import _issuer_registry, read_owner_private_secret
            read_owner_private_secret(str(secret_path))
            _issuer_registry(self.local_dogfood_attestation_issuer_registry)
        except Exception as exc:
            raise ValueError("local dogfood attestation issuer registry or envelope secret is invalid") from exc
        api_socket = Path(self.local_dogfood_attestation_api_socket_path or self.supervisor_uds_path or "")
        parent = api_socket.parent
        try:
            parent_details = parent.lstat()
        except OSError as exc:
            raise ValueError("local dogfood attestation API socket parent must exist") from exc
        if parent.is_symlink() or parent_details.st_uid != os.geteuid() or parent_details.st_mode & 0o077:
            raise ValueError("local dogfood attestation API socket parent must be private and owner-controlled")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cors_origin_pattern(self) -> re.Pattern[str]:
        return re.compile(self.cors_origin_regex)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_data_dir()
    return settings
