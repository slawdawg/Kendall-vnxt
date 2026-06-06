from functools import lru_cache
from pathlib import Path

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
    allow_dirty_repo: bool = Field(default=False, alias="SUPERVISOR_ALLOW_DIRTY_REPO")
    lease_ttl_seconds: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def ensure_data_dir(self) -> None:
        if self.database_url.startswith("sqlite"):
            Path(".data").mkdir(exist_ok=True)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_data_dir()
    return settings
