"""agenda des sorties (événements enrichis)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-07
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("kind", sa.String(length=24), nullable=False, server_default="soiree"))
    op.add_column("events", sa.Column("description", sa.Text(), nullable=False, server_default=""))
    op.add_column("events", sa.Column("link", sa.String(length=300), nullable=True))
    op.add_column("events", sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_events_starts_at", "events", ["starts_at"])


def downgrade() -> None:
    op.drop_index("ix_events_starts_at", table_name="events")
    for col in ("created_at", "link", "description", "kind"):
        op.drop_column("events", col)
