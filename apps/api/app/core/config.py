from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    environment: str = "development"
    version: str = "0.1.0"
    api_prefix: str = "/api"
    database_url: str = "sqlite:///./data.db"
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
