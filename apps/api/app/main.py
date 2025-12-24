from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pydantic import HttpUrl, SecretStr, TypeAdapter

from app.api.routes import admin, health, proxy
from app.core.config import settings
from app.core.encryption import decrypt_upstream_key
from app.core.logging import setup_logging
from app.db.base import close_db, get_db_session, init_db
from app.models.upstream import Provider, UpstreamConfig, UpstreamManager
from app.services.upstream_service import load_upstreams_from_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Handles startup and shutdown of resources:
    - Database initialization
    - Upstream loading from database
    - UpstreamManager initialization
    - HTTP client
    """
    # Setup logging
    setup_logging(settings.log_level)
    logger.info("Starting AutoRouter API")

    # Initialize database
    try:
        await init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

    # Load upstreams from database
    upstream_configs: list[UpstreamConfig] = []

    try:
        async with get_db_session() as db:
            db_upstreams = await load_upstreams_from_db(db)

            # Convert database upstreams to UpstreamConfig objects for UpstreamManager
            if db_upstreams:
                http_url_adapter: TypeAdapter[HttpUrl] = TypeAdapter(HttpUrl)

                for db_upstream in db_upstreams:
                    # Decrypt the API key
                    decrypted_key = decrypt_upstream_key(db_upstream.api_key_encrypted)

                    upstream_config = UpstreamConfig(
                        name=db_upstream.name,
                        provider=Provider(db_upstream.provider),
                        base_url=http_url_adapter.validate_python(db_upstream.base_url),
                        api_key=SecretStr(decrypted_key),
                        is_default=db_upstream.is_default,
                        timeout=db_upstream.timeout,
                    )
                    upstream_configs.append(upstream_config)

                logger.info(f"Loaded {len(upstream_configs)} upstreams from database")
            else:
                logger.warning("No upstreams found in database - proxy will not work")

    except Exception as e:
        logger.error(f"Failed to load upstreams from database: {e}")
        raise

    # Initialize httpx client
    httpx_client = httpx.AsyncClient()
    app.state.httpx_client = httpx_client
    logger.info("HTTP client initialized")

    # Initialize upstream manager
    if upstream_configs:
        try:
            upstream_manager = UpstreamManager(upstream_configs)
            app.state.upstream_manager = upstream_manager
            logger.info(
                f"Upstream manager initialized with {len(upstream_configs)} upstreams, "
                f"default={upstream_manager.default_upstream.name if upstream_manager.default_upstream else 'none'}"
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

    await close_db()
    logger.info("Database connections closed")

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

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register routes
    app.include_router(health.router, prefix="/api")

    # Register admin routes (always available for key management)
    app.include_router(admin.router)
    logger.info("Admin routes registered at /admin")

    # Register proxy routes (always available, auth handled by dependencies)
    app.include_router(proxy.router, prefix=settings.proxy_prefix)
    logger.info(f"Proxy routes registered at {settings.proxy_prefix}")

    return app


app = create_app()
