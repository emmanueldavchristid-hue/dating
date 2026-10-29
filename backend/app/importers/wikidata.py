"""Lieux réels depuis Wikidata (données CC0), avec photo libre Commons quand elle existe.

    python -m app.importers.wikidata --cities abidjan,grand-bassam,assinie [--publish]

Recherche géographique (`nearcoord`) restreinte aux types de lieux de sortie (musées, parcs, plages,
restaurants, bars, clubs, salles…). Seuls les faits présents sur Wikidata sont repris (nom, description,
coordonnées, site web, image). Les requêtes sont espacées et ralentissent en cas de limitation (429),
conformément aux règles d'usage de Wikimedia."""

import argparse
import time

import httpx
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select

from app.db import SessionLocal
from app.importers import osm
from app.importers.wikimedia import file_info, images_from_pages
from app.models import City, DataSource, Media, Place, PlaceExternalId
from app.services.places import set_taxonomy, slugify

API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "SortieImporter/0.2 (https://github.com/emmanueldavchristid-hue/dating) python-httpx"}
TYPES = {
    "Q33506": "culture",
    "Q207694": "culture",
    "Q1007870": "culture",
    "Q24354": "culture",
    "Q41253": "culture",
    "Q1329623": "culture",
    "Q22698": "nature",
    "Q22746": "nature",
    "Q167346": "nature",
    "Q43501": "nature",
    "Q46169": "nature",
    "Q179049": "nature",
    "Q40080": "plage",
    "Q11707": "restaurant",
    "Q187456": "bar",
    "Q622425": "club",
    "Q194195": "activite",
    "Q570116": "activite",
}


class Polite:
    """Client espacé : 4 s entre requêtes, attente croissante sur 429/503 (Retry-After respecté)."""

    def __init__(self, client: httpx.Client, pause: float = 4.0) -> None:
        self.client, self.pause, self.last = client, pause, 0.0

    def get(self, url: str, params: dict) -> dict:
        wait = 15.0
        for _ in range(12):
            delta = time.monotonic() - self.last
            if delta < self.pause:
                time.sleep(self.pause - delta)
            self.last = time.monotonic()
            r = self.client.get(url, params={**params, "format": "json", "maxlag": 5})
            if r.status_code in (403, 429, 503) or "maxlag" in r.text[:200]:
                time.sleep(float(r.headers.get("Retry-After") or wait))
                wait = min(wait * 2, 300)
                continue
            r.raise_for_status()
            return r.json()
        raise RuntimeError("Wikidata indisponible après plusieurs tentatives (limitation de débit)")


def search_ids(api: Polite, lat: float, lng: float, radius_km: float) -> list[str]:
    types = "|".join(f"P31={q}" for q in TYPES)
    ids, offset = [], 0
    while offset is not None and offset < 1000:
        d = api.get(
            API,
            {
                "action": "query",
                "list": "search",
                "srlimit": 50,
                "sroffset": offset,
                "srsearch": f"nearcoord:{radius_km}km,{lat},{lng} haswbstatement:{types}",
            },
        )
        ids += [r["title"] for r in d.get("query", {}).get("search", [])]
        offset = (d.get("continue") or {}).get("sroffset")
    return ids


def _claim(ent: dict, prop: str):
    c = ent.get("claims", {}).get(prop) or []
    return c[0]["mainsnak"].get("datavalue", {}).get("value") if c else None


def parse_entities(entities: dict) -> list[dict]:
    """Entités Wikidata brutes -> lieux de sortie géolocalisés (types filtrés, rien d'inventé)."""
    out = []
    for qid, ent in entities.items():
        coord = _claim(ent, "P625")
        label = (ent.get("labels", {}).get("fr") or ent.get("labels", {}).get("en") or {}).get("value")
        types = [
            c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in ent.get("claims", {}).get("P31", [])
        ]
        cats = sorted({TYPES[t] for t in types if t in TYPES})
        if not (coord and label and cats):
            continue
        out.append(
            {
                "qid": qid,
                "name": label,
                "lat": coord["latitude"],
                "lng": coord["longitude"],
                "categories": cats,
                "description": (ent.get("descriptions", {}).get("fr") or {}).get("value", ""),
                "image": _claim(ent, "P18"),
                "website": _claim(ent, "P856"),
            }
        )
    return out


def fetch_entities(api: Polite, ids: list[str]) -> list[dict]:
    out = []
    for i in range(0, len(ids), 50):
        d = api.get(
            API,
            {
                "action": "wbgetentities",
                "ids": "|".join(ids[i : i + 50]),
                "props": "labels|descriptions|claims",
                "languages": "fr|en",
            },
        )
        out += parse_entities(d.get("entities", {}))
    return out


def import_entities(db, city: City, items: list[dict], images: dict[str, dict], publish: bool) -> tuple[int, int]:
    source = db.scalar(
        select(DataSource).where(DataSource.kind == "curated", DataSource.name == "Wikidata")
    ) or DataSource(
        kind="curated", name="Wikidata", license="CC0", attribution="Wikidata (CC0) · photos Wikimedia Commons"
    )
    db.add(source)
    db.flush()
    created = updated = 0
    touched = []
    for it in items:
        ext = db.scalar(
            select(PlaceExternalId).where(
                PlaceExternalId.provider == "wikidata", PlaceExternalId.external_id == it["qid"]
            )
        )
        place = db.get(Place, ext.place_id) if ext else None
        if place is not None and place.source_id != source.id:
            continue  # déjà importé par OSM : on n'écrase pas, l'enrichissement photo s'en charge
        if place is None:
            slug, n = slugify(it["name"]), 1
            while db.scalar(select(Place.id).where(Place.slug == slug)):
                n += 1
                slug = f"{slugify(it['name'])}-{n}"
            place = Place(
                slug=slug,
                city_id=city.id,
                is_demo=False,
                source_id=source.id,
                external_ref=it["qid"],
                status="published" if publish else "draft",
                confidence=0.5,
                cover_gradient=osm.GRADIENTS.get(it["categories"][0], ["#1E3A4C", "#0E0F13"]),
            )
            db.add(place)
            created += 1
        else:
            updated += 1
        place.name = it["name"]
        desc = it["description"][:1].upper() + it["description"][1:] if it["description"] else ""
        place.short_description = desc[:280]
        place.location = f"SRID=4326;POINT({it['lng']} {it['lat']})"
        district = osm._nearest_district(db, city, it["lat"], it["lng"])
        place.district_id = district.id if district else None
        place.website = it["website"]
        set_taxonomy(db, place, it["categories"], ["plein-air"] if set(it["categories"]) & {"plage", "nature"} else [])
        db.flush()
        if ext is None:
            db.add(PlaceExternalId(place_id=place.id, provider="wikidata", external_id=it["qid"]))
        info = images.get((it["image"] or "").replace("_", " "))
        if info and not place.cover_url:
            db.add(
                Media(
                    place_id=place.id,
                    source_url=info["url"],
                    alt=f"Photo de {place.name}",
                    license=info["license"],
                    credit=f"{info['artist']} · {info['license']} · Wikimedia Commons"[:160],
                    width=info["width"],
                    height=info["height"],
                )
            )
            place.cover_url = info["url"]
        touched.append(place.id)
    db.commit()
    if publish and touched:
        from app.services.rag import index_places

        index_places(db, touched)
    return created, updated


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", default="abidjan,grand-bassam,assinie")
    ap.add_argument("--radius-km", type=float, default=25)
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--from-file", help="JSON produit par scripts/fetch_wikidata.py (collecte faite ailleurs)")
    args = ap.parse_args()
    if args.from_file:
        import json

        with open(args.from_file, encoding="utf-8") as f, SessionLocal() as db:
            for slug, block in json.load(f).items():
                city = db.scalar(select(City).where(City.slug == slug))
                if not city:
                    continue
                items = parse_entities(block["entities"])
                images = images_from_pages(block["images"])
                created, updated = import_entities(db, city, items, images, args.publish)
                print(f"Wikidata {city.name} : {created} créés, {updated} mis à jour, {len(images)} photos libres")
        return
    with SessionLocal() as db, httpx.Client(timeout=60, headers=UA) as client:
        api = Polite(client)
        for slug in args.cities.split(","):
            city = db.scalar(select(City).where(City.slug == slug))
            if not city:
                continue
            g = cast(City.center, Geometry)
            lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == city.id)).one()
            ids = search_ids(api, lat, lng, args.radius_km if slug == "abidjan" else 10)
            items = fetch_entities(api, ids)
            files = [it["image"] for it in items if it["image"]]
            images = {}
            for i in range(0, len(files), 40):
                time.sleep(1.5)
                images |= file_info(client, files[i : i + 40])
            created, updated = import_entities(db, city, items, images, args.publish)
            print(
                f"Wikidata {city.name} : {len(ids)} trouvés, {created} créés, {updated} mis à jour, {len(images)} photos libres"
            )


if __name__ == "__main__":
    main()
