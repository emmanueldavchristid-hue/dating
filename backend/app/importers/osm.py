"""Import de lieux depuis OpenStreetMap (données ODbL, attribution « © OpenStreetMap contributors »).

    python -m app.importers.osm --city abidjan --file export.json     # fichier JSON Overpass
    python -m app.importers.osm --city abidjan --fetch                # interroge l'API Overpass (respecter son usage)

Les lieux importés sont créés en statut « draft » (non publiés) et sans date de vérification :
ils doivent être validés par la curation avant d'apparaître. Rien n'est inventé : seuls les tags OSM
présents sont repris (nom, horaires simples, site, téléphone, accessibilité)."""

import argparse
import json
import re
from dataclasses import dataclass

import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.models import City, DataSource, OpeningHours, Place
from app.services.places import set_taxonomy, slugify

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# tag OSM -> catégorie interne
TAG_MAP = {
    ("amenity", "restaurant"): "restaurant",
    ("amenity", "fast_food"): "maquis",
    ("amenity", "bar"): "bar",
    ("amenity", "pub"): "bar",
    ("amenity", "cafe"): "cafe",
    ("amenity", "nightclub"): "club",
    ("amenity", "cinema"): "culture",
    ("amenity", "theatre"): "culture",
    ("amenity", "arts_centre"): "culture",
    ("tourism", "museum"): "culture",
    ("tourism", "gallery"): "culture",
    ("leisure", "park"): "nature",
    ("leisure", "garden"): "nature",
    ("natural", "beach"): "plage",
    ("leisure", "bowling_alley"): "activite",
    ("leisure", "amusement_arcade"): "activite",
    ("leisure", "sports_centre"): "activite",
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
    out = []
    for el in data.get("elements", []):
        tags = el.get("tags") or {}
        name = tags.get("name")
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        cats = sorted({c for (k, v), c in TAG_MAP.items() if tags.get(k) == v})
        if name and lat is not None and lng is not None and cats:
            out.append(OsmPlace(f"{el['type']}/{el['id']}", name.strip(), float(lat), float(lng), cats, tags))
    return out


def parse_hours(value: str | None) -> list[tuple[int, str, str]]:
    """Gère la forme simple « Mo-Fr 08:00-18:00; Sa 09:00-13:00 ». Toute forme plus complexe est ignorée (horaires inconnus)."""
    if not value or value.strip() == "24/7":
        return [(d, "00:00", "23:59") for d in range(7)] if value and value.strip() == "24/7" else []
    slots = []
    for part in value.split(";"):
        m = re.fullmatch(
            r"\s*(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*", part
        )
        if not m:
            return []  # format non géré : on préfère « inconnu » à une interprétation fausse
        a, b = DAYS[m.group(1)], DAYS[m.group(2) or m.group(1)]
        days = range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)]
        slots += [(d, m.group(3), m.group(4).replace("24:00", "23:59")) for d in days]
    return slots


def overpass_query(lat: float, lng: float, radius_m: int = 15000) -> str:
    filters = "".join(f'nwr["{k}"="{v}"]["name"](around:{radius_m},{lat},{lng});' for (k, v) in TAG_MAP)
    return f"[out:json][timeout:60];({filters});out center tags;"


def import_places(db, city: City, items: list[OsmPlace]) -> tuple[int, int]:
    from datetime import time

    source = db.scalar(select(DataSource).where(DataSource.kind == "osm"))
    created = skipped = 0
    for it in items:
        if db.scalar(select(Place.id).where(Place.external_ref == it.ref, Place.source_id == source.id)):
            skipped += 1
            continue
        slug, n = slugify(it.name), 1
        while db.scalar(select(Place.id).where(Place.slug == slug)):
            n += 1
            slug = f"{slugify(it.name)}-{n}"
        t = it.tags
        place = Place(
            slug=slug,
            name=it.name,
            city_id=city.id,
            location=f"SRID=4326;POINT({it.lng} {it.lat})",
            status="draft",
            is_demo=False,
            source_id=source.id,
            external_ref=it.ref,
            confidence=0.4,
            website=t.get("website") or t.get("contact:website"),
            phone=t.get("phone") or t.get("contact:phone"),
            wheelchair={"yes": True, "no": False}.get(t.get("wheelchair")),
            outdoor=True if t.get("outdoor_seating") == "yes" else None,
            address=" ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x) or None,
            cover_gradient=["#1E3A4C", "#0E0F13"],
        )
        set_taxonomy(db, place, it.categories, [])
        place.hours = [
            OpeningHours(weekday=d, opens=time.fromisoformat(a), closes=time.fromisoformat(b))
            for d, a, b in parse_hours(t.get("opening_hours"))
        ]
        db.add(place)
        created += 1
    db.commit()
    return created, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True)
    ap.add_argument("--file")
    ap.add_argument("--fetch", action="store_true")
    args = ap.parse_args()
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == args.city))
        if not city:
            raise SystemExit("Ville inconnue (lancer d'abord python -m app.seed)")
        if args.file:
            data = json.load(open(args.file, encoding="utf-8"))
        elif args.fetch:
            from geoalchemy2 import Geometry
            from sqlalchemy import cast, func

            g = cast(City.center, Geometry)
            lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == city.id)).one()
            r = httpx.post(
                OVERPASS_URL,
                data={"data": overpass_query(lat, lng)},
                timeout=90,
                headers={"User-Agent": "sortie-importer/0.1"},
            )
            r.raise_for_status()
            data = r.json()
        else:
            raise SystemExit("--file ou --fetch requis")
        created, skipped = import_places(db, city, parse_elements(data))
        print(f"OSM : {created} lieux créés en brouillon, {skipped} déjà présents")


if __name__ == "__main__":
    main()
