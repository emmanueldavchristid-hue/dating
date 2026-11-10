"""Agenda public (« Ce week-end ») et gestion des événements par l'équipe."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.deps import DB, OptionalUser, StaffUser
from app.errors import ApiError, not_found
from app.models import City, Event, Place, User
from app.ratelimit import limit
from app.schemas import AdminEventIn, AdminEventPatch, Agenda, EventCard
from app.services.agenda import KINDS, window
from app.services.audit import audit
from app.services.entitlements import can_see_premium
from app.services.hours import local_now
from app.services.search import Origin, cards_for_places

router = APIRouter(tags=["agenda"])


def build_agenda(
    db: Session, user: User | None, city: str | None = None, lat: float | None = None, lng: float | None = None
) -> Agenda:
    s = get_settings()
    now = local_now(s.timezone)
    start, end, title = window(now)
    tiers = ("free", "premium") if can_see_premium(user) else ("free",)
    stmt = (
        select(Event)
        .join(Place)
        .where(
            Place.status == "published",
            Place.tier.in_(tiers),
            or_(Event.starts_at >= start, Event.ends_at >= now),
            Event.starts_at <= end,
        )
        .options(selectinload(Event.place))
        .order_by(Event.starts_at)
        .limit(30)
    )
    if lat is None:
        stmt = stmt.join(City, City.id == Place.city_id).where(City.slug == (city or s.default_city))
    events = list(db.scalars(stmt))
    origin = Origin(lat, lng, "gps") if lat is not None and lng is not None else None
    cards = {c.id: c for c in cards_for_places(db, list({e.place_id: e.place for e in events}.values()), user, origin)}
    return Agenda(title=title, items=[_card(e, cards[str(e.place_id)]) for e in events if str(e.place_id) in cards])


def _card(e: Event, place) -> EventCard:
    return EventCard(
        id=str(e.id),
        title=e.title,
        kind=e.kind,
        kind_label=KINDS.get(e.kind, "Sortie"),
        starts_at=e.starts_at,
        ends_at=e.ends_at,
        price_fcfa=e.price_fcfa,
        description=e.description,
        link=e.link,
        place=place,
    )


@router.get("/events", response_model=Agenda, dependencies=[Depends(limit("search"))])
def agenda(
    db: DB,
    user: OptionalUser,
    city: str | None = None,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
):
    """Sorties à venir (soirées, concerts, brunchs…) : ce week-end du jeudi au dimanche, sinon les 7 prochains jours."""
    return build_agenda(db, user, city, lat, lng)


# ---------- Équipe ----------


def _admin_row(db, e: Event) -> dict:
    return {
        "id": str(e.id),
        "place_id": str(e.place_id),
        "place_name": e.place.name,
        "title": e.title,
        "kind": e.kind,
        "starts_at": e.starts_at,
        "ends_at": e.ends_at,
        "price_fcfa": e.price_fcfa,
        "description": e.description,
        "link": e.link,
    }


@router.get("/admin/events")
def admin_events(db: DB, _: StaffUser, past: bool = False):
    now = datetime.now(UTC)
    cond = Event.starts_at < now if past else or_(Event.starts_at >= now, Event.ends_at >= now)
    rows = db.scalars(
        select(Event)
        .where(cond)
        .options(selectinload(Event.place))
        .order_by(Event.starts_at.desc() if past else Event.starts_at)
        .limit(200)
    )
    return {"items": [_admin_row(db, e) for e in rows]}


def _check_dates(starts_at, ends_at):
    if ends_at and starts_at and ends_at <= starts_at:
        raise ApiError(422, "validation_error", "La fin doit être après le début")


@router.post("/admin/events", status_code=201)
def admin_create_event(body: AdminEventIn, db: DB, staff: StaffUser):
    try:
        place = db.get(Place, uuid.UUID(body.place_id))
    except ValueError:
        place = None
    if not place:
        raise not_found("Lieu")
    _check_dates(body.starts_at, body.ends_at)
    e = Event(place_id=place.id, **body.model_dump(exclude={"place_id"}))
    db.add(e)
    db.flush()
    audit(db, staff, "event.created", "event", str(e.id), title=e.title, place=place.name)
    db.commit()
    db.refresh(e)
    return _admin_row(db, e)


def _get_event(db, eid: str) -> Event:
    try:
        e = db.get(Event, uuid.UUID(eid))
    except ValueError:
        e = None
    if not e:
        raise not_found("Événement")
    return e


@router.patch("/admin/events/{eid}")
def admin_update_event(eid: str, body: AdminEventPatch, db: DB, staff: StaffUser):
    e = _get_event(db, eid)
    data = body.model_dump(exclude_unset=True)
    _check_dates(data.get("starts_at", e.starts_at), data.get("ends_at", e.ends_at))
    for k, v in data.items():
        setattr(e, k, v)
    audit(db, staff, "event.updated", "event", eid, fields=sorted(data))
    db.commit()
    return _admin_row(db, e)


@router.delete("/admin/events/{eid}", status_code=204)
def admin_delete_event(eid: str, db: DB, staff: StaffUser):
    e = _get_event(db, eid)
    audit(db, staff, "event.deleted", "event", eid, title=e.title)
    db.delete(e)
    db.commit()
    return Response(status_code=204)
