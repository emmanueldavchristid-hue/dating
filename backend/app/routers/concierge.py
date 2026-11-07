"""Concierge : compréhension de la demande → filtres → recherche hybride (RAG) → réponse fondée sur la base.

Garanties :
- les lieux proposés viennent toujours de la base (sous les filtres et droits de l'utilisateur) ;
- le LLM (optionnel) ne reçoit que les fiches retrouvées et ne peut pas exécuter de requête ;
- si sa réponse cite un lieu de la base absent de la sélection, elle est rejetée au profit du mode règles ;
- quand la base n'a pas ce qui est demandé, le concierge le dit au lieu de proposer n'importe quoi ;
- une réponse sans lieu (salutation, demande non comprise, rien trouvé) ne consomme pas le quota."""

import re
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
from app.schemas import ConciergeOut, Parsed, PlaceCard, Quota
from app.services import intent, vocab
from app.services.entitlements import can_see_premium, concierge_usage, consume_concierge
from app.services.hours import local_now
from app.services.rag import hybrid_retrieve, retrieval_mode
from app.services.search import SearchParams, run_search, search_conditions, to_cards
from app.services.taste import compute_taste

router = APIRouter(tags=["concierge"])

GREETING_REPLY = (
    "Salut ! Dis-moi ce que tu as envie de faire et où : un maquis à Yopougon, un bar avec vue pour un "
    "afterwork, une plage à Bassam dimanche, un bowling ou un karaoké entre amis…"
)
NOT_UNDERSTOOD_REPLY = (
    "Je n'ai pas bien compris ce que tu cherches. Essaie par exemple : « un resto au bord de l'eau à Cocody », "
    "« une boîte de nuit à Marcory », « une activité pour les enfants » ou « un spa pour se détendre »."
)
FILLER = set(
    "le la les un une des de du d l a au aux et ou en pour moi toi tu vous je concierge stp svp please".split()
)
FOLLOW_UP_STARTS = ("et ", "plutot", "sinon", "autre", "encore", "pareil", "a la place", "what about", "and ")
FOLLOW_UP_WORDS = ("moins cher", "plus proche", "plus pres", "pas loin", "plus calme", "plus festif", "le meme")


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


def is_greeting(message: str) -> bool:
    t = intent.normalize(message)
    for g in sorted(vocab.GREETINGS, key=len, reverse=True):
        t = t.replace(f" {g} ", " ")
    return not [w for w in t.split() if w not in FILLER] and t != intent.normalize(message)


def is_follow_up(message: str, parsed: Parsed) -> bool:
    """« moins cher », « et à Cocody ? », « plutôt un bar » : complète la demande précédente."""
    t = intent.normalize(message).strip()
    if len(t.split()) > 8:
        return False
    if t.startswith(FOLLOW_UP_STARTS) or any(w in t for w in FOLLOW_UP_WORDS):
        return True
    understood_other = parsed.district or parsed.budget_max_fcfa or parsed.ambiances or parsed.open_now
    return not parsed.categories and bool(understood_other)


def merge(previous: Parsed, current: Parsed) -> Parsed:
    return Parsed(
        categories=current.categories or previous.categories,
        ambiances=current.ambiances or previous.ambiances,
        budget_max_fcfa=current.budget_max_fcfa or previous.budget_max_fcfa,
        open_now=current.open_now or previous.open_now,
        q=current.q or previous.q,
        district=current.district or previous.district,
    )


def understood_anything(p: Parsed, city_mentioned: bool) -> bool:
    return bool(p.categories or p.ambiances or p.district or p.budget_max_fcfa or p.open_now or city_mentioned)


def mentions_foreign_place(db, reply: str, allowed: set[str]) -> bool:
    """Le texte cite-t-il un lieu de la base hors sélection ? Comparaison sensible à la casse, sur des noms
    assez distinctifs : « une terrasse en plein air » ne doit pas être confondu avec le lieu « Plein Air »."""
    for n in db.scalars(select(Place.name).where(Place.status == "published")).all():
        if n in allowed or any(n in a for a in allowed):
            continue
        if (" " in n.strip() and len(n) >= 6) or len(n) >= 7:
            if re.search(r"(?<!\w)" + re.escape(n) + r"(?!\w)", reply):
                return True
    return False


def rules_reply(parsed, cards: list[PlaceCard], relaxed: list[str], alternative_for: list[str], cat_names) -> str:
    if not cards:
        return "Je n'ai trouvé aucun lieu dans notre base qui corresponde à ta demande pour l'instant."
    if alternative_for:
        wanted = ", ".join(cat_names.get(c, c).lower() for c in alternative_for)
        lines = [f"Je n'ai pas encore de lieu « {wanted} » référencé ici. Voici des idées proches :"]
    else:
        lines = ["Voici ce que je te propose :"]
    for c in cards:
        bits = [x for x in (c.district,) if x]
        if c.reasons:
            bits.append(c.reasons[0].lower())
        if c.distance_km is not None:
            bits.append(f"{str(c.distance_km).replace('.', ',')} km à vol d'oiseau")
        if c.budget_min_fcfa is not None and c.budget_max_fcfa is not None:
            bits.append(f"{_fmt_fcfa(c.budget_min_fcfa)} – {_fmt_fcfa(c.budget_max_fcfa)}")
        if c.open_status == "open":
            bits.append("ouvert maintenant")
        lines.append(f"• {c.name}" + (f" — {', '.join(bits)}." if bits else ""))
    if parsed.budget_max_fcfa and all(c.budget_min_fcfa is None for c in cards):
        lines.append("Les prix de ces lieux ne sont pas encore renseignés : pense à demander avant d'y aller.")
    if relaxed:
        lines.append("J'ai élargi : " + ", ".join(relaxed) + ".")
    return "\n".join(lines)


def _search(db, user, prefs, base: dict, parsed: Parsed, message: str, mode: str, categories: list[str]):
    """Recherche avec assouplissements successifs. Retourne (items, origin, ce qui a été assoupli)."""
    attempts = [
        ({}, []),
        ({"ambiances": []}, ["l'ambiance"]),
        ({"ambiances": [], "open_now": False}, ["l'ambiance", "l'ouverture immédiate"]),
        ({"ambiances": [], "open_now": False, "budget_max": None}, ["l'ambiance", "l'ouverture", "le budget"]),
        (
            {"ambiances": [], "open_now": False, "budget_max": None, "district": None},
            ["l'ambiance", "l'ouverture", "le budget", "le quartier"],
        ),
    ]
    for override, relaxed in attempts:
        params = SearchParams(
            **{
                **base,
                "categories": categories,
                "ambiances": parsed.ambiances,
                "budget_max": parsed.budget_max_fcfa,
                "open_now": parsed.open_now,
                **override,
            }
        )
        if mode != "none":
            conds, _ = search_conditions(db, params)
            hits = hybrid_retrieve(db, message, conds)[:12]
            if not hits:
                continue
            rrf = {h.place_id: h.rrf for h in hits}
            params.only_ids, params.page_size = list(rrf), 12
            items, _, origin = run_search(db, params, user, prefs)
            top = max(rrf.values())
            items.sort(key=lambda i: -(0.6 * rrf[i["place"].id] / top + 0.4 * (i["score"] or 0) / 100))
            items = items[:3]
        else:
            params.page_size = 3
            items, _, origin = run_search(db, params, user, prefs)
        if items:
            requested = {
                "ambiances": False,  # presque aucune ambiance n'est encore renseignée : inutile de le signaler
                "open_now": parsed.open_now,
                "budget_max": bool(parsed.budget_max_fcfa),
                "district": bool(parsed.district),
            }
            labels = dict(zip(["ambiances", "open_now", "budget_max", "district"], relaxed, strict=False))
            really = [labels[k] for k in labels if requested.get(k)]
            return items, origin, really
    return [], None, []


@router.post("/concierge", response_model=ConciergeOut, dependencies=[Depends(limit("concierge", 20))])
def concierge(body: ConciergeRequest, db: DB, user: CurrentUser):
    s = get_settings()
    if (body.lat is None) != (body.lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    today = local_now(s.timezone).date()
    used, quota = concierge_usage(db, user, today)
    mode = retrieval_mode(db)

    def answer(reply, cards=(), parsed=None, provider="rules", consumed=False):
        return ConciergeOut(
            reply=reply,
            places=list(cards),
            parsed=parsed or Parsed(),
            provider=provider,
            retrieval="lexical" if mode == "none" else mode,
            quota=Quota(used=used + (1 if consumed else 0), limit=quota),
        )

    if is_greeting(body.message):
        return answer(GREETING_REPLY)

    cities = {c.name: c.slug for c in db.scalars(select(City))}
    previous = [t.content for t in body.history if t.role == "user"][-1:]
    city_slug = body.city or (user.preferences.home_city if user.preferences else None) or s.default_city
    mentioned = intent.find_city(body.message, cities)
    districts_of = lambda slug: {  # noqa: E731
        d.name: d.slug for d in db.scalars(select(District).join(City).where(City.slug == slug))
    }
    parsed = intent.parse(body.message, districts_of(mentioned or city_slug))
    follow_up = bool(previous) and is_follow_up(body.message, parsed)
    if follow_up:
        mentioned = mentioned or intent.find_city(previous[0], cities)
        parsed = merge(intent.parse(previous[0], districts_of(mentioned or city_slug)), parsed)
    if mentioned and body.lat is None:
        city_slug = mentioned  # « une plage à Grand-Bassam » : la ville citée prime sur la ville habituelle
    city = db.scalar(select(City).where(City.slug == city_slug))
    if not city:
        raise ApiError(400, "unknown_city", "Ville inconnue")

    llm, provider = get_llm(), "rules"
    if llm:
        cat_desc = {c.slug: c.name for c in db.scalars(select(Category))}
        ambs = list(db.scalars(select(Ambiance.slug)))
        history = [t.model_dump() for t in body.history]
        extracted = llm.extract(body.message, cat_desc, ambs, history)
        if extracted is not None:
            extracted.district = parsed.district
            if not (extracted.categories or extracted.ambiances) and parsed.categories:
                extracted.categories = parsed.categories  # le vocabulaire local reste un filet de sécurité
            parsed, provider = extracted, llm.name
    message = " ".join([*(previous if follow_up else []), body.message])

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
    cat_names = {c.slug: c.name for c in db.scalars(select(Category))}

    if not understood_anything(parsed, bool(mentioned)):
        # Rien de compris : peut-être le nom d'un lieu (« Pathé », « Strike Bowl »)
        items, _, origin = run_search(db, SearchParams(**base, q=body.message, page_size=3), user, prefs)
        if not items:
            return answer(NOT_UNDERSTOOD_REPLY, parsed=parsed)
        cards = to_cards(db, items, user, origin)
        consume_concierge(db, user, today)
        names = ", ".join(c.name for c in cards)
        return answer(f"Voici les lieux dont le nom correspond à ta recherche : {names}.", cards, parsed, "rules", True)

    items, origin, relaxed = _search(db, user, prefs, base, parsed, message, mode, parsed.categories)
    alternative_for: list[str] = []
    if not items and parsed.categories:
        # Pas encore ce type de lieu ici : alternatives de la même envie (bowling → karting, jeux…), annoncées comme telles
        groups = {vocab.CATEGORY_GROUP.get(c) for c in parsed.categories}
        siblings = [c for c, g in vocab.CATEGORY_GROUP.items() if g in groups and c not in parsed.categories]
        if siblings:
            items, origin, relaxed = _search(db, user, prefs, base, parsed, message, mode, siblings)
        alternative_for = parsed.categories
    if not items:
        wanted = ", ".join(cat_names.get(c, c).lower() for c in parsed.categories)
        where = f" à {city.name}" if not gps else " près de toi"
        reply = (
            f"Je n'ai pas encore de lieu « {wanted} » référencé{where}. On complète la base chaque semaine : "
            "tu peux aussi nous proposer un lieu depuis l'app."
            if wanted
            else "Je n'ai trouvé aucun lieu dans notre base qui corresponde à ta demande pour l'instant."
        )
        return answer(reply, parsed=parsed)

    cards = to_cards(db, items, user, origin)
    reply = None
    if llm:
        facts = [
            {
                "nom": c.name,
                "quartier": c.district,
                "ville": c.city,
                "categories": [cat_names.get(x, x) for x in c.categories],
                "ambiances": c.ambiances,
                "budget_fcfa": [c.budget_min_fcfa, c.budget_max_fcfa] if c.budget_min_fcfa is not None else "inconnu",
                "note": c.rating_avg,
                "nb_avis": c.rating_count,
                "ouverture": {"open": "ouvert", "closed": "fermé en ce moment"}.get(c.open_status, "horaires inconnus"),
                "distance_vol_oiseau_km": c.distance_km,
                "description": c.short_description,
            }
            for c in cards
        ]
        reply = llm.compose(body.message, facts, alternative=bool(alternative_for))
        provider = llm.name if reply else "rules"
        if reply and mentions_foreign_place(db, reply, {c.name for c in cards}):
            reply = None  # garde-fou : un lieu hors sélection a été cité
    if not reply:
        reply, provider = rules_reply(parsed, cards, relaxed, alternative_for, cat_names), "rules"
    consume_concierge(db, user, today)
    return answer(reply, cards, parsed, provider, True)
