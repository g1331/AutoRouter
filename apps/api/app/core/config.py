from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Debug mode - 显示所有请求头 (仅用于调试 AI 工具请求格式)
    debug_log_headers: bool = False

    # Encryption settings
    encryption_key: str | None = None
    encryption_key_file: str | None = None

    # Admin authentication
    admin_token: str | None = None

    # Allow revealing full API key values in admin console
    allow_key_reveal: bool = False

    # Request log retention
    log_retention_days: int = 90


settings = Settings()
