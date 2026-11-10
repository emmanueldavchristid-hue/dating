"""photos : source, auteur, licence, autorisation ; couverture calculée (réelle → Wikimedia → illustration)

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-10
"""
import re
from urllib.parse import unquote

import sqlalchemy as sa

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def commons_page(url: str) -> str | None:
    """Page Commons d'un fichier à partir de son adresse (vignette ou original)."""
    m = re.search(r"/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)", url)
    return f"https://commons.wikimedia.org/wiki/File:{m.group(1)}" if m else None


def upgrade() -> None:
    op.add_column("media", sa.Column("source_kind", sa.String(length=16), nullable=True))
    op.add_column("media", sa.Column("author", sa.String(length=160), nullable=True))
    op.add_column("media", sa.Column("license_url", sa.String(length=300), nullable=True))
    op.add_column("media", sa.Column("source_page", sa.String(length=500), nullable=True))
    op.add_column("media", sa.Column("rights_note", sa.String(length=300), nullable=True))
    op.add_column("media", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("places", sa.Column("cover_kind", sa.String(length=16), nullable=True))
    op.add_column("places", sa.Column("cover_credit", sa.String(length=200), nullable=True))

    conn = op.get_bind()
    # Photos déposées par l'équipe : réelles, droits détenus par l'équipe.
    conn.execute(sa.text("update media set source_kind = 'team' where storage_key is not null"))
    conn.execute(sa.text("update places set cover_kind = 'photo' where cover_key is not null"))
    # Photos Wikimedia importées automatiquement : à valider par l'équipe avant affichage.
    rows = conn.execute(sa.text("select id, source_url, credit from media where source_url is not null")).all()
    for mid, url, credit in rows:
        author = (credit or "").split(" · ")[0] or None
        conn.execute(
            sa.text(
                "update media set source_kind = 'wikimedia', moderation_status = 'pending', author = :a, "
                "source_page = :p where id = :id"
            ),
            {"a": author, "p": commons_page(unquote(url)) if url else None, "id": mid},
        )
    conn.execute(sa.text("update places set cover_url = null where cover_url is not null and cover_key is null"))


def downgrade() -> None:
    for col in ("cover_credit", "cover_kind"):
        op.drop_column("places", col)
    for col in ("reviewed_at", "rights_note", "source_page", "license_url", "author", "source_kind"):
        op.drop_column("media", col)
