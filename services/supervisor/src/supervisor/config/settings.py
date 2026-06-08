from functools import lru_cache
from pathlib import Path
import re

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
    allow_local_provider_calls: bool = Field(default=False, alias="SUPERVISOR_ALLOW_LOCAL_PROVIDER_CALLS")
    allow_premium_execution: bool = Field(default=False, alias="SUPERVISOR_ALLOW_PREMIUM_EXECUTION")
    allow_arbitrary_shell_execution: bool = Field(default=False, alias="SUPERVISOR_ALLOW_ARBITRARY_SHELL_EXECUTION")
    allow_worker_source_mutation: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_SOURCE_MUTATION")
    allow_worker_network: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_NETWORK")
    allow_worker_credentials: bool = Field(default=False, alias="SUPERVISOR_ALLOW_WORKER_CREDENTIALS")
    lease_ttl_seconds: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def ensure_data_dir(self) -> None:
        if self.database_url.startswith("sqlite"):
            Path(".data").mkdir(exist_ok=True)

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
