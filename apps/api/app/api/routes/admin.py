"""Admin API routes for managing API keys and upstreams.

All endpoints require admin authentication (Bearer token from ADMIN_TOKEN env var).
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, verify_admin_token
from app.models.schemas import (
    APIKeyCreate,
    APIKeyCreateResponse,
    PaginatedAPIKeysResponse,
    PaginatedRequestLogsResponse,
    PaginatedUpstreamsResponse,
    StatsLeaderboardResponse,
    StatsOverviewResponse,
    StatsTimeseriesResponse,
    UpstreamCreate,
    UpstreamResponse,
    UpstreamUpdate,
)
from app.services import key_manager, request_logger, stats_service, upstream_service

router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================================
# API Key Management Endpoints
# ============================================================================


@router.post(
    "/keys",
    response_model=APIKeyCreateResponse,
    status_code=201,
    dependencies=[Depends(verify_admin_token)],
    summary="Create a new API key",
    description="Generate and store a new API key with permissions for specified upstreams. "
    "The full key value is returned ONLY in this response and cannot be retrieved later.",
)
async def create_api_key(
    body: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
) -> APIKeyCreateResponse:
    """Create a new API key.

    Args:
        body: API key creation parameters
        db: Database session

    Returns:
        APIKeyCreateResponse: Created API key with full key_value (only shown once)

    Raises:
        HTTPException(400): Invalid upstream IDs
    """
    try:
        api_key = await key_manager.create_api_key(
            db=db,
            name=body.name,
            upstream_ids=body.upstream_ids,
            description=body.description,
            expires_at=body.expires_at,
        )
        return api_key
    except ValueError as e:
        logger.warning(f"Failed to create API key: {e}")
        raise HTTPException(
            status_code=400, detail={"error": "invalid_request", "message": str(e)}
        ) from e


@router.get(
    "/keys",
    response_model=PaginatedAPIKeysResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="List all API keys",
    description="Retrieve a paginated list of API keys. Keys are masked (only prefix shown).",
)
async def list_api_keys(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedAPIKeysResponse:
    """List all API keys with pagination.

    Args:
        page: Page number (1-indexed)
        page_size: Number of items per page
        db: Database session

    Returns:
        PaginatedAPIKeysResponse: Paginated list of API keys
    """
    return await key_manager.list_api_keys(db=db, page=page, page_size=page_size)


@router.delete(
    "/keys/{key_id}",
    status_code=204,
    dependencies=[Depends(verify_admin_token)],
    summary="Delete an API key",
    description="Permanently delete an API key from the database.",
)
async def delete_api_key_endpoint(
    key_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an API key.

    Args:
        key_id: ID of the API key to delete
        db: Database session

    Raises:
        HTTPException(404): API key not found
    """
    try:
        await key_manager.delete_api_key(db=db, key_id=key_id)
    except ValueError as e:
        logger.warning(f"Failed to delete API key: {e}")
        raise HTTPException(
            status_code=404, detail={"error": "not_found", "message": str(e)}
        ) from e


# ============================================================================
# Upstream Management Endpoints
# ============================================================================


@router.post(
    "/upstreams",
    response_model=UpstreamResponse,
    status_code=201,
    dependencies=[Depends(verify_admin_token)],
    summary="Create a new upstream",
    description="Add a new upstream service. The API key is encrypted before storage.",
)
async def create_upstream(
    body: UpstreamCreate,
    db: AsyncSession = Depends(get_db),
) -> UpstreamResponse:
    """Create a new upstream.

    Args:
        body: Upstream creation parameters
        db: Database session

    Returns:
        UpstreamResponse: Created upstream with masked API key

    Raises:
        HTTPException(400): Upstream name already exists
    """
    try:
        upstream = await upstream_service.create_upstream(
            db=db,
            name=body.name,
            provider=body.provider,
            base_url=body.base_url,
            api_key=body.api_key,
            is_default=body.is_default,
            timeout=body.timeout,
            config=body.config,
        )
        return upstream
    except ValueError as e:
        logger.warning(f"Failed to create upstream: {e}")
        raise HTTPException(
            status_code=400, detail={"error": "invalid_request", "message": str(e)}
        ) from e


@router.get(
    "/upstreams",
    response_model=PaginatedUpstreamsResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="List all upstreams",
    description="Retrieve a paginated list of upstreams. API keys are masked (e.g., 'sk-***1234').",
)
async def list_upstreams(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedUpstreamsResponse:
    """List all upstreams with pagination.

    Args:
        page: Page number (1-indexed)
        page_size: Number of items per page
        db: Database session

    Returns:
        PaginatedUpstreamsResponse: Paginated list of upstreams
    """
    return await upstream_service.list_upstreams(db=db, page=page, page_size=page_size)


@router.put(
    "/upstreams/{upstream_id}",
    response_model=UpstreamResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="Update an upstream",
    description="Update upstream configuration. Only provided fields are updated. "
    "If api_key is provided, it will be re-encrypted.",
)
async def update_upstream(
    upstream_id: UUID,
    body: UpstreamUpdate,
    db: AsyncSession = Depends(get_db),
) -> UpstreamResponse:
    """Update an existing upstream.

    Args:
        upstream_id: ID of the upstream to update
        body: Update parameters (all fields optional)
        db: Database session

    Returns:
        UpstreamResponse: Updated upstream with masked API key

    Raises:
        HTTPException(404): Upstream not found
        HTTPException(400): Name conflict
    """
    try:
        upstream = await upstream_service.update_upstream(
            db=db,
            upstream_id=upstream_id,
            name=body.name,
            provider=body.provider,
            base_url=body.base_url,
            api_key=body.api_key,
            is_default=body.is_default,
            timeout=body.timeout,
            is_active=body.is_active,
            config=body.config,
        )
        return upstream
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=404, detail={"error": "not_found", "message": error_msg}
            ) from e
        else:
            raise HTTPException(
                status_code=400, detail={"error": "invalid_request", "message": error_msg}
            ) from e


@router.delete(
    "/upstreams/{upstream_id}",
    status_code=204,
    dependencies=[Depends(verify_admin_token)],
    summary="Delete an upstream",
    description="Permanently delete an upstream from the database. API keys referencing this upstream will lose access to it.",
)
async def delete_upstream(
    upstream_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an upstream.

    Args:
        upstream_id: ID of the upstream to delete
        db: Database session

    Raises:
        HTTPException(404): Upstream not found
    """
    try:
        await upstream_service.delete_upstream(db=db, upstream_id=upstream_id)
    except ValueError as e:
        logger.warning(f"Failed to delete upstream: {e}")
        raise HTTPException(
            status_code=404, detail={"error": "not_found", "message": str(e)}
        ) from e


# ============================================================================
# Request Log Endpoints
# ============================================================================


@router.get(
    "/logs",
    response_model=PaginatedRequestLogsResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="List request logs",
    description="Retrieve a paginated list of request logs with optional filtering.",
)
async def list_request_logs(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    api_key_id: UUID | None = Query(None, description="Filter by API key ID"),
    upstream_id: UUID | None = Query(None, description="Filter by upstream ID"),
    status_code: int | None = Query(None, description="Filter by HTTP status code"),
    start_time: str | None = Query(None, description="Filter by start time (ISO 8601 format)"),
    end_time: str | None = Query(None, description="Filter by end time (ISO 8601 format)"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedRequestLogsResponse:
    """List request logs with pagination and optional filtering.

    Args:
        page: Page number (1-indexed)
        page_size: Number of items per page
        api_key_id: Filter by API key ID
        upstream_id: Filter by upstream ID
        status_code: Filter by HTTP status code
        start_time: Filter by start time (ISO 8601 format)
        end_time: Filter by end time (ISO 8601 format)
        db: Database session

    Returns:
        PaginatedRequestLogsResponse: Paginated list of request logs
    """
    # Parse datetime strings if provided
    parsed_start_time = None
    parsed_end_time = None

    if start_time:
        try:
            parsed_start_time = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_request",
                    "message": f"Invalid start_time format: {start_time}",
                },
            ) from e

    if end_time:
        try:
            parsed_end_time = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "invalid_request",
                    "message": f"Invalid end_time format: {end_time}",
                },
            ) from e

    return await request_logger.list_request_logs(
        db=db,
        page=page,
        page_size=page_size,
        api_key_id=api_key_id,
        upstream_id=upstream_id,
        status_code=status_code,
        start_time=parsed_start_time,
        end_time=parsed_end_time,
    )


# ============================================================================
# Statistics Endpoints
# ============================================================================


@router.get(
    "/stats/overview",
    response_model=StatsOverviewResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="Get dashboard overview statistics",
    description="Returns high-level metrics for today including request count, "
    "average response time, token usage, and success rate.",
)
async def get_stats_overview(
    db: AsyncSession = Depends(get_db),
) -> StatsOverviewResponse:
    """Get overview statistics for the dashboard.

    Returns:
        StatsOverviewResponse: Today's metrics including requests, tokens, and success rate
    """
    return await stats_service.get_overview_stats(db=db)


@router.get(
    "/stats/timeseries",
    response_model=StatsTimeseriesResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="Get time series statistics",
    description="Returns time series data grouped by upstream for chart visualization. "
    "Supports different time ranges (today, 7d, 30d) with automatic granularity selection.",
)
async def get_stats_timeseries(
    range: str = Query(
        "7d",
        description="Time range: 'today', '7d', or '30d'",
        pattern="^(today|7d|30d)$",
    ),
    db: AsyncSession = Depends(get_db),
) -> StatsTimeseriesResponse:
    """Get time series statistics grouped by upstream.

    Args:
        range: Time range (today, 7d, 30d)
        db: Database session

    Returns:
        StatsTimeseriesResponse: Time series data for chart visualization
    """
    # Validate and cast range to the expected type
    if range not in ("today", "7d", "30d"):
        range = "7d"

    return await stats_service.get_timeseries_stats(
        db=db,
        range_type=range,  # type: ignore[arg-type]
    )


@router.get(
    "/stats/leaderboard",
    response_model=StatsLeaderboardResponse,
    dependencies=[Depends(verify_admin_token)],
    summary="Get leaderboard statistics",
    description="Returns top performers across different dimensions: "
    "API keys, upstreams, and models ranked by usage.",
)
async def get_stats_leaderboard(
    range: str = Query(
        "7d",
        description="Time range: 'today', '7d', or '30d'",
        pattern="^(today|7d|30d)$",
    ),
    limit: int = Query(
        5,
        ge=1,
        le=50,
        description="Maximum number of items per category (1-50)",
    ),
    db: AsyncSession = Depends(get_db),
) -> StatsLeaderboardResponse:
    """Get leaderboard statistics for top performers.

    Args:
        range: Time range (today, 7d, 30d)
        limit: Maximum items per category (default 5, max 50)
        db: Database session

    Returns:
        StatsLeaderboardResponse: Top API keys, upstreams, and models
    """
    # Validate and cast range to the expected type
    if range not in ("today", "7d", "30d"):
        range = "7d"

    return await stats_service.get_leaderboard_stats(
        db=db,
        range_type=range,  # type: ignore[arg-type]
        limit=limit,
    )
