import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, File, Form, Query, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from app.adapters import storage
from app.deps import DB, AdminUser, StaffUser
from app.errors import ApiError, not_found
from app.models import AuditLog, City, CurationItem, District, Media, Place, Report, User
from app.schemas import AdminPlaceIn, AdminPlacePatch, AdminUserPatch, CurationDecision, StatusPatch
from app.services.audit import audit
from app.services.photos import SOURCE_LABELS, credit_for, mark_reviewed, refresh_cover
from app.services.places import set_taxonomy, slugify
from app.services.rag import index_places
from app.services.search import cards_for_places
from app.services.users import user_out

router = APIRouter(prefix="/admin", tags=["admin"])
PAGE = 25


def _page(stmt, db, page: int, fmt):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.scalars(stmt.offset((page - 1) * PAGE).limit(PAGE)).all()
    return {"items": [fmt(r) for r in rows], "total": total, "page": page, "page_size": PAGE}


def _id(v: str) -> uuid.UUID:
    try:
        return uuid.UUID(v)
    except ValueError as e:
        raise not_found() from e


@router.get("/stats")
def stats(db: DB, _: StaffUser):
    count = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w))  # noqa: E731
    return {
        "places": count(Place),
        "places_published": count(Place, Place.status == "published"),
        "gems": count(Place, Place.tier == "premium"),
        "demo_places": count(Place, Place.is_demo.is_(True)),
        "users": count(User),
        "premium_users": count(User, User.plan_code != "free"),
        "open_reports": count(Report, Report.status == "open"),
        "pending_curation": count(CurationItem, CurationItem.status == "pending"),
    }


def _place_row(db):
    def fmt(p: Place):
        return {
            "id": str(p.id),
            "slug": p.slug,
            "name": p.name,
            "city": p.city.name,
            "district": p.district.name if p.district else None,
            "categories": p.category_slugs,
            "ambiances": p.ambiance_slugs,
            "tier": p.tier,
            "status": p.status,
            "is_demo": p.is_demo,
            "rating_avg": p.rating_avg,
            "rating_count": p.rating_count,
            "budget_min_fcfa": p.budget_min_fcfa,
            "budget_max_fcfa": p.budget_max_fcfa,
            "price_level": p.price_level,
            "short_description": p.short_description,
            "verified_at": p.verified_at,
            "confidence": p.confidence,
        }

    return fmt


@router.get("/places")
def places(db: DB, _: AdminUser, q: str | None = Query(None, max_length=120), page: int = Query(1, ge=1)):
    stmt = select(Place).order_by(Place.updated_at.desc())
    if q:
        stmt = stmt.where(or_(Place.name.ilike(f"%{q}%"), Place.slug.ilike(f"%{q}%")))
    return _page(stmt, db, page, _place_row(db))


@router.post("/places", status_code=201)
def create_place(body: AdminPlaceIn, db: DB, admin: AdminUser):
    city = db.scalar(select(City).where(City.slug == body.city))
    if not city:
        raise ApiError(400, "unknown_city", "Ville inconnue")
    district = (
        db.scalar(select(District).where(District.city_id == city.id, District.slug == body.district))
        if body.district
        else None
    )
    if district is None:
        from app.importers.osm import _nearest_district

        district = _nearest_district(db, city, body.lat, body.lng)  # quartier déduit de la position
    slug = body.slug or slugify(body.name)
    if db.scalar(select(Place).where(Place.slug == slug)) and not body.slug:
        slug = f"{slug}-{(district.slug if district else city.slug)}"[:160]  # « le-baobab-marcory »
    if db.scalar(select(Place).where(Place.slug == slug)):
        raise ApiError(409, "conflict", "Ce slug existe déjà")
    if (
        body.budget_min_fcfa is not None
        and body.budget_max_fcfa is not None
        and body.budget_min_fcfa > body.budget_max_fcfa
    ):
        raise ApiError(400, "invalid_budget", "Budget minimum supérieur au maximum")
    place = Place(
        slug=slug,
        name=body.name,
        short_description=body.short_description,
        description=body.description,
        city_id=city.id,
        district_id=district.id if district else None,
        location=f"SRID=4326;POINT({body.lng} {body.lat})",
        price_level=body.price_level,
        budget_min_fcfa=body.budget_min_fcfa,
        budget_max_fcfa=body.budget_max_fcfa,
        tier=body.tier,
        status=body.status,
        address=body.address,
        phone=body.phone,
        website=body.website,
        is_demo=False,
        confidence=0.6,
        verified_at=datetime.now(UTC),
    )
    set_taxonomy(db, place, body.categories, body.ambiances)
    db.add(place)
    db.flush()
    audit(db, admin, "place.created", "place", str(place.id), name=place.name)
    db.commit()
    index_places(db, [place.id])
    _link_google(db, place, body.lat, body.lng, city.name)
    return _place_row(db)(place)


def _link_google(db, place: Place, lat: float, lng: float, city_name: str) -> None:
    """Nouveau lieu : relié tout de suite à sa fiche Google (photos), si une clé Google est configurée."""
    from app.adapters.google_places import get_google
    from app.models import PlaceExternalId

    google = get_google()
    if google is None or place.tier == "premium":
        return
    gid = google.find_place_id(place.name, lat, lng, city_name)
    if gid and not db.scalar(
        select(PlaceExternalId.id).where(PlaceExternalId.provider == "google", PlaceExternalId.external_id == gid)
    ):
        db.add(PlaceExternalId(place_id=place.id, provider="google", external_id=gid))
        db.commit()


@router.patch("/places/{pid}")
def update_place(pid: str, body: AdminPlacePatch, db: DB, admin: AdminUser):
    place = db.get(Place, _id(pid))
    if not place:
        raise not_found("Lieu")
    data = body.model_dump(exclude_unset=True)
    set_taxonomy(db, place, data.pop("categories", None), data.pop("ambiances", None))
    lat, lng = data.pop("lat", None), data.pop("lng", None)
    if (lat is None) != (lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    if lat is not None:
        place.location = f"SRID=4326;POINT({lng} {lat})"
    if data.pop("mark_verified", False):
        place.verified_at, place.confidence = datetime.now(UTC), max(place.confidence, 0.8)
    for k, v in data.items():
        setattr(place, k, v)
    if (
        place.budget_min_fcfa is not None
        and place.budget_max_fcfa is not None
        and place.budget_min_fcfa > place.budget_max_fcfa
    ):
        raise ApiError(400, "invalid_budget", "Budget minimum supérieur au maximum")
    audit(db, admin, "place.updated", "place", pid, fields=sorted(body.model_dump(exclude_unset=True)))
    db.commit()
    index_places(db, [place.id])
    return _place_row(db)(place)


@router.get("/users")
def users(db: DB, _: AdminUser, q: str | None = Query(None, max_length=120), page: int = Query(1, ge=1)):
    stmt = select(User).order_by(User.created_at.desc())
    if q:
        stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.display_name.ilike(f"%{q}%")))
    return _page(
        stmt, db, page, lambda u: {**user_out(u).model_dump(), "created_at": u.created_at, "is_active": u.is_active}
    )


@router.patch("/users/{uid}")
def update_user(uid: str, body: AdminUserPatch, db: DB, admin: AdminUser):
    user = db.get(User, _id(uid))
    if not user:
        raise not_found("Utilisateur")
    if user.id == admin.id and body.role and body.role != "admin":
        raise ApiError(400, "self_demotion", "Tu ne peux pas retirer ton propre rôle d'administrateur")
    if body.role:
        user.role = body.role
    if body.plan:
        user.plan_code = body.plan  # attribution manuelle (offre partenaire, test) — tracée dans l'audit
    audit(db, admin, "user.updated", "user", uid, **body.model_dump(exclude_none=True))
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.get("/reports")
def reports(
    db: DB, _: AdminUser, status: str = Query("open", pattern="^(open|resolved|rejected)$"), page: int = Query(1, ge=1)
):
    stmt = select(Report).where(Report.status == status).order_by(Report.created_at.desc())
    return _page(
        stmt,
        db,
        page,
        lambda r: {
            "id": str(r.id),
            "place": {"id": str(r.place.id), "slug": r.place.slug, "name": r.place.name},
            "kind": r.kind,
            "message": r.message,
            "status": r.status,
            "created_at": r.created_at,
        },
    )


@router.patch("/reports/{rid}")
def update_report(rid: str, body: StatusPatch, db: DB, admin: AdminUser):
    r = db.get(Report, _id(rid))
    if not r:
        raise not_found("Signalement")
    r.status = body.status
    r.resolved_by, r.resolved_at = (admin.id, datetime.now(UTC)) if body.status != "open" else (None, None)
    audit(db, admin, "report.updated", "report", rid, status=body.status)
    db.commit()
    return {"id": rid, "status": r.status}


@router.get("/curation")
def curation(db: DB, user: StaffUser, page: int = Query(1, ge=1)):
    stmt = select(CurationItem).where(CurationItem.status == "pending").order_by(CurationItem.created_at)

    def fmt(c: CurationItem):
        card = cards_for_places(db, [c.place], user)[0]
        return {
            "id": str(c.id),
            "reason": c.reason,
            "detail": c.detail,
            "status": c.status,
            "created_at": c.created_at,
            "place": card.model_dump(),
        }

    return _page(stmt, db, page, fmt)


@router.patch("/curation/{cid}")
def decide(cid: str, body: CurationDecision, db: DB, user: StaffUser):
    item = db.get(CurationItem, _id(cid))
    if not item or item.status != "pending":
        raise not_found("Élément de curation")
    item.status, item.note, item.decided_by, item.decided_at = body.decision, body.note, user.id, datetime.now(UTC)
    if body.decision == "approved":
        if item.reason == "gem_candidate":
            item.place.tier = "premium"
        item.place.verified_at, item.place.confidence = datetime.now(UTC), max(item.place.confidence, 0.8)
    audit(db, user, "curation.decided", "curation", cid, decision=body.decision, reason=item.reason)
    db.commit()
    return {"id": cid, "status": item.status}


@router.get("/audit")
def audit_log(db: DB, _: AdminUser, page: int = Query(1, ge=1)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    return _page(
        stmt,
        db,
        page,
        lambda a: {
            "id": a.id,
            "actor_id": str(a.actor_id) if a.actor_id else None,
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "data": a.data,
            "created_at": a.created_at,
        },
    )


# ---------- Photos (curateurs et admins) ----------
# Ordre d'affichage et crédits : services/photos (réelle autorisée → Wikimedia validée → illustration).

PhotoSource = Literal["owner", "team", "licensed"]


def _photo_row(m: Media, place: Place) -> dict:
    return {
        "id": str(m.id),
        "url": storage.public_url(m.storage_key) or m.source_url,
        "source_kind": m.source_kind,
        "source_label": SOURCE_LABELS.get(m.source_kind or "", "Visuel de démonstration"),
        "author": m.author,
        "license": m.license,
        "license_url": m.license_url,
        "source_page": m.source_page,
        "rights_note": m.rights_note,
        "status": m.moderation_status,
        "credit": credit_for(m, place.name) if m.source_kind else None,
        "is_cover": bool(
            (m.storage_key and m.storage_key == place.cover_key) or (m.source_url and m.source_url == place.cover_url)
        ),
        "position": m.position,
        "created_at": m.created_at,
    }


@router.get("/places/{pid}/photos")
def list_photos(pid: str, db: DB, _: StaffUser):
    """Toutes les photos du lieu, y compris celles à valider, avec leur provenance et leurs droits."""
    place = db.get(Place, _id(pid))
    if not place:
        raise not_found("Lieu")
    media = db.scalars(select(Media).where(Media.place_id == place.id).order_by(Media.position, Media.created_at))
    return {
        "cover_kind": place.cover_kind or "illustration",
        "items": [_photo_row(m, place) for m in media if m.storage_key or m.source_url],
    }


@router.post("/places/{pid}/photos", status_code=201)
async def upload_photo(
    pid: str,
    db: DB,
    user: StaffUser,
    file: UploadFile = File(...),
    source_kind: PhotoSource = Form(default="team"),
    author: str = Form(..., min_length=1, max_length=160),
    license: str | None = Form(default=None, max_length=80),
    license_url: str | None = Form(default=None, max_length=300),
    source_page: str | None = Form(default=None, max_length=500),
    rights_note: str | None = Form(default=None, max_length=300),
    rights_confirmed: bool = Form(default=False),
    make_cover: bool = Form(default=False),
):
    """Photo réelle : fournie par le lieu (autorisation), prise par l'équipe, ou sous licence. Elle passe devant
    toute photo Wikimedia et toute illustration."""
    place = db.get(Place, _id(pid))
    if not place:
        raise not_found("Lieu")
    if not rights_confirmed:
        raise ApiError(422, "rights_required", "Confirme que tu as le droit d'utiliser cette photo")
    if source_kind in ("owner", "licensed") and not (rights_note or "").strip():
        raise ApiError(422, "rights_required", "Indique l'autorisation obtenue (qui, comment, quand)")
    data, width, height = storage.process_image(await file.read(storage.MAX_BYTES + 1))
    key = storage.save(f"places/{place.id}", data)
    position = (
        -1
        if make_cover
        else (db.scalar(select(func.count()).select_from(Media).where(Media.place_id == place.id)) or 0)
    )
    default_license = {"owner": "Utilisation autorisée par le lieu", "team": "Tous droits réservés (équipe)"}
    media = Media(
        place_id=place.id,
        storage_key=key,
        alt=f"Photo de {place.name}",
        source_kind=source_kind,
        author=author.strip(),
        license=(license or default_license.get(source_kind) or "").strip() or None,
        license_url=license_url,
        source_page=source_page,
        rights_note=(rights_note or "").strip() or None,
        width=width,
        height=height,
        position=position,
        moderation_status="approved",
        reviewed_at=datetime.now(UTC),
    )
    media.credit = credit_for(media, place.name)[:160]
    db.add(media)
    db.flush()
    refresh_cover(db, place)
    audit(db, user, "photo.added", "place", pid, media_id=str(media.id), source=source_kind)
    db.commit()
    return _photo_row(media, place)


class PhotoPatch(BaseModel):
    status: Literal["approved", "rejected", "pending"] | None = None
    source_kind: Literal["owner", "team", "licensed", "wikimedia"] | None = None
    author: str | None = Field(default=None, max_length=160)
    license: str | None = Field(default=None, max_length=80)
    license_url: str | None = Field(default=None, max_length=300)
    source_page: str | None = Field(default=None, max_length=500)
    rights_note: str | None = Field(default=None, max_length=300)


@router.patch("/photos/{mid}")
def update_photo(mid: str, body: PhotoPatch, db: DB, user: StaffUser):
    """Valider ou refuser une photo (Wikimedia notamment) et corriger sa provenance ou ses droits."""
    media = db.get(Media, _id(mid))
    if not media:
        raise not_found("Photo")
    place = db.get(Place, media.place_id)
    data = body.model_dump(exclude_unset=True)
    status = data.pop("status", None)
    for k, v in data.items():
        setattr(media, k, v.strip() if isinstance(v, str) else v)
    if status:
        if status == "approved" and media.source_kind == "wikimedia" and not (media.author and media.license):
            raise ApiError(422, "rights_required", "Une photo Wikimedia doit avoir son auteur et sa licence")
        mark_reviewed(media, status)
    if media.source_kind:
        media.credit = credit_for(media, place.name)[:160]
    refresh_cover(db, place)
    audit(db, user, "photo.updated", "place", str(place.id), media_id=mid, status=status, fields=sorted(data))
    db.commit()
    return _photo_row(media, place)


@router.patch("/photos/{mid}/cover")
def set_cover(mid: str, db: DB, user: StaffUser):
    """Met la photo en premier ; l'ordre réelle → Wikimedia reste prioritaire (une photo réelle passe devant)."""
    media = db.get(Media, _id(mid))
    if not media or not (media.storage_key or media.source_url):
        raise not_found("Photo")
    place = db.get(Place, media.place_id)
    first = db.scalar(select(func.min(Media.position)).where(Media.place_id == place.id)) or 0
    media.position = first - 1
    refresh_cover(db, place)
    audit(db, user, "photo.cover", "place", str(place.id), media_id=mid)
    db.commit()
    return _photo_row(media, place)


@router.delete("/photos/{mid}", status_code=204)
def delete_photo(mid: str, db: DB, user: StaffUser):
    media = db.get(Media, _id(mid))
    if not media:
        raise not_found("Photo")
    place = db.get(Place, media.place_id)
    storage.delete(media.storage_key)
    db.delete(media)
    db.flush()
    refresh_cover(db, place)
    audit(db, user, "photo.deleted", "place", str(place.id), media_id=mid)
    db.commit()
    return Response(status_code=204)
