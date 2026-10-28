"""Import complet des données réelles, en une commande :

    python -m app.importers --cities abidjan,grand-bassam,assinie --publish --purge-demo

1. OpenStreetMap (Overpass) pour chaque ville  2. photos libres Wikidata/Commons
3. indexation RAG  4. (option) suppression des lieux de démonstration fictifs."""

import argparse

import httpx
from geoalchemy2 import Geometry
from sqlalchemy import cast, delete, func, select

from app.db import SessionLocal
from app.importers import osm, wikimedia
from app.models import City, Place
from app.services.rag import index_places


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", default="abidjan,grand-bassam,assinie")
    ap.add_argument("--radius-km", type=float, default=25)
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--purge-demo", action="store_true")
    args = ap.parse_args()
    with SessionLocal() as db:
        for slug in args.cities.split(","):
            city = db.scalar(select(City).where(City.slug == slug.strip()))
            if not city:
                print(f"Ville inconnue ignorée : {slug}")
                continue
            g = cast(City.center, Geometry)
            lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(City.id == city.id)).one()
            radius = args.radius_km if slug == "abidjan" else min(args.radius_km, 12)
            created, updated = osm.import_places(db, city, osm.parse_elements(osm.fetch_overpass(lat, lng, radius)), publish=args.publish)
            print(f"OSM {city.name} : {created} créés, {updated} mis à jour")
        with httpx.Client(timeout=30, headers=wikimedia.UA) as client:
            print(f"Photos libres : {wikimedia.enrich(db, client, limit=5000)}")
        if args.purge_demo:
            n = db.execute(delete(Place).where(Place.is_demo.is_(True))).rowcount
            db.commit()
            print(f"Lieux de démonstration supprimés : {n}")
        print(f"Indexation RAG : {index_places(db, rebuild=True)} lieux")


if __name__ == "__main__":
    main()
