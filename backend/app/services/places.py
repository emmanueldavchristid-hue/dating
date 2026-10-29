"""Opérations d'écriture sur les lieux : taxonomie dénormalisée, agrégats de notes."""

import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Ambiance, Category, Place, Review


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:150] or "lieu"


def set_taxonomy(db: Session, place: Place, categories: list[str] | None, ambiances: list[str] | None) -> None:
    """Met à jour les tables de liaison (source de vérité) ET les tableaux dénormalisés (lecture rapide)."""
    if categories is not None:
        cats = list(db.scalars(select(Category).where(Category.slug.in_(categories))))
        if len(cats) != len(set(categories)):
            raise ApiError(400, "unknown_category", "Catégorie inconnue")
        place.categories = cats
        place.category_slugs = [c.slug for c in cats]
    if ambiances is not None:
        ambs = list(db.scalars(select(Ambiance).where(Ambiance.slug.in_(ambiances))))
        if len(ambs) != len(set(ambiances)):
            raise ApiError(400, "unknown_ambiance", "Ambiance inconnue")
        place.ambiances = ambs
        place.ambiance_slugs = [a.slug for a in ambs]


def refresh_rating(db: Session, place: Place) -> None:
    avg, count = db.execute(
        select(func.avg(Review.rating), func.count()).where(Review.place_id == place.id, Review.status == "published")
    ).one()
    place.rating_avg = float(avg) if avg is not None else None
    place.rating_count = count
