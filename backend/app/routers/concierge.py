from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.adapters.llm import get_llm
from app.config import get_settings
from app.deps import DB, CurrentUser
from app.errors import ApiError
from app.models import Ambiance, Category, City, District
from app.ratelimit import limit
from app.schemas import ConciergeIn, ConciergeOut, PlaceCard, Quota
from app.services import intent
from app.services.entitlements import can_see_premium, consume_concierge
from app.services.hours import local_now
from app.services.search import SearchParams, run_search, to_cards

router = APIRouter(tags=["concierge"])


def _fmt_fcfa(v: int) -> str:
    return f"{v:,}".replace(",", " ") + " FCFA"


def rules_reply(parsed, cards: list[PlaceCard], relaxed: list[str]) -> str:
    if not cards:
        return (
            "Je n'ai trouvé aucun lieu dans notre base qui corresponde à ta demande. "
            "Essaie d'élargir le budget, la zone ou les ambiances."
        )
    lines = []
    intro = "Voici ce que je te propose"
    if parsed.budget_max_fcfa:
        intro += f", avec un budget d'environ {_fmt_fcfa(parsed.budget_max_fcfa)} max"
    lines.append(intro + " :")
    for c in cards:
        bits = []
        if c.distance_km is not None:
            bits.append(f"{c.distance_km} km à vol d'oiseau")
        if c.budget_min_fcfa is not None and c.budget_max_fcfa is not None:
            bits.append(f"{_fmt_fcfa(c.budget_min_fcfa)} – {_fmt_fcfa(c.budget_max_fcfa)}")
        bits.append(
            {"open": "ouvert maintenant", "closed": "fermé en ce moment"}.get(c.open_status, "horaires non vérifiés")
        )
        lines.append(f"• {c.name} — {', '.join(bits)}.")
    if relaxed:
        lines.append("J'ai dû assouplir : " + ", ".join(relaxed) + ".")
    return "\n".join(lines)


@router.post("/concierge", response_model=ConciergeOut, dependencies=[Depends(limit("concierge", 20))])
def concierge(body: ConciergeIn, db: DB, user: CurrentUser):
    s = get_settings()
    if (body.lat is None) != (body.lng is None):
        raise ApiError(400, "invalid_location", "lat et lng doivent être fournis ensemble")
    used, quota = consume_concierge(db, user, local_now(s.timezone).date())
    city_slug = body.city or (user.preferences.home_city if user.preferences else None) or s.default_city
    city = db.scalar(select(City).where(City.slug == city_slug))
    districts = (
        {d.name: d.slug for d in db.scalars(select(District).where(District.city_id == city.id))} if city else {}
    )

    llm, provider = get_llm(), "rules"
    parsed = intent.parse(body.message, districts)
    if llm:
        cats, ambs = list(db.scalars(select(Category.slug))), list(db.scalars(select(Ambiance.slug)))
        extracted = llm.extract(body.message, cats, ambs)
        if extracted:
            extracted.district = parsed.district
            parsed, provider = extracted, llm.name

    tiers = ("free", "premium") if can_see_premium(user) else ("free",)
    base = {
        "lat": body.lat,
        "lng": body.lng,
        "city": None if body.lat is not None else city_slug,
        "district": parsed.district if body.lat is None else None,
        "tiers": tiers,
        "page_size": 3,
        "q": parsed.q,
    }
    attempts = [
        ({}, []),
        ({"ambiances": []}, ["les ambiances"]),
        ({"ambiances": [], "open_now": False}, ["les ambiances", "l'ouverture immédiate"]),
        (
            {"ambiances": [], "open_now": False, "district": None, "q": None},
            ["les ambiances", "l'ouverture immédiate", "le quartier"],
        ),
    ]
    items, origin, relaxed = [], None, []
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
        items, _, origin = run_search(db, params, user)
        if items:
            break
    cards = to_cards(db, items, user, origin) if items else []

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
                "description": c.short_description,
            }
            for c in cards
        ]
        reply = llm.compose(body.message, facts)
    if not reply:
        reply, provider = rules_reply(parsed, cards, relaxed), ("rules" if provider == "rules" else provider)
    return ConciergeOut(
        reply=reply, places=cards, parsed=parsed, provider=provider, quota=Quota(used=used, limit=quota)
    )
