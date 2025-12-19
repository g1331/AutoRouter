"""Encryption utilities for secure storage of upstream API keys.

This module provides Fernet symmetric encryption for storing upstream API keys.
The encryption key must be provided via ENCRYPTION_KEY or ENCRYPTION_KEY_FILE environment variables.

Usage:
    from app.core.encryption import encrypt_upstream_key, decrypt_upstream_key

    # Encrypt an upstream API key before storing
    encrypted = encrypt_upstream_key("sk-real-upstream-key-123")

    # Decrypt when forwarding to upstream
    decrypted = decrypt_upstream_key(encrypted)
"""

import sys
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from loguru import logger

from app.core.config import settings


class EncryptionError(Exception):
    """Raised when encryption/decryption operations fail."""


def _load_encryption_key() -> bytes:
    """Load and validate the encryption key from environment.

    The key can be provided in two ways:
    1. ENCRYPTION_KEY: Direct base64-encoded Fernet key
    2. ENCRYPTION_KEY_FILE: Path to a file containing the key

    Returns:
        bytes: Valid Fernet encryption key

    Raises:
        SystemExit: If no valid encryption key is found (fail-fast)
    """
    # Try to load from direct environment variable
    if settings.encryption_key:
        try:
            key = settings.encryption_key.encode("utf-8")
            # Validate by attempting to create Fernet instance
            Fernet(key)
            logger.info("Loaded encryption key from ENCRYPTION_KEY environment variable")
            return key
        except Exception as e:
            logger.error(f"Invalid ENCRYPTION_KEY: {e}")
            sys.exit(1)

    # Try to load from file
    if settings.encryption_key_file:
        key_file = Path(settings.encryption_key_file)
        if not key_file.exists():
            logger.error(
                f"ENCRYPTION_KEY_FILE specified but file not found: {settings.encryption_key_file}"
            )
            sys.exit(1)

        try:
            key = key_file.read_text().strip().encode("utf-8")
            # Validate by attempting to create Fernet instance
            Fernet(key)
            logger.info(f"Loaded encryption key from file: {settings.encryption_key_file}")
            return key
        except Exception as e:
            logger.error(f"Invalid encryption key in file {settings.encryption_key_file}: {e}")
            sys.exit(1)

    # No encryption key provided - fail fast
    logger.critical(
        "ENCRYPTION_KEY is required but not provided. "
        'Generate a key with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
        "and set it via ENCRYPTION_KEY or ENCRYPTION_KEY_FILE environment variable."
    )
    sys.exit(1)


# Load encryption key at module import time (fail-fast)
_ENCRYPTION_KEY = _load_encryption_key()
_fernet = Fernet(_ENCRYPTION_KEY)


def encrypt_upstream_key(plaintext_key: str) -> str:
    """Encrypt an upstream API key for secure storage.

    Args:
        plaintext_key: The plaintext upstream API key

    Returns:
        str: Base64-encoded encrypted key (safe for database storage)

    Raises:
        EncryptionError: If encryption fails
    """
    try:
        encrypted_bytes = _fernet.encrypt(plaintext_key.encode("utf-8"))
        return encrypted_bytes.decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to encrypt upstream key: {e}")
        raise EncryptionError(f"Encryption failed: {e}") from e


def decrypt_upstream_key(encrypted_key: str) -> str:
    """Decrypt an upstream API key for use.

    Args:
        encrypted_key: Base64-encoded encrypted key from database

    Returns:
        str: Decrypted plaintext API key

    Raises:
        EncryptionError: If decryption fails (e.g., invalid key, tampered data)
    """
    try:
        decrypted_bytes = _fernet.decrypt(encrypted_key.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except InvalidToken:
        logger.error(
            "Failed to decrypt upstream key: Invalid token (wrong encryption key or tampered data)"
        )
        raise EncryptionError("Decryption failed: Invalid token") from None
    except Exception as e:
        logger.error(f"Failed to decrypt upstream key: {e}")
        raise EncryptionError(f"Decryption failed: {e}") from e


def generate_encryption_key() -> str:
    """Generate a new Fernet encryption key.

    This is a utility function for initial setup.
    The generated key should be stored securely and backed up.

    Returns:
        str: Base64-encoded Fernet key (44 characters)

    Example:
        >>> key = generate_encryption_key()
        >>> print(f"Set this in your environment: ENCRYPTION_KEY={key}")
    """
    return Fernet.generate_key().decode("utf-8")
