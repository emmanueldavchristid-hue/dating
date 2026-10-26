"""Compréhension de requêtes en langage naturel, sans LLM (déterministe et testable)."""
import re
import unicodedata

from app.schemas import Parsed

CATEGORY_WORDS = {
    "restaurant": ["restaurant", "resto", "diner", "dejeuner", "manger", "gastronom"],
    "maquis": ["maquis", "garba", "alloco", "braise", "poisson braise", "attieke"],
    "lounge": ["lounge", "chicha"],
    "rooftop": ["rooftop", "terrasse en hauteur", "toit", "vue panoramique"],
    "plage": ["plage", "mer", "sable", "baignade", "bord de mer"],
    "nature": ["nature", "parc", "foret", "jardin", "lagune", "randonnee", "vert"],
    "bar": ["bar", "verre", "cocktail", "biere", "apero"],
    "cafe": ["cafe", "coffee", "brunch", "the ", "patisserie"],
    "activite": ["activite", "jeu", "bowling", "karting", "escape", "sport", "loisir"],
    "culture": ["culture", "musee", "galerie", "expo", "art", "theatre", "cinema", "concert", "jazz", "musique"],
    "club": ["club", "boite", "danser", "soiree dansante", "nightclub"],
}
AMBIANCE_WORDS = {
    "calme": ["calme", "tranquille", "pose", "chill", "detente", "se detendre", "paisible"],
    "romantique": ["romantique", "en amoureux", "date", "couple", "a deux", "ma copine", "mon copain", "ma femme", "mon mari"],
    "festif": ["festif", "fete", "ambiance", "danser", "faire la fete", "bouger"],
    "entre-amis": ["entre amis", "entre potes", "avec des amis", "les gars", "groupe", "anniversaire"],
    "famille": ["famille", "enfants", "enfant", "kids", "parents"],
    "decouverte": ["decouvrir", "decouverte", "original", "insolite", "cache", "secret", "nouveau"],
    "plein-air": ["plein air", "dehors", "exterieur", "en plein air", "terrasse", "bord de l'eau", "au bord de l'eau"],
}
CHEAP_WORDS = ["pas cher", "petit budget", "economique", "abordable", "bon marche"]
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
    tail = text[m.end(): m.end() + 12]
    if any(t in tail for t in (" min", " h ", " heure", " pers", " km")) or value < 500:
        return None
    return value


def parse(message: str, districts: dict[str, str] | None = None) -> Parsed:
    t = normalize(message)
    cats = [c for c, words in CATEGORY_WORDS.items() if any(_has(t, w) for w in words)]
    ambs = [a for a, words in AMBIANCE_WORDS.items() if any(_has(t, w) for w in words)]
    budget = parse_budget(t)
    if budget is None and any(_has(t, w) for w in CHEAP_WORDS):
        budget = 10000
    district = None
    for name, slug in (districts or {}).items():
        if _has(t, normalize(name).strip()):
            district = slug
            break
    return Parsed(categories=cats, ambiances=ambs, budget_max_fcfa=budget,
                  open_now=any(_has(t, w) for w in NOW_WORDS), q=None, district=district)
