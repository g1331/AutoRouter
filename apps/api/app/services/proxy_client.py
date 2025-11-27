"""HTTP client for proxying requests to upstream AI services."""

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
from fastapi import Request
from loguru import logger

from app.core.exceptions import UpstreamConnectionError, UpstreamTimeoutError
from app.models.upstream import Provider, UpstreamConfig

# Headers that should not be forwarded to upstream (hop-by-hop headers)
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",  # We'll set this based on upstream URL
}


def filter_headers(headers: dict[str, str]) -> dict[str, str]:
    """Filter out hop-by-hop headers and return safe headers for forwarding.

    Args:
        headers: Original request headers

    Returns:
        Filtered headers safe to forward
    """
    return {
        k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP_HEADERS
    }


def inject_auth_header(
    headers: dict[str, str], upstream: UpstreamConfig
) -> dict[str, str]:
    """Inject authentication header based on provider type.

    Args:
        headers: Existing headers
        upstream: Upstream configuration with provider type and API key

    Returns:
        Headers with authentication injected
    """
    headers = headers.copy()
    api_key = upstream.api_key.get_secret_value()

    if upstream.provider == Provider.OPENAI:
        headers["Authorization"] = f"Bearer {api_key}"
    elif upstream.provider == Provider.ANTHROPIC:
        headers["x-api-key"] = api_key

    return headers


def extract_usage(data: dict[str, Any]) -> dict[str, int] | None:
    """Extract token usage from response payload.

    Handles both OpenAI and Anthropic format differences.

    Args:
        data: Response data dictionary

    Returns:
        Usage dict with token counts, or None if not found
    """
    # Anthropic format: type="message" with usage field (check first for specificity)
    if data.get("type") == "message" and "usage" in data:
        usage = data["usage"]
        return {
            "prompt_tokens": usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
        }

    # OpenAI format: top-level "usage" key with prompt_tokens
    if "usage" in data and "prompt_tokens" in data["usage"]:
        usage = data["usage"]
        return {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }

    return None


async def stream_sse_response(
    response: httpx.Response, request_id: str
) -> AsyncIterator[bytes]:
    """Stream SSE response chunks and extract token usage.

    Args:
        response: httpx Response object with streaming content
        request_id: Request ID for logging

    Yields:
        Raw SSE event bytes
    """
    buffer = ""
    total_usage: dict[str, int] | None = None

    async for chunk in response.aiter_bytes():
        chunk_str = chunk.decode("utf-8", errors="replace")
        buffer += chunk_str

        # Process complete events (delimited by double newline)
        while "\n\n" in buffer:
            event, buffer = buffer.split("\n\n", 1)

            # Parse SSE event
            for line in event.split("\n"):
                if line.startswith("data: "):
                    data_str = line[6:]  # Remove "data: " prefix

                    # Skip special markers
                    if data_str.strip() in ["[DONE]", ""]:
                        continue

                    try:
                        data = json.loads(data_str)
                        usage = extract_usage(data)
                        if usage:
                            total_usage = usage
                    except json.JSONDecodeError:
                        # Not JSON, skip
                        pass

            # Forward the complete event
            yield (event + "\n\n").encode("utf-8")

    # Forward any remaining buffered data
    if buffer:
        yield buffer.encode("utf-8")

    # Log usage if found
    if total_usage:
        logger.info(
            f"Request {request_id} usage: prompt={total_usage['prompt_tokens']}, "
            f"completion={total_usage['completion_tokens']}, total={total_usage['total_tokens']}"
        )


async def forward_request(
    client: httpx.AsyncClient,
    request: Request,
    upstream: UpstreamConfig,
    path: str,
    request_id: str,
) -> tuple[int, dict[str, str], AsyncIterator[bytes] | bytes]:
    """Forward request to upstream service.

    Args:
        client: httpx async client
        request: FastAPI request object
        upstream: Upstream configuration
        path: Request path (relative to base_url)
        request_id: Request ID for logging

    Returns:
        Tuple of (status_code, headers, body/stream)

    Raises:
        UpstreamTimeoutError: If request times out
        UpstreamConnectionError: If connection fails
    """
    # Prepare headers
    original_headers = dict(request.headers)
    headers = filter_headers(original_headers)
    headers = inject_auth_header(headers, upstream)

    # Construct upstream URL
    base_url = str(upstream.base_url).rstrip("/")
    url = f"{base_url}/{path.lstrip('/')}"

    # Read request body
    body = await request.body()

    # Enhanced Debug Logging - 观察 AI 工具的实际请求格式
    logger.info(
        f"[IN] Request {request_id}:\n"
        f"  Method: {request.method}\n"
        f"  Path: {path}\n"
        f"  Client: {request.client.host if request.client else 'unknown'}\n"
        f"  User-Agent: {original_headers.get('user-agent', 'N/A')}"
    )

    # 记录原始请求头中的认证信息（脱敏显示）
    auth_header = original_headers.get("authorization", "")
    if auth_header:
        # 脱敏：只显示前缀和后4位
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            masked_token = f"{token[:15]}...{token[-4:]}" if len(token) > 20 else "***"
            logger.info(f"  [AUTH] Original Auth: Bearer {masked_token}")
        else:
            logger.info(f"  [AUTH] Original Auth: {auth_header[:20]}...")

    # 记录其他关键请求头
    x_api_key = original_headers.get("x-api-key", "")
    if x_api_key:
        masked = f"{x_api_key[:10]}...{x_api_key[-4:]}" if len(x_api_key) > 15 else "***"
        logger.info(f"  [AUTH] Original x-api-key: {masked}")

    # 记录请求体概要（JSON 格式）
    if body:
        try:
            body_json = json.loads(body)
            logger.info(
                f"  [BODY] Request Body:\n"
                f"    model: {body_json.get('model', 'N/A')}\n"
                f"    stream: {body_json.get('stream', False)}\n"
                f"    messages: {len(body_json.get('messages', []))} messages\n"
                f"    max_tokens: {body_json.get('max_tokens', 'N/A')}"
            )
        except json.JSONDecodeError:
            logger.info(f"  [BODY] Request Body: {len(body)} bytes (non-JSON)")

    # Debug mode - 显示所有请求头（通过环境变量 DEBUG_LOG_HEADERS=true 启用）
    from app.core.config import settings
    if settings.debug_log_headers:
        logger.debug(f"  [DEBUG] All Request Headers:")
        for key, value in original_headers.items():
            # 脱敏处理敏感信息
            if key.lower() in ["authorization", "x-api-key", "api-key"]:
                display_value = f"{value[:20]}..." if len(value) > 20 else "***"
            else:
                display_value = value
            logger.debug(f"    {key}: {display_value}")

    # Log forwarding details
    logger.info(
        f"[OUT] Forwarding to upstream {request_id}:\n"
        f"  Upstream: {upstream.name} ({upstream.provider.value})\n"
        f"  URL: {url}\n"
        f"  Timeout: {upstream.timeout}s"
    )

    try:
        # Make upstream request
        upstream_response = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
            timeout=httpx.Timeout(upstream.timeout, read=None),  # No read timeout for streaming
        )

        # Log response metadata
        logger.info(
            f"Upstream response {request_id}: status={upstream_response.status_code}, "
            f"content_type={upstream_response.headers.get('content-type', 'unknown')}"
        )

        # Filter response headers
        response_headers = filter_headers(dict(upstream_response.headers))

        # Check if streaming response
        content_type = upstream_response.headers.get("content-type", "")
        if "text/event-stream" in content_type:
            # Streaming response
            stream = stream_sse_response(upstream_response, request_id)
            return upstream_response.status_code, response_headers, stream
        else:
            # Regular response
            body_bytes = await upstream_response.aread()

            # Try to extract usage from JSON response
            if "application/json" in content_type:
                try:
                    data = json.loads(body_bytes)
                    usage = extract_usage(data)
                    if usage:
                        logger.info(
                            f"Request {request_id} usage: prompt={usage['prompt_tokens']}, "
                            f"completion={usage['completion_tokens']}, total={usage['total_tokens']}"
                        )
                except json.JSONDecodeError:
                    pass

            return upstream_response.status_code, response_headers, body_bytes

    except httpx.TimeoutException as e:
        logger.error(f"Request {request_id} timed out: {e}")
        raise UpstreamTimeoutError(f"Upstream request timed out: {e}") from e
    except httpx.ConnectError as e:
        logger.error(f"Request {request_id} connection failed: {e}")
        raise UpstreamConnectionError(f"Failed to connect to upstream: {e}") from e
    except Exception as e:
        logger.error(f"Request {request_id} failed: {e}")
        raise
