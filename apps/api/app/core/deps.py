"""FastAPI dependency injection functions for authentication and database access.

This module provides:
- get_db: Database session dependency
- get_current_api_key: Validates client API keys with bcrypt + TTL cache
- verify_admin_token: Validates admin bearer tokens
- clear_api_key_cache: Utility for cache invalidation on key revocation
"""

from datetime import datetime, timezone
from typing import Annotated

import bcrypt
from cachetools import TTLCache
from fastapi import Depends, Header, HTTPException
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import get_db
from app.models.db_models import APIKey

# API Key validation cache
# Maps plaintext_key -> APIKey object
# TTL=300s (5 minutes), maxsize=10000
_api_key_cache: TTLCache[str, APIKey] = TTLCache(maxsize=10000, ttl=300)


async def get_current_api_key(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> APIKey:
    """Validate API key from Authorization header with bcrypt + cache.

    This dependency:
    1. Checks the TTL cache for the plaintext key
    2. On cache miss, queries database by key prefix and validates with bcrypt
    3. Caches valid keys for 5 minutes

    Args:
        authorization: Authorization header (format: "Bearer sk-auto-...")
        db: Database session from dependency

    Returns:
        APIKey: Validated API key object

    Raises:
        HTTPException(401): Missing, invalid, inactive, or expired API key

    Security notes:
        - Plaintext keys are cached in memory (cleared on revocation or after TTL)
        - bcrypt.checkpw() is used for constant-time comparison
        - Cache reduces database + bcrypt overhead from ~10ms to <1ms
    """
    # Validate Authorization header format
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail={"error": "missing_api_key", "message": "Authorization header required"},
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_authorization", "message": "Authorization header must use Bearer scheme"},
        )

    key_value = authorization[7:]  # Remove "Bearer " prefix

    # Check cache first
    if key_value in _api_key_cache:
        api_key = _api_key_cache[key_value]
        # Double-check: ensure still active and not expired (防止撤销后缓存未清除)
        now = datetime.now(timezone.utc)
        if api_key.is_active and (not api_key.expires_at or api_key.expires_at > now):
            logger.debug(f"API key cache hit: {api_key.key_prefix}")
            return api_key
        else:
            # Remove stale entry from cache
            del _api_key_cache[key_value]
            logger.debug(f"Removed stale API key from cache: {api_key.key_prefix}")

    # Cache miss - query database
    # Optimization: narrow down by key_prefix to reduce bcrypt operations
    key_prefix = key_value[:12] if len(key_value) >= 12 else key_value

    result = await db.execute(
        select(APIKey).where(
            APIKey.key_prefix == key_prefix,
            APIKey.is_active == True,  # noqa: E712
        )
    )
    candidate_keys = result.scalars().all()

    # Verify with bcrypt (constant-time comparison)
    matched_key: APIKey | None = None
    for candidate in candidate_keys:
        try:
            if bcrypt.checkpw(key_value.encode("utf-8"), candidate.key_hash.encode("utf-8")):
                matched_key = candidate
                break
        except Exception as e:
            logger.warning(f"bcrypt verification failed for key {candidate.key_prefix}: {e}")
            continue

    if not matched_key:
        logger.warning(f"Invalid API key attempt with prefix: {key_prefix}")
        raise HTTPException(
            status_code=401,
            detail={"error": "invalid_api_key", "message": "API key not found or inactive"},
        )

    # Check expiration
    now = datetime.now(timezone.utc)
    if matched_key.expires_at and matched_key.expires_at < now:
        logger.warning(f"Expired API key used: {matched_key.key_prefix}")
        raise HTTPException(
            status_code=401,
            detail={"error": "api_key_expired", "message": "API key has expired"},
        )

    # Cache the valid key
    _api_key_cache[key_value] = matched_key
    logger.debug(f"API key validated and cached: {matched_key.key_prefix}")

    return matched_key


def verify_admin_token(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    """Verify admin bearer token from Authorization header.

    Args:
        authorization: Authorization header (format: "Bearer {ADMIN_TOKEN}")

    Raises:
        HTTPException(403): Invalid or missing admin token

    Security notes:
        - Always returns 403 (not 401) to avoid revealing endpoint existence
        - Uses constant-time comparison via secrets.compare_digest
    """
    import secrets

    # Check if admin token is configured
    if not settings.admin_token:
        logger.error("ADMIN_TOKEN not configured but admin endpoint accessed")
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Admin access required"},
        )

    # Validate Authorization header
    if not authorization:
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Admin access required"},
        )

    # Normalize: strip whitespace and check Bearer prefix
    auth_normalized = authorization.strip()
    if not auth_normalized.startswith("Bearer "):
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Admin access required"},
        )

    token = auth_normalized[7:]  # Remove "Bearer " prefix

    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(token, settings.admin_token):
        logger.warning(f"Invalid admin token attempt from Authorization header")
        raise HTTPException(
            status_code=403,
            detail={"error": "forbidden", "message": "Admin access required"},
        )

    logger.debug("Admin token verified successfully")


def clear_api_key_cache(key_value: str) -> None:
    """Clear a specific API key from the cache.

    This should be called when:
    - Revoking an API key (to ensure immediate invalidation)
    - Manually clearing cache via admin API

    Args:
        key_value: The plaintext API key to remove from cache
    """
    if key_value in _api_key_cache:
        del _api_key_cache[key_value]
        logger.info(f"Cleared API key from cache: {key_value[:12]}...")


def clear_all_api_key_cache() -> None:
    """Clear all API keys from the cache.

    This is a utility function for admin operations or testing.
    Normal operation should use clear_api_key_cache() for targeted invalidation.
    """
    _api_key_cache.clear()
    logger.info("Cleared all API keys from cache")


__all__ = [
    "get_db",
    "get_current_api_key",
    "verify_admin_token",
    "clear_api_key_cache",
    "clear_all_api_key_cache",
]
