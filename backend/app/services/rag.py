"""RAG : indexation des faits de la base et recherche hybride.

Indexation : chaque lieu publié produit des fragments (fiche, résumé d'avis, avis), encodés en vecteurs
et stockés dans `place_documents` (index HNSW + tsvector). Le vecteur de la fiche devient `places.embedding`.

Recherche hybride : deux classements sous les MÊMES filtres que la recherche (ville, rayon, offre, budget…)
  1. similarité vectorielle (pgvector, cosinus) sur les fragments ;
  2. plein texte (tsvector, requête OU sur les mots significatifs) ;
fusionnés par Reciprocal Rank Fusion, puis mélangés au score déterministe (distance, qualité, goûts…).
Chaque résultat garde le fragment le plus pertinent : c'est la seule matière que le concierge peut citer."""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.adapters.embeddings import STOP, _norm, get_embedder
from app.models import Ambiance, Category, Place, PlaceDocument, Review

RRF_K = 60


def _fcfa(v: int | None) -> str:
    return f"{v:,}".replace(",", " ") + " FCFA" if v is not None else "inconnu"


def profile_text(place: Place, cat_names: dict[str, str], amb_names: dict[str, str]) -> str:
    amen = [
        label
        for flag, label in (
            (place.has_parking, "parking"),
            (place.wheelchair, "accessible PMR"),
            (place.wifi, "wifi"),
            (place.card_payment, "paiement par carte"),
            (place.mobile_money, "Mobile Money"),
            (place.outdoor, "espace extérieur"),
        )
        if flag
    ]
    parts = [
        place.name,
        "Catégories : " + ", ".join(cat_names.get(c, c) for c in place.category_slugs or []),
        "Ambiances : " + ", ".join(amb_names.get(a, a) for a in place.ambiance_slugs or [])
        if place.ambiance_slugs
        else "",
        f"Lieu : {place.district.name + ', ' if place.district else ''}{place.city.name}",
        f"Budget par personne : {_fcfa(place.budget_min_fcfa)} à {_fcfa(place.budget_max_fcfa)}"
        if place.budget_min_fcfa is not None
        else "",
        "Équipements : " + ", ".join(amen) if amen else "",
        place.short_description,
        place.description,
    ]
    return "\n".join(p for p in parts if p)


def documents_for(db: Session, place: Place, cat_names, amb_names) -> list[tuple[str, str, str]]:
    docs = [("profile", "", profile_text(place, cat_names, amb_names))]
    if place.reviews_summary:
        docs.append(("summary", "", f"{place.name} — résumé des avis : {place.reviews_summary}"))
    reviews = db.scalars(
        select(Review)
        .where(Review.place_id == place.id, Review.status == "published", func.length(Review.text) >= 15)
        .order_by(Review.created_at.desc())
        .limit(30)
    )
    docs += [("review", str(r.id), f"{place.name} — avis {r.rating}/5 : {r.text}") for r in reviews]
    return docs


def index_places(db: Session, place_ids: list[uuid.UUID] | None = None, rebuild: bool = False, batch: int = 64) -> int:
    """(Ré)indexe les lieux publiés. Idempotent : remplace les fragments existants des lieux traités."""
    embedder = get_embedder()
    cat_names = dict(db.execute(select(Category.slug, Category.name)).all())
    amb_names = dict(db.execute(select(Ambiance.slug, Ambiance.name)).all())
    stmt = select(Place).where(Place.status == "published")
    if place_ids is not None:
        stmt = stmt.where(Place.id.in_(place_ids))
    elif not rebuild:
        indexed = select(PlaceDocument.place_id).where(PlaceDocument.model == embedder.name)
        stmt = stmt.where(Place.id.not_in(indexed))
    places = list(db.scalars(stmt))
    # un lieu dépublié (brouillon, fermé, archivé) ne doit plus nourrir le RAG
    db.execute(
        delete(PlaceDocument).where(PlaceDocument.place_id.in_(select(Place.id).where(Place.status != "published")))
    )
    db.execute(update(Place).where(Place.status != "published", Place.embedding.is_not(None)).values(embedding=None))
    db.commit()
    for i in range(0, len(places), batch):
        chunk = places[i : i + batch]
        docs = [
            (pl, kind, ref, text) for pl in chunk for kind, ref, text in documents_for(db, pl, cat_names, amb_names)
        ]
        vectors = embedder.embed([d[3] for d in docs])
        db.execute(delete(PlaceDocument).where(PlaceDocument.place_id.in_([pl.id for pl in chunk])))
        for (pl, kind, ref, text), vec in zip(docs, vectors, strict=True):
            db.add(PlaceDocument(place_id=pl.id, kind=kind, ref=ref, content=text, embedding=vec, model=embedder.name))
            if kind == "profile":
                pl.embedding = vec
        db.commit()
    return len(places)


def _or_tsquery(text: str) -> str | None:
    words = [w for w in _norm(text).split() if w not in STOP and len(w) > 2][:12]
    return " | ".join(f"{re.sub('[^a-z0-9]', '', w)}:*" for w in words) or None


@dataclass
class Hit:
    place_id: uuid.UUID
    rrf: float
    snippet: str


def hybrid_retrieve(db: Session, query: str, conds: list, k: int = 40) -> list[Hit]:
    """Retourne les lieux les plus pertinents (sous les filtres `conds`) avec leur meilleur fragment."""
    embedder = get_embedder()
    qvec = embedder.embed([query], query=True)[0]
    dist = PlaceDocument.embedding.cosine_distance(qvec)
    vec_rows = db.execute(
        select(PlaceDocument.place_id, func.min(dist).label("d"))
        .join(Place, Place.id == PlaceDocument.place_id)
        .where(*conds, PlaceDocument.model == embedder.name)
        .group_by(PlaceDocument.place_id)
        .order_by("d")
        .limit(k)
    ).all()
    ranked: dict[uuid.UUID, float] = {}
    for rank, (pid, _) in enumerate(vec_rows):
        ranked[pid] = ranked.get(pid, 0) + 1 / (RRF_K + rank + 1)
    tsq_text = _or_tsquery(query)
    if tsq_text:
        tsq = func.to_tsquery("simple", tsq_text)
        txt_rows = db.execute(
            select(PlaceDocument.place_id, func.max(func.ts_rank(PlaceDocument.tsv, tsq)).label("r"))
            .join(Place, Place.id == PlaceDocument.place_id)
            .where(*conds, PlaceDocument.tsv.op("@@")(tsq))
            .group_by(PlaceDocument.place_id)
            .order_by(func.max(func.ts_rank(PlaceDocument.tsv, tsq)).desc())
            .limit(k)
        ).all()
        for rank, (pid, _) in enumerate(txt_rows):
            ranked[pid] = ranked.get(pid, 0) + 1 / (RRF_K + rank + 1)
    if not ranked:
        return []
    best = db.execute(
        select(PlaceDocument.place_id, PlaceDocument.content)
        .where(PlaceDocument.place_id.in_(list(ranked)), PlaceDocument.model == embedder.name)
        .distinct(PlaceDocument.place_id)
        .order_by(PlaceDocument.place_id, dist)
    ).all()
    snippets = dict(best)
    return sorted((Hit(pid, score, snippets.get(pid, "")) for pid, score in ranked.items()), key=lambda h: -h.rrf)


def retrieval_mode(db: Session) -> str:
    embedder = get_embedder()
    has_docs = db.scalar(select(func.count()).select_from(PlaceDocument).where(PlaceDocument.model == embedder.name))
    if not has_docs:
        return "none"
    return "hybrid" if embedder.kind == "semantic" else "lexical"
