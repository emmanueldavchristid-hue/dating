"""Concierge : compréhension de la demande → filtres → recherche hybride (RAG) → réponse fondée sur la base.

Garanties :
- les lieux proposés viennent toujours de la base (sous les filtres et droits de l'utilisateur) ;
- le LLM (optionnel) ne reçoit que les fiches retrouvées et ne peut pas exécuter de requête ;
- si sa réponse cite un lieu de la base absent de la sélection, elle est rejetée au profit du mode règles."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.adapters.llm import get_llm
from app.config import get_settings
from app.deps import DB, CurrentUser
from app.errors import ApiError
from app.models import Ambiance, Category, City, District, Place
from app.ratelimit import limit
from app.schemas import ConciergeOut, PlaceCard, Quota
from app.services import intent
from app.services.entitlements import can_see_premium, consume_concierge
from app.services.hours import local_now
from app.services.rag import hybrid_retrieve, retrieval_mode
from app.services.search import SearchParams, run_search, search_conditions, to_cards
from app.services.taste import compute_taste

router = APIRouter(tags=["concierge"])


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1500)


class ConciergeRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    city: str | None = None
    history: list[Turn] = Field(default_factory=list, max_length=6)


def _fmt_fcfa(v: int) -> str:
    return f"{v:,}".replace(",", " ") + " FCFA"


def rules_reply(parsed, cards: list[PlaceCard], relaxed: list[str], snippets: dict[str, str]) -> str:
    if not cards:
        return "Je n'ai trouvé aucun lieu dans notre base qui corresponde à ta demande. Essaie d'élargir le budget, la zone ou les ambiances."
    intro = "Voici ce que je te propose"
    if parsed.budget_max_fcfa:
        intro += f", avec un budget d'environ {_fmt_fcfa(parsed.budget_max_fcfa)} max"
    lines = [intro + " :"]
    for c in cards:
        bits = []
        if c.distance_km is not None:
            bits.append(f"{str(c.distance_km).replace('.', ',')} km à vol d'oiseau")
        if c.budget_min_fcfa is not None and c.budget_max_fcfa is not None:
            bits.append(f"{_fmt_fcfa(c.budget_min_fcfa)} – {_fmt_fcfa(c.budget_max_fcfa)}")
        bits.append(
            {"open": "ouvert maintenant", "closed": "fermé en ce moment"}.get(c.open_status, "horaires non vérifiés")
        )
        lines.append(f"• {c.name} — {', '.join(bits)}.")
    if relaxed:
        lines.append("J'ai dû assouplir : " + ", ".join(relaxed) + ".")
    return "\n".join(lines)


def _context_message(body: ConciergeRequest) -> str:
    """Les relances (« moins cher », « et à Cocody ? ») héritent de la demande précédente de l'utilisateur."""
    previous = [t.content for t in body.history if t.role == "user"][-2:]
    return " ".join([*previous, body.message]) if previous else body.message


def mentions_foreign_place(db, reply: str, allowed: set[str]) -> bool:
    low = reply.lower()
    names = db.scalars(select(Place.name).where(Place.status == "published")).all()
    return any(n.lower() in low for n in names if n not in allowed and len(n) > 4)


@router.post("/concierge", response_model=ConciergeOut, dependencies=[Depends(limit("concierge", 20))])
def concierge(body: ConciergeRequest, db: DB, user: CurrentUser):
    s = get_settings()
    if (body.lat is None) != (body.lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    used, quota = consume_concierge(db, user, local_now(s.timezone).date())
    city_slug = body.city or (user.preferences.home_city if user.preferences else None) or s.default_city
    mentioned = intent.find_city(_context_message(body), {c.name: c.slug for c in db.scalars(select(City))})
    if mentioned and body.lat is None:
        city_slug = mentioned  # « une plage à Grand-Bassam » : la ville citée prime sur la ville habituelle
    city = db.scalar(select(City).where(City.slug == city_slug))
    if not city:
        raise ApiError(400, "unknown_city", "Ville inconnue")
    districts = {d.name: d.slug for d in db.scalars(select(District).where(District.city_id == city.id))}

    full_message = _context_message(body)
    llm, provider = get_llm(), "rules"
    parsed = intent.parse(full_message, districts)
    if llm:
        cats, ambs = list(db.scalars(select(Category.slug))), list(db.scalars(select(Ambiance.slug)))
        extracted = llm.extract(full_message, cats, ambs)
        if extracted:
            extracted.district = parsed.district
            parsed, provider = extracted, llm.name

    taste = compute_taste(db, user)
    prefs = taste.as_prefs() if taste.usable else None
    tiers = ("free", "premium") if can_see_premium(user) else ("free",)
    gps = body.lat is not None
    base = {
        "lat": body.lat,
        "lng": body.lng,
        "city": None if gps else city_slug,
        "district": None if gps else parsed.district,
        "tiers": tiers,
    }
    attempts = [
        ({}, []),
        ({"ambiances": []}, ["les ambiances"]),
        ({"ambiances": [], "open_now": False}, ["les ambiances", "l'ouverture immédiate"]),
        (
            {"ambiances": [], "open_now": False, "district": None},
            ["les ambiances", "l'ouverture immédiate", "le quartier"],
        ),
        (
            {"ambiances": [], "open_now": False, "district": None, "categories": []},
            ["les ambiances", "l'ouverture immédiate", "le quartier", "le type de lieu"],
        ),
    ]
    mode = retrieval_mode(db)
    cards: list[PlaceCard] = []
    snippets: dict[str, str] = {}
    relaxed: list[str] = []
    for override, relaxed in attempts:  # noqa: B007 — `relaxed` est lu après la boucle
        params = SearchParams(
            **{
                **base,
                "categories": parsed.categories,
                "ambiances": parsed.ambiances,
                "budget_max": parsed.budget_max_fcfa,
                "open_now": parsed.open_now,
                **override,
            }
        )
        if mode != "none":
            conds, _ = search_conditions(db, params)
            hits = hybrid_retrieve(db, full_message, conds)[:12]
            if not hits:
                continue
            rrf = {h.place_id: h.rrf for h in hits}
            snippets = {str(h.place_id): h.snippet for h in hits}
            params.only_ids, params.page_size = list(rrf), 12
            items, _, origin = run_search(db, params, user, prefs)
            top_rrf = max(rrf.values())
            items.sort(key=lambda i: -(0.6 * rrf[i["place"].id] / top_rrf + 0.4 * (i["score"] or 0) / 100))
            items = items[:3]
        else:
            params.page_size = 3
            items, _, origin = run_search(db, params, user, prefs)
        if items:
            cards = to_cards(db, items, user, origin)
            break

    reply = None
    if llm and cards:
        facts = [
            {
                "nom": c.name,
                "quartier": c.district,
                "categories": c.categories,
                "ambiances": c.ambiances,
                "budget_fcfa": [c.budget_min_fcfa, c.budget_max_fcfa],
                "note": c.rating_avg,
                "nb_avis": c.rating_count,
                "statut": c.open_status,
                "distance_vol_oiseau_km": c.distance_km,
                "extrait": snippets.get(c.id, c.short_description),
            }
            for c in cards
        ]
        reply = llm.compose(body.message, facts)
        if reply and mentions_foreign_place(db, reply, {c.name for c in cards}):
            reply = None  # garde-fou : un lieu hors sélection a été cité
    if not reply:
        reply, provider = rules_reply(parsed, cards, relaxed, snippets), "rules"
    return ConciergeOut(
        reply=reply,
        places=cards,
        parsed=parsed,
        provider=provider,
        retrieval="lexical" if mode == "none" else mode,
        quota=Quota(used=used, limit=quota),
    )
