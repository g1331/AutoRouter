"""Unit tests for encryption utilities."""

import pytest
from cryptography.fernet import Fernet

from app.core.encryption import (
    decrypt_upstream_key,
    encrypt_upstream_key,
    EncryptionError,
    generate_encryption_key,
)


def test_generate_encryption_key():
    """Test encryption key generation."""
    key = generate_encryption_key()

    # Should be 44 characters (base64 encoded 32 bytes)
    assert len(key) == 44
    assert isinstance(key, str)

    # Should be valid Fernet key
    Fernet(key.encode("utf-8"))


def test_encrypt_decrypt_roundtrip():
    """Test encryption and decryption roundtrip."""
    plaintext = "sk-test-api-key-12345"

    # Encrypt
    encrypted = encrypt_upstream_key(plaintext)
    assert encrypted != plaintext
    assert isinstance(encrypted, str)

    # Decrypt
    decrypted = decrypt_upstream_key(encrypted)
    assert decrypted == plaintext


def test_encrypt_different_keys_produce_different_ciphertexts():
    """Test that encrypting the same plaintext twice produces different ciphertexts."""
    plaintext = "sk-test-api-key-12345"

    encrypted1 = encrypt_upstream_key(plaintext)
    encrypted2 = encrypt_upstream_key(plaintext)

    # Fernet includes timestamp and random IV, so ciphertexts should differ
    assert encrypted1 != encrypted2

    # But both should decrypt to the same plaintext
    assert decrypt_upstream_key(encrypted1) == plaintext
    assert decrypt_upstream_key(encrypted2) == plaintext


def test_decrypt_invalid_token():
    """Test decryption with invalid token."""
    with pytest.raises(EncryptionError, match="Invalid token"):
        decrypt_upstream_key("invalid-encrypted-data")


def test_decrypt_tampered_data():
    """Test decryption with tampered data."""
    plaintext = "sk-test-api-key-12345"
    encrypted = encrypt_upstream_key(plaintext)

    # Tamper with the encrypted data
    tampered = encrypted[:-5] + "XXXXX"

    with pytest.raises(EncryptionError):
        decrypt_upstream_key(tampered)


def test_encrypt_empty_string():
    """Test encrypting empty string."""
    encrypted = encrypt_upstream_key("")
    decrypted = decrypt_upstream_key(encrypted)
    assert decrypted == ""


def test_encrypt_unicode():
    """Test encrypting unicode characters."""
    plaintext = "sk-测试-🔑-key"
    encrypted = encrypt_upstream_key(plaintext)
    decrypted = decrypt_upstream_key(encrypted)
    assert decrypted == plaintext


def test_encrypt_long_string():
    """Test encrypting long string."""
    plaintext = "x" * 10000
    encrypted = encrypt_upstream_key(plaintext)
    decrypted = decrypt_upstream_key(encrypted)
    assert decrypted == plaintext
