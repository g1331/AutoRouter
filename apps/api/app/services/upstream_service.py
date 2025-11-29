"""Upstream management service.

This service handles:
- Creating upstreams with encrypted API keys
- Updating upstream configurations
- Soft-deleting upstreams
- Listing upstreams with masked API keys
- Loading upstreams from database
"""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_upstream_key, encrypt_upstream_key
from app.models.db_models import Upstream
from app.models.schemas import PaginatedUpstreamsResponse, UpstreamResponse


def mask_api_key(api_key: str) -> str:
    """Mask an API key for display (e.g., 'sk-***1234').

    Shows only the prefix and last 4 characters.

    Args:
        api_key: Full API key

    Returns:
        str: Masked key (e.g., 'sk-***1234')
    """
    if len(api_key) <= 7:
        return "***"

    prefix = api_key[:3] if api_key.startswith("sk-") else api_key[:2]
    suffix = api_key[-4:]
    return f"{prefix}***{suffix}"


async def create_upstream(
    db: AsyncSession,
    name: str,
    provider: str,
    base_url: str,
    api_key: str,
    is_default: bool = False,
    timeout: int = 60,
    config: str | None = None,
) -> UpstreamResponse:
    """Create a new upstream with encrypted API key.

    Args:
        db: Database session
        name: Unique upstream name
        provider: Provider type ('openai', 'anthropic', etc.)
        base_url: Base URL for the upstream API
        api_key: Plaintext upstream API key (will be encrypted)
        is_default: Whether this is the default upstream
        timeout: Request timeout in seconds
        config: Optional JSON configuration

    Returns:
        UpstreamResponse: Created upstream with masked API key

    Raises:
        ValueError: If upstream name already exists
    """
    # Check if name already exists
    existing = await db.execute(select(Upstream).where(Upstream.name == name))
    if existing.scalar_one_or_none():
        raise ValueError(f"Upstream with name '{name}' already exists")

    # Encrypt the API key
    api_key_encrypted = encrypt_upstream_key(api_key)

    # Create upstream record
    upstream = Upstream(
        id=uuid4(),
        name=name,
        provider=provider,
        base_url=base_url,
        api_key_encrypted=api_key_encrypted,
        is_default=is_default,
        timeout=timeout,
        is_active=True,
        config=config,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(upstream)
    await db.commit()
    await db.refresh(upstream)

    logger.info(f"Created upstream: {upstream.name}, provider={upstream.provider}, default={is_default}")

    # Return response with masked API key
    return UpstreamResponse(
        id=upstream.id,
        name=upstream.name,
        provider=upstream.provider,
        base_url=upstream.base_url,
        api_key_masked=mask_api_key(api_key),
        is_default=upstream.is_default,
        timeout=upstream.timeout,
        is_active=upstream.is_active,
        config=upstream.config,
        created_at=upstream.created_at,
        updated_at=upstream.updated_at,
    )


async def update_upstream(
    db: AsyncSession,
    upstream_id: UUID,
    name: str | None = None,
    provider: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    is_default: bool | None = None,
    timeout: int | None = None,
    is_active: bool | None = None,
    config: str | None = None,
) -> UpstreamResponse:
    """Update an existing upstream.

    Only provided fields will be updated. If api_key is provided, it will be re-encrypted.

    Args:
        db: Database session
        upstream_id: ID of the upstream to update
        name: New name (optional)
        provider: New provider (optional)
        base_url: New base URL (optional)
        api_key: New API key in plaintext (optional, will be re-encrypted)
        is_default: New default flag (optional)
        timeout: New timeout (optional)
        is_active: New active status (optional)
        config: New JSON config (optional)

    Returns:
        UpstreamResponse: Updated upstream with masked API key

    Raises:
        ValueError: If upstream not found or name conflict
    """
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id))
    upstream = result.scalar_one_or_none()

    if not upstream:
        raise ValueError(f"Upstream not found: {upstream_id}")

    # Check name uniqueness if changing name
    if name and name != upstream.name:
        existing = await db.execute(select(Upstream).where(Upstream.name == name))
        if existing.scalar_one_or_none():
            raise ValueError(f"Upstream with name '{name}' already exists")
        upstream.name = name

    # Update fields
    if provider is not None:
        upstream.provider = provider
    if base_url is not None:
        upstream.base_url = base_url
    if api_key is not None:
        upstream.api_key_encrypted = encrypt_upstream_key(api_key)
    if is_default is not None:
        upstream.is_default = is_default
    if timeout is not None:
        upstream.timeout = timeout
    if is_active is not None:
        upstream.is_active = is_active
    if config is not None:
        upstream.config = config

    upstream.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(upstream)

    logger.info(f"Updated upstream: {upstream.name}")

    # Decrypt key for masking (if not changed, use existing encrypted one)
    decrypted_key = decrypt_upstream_key(upstream.api_key_encrypted)

    return UpstreamResponse(
        id=upstream.id,
        name=upstream.name,
        provider=upstream.provider,
        base_url=upstream.base_url,
        api_key_masked=mask_api_key(decrypted_key),
        is_default=upstream.is_default,
        timeout=upstream.timeout,
        is_active=upstream.is_active,
        config=upstream.config,
        created_at=upstream.created_at,
        updated_at=upstream.updated_at,
    )


async def delete_upstream(db: AsyncSession, upstream_id: UUID) -> None:
    """Soft-delete an upstream (mark as inactive).

    Args:
        db: Database session
        upstream_id: ID of the upstream to delete

    Raises:
        ValueError: If upstream not found
    """
    result = await db.execute(select(Upstream).where(Upstream.id == upstream_id))
    upstream = result.scalar_one_or_none()

    if not upstream:
        raise ValueError(f"Upstream not found: {upstream_id}")

    upstream.is_active = False
    upstream.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(f"Soft-deleted upstream: {upstream.name}")


async def list_upstreams(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedUpstreamsResponse:
    """List all upstreams with pagination and masked API keys.

    Args:
        db: Database session
        page: Page number (1-indexed)
        page_size: Number of items per page (max 100)

    Returns:
        PaginatedUpstreamsResponse: Paginated list of upstreams
    """
    # Validate pagination params
    page = max(1, page)
    page_size = min(100, max(1, page_size))

    # Count total
    total_result = await db.execute(select(func.count()).select_from(Upstream))
    total = total_result.scalar() or 0

    # Query paginated results (ordered by created_at desc)
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Upstream).order_by(Upstream.created_at.desc()).limit(page_size).offset(offset)
    )
    upstreams = result.scalars().all()

    # Build response items with masked API keys
    items: list[UpstreamResponse] = []
    for upstream in upstreams:
        # Decrypt key for masking
        try:
            decrypted_key = decrypt_upstream_key(upstream.api_key_encrypted)
            masked_key = mask_api_key(decrypted_key)
        except Exception as e:
            logger.error(f"Failed to decrypt upstream key for masking: {upstream.name}, error: {e}")
            masked_key = "***error***"

        items.append(
            UpstreamResponse(
                id=upstream.id,
                name=upstream.name,
                provider=upstream.provider,
                base_url=upstream.base_url,
                api_key_masked=masked_key,
                is_default=upstream.is_default,
                timeout=upstream.timeout,
                is_active=upstream.is_active,
                config=upstream.config,
                created_at=upstream.created_at,
                updated_at=upstream.updated_at,
            )
        )

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedUpstreamsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


async def load_upstreams_from_db(db: AsyncSession) -> list[Upstream]:
    """Load all active upstreams from database.

    This is used by the UpstreamManager during application startup.

    Args:
        db: Database session

    Returns:
        list[Upstream]: List of active upstream ORM objects
    """
    result = await db.execute(select(Upstream).where(Upstream.is_active == True))  # noqa: E712
    return list(result.scalars().all())
