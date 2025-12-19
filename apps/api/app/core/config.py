import json
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models.upstream import UpstreamConfig


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"
    version: str = "0.1.0"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./data.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"

    # Proxy configuration
    proxy_prefix: str = "/proxy"
    upstreams: list[UpstreamConfig] = []

    # Debug mode - 显示所有请求头 (仅用于调试 AI 工具请求格式)
    debug_log_headers: bool = False

    # Encryption settings
    encryption_key: str | None = None
    encryption_key_file: str | None = None

    # Admin authentication
    admin_token: str | None = None

    # Request log retention
    log_retention_days: int = 90

    @field_validator("upstreams", mode="before")
    @classmethod
    def parse_upstreams(cls, v: Any) -> list[UpstreamConfig]:
        """Parse upstreams from JSON string if needed.

        Args:
            v: Raw upstreams value (could be string, list, or dict)

        Returns:
            List of UpstreamConfig objects
        """
        if isinstance(v, str):
            v = json.loads(v)

        if isinstance(v, list):
            return [UpstreamConfig.model_validate(item) for item in v]

        return v


settings = Settings()
