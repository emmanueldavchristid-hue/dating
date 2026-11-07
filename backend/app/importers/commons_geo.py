"""Association prudente de photos géolocalisées Wikimedia Commons aux lieux.

    python -m app.importers.commons_geo --from-file sortie-commons.json

Une photo n'est rattachée à un lieu que si (1) sa licence est libre, (2) elle a été prise à moins de
150 m du lieu et (3) son titre contient un mot distinctif du nom du lieu (pas « restaurant », « bar »…).
Mieux vaut pas de photo qu'une photo d'un autre endroit."""

import argparse
import json
import re
import unicodedata

from geoalchemy2 import Geography
from sqlalchemy import func, select

from app.db import SessionLocal
from app.importers.osm import GENERIC_WORDS
from app.importers.wikidata import attach_photo
from app.importers.wikimedia import images_from_pages
from app.models import Place

MAX_DISTANCE_M = 150
STOP = {
    "chez",
    "les",
    "des",
    "the",
    "and",
    "club",
    "city",
    "cote",
    "ivoire",
    "abidjan",
    "bassam",
    "grand",
    "assinie",
    "plateau",
    "cocody",
}


def _tokens(text: str) -> set[str]:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return set(re.findall(r"[a-z0-9]+", t))


def distinctive(name: str) -> set[str]:
    return {t for t in _tokens(name) if len(t) >= 4 and t not in GENERIC_WORDS and t not in STOP}


def title_matches(place_name: str, file_title: str) -> bool:
    words = distinctive(place_name)
    if not words:
        return False
    found = words & _tokens(re.sub(r"\.(jpe?g|png|tiff?|webp)$", "", file_title, flags=re.I))
    return len(found) >= min(2, len(words))


def match_photos(db, files: dict[str, dict]) -> int:
    attached = 0
    for title, f in files.items():
        page = f.get("page")
        if not page:
            continue
        info = images_from_pages({title: page}).get(title.removeprefix("File:"))
        if not info:
            continue
        point = func.ST_SetSRID(func.ST_MakePoint(f["lng"], f["lat"]), 4326).cast(Geography)
        candidates = db.scalars(
            select(Place)
            .where(
                Place.status == "published",
                Place.cover_url.is_(None),
                Place.cover_key.is_(None),
                func.ST_DWithin(Place.location, point, MAX_DISTANCE_M),
            )
            .order_by(func.ST_Distance(Place.location, point))
            .limit(20)
        ).all()
        for place in candidates:
            if title_matches(place.name, title):
                attach_photo(db, place, info)
                attached += 1
                break
    db.commit()
    return attached


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-file", required=True)
    args = ap.parse_args()
    with open(args.from_file, encoding="utf-8") as fh, SessionLocal() as db:
        print(f"Photos Commons rattachées : {match_photos(db, json.load(fh))}")


if __name__ == "__main__":
    main()
