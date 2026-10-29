"""Photos sous licence libre depuis Wikidata / Wikimedia Commons.

    python -m app.importers.wikimedia [--limit 500]

Pour chaque lieu lié à Wikidata (tag OSM `wikidata`) sans photo : image principale (propriété P18)
→ métadonnées Commons (URL, licence, auteur). Seules les images sous licence libre (CC0, CC BY,
CC BY-SA, domaine public) sont retenues ; l'auteur et la licence sont affichés avec la photo.
Le fichier n'est pas copié : l'URL Commons est utilisée directement, comme le permet Wikimedia."""

import argparse
import re

import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.models import Media, Place, PlaceExternalId

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "SortieImporter/0.2 (https://github.com/emmanueldavchristid-hue/dating) python-httpx"}
FREE = re.compile(r"^(cc0|cc[- ]by(-sa)?([- ][0-9.]+)?|public domain|pd.*)$", re.I)


def _get(client: httpx.Client, url: str, params: dict) -> dict:
    """GET avec respect des limitations Wikimedia (429/503 : attente croissante, Retry-After)."""
    import time

    wait = 5.0
    for _ in range(8):
        r = client.get(url, params=params)
        if r.status_code in (429, 503):
            time.sleep(float(r.headers.get("Retry-After") or wait))
            wait = min(wait * 2, 120)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("Wikimedia indisponible après plusieurs tentatives")


def _strip_html(s: str | None) -> str | None:
    return re.sub(r"<[^>]+>", "", s).strip() if s else None


def image_files(client: httpx.Client, qids: list[str]) -> dict[str, str]:
    """QID -> nom du fichier Commons (P18)."""
    out = {}
    for i in range(0, len(qids), 50):
        data = _get(
            client,
            WIKIDATA_API,
            {"action": "wbgetentities", "ids": "|".join(qids[i : i + 50]), "props": "claims", "format": "json"},
        )
        for qid, ent in data.get("entities", {}).items():
            claims = ent.get("claims", {}).get("P18", [])
            if claims:
                out[qid] = claims[0]["mainsnak"]["datavalue"]["value"]
    return out


def file_info(client: httpx.Client, filenames: list[str]) -> dict[str, dict]:
    """Nom de fichier -> {url, license, artist, width, height} pour les seules licences libres."""
    out = {}
    for i in range(0, len(filenames), 40):
        data = _get(
            client,
            COMMONS_API,
            {
                "action": "query",
                "titles": "|".join(f"File:{f}" for f in filenames[i : i + 40]),
                "prop": "imageinfo",
                "iiprop": "url|extmetadata|size",
                "iiurlwidth": 1280,
                "format": "json",
            },
        )
        pages = data.get("query", {}).get("pages", {})
        norm = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for page in pages.values():
            info = (page.get("imageinfo") or [None])[0]
            if not info:
                continue
            meta = info.get("extmetadata", {})
            lic = (meta.get("LicenseShortName") or {}).get("value", "")
            if not FREE.match(lic.strip()):
                continue
            title = norm.get(page["title"], page["title"]).removeprefix("File:")
            out[title] = {
                "url": info.get("thumburl") or info["url"],
                "license": lic[:80],
                "artist": (_strip_html((meta.get("Artist") or {}).get("value")) or "Auteur inconnu")[:120],
                "width": info.get("thumbwidth") or info.get("width"),
                "height": info.get("thumbheight") or info.get("height"),
            }
    return out


def enrich(db, client: httpx.Client, limit: int = 500) -> int:
    rows = db.execute(
        select(Place, PlaceExternalId.external_id)
        .join(PlaceExternalId, PlaceExternalId.place_id == Place.id)
        .where(PlaceExternalId.provider == "wikidata", Place.cover_url.is_(None), Place.cover_key.is_(None))
        .limit(limit)
    ).all()
    if not rows:
        return 0
    files = image_files(client, [qid for _, qid in rows])
    infos = file_info(client, list(set(files.values())))
    added = 0
    for place, qid in rows:
        info = infos.get(files.get(qid, "").replace("_", " ")) or infos.get(files.get(qid, ""))
        if not info:
            continue
        credit = f"{info['artist']} · {info['license']} · Wikimedia Commons"
        db.add(
            Media(
                place_id=place.id,
                source_url=info["url"],
                alt=f"Photo de {place.name}",
                credit=credit[:160],
                license=info["license"],
                width=info["width"],
                height=info["height"],
                position=0,
            )
        )
        place.cover_url = info["url"]
        added += 1
    db.commit()
    return added


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=500)
    args = ap.parse_args()
    with SessionLocal() as db, httpx.Client(timeout=30, headers=UA) as client:
        print(f"Wikimedia : {enrich(db, client, args.limit)} photo(s) libre(s) ajoutée(s)")


if __name__ == "__main__":
    main()
