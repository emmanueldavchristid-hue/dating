import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.importers.wikidata import Polite, fetch_entities, import_entities, search_ids
from app.models import City, Place


def _handler(req: httpx.Request) -> httpx.Response:
    p = dict(req.url.params)
    if p.get("list") == "search":
        return httpx.Response(200, json={"query": {"search": [{"title": "Q9001"}, {"title": "Q9002"}]}})
    return httpx.Response(
        200,
        json={
            "entities": {
                "Q9001": {
                    "labels": {"fr": {"value": "Musée Test Wikidata"}},
                    "descriptions": {"fr": {"value": "musée à Abidjan"}},
                    "claims": {
                        "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q33506"}}}}],
                        "P625": [{"mainsnak": {"datavalue": {"value": {"latitude": 5.32, "longitude": -4.02}}}}],
                        "P18": [{"mainsnak": {"datavalue": {"value": "Musee test.jpg"}}}],
                    },
                },
                "Q9002": {
                    "labels": {"fr": {"value": "Hôpital Test"}},
                    "claims": {
                        "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q16917"}}}}],
                        "P625": [{"mainsnak": {"datavalue": {"value": {"latitude": 5.3, "longitude": -4.0}}}}],
                    },
                },
            }
        },
    )


def test_wikidata_import_keeps_only_outing_types():
    api = Polite(httpx.Client(transport=httpx.MockTransport(_handler)), pause=0)
    items = fetch_entities(api, search_ids(api, 5.33, -4.02, 20))
    assert [i["name"] for i in items] == ["Musée Test Wikidata"] and items[0]["categories"] == ["culture"]
    images = {
        "Musee test.jpg": {
            "url": "https://upload.wikimedia.org/m.jpg",
            "license": "CC BY 4.0",
            "artist": "A",
            "width": 1,
            "height": 1,
        }
    }
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        assert import_entities(db, city, items, images, publish=True) == (1, 0)
        assert import_entities(db, city, items, images, publish=True) == (0, 1)
        p = db.scalar(select(Place).where(Place.external_ref == "Q9001"))
        assert p.status == "published" and p.cover_url.endswith("m.jpg") and p.short_description == "Musée à Abidjan"
        assert p.embedding is not None and p.is_demo is False


def test_polite_client_retries_on_429(monkeypatch):
    import app.importers.wikidata as wd

    monkeypatch.setattr(wd.time, "sleep", lambda s: None)
    calls = {"n": 0}

    def h(req):
        calls["n"] += 1
        return (
            httpx.Response(429, headers={"Retry-After": "1"}) if calls["n"] < 3 else httpx.Response(200, json={"ok": 1})
        )

    assert Polite(httpx.Client(transport=httpx.MockTransport(h)), pause=0).get("https://x", {}) == {"ok": 1}
