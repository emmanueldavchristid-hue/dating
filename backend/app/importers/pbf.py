"""Import OpenStreetMap depuis un extrait PBF (Geofabrik), sans dépendre du serveur Overpass.

    python -m app.importers.pbf --download                       # télécharge l'extrait Côte d'Ivoire (~100 Mo)
    python -m app.importers.pbf --file ivory-coast-latest.osm.pbf --cities abidjan,grand-bassam,assinie --publish

Le fichier est lu localement ; seuls les objets nommés correspondant aux catégories (TAG_MAP) et situés
dans le rayon de chaque ville sont importés, puis traités comme l'import Overpass (mise à jour sans doublon)."""

import argparse
import math
from pathlib import Path

import httpx
import osmium
from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select

from app.db import SessionLocal
from app.importers import osm
from app.models import City

GEOFABRIK_URL = "https://download.geofabrik.de/africa/ivory-coast-latest.osm.pbf"
KEYS = {k for k, _ in osm.TAG_MAP}


def _wanted(tags) -> bool:
    return "name" in tags and any((k, tags.get(k)) in osm.TAG_MAP for k in KEYS if k in tags)


class Collector(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.elements: list[dict] = []

    def node(self, n):
        if _wanted(n.tags):
            self.elements.append(
                {"type": "node", "id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": dict(n.tags)}
            )

    def way(self, w):
        if not _wanted(w.tags):
            return
        pts = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
        if pts:
            lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            self.elements.append({"type": "way", "id": w.id, "center": {"lat": lat, "lon": lon}, "tags": dict(w.tags)})


def read_pbf(path: str) -> list[dict]:
    c = Collector()
    c.apply_file(path, locations=True, idx="flex_mem")
    return c.elements


def _km(lat1, lon1, lat2, lon2) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lon1, lat2, lon2))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def within(elements: list[dict], lat: float, lng: float, radius_km: float) -> list[dict]:
    out = []
    for el in elements:
        p = (el.get("lat"), el.get("lon")) if "lat" in el else (el["center"]["lat"], el["center"]["lon"])
        if _km(lat, lng, *p) <= radius_km:
            out.append(el)
    return out


def download(dest: Path) -> Path:
    with httpx.stream(
        "GET", GEOFABRIK_URL, timeout=600, follow_redirects=True, headers={"User-Agent": "sortie-importer/0.2"}
    ) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
    return dest


def import_cities(
    db, elements: list[dict], cities: list[str], radius_km: float, publish: bool
) -> dict[str, tuple[int, int]]:
    report = {}
    for slug in cities:
        city = db.scalar(select(City).where(City.slug == slug))
        if not city:
            continue
        g = cast(City.center, Geometry)
        lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == city.id)).one()
        radius = radius_km if slug == "abidjan" else min(radius_km, 12)
        items = osm.parse_elements({"elements": within(elements, lat, lng, radius)})
        report[slug] = osm.import_places(db, city, items, publish=publish)
        archived = osm.archive_missing(db, city, {i.ref for i in items if not i.excluded})
        if archived:
            print(f"{slug} : {archived} lieux archivés (plus des lieux de sortie ou retirés d'OSM)")
    return report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="data/ivory-coast-latest.osm.pbf")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--cities", default="abidjan,grand-bassam,assinie")
    ap.add_argument("--radius-km", type=float, default=25)
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    path = Path(args.file)
    if args.download:
        path.parent.mkdir(parents=True, exist_ok=True)
        download(path)
        print(f"Extrait téléchargé : {path} ({path.stat().st_size // 1_000_000} Mo)")
    elements = read_pbf(str(path))
    print(f"{len(elements)} objets OSM pertinents dans l'extrait")
    with SessionLocal() as db:
        for slug, (created, updated) in import_cities(
            db, elements, args.cities.split(","), args.radius_km, args.publish
        ).items():
            print(f"{slug} : {created} créés, {updated} mis à jour")


if __name__ == "__main__":
    main()
