"""Database ORM models for API key management.

This module defines the SQLAlchemy ORM models for:
- APIKey: Client API keys for downstream authentication
- Upstream: AI service provider configurations
- APIKeyUpstream: Join table for API key to upstream permissions
- RequestLog: Request audit logs for analytics and billing
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class APIKey(Base):
    """API keys distributed to downstream clients.

    Attributes:
        id: Unique identifier
        key_hash: bcrypt hash of the API key (for secure storage)
        key_prefix: First 12 characters of the key (for display, e.g., 'sk-auto-xxxx')
        name: Human-readable name for the key
        description: Optional description of the key's purpose
        user_id: Reserved for future user system integration
        is_active: Whether the key is currently valid
        expires_at: Optional expiration timestamp
        created_at: Timestamp when the key was created
        updated_at: Timestamp when the key was last modified
    """

    __tablename__ = "api_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[UUID | None] = mapped_column(nullable=True)  # Reserved for Phase 2
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    upstreams: Mapped[list["APIKeyUpstream"]] = relationship(
        "APIKeyUpstream", back_populates="api_key", cascade="all, delete-orphan"
    )
    request_logs: Mapped[list["RequestLog"]] = relationship(
        "RequestLog", back_populates="api_key"
    )

    def __repr__(self) -> str:
        return f"<APIKey(id={self.id}, name='{self.name}', prefix='{self.key_prefix}', active={self.is_active})>"


class Upstream(Base):
    """AI service provider upstream configurations.

    Attributes:
        id: Unique identifier
        name: Unique upstream name (used for X-Upstream-Name header)
        provider: Provider type ('openai', 'anthropic', etc.)
        base_url: Base URL for the upstream API
        api_key_encrypted: Fernet-encrypted upstream API key
        is_default: Whether this is the default upstream
        timeout: Request timeout in seconds
        is_active: Whether the upstream is currently active
        config: Reserved JSON field for additional configuration
        created_at: Timestamp when the upstream was created
        updated_at: Timestamp when the upstream was last modified
    """

    __tablename__ = "upstreams"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    timeout: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    config: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON stored as text
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    api_keys: Mapped[list["APIKeyUpstream"]] = relationship(
        "APIKeyUpstream", back_populates="upstream", cascade="all, delete-orphan"
    )
    request_logs: Mapped[list["RequestLog"]] = relationship(
        "RequestLog", back_populates="upstream"
    )

    def __repr__(self) -> str:
        return f"<Upstream(id={self.id}, name='{self.name}', provider='{self.provider}', active={self.is_active})>"


class APIKeyUpstream(Base):
    """Join table mapping API keys to authorized upstreams.

    This table enforces which API keys can access which upstream services.

    Attributes:
        id: Unique identifier
        api_key_id: Foreign key to api_keys table
        upstream_id: Foreign key to upstreams table
        created_at: Timestamp when the permission was granted
    """

    __tablename__ = "api_key_upstreams"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    api_key_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False, index=True
    )
    upstream_id: Mapped[UUID] = mapped_column(
        ForeignKey("upstreams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    api_key: Mapped["APIKey"] = relationship("APIKey", back_populates="upstreams")
    upstream: Mapped["Upstream"] = relationship("Upstream", back_populates="api_keys")

    # Constraints
    __table_args__ = (
        UniqueConstraint("api_key_id", "upstream_id", name="uq_api_key_upstream"),
    )

    def __repr__(self) -> str:
        return f"<APIKeyUpstream(api_key_id={self.api_key_id}, upstream_id={self.upstream_id})>"


class RequestLog(Base):
    """Request audit logs for analytics and billing.

    Attributes:
        id: Unique identifier
        api_key_id: Foreign key to api_keys table (nullable for unauthenticated requests)
        upstream_id: Foreign key to upstreams table (nullable for failed routing)
        method: HTTP method (GET, POST, etc.)
        path: Request path
        model: AI model name from the request
        prompt_tokens: Number of prompt tokens used
        completion_tokens: Number of completion tokens used
        total_tokens: Total tokens used (prompt + completion)
        status_code: HTTP status code of the response
        duration_ms: Request duration in milliseconds
        error_message: Error message if the request failed
        created_at: Timestamp when the request was made
    """

    __tablename__ = "request_logs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    api_key_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )
    upstream_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("upstreams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    # Relationships
    api_key: Mapped["APIKey | None"] = relationship("APIKey", back_populates="request_logs")
    upstream: Mapped["Upstream | None"] = relationship("Upstream", back_populates="request_logs")

    def __repr__(self) -> str:
        return f"<RequestLog(id={self.id}, method='{self.method}', path='{self.path}', status={self.status_code})>"
