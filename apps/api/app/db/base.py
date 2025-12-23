"""Database configuration and session management.

This module provides:
- AsyncEngine configuration for SQLAlchemy 2.0
- AsyncSession factory for dependency injection
- Base declarative model for ORM classes
- WAL mode configuration for SQLite (improved concurrency)
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    async_sessionmaker,
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    """Base class for all ORM models.

    All database models should inherit from this class.
    """


def _get_database_url() -> str:
    """Get database URL from settings with lazy import to avoid circular dependency."""
    from app.core.config import settings

    database_url = settings.database_url
    # For SQLite, we need to use aiosqlite driver
    if database_url.startswith("sqlite:"):
        database_url = database_url.replace("sqlite:", "sqlite+aiosqlite:")
    return database_url


def _is_development() -> bool:
    """Check if environment is development with lazy import."""
    from app.core.config import settings

    return settings.environment == "development"


# Create async engine
engine: AsyncEngine = create_async_engine(
    _get_database_url(),
    echo=_is_development(),
    future=True,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides database session.

    Usage:
        @app.get("/items")
        async def read_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()

    Yields:
        AsyncSession: Database session that will be automatically closed
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Context manager for database session outside of FastAPI dependencies.

    Usage:
        async with get_db_session() as db:
            result = await db.execute(select(User))
            users = result.scalars().all()

    Yields:
        AsyncSession: Database session that will be automatically closed
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _is_file_database() -> bool:
    """Check if the database is file-based (not in-memory).

    WAL mode only works with file-based SQLite databases.
    In-memory databases (:memory:) do not support WAL.
    """
    url = _get_database_url()
    # In-memory databases contain ":memory:" or are empty path
    return ":memory:" not in url and "mode=memory" not in url


async def _configure_sqlite_wal(conn: AsyncConnection) -> None:
    """Configure SQLite WAL mode for better concurrency.

    WAL (Write-Ahead Logging) provides:
    - Concurrent reads during writes (readers don't block writers)
    - Better write performance (sequential appends vs random writes)
    - Improved crash recovery

    PRAGMA settings:
    - journal_mode=WAL: Enable write-ahead logging
    - synchronous=NORMAL: Balance between safety and performance
    - busy_timeout=5000: Wait up to 5s for locks instead of failing immediately
    """
    await conn.execute(text("PRAGMA journal_mode=WAL"))
    await conn.execute(text("PRAGMA synchronous=NORMAL"))
    await conn.execute(text("PRAGMA busy_timeout=5000"))

    # Verify WAL mode is enabled
    result = await conn.execute(text("PRAGMA journal_mode"))
    mode = result.scalar()
    logger.info(f"SQLite journal mode: {mode}")


async def init_db() -> None:
    """Initialize database by creating all tables.

    This should be called during application startup.
    Note: In production, use Alembic migrations instead.

    For file-based SQLite databases, WAL mode is enabled for better concurrency.
    """
    async with engine.begin() as conn:
        # Configure WAL mode for file-based SQLite databases
        if _is_file_database():
            await _configure_sqlite_wal(conn)

        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Close database engine and dispose of connection pool.

    This should be called during application shutdown.
    """
    await engine.dispose()
