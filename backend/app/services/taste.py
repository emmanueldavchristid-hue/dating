"""Profil de goûts et matching.

Le profil combine, sur 180 jours :
- les préférences déclarées (onboarding) ;
- les signaux implicites pondérés (favori, itinéraire, appel, partage, vue, rejet) ;
- les avis laissés (une note ≥ 4 rapproche, ≤ 2 éloigne).

Il produit des poids par catégorie et ambiance, un budget typique et un vecteur moyen
(dans l'espace des embeddings des lieux) utilisé pour l'affinité en SQL et le score `match`."""

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Favorite, Interaction, Place, Review, User

SIGNAL_WEIGHTS = {
    "view": 0.5,
    "favorite": 3.0,
    "share": 2.0,
    "directions": 2.0,
    "call": 2.0,
    "itinerary_add": 3.0,
    "dismiss": -2.0,
}
DECLARED_WEIGHT = 2.0
WINDOW_DAYS = 180
MIN_SIGNALS_FOR_MATCH = 3


@dataclass
class Taste:
    categories: dict[str, float] = field(default_factory=dict)
    ambiances: dict[str, float] = field(default_factory=dict)
    vector: list[float] | None = None
    budget_typical: int | None = None
    signals: int = 0
    declared: bool = False

    def top(self, weights: dict[str, float], n: int = 5) -> list[tuple[str, float]]:
        return sorted(((k, round(v, 2)) for k, v in weights.items() if v > 0), key=lambda kv: -kv[1])[:n]

    @property
    def usable(self) -> bool:
        return self.declared or self.signals >= MIN_SIGNALS_FOR_MATCH

    def as_prefs(self) -> dict:
        return {
            "categories": [c for c, _ in self.top(self.categories, 4)],
            "ambiances": [a for a, _ in self.top(self.ambiances, 3)],
            "budget_max_fcfa": self.budget_typical,
            "vector": self.vector if self.signals >= MIN_SIGNALS_FOR_MATCH else None,
        }

    def match(self, place: Place, embedding: list[float] | None) -> int | None:
        """Affinité 0–100 : 55 % catégories/ambiances aimées, 25 % proximité vectorielle, 20 % qualité.

        Sans vecteur (peu de signaux), la part vectorielle est neutre (0,5) : un 100 % reste rare et mérité."""
        if not self.usable:
            return None
        max_c = max((v for v in self.categories.values() if v > 0), default=0)
        max_a = max((v for v in self.ambiances.values() if v > 0), default=0)
        c = max((self.categories.get(s, 0) for s in place.category_slugs or []), default=0) / max_c if max_c else 0
        a = max((self.ambiances.get(s, 0) for s in place.ambiance_slugs or []), default=0) / max_a if max_a else 0
        tax = max(0.0, 0.65 * c + 0.35 * a)
        sim = 0.5
        if self.vector is not None and embedding is not None:
            cos = sum(x * y for x, y in zip(self.vector, embedding, strict=True))
            sim = math.sqrt(max(0.0, min(1.0, cos)))
        n = place.rating_count or 0
        bayes = (10 * 3.8 + (place.rating_avg or 0) * n) / (10 + n)
        quality = max(0.0, min(1.0, (bayes - 3.0) / 2.0))
        return round(100 * (0.55 * tax + 0.25 * sim + 0.20 * quality))


def compute_taste(db: Session, user: User) -> Taste:
    cache = db.info.setdefault("taste_cache", {})
    if user.id in cache:
        return cache[user.id]
    t = Taste()
    p = user.preferences
    if p and (p.categories or p.ambiances):
        t.declared = True
        for c in p.categories or []:
            t.categories[c] = t.categories.get(c, 0) + DECLARED_WEIGHT
        for a in p.ambiances or []:
            t.ambiances[a] = t.ambiances.get(a, 0) + DECLARED_WEIGHT

    since = datetime.now(UTC) - timedelta(days=WINDOW_DAYS)
    weighted: list[tuple[Place, float]] = []
    rows = db.execute(
        select(Place, Interaction.type)
        .join(Interaction, Interaction.place_id == Place.id)
        .where(Interaction.user_id == user.id, Interaction.created_at >= since)
    ).all()
    weighted += [(pl, SIGNAL_WEIGHTS.get(kind, 0.0)) for pl, kind in rows]
    favs = db.scalars(
        select(Place).join(Favorite, Favorite.place_id == Place.id).where(Favorite.user_id == user.id)
    ).all()
    weighted += [(pl, SIGNAL_WEIGHTS["favorite"]) for pl in favs]
    reviews = db.execute(
        select(Place, Review.rating).join(Review, Review.place_id == Place.id).where(Review.user_id == user.id)
    ).all()
    weighted += [(pl, float(r - 3)) for pl, r in reviews if r != 3]
    t.signals = len(weighted)

    acc = None
    budgets: list[tuple[float, float]] = []
    pos_total = 0.0
    for place, w in weighted:
        for c in place.category_slugs or []:
            t.categories[c] = t.categories.get(c, 0) + w
        for a in place.ambiance_slugs or []:
            t.ambiances[a] = t.ambiances.get(a, 0) + w
        if w > 0:
            if place.embedding is not None:
                emb = list(place.embedding)
                acc = [x * w for x in emb] if acc is None else [x + y * w for x, y in zip(acc, emb, strict=True)]
                pos_total += w
            if place.budget_min_fcfa is not None and place.budget_max_fcfa is not None:
                budgets.append(((place.budget_min_fcfa + place.budget_max_fcfa) / 2, w))
    if acc is not None and pos_total >= 1:
        n = math.sqrt(sum(x * x for x in acc)) or 1.0
        t.vector = [x / n for x in acc]
    if budgets:
        t.budget_typical = int(round(sum(b * w for b, w in budgets) / sum(w for _, w in budgets), -3))
    elif p and p.budget_max_fcfa:
        t.budget_typical = p.budget_max_fcfa
    cache[user.id] = t
    return t
