"""Proxy routes for forwarding requests to upstream AI services."""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_api_key, get_db
from app.core.exceptions import UpstreamConnectionError, UpstreamTimeoutError
from app.models.db_models import APIKey, APIKeyUpstream, Upstream
from app.models.upstream import UpstreamManager
from app.services import proxy_client, request_logger

router = APIRouter()


@router.get("/v1/upstreams")
async def list_upstreams(request: Request) -> JSONResponse:
    """List all available upstream services.

    Args:
        request: FastAPI request object

    Returns:
        JSON response with list of upstreams (without sensitive data)
    """
    upstream_manager: UpstreamManager = request.app.state.upstream_manager
    upstreams = upstream_manager.list_upstreams()

    return JSONResponse(
        content={
            "upstreams": upstreams,
        }
    )


@router.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_request(
    request: Request,
    path: str,
    x_upstream_name: str | None = Header(None, alias="X-Upstream-Name"),
    api_key: APIKey = Depends(get_current_api_key),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Proxy request to configured upstream service with API key authentication.

    Args:
        request: FastAPI request object
        path: Request path relative to /v1/
        x_upstream_name: Optional upstream name from request header
        api_key: Validated API key from Authorization header (dependency)
        db: Database session (dependency)

    Returns:
        Response from upstream service

    Raises:
        HTTPException: If upstream not found, unauthorized, or request fails
    """
    # Generate request ID
    request_id = str(uuid.uuid4())
    request_start_time = datetime.now(timezone.utc)

    # Get upstream manager and httpx client from app state
    upstream_manager: UpstreamManager = request.app.state.upstream_manager
    httpx_client: httpx.AsyncClient = request.app.state.httpx_client

    # Select upstream
    try:
        upstream = upstream_manager.get_upstream(x_upstream_name)
        logger.info(
            f"Request {request_id}: api_key={api_key.key_prefix}, "
            f"upstream={upstream.name}, provider={upstream.provider.value}, path=/v1/{path}"
        )
    except KeyError as e:
        available = upstream_manager.list_upstreams()
        logger.warning(f"Request {request_id}: upstream not found - {e}")
        raise HTTPException(
            status_code=400,
            detail={
                "error": "upstream_not_found",
                "message": str(e),
                "available_upstreams": available,
            },
        ) from e

    # Verify API key has permission to access this upstream
    # First, get the Upstream from database by name
    upstream_result = await db.execute(
        select(Upstream).where(
            Upstream.name == upstream.name,
            Upstream.is_active == True,  # noqa: E712
        )
    )
    db_upstream = upstream_result.scalar_one_or_none()

    if not db_upstream:
        # Upstream exists in memory (env config) but not in database yet
        # This can happen during transition period before first database sync
        # For now, allow access (backward compatible)
        # TODO: Remove this fallback in Phase 2 when all upstreams are in database
        logger.warning(
            f"Request {request_id}: Upstream {upstream.name} not found in database, "
            "allowing access (backward compatibility mode)"
        )
    else:
        # Check permission in api_key_upstreams join table
        permission_check = await db.execute(
            select(APIKeyUpstream).where(
                APIKeyUpstream.api_key_id == api_key.id,
                APIKeyUpstream.upstream_id == db_upstream.id,
            )
        )
        has_permission = permission_check.scalar_one_or_none()

        if not has_permission:
            logger.warning(
                f"Request {request_id}: API key {api_key.key_prefix} "
                f"not authorized for upstream {upstream.name}"
            )
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "forbidden",
                    "message": f"API key not authorized for upstream: {upstream.name}",
                },
            )

    # Parse request body for model extraction
    request_body = None
    try:
        request_body = await request.json()
    except Exception:
        pass  # Request may not have JSON body

    # Forward request
    response_status: int | None = None
    response_body: dict | None = None
    error_msg: str | None = None

    try:
        status_code, headers, body = await proxy_client.forward_request(
            client=httpx_client,
            request=request,
            upstream=upstream,
            path=f"v1/{path}",
            request_id=request_id,
        )
        response_status = status_code

        # Parse response body for token extraction (if not streaming)
        if not hasattr(body, "__aiter__"):
            try:
                import json
                response_body = json.loads(body)
            except Exception:
                pass  # Response may not be JSON

        # Calculate duration
        duration_ms = int((datetime.now(timezone.utc) - request_start_time).total_seconds() * 1000)

        # Extract model and token usage
        model_name = request_logger.extract_model_name(request_body, response_body)
        prompt_tokens, completion_tokens, total_tokens = request_logger.extract_token_usage(response_body)

        # Log the request
        await request_logger.log_request(
            db=db,
            api_key_id=api_key.id,
            upstream_id=db_upstream.id if db_upstream else None,
            method=request.method,
            path=f"/v1/{path}",
            model=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            status_code=response_status,
            duration_ms=duration_ms,
            error_message=None,
        )
        await db.commit()

        # Return streaming response if body is async iterator
        if hasattr(body, "__aiter__"):
            # Note: For streaming responses, token usage cannot be extracted
            # This is a known limitation - tokens will be 0 for streaming
            return StreamingResponse(
                content=body,
                status_code=status_code,
                headers=headers,
            )
        else:
            return Response(
                content=body,
                status_code=status_code,
                headers=headers,
            )

    except UpstreamTimeoutError as e:
        error_msg = str(e)
        response_status = 504
        duration_ms = int((datetime.now(timezone.utc) - request_start_time).total_seconds() * 1000)

        # Log failed request
        await request_logger.log_request(
            db=db,
            api_key_id=api_key.id,
            upstream_id=db_upstream.id if db_upstream else None,
            method=request.method,
            path=f"/v1/{path}",
            model=request_logger.extract_model_name(request_body, None),
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            status_code=response_status,
            duration_ms=duration_ms,
            error_message=error_msg,
        )
        await db.commit()

        logger.error(f"Request {request_id}: timeout - {e}")
        raise HTTPException(status_code=504, detail={"error": "gateway_timeout", "message": error_msg}) from e

    except UpstreamConnectionError as e:
        error_msg = str(e)
        response_status = 502
        duration_ms = int((datetime.now(timezone.utc) - request_start_time).total_seconds() * 1000)

        # Log failed request
        await request_logger.log_request(
            db=db,
            api_key_id=api_key.id,
            upstream_id=db_upstream.id if db_upstream else None,
            method=request.method,
            path=f"/v1/{path}",
            model=request_logger.extract_model_name(request_body, None),
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            status_code=response_status,
            duration_ms=duration_ms,
            error_message=error_msg,
        )
        await db.commit()

        logger.error(f"Request {request_id}: connection error - {e}")
        raise HTTPException(status_code=502, detail={"error": "bad_gateway", "message": error_msg}) from e

    except Exception as e:
        error_msg = str(e)
        response_status = 500
        duration_ms = int((datetime.now(timezone.utc) - request_start_time).total_seconds() * 1000)

        # Log failed request
        await request_logger.log_request(
            db=db,
            api_key_id=api_key.id,
            upstream_id=db_upstream.id if db_upstream else None,
            method=request.method,
            path=f"/v1/{path}",
            model=request_logger.extract_model_name(request_body, None),
            prompt_tokens=0,
            completion_tokens=0,
            total_tokens=0,
            status_code=response_status,
            duration_ms=duration_ms,
            error_message=error_msg,
        )
        await db.commit()

        logger.exception(f"Request {request_id}: unexpected error")
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": error_msg}) from e
