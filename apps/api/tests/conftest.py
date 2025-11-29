"""Pytest configuration and fixtures."""

import asyncio
import os
from collections.abc import AsyncGenerator
from typing import AsyncIterator

# Set test environment variables BEFORE importing app modules
from cryptography.fernet import Fernet

os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import HttpUrl, SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.db.base import Base
from app.main import create_app
from app.models.upstream import Provider, UpstreamConfig, UpstreamManager


@pytest.fixture
def sample_openai_upstream() -> UpstreamConfig:
    """Create a sample OpenAI upstream configuration."""
    return UpstreamConfig(
        name="test-openai",
        provider=Provider.OPENAI,
        base_url=HttpUrl("https://api.openai.com"),
        api_key=SecretStr("sk-test-key"),
        is_default=True,
        timeout=30,
    )


@pytest.fixture
def sample_anthropic_upstream() -> UpstreamConfig:
    """Create a sample Anthropic upstream configuration."""
    return UpstreamConfig(
        name="test-anthropic",
        provider=Provider.ANTHROPIC,
        base_url=HttpUrl("https://api.anthropic.com"),
        api_key=SecretStr("sk-ant-test-key"),
        is_default=False,
        timeout=30,
    )


@pytest.fixture
def upstream_manager(
    sample_openai_upstream: UpstreamConfig,
    sample_anthropic_upstream: UpstreamConfig,
) -> UpstreamManager:
    """Create an upstream manager with sample upstreams."""
    return UpstreamManager([sample_openai_upstream, sample_anthropic_upstream])


@pytest_asyncio.fixture
async def httpx_client() -> AsyncIterator[httpx.AsyncClient]:
    """Create an async httpx client for testing."""
    async with httpx.AsyncClient() as client:
        yield client


@pytest.fixture
def app_with_upstreams(
    sample_openai_upstream: UpstreamConfig,
    sample_anthropic_upstream: UpstreamConfig,
) -> FastAPI:
    """Create a FastAPI app with test upstreams configured."""
    # Temporarily override settings
    original_upstreams = settings.upstreams
    settings.upstreams = [sample_openai_upstream, sample_anthropic_upstream]

    # Create app WITHOUT lifespan for testing
    from contextlib import asynccontextmanager
    from typing import AsyncIterator

    import httpx
    from loguru import logger

    from app.api.routes import health, proxy
    from app.models.upstream import UpstreamManager

    @asynccontextmanager
    async def test_lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Initialize httpx client
        httpx_client = httpx.AsyncClient()
        app.state.httpx_client = httpx_client

        # Initialize upstream manager
        if settings.upstreams:
            upstream_manager = UpstreamManager(settings.upstreams)
            app.state.upstream_manager = upstream_manager

        yield

        # Cleanup
        await httpx_client.aclose()

    app = FastAPI(
        title="AutoRouter API Test",
        version="0.1.0",
        lifespan=test_lifespan,
    )

    # Register routes
    app.include_router(health.router, prefix="/api")
    app.include_router(proxy.router, prefix="/proxy")

    # Restore original settings
    settings.upstreams = original_upstreams

    return app


@pytest.fixture
def test_client(app_with_upstreams: FastAPI) -> TestClient:
    """Create a test client for the FastAPI app."""
    # Use raise_server_exceptions=False to get proper error responses
    with TestClient(app_with_upstreams, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def sample_openai_chat_response() -> dict:
    """Sample OpenAI chat completion response."""
    return {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1677652288,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you?",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 15,
            "total_tokens": 25,
        },
    }


@pytest.fixture
def sample_anthropic_message_response() -> dict:
    """Sample Anthropic message response."""
    return {
        "id": "msg_123",
        "type": "message",
        "role": "assistant",
        "content": [
            {
                "type": "text",
                "text": "Hello! How can I help you?",
            }
        ],
        "model": "claude-3-sonnet",
        "stop_reason": "end_turn",
        "usage": {
            "input_tokens": 10,
            "output_tokens": 15,
        },
    }


@pytest.fixture
def sample_sse_stream() -> str:
    """Sample SSE stream with usage data."""
    return """data: {"id":"chunk-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

data: {"id":"chunk-2","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"}}]}

data: {"id":"chunk-3","object":"chat.completion.chunk","choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}

data: [DONE]

"""


# Database fixtures for unit tests


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session
        await session.rollback()
