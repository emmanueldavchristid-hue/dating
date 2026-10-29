"""Collecte des photos géolocalisées de Wikimedia Commons (bibliothèque standard uniquement).

    python3 fetch_commons_geo.py sortie-commons.json
    python -m app.importers.commons_geo --from-file sortie-commons.json

Quadrille Abidjan, Grand-Bassam et Assinie (rayon 10 km par point), récupère titre, position,
URL, licence et auteur des images. L'association à un lieu se fait ensuite côté serveur."""

import json
import sys
import time
import urllib.parse
import urllib.request

UA = "SortieImporter/0.2 (https://github.com/emmanueldavchristid-hue/dating)"
API = "https://commons.wikimedia.org/w/api.php"
ZONES = [(5.30, 5.45, -4.12, -3.85), (5.18, 5.23, -3.78, -3.70), (5.10, 5.16, -3.35, -3.20)]  # lat_min, lat_max, lng_min, lng_max
STEP = 0.08  # ~9 km, avec un rayon de 10 km les cercles se recouvrent


def get(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 5})
    wait = 10
    for _ in range(10):
        time.sleep(1.0)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (403, 429, 503):
                raise
            time.sleep(float(e.headers.get("Retry-After") or wait))
            wait = min(wait * 2, 240)
    raise RuntimeError("Wikimedia indisponible")


def main(out: str) -> None:
    files: dict[str, dict] = {}
    for lat0, lat1, lng0, lng1 in ZONES:
        lat = lat0
        while lat <= lat1 + 1e-9:
            lng = lng0
            while lng <= lng1 + 1e-9:
                d = get({"action": "query", "list": "geosearch", "gscoord": f"{lat}|{lng}", "gsradius": 10000,
                         "gslimit": 500, "gsnamespace": 6})
                for g in d.get("query", {}).get("geosearch", []):
                    files[g["title"]] = {"lat": g["lat"], "lng": g["lon"]}
                lng += STEP
            lat += STEP
    print(f"{len(files)} images géolocalisées", flush=True)
    titles = sorted(files)
    for i in range(0, len(titles), 40):
        d = get({"action": "query", "titles": "|".join(titles[i:i + 40]), "prop": "imageinfo",
                 "iiprop": "url|extmetadata|size", "iiurlwidth": 1280})
        for p in d.get("query", {}).get("pages", {}).values():
            if p.get("title") in files:
                files[p["title"]]["page"] = p
        if i % 400 == 0:
            print(f"métadonnées : {i}/{len(titles)}", flush=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(files, f, ensure_ascii=False)
    print("terminé", flush=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sortie-commons.json")
