"""Models for the API application.

This package contains:
- Database ORM models (db_models.py)
- Pydantic models for upstream configuration (upstream.py)

Note: Database models are not imported here to avoid circular dependencies during Alembic initialization.
Import them directly from app.models.db_models when needed.
"""

__all__: list[str] = []
