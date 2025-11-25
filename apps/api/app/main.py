from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from loguru import logger

from app.api.routes import health, proxy
from app.core.config import settings
from app.core.logging import setup_logging
from app.models.upstream import UpstreamManager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Handles startup and shutdown of resources like httpx client and upstream manager.
    """
    # Setup logging
    setup_logging(settings.log_level)
    logger.info("Starting AutoRouter API")

    # Initialize httpx client
    httpx_client = httpx.AsyncClient()
    app.state.httpx_client = httpx_client
    logger.info("HTTP client initialized")

    # Initialize upstream manager
    if settings.upstreams:
        try:
            upstream_manager = UpstreamManager(settings.upstreams)
            app.state.upstream_manager = upstream_manager
            logger.info(
                f"Upstream manager initialized with {len(settings.upstreams)} upstreams, "
                f"default={upstream_manager.default_upstream.name}"
            )
        except ValueError as e:
            logger.error(f"Failed to initialize upstream manager: {e}")
            raise
    else:
        logger.warning("No upstreams configured - proxy routes will not work")
        app.state.upstream_manager = None

    yield

    # Cleanup
    await httpx_client.aclose()
    logger.info("HTTP client closed")
    logger.info("AutoRouter API shutdown")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        Configured FastAPI application
    """
    app = FastAPI(
        title="AutoRouter API",
        version=settings.version,
        lifespan=lifespan,
    )

    # Register routes
    app.include_router(health.router, prefix="/api")

    # Register proxy routes if upstreams are configured
    if settings.upstreams:
        app.include_router(proxy.router, prefix=settings.proxy_prefix)
        logger.info(f"Proxy routes registered at {settings.proxy_prefix}")

    return app


app = create_app()
