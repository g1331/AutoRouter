"""Statistics service for dashboard analytics.

This service provides aggregated statistics for:
- Overview metrics (today's requests, average response time, token usage)
- Time series data for charts (grouped by upstream)
- Leaderboards (top API keys, upstreams, and models)
"""

from datetime import datetime, timedelta, UTC
from typing import Literal
from uuid import UUID

from loguru import logger
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import APIKey, RequestLog, Upstream
from app.models.schemas import (
    LeaderboardAPIKeyItem,
    LeaderboardModelItem,
    LeaderboardUpstreamItem,
    StatsLeaderboardResponse,
    StatsOverviewResponse,
    StatsTimeseriesResponse,
    TimeseriesDataPoint,
    UpstreamTimeseriesData,
)

# Type alias for time range
TimeRange = Literal["today", "7d", "30d"]


def _get_time_range_start(range_type: TimeRange) -> datetime:
    """Calculate the start datetime for a given time range.

    Args:
        range_type: Time range type (today, 7d, 30d)

    Returns:
        datetime: Start of the time range (UTC)
    """
    now = datetime.now(UTC)

    if range_type == "today":
        # Start of today (midnight UTC)
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_type == "7d":
        # 7 days ago at midnight
        start = now - timedelta(days=7)
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_type == "30d":
        # 30 days ago at midnight
        start = now - timedelta(days=30)
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # Default to today
        return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _get_granularity(range_type: TimeRange) -> str:
    """Determine the appropriate granularity for a time range.

    Args:
        range_type: Time range type

    Returns:
        str: Granularity ('hour' or 'day')
    """
    if range_type == "today":
        return "hour"
    return "day"


async def get_overview_stats(db: AsyncSession) -> StatsOverviewResponse:
    """Get overview statistics for the dashboard.

    Calculates metrics for the current day (UTC):
    - Total requests
    - Average response time
    - Total tokens consumed
    - Success rate (2xx status codes)

    Args:
        db: Database session

    Returns:
        StatsOverviewResponse: Overview statistics
    """
    start_of_today = _get_time_range_start("today")

    # Query for today's aggregated stats
    query = select(
        func.count(RequestLog.id).label("total_requests"),
        func.coalesce(func.avg(RequestLog.duration_ms), 0).label("avg_duration"),
        func.coalesce(func.sum(RequestLog.total_tokens), 0).label("total_tokens"),
        func.count(
            case(
                (RequestLog.status_code.between(200, 299), 1),
                else_=None,
            )
        ).label("success_count"),
    ).where(RequestLog.created_at >= start_of_today)

    result = await db.execute(query)
    row = result.one()

    total_requests = row.total_requests or 0
    avg_duration = float(row.avg_duration) if row.avg_duration else 0.0
    total_tokens = row.total_tokens or 0
    success_count = row.success_count or 0

    # Calculate success rate
    success_rate = (success_count / total_requests * 100) if total_requests > 0 else 100.0

    logger.debug(
        f"Overview stats: requests={total_requests}, avg_duration={avg_duration:.1f}ms, "
        f"tokens={total_tokens}, success_rate={success_rate:.1f}%"
    )

    return StatsOverviewResponse(
        today_requests=total_requests,
        avg_response_time_ms=round(avg_duration, 1),
        total_tokens_today=total_tokens,
        success_rate_today=round(success_rate, 1),
    )


async def get_timeseries_stats(
    db: AsyncSession,
    range_type: TimeRange = "7d",
) -> StatsTimeseriesResponse:
    """Get time series statistics grouped by upstream.

    Aggregates data into time buckets (hourly for today, daily for longer ranges).

    Args:
        db: Database session
        range_type: Time range (today, 7d, 30d)

    Returns:
        StatsTimeseriesResponse: Time series data grouped by upstream
    """
    start_time = _get_time_range_start(range_type)
    granularity = _get_granularity(range_type)

    # SQLite/PostgreSQL-compatible date truncation
    dialect_name = db.bind.dialect.name if db.bind is not None else ''
    if dialect_name == 'postgresql':
        bucket = 'hour' if granularity == 'hour' else 'day'
        time_bucket = func.to_char(
            func.date_trunc(bucket, RequestLog.created_at),
            'YYYY-MM-DD HH24:MI:SS',
        )
        date_format = "%Y-%m-%d %H:%M:%S"
    else:
        # For 'hour': '%Y-%m-%d %H:00:00', for 'day': '%Y-%m-%d 00:00:00'
        date_format = "%Y-%m-%d %H:00:00" if granularity == "hour" else "%Y-%m-%d 00:00:00"
        time_bucket = func.strftime(date_format, RequestLog.created_at)

    # Query aggregated data grouped by upstream and time bucket
    query = (
        select(
            RequestLog.upstream_id,
            time_bucket.label("time_bucket"),
            func.count(RequestLog.id).label("request_count"),
            func.coalesce(func.sum(RequestLog.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.avg(RequestLog.duration_ms), 0).label("avg_duration"),
        )
        .where(RequestLog.created_at >= start_time)
        .group_by(RequestLog.upstream_id, time_bucket)
        .order_by(time_bucket)
    )

    result = await db.execute(query)
    rows = result.all()

    # Get upstream names for the IDs
    upstream_ids = {row.upstream_id for row in rows if row.upstream_id is not None}
    upstream_map: dict[UUID | None, str] = {None: "Unknown"}

    if upstream_ids:
        upstream_query = select(Upstream.id, Upstream.name).where(Upstream.id.in_(upstream_ids))
        upstream_result = await db.execute(upstream_query)
        for upstream in upstream_result.all():
            upstream_map[upstream.id] = upstream.name

    # Group data by upstream
    upstream_data: dict[UUID | None, list[TimeseriesDataPoint]] = {}

    for row in rows:
        upstream_id = row.upstream_id
        if upstream_id not in upstream_data:
            upstream_data[upstream_id] = []

        # Parse the time bucket string back to datetime using the same format used in strftime
        timestamp = datetime.strptime(row.time_bucket, date_format).replace(tzinfo=UTC)

        upstream_data[upstream_id].append(
            TimeseriesDataPoint(
                timestamp=timestamp,
                request_count=row.request_count,
                total_tokens=row.total_tokens,
                avg_duration_ms=round(float(row.avg_duration), 1),
            )
        )

    # Convert to response format
    series = [
        UpstreamTimeseriesData(
            upstream_id=upstream_id,
            upstream_name=upstream_map.get(upstream_id, "Unknown"),
            data=sorted(data_points, key=lambda x: x.timestamp),
        )
        for upstream_id, data_points in upstream_data.items()
    ]

    # Sort series by upstream name (put "Unknown" last)
    series.sort(key=lambda x: (x.upstream_name == "Unknown", x.upstream_name))

    logger.debug(
        f"Timeseries stats: range={range_type}, granularity={granularity}, "
        f"series_count={len(series)}"
    )

    return StatsTimeseriesResponse(
        range=range_type,
        granularity=granularity,
        series=series,
    )


async def get_leaderboard_stats(
    db: AsyncSession,
    range_type: TimeRange = "7d",
    limit: int = 5,
) -> StatsLeaderboardResponse:
    """Get leaderboard statistics for top performers.

    Returns top API keys, upstreams, and models by usage.

    Args:
        db: Database session
        range_type: Time range (today, 7d, 30d)
        limit: Maximum number of items per category (default 5, max 50)

    Returns:
        StatsLeaderboardResponse: Leaderboard data
    """
    start_time = _get_time_range_start(range_type)
    limit = min(50, max(1, limit))

    # ============================================
    # API Keys Leaderboard
    # ============================================
    api_keys_query = (
        select(
            RequestLog.api_key_id,
            func.count(RequestLog.id).label("request_count"),
            func.coalesce(func.sum(RequestLog.total_tokens), 0).label("total_tokens"),
        )
        .where(RequestLog.created_at >= start_time)
        .where(RequestLog.api_key_id.isnot(None))
        .group_by(RequestLog.api_key_id)
        .order_by(func.count(RequestLog.id).desc())
        .limit(limit)
    )

    api_keys_result = await db.execute(api_keys_query)
    api_keys_rows = api_keys_result.all()

    # Fetch API key details
    api_key_ids = [row.api_key_id for row in api_keys_rows]
    api_key_map: dict[UUID, tuple[str, str]] = {}

    if api_key_ids:
        key_details_query = select(APIKey.id, APIKey.name, APIKey.key_prefix).where(
            APIKey.id.in_(api_key_ids)
        )
        key_details_result = await db.execute(key_details_query)
        for key in key_details_result.all():
            api_key_map[key.id] = (key.name, key.key_prefix)

    api_keys_leaderboard = [
        LeaderboardAPIKeyItem(
            id=row.api_key_id,
            name=api_key_map.get(row.api_key_id, ("Unknown", "sk-****"))[0],
            key_prefix=api_key_map.get(row.api_key_id, ("Unknown", "sk-****"))[1],
            request_count=row.request_count,
            total_tokens=row.total_tokens,
        )
        for row in api_keys_rows
    ]

    # ============================================
    # Upstreams Leaderboard
    # ============================================
    upstreams_query = (
        select(
            RequestLog.upstream_id,
            func.count(RequestLog.id).label("request_count"),
            func.coalesce(func.sum(RequestLog.total_tokens), 0).label("total_tokens"),
        )
        .where(RequestLog.created_at >= start_time)
        .where(RequestLog.upstream_id.isnot(None))
        .group_by(RequestLog.upstream_id)
        .order_by(func.count(RequestLog.id).desc())
        .limit(limit)
    )

    upstreams_result = await db.execute(upstreams_query)
    upstreams_rows = upstreams_result.all()

    # Fetch upstream details
    upstream_ids = [row.upstream_id for row in upstreams_rows]
    upstream_map: dict[UUID, tuple[str, str]] = {}

    if upstream_ids:
        upstream_details_query = select(Upstream.id, Upstream.name, Upstream.provider).where(
            Upstream.id.in_(upstream_ids)
        )
        upstream_details_result = await db.execute(upstream_details_query)
        for upstream in upstream_details_result.all():
            upstream_map[upstream.id] = (upstream.name, upstream.provider)

    upstreams_leaderboard = [
        LeaderboardUpstreamItem(
            id=row.upstream_id,
            name=upstream_map.get(row.upstream_id, ("Unknown", "unknown"))[0],
            provider=upstream_map.get(row.upstream_id, ("Unknown", "unknown"))[1],
            request_count=row.request_count,
            total_tokens=row.total_tokens,
        )
        for row in upstreams_rows
    ]

    # ============================================
    # Models Leaderboard
    # ============================================
    models_query = (
        select(
            RequestLog.model,
            func.count(RequestLog.id).label("request_count"),
            func.coalesce(func.sum(RequestLog.total_tokens), 0).label("total_tokens"),
        )
        .where(RequestLog.created_at >= start_time)
        .where(RequestLog.model.isnot(None))
        .where(RequestLog.model != "")
        .group_by(RequestLog.model)
        .order_by(func.count(RequestLog.id).desc())
        .limit(limit)
    )

    models_result = await db.execute(models_query)
    models_rows = models_result.all()

    models_leaderboard = [
        LeaderboardModelItem(
            model=row.model or "Unknown",
            request_count=row.request_count,
            total_tokens=row.total_tokens,
        )
        for row in models_rows
    ]

    logger.debug(
        f"Leaderboard stats: range={range_type}, limit={limit}, "
        f"api_keys={len(api_keys_leaderboard)}, upstreams={len(upstreams_leaderboard)}, "
        f"models={len(models_leaderboard)}"
    )

    return StatsLeaderboardResponse(
        range=range_type,
        api_keys=api_keys_leaderboard,
        upstreams=upstreams_leaderboard,
        models=models_leaderboard,
    )
