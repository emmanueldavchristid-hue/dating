"""envies et nouvelles catégories

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05
"""
import sqlalchemy as sa

from alembic import op
from app.services.vocab import CATEGORIES

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("group_slug", sa.String(length=32), nullable=True))
    cats = sa.table(
        "categories",
        sa.column("slug", sa.String),
        sa.column("name", sa.String),
        sa.column("icon", sa.String),
        sa.column("sort", sa.SmallInteger),
        sa.column("group_slug", sa.String),
    )
    conn = op.get_bind()
    for k, (slug, name, icon, group) in enumerate(CATEGORIES):
        values = {"slug": slug, "name": name, "icon": icon, "sort": k, "group_slug": group}
        if conn.execute(sa.select(cats.c.slug).where(cats.c.slug == slug)).first():
            conn.execute(cats.update().where(cats.c.slug == slug).values(**values))
        else:
            conn.execute(cats.insert().values(**values))


def downgrade() -> None:
    op.drop_column("categories", "group_slug")
