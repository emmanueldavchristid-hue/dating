"""Tâches de fond déterministes (à lancer par cron / planificateur) :

    python -m app.tasks purge-history     # vie privée : supprime l'historique de recherche ancien
    python -m app.tasks flag-for-review   # curation : lieux à re-vérifier (anciens, signalés, contradictoires)
"""
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import CurationItem, Place, Report, SearchHistory

STALE_DAYS = 365
REPORT_THRESHOLD = 2


def purge_history(db) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=get_settings().search_history_retention_days)
    n = db.execute(delete(SearchHistory).where(SearchHistory.created_at < cutoff)).rowcount
    db.commit()
    return n


def _pending(db, place_id, reason) -> bool:
    return bool(db.scalar(select(CurationItem.id).where(CurationItem.place_id == place_id, CurationItem.reason == reason,
                                                        CurationItem.status == "pending")))


def flag_for_review(db) -> int:
    """Crée des éléments de curation ; ne modifie jamais un lieu automatiquement."""
    created = 0
    cutoff = datetime.now(UTC) - timedelta(days=STALE_DAYS)
    for place in db.scalars(select(Place).where(Place.status == "published", Place.is_demo.is_(False),
                                                Place.verified_at.is_not(None), Place.verified_at < cutoff)):
        if not _pending(db, place.id, "stale"):
            db.add(CurationItem(place_id=place.id, reason="stale", detail=f"Dernière vérification il y a plus de {STALE_DAYS} jours."))
            created += 1
    rows = db.execute(select(Report.place_id, func.count(), func.count(func.distinct(Report.kind)))
                      .where(Report.status == "open").group_by(Report.place_id).having(func.count() >= REPORT_THRESHOLD))
    for place_id, n, kinds in rows:
        reason = "contradictory" if kinds > 1 else "user_reports"
        if not _pending(db, place_id, reason):
            db.add(CurationItem(place_id=place_id, reason=reason, detail=f"{n} signalements ouverts ({kinds} type(s) différent(s))."))
            created += 1
    db.commit()
    return created


def main() -> None:
    jobs = {"purge-history": purge_history, "flag-for-review": flag_for_review}
    if len(sys.argv) < 2 or sys.argv[1] not in jobs:
        raise SystemExit(f"Usage : python -m app.tasks [{'|'.join(jobs)}]")
    with SessionLocal() as db:
        print(f"{sys.argv[1]} : {jobs[sys.argv[1]](db)} élément(s)")


if __name__ == "__main__":
    main()
