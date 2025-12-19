"""Upstream configuration models."""

from enum import Enum

from pydantic import BaseModel, Field, HttpUrl, SecretStr


class Provider(str, Enum):
    """Supported AI service providers."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class UpstreamConfig(BaseModel):
    """Configuration for an upstream AI service."""

    name: str = Field(..., description="Unique identifier for this upstream")
    provider: Provider = Field(..., description="Provider type (openai or anthropic)")
    base_url: HttpUrl = Field(..., description="Base URL for the upstream API")
    api_key: SecretStr = Field(..., description="API key for authentication")
    is_default: bool = Field(default=False, description="Whether this is the default upstream")
    timeout: int = Field(default=60, description="Request timeout in seconds", ge=1)


class UpstreamManager:
    """Manager for upstream configurations."""

    def __init__(self, upstreams: list[UpstreamConfig]):
        """Initialize the upstream manager.

        Args:
            upstreams: List of upstream configurations

        Raises:
            ValueError: If no upstreams provided or multiple defaults specified
        """
        if not upstreams:
            raise ValueError("At least one upstream must be configured")

        self.upstreams = {u.name: u for u in upstreams}

        # Find default upstream
        defaults = [u for u in upstreams if u.is_default]
        if len(defaults) > 1:
            raise ValueError("Only one upstream can be marked as default")

        self.default_upstream = defaults[0] if defaults else upstreams[0]

    def get_upstream(self, name: str | None = None) -> UpstreamConfig:
        """Get an upstream by name, or the default if name not provided.

        Args:
            name: Optional upstream name

        Returns:
            The requested upstream configuration

        Raises:
            KeyError: If the named upstream does not exist
        """
        if name is None:
            return self.default_upstream

        if name not in self.upstreams:
            available = list(self.upstreams.keys())
            raise KeyError(f"Upstream '{name}' not found. Available upstreams: {available}")

        return self.upstreams[name]

    def list_upstreams(self) -> list[dict[str, str]]:
        """List all available upstreams without exposing sensitive data.

        Returns:
            List of dicts containing name, provider, and is_default for each upstream
        """
        return [
            {
                "name": u.name,
                "provider": u.provider.value,
                "is_default": str(u.is_default),
            }
            for u in self.upstreams.values()
        ]
