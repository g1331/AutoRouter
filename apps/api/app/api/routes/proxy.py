"""Proxy routes for forwarding requests to upstream AI services."""

import uuid

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger

from app.core.exceptions import UpstreamConnectionError, UpstreamTimeoutError
from app.models.upstream import UpstreamManager
from app.services import proxy_client

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
) -> Response:
    """Proxy request to configured upstream service.

    Args:
        request: FastAPI request object
        path: Request path relative to /v1/
        x_upstream_name: Optional upstream name from request header

    Returns:
        Response from upstream service

    Raises:
        HTTPException: If upstream not found or request fails
    """
    # Generate request ID
    request_id = str(uuid.uuid4())

    # Get upstream manager from app state
    upstream_manager: UpstreamManager = request.app.state.upstream_manager
    httpx_client: httpx.AsyncClient = request.app.state.httpx_client

    # Select upstream
    try:
        upstream = upstream_manager.get_upstream(x_upstream_name)
        logger.info(
            f"Request {request_id}: selected upstream={upstream.name}, "
            f"provider={upstream.provider.value}, path=/v1/{path}"
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

    # Forward request
    try:
        status_code, headers, body = await proxy_client.forward_request(
            client=httpx_client,
            request=request,
            upstream=upstream,
            path=f"v1/{path}",
            request_id=request_id,
        )

        # Return streaming response if body is async iterator
        if hasattr(body, "__aiter__"):
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
        logger.error(f"Request {request_id}: timeout - {e}")
        raise HTTPException(status_code=504, detail={"error": "gateway_timeout", "message": str(e)}) from e
    except UpstreamConnectionError as e:
        logger.error(f"Request {request_id}: connection error - {e}")
        raise HTTPException(status_code=502, detail={"error": "bad_gateway", "message": str(e)}) from e
    except Exception as e:
        logger.exception(f"Request {request_id}: unexpected error")
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": str(e)}) from e
