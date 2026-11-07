from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select, text

from app.adapters.llm import llm_mode
from app.adapters.routing import get_routing
from app.config import get_settings
from app.deps import DB
from app.errors import ApiError
from app.models import Ambiance, Category, City, Place
from app.ratelimit import limit
from app.schemas import RouteOut
from app.services.vocab import GROUPS

router = APIRouter(tags=["meta"])


@router.get("/health")
def health(db: DB):
    db.execute(text("select 1"))
    return {"status": "ok", "db": "ok"}


def _counts(db, column) -> dict[str, int]:
    """Nombre de lieux publiés gratuits par valeur : l'app masque ce qui est vide."""
    tag = func.unnest(column).label("tag")
    sub = select(tag).where(Place.status == "published").subquery()
    return dict(db.execute(select(sub.c.tag, func.count()).group_by(sub.c.tag)).all())


@router.get("/routes", response_model=RouteOut, dependencies=[Depends(limit("search"))])
def route(
    from_lat: Annotated[float, Query(ge=-90, le=90)],
    from_lng: Annotated[float, Query(ge=-180, le=180)],
    to_lat: Annotated[float, Query(ge=-90, le=90)],
    to_lng: Annotated[float, Query(ge=-180, le=180)],
    mode: Literal["driving", "walking"] = "driving",
):
    """Trajet tracé dans l'app. Sans service d'itinéraire configuré : 503, l'app n'affiche alors aucune durée."""
    r = get_routing().route((from_lat, from_lng), (to_lat, to_lng), mode)
    if r is None:
        raise ApiError(503, "routing_unavailable", "Calcul d'itinéraire indisponible")
    return RouteOut(
        mode=r.mode,
        minutes=r.minutes,
        distance_km=r.distance_km,
        path=[{"lat": a, "lng": b} for a, b in r.path],
        source=r.source,
    )


@router.get("/meta/categories")
def categories(db: DB):
    counts = _counts(db, Place.category_slugs)
    return [
        {"slug": c.slug, "name": c.name, "icon": c.icon, "group": c.group_slug, "count": counts.get(c.slug, 0)}
        for c in db.scalars(select(Category).order_by(Category.sort))
    ]


@router.get("/meta/groups")
def groups(db: DB):
    """Envies (Manger, Boire un verre, Danser…) et leurs catégories non vides."""
    counts = _counts(db, Place.category_slugs)
    cats = list(db.scalars(select(Category).order_by(Category.sort)))
    out = []
    for slug, name, icon in GROUPS:
        members = [c.slug for c in cats if c.group_slug == slug and counts.get(c.slug, 0) > 0]
        if members:
            out.append({"slug": slug, "name": name, "icon": icon, "categories": members})
    return out


@router.get("/meta/ambiances")
def ambiances(db: DB):
    counts = _counts(db, Place.ambiance_slugs)
    return [
        {"slug": a.slug, "name": a.name, "count": counts.get(a.slug, 0)}
        for a in db.scalars(select(Ambiance).order_by(Ambiance.id))
    ]


@router.get("/meta/cities")
def cities(db: DB):
    out = []
    for c in db.scalars(select(City).order_by(City.id)):
        g = cast(City.center, Geometry)
        lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == c.id)).one()
        out.append(
            {
                "slug": c.slug,
                "name": c.name,
                "center": {"lat": lat, "lng": lng},
                "districts": [{"slug": d.slug, "name": d.name} for d in c.districts],
            }
        )
    return out


@router.get("/meta/capabilities")
def capabilities(db: DB):
    s = get_settings()
    return {
        "map": s.map_provider,
        "routing": s.routing_provider if s.osrm_url else "none",
        "ai": llm_mode(),
        "payments": s.payments_provider,
        "demo_data": bool(db.scalar(select(func.count()).select_from(Place).where(Place.is_demo.is_(True)))),
        "coverage": coverage(db),
    }


def coverage(db) -> dict[str, int]:
    """Combien de lieux publiés renseignent chaque filtre : l'app masque les filtres sans données."""
    from app.models import OpeningHours

    pub = Place.status == "published"
    count = lambda *conds: db.scalar(select(func.count()).select_from(Place).where(pub, *conds)) or 0  # noqa: E731
    return {
        "budget": count(Place.budget_min_fcfa.is_not(None)),
        "rating": count(Place.rating_count > 0),
        "parking": count(Place.has_parking.is_(True)),
        "wheelchair": count(Place.wheelchair.is_(True)),
        "hours": db.scalar(select(func.count(func.distinct(OpeningHours.place_id))).join(Place).where(pub)) or 0,
    }
