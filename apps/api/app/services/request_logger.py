"""Request logging service for audit and analytics.

This service records all proxy requests to the database for:
- Usage tracking and analytics
- Cost analysis (token counts)
- Audit trails
- Debugging and troubleshooting
"""

from datetime import datetime, UTC
from typing import Any
from uuid import UUID, uuid4

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import RequestLog
from app.models.schemas import PaginatedRequestLogsResponse, RequestLogResponse


async def log_request(
    db: AsyncSession,
    api_key_id: UUID | None,
    upstream_id: UUID | None,
    method: str | None,
    path: str | None,
    model: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    status_code: int | None,
    duration_ms: int | None,
    error_message: str | None = None,
) -> RequestLog:
    """Record a proxy request to the database.

    Args:
        db: Database session
        api_key_id: ID of the API key used (nullable for future unauthenticated endpoints)
        upstream_id: ID of the upstream service (nullable if routing failed)
        method: HTTP method (GET, POST, etc.)
        path: Request path
        model: AI model name from request
        prompt_tokens: Number of prompt tokens
        completion_tokens: Number of completion tokens
        total_tokens: Total tokens (prompt + completion)
        status_code: HTTP status code of the response
        duration_ms: Request duration in milliseconds
        error_message: Error message if request failed

    Returns:
        RequestLog: The created log entry
    """
    log_entry = RequestLog(
        id=uuid4(),
        api_key_id=api_key_id,
        upstream_id=upstream_id,
        method=method,
        path=path,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        status_code=status_code,
        duration_ms=duration_ms,
        error_message=error_message,
        created_at=datetime.now(UTC),
    )

    db.add(log_entry)
    await db.flush()  # Flush to get the ID, but don't commit yet

    logger.debug(
        f"Request logged: api_key_id={api_key_id}, upstream_id={upstream_id}, "
        f"status={status_code}, tokens={total_tokens}, duration={duration_ms}ms"
    )

    return log_entry


def _get_int_value(data: dict[str, Any], key: str, default: int = 0) -> int:
    """Safely extract an integer value from a dict with type safety."""
    value = data.get(key, default)
    if isinstance(value, int):
        return value
    if isinstance(value, (float, str)):
        try:
            return int(value)
        except (ValueError, TypeError):
            return default
    return default


def extract_token_usage(response_body: dict[str, Any] | None) -> tuple[int, int, int]:
    """Extract token usage from OpenAI/Anthropic response.

    Handles different response formats from various providers.

    Args:
        response_body: Parsed JSON response from upstream

    Returns:
        tuple: (prompt_tokens, completion_tokens, total_tokens)
    """
    if not response_body:
        return (0, 0, 0)

    # OpenAI format: response.usage.{prompt_tokens, completion_tokens, total_tokens}
    raw_usage = response_body.get("usage")
    if isinstance(raw_usage, dict):
        usage: dict[str, Any] = raw_usage
        prompt_tokens = _get_int_value(usage, "prompt_tokens")
        completion_tokens = _get_int_value(usage, "completion_tokens")
        total_tokens = _get_int_value(usage, "total_tokens", prompt_tokens + completion_tokens)
        if prompt_tokens or completion_tokens or total_tokens:
            return (prompt_tokens, completion_tokens, total_tokens)

        # Anthropic format: response.usage.{input_tokens, output_tokens}
        input_tokens = _get_int_value(usage, "input_tokens")
        output_tokens = _get_int_value(usage, "output_tokens")
        if input_tokens or output_tokens:
            return (input_tokens, output_tokens, input_tokens + output_tokens)

    return (0, 0, 0)


def extract_model_name(
    request_body: dict[str, Any] | None, response_body: dict[str, Any] | None
) -> str | None:
    """Extract model name from request or response.

    Args:
        request_body: Parsed JSON request body
        response_body: Parsed JSON response body

    Returns:
        str | None: Model name if found
    """
    # Try request body first (most reliable)
    if request_body:
        model = request_body.get("model")
        if model:
            return str(model)

    # Fallback to response body
    if response_body:
        model = response_body.get("model")
        if model:
            return str(model)

    return None


async def list_request_logs(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    api_key_id: UUID | None = None,
    upstream_id: UUID | None = None,
    status_code: int | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> PaginatedRequestLogsResponse:
    """List request logs with pagination and optional filtering.

    Args:
        db: Database session
        page: Page number (1-indexed)
        page_size: Number of items per page (max 100)
        api_key_id: Filter by API key ID
        upstream_id: Filter by upstream ID
        status_code: Filter by HTTP status code
        start_time: Filter by start time (inclusive)
        end_time: Filter by end time (inclusive)

    Returns:
        PaginatedRequestLogsResponse: Paginated list of request logs
    """
    # Validate pagination params
    page = max(1, page)
    page_size = min(100, max(1, page_size))

    # Build query with filters
    query = select(RequestLog)
    count_query = select(func.count()).select_from(RequestLog)

    if api_key_id is not None:
        query = query.where(RequestLog.api_key_id == api_key_id)
        count_query = count_query.where(RequestLog.api_key_id == api_key_id)

    if upstream_id is not None:
        query = query.where(RequestLog.upstream_id == upstream_id)
        count_query = count_query.where(RequestLog.upstream_id == upstream_id)

    if status_code is not None:
        query = query.where(RequestLog.status_code == status_code)
        count_query = count_query.where(RequestLog.status_code == status_code)

    if start_time is not None:
        query = query.where(RequestLog.created_at >= start_time)
        count_query = count_query.where(RequestLog.created_at >= start_time)

    if end_time is not None:
        query = query.where(RequestLog.created_at <= end_time)
        count_query = count_query.where(RequestLog.created_at <= end_time)

    # Count total with filters
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Query paginated results (ordered by created_at desc - newest first)
    offset = (page - 1) * page_size
    query = query.order_by(RequestLog.created_at.desc()).limit(page_size).offset(offset)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Convert to response schema
    items = [
        RequestLogResponse(
            id=log.id,
            api_key_id=log.api_key_id,
            upstream_id=log.upstream_id,
            method=log.method,
            path=log.path,
            model=log.model,
            prompt_tokens=log.prompt_tokens,
            completion_tokens=log.completion_tokens,
            total_tokens=log.total_tokens,
            status_code=log.status_code,
            duration_ms=log.duration_ms,
            error_message=log.error_message,
            created_at=log.created_at,
        )
        for log in logs
    ]

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedRequestLogsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
