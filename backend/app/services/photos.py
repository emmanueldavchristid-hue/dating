"""Photos des lieux : ordre d'affichage, crédits et droits.

Ordre (décision de Jason, 10/11/2026) :
  1. photo réelle autorisée : fournie par le lieu (owner), prise par l'équipe (team) ou autre photo dont on
     détient l'autorisation écrite / la licence (licensed) ;
  2. photo Wikimedia Commons validée par l'équipe, avec auteur et licence ;
  3. sinon : illustration de l'app, toujours signalée comme telle (jamais présentée comme le lieu).
Google Places (option désactivée par défaut) ne s'insère qu'avant l'illustration, si elle est activée.
"""

import re
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Media, Place

REAL_KINDS = ("owner", "team", "licensed")
SOURCE_LABELS = {
    "owner": "Photo du lieu (autorisée)",
    "team": "Photo de l'équipe",
    "licensed": "Photo sous licence / autorisation",
    "wikimedia": "Wikimedia Commons",
    "google": "Google Maps",
}
TIER = {"owner": 1, "team": 1, "licensed": 1, "wikimedia": 2}


def is_displayable(m: Media) -> bool:
    return m.moderation_status == "approved" and bool(m.storage_key or m.source_url) and (m.source_kind or "") in TIER


def credit_for(m: Media, place_name: str | None = None) -> str:
    """Crédit affiché sous la photo (auteur, licence, source)."""
    if m.source_kind == "wikimedia":
        bits = [m.author or "Auteur inconnu", m.license, "Wikimedia Commons"]
        return "Photo : " + " · ".join(b for b in bits if b)
    if m.source_kind == "owner":
        return f"Photo : {m.author or place_name or 'le lieu'}, avec son autorisation"
    if m.source_kind == "licensed":
        return "Photo : " + " · ".join(b for b in (m.author, m.license) if b)
    return f"Photo : {m.author or 'équipe'}"


def ordered(media: list[Media]) -> list[Media]:
    """Photos affichables, dans l'ordre : réelles autorisées, puis Wikimedia ; puis leur position."""
    return sorted((m for m in media if is_displayable(m)), key=lambda m: (TIER[m.source_kind], m.position))


def refresh_cover(db: Session, place: Place) -> None:
    """Recalcule la couverture du lieu selon l'ordre ci-dessus (à appeler après tout changement de photo)."""
    media = list(db.scalars(select(Media).where(Media.place_id == place.id)))
    best = ordered(media)
    if best:
        m = best[0]
        place.cover_key, place.cover_url = (m.storage_key, None) if m.storage_key else (None, m.source_url)
        place.cover_kind = "wikimedia" if m.source_kind == "wikimedia" else "photo"
        place.cover_credit = credit_for(m, place.name)[:200]
    else:
        place.cover_key = place.cover_url = place.cover_kind = place.cover_credit = None


def mark_reviewed(m: Media, status: str) -> None:
    m.moderation_status = status
    m.reviewed_at = datetime.now(UTC)


def commons_page(url: str | None) -> str | None:
    """Page Commons d'un fichier à partir de son adresse (vignette ou original)."""
    m = re.search(r"/wikipedia/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)", url or "")
    return f"https://commons.wikimedia.org/wiki/File:{m.group(1)}" if m else None


def wikimedia_candidate(place: Place, info: dict, position: int = 0) -> Media:
    """Photo Wikimedia trouvée automatiquement : À VALIDER par l'équipe avant tout affichage (ne devient jamais
    la couverture d'elle-même). Auteur, licence et page source sont conservés."""
    m = Media(
        place_id=place.id,
        source_url=info["url"],
        alt=f"Photo de {place.name}",
        source_kind="wikimedia",
        author=(info.get("artist") or "Auteur inconnu")[:160],
        license=(info.get("license") or "")[:80] or None,
        license_url=(info.get("license_url") or "")[:300] or None,
        source_page=(info.get("source_page") or commons_page(info["url"]) or "")[:500] or None,
        width=info.get("width"),
        height=info.get("height"),
        position=position,
        moderation_status="pending",
    )
    m.credit = credit_for(m)[:160]
    return m
