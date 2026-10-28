"""Import de lieux depuis OpenStreetMap (données ODbL, attribution « © OpenStreetMap contributors »).

    python -m app.importers.osm --city abidjan --fetch [--radius-km 25] [--publish]
    python -m app.importers.osm --city abidjan --file export.json [--publish]

Par défaut les lieux sont créés en « draft » (à valider en curation). Avec --publish, ils sont visibles
immédiatement avec un niveau de confiance modéré et sans date de vérification : l'application les
affiche comme « non vérifiés ». Rien n'est inventé : seuls les tags OSM présents sont repris.
Un lieu déjà importé (même identifiant OSM) est mis à jour, pas dupliqué."""

import argparse
import json
import re
from dataclasses import dataclass
from datetime import time

import httpx
from geoalchemy2 import Geography, Geometry
from sqlalchemy import cast, func, select

from app.db import SessionLocal
from app.models import City, DataSource, District, OpeningHours, Place, PlaceExternalId
from app.services.places import set_taxonomy, slugify

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TAG_MAP = {
    ("amenity", "restaurant"): "restaurant",
    ("amenity", "fast_food"): "maquis",
    ("amenity", "food_court"): "maquis",
    ("amenity", "bar"): "bar",
    ("amenity", "pub"): "bar",
    ("amenity", "biergarten"): "bar",
    ("amenity", "cafe"): "cafe",
    ("amenity", "ice_cream"): "cafe",
    ("shop", "pastry"): "cafe",
    ("amenity", "nightclub"): "club",
    ("amenity", "cinema"): "culture",
    ("amenity", "theatre"): "culture",
    ("amenity", "arts_centre"): "culture",
    ("tourism", "museum"): "culture",
    ("tourism", "gallery"): "culture",
    ("tourism", "attraction"): "activite",
    ("tourism", "zoo"): "nature",
    ("leisure", "park"): "nature",
    ("leisure", "garden"): "nature",
    ("leisure", "nature_reserve"): "nature",
    ("natural", "beach"): "plage",
    ("leisure", "beach_resort"): "plage",
    ("leisure", "bowling_alley"): "activite",
    ("leisure", "amusement_arcade"): "activite",
    ("leisure", "water_park"): "activite",
    ("leisure", "escape_game"): "activite",
    ("leisure", "sports_centre"): "activite",
}
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


def parse_elements(data: dict) -> list[OsmPlace]:
    out, seen = [], set()
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        name = (tags.get("name") or tags.get("name:fr") or "").strip()
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        cats = sorted({c for (k, v), c in TAG_MAP.items() if tags.get(k) == v})
        ref = f"{el.get('type')}/{el.get('id')}"
        if name and lat is not None and lng is not None and cats and ref not in seen:
            seen.add(ref)
            out.append(OsmPlace(ref, name, float(lat), float(lng), cats, tags))
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


def describe(cats: list[str], tags: dict) -> tuple[str, str]:
    """Description factuelle construite uniquement à partir des tags présents."""
    labels = {
        "restaurant": "Restaurant",
        "maquis": "Restauration rapide / maquis",
        "bar": "Bar",
        "cafe": "Café",
        "club": "Club",
        "culture": "Lieu culturel",
        "nature": "Espace naturel",
        "plage": "Plage",
        "activite": "Activité de loisirs",
    }
    short = labels.get(cats[0], "Lieu")
    if tags.get("cuisine"):
        short += " · cuisine " + tags["cuisine"].replace(";", ", ").replace("_", " ")
    long = tags.get("description:fr") or tags.get("description") or ""
    return short[:280], long


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


def import_places(db, city: City, items: list[OsmPlace], publish: bool = False) -> tuple[int, int]:
    source = db.scalar(select(DataSource).where(DataSource.kind == "osm"))
    created = updated = 0
    touched = []
    for it in items:
        ext = db.scalar(
            select(PlaceExternalId).where(PlaceExternalId.provider == "osm", PlaceExternalId.external_id == it.ref)
        )
        place = db.get(Place, ext.place_id) if ext else None
        t = it.tags
        short, long = describe(it.categories, t)
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
                status="published" if publish else "draft",
                confidence=0.5 if publish else 0.4,
                cover_gradient=GRADIENTS.get(it.categories[0], ["#1E3A4C", "#0E0F13"]),
            )
            db.add(place)
            created += 1
        else:
            updated += 1
        place.name, place.short_description, place.description = it.name, short, long
        place.location = f"SRID=4326;POINT({it.lng} {it.lat})"
        district = _nearest_district(db, city, it.lat, it.lng)
        place.district_id = district.id if district else None
        place.website = t.get("website") or t.get("contact:website")
        place.phone = t.get("phone") or t.get("contact:phone")
        place.wheelchair = {"yes": True, "no": False}.get(t.get("wheelchair"))
        place.outdoor = True if t.get("outdoor_seating") == "yes" else None
        place.wifi = True if t.get("internet_access") in ("wlan", "yes") else None
        place.card_payment = True if t.get("payment:cards") == "yes" or t.get("payment:credit_cards") == "yes" else None
        place.has_parking = True if t.get("parking") or t.get("parking:fee") else None
        address = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
        place.address = address or None
        set_taxonomy(
            db,
            place,
            it.categories,
            ["plein-air"] if (place.outdoor or "plage" in it.categories or "nature" in it.categories) else [],
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
