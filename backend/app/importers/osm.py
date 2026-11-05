"""Import de lieux depuis OpenStreetMap (données ODbL, attribution « © OpenStreetMap contributors »).

    python -m app.importers.osm --city abidjan --fetch [--radius-km 25] [--publish]
    python -m app.importers.osm --city abidjan --file export.json [--publish]

Par défaut les lieux sont créés en « draft » (à valider en curation). Avec --publish, ils sont visibles
immédiatement avec un niveau de confiance modéré et sans date de vérification : l'application les
affiche comme « non vérifiés ». Rien n'est inventé : seuls les tags OSM présents sont repris.
Un lieu déjà importé (même identifiant OSM) est mis à jour, pas dupliqué."""

import argparse
import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import time

import httpx
from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, func, select

from app.db import SessionLocal
from app.models import City, DataSource, District, OpeningHours, Place, PlaceExternalId
from app.services.places import set_taxonomy, slugify

log = logging.getLogger(__name__)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TAG_MAP = {
    ("amenity", "restaurant"): "restaurant",
    ("amenity", "fast_food"): "maquis",  # affiné par osm_categories : chaînes et burgers → fast-food
    ("amenity", "food_court"): "maquis",
    ("amenity", "bar"): "bar",
    ("amenity", "pub"): "bar",
    ("amenity", "biergarten"): "bar",
    ("amenity", "cafe"): "cafe",
    ("amenity", "ice_cream"): "cafe",
    ("shop", "pastry"): "cafe",
    ("amenity", "nightclub"): "club",
    ("amenity", "hookah_lounge"): "lounge",
    ("amenity", "karaoke_box"): "karaoke",
    ("amenity", "cinema"): "cinema",
    ("amenity", "theatre"): "spectacle",
    ("amenity", "arts_centre"): "culture",
    ("tourism", "museum"): "musee",
    ("tourism", "gallery"): "musee",
    ("tourism", "attraction"): "activite",
    ("tourism", "zoo"): "nature",
    ("tourism", "theme_park"): "parc-loisirs",
    ("leisure", "park"): "nature",
    ("leisure", "garden"): "nature",
    ("leisure", "nature_reserve"): "nature",
    ("natural", "beach"): "plage",
    ("leisure", "beach_resort"): "plage",
    ("leisure", "bowling_alley"): "bowling",
    ("leisure", "amusement_arcade"): "jeux",
    ("leisure", "adult_gaming_centre"): "jeux",
    ("leisure", "miniature_golf"): "jeux",
    ("leisure", "water_park"): "parc-loisirs",
    ("leisure", "trampoline_park"): "parc-loisirs",
    ("leisure", "escape_game"): "escape-game",
    ("leisure", "swimming_pool"): "piscine",
    ("leisure", "sauna"): "spa",
    ("leisure", "golf_course"): "sport-loisir",
    ("leisure", "horse_riding"): "sport-loisir",
    ("leisure", "sports_centre"): "",  # retenu seulement pour les sports de loisir (voir SPORTS)
    ("shop", "massage"): "spa",
    ("amenity", "spa"): "spa",
}
# Centres sportifs : seuls les loisirs qu'on « sort » faire sont retenus (pas le football, l'athlétisme…).
SPORTS = {
    "10pin": "bowling",
    "9pin": "bowling",
    "bowling": "bowling",
    "karting": "karting",
    "motorsport": "karting",
    "paintball": "paintball",
    "laser_tag": "paintball",
    "swimming": "piscine",
    "padel": "sport-loisir",
    "sailing": "sport-loisir",
    "canoe": "sport-loisir",
    "golf": "sport-loisir",
    "equestrian": "sport-loisir",
    "billiards": "jeux",
    "escape_game": "escape-game",
}
# Mots du nom qui précisent un loisir (« International Club and Paintball Park », « Splash Park »…).
LEISURE_NAME_WORDS = {
    "bowling": "bowling",
    "bowl": "bowling",
    "kart": "karting",
    "karting": "karting",
    "superkart": "karting",
    "paintball": "paintball",
    "laser": "paintball",
    "piscine": "piscine",
    "splash": "parc-loisirs",
    "aqua": "parc-loisirs",
    "aquapark": "parc-loisirs",
    "enfants": "parc-loisirs",
    "kids": "parc-loisirs",
    "padel": "sport-loisir",
    "karaoke": "karaoke",
    "billard": "jeux",
    "escape": "escape-game",
    "spa": "spa",
    "massage": "spa",
}
FAST_FOOD_CUISINES = {"burger", "pizza", "chicken", "sandwich", "kebab", "fried_chicken", "hot_dog", "tacos"}


def osm_categories(tags: dict, name: str) -> list[str]:
    """Catégories d'un objet OSM, uniquement à partir de ses tags et des mots explicites de son nom."""
    cats = {c for (k, v), c in TAG_MAP.items() if c and tags.get(k) == v}
    toks = set(_tokens(name))
    if tags.get("shop") == "beauty" and tags.get("beauty") == "spa":
        cats.add("spa")
    if tags.get("leisure") == "swimming_pool" and tags.get("access") in ("private", "no", "residents"):
        cats.discard("piscine")
    if tags.get("amenity") == "fast_food" and (
        tags.get("brand") or FAST_FOOD_CUISINES & {c.strip() for c in (tags.get("cuisine") or "").split(";")}
    ):
        cats.discard("maquis")
        cats.add("fast-food")
    if tags.get("leisure") == "sports_centre" or cats & {"activite", "jeux", "parc-loisirs"}:
        sports = {s.strip() for s in (tags.get("sport") or "").split(";")}
        cats |= {SPORTS[s] for s in sports if s in SPORTS}
        cats |= {c for w, c in LEISURE_NAME_WORDS.items() if w in toks}
        if len(cats) > 1:
            cats.discard("activite")
    return sorted(cats)


GRADIENTS = {
    "restaurant": ["#5A2E1C", "#120C0A"],
    "maquis": ["#6B3A12", "#140D07"],
    "bar": ["#4C1E2E", "#130A0D"],
    "cafe": ["#5C4026", "#130F0A"],
    "club": ["#2A1450", "#0B0714"],
    "culture": ["#4A3A1A", "#120F08"],
    "nature": ["#1F4A32", "#0A140E"],
    "plage": ["#0F4C5C", "#08161B"],
    "activite": ["#2C3E6B", "#0B0F19"],
    "fast-food": ["#6B3A12", "#140D07"],
    "lounge": ["#3A2350", "#0F0B16"],
    "rooftop": ["#1E3A4C", "#0B1117"],
    "piscine": ["#0F4C5C", "#08161B"],
    "spa": ["#2E4A3F", "#0B1310"],
    "bowling": ["#2C3E6B", "#0B0F19"],
    "karting": ["#4A2C1E", "#130C08"],
    "paintball": ["#2F4A1F", "#0C130A"],
    "escape-game": ["#3A2350", "#0F0B16"],
    "karaoke": ["#5A1E3C", "#140810"],
    "jeux": ["#2C3E6B", "#0B0F19"],
    "sport-loisir": ["#1F3F4A", "#0A1215"],
    "parc-loisirs": ["#1F4A32", "#0A140E"],
    "cinema": ["#4A1E1E", "#130909"],
    "musee": ["#4A3A1A", "#120F08"],
    "spectacle": ["#5A1E3C", "#140810"],
}
DAYS = {"Mo": 0, "Tu": 1, "We": 2, "Th": 3, "Fr": 4, "Sa": 5, "Su": 6}


@dataclass
class OsmPlace:
    ref: str
    name: str
    lat: float
    lng: float
    categories: list[str]
    tags: dict
    excluded: bool = False  # pas un lieu de sortie (ambassade, école, terrain de sport…) : jamais publié


EXCLUDED_KEYS = {"embassy", "diplomatic", "office", "government", "military"}
EXCLUDED_AMENITIES = {
    "embassy",
    "school",
    "university",
    "college",
    "hospital",
    "clinic",
    "place_of_worship",
    "police",
    "townhall",
    "bank",
}
EXCLUDED_WORDS = {
    "ambassade",
    "embassy",
    "consulat",
    "ministere",
    "ministry",
    "prefecture",
    "mairie",
    "hopital",
    "chu",
    "clinique",
    "ecole",
    "lycee",
    "college",
    "universite",
    "eglise",
    "church",
    "mosquee",
    "temple",
    "paroisse",
    "cathedrale",
    "stade",
    "football",
    "terrain",
    "gendarmerie",
    "police",
    "camp",
    "caserne",
    "banque",
    "station",
    "residence",
    "cite",
    "presidentiel",
    "presidence",
    "communal",
    "agora",
    "achat",
}


# Catégories « fortes » : un maquis nommé « L'Ambassade » ou une cave « La Station » restent des lieux de sortie.
WORD_CHECK_CATEGORIES = {"nature", "activite", "culture", "piscine", "spa", "parc-loisirs", "jeux", "sport-loisir"}


def is_excluded(name: str, tags: dict, categories: list[str] | None = None) -> bool:
    if EXCLUDED_KEYS & set(tags) or tags.get("amenity") in EXCLUDED_AMENITIES:
        return True
    if any(k.startswith(("disused:", "abandoned:", "was:")) for k in tags) or re.match(r"(?i)(ex[- ]|ancien )", name):
        return True  # lieu fermé (« Ex-cinéma Benin »)
    if categories is not None and not set(categories) <= WORD_CHECK_CATEGORIES:
        return False
    toks = re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower())
    return bool(EXCLUDED_WORDS & set(toks))


def parse_elements(data: dict) -> list[OsmPlace]:
    out, seen = [], set()
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        name = (tags.get("name") or tags.get("name:fr") or "").strip()
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        cats = osm_categories(tags, name) if name else []
        ref = f"{el.get('type')}/{el.get('id')}"
        if name and lat is not None and lng is not None and cats and ref not in seen:
            seen.add(ref)
            out.append(OsmPlace(ref, name, float(lat), float(lng), cats, tags, is_excluded(name, tags, cats)))
    return out


def parse_hours(value: str | None) -> list[tuple[int, str, str]]:
    """Forme simple « Mo-Fr 08:00-18:00; Sa 09:00-13:00 » ou « 24/7 ». Toute autre forme → inconnu (on ne devine pas)."""
    if not value:
        return []
    if value.strip() == "24/7":
        return [(d, "00:00", "23:59") for d in range(7)]
    slots = []
    for part in value.split(";"):
        m = re.fullmatch(
            r"\s*(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*", part
        )
        if not m:
            return []
        a, b = DAYS[m.group(1)], DAYS[m.group(2) or m.group(1)]
        days = range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)]
        slots += [(d, m.group(3), m.group(4).replace("24:00", "23:59")) for d in days]
    return slots


GENERIC_WORDS = set(
    "maquis kiosque kiosk restaurant resto restau garbadrome garbadromme garbardrome garba bistrot bistro cave cafe express "
    "buvette traditionnelle traditionelle traditionnel cafetariat cafeteria cafétéria bar a au de du d la le les l des et "
    "africain africaine patisserie jardin vendeuse atieke attieke poisson poissons snack boisson boissons fast food "
    "alloco allocodrome braise brochette brochettes grillade grillades table tables coin espace point vente buvettes".split()
)
NAME_CATEGORIES = {
    "maquis": "maquis",
    "garba": "maquis",
    "allocodrome": "maquis",
    "lounge": "lounge",
    "rooftop": "rooftop",
    "plage": "plage",
    "beach": "plage",
    "night": "club",
    "nightclub": "club",
    "discotheque": "club",
    "cave": "bar",
    "chicha": "lounge",
    "toit": "rooftop",
    "shisha": "lounge",
    "karaoke": "karaoke",
    "cinema": "cinema",
}
CUISINES_FR = {
    "african": "africaine",
    "ivorian": "ivoirienne",
    "local": "locale",
    "regional": "locale",
    "french": "française",
    "lebanese": "libanaise",
    "italian": "italienne",
    "chinese": "chinoise",
    "japanese": "japonaise",
    "indian": "indienne",
    "seafood": "fruits de mer",
    "fish": "poisson",
    "chicken": "poulet",
    "grill": "grillades",
    "barbecue": "barbecue",
    "burger": "burgers",
    "pizza": "pizza",
    "sandwich": "sandwichs",
    "coffee_shop": "café",
    "brunch": "brunch",
    "steak_house": "viandes",
    "international": "internationale",
    "fast_food": "restauration rapide",
    "ice_cream": "glaces",
    "juice": "jus",
    "tea": "thé",
    "vegetarian": "végétarienne",
    "asian": "asiatique",
    "moroccan": "marocaine",
    "senegalese": "sénégalaise",
    "turkish": "turque",
    "mexican": "mexicaine",
    "sushi": "sushis",
    "kebab": "kebab",
}


def _tokens(name: str) -> list[str]:
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", n)


def is_generic_name(name: str) -> bool:
    """« Maquis », « Kiosque à café », « Buvette traditionnelle »… : pas de vrai nom, inutilisable tel quel."""
    toks = _tokens(name)
    letters = sum(c.isalpha() for c in name)
    return not toks or letters < 3 or all(t in GENERIC_WORDS for t in toks)


def tidy_name(name: str) -> str:
    """Majuscule initiale pour les noms saisis tout en minuscules (« espace Georges » → « Espace Georges »)."""
    name = " ".join(name.split())[:160]
    return name[:1].upper() + name[1:] if name == name.lower() else name


NAME_PATTERNS = [
    (r"\b(cinema|cine|pathe|majestic|canal olympia)\b", "cinema"),
    (r"\b(musee|museum|galerie|gallery)\b|art contemporain", "musee"),
    (r"\b(theatre|ki yi|palais de la culture)\b", "spectacle"),
    (r"\b(kids park|aire de jeux|parc d attractions?)\b", "parc-loisirs"),
]
GENERIC_CATEGORIES = {"culture", "activite", "nature"}


def name_categories(name: str) -> set[str]:
    toks = set(_tokens(name))
    flat = " ".join(_tokens(name))
    found = {
        cat
        for word, cat in NAME_CATEGORIES.items()
        if word in toks or any(t.startswith(word) for t in toks if len(word) > 4)
    }
    return found | {cat for pattern, cat in NAME_PATTERNS if re.search(pattern, flat)}


def refine_categories(categories: list[str] | set[str], name: str) -> list[str]:
    """Ajoute les catégories précises lisibles dans le nom ; retire alors la catégorie générique."""
    added = name_categories(name) - set(categories)
    cats = set(categories) | added
    if added - GENERIC_CATEGORIES:
        cats -= GENERIC_CATEGORIES
    return sorted(cats)


LABELS = {
    "restaurant": "Restaurant",
    "maquis": "Maquis",
    "fast-food": "Fast-food",
    "bar": "Bar",
    "cafe": "Café",
    "club": "Boîte de nuit",
    "lounge": "Lounge",
    "rooftop": "Rooftop",
    "culture": "Lieu culturel",
    "nature": "Espace naturel",
    "plage": "Plage",
    "activite": "Activité de loisirs",
    "piscine": "Piscine",
    "spa": "Spa et massage",
    "bowling": "Bowling",
    "karting": "Karting",
    "paintball": "Paintball",
    "escape-game": "Escape game",
    "karaoke": "Karaoké",
    "jeux": "Salle de jeux",
    "sport-loisir": "Sport loisir",
    "parc-loisirs": "Parc de loisirs",
    "cinema": "Cinéma",
    "musee": "Musée ou galerie",
    "spectacle": "Salle de spectacle",
    "evenement": "Événement",
}
# anciennes accroches génériques (à remplacer par une meilleure description quand elle existe)
LEGACY_LABELS = {"Restauration rapide / maquis", "Club", "Lieu"}


def describe(cats: list[str], tags: dict) -> tuple[str, str]:
    """Description factuelle construite uniquement à partir des tags présents."""
    order = [c for c in LABELS if c in cats]  # le plus précis d'abord (« Bowling » plutôt que « Activité »)
    specific = [c for c in order if c not in ("activite", "culture", "nature")] or order
    short = LABELS.get(specific[0], "Lieu") if specific else "Lieu"
    if tags.get("cuisine"):
        raw = [c.strip().lower() for c in tags["cuisine"].split(";") if c.strip()]
        fr = list(dict.fromkeys(CUISINES_FR.get(c, c.replace("_", " ")) for c in raw))[:4]
        short += " · cuisine " + ", ".join(fr)
    long = tags.get("description:fr") or tags.get("description") or ""
    return short[:280], long


def _first(value: str | None, max_len: int) -> str | None:
    """Les tags OSM peuvent contenir plusieurs valeurs séparées par « ; » : on garde la première."""
    if not value:
        return None
    return value.split(";")[0].strip()[:max_len] or None


def overpass_query(lat: float, lng: float, radius_m: int) -> str:
    filters = "".join(f'nwr["{k}"="{v}"]["name"](around:{radius_m},{lat},{lng});' for (k, v) in TAG_MAP)
    return f"[out:json][timeout:120];({filters});out center tags;"


def _nearest_district(db, city: City, lat: float, lng: float) -> District | None:
    point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326).cast(Geography)
    return db.scalar(
        select(District)
        .where(District.city_id == city.id, District.center.is_not(None), func.ST_DWithin(District.center, point, 6000))
        .order_by(func.ST_Distance(District.center, point))
        .limit(1)
    )


def _upsert(db, city: City, source, it: OsmPlace, publish: bool) -> tuple[Place, bool]:
    """Crée ou met à jour un lieu OSM. Retourne (lieu, créé ?)."""
    ext = db.scalar(
        select(PlaceExternalId).where(PlaceExternalId.provider == "osm", PlaceExternalId.external_id == it.ref)
    )
    place = db.get(Place, ext.place_id) if ext else None
    t = it.tags
    short, long = describe(it.categories, t)
    cats = refine_categories(it.categories, it.name)
    generic = is_generic_name(it.name)
    if it.excluded:
        if place is not None and place.verified_at is None:
            place.status = "archived"
        return place, False
    if place is None:
        slug, n = slugify(it.name), 1
        while db.scalar(select(Place.id).where(Place.slug == slug)):
            n += 1
            slug = f"{slugify(it.name)}-{n}"
        place = Place(
            slug=slug,
            name=it.name,
            city_id=city.id,
            is_demo=False,
            source_id=source.id,
            external_ref=it.ref,
            status="published" if publish and not generic else "draft",
            confidence=0.5 if publish else 0.4,
            cover_gradient=GRADIENTS.get(it.categories[0], ["#1E3A4C", "#0E0F13"]),
        )
        db.add(place)
    place.name, place.short_description, place.description = tidy_name(it.name), short, long
    if generic and place.verified_at is None:
        place.status = "draft"  # sans vrai nom : à nommer par la curation avant publication
    elif publish and place.status == "archived" and place.verified_at is None:
        place.status = "published"  # écarté à tort par une ancienne règle d'import : remis en ligne
    place.location = f"SRID=4326;POINT({it.lng} {it.lat})"
    district = _nearest_district(db, city, it.lat, it.lng)
    place.district_id = district.id if district else None
    place.website = _first(t.get("website") or t.get("contact:website"), 255)
    place.phone = _first(t.get("phone") or t.get("contact:phone") or t.get("contact:mobile"), 40)
    place.wheelchair = {"yes": True, "no": False}.get(t.get("wheelchair"))
    place.outdoor = True if t.get("outdoor_seating") == "yes" else None
    place.wifi = True if t.get("internet_access") in ("wlan", "yes") else None
    place.card_payment = True if t.get("payment:cards") == "yes" or t.get("payment:credit_cards") == "yes" else None
    place.has_parking = True if t.get("parking") or t.get("parking:fee") else None
    address = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
    place.address = address[:255] or None
    set_taxonomy(
        db,
        place,
        cats,
        ["plein-air"] if (place.outdoor or "plage" in cats or "nature" in cats) else [],
    )
    place.hours = [
        OpeningHours(weekday=d, opens=time.fromisoformat(a), closes=time.fromisoformat(b))
        for d, a, b in parse_hours(t.get("opening_hours"))
    ]
    db.flush()
    if ext is None:
        db.add(PlaceExternalId(place_id=place.id, provider="osm", external_id=it.ref))
    wd = t.get("wikidata")
    if wd and not db.scalar(
        select(PlaceExternalId.id).where(PlaceExternalId.provider == "wikidata", PlaceExternalId.external_id == wd)
    ):
        db.add(PlaceExternalId(place_id=place.id, provider="wikidata", external_id=wd))
    return place, ext is None


def archive_missing(db, city: City, kept_refs: set[str]) -> int:
    """Lieux OSM publiés absents de l'extrait (supprimés d'OSM, catégorie retirée, exclus) : archivés, jamais effacés."""
    from sqlalchemy import update

    source = db.scalar(select(DataSource).where(DataSource.kind == "osm"))
    n = db.execute(
        update(Place)
        .where(
            Place.city_id == city.id,
            Place.source_id == source.id,
            Place.status == "published",
            Place.verified_at.is_(None),
            Place.external_ref.not_in(kept_refs or {"__none__"}),
        )
        .values(status="archived")
    ).rowcount
    db.commit()
    return n


def import_places(db, city: City, items: list[OsmPlace], publish: bool = False) -> tuple[int, int]:
    source = db.scalar(select(DataSource).where(DataSource.kind == "osm"))
    created = updated = 0
    touched = []
    skipped = 0
    for it in items:
        try:
            with db.begin_nested():
                place, is_new = _upsert(db, city, source, it, publish)
            if place is None:  # exclu et jamais importé
                continue
        except Exception as e:  # une fiche OSM malformée ne bloque pas tout l'import
            skipped += 1
            log.warning("Lieu OSM ignoré %s : %s", it.ref, type(e).__name__)
            continue
        created, updated = created + is_new, updated + (not is_new and not it.excluded)
        touched.append(place.id)
    db.commit()
    if publish and touched:
        from app.services.rag import index_places

        index_places(db, touched)
    return created, updated


def fetch_overpass(lat: float, lng: float, radius_km: float) -> dict:
    r = httpx.post(
        OVERPASS_URL,
        data={"data": overpass_query(lat, lng, int(radius_km * 1000))},
        timeout=180,
        headers={"User-Agent": "sortie-importer/0.2 (contact: voir README)"},
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True)
    ap.add_argument("--file")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--radius-km", type=float, default=25)
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == args.city))
        if not city:
            raise SystemExit("Ville inconnue (lancer d'abord python -m app.seed)")
        if args.file:
            with open(args.file, encoding="utf-8") as f:
                data = json.load(f)
        elif args.fetch:
            g = cast(City.center, Geometry)
            lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == city.id)).one()
            data = fetch_overpass(lat, lng, args.radius_km)
        else:
            raise SystemExit("--file ou --fetch requis")
        created, updated = import_places(db, city, parse_elements(data), publish=args.publish)
        print(
            f"OSM {city.name} : {created} créés, {updated} mis à jour ({'publiés' if args.publish else 'brouillons'})"
        )


if __name__ == "__main__":
    main()
