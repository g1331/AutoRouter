"""API Key management service.

This service handles:
- Generating random API keys
- Creating and storing keys with bcrypt hashing and Fernet encryption
- Revoking keys and cache invalidation
- Revealing encrypted keys
- Listing and retrieving keys
"""

import base64
import secrets
from datetime import datetime, UTC
from uuid import UUID, uuid4

import bcrypt
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_upstream_key, encrypt_upstream_key
from app.models.db_models import APIKey, APIKeyUpstream, Upstream
from app.models.schemas import (
    APIKeyCreateResponse,
    APIKeyResponse,
    APIKeyRevealResponse,
    PaginatedAPIKeysResponse,
)


def generate_api_key() -> str:
    """Generate a random API key with format: sk-auto-{32-byte-base64-random}

    The key is cryptographically secure and suitable for authentication.

    Returns:
        str: Generated API key (e.g., 'sk-auto-AbCdEf1234...')

    Example:
        >>> key = generate_api_key()
        >>> assert key.startswith('sk-auto-')
        >>> assert len(key) in (50, 51, 52)  # 'sk-auto-' (8) + 42-44 base64 chars (padding stripped)
    """
    # Generate 32 random bytes
    random_bytes = secrets.token_bytes(32)
    # Encode as base64 (URL-safe, no padding)
    random_b64 = base64.urlsafe_b64encode(random_bytes).decode("utf-8").rstrip("=")
    return f"sk-auto-{random_b64}"


async def create_api_key(
    db: AsyncSession,
    name: str,
    upstream_ids: list[UUID],
    description: str | None = None,
    expires_at: datetime | None = None,
) -> APIKeyCreateResponse:
    """Create a new API key with permissions for specified upstreams.

    Args:
        db: Database session
        name: Human-readable name for the key
        upstream_ids: List of upstream IDs this key can access (must be non-empty)
        description: Optional description
        expires_at: Optional expiration timestamp

    Returns:
        APIKeyCreateResponse: Created API key with full key_value (shown only once)

    Raises:
        ValueError: If upstream_ids is empty or contains invalid upstream IDs
    """
    if not upstream_ids:
        raise ValueError("At least one upstream must be specified")

    # Validate all upstreams exist (is_active check removed - inactive upstreams can still be associated)
    result = await db.execute(select(Upstream).where(Upstream.id.in_(upstream_ids)))
    valid_upstreams = result.scalars().all()

    if len(valid_upstreams) != len(upstream_ids):
        # Find invalid IDs
        valid_ids = {u.id for u in valid_upstreams}
        invalid_ids = [str(uid) for uid in upstream_ids if uid not in valid_ids]
        raise ValueError(f"Invalid upstream IDs: {invalid_ids}")

    # Generate API key
    key_value = generate_api_key()
    key_prefix = key_value[:12]  # 'sk-auto-xxxx'

    # Hash the key with bcrypt (work factor 12 is default, for backward compatibility)
    key_hash = bcrypt.hashpw(key_value.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Encrypt the key with Fernet (for reveal functionality)
    key_value_encrypted = encrypt_upstream_key(key_value)

    # Create API key record
    api_key = APIKey(
        id=uuid4(),
        key_hash=key_hash,
        key_value_encrypted=key_value_encrypted,
        key_prefix=key_prefix,
        name=name,
        description=description,
        is_active=True,
        expires_at=expires_at,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(api_key)
    await db.flush()  # Get the ID

    # Create permission entries in join table
    for upstream_id in upstream_ids:
        permission = APIKeyUpstream(
            id=uuid4(),
            api_key_id=api_key.id,
            upstream_id=upstream_id,
            created_at=datetime.now(UTC),
        )
        db.add(permission)

    await db.commit()
    await db.refresh(api_key)

    logger.info(
        f"Created API key: {api_key.key_prefix}, name='{name}', upstreams={len(upstream_ids)}"
    )

    # Return response with full key_value (only shown once)
    return APIKeyCreateResponse(
        id=api_key.id,
        key_value=key_value,  # Full key - ONLY returned here
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        description=api_key.description,
        upstream_ids=upstream_ids,
        is_active=api_key.is_active,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
        updated_at=api_key.updated_at,
    )


async def delete_api_key(db: AsyncSession, key_id: UUID) -> None:
    """Delete an API key from the database.

    This permanently removes the API key record. Associated upstream permissions
    are automatically removed via CASCADE delete.

    Args:
        db: Database session
        key_id: ID of the API key to delete

    Raises:
        ValueError: If API key not found
    """
    result = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise ValueError(f"API key not found: {key_id}")

    key_prefix = api_key.key_prefix
    key_name = api_key.name
    await db.delete(api_key)
    await db.commit()

    # Note: Cache invalidation strategy:
    # - We can't call clear_api_key_cache(plaintext_key) because we don't have the plaintext
    # - The cache will expire naturally after TTL (5 minutes max)
    # - If immediate invalidation is critical, call clear_all_api_key_cache() to flush all keys

    logger.info(f"Deleted API key: {key_prefix}, name='{key_name}'")


async def list_api_keys(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedAPIKeysResponse:
    """List all API keys with pagination.

    Args:
        db: Database session
        page: Page number (1-indexed)
        page_size: Number of items per page (max 100)

    Returns:
        PaginatedAPIKeysResponse: Paginated list of API keys
    """
    # Validate pagination params
    page = max(1, page)
    page_size = min(100, max(1, page_size))

    # Count total keys
    total_result = await db.execute(select(func.count()).select_from(APIKey))
    total = total_result.scalar() or 0

    # Query paginated results (ordered by created_at desc)
    offset = (page - 1) * page_size
    result = await db.execute(
        select(APIKey).order_by(APIKey.created_at.desc()).limit(page_size).offset(offset)
    )
    api_keys = result.scalars().all()

    # For each API key, fetch authorized upstream IDs
    items: list[APIKeyResponse] = []
    for api_key in api_keys:
        # Query upstream IDs from join table
        upstream_result = await db.execute(
            select(APIKeyUpstream.upstream_id).where(APIKeyUpstream.api_key_id == api_key.id)
        )
        upstream_ids = list(upstream_result.scalars())

        items.append(
            APIKeyResponse(
                id=api_key.id,
                key_prefix=api_key.key_prefix,  # Only prefix, never full key
                name=api_key.name,
                description=api_key.description,
                upstream_ids=upstream_ids,
                is_active=api_key.is_active,
                expires_at=api_key.expires_at,
                created_at=api_key.created_at,
                updated_at=api_key.updated_at,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedAPIKeysResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def reveal_api_key(db: AsyncSession, key_id: UUID) -> APIKeyRevealResponse:
    """Reveal the full decrypted API key value.

    Args:
        db: Database session
        key_id: ID of the API key to reveal

    Returns:
        APIKeyRevealResponse: Key details with decrypted value

    Raises:
        ValueError: If API key not found or is a legacy key without encryption
    """
    result = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise ValueError(f"API key not found: {key_id}")

    if not api_key.key_value_encrypted:
        raise ValueError(
            f"Legacy API key cannot be revealed (key_prefix={api_key.key_prefix}). "
            "Please regenerate this key to enable reveal functionality."
        )

    decrypted_key = decrypt_upstream_key(api_key.key_value_encrypted)

    logger.info(f"Revealed API key: {api_key.key_prefix}, name='{api_key.name}'")

    return APIKeyRevealResponse(
        id=api_key.id,
        key_value=decrypted_key,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
    )
