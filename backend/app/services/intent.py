"""Compréhension de requêtes en langage naturel, sans LLM (déterministe et testable)."""

import re
import unicodedata

from app.schemas import Parsed
from app.services import vocab

CATEGORY_WORDS = vocab.CATEGORY_WORDS
AMBIANCE_WORDS = vocab.AMBIANCE_WORDS
CHEAP_WORDS = ["pas cher", "moins cher", "petit budget", "economique", "abordable", "bon marche", "petit prix"]
NOW_WORDS = ["maintenant", "en ce moment", "tout de suite", "ouvert"]


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return f" {re.sub(r'[^a-z0-9 ]+', ' ', s)} "


def _has(text: str, word: str) -> bool:
    w = normalize(word).strip()
    return f" {w} " in text or (len(w) > 5 and w in text)


def parse_budget(text: str) -> int | None:
    m = re.search(r"(\d{1,3}(?:[ .]\d{3})+|\d+)\s*(k|mille|000)?\s*(?:f|fcfa|cfa|francs?)?\b", text)
    if not m:
        return None
    raw, suffix = m.group(1).replace(" ", "").replace(".", ""), m.group(2)
    value = int(raw)
    if suffix in ("k", "mille"):
        value *= 1000
    elif suffix == "000":
        value *= 1000
    # « 2 personnes » ou « 30 min » ne sont pas des budgets
    tail = text[m.end() : m.end() + 12]
    if any(t in tail for t in (" min", " h ", " heure", " pers", " km")) or value < 500:
        return None
    return value


def _distance(a: str, b: str, limit: int) -> int:
    """Distance d'édition (insertions, suppressions, substitutions, inversions), arrêtée au-delà de `limit`."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev2, prev = None, list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
            if prev2 is not None and i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        if min(cur) > limit:
            return limit + 1
        prev2, prev = prev, cur
    return prev[-1]


def fuzzy_categories(text: str) -> list[str]:
    """Fautes de frappe sur les mots-clés d'une seule partie (« boling », « karoke », « restaurent »)."""
    found = []
    tokens = [t for t in text.split() if len(t) >= 6]
    for cat, words in CATEGORY_WORDS.items():
        singles = [normalize(w).strip() for w in words if " " not in w.strip() and len(w.strip()) >= 6]
        for tok in tokens:
            if any(_distance(tok, w, 2 if len(w) >= 8 else 1) <= (2 if len(w) >= 8 else 1) for w in singles):
                found.append(cat)
                break
    return found


def parse(message: str, districts: dict[str, str] | None = None) -> Parsed:
    t = normalize(message)
    cats = [c for c, words in CATEGORY_WORDS.items() if any(_has(t, w) for w in words)]
    if not cats:
        cats = fuzzy_categories(t)
    ambs = [a for a, words in AMBIANCE_WORDS.items() if any(_has(t, w) for w in words)]
    budget = parse_budget(t)
    if budget is None and any(_has(t, w) for w in CHEAP_WORDS):
        budget = 10000
    district = None
    for name, slug in (districts or {}).items():
        if _has(t, normalize(name).strip()):
            district = slug
            break
    return Parsed(
        categories=cats,
        ambiances=ambs,
        budget_max_fcfa=budget,
        open_now=any(_has(t, w) for w in NOW_WORDS),
        q=None,
        district=district,
    )


CITY_ALIASES = {
    "bassam": "grand-bassam",
    "grand bassam": "grand-bassam",
    "assinie": "assinie",
    "assinie mafia": "assinie",
}


def find_city(message: str, cities: dict[str, str]) -> str | None:
    """Ville explicitement citée dans la demande (nom officiel ou alias courant)."""
    t = normalize(message)
    names = {normalize(n).strip(): slug for n, slug in cities.items()} | CITY_ALIASES
    for name in sorted(names, key=len, reverse=True):
        if f" {name} " in t:
            return names[name]
    return None
