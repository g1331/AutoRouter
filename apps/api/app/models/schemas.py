"""Pydantic schemas for API request/response validation.

This module defines the data transfer objects (DTOs) for Admin API endpoints.
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ============================================================================
# API Key Schemas
# ============================================================================


class APIKeyCreate(BaseModel):
    """Schema for creating a new API key.

    Attributes:
        name: Human-readable name for the key
        description: Optional description of the key's purpose
        upstream_ids: List of upstream IDs this key can access (required, non-empty)
        expires_at: Optional expiration timestamp
    """

    name: str = Field(..., min_length=1, max_length=255, description="Name of the API key")
    description: str | None = Field(None, description="Optional description")
    upstream_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="List of upstream IDs this key can access (at least one required)",
    )
    expires_at: datetime | None = Field(None, description="Optional expiration timestamp (UTC)")


class APIKeyResponse(BaseModel):
    """Schema for API key response (list/get operations).

    Note: The full key value is NEVER returned (only shown once during creation).
    """

    id: UUID
    key_prefix: str = Field(..., description="First 12 characters (e.g., 'sk-auto-xxxx')")
    name: str
    description: str | None
    upstream_ids: list[UUID] = Field(..., description="List of authorized upstream IDs")
    is_active: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreateResponse(BaseModel):
    """Schema for API key creation response.

    This is the ONLY time the full key value is returned.
    """

    id: UUID
    key_value: str = Field(..., description="Full API key value (ONLY shown once)")
    key_prefix: str
    name: str
    description: str | None
    upstream_ids: list[UUID]
    is_active: bool
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class APIKeyRevealResponse(BaseModel):
    """Schema for API key reveal response.

    Returns the full decrypted key value. Only available for keys with encryption.
    """

    id: UUID
    key_value: str = Field(..., description="Full decrypted API key value")
    key_prefix: str
    name: str

    model_config = {"from_attributes": True}


# ============================================================================
# Upstream Schemas
# ============================================================================


class UpstreamCreate(BaseModel):
    """Schema for creating a new upstream.

    Attributes:
        name: Unique upstream name (used in X-Upstream-Name header)
        provider: Provider type ('openai', 'anthropic', etc.)
        base_url: Base URL for the upstream API
        api_key: Plaintext upstream API key (will be encrypted before storage)
        is_default: Whether this is the default upstream
        timeout: Request timeout in seconds
        config: Optional JSON configuration
    """

    name: str = Field(..., min_length=1, max_length=64, description="Unique upstream name")
    provider: str = Field(
        ..., min_length=1, max_length=32, description="Provider type (openai, anthropic, etc.)"
    )
    base_url: str = Field(..., description="Base URL for the upstream API")
    api_key: str = Field(..., min_length=1, description="Upstream API key (will be encrypted)")
    is_default: bool = Field(False, description="Whether this is the default upstream")
    timeout: int = Field(60, ge=1, le=300, description="Request timeout in seconds (1-300)")
    config: str | None = Field(None, description="Optional JSON configuration")


class UpstreamUpdate(BaseModel):
    """Schema for updating an existing upstream.

    All fields are optional - only provided fields will be updated.
    """

    name: str | None = Field(None, min_length=1, max_length=64, description="Upstream name")
    provider: str | None = Field(None, min_length=1, max_length=32, description="Provider type")
    base_url: str | None = Field(None, description="Base URL")
    api_key: str | None = Field(
        None, min_length=1, description="New API key (will be re-encrypted)"
    )
    is_default: bool | None = Field(None, description="Default upstream flag")
    timeout: int | None = Field(None, ge=1, le=300, description="Request timeout")
    is_active: bool | None = Field(None, description="Active status")
    config: str | None = Field(None, description="JSON configuration")


class UpstreamResponse(BaseModel):
    """Schema for upstream response (list/get operations).

    Note: The api_key is masked (e.g., 'sk-***1234') and never returned in plaintext.
    """

    id: UUID
    name: str
    provider: str
    base_url: str
    api_key_masked: str = Field(..., description="Masked API key (e.g., 'sk-***1234')")
    is_default: bool
    timeout: int
    is_active: bool
    config: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ============================================================================
# Request Log Schemas
# ============================================================================


class RequestLogResponse(BaseModel):
    """Schema for request log response.

    Note: Only metadata is returned (no request/response bodies).
    """

    id: UUID
    api_key_id: UUID | None
    upstream_id: UUID | None
    method: str | None
    path: str | None
    model: str | None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    status_code: int | None
    duration_ms: int | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ============================================================================
# Paginated Response Schemas
# ============================================================================


class PaginatedAPIKeysResponse(BaseModel):
    """Paginated list of API keys."""

    items: list[APIKeyResponse]
    total: int = Field(..., description="Total number of items across all pages")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Number of items per page")
    total_pages: int = Field(..., description="Total number of pages")


class PaginatedUpstreamsResponse(BaseModel):
    """Paginated list of upstreams."""

    items: list[UpstreamResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PaginatedRequestLogsResponse(BaseModel):
    """Paginated list of request logs."""

    items: list[RequestLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# Statistics Schemas
# ============================================================================


class StatsOverviewResponse(BaseModel):
    """Dashboard overview statistics.

    Provides high-level metrics for the current day.
    """

    today_requests: int = Field(..., description="Total requests today")
    avg_response_time_ms: float = Field(..., description="Average response time in ms")
    total_tokens_today: int = Field(..., description="Total tokens consumed today")
    success_rate_today: float = Field(..., description="Success rate percentage (0-100)")


class TimeseriesDataPoint(BaseModel):
    """Single data point in a timeseries.

    Represents aggregated metrics for a specific time bucket.
    """

    timestamp: datetime = Field(..., description="Start of the time bucket (UTC)")
    request_count: int = Field(..., description="Number of requests in this bucket")
    total_tokens: int = Field(..., description="Total tokens consumed in this bucket")
    avg_duration_ms: float = Field(..., description="Average response time in ms")


class UpstreamTimeseriesData(BaseModel):
    """Timeseries data grouped by upstream.

    Contains all data points for a single upstream provider.
    """

    upstream_id: UUID | None = Field(..., description="Upstream ID (null for unknown)")
    upstream_name: str = Field(..., description="Upstream display name")
    data: list[TimeseriesDataPoint] = Field(..., description="Time-ordered data points")


class StatsTimeseriesResponse(BaseModel):
    """Timeseries statistics response.

    Contains data series grouped by upstream for chart visualization.
    """

    range: str = Field(..., description="Time range (today, 7d, 30d)")
    granularity: str = Field(..., description="Data granularity (hour, day)")
    series: list[UpstreamTimeseriesData] = Field(..., description="Data series by upstream")


class LeaderboardAPIKeyItem(BaseModel):
    """API Key leaderboard entry."""

    id: UUID
    name: str = Field(..., description="API key name")
    key_prefix: str = Field(..., description="Key prefix (e.g., 'sk-auto-xxxx')")
    request_count: int = Field(..., description="Total requests made")
    total_tokens: int = Field(..., description="Total tokens consumed")


class LeaderboardUpstreamItem(BaseModel):
    """Upstream leaderboard entry."""

    id: UUID
    name: str = Field(..., description="Upstream name")
    provider: str = Field(..., description="Provider type (openai, anthropic)")
    request_count: int = Field(..., description="Total requests handled")
    total_tokens: int = Field(..., description="Total tokens processed")


class LeaderboardModelItem(BaseModel):
    """Model leaderboard entry."""

    model: str = Field(..., description="Model name (e.g., gpt-4o, claude-3)")
    request_count: int = Field(..., description="Total requests using this model")
    total_tokens: int = Field(..., description="Total tokens consumed by this model")


class StatsLeaderboardResponse(BaseModel):
    """Leaderboard statistics response.

    Contains top performers across different dimensions.
    """

    range: str = Field(..., description="Time range for the leaderboard")
    api_keys: list[LeaderboardAPIKeyItem] = Field(..., description="Top API keys by usage")
    upstreams: list[LeaderboardUpstreamItem] = Field(..., description="Top upstreams by usage")
    models: list[LeaderboardModelItem] = Field(..., description="Top models by usage")
