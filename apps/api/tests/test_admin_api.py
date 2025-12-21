"""Integration tests for Admin API endpoints."""

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.db_models import APIKey, Upstream


@pytest.mark.asyncio
async def test_create_upstream(db_session):
    """Test creating an upstream via Admin API."""
    from app.api.routes.admin import create_upstream as create_upstream_endpoint
    from app.models.schemas import UpstreamCreate

    body = UpstreamCreate(
        name="test-openai",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-test-key-123",
        is_default=True,
        timeout=60,
    )

    result = await create_upstream_endpoint(body=body, db=db_session)

    assert result.name == "test-openai"
    assert result.provider == "openai"
    assert result.is_default is True
    assert result.api_key_masked.startswith("sk-")
    assert "***" in result.api_key_masked

    # Verify database record
    db_upstream = await db_session.execute(select(Upstream).where(Upstream.name == "test-openai"))
    upstream = db_upstream.scalar_one()
    assert upstream.api_key_encrypted != "sk-test-key-123"  # Should be encrypted


@pytest.mark.asyncio
async def test_create_upstream_duplicate_name(db_session):
    """Test creating upstream with duplicate name."""
    from fastapi import HTTPException

    from app.api.routes.admin import create_upstream as create_upstream_endpoint
    from app.models.schemas import UpstreamCreate

    body = UpstreamCreate(
        name="duplicate",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-test-key-123",
    )

    # Create first upstream
    await create_upstream_endpoint(body=body, db=db_session)

    # Try to create duplicate
    with pytest.raises(HTTPException) as exc_info:
        await create_upstream_endpoint(body=body, db=db_session)

    assert exc_info.value.status_code == 400
    assert "already exists" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_list_upstreams(db_session):
    """Test listing upstreams with pagination."""
    from app.services.upstream_service import create_upstream, list_upstreams

    # Create multiple upstreams
    for i in range(5):
        await create_upstream(
            db=db_session,
            name=f"upstream-{i}",
            provider="openai",
            base_url="https://api.openai.com",
            api_key=f"sk-key-{i}",
        )

    # List first page
    result = await list_upstreams(db=db_session, page=1, page_size=3)

    assert result.total == 5
    assert result.page == 1
    assert result.page_size == 3
    assert result.total_pages == 2
    assert len(result.items) == 3

    # Verify API keys are masked
    for item in result.items:
        assert "***" in item.api_key_masked


@pytest.mark.asyncio
async def test_create_api_key_via_admin(db_session):
    """Test creating API key via Admin API."""
    from app.api.routes.admin import create_api_key as create_api_key_endpoint
    from app.models.schemas import APIKeyCreate
    from app.services.upstream_service import create_upstream

    # Create upstream first
    upstream = await create_upstream(
        db=db_session,
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-test-key",
    )

    body = APIKeyCreate(
        name="test-key",
        description="Test API key",
        upstream_ids=[upstream.id],
    )

    result = await create_api_key_endpoint(body=body, db=db_session)

    assert result.key_value.startswith("sk-auto-")
    assert result.name == "test-key"
    assert result.description == "Test API key"
    assert upstream.id in result.upstream_ids


@pytest.mark.asyncio
async def test_create_api_key_invalid_upstream(db_session):
    """Test creating API key with invalid upstream ID."""
    from fastapi import HTTPException

    from app.api.routes.admin import create_api_key as create_api_key_endpoint
    from app.models.schemas import APIKeyCreate

    body = APIKeyCreate(
        name="invalid-key",
        upstream_ids=[uuid4()],  # Non-existent upstream
    )

    with pytest.raises(HTTPException) as exc_info:
        await create_api_key_endpoint(body=body, db=db_session)

    assert exc_info.value.status_code == 400
    assert "Invalid upstream IDs" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_delete_api_key_via_admin(db_session):
    """Test deleting API key via Admin API."""
    from app.api.routes.admin import delete_api_key_endpoint
    from app.services.key_manager import create_api_key
    from app.services.upstream_service import create_upstream

    # Create upstream and key
    upstream = await create_upstream(
        db=db_session,
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-test-key",
    )

    api_key = await create_api_key(
        db=db_session,
        name="test-key",
        upstream_ids=[upstream.id],
    )

    # Delete the key
    await delete_api_key_endpoint(key_id=api_key.id, db=db_session)

    # Verify key is deleted
    db_key = await db_session.get(APIKey, api_key.id)
    assert db_key is None


@pytest.mark.asyncio
async def test_delete_nonexistent_key_via_admin(db_session):
    """Test deleting non-existent key via Admin API."""
    from fastapi import HTTPException

    from app.api.routes.admin import delete_api_key_endpoint

    with pytest.raises(HTTPException) as exc_info:
        await delete_api_key_endpoint(key_id=uuid4(), db=db_session)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_upstream(db_session):
    """Test updating upstream via Admin API."""
    from app.api.routes.admin import update_upstream as update_upstream_endpoint
    from app.models.schemas import UpstreamUpdate
    from app.services.upstream_service import create_upstream

    # Create upstream
    upstream = await create_upstream(
        db=db_session,
        name="original-name",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-original-key",
        timeout=60,
    )

    # Update upstream
    body = UpstreamUpdate(
        name="updated-name",
        timeout=120,
    )

    result = await update_upstream_endpoint(
        upstream_id=upstream.id,
        body=body,
        db=db_session,
    )

    assert result.name == "updated-name"
    assert result.timeout == 120
    assert result.provider == "openai"  # Unchanged


@pytest.mark.asyncio
async def test_delete_upstream(db_session):
    """Test deleting (hard-delete) upstream via Admin API."""
    from app.api.routes.admin import delete_upstream as delete_upstream_endpoint
    from app.services.upstream_service import create_upstream

    # Create upstream
    upstream = await create_upstream(
        db=db_session,
        name="to-delete",
        provider="openai",
        base_url="https://api.openai.com",
        api_key="sk-test-key",
    )

    # Delete upstream
    await delete_upstream_endpoint(upstream_id=upstream.id, db=db_session)

    # Verify hard-delete (upstream is removed from database)
    db_upstream = await db_session.get(Upstream, upstream.id)
    assert db_upstream is None
