"""Request logging service for audit and analytics.

This service records all proxy requests to the database for:
- Usage tracking and analytics
- Cost analysis (token counts)
- Audit trails
- Debugging and troubleshooting
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import RequestLog


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
        created_at=datetime.now(timezone.utc),
    )

    db.add(log_entry)
    await db.flush()  # Flush to get the ID, but don't commit yet

    logger.debug(
        f"Request logged: api_key_id={api_key_id}, upstream_id={upstream_id}, "
        f"status={status_code}, tokens={total_tokens}, duration={duration_ms}ms"
    )

    return log_entry


def extract_token_usage(response_body: dict | None) -> tuple[int, int, int]:
    """Extract token usage from OpenAI/Anthropic response.

    Handles different response formats from various providers.

    Args:
        response_body: Parsed JSON response from upstream

    Returns:
        tuple: (prompt_tokens, completion_tokens, total_tokens)
    """
    if not response_body or not isinstance(response_body, dict):
        return (0, 0, 0)

    # OpenAI format: response.usage.{prompt_tokens, completion_tokens, total_tokens}
    usage = response_body.get("usage", {})
    if usage:
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
        return (prompt_tokens, completion_tokens, total_tokens)

    # Anthropic format: response.usage.{input_tokens, output_tokens}
    if "usage" in response_body:
        usage = response_body["usage"]
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        return (input_tokens, output_tokens, input_tokens + output_tokens)

    return (0, 0, 0)


def extract_model_name(request_body: dict | None, response_body: dict | None) -> str | None:
    """Extract model name from request or response.

    Args:
        request_body: Parsed JSON request body
        response_body: Parsed JSON response body

    Returns:
        str | None: Model name if found
    """
    # Try request body first (most reliable)
    if request_body and isinstance(request_body, dict):
        model = request_body.get("model")
        if model:
            return str(model)

    # Fallback to response body
    if response_body and isinstance(response_body, dict):
        model = response_body.get("model")
        if model:
            return str(model)

    return None
