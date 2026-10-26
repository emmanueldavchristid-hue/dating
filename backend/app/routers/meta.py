from fastapi import APIRouter
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select, text

from app.config import get_settings
from app.deps import DB
from app.models import Ambiance, Category, City, Place

router = APIRouter(tags=["meta"])


@router.get("/health")
def health(db: DB):
    db.execute(text("select 1"))
    return {"status": "ok", "db": "ok"}


@router.get("/meta/categories")
def categories(db: DB):
    return [{"slug": c.slug, "name": c.name, "icon": c.icon} for c in db.scalars(select(Category).order_by(Category.sort))]


@router.get("/meta/ambiances")
def ambiances(db: DB):
    return [{"slug": a.slug, "name": a.name} for a in db.scalars(select(Ambiance).order_by(Ambiance.id))]


@router.get("/meta/cities")
def cities(db: DB):
    out = []
    for c in db.scalars(select(City).order_by(City.id)):
        g = cast(City.center, Geometry)
        lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == c.id)).one()
        out.append({"slug": c.slug, "name": c.name, "center": {"lat": lat, "lng": lng},
                    "districts": [{"slug": d.slug, "name": d.name} for d in c.districts]})
    return out


@router.get("/meta/capabilities")
def capabilities(db: DB):
    s = get_settings()
    return {
        "map": s.map_provider,
        "routing": s.routing_provider if s.osrm_url else "none",
        "ai": "anthropic" if (s.llm_provider == "anthropic" and s.anthropic_api_key) else "rules",
        "payments": s.payments_provider,
        "demo_data": bool(db.scalar(select(func.count()).select_from(Place).where(Place.is_demo.is_(True)))),
    }
