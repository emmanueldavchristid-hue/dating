"""Collecte Wikidata/Commons autonome (bibliothèque standard uniquement), à lancer sur une machine dont
l'adresse n'est pas limitée par Wikimedia. Produit un JSON importable ici :

    python3 fetch_wikidata.py sortie-wikidata.json
    python -m app.importers.wikidata --from-file sortie-wikidata.json --publish
"""

import json
import sys
import time
import urllib.parse
import urllib.request

UA = "SortieImporter/0.2 (https://github.com/emmanueldavchristid-hue/dating)"
CITIES = {"abidjan": (5.3364, -4.0267, 25), "grand-bassam": (5.2010, -3.7380, 10), "assinie": (5.1300, -3.2800, 10)}
TYPES = [
    "Q33506",
    "Q207694",
    "Q1007870",
    "Q24354",
    "Q41253",
    "Q1329623",
    "Q22698",
    "Q22746",
    "Q167346",
    "Q43501",
    "Q46169",
    "Q179049",
    "Q40080",
    "Q11707",
    "Q187456",
    "Q622425",
    "Q194195",
    "Q570116",
]


def get(url: str, params: dict) -> dict:
    full = url + "?" + urllib.parse.urlencode({**params, "format": "json", "maxlag": 5})
    wait = 10
    for _ in range(10):
        time.sleep(1.0)
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (403, 429, 503):
                raise
            time.sleep(float(e.headers.get("Retry-After") or wait))
            wait = min(wait * 2, 240)
    raise RuntimeError("Wikimedia indisponible")


def main(out: str) -> None:
    result = {}
    for slug, (lat, lng, radius) in CITIES.items():
        types = "|".join(f"P31={q}" for q in TYPES)
        ids, offset = [], 0
        while offset is not None and offset < 1000:
            d = get(
                "https://www.wikidata.org/w/api.php",
                {
                    "action": "query",
                    "list": "search",
                    "srlimit": 50,
                    "sroffset": offset,
                    "srsearch": f"nearcoord:{radius}km,{lat},{lng} haswbstatement:{types}",
                },
            )
            ids += [r["title"] for r in d.get("query", {}).get("search", [])]
            offset = (d.get("continue") or {}).get("sroffset")
        entities = {}
        for i in range(0, len(ids), 50):
            d = get(
                "https://www.wikidata.org/w/api.php",
                {
                    "action": "wbgetentities",
                    "ids": "|".join(ids[i : i + 50]),
                    "props": "labels|descriptions|claims",
                    "languages": "fr|en",
                },
            )
            entities |= d.get("entities", {})
        files = sorted(
            {
                c[0]["mainsnak"]["datavalue"]["value"]
                for e in entities.values()
                if (c := e.get("claims", {}).get("P18")) and "datavalue" in c[0]["mainsnak"]
            }
        )
        images = {}
        for i in range(0, len(files), 40):
            d = get(
                "https://commons.wikimedia.org/w/api.php",
                {
                    "action": "query",
                    "titles": "|".join(f"File:{f}" for f in files[i : i + 40]),
                    "prop": "imageinfo",
                    "iiprop": "url|extmetadata|size",
                    "iiurlwidth": 1280,
                },
            )
            images |= {p["title"]: p for p in d.get("query", {}).get("pages", {}).values()}
        result[slug] = {"entities": entities, "images": images}
        print(f"{slug} : {len(ids)} lieux, {len(images)} images", flush=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sortie-wikidata.json")
