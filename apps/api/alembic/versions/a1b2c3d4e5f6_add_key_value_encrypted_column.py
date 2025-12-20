"""add key_value_encrypted column

Revision ID: a1b2c3d4e5f6
Revises: 3759404c81c3
Create Date: 2025-12-20 05:08:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '3759404c81c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add key_value_encrypted column for API key reveal functionality."""
    op.add_column('api_keys', sa.Column('key_value_encrypted', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove key_value_encrypted column."""
    op.drop_column('api_keys', 'key_value_encrypted')
