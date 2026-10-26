"""Recherche géospatiale + classement déterministe et explicable.

Le score (0–100) est calculé en SQL pour paginer sur de gros volumes :
  30 % accessibilité (distance à vol d'oiseau, faute d'itinéraire réel au moment du tri)
  25 % qualité (note bayésienne : peu d'avis ⇒ tirée vers la moyenne a priori)
  15 % adéquation aux préférences (catégories, ambiances)
  10 % fraîcheur de la vérification
  10 % adéquation au budget
  10 % popularité
"""
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from geoalchemy2 import Geography, Geometry
from sqlalchemy import and_, case, cast, exists, func, literal, or_, select
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Session
from sqlalchemy.types import String

from app.adapters.routing import get_routing
from app.adapters.storage import public_url
from app.config import get_settings
from app.errors import ApiError
from app.models import City, District, OpeningHours, Place, User
from app.schemas import Cover, LatLng, PlaceCard, TravelOut
from app.services.entitlements import can_see_premium
from app.services.hours import Slot, local_now, open_status

PRIOR_MEAN, PRIOR_WEIGHT = 3.8, 10
WEIGHTS = {"prox": 0.30, "quality": 0.25, "pref": 0.15, "fresh": 0.10, "budget": 0.10, "pop": 0.10}


@dataclass
class SearchParams:
    lat: float | None = None
    lng: float | None = None
    city: str | None = None
    district: str | None = None
    q: str | None = None
    categories: list[str] = field(default_factory=list)
    ambiances: list[str] = field(default_factory=list)
    budget_max: int | None = None
    open_now: bool = False
    max_distance_km: float | None = None
    parking: bool = False
    wheelchair: bool = False
    min_rating: float | None = None
    sort: str = "relevance"
    page: int = 1
    page_size: int = 20
    tiers: tuple[str, ...] = ("free",)
    exclude_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass
class Origin:
    lat: float
    lng: float
    source: str  # gps | city


def resolve_origin(db: Session, p: SearchParams) -> tuple[Origin, City | None, District | None]:
    city = district = None
    if p.city:
        city = db.scalar(select(City).where(City.slug == p.city))
        if not city:
            raise ApiError(400, "unknown_city", f"Ville inconnue : {p.city}")
        if p.district:
            district = db.scalar(select(District).where(District.city_id == city.id, District.slug == p.district))
    if p.lat is not None and p.lng is not None:
        return Origin(p.lat, p.lng, "gps"), city, district
    if not city:
        city = db.scalar(select(City).where(City.slug == get_settings().default_city))
        if not city:
            raise ApiError(503, "no_city", "Aucune ville configurée")
    if district is not None and district.center is not None:
        g = cast(District.center, Geometry)
        lng, lat = db.execute(select(func.ST_X(g), func.ST_Y(g)).where(District.id == district.id)).one()
    else:
        g = cast(City.center, Geometry)
        lng, lat = db.execute(select(func.ST_X(g), func.ST_Y(g)).where(City.id == city.id)).one()
    return Origin(lat, lng, "city"), city, district


def _open_now_clause(now: datetime):
    """EXISTS sur opening_hours, gère les créneaux qui passent minuit."""
    today, yesterday, t = now.weekday(), (now.weekday() - 1) % 7, now.time().replace(microsecond=0)
    oh = OpeningHours
    return exists().where(
        oh.place_id == Place.id,
        or_(
            and_(oh.weekday == today, oh.closes > oh.opens, oh.opens <= t, oh.closes > t),
            and_(oh.weekday == today, oh.closes <= oh.opens, oh.opens <= t),
            and_(oh.weekday == yesterday, oh.closes <= oh.opens, oh.closes > t),
        ),
    )


def run_search(db: Session, p: SearchParams, user: User | None, prefs: dict | None = None) -> tuple[list[dict], int, Origin]:
    origin, city, district = resolve_origin(db, p)
    now = local_now(get_settings().timezone)
    point = func.ST_SetSRID(func.ST_MakePoint(origin.lng, origin.lat), 4326).cast(Geography)
    dist_m = func.ST_Distance(Place.location, point)

    pref_cats = list(dict.fromkeys([*(p.categories or []), *((prefs or {}).get("categories") or [])]))
    pref_ambs = list(dict.fromkeys([*(p.ambiances or []), *((prefs or {}).get("ambiances") or [])]))
    pref_budget = p.budget_max or (prefs or {}).get("budget_max_fcfa")

    prox = 1.0 / (1.0 + dist_m / 3000.0)
    bayes = (PRIOR_WEIGHT * PRIOR_MEAN + func.coalesce(Place.rating_avg, 0) * Place.rating_count) / (PRIOR_WEIGHT + Place.rating_count)
    quality = bayes / 5.0
    arr = lambda xs: cast(literal(xs or ["__none__"]), ARRAY(String))  # noqa: E731
    pref = (
        case((Place.category_slugs.op("&&")(arr(pref_cats)), 0.6), else_=0.0)
        + case((Place.ambiance_slugs.op("&&")(arr(pref_ambs)), 0.4), else_=0.0)
    ) if (pref_cats or pref_ambs) else literal(0.5)
    age_days = func.extract("epoch", func.now() - Place.verified_at) / 86400.0
    fresh = func.coalesce(func.greatest(0.0, 1.0 - age_days / 365.0), 0.3)
    budget_fit = (
        case((Place.budget_min_fcfa.is_(None), 0.5), (Place.budget_min_fcfa <= pref_budget, 1.0), else_=0.0)
        if pref_budget else literal(0.5)
    )
    pop = func.least(1.0, func.ln(1 + Place.popularity + Place.rating_count) / math.log(500))
    score = 100 * (
        WEIGHTS["prox"] * prox + WEIGHTS["quality"] * quality + WEIGHTS["pref"] * pref
        + WEIGHTS["fresh"] * fresh + WEIGHTS["budget"] * budget_fit + WEIGHTS["pop"] * pop
    )

    conds = [Place.status == "published", Place.tier.in_(p.tiers)]
    if p.exclude_ids:
        conds.append(Place.id.not_in(p.exclude_ids))
    if city is not None and origin.source == "city":
        conds.append(Place.city_id == city.id)
    if district is not None:
        conds.append(Place.district_id == district.id)
    if p.max_distance_km:
        conds.append(func.ST_DWithin(Place.location, point, p.max_distance_km * 1000))
    elif origin.source == "gps" and city is None:
        conds.append(func.ST_DWithin(Place.location, point, 60_000))  # rayon par défaut autour de soi
    if p.categories:
        conds.append(Place.category_slugs.op("&&")(arr(p.categories)))
    if p.ambiances:
        conds.append(Place.ambiance_slugs.op("&&")(arr(p.ambiances)))
    if p.budget_max is not None:
        conds.append(Place.budget_min_fcfa <= p.budget_max)  # budget inconnu exclu : on ne suppose rien
    if p.open_now:
        conds.append(_open_now_clause(now))
    if p.parking:
        conds.append(Place.has_parking.is_(True))
    if p.wheelchair:
        conds.append(Place.wheelchair.is_(True))
    if p.min_rating:
        conds.append(Place.rating_avg >= p.min_rating)
    text_rank = None
    if p.q and p.q.strip():
        q = p.q.strip()[:120]
        tsq = func.websearch_to_tsquery("simple", func.f_unaccent(q))
        conds.append(or_(Place.search_vector.op("@@")(tsq), func.similarity(Place.name, q) > 0.3))
        text_rank = func.ts_rank(Place.search_vector, tsq) + func.similarity(Place.name, q)

    order = {
        "distance": [dist_m.asc()],
        "popularity": [(Place.popularity + Place.rating_count).desc(), score.desc()],
        "newest": [Place.created_at.desc()],
    }.get(p.sort, [(score + (text_rank * 40 if text_rank is not None else 0)).desc()])

    stmt = (
        select(Place, dist_m.label("dist_m"), score.label("score"), prox.label("c_prox"), quality.label("c_quality"),
               pref.label("c_pref"), fresh.label("c_fresh"), budget_fit.label("c_budget"), func.count().over().label("total"))
        .where(*conds)
        .order_by(*order, Place.id)
        .offset((p.page - 1) * p.page_size)
        .limit(p.page_size)
    )
    rows = db.execute(stmt).all()
    total = rows[0].total if rows else 0
    if not rows and p.page > 1:
        total = db.scalar(select(func.count()).select_from(Place).where(*conds)) or 0
    results = [
        {"place": r.Place, "dist_m": r.dist_m, "score": r.score,
         "components": {"prox": r.c_prox, "quality": r.c_quality, "pref": r.c_pref, "fresh": r.c_fresh, "budget": r.c_budget},
         "prefs_used": bool(pref_cats or pref_ambs), "budget_used": bool(pref_budget)}
        for r in rows
    ]
    return results, total, origin


def explain(item: dict, origin: Origin, open_st: str) -> list[str]:
    """Raisons lisibles, uniquement à partir de faits connus."""
    c, place, reasons = item["components"], item["place"], []
    if item["prefs_used"] and c["pref"] >= 0.6:
        reasons.append("Correspond à tes envies")
    if item["dist_m"] is not None and item["dist_m"] < 3000:
        reasons.append("Tout près de toi" if origin.source == "gps" else "Proche du centre de la zone choisie")
    if place.rating_count >= 20 and (place.rating_avg or 0) >= 4.3:
        reasons.append(f"Très bien noté ({place.rating_count} avis)")
    if open_st == "open":
        reasons.append("Ouvert maintenant")
    if item["budget_used"] and c["budget"] == 1:
        reasons.append("Dans ton budget")
    if place.verified_at and c["fresh"] > 0.75:
        reasons.append("Infos vérifiées récemment")
    return reasons[:3]


def load_slots(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, list[Slot]]:
    out: dict[uuid.UUID, list[Slot]] = {i: [] for i in ids}
    if ids:
        for h in db.scalars(select(OpeningHours).where(OpeningHours.place_id.in_(ids))):
            out[h.place_id].append(Slot(h.weekday, h.opens, h.closes))
    return out


def place_location(db: Session, places: list[Place]) -> dict[uuid.UUID, tuple[float, float]]:
    if not places:
        return {}
    geom = cast(Place.location, Geometry)
    rows = db.execute(select(Place.id, func.ST_Y(geom), func.ST_X(geom)).where(Place.id.in_([p.id for p in places])))
    return {r[0]: (r[1], r[2]) for r in rows}


def to_cards(db: Session, items: list[dict], user: User | None, origin: Origin | None, with_travel: bool = True) -> list[PlaceCard]:
    places = [i["place"] for i in items]
    slots = load_slots(db, [p.id for p in places])
    locs = place_location(db, places)
    now = local_now(get_settings().timezone)
    entitled = can_see_premium(user)
    travel: list = [None] * len(places)
    if with_travel and origin is not None:
        unlocked = [locs[p.id] for p in places]
        travel = get_routing().durations((origin.lat, origin.lng), unlocked)
    cards = []
    for item, place, tr in zip(items, places, travel, strict=True):
        st, closes = open_status(slots[place.id], now)
        locked = place.tier == "premium" and not entitled
        lat, lng = locs[place.id]
        card = PlaceCard(
            id=str(place.id), slug=place.slug, name=place.name, short_description=place.short_description,
            city=place.city.name, district=place.district.name if place.district else None,
            categories=place.category_slugs or [], ambiances=place.ambiance_slugs or [],
            price_level=place.price_level, budget_min_fcfa=place.budget_min_fcfa, budget_max_fcfa=place.budget_max_fcfa,
            rating_avg=round(place.rating_avg, 1) if place.rating_avg is not None else None, rating_count=place.rating_count,
            cover=Cover(url=public_url(place.cover_key), gradient=place.cover_gradient or ["#1E3A4C", "#0E0F13"], alt=f"Ambiance de {place.name}"),
            location=LatLng(lat=lat, lng=lng),
            distance_km=round(item["dist_m"] / 1000, 1) if item.get("dist_m") is not None else None,
            travel=TravelOut(mode=tr.mode, minutes=tr.minutes, source=tr.source) if tr else None,
            open_status=st, closes_at=closes, tier=place.tier, locked=False, is_demo=place.is_demo,
            verified_at=place.verified_at, confidence=place.confidence,
            score=round(item["score"], 1) if item.get("score") is not None else None,
            reasons=explain(item, origin, st) if origin is not None and item.get("components") else [],
        )
        cards.append(lock_card(card) if locked else card)
    return cards


def lock_card(card: PlaceCard) -> PlaceCard:
    """Version réduite d'une pépite pour un plan qui n'y a pas droit : ni nom, ni position exacte."""
    return card.model_copy(update={
        "name": "Pépite Insider", "short_description": "Un lieu rare sélectionné par nos curateurs. Réservé aux membres Insider.",
        "location": None, "travel": None, "distance_km": None, "locked": True, "reasons": [],
        "cover": Cover(url=None, gradient=["#2B2416", "#0E0F13"], alt="Pépite verrouillée"),
    })


def cards_for_places(db: Session, places: list[Place], user: User | None, origin: Origin | None = None) -> list[PlaceCard]:
    dists: dict[uuid.UUID, float] = {}
    if origin is not None and places:
        point = func.ST_SetSRID(func.ST_MakePoint(origin.lng, origin.lat), 4326).cast(Geography)
        dists = dict(db.execute(select(Place.id, func.ST_Distance(Place.location, point)).where(Place.id.in_([p.id for p in places]))).all())
    return to_cards(db, [{"place": p, "dist_m": dists.get(p.id)} for p in places], user, origin, with_travel=False)
