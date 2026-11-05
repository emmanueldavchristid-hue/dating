"""Tâches de fond déterministes (à lancer par cron / planificateur) :

python -m app.tasks purge-history     # vie privée : supprime l'historique de recherche ancien
python -m app.tasks flag-for-review   # curation : lieux à re-vérifier (anciens, signalés, contradictoires)
python -m app.tasks flag-gem-candidates          # curation : propose des pépites potentielles (validées par un humain)
python -m app.tasks index-embeddings [--rebuild]   # RAG : indexe les lieux publiés (fiches + avis)
python -m app.tasks refine-categories  # données : catégories précises lisibles dans le nom (cinéma, musée…)
python -m app.tasks dedupe             # données : archive les doublons (même nom à moins de 150 m)
python -m app.tasks reset-popularity   # données : remet à zéro les vues gonflées par les tests automatiques
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
    return bool(
        db.scalar(
            select(CurationItem.id).where(
                CurationItem.place_id == place_id, CurationItem.reason == reason, CurationItem.status == "pending"
            )
        )
    )


def flag_for_review(db) -> int:
    """Crée des éléments de curation ; ne modifie jamais un lieu automatiquement."""
    created = 0
    cutoff = datetime.now(UTC) - timedelta(days=STALE_DAYS)
    for place in db.scalars(
        select(Place).where(
            Place.status == "published",
            Place.is_demo.is_(False),
            Place.verified_at.is_not(None),
            Place.verified_at < cutoff,
        )
    ):
        if not _pending(db, place.id, "stale"):
            db.add(
                CurationItem(
                    place_id=place.id,
                    reason="stale",
                    detail=f"Dernière vérification il y a plus de {STALE_DAYS} jours.",
                )
            )
            created += 1
    rows = db.execute(
        select(Report.place_id, func.count(), func.count(func.distinct(Report.kind)))
        .where(Report.status == "open")
        .group_by(Report.place_id)
        .having(func.count() >= REPORT_THRESHOLD)
    )
    for place_id, n, kinds in rows:
        reason = "contradictory" if kinds > 1 else "user_reports"
        if not _pending(db, place_id, reason):
            db.add(
                CurationItem(
                    place_id=place_id, reason=reason, detail=f"{n} signalements ouverts ({kinds} type(s) différent(s))."
                )
            )
            created += 1
    db.commit()
    return created


GEM_CATEGORIES = ["nature", "plage", "culture", "rooftop", "lounge", "activite"]


def flag_gem_candidates(db, limit: int = 60) -> int:
    """Propose des pépites potentielles à la curation (jamais promues automatiquement) :
    lieux publiés, gratuits, de catégories « découverte », peu fréquentés, de préférence documentés."""
    from app.models import PlaceExternalId

    documented = (
        Place.website.is_not(None)
        | Place.cover_url.is_not(None)
        | Place.id.in_(select(PlaceExternalId.place_id).where(PlaceExternalId.provider == "wikidata"))
    )
    pending = select(CurationItem.place_id).where(CurationItem.reason == "gem_candidate")
    places = db.scalars(
        select(Place)
        .where(
            Place.status == "published",
            Place.tier == "free",
            Place.is_demo.is_(False),
            Place.id.not_in(pending),
            Place.category_slugs.op("&&")(GEM_CATEGORIES),
        )
        .order_by(documented.desc(), Place.popularity.asc(), Place.name)
        .limit(limit)
    ).all()
    for p in places:
        db.add(
            CurationItem(
                place_id=p.id,
                reason="gem_candidate",
                detail="Lieu « découverte » peu fréquenté : à vérifier sur place avant d'en faire une pépite Insider.",
            )
        )
    db.commit()
    return len(places)


def secure_demo_staff(db) -> int:
    """Avant de partager l'app hors du réseau local : mots de passe aléatoires pour les comptes
    admin/curateur de démonstration (leur mot de passe par défaut est public dans le README)."""
    import secrets

    from app.models import User
    from app.security import hash_password

    users = db.scalars(select(User).where(User.email.in_(["admin@sortie.demo", "curateur@sortie.demo"]))).all()
    for u in users:
        pwd = secrets.token_urlsafe(12)
        u.password_hash = hash_password(pwd)
        print(f"{u.email} : {pwd}")
    db.commit()
    return len(users)


def refine_categories(db) -> int:
    """Lieux publiés non vérifiés : ajoute les catégories précises lisibles dans le nom (« Pathé » → cinéma)."""
    from app.importers.osm import refine_categories as refine
    from app.services.places import set_taxonomy

    n = 0
    for p in db.scalars(select(Place).where(Place.status == "published", Place.verified_at.is_(None))):
        cats = refine(p.category_slugs, p.name)
        if cats != sorted(p.category_slugs):
            set_taxonomy(db, p, cats, None)
            n += 1
    db.commit()
    return n


def dedupe(db) -> int:
    """Doublons (même nom à moins de 150 m, souvent deux points OSM) : on garde la fiche la plus complète."""
    from sqlalchemy import text

    rows = db.execute(
        text(
            """
            select a.id, b.id from places a join places b
              on a.id < b.id and lower(f_unaccent(a.name)) = lower(f_unaccent(b.name))
             and ST_DWithin(a.location, b.location, 150)
            where a.status = 'published' and b.status = 'published'
            """
        )
    ).all()
    archived = set()
    for a_id, b_id in rows:
        if a_id in archived or b_id in archived:
            continue
        a, b = db.get(Place, a_id), db.get(Place, b_id)
        richness = lambda p: (  # noqa: E731
            bool(p.verified_at),
            bool(p.cover_url or p.cover_key),
            bool(p.phone),
            len(p.hours),
            len(p.description or ""),
        )
        loser = b if richness(a) >= richness(b) else a
        loser.status = "archived"
        archived.add(loser.id)
    db.commit()
    return len(archived)


def reset_popularity(db) -> int:
    """Sans avis ni vrais utilisateurs, la popularité ne vient que des tests : on la remet à zéro."""
    from sqlalchemy import update

    n = db.execute(update(Place).where(Place.popularity > 0, Place.rating_count == 0).values(popularity=0)).rowcount
    db.commit()
    return n


def main() -> None:
    from app.services.rag import index_places

    jobs = {
        "purge-history": purge_history,
        "flag-for-review": flag_for_review,
        "flag-gem-candidates": flag_gem_candidates,
        "secure-demo-staff": secure_demo_staff,
        "refine-categories": refine_categories,
        "reset-popularity": reset_popularity,
        "dedupe": dedupe,
        "index-embeddings": lambda db: index_places(db, rebuild="--rebuild" in sys.argv),
    }
    if len(sys.argv) < 2 or sys.argv[1] not in jobs:
        raise SystemExit(f"Usage : python -m app.tasks [{'|'.join(jobs)}]")
    with SessionLocal() as db:
        print(f"{sys.argv[1]} : {jobs[sys.argv[1]](db)} élément(s)")


if __name__ == "__main__":
    main()
