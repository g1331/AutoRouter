"""Unit tests for key manager service."""

from datetime import datetime, timedelta, UTC
from uuid import uuid4

import bcrypt
import pytest
from sqlalchemy import select

from app.models.db_models import APIKey, APIKeyUpstream, Upstream
from app.services.key_manager import (
    create_api_key,
    delete_api_key,
    generate_api_key,
    list_api_keys,
)


def test_generate_api_key():
    """Test API key generation format."""
    key = generate_api_key()

    # Should start with 'sk-auto-'
    assert key.startswith("sk-auto-")

    # Should be 50-52 characters (8 prefix + 42-44 base64)
    assert 50 <= len(key) <= 52

    # Should be unique
    key2 = generate_api_key()
    assert key != key2


@pytest.mark.asyncio
async def test_create_api_key(db_session):
    """Test creating an API key."""
    # Create upstream first
    upstream = Upstream(
        id=uuid4(),
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key_encrypted="encrypted-key",
        is_active=True,
    )
    db_session.add(upstream)
    await db_session.commit()

    # Create API key
    result = await create_api_key(
        db=db_session,
        name="test-key",
        upstream_ids=[upstream.id],
        description="Test API key",
    )

    # Verify response
    assert result.key_value.startswith("sk-auto-")
    assert result.key_prefix == result.key_value[:12]
    assert result.name == "test-key"
    assert result.description == "Test API key"
    assert result.is_active is True
    assert upstream.id in result.upstream_ids

    # Verify database record
    db_key = await db_session.get(APIKey, result.id)
    assert db_key is not None
    assert db_key.name == "test-key"
    assert db_key.is_active is True

    # Verify key is hashed (not plaintext)
    assert db_key.key_hash != result.key_value
    assert bcrypt.checkpw(result.key_value.encode("utf-8"), db_key.key_hash.encode("utf-8"))

    # Verify permission entry
    perm_result = await db_session.execute(
        select(APIKeyUpstream).where(
            APIKeyUpstream.api_key_id == result.id,
            APIKeyUpstream.upstream_id == upstream.id,
        )
    )
    perm = perm_result.scalar_one_or_none()
    assert perm is not None


@pytest.mark.asyncio
async def test_create_api_key_with_expiration(db_session):
    """Test creating an API key with expiration."""
    upstream = Upstream(
        id=uuid4(),
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key_encrypted="encrypted-key",
        is_active=True,
    )
    db_session.add(upstream)
    await db_session.commit()

    expires_at = datetime.now(UTC) + timedelta(days=30)

    result = await create_api_key(
        db=db_session,
        name="expiring-key",
        upstream_ids=[upstream.id],
        expires_at=expires_at,
    )

    assert result.expires_at is not None
    # Make expires_at timezone-aware for comparison
    if result.expires_at.tzinfo is None:
        result_expires = result.expires_at.replace(tzinfo=UTC)
    else:
        result_expires = result.expires_at
    assert abs((result_expires - expires_at).total_seconds()) < 1


@pytest.mark.asyncio
async def test_create_api_key_empty_upstreams(db_session):
    """Test creating API key with empty upstream list."""
    with pytest.raises(ValueError, match="At least one upstream must be specified"):
        await create_api_key(
            db=db_session,
            name="invalid-key",
            upstream_ids=[],
        )


@pytest.mark.asyncio
async def test_create_api_key_invalid_upstream(db_session):
    """Test creating API key with invalid upstream ID."""
    invalid_id = uuid4()

    with pytest.raises(ValueError, match="Invalid or inactive upstream IDs"):
        await create_api_key(
            db=db_session,
            name="invalid-key",
            upstream_ids=[invalid_id],
        )


@pytest.mark.asyncio
async def test_create_api_key_inactive_upstream(db_session):
    """Test creating API key with inactive upstream."""
    upstream = Upstream(
        id=uuid4(),
        name="inactive-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key_encrypted="encrypted-key",
        is_active=False,  # Inactive
    )
    db_session.add(upstream)
    await db_session.commit()

    with pytest.raises(ValueError, match="Invalid or inactive upstream IDs"):
        await create_api_key(
            db=db_session,
            name="invalid-key",
            upstream_ids=[upstream.id],
        )


@pytest.mark.asyncio
async def test_delete_api_key(db_session):
    """Test deleting an API key."""
    # Create upstream and key
    upstream = Upstream(
        id=uuid4(),
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key_encrypted="encrypted-key",
        is_active=True,
    )
    db_session.add(upstream)
    await db_session.commit()

    result = await create_api_key(
        db=db_session,
        name="test-key",
        upstream_ids=[upstream.id],
    )

    # Delete the key
    await delete_api_key(db=db_session, key_id=result.id)

    # Verify key is deleted (not just inactive)
    db_key = await db_session.get(APIKey, result.id)
    assert db_key is None


@pytest.mark.asyncio
async def test_delete_nonexistent_key(db_session):
    """Test deleting a non-existent key."""
    invalid_id = uuid4()

    with pytest.raises(ValueError, match="API key not found"):
        await delete_api_key(db=db_session, key_id=invalid_id)


@pytest.mark.asyncio
async def test_list_api_keys(db_session):
    """Test listing API keys with pagination."""
    # Create upstream
    upstream = Upstream(
        id=uuid4(),
        name="test-upstream",
        provider="openai",
        base_url="https://api.openai.com",
        api_key_encrypted="encrypted-key",
        is_active=True,
    )
    db_session.add(upstream)
    await db_session.commit()

    # Create multiple keys
    keys = []
    for i in range(5):
        result = await create_api_key(
            db=db_session,
            name=f"test-key-{i}",
            upstream_ids=[upstream.id],
        )
        keys.append(result)

    # List first page
    page1 = await list_api_keys(db=db_session, page=1, page_size=3)
    assert page1.total == 5
    assert page1.page == 1
    assert page1.page_size == 3
    assert page1.total_pages == 2
    assert len(page1.items) == 3

    # List second page
    page2 = await list_api_keys(db=db_session, page=2, page_size=3)
    assert page2.total == 5
    assert page2.page == 2
    assert len(page2.items) == 2

    # Verify keys are ordered by created_at desc (newest first)
    assert page1.items[0].name == "test-key-4"


@pytest.mark.asyncio
async def test_list_api_keys_empty(db_session):
    """Test listing API keys when none exist."""
    result = await list_api_keys(db=db_session)
    assert result.total == 0
    assert len(result.items) == 0
    assert result.total_pages == 1
