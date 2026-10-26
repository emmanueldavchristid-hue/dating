"""Droits d'accès côté serveur (jamais seulement dans l'interface)."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import ApiError, premium_required
from app.models import ConciergeUsage, Plan, User

FREE_DEFAULTS = {"concierge_per_day": 3, "itinerary_max_steps": 2}


def can_see_premium(user: User | None) -> bool:
    return bool(user and (user.plan.can_see_gems or user.role in ("admin", "curator")))


def require_premium(user: User | None) -> None:
    if not can_see_premium(user):
        raise premium_required()


def plan_of(db: Session, user: User | None) -> Plan:
    if user:
        return user.plan
    return db.get(Plan, "free")


def max_itinerary_steps(db: Session, user: User | None) -> int:
    plan = plan_of(db, user)
    return plan.itinerary_max_steps if plan else FREE_DEFAULTS["itinerary_max_steps"]


def consume_concierge(db: Session, user: User, today: date) -> tuple[int, int]:
    """Incrémente atomiquement l'usage du jour ; lève quota_exceeded si la limite est atteinte."""
    limit = user.plan.concierge_per_day
    used = (
        db.scalar(select(ConciergeUsage.count).where(ConciergeUsage.user_id == user.id, ConciergeUsage.day == today))
        or 0
    )
    if used >= limit:
        raise ApiError(429, "quota_exceeded", f"Quota du concierge atteint ({limit} demandes par jour avec ton offre)")
    stmt = insert(ConciergeUsage).values(user_id=user.id, day=today, count=1)
    stmt = stmt.on_conflict_do_update(index_elements=["user_id", "day"], set_={"count": ConciergeUsage.count + 1})
    db.execute(stmt)
    db.commit()
    return used + 1, limit
