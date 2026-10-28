import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Response
from geoalchemy2 import Geography
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import aliased

from app.deps import DB, CurrentUser, OptionalUser
from app.errors import not_found
from app.models import Favorite, Interaction, Place
from app.ratelimit import limit
from app.schemas import PlaceCard
from app.services.entitlements import can_see_premium, require_premium
from app.services.search import cards_for_places
from app.services.taste import SIGNAL_WEIGHTS, compute_taste

router = APIRouter(tags=["matching"])


class EventIn(BaseModel):
    type: Literal["view", "favorite", "share", "directions", "call", "itinerary_add", "dismiss"]
    place_id: str


@router.post("/events", status_code=204, dependencies=[Depends(limit("events", 240))])
def event(body: EventIn, db: DB, user: OptionalUser):
    try:
        pid = uuid.UUID(body.place_id)
    except ValueError as e:
        raise not_found("Lieu") from e
    if not db.get(Place, pid):
        raise not_found("Lieu")
    if user is not None:  # les visiteurs anonymes ne construisent pas de profil
        db.add(Interaction(user_id=user.id, place_id=pid, type=body.type, weight=SIGNAL_WEIGHTS[body.type]))
        db.commit()
    return Response(status_code=204)


@router.get("/recommendations/similar/{id_or_slug}", response_model=list[PlaceCard])
def similar(id_or_slug: str, db: DB, user: OptionalUser):
    try:
        base = db.get(Place, uuid.UUID(id_or_slug))
    except ValueError:
        base = db.scalar(select(Place).where(Place.slug == id_or_slug))
    if not base or base.status != "published":
        raise not_found("Lieu")
    if base.tier == "premium":
        require_premium(user)
    tiers = ("free", "premium") if can_see_premium(user) else ("free",)
    near = func.ST_DWithin(
        Place.location, select(Place.location).where(Place.id == base.id).scalar_subquery().cast(Geography), 40_000
    )
    conds = [Place.id != base.id, Place.status == "published", Place.tier.in_(tiers), near]
    scores: dict[uuid.UUID, float] = {}
    reasons: dict[uuid.UUID, list[str]] = {}
    if base.embedding is not None:
        d = Place.embedding.cosine_distance(base.embedding)
        for pid, dist in db.execute(
            select(Place.id, d).where(*conds, Place.embedding.is_not(None)).order_by(d).limit(20)
        ):
            scores[pid] = max(0.0, 1 - dist)
            reasons.setdefault(pid, []).append("Ambiance et style proches")
    for pid in db.scalars(select(Place.id).where(*conds, Place.category_slugs.op("&&")(base.category_slugs)).limit(20)):
        scores[pid] = scores.get(pid, 0) + 0.15
    f1, f2 = aliased(Favorite), aliased(Favorite)
    co = db.execute(
        select(f2.place_id, func.count())
        .join(f1, f1.user_id == f2.user_id)
        .where(f1.place_id == base.id, f2.place_id != base.id)
        .group_by(f2.place_id)
        .order_by(func.count().desc())
        .limit(20)
    ).all()
    allowed = set(db.scalars(select(Place.id).where(*conds, Place.id.in_([pid for pid, _ in co])))) if co else set()
    for pid, n in co:
        if pid in allowed:
            scores[pid] = scores.get(pid, 0) + min(0.5, 0.1 * n)
            reasons.setdefault(pid, []).insert(0, "Aimé par les mêmes personnes")
    top = sorted(scores, key=lambda k: -scores[k])[:10]
    places = {p.id: p for p in db.scalars(select(Place).where(Place.id.in_(top)))}
    cards = cards_for_places(db, [places[i] for i in top if i in places], user)
    return [c.model_copy(update={"reasons": reasons.get(uuid.UUID(c.id), [])[:2]}) for c in cards]


@router.get("/me/taste")
def taste(db: DB, user: CurrentUser):
    t = compute_taste(db, user)
    return {
        "top_categories": [{"slug": k, "weight": w} for k, w in t.top(t.categories)],
        "top_ambiances": [{"slug": k, "weight": w} for k, w in t.top(t.ambiances)],
        "budget_typical_fcfa": t.budget_typical,
        "signals": t.signals,
    }
