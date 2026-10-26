import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import delete, func, select

from app.deps import DB, CurrentUser
from app.errors import ApiError, not_found
from app.models import (
    Ambiance,
    Category,
    City,
    Collection,
    CollectionItem,
    Favorite,
    Itinerary,
    Place,
    Report,
    Review,
    SearchHistory,
    Subscription,
    UserPreferences,
)
from app.schemas import (
    CollectionDetail,
    CollectionIn,
    CollectionItemIn,
    CollectionSummary,
    ConsentIn,
    PlaceCard,
    PreferencesPatch,
    SubscriptionOut,
    UserOut,
)
from app.services.audit import audit
from app.services.search import cards_for_places
from app.services.users import user_out

router = APIRouter(prefix="/me", tags=["me"])


def _uuid(v: str, what: str = "Ressource") -> uuid.UUID:
    try:
        return uuid.UUID(v)
    except ValueError as e:
        raise not_found(what) from e


def _place(db, place_id: str) -> Place:
    place = db.get(Place, _uuid(place_id, "Lieu"))
    if not place:
        raise not_found("Lieu")
    return place


@router.get("", response_model=UserOut)
def me(user: CurrentUser):
    return user_out(user)


@router.patch("/preferences", response_model=UserOut)
def update_preferences(body: PreferencesPatch, db: DB, user: CurrentUser):
    prefs = user.preferences or UserPreferences(user_id=user.id)
    data = body.model_dump(exclude_unset=True)
    if "categories" in data and data["categories"] is not None:
        known = set(db.scalars(select(Category.slug)))
        if not set(data["categories"]) <= known:
            raise ApiError(400, "unknown_category", "Catégorie inconnue")
    if "ambiances" in data and data["ambiances"] is not None:
        known = set(db.scalars(select(Ambiance.slug)))
        if not set(data["ambiances"]) <= known:
            raise ApiError(400, "unknown_ambiance", "Ambiance inconnue")
    if data.get("home_city") and not db.scalar(select(City).where(City.slug == data["home_city"])):
        raise ApiError(400, "unknown_city", "Ville inconnue")
    for k, v in data.items():
        setattr(prefs, k, v if v is not None or k in ("budget_max_fcfa", "home_city") else [])
    user.preferences = prefs
    db.commit()
    return user_out(user)


@router.post("/consent", response_model=UserOut)
def consent(body: ConsentIn, db: DB, user: CurrentUser):
    user.location_consent = body.location
    user.location_consent_at = datetime.now(UTC) if body.location else None
    db.commit()
    return user_out(user)


@router.get("/export")
def export(db: DB, user: CurrentUser):
    """Export des données personnelles (droit d'accès / portabilité)."""
    favs = db.scalars(select(Place.slug).join(Favorite, Favorite.place_id == Place.id).where(Favorite.user_id == user.id)).all()
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": user_out(user).model_dump(),
        "created_at": user.created_at.isoformat(),
        "favorites": list(favs),
        "collections": [{"name": c.name, "description": c.description} for c in db.scalars(select(Collection).where(Collection.user_id == user.id))],
        "reviews": [{"place_id": str(r.place_id), "rating": r.rating, "text": r.text, "created_at": r.created_at.isoformat()}
                    for r in db.scalars(select(Review).where(Review.user_id == user.id))],
        "reports": [{"place_id": str(r.place_id), "kind": r.kind, "message": r.message, "status": r.status}
                    for r in db.scalars(select(Report).where(Report.user_id == user.id))],
        "itineraries": [{"title": i.title, "date": i.day.isoformat() if i.day else None, "steps": len(i.steps)}
                        for i in db.scalars(select(Itinerary).where(Itinerary.user_id == user.id))],
        "search_history": [{"query": s.query, "filters": s.filters, "created_at": s.created_at.isoformat()}
                           for s in db.scalars(select(SearchHistory).where(SearchHistory.user_id == user.id))],
    }


@router.delete("", status_code=204)
def delete_account(db: DB, user: CurrentUser):
    """Suppression définitive. Les avis restent anonymisés (user_id = NULL) pour préserver les notes des lieux."""
    db.execute(delete(SearchHistory).where(SearchHistory.user_id == user.id))
    audit(db, None, "user.deleted", "user", str(user.id))
    db.delete(user)
    db.commit()
    return Response(status_code=204)


@router.get("/subscription", response_model=SubscriptionOut)
def subscription(db: DB, user: CurrentUser):
    sub = db.scalar(select(Subscription).where(Subscription.user_id == user.id, Subscription.status == "active")
                    .order_by(Subscription.created_at.desc()))
    return SubscriptionOut(plan=user.plan_code, status=sub.status if sub else ("active" if user.plan_code != "free" else "none"),
                           current_period_end=sub.current_period_end if sub else None)


# ---------- Favoris ----------

@router.get("/favorites", response_model=list[PlaceCard])
def favorites(db: DB, user: CurrentUser):
    places = db.scalars(select(Place).join(Favorite, Favorite.place_id == Place.id)
                        .where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc()).limit(200)).all()
    return cards_for_places(db, list(places), user)


@router.put("/favorites/{place_id}", status_code=204)
def add_favorite(place_id: str, db: DB, user: CurrentUser):
    place = _place(db, place_id)
    if not db.get(Favorite, (user.id, place.id)):
        db.add(Favorite(user_id=user.id, place_id=place.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/favorites/{place_id}", status_code=204)
def remove_favorite(place_id: str, db: DB, user: CurrentUser):
    db.execute(delete(Favorite).where(Favorite.user_id == user.id, Favorite.place_id == _uuid(place_id, "Lieu")))
    db.commit()
    return Response(status_code=204)


# ---------- Collections ----------

def _collection(db, user, cid: str) -> Collection:
    c = db.get(Collection, _uuid(cid, "Collection"))
    if not c or c.user_id != user.id:
        raise not_found("Collection")
    return c


@router.get("/collections", response_model=list[CollectionSummary])
def collections(db: DB, user: CurrentUser):
    rows = db.execute(
        select(Collection, func.count(CollectionItem.place_id))
        .outerjoin(CollectionItem, CollectionItem.collection_id == Collection.id)
        .where(Collection.user_id == user.id).group_by(Collection.id).order_by(Collection.created_at.desc())
    ).all()
    return [CollectionSummary(id=str(c.id), name=c.name, description=c.description, count=n) for c, n in rows]


@router.post("/collections", response_model=CollectionSummary, status_code=201)
def create_collection(body: CollectionIn, db: DB, user: CurrentUser):
    if db.scalar(select(func.count()).select_from(Collection).where(Collection.user_id == user.id)) >= 100:
        raise ApiError(400, "limit_reached", "Nombre maximal de collections atteint")
    c = Collection(user_id=user.id, name=body.name.strip(), description=body.description.strip())
    db.add(c)
    db.commit()
    return CollectionSummary(id=str(c.id), name=c.name, description=c.description, count=0)


@router.get("/collections/{cid}", response_model=CollectionDetail)
def get_collection(cid: str, db: DB, user: CurrentUser):
    c = _collection(db, user, cid)
    places = db.scalars(select(Place).join(CollectionItem, CollectionItem.place_id == Place.id)
                        .where(CollectionItem.collection_id == c.id).order_by(CollectionItem.created_at)).all()
    return CollectionDetail(id=str(c.id), name=c.name, description=c.description, items=cards_for_places(db, list(places), user))


@router.delete("/collections/{cid}", status_code=204)
def delete_collection(cid: str, db: DB, user: CurrentUser):
    db.delete(_collection(db, user, cid))
    db.commit()
    return Response(status_code=204)


@router.post("/collections/{cid}/items", status_code=204)
def add_item(cid: str, body: CollectionItemIn, db: DB, user: CurrentUser):
    c, place = _collection(db, user, cid), _place(db, body.place_id)
    if not db.get(CollectionItem, (c.id, place.id)):
        db.add(CollectionItem(collection_id=c.id, place_id=place.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/collections/{cid}/items/{place_id}", status_code=204)
def remove_item(cid: str, place_id: str, db: DB, user: CurrentUser):
    c = _collection(db, user, cid)
    db.execute(delete(CollectionItem).where(CollectionItem.collection_id == c.id, CollectionItem.place_id == _uuid(place_id, "Lieu")))
    db.commit()
    return Response(status_code=204)
