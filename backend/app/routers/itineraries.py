import math
import uuid

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.deps import DB, CurrentUser
from app.errors import ApiError, not_found, premium_required
from app.models import Itinerary, ItineraryStep, Place
from app.schemas import (
    ItineraryIn,
    ItineraryOut,
    ItineraryStepOut,
    ItinerarySummary,
    PlaceCard,
    SuggestIn,
    SuggestOut,
    SuggestStep,
)
from app.services.entitlements import can_see_premium, max_itinerary_steps
from app.services.search import SearchParams, cards_for_places, run_search, to_cards

router = APIRouter(tags=["itineraries"])


def haversine_km(a: PlaceCard, b: PlaceCard) -> float | None:
    if not a.location or not b.location:
        return None
    la1, lo1, la2, lo2 = map(math.radians, (a.location.lat, a.location.lng, b.location.lat, b.location.lng))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(h)), 1)


def plan_steps(cards: list[PlaceCard], n: int) -> list[PlaceCard]:
    """Glouton : meilleure étape d'abord, puis compromis score / proximité / variété de catégories."""
    if not cards:
        return []
    chosen = [cards[0]]
    pool = cards[1:]
    while len(chosen) < n and pool:
        prev = chosen[-1]

        def value(c: PlaceCard, prev: PlaceCard = prev) -> float:
            leg = haversine_km(prev, c) or 0
            same = bool(set(c.categories) & set(prev.categories))
            return (c.score or 0) - 6 * leg - (15 if same else 0)

        best = max(pool, key=value)
        chosen.append(best)
        pool.remove(best)
    return chosen


@router.post("/itineraries/suggest", response_model=SuggestOut)
def suggest(body: SuggestIn, db: DB, user: CurrentUser):
    if body.steps > max_itinerary_steps(db, user):
        raise premium_required(
            f"Ton offre permet {max_itinerary_steps(db, user)} étapes. Passe premium pour des soirées plus longues."
        )
    if (body.lat is None) != (body.lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    tiers = ("free", "premium") if can_see_premium(user) else ("free",)
    p = SearchParams(
        lat=body.lat,
        lng=body.lng,
        city=body.city,
        categories=body.categories,
        ambiances=body.ambiances,
        budget_max=body.budget_max_fcfa,
        tiers=tiers,
        page_size=30,
        max_distance_km=25 if body.lat is not None else None,
    )
    items, _, origin = run_search(db, p, user)
    cards = to_cards(db, items, user, origin, with_travel=False)
    steps = plan_steps(cards, body.steps)
    out = [SuggestStep(place=c, leg_km=None if i == 0 else haversine_km(steps[i - 1], c)) for i, c in enumerate(steps)]
    mins = [c.budget_min_fcfa for c in steps]
    maxs = [c.budget_max_fcfa for c in steps]
    notes = ["Distances à vol d'oiseau entre les étapes : le temps de trajet réel n'est pas estimé."]
    if len(steps) < body.steps:
        notes.append("Pas assez de lieux correspondants pour toutes les étapes demandées : élargis tes critères.")
    if None in mins or None in maxs:
        notes.append("Budget inconnu pour au moins une étape : le total est partiel.")
    unknown = [c.name for c in steps if c.open_status == "unknown"]
    if unknown:
        notes.append("Horaires non vérifiés pour : " + ", ".join(unknown) + ".")
    return SuggestOut(
        steps=out,
        total_budget_min_fcfa=sum(m for m in mins if m is not None) if steps and None not in mins else None,
        total_budget_max_fcfa=sum(m for m in maxs if m is not None) if steps and None not in maxs else None,
        notes=notes,
    )


def _get(db, user, iid: str) -> Itinerary:
    try:
        it = db.get(Itinerary, uuid.UUID(iid))
    except ValueError:
        it = None
    if not it or it.user_id != user.id:
        raise not_found("Itinéraire")
    return it


@router.get("/me/itineraries", response_model=list[ItinerarySummary])
def list_itineraries(db: DB, user: CurrentUser):
    its = db.scalars(
        select(Itinerary).where(Itinerary.user_id == user.id).order_by(Itinerary.created_at.desc()).limit(100)
    )
    return [ItinerarySummary(id=str(i.id), title=i.title, date=i.day, step_count=len(i.steps)) for i in its]


@router.post("/me/itineraries", response_model=ItineraryOut, status_code=201)
def create_itinerary(body: ItineraryIn, db: DB, user: CurrentUser):
    limit = max_itinerary_steps(db, user)
    if len(body.steps) > max(limit, 2):
        raise premium_required(f"Ton offre permet {limit} étapes par itinéraire.")
    ids = []
    for s in body.steps:
        try:
            ids.append(uuid.UUID(s.place_id))
        except ValueError as e:
            raise ApiError(400, "invalid_place", "Lieu invalide") from e
    places = {p.id: p for p in db.scalars(select(Place).where(Place.id.in_(ids)))}
    if len(places) != len(set(ids)):
        raise ApiError(400, "invalid_place", "Lieu introuvable dans l'itinéraire")
    if any(p.tier == "premium" for p in places.values()) and not can_see_premium(user):
        raise premium_required()
    it = Itinerary(user_id=user.id, title=body.title.strip(), day=body.date)
    it.steps = [
        ItineraryStep(position=i, place_id=uuid.UUID(s.place_id), start_time=s.start_time, note=s.note)
        for i, s in enumerate(body.steps)
    ]
    db.add(it)
    db.commit()
    return get_itinerary(str(it.id), db, user)


@router.get("/me/itineraries/{iid}", response_model=ItineraryOut)
def get_itinerary(iid: str, db: DB, user: CurrentUser):
    it = _get(db, user, iid)
    cards = cards_for_places(db, [s.place for s in it.steps], user)
    steps = [
        ItineraryStepOut(
            position=s.position,
            place=c,
            start_time=s.start_time.strftime("%H:%M") if s.start_time else None,
            note=s.note,
            leg_km=None if i == 0 else haversine_km(cards[i - 1], c),
        )
        for i, (s, c) in enumerate(zip(it.steps, cards, strict=True))
    ]
    return ItineraryOut(id=str(it.id), title=it.title, date=it.day, steps=steps)


@router.delete("/me/itineraries/{iid}", status_code=204)
def delete_itinerary(iid: str, db: DB, user: CurrentUser):
    db.delete(_get(db, user, iid))
    db.commit()
    return Response(status_code=204)
