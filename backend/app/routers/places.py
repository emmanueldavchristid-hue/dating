import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.storage import public_url
from app.deps import DB, CurrentUser, OptionalUser
from app.errors import ApiError, not_found
from app.models import Event, Favorite, Place, Report, Review, SearchHistory, User
from app.ratelimit import limit
from app.schemas import (
    Amenities,
    EventOut,
    HomeOut,
    HomeSection,
    HoursOut,
    PhotoOut,
    PlaceCard,
    PlaceDetail,
    ReportIn,
    ReviewIn,
    ReviewOut,
    SearchResult,
    SourceOut,
)
from app.services.entitlements import can_see_premium, require_premium
from app.services.places import refresh_rating
from app.services.search import Origin, SearchParams, cards_for_places, run_search, to_cards

router = APIRouter(tags=["places"])


def _csv(v: str | None) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()][:20] if v else []


def _prefs(user: User | None) -> dict | None:
    if user and user.preferences:
        p = user.preferences
        return {"categories": p.categories, "ambiances": p.ambiances, "budget_max_fcfa": p.budget_max_fcfa}
    return None


def _tiers(user: User | None) -> tuple[str, ...]:
    return ("free", "premium") if can_see_premium(user) else ("free",)


@router.get("/places/search", response_model=SearchResult, dependencies=[Depends(limit("search"))])
def search(
    db: DB,
    user: OptionalUser,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    city: Annotated[str | None, Query(max_length=64)] = None,
    district: Annotated[str | None, Query(max_length=64)] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    categories: str | None = None,
    ambiances: str | None = None,
    budget_max: Annotated[int | None, Query(ge=0, le=10_000_000)] = None,
    open_now: bool = False,
    max_distance_km: Annotated[float | None, Query(gt=0, le=500)] = None,
    parking: bool = False,
    wheelchair: bool = False,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    sort: Literal["relevance", "distance", "popularity", "newest"] = "relevance",
    page: Annotated[int, Query(ge=1, le=500)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 20,
):
    if (lat is None) != (lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    p = SearchParams(
        lat=lat,
        lng=lng,
        city=city,
        district=district,
        q=q,
        categories=_csv(categories),
        ambiances=_csv(ambiances),
        budget_max=budget_max,
        open_now=open_now,
        max_distance_km=max_distance_km,
        parking=parking,
        wheelchair=wheelchair,
        min_rating=min_rating,
        sort=sort,
        page=page,
        page_size=page_size,
        tiers=_tiers(user),
    )
    items, total, origin = run_search(db, p, user, _prefs(user))
    _record_search(db, user, p, origin, total)
    return SearchResult(
        items=to_cards(db, items, user, origin),
        total=total,
        page=page,
        page_size=page_size,
        origin={"lat": origin.lat, "lng": origin.lng, "source": origin.source},
    )


def _record_search(db: Session, user: User | None, p: SearchParams, origin: Origin, total: int) -> None:
    """Historique minimal : position arrondie (~1 km), purgé automatiquement (voir app/tasks.py)."""
    filters = {
        k: v
        for k, v in {
            "categories": p.categories,
            "ambiances": p.ambiances,
            "budget_max": p.budget_max,
            "open_now": p.open_now,
            "city": p.city,
            "sort": p.sort,
        }.items()
        if v
    }
    db.add(
        SearchHistory(
            user_id=user.id if user else None,
            query=(p.q or None),
            filters=filters,
            approx_lat=round(origin.lat, 2),
            approx_lng=round(origin.lng, 2),
            result_count=total,
        )
    )
    db.commit()


@router.get("/places/gems", response_model=list[PlaceCard])
def gems(db: DB, user: OptionalUser, city: str | None = None):
    p = SearchParams(city=city, tiers=("premium",), page_size=30)
    items, _, origin = run_search(db, p, user, _prefs(user))
    return to_cards(db, items, user, origin, with_travel=False)


@router.get("/recommendations/home", response_model=HomeOut, dependencies=[Depends(limit("search"))])
def home(db: DB, user: OptionalUser, lat: float | None = None, lng: float | None = None, city: str | None = None):
    prefs, tiers, seen = _prefs(user), _tiers(user), []
    base = {"lat": lat, "lng": lng, "city": city, "tiers": tiers, "page_size": 10}
    specs = [
        ("for_you", "Pour toi", "Sélection selon tes envies et ta position", {}),
        ("open_now", "Ouvert maintenant", "Horaires renseignés et vérifiables", {"open_now": True}),
        ("outdoor", "Prendre l'air", "Plages, nature et plein air", {"categories": ["plage", "nature"]}),
        ("night", "Pour ce soir", "Lounges, rooftops et bars", {"categories": ["lounge", "rooftop", "bar"]}),
        ("popular", "Les plus appréciés", "Classés par nombre d'avis et de visites", {"sort": "popularity"}),
    ]
    sections = []
    for key, title, subtitle, extra in specs:
        params = SearchParams(**base, **extra, exclude_ids=list(seen) if key != "popular" else [])
        items, _, origin = run_search(db, params, user, prefs)
        if not items:
            continue
        seen.extend(i["place"].id for i in items[:4])
        sections.append(HomeSection(key=key, title=title, subtitle=subtitle, items=to_cards(db, items, user, origin)))
    return HomeOut(sections=sections)


def _get_place(db: Session, id_or_slug: str) -> Place:
    try:
        place = db.get(Place, uuid.UUID(id_or_slug))
    except ValueError:
        place = db.scalar(select(Place).where(Place.slug == id_or_slug))
    if not place or place.status == "draft":
        raise not_found("Lieu")
    return place


@router.get("/places/{id_or_slug}", response_model=PlaceDetail)
def detail(
    id_or_slug: str,
    db: DB,
    user: OptionalUser,
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
):
    place = _get_place(db, id_or_slug)
    if place.tier == "premium":
        require_premium(user)
    origin = Origin(lat, lng, "gps") if lat is not None and lng is not None else None
    card = cards_for_places(db, [place], user, origin)[0]
    if origin is not None:  # temps de trajet seulement si un fournisseur est configuré
        card = to_cards(
            db,
            [{"place": place, "dist_m": card.distance_km * 1000 if card.distance_km is not None else None}],
            user,
            origin,
        )[0]
    reviews = list(
        db.scalars(
            select(Review)
            .where(Review.place_id == place.id, Review.status == "published")
            .order_by(Review.created_at.desc())
            .limit(20)
        )
    )
    events = list(db.scalars(select(Event).where(Event.place_id == place.id).order_by(Event.starts_at).limit(10)))
    is_fav = bool(user and db.get(Favorite, (user.id, place.id)))
    place.popularity += 1
    db.commit()
    src = place.source
    return PlaceDetail(
        **card.model_dump(),
        description=place.description,
        address=place.address,
        phone=place.phone,
        website=place.website,
        hours=[
            HoursOut(weekday=h.weekday, open=h.opens.strftime("%H:%M"), close=h.closes.strftime("%H:%M"))
            for h in place.hours
        ],
        amenities=Amenities(
            parking=place.has_parking,
            wheelchair=place.wheelchair,
            wifi=place.wifi,
            card_payment=place.card_payment,
            mobile_money=place.mobile_money,
            outdoor=place.outdoor,
        ),
        photos=[
            PhotoOut(
                url=public_url(m.storage_key), gradient=m.gradient or place.cover_gradient, alt=m.alt, credit=m.credit
            )
            for m in place.media
            if m.moderation_status == "approved"
        ],
        reviews_summary=place.reviews_summary,
        reviews=[
            ReviewOut(
                id=str(r.id),
                author=(r.user.display_name if r.user else "Ancien membre"),
                rating=r.rating,
                text=r.text,
                created_at=r.created_at,
            )
            for r in reviews
        ],
        source=SourceOut(kind=src.kind if src else "curated", attribution=src.attribution if src else None),
        events=[EventOut(id=str(e.id), title=e.title, starts_at=e.starts_at, price_fcfa=e.price_fcfa) for e in events],
        is_favorite=is_fav,
    )


@router.post("/places/{place_id}/reports", status_code=201, dependencies=[Depends(limit("write", 20))])
def report(place_id: str, body: ReportIn, db: DB, user: CurrentUser):
    place = _get_place(db, place_id)
    r = Report(place_id=place.id, user_id=user.id, kind=body.kind, message=body.message.strip())
    db.add(r)
    db.commit()
    return {"id": str(r.id), "status": r.status}


@router.post("/places/{place_id}/reviews", status_code=201, dependencies=[Depends(limit("write", 20))])
def review(place_id: str, body: ReviewIn, db: DB, user: CurrentUser):
    place = _get_place(db, place_id)
    if place.tier == "premium":
        require_premium(user)
    existing = db.scalar(select(Review).where(Review.place_id == place.id, Review.user_id == user.id))
    if existing:
        existing.rating, existing.text = body.rating, body.text.strip()
    else:
        db.add(Review(place_id=place.id, user_id=user.id, rating=body.rating, text=body.text.strip()))
    db.flush()
    refresh_rating(db, place)
    db.commit()
    return {"rating_avg": place.rating_avg, "rating_count": place.rating_count}
