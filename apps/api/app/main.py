from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from fastapi import FastAPI
from loguru import logger

from app.api.routes import admin, health, proxy
from app.core.config import settings
from app.core.encryption import encrypt_upstream_key
from app.core.logging import setup_logging
from app.db.base import close_db, get_db_session, init_db
from app.models.db_models import Upstream as DBUpstream
from app.models.upstream import Provider, UpstreamConfig, UpstreamManager
from app.services.upstream_service import load_upstreams_from_db


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan context manager.

    Handles startup and shutdown of resources:
    - Database initialization
    - Upstream loading from database (with env fallback)
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

    # Load upstreams from database or import from environment variables
    upstream_configs: list[UpstreamConfig] = []

    try:
        async with get_db_session() as db:
            db_upstreams = await load_upstreams_from_db(db)

            # If database is empty and env upstreams exist, import them
            if not db_upstreams and settings.upstreams:
                logger.info(
                    f"Database has no upstreams, importing {len(settings.upstreams)} from environment variables"
                )
                for env_upstream in settings.upstreams:
                    # Encrypt the API key before storing
                    encrypted_key = encrypt_upstream_key(env_upstream.api_key.get_secret_value())

                    db_upstream = DBUpstream(
                        id=uuid4(),
                        name=env_upstream.name,
                        provider=env_upstream.provider.value,
                        base_url=str(env_upstream.base_url),
                        api_key_encrypted=encrypted_key,
                        is_default=env_upstream.is_default,
                        timeout=env_upstream.timeout,
                        is_active=True,
                    )
                    db.add(db_upstream)

                await db.commit()
                logger.info(f"Imported {len(settings.upstreams)} upstreams from environment to database")

                # Reload from database
                db_upstreams = await load_upstreams_from_db(db)

            # Convert database upstreams to UpstreamConfig objects for UpstreamManager
            if db_upstreams:
                from app.core.encryption import decrypt_upstream_key
                from pydantic import SecretStr

                for db_upstream in db_upstreams:
                    # Decrypt the API key
                    decrypted_key = decrypt_upstream_key(db_upstream.api_key_encrypted)

                    upstream_config = UpstreamConfig(
                        name=db_upstream.name,
                        provider=Provider(db_upstream.provider),
                        base_url=db_upstream.base_url,
                        api_key=SecretStr(decrypted_key),
                        is_default=db_upstream.is_default,
                        timeout=db_upstream.timeout,
                    )
                    upstream_configs.append(upstream_config)

                logger.info(f"Loaded {len(upstream_configs)} upstreams from database")

    except Exception as e:
        logger.error(f"Failed to load upstreams from database: {e}")
        # Fallback to environment variables
        if settings.upstreams:
            logger.warning("Falling back to environment variable upstreams")
            upstream_configs = settings.upstreams
        else:
            logger.error("No database upstreams and no environment upstreams - proxy will not work")

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
