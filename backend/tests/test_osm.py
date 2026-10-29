import httpx
from sqlalchemy import select

from app.db import SessionLocal
from app.importers.osm import import_places, parse_elements, parse_hours
from app.importers.wikimedia import enrich
from app.models import City, Media, Place, PlaceDocument, PlaceExternalId

SAMPLE = {
    "elements": [
        {
            "type": "node",
            "id": 1,
            "lat": 5.33,
            "lon": -4.02,
            "tags": {
                "amenity": "restaurant",
                "name": "Resto OSM Test",
                "cuisine": "ivorian;grill",
                "opening_hours": "Mo-Fr 12:00-15:00; Sa 19:00-23:00",
                "wheelchair": "yes",
                "wikidata": "Q900001",
            },
        },
        {
            "type": "way",
            "id": 2,
            "center": {"lat": 5.30, "lon": -3.99},
            "tags": {"leisure": "park", "name": "Parc OSM Test"},
        },
        {"type": "node", "id": 3, "lat": 5.3, "lon": -4.0, "tags": {"amenity": "bench"}},
        {"type": "node", "id": 4, "lat": 5.3, "lon": -4.0, "tags": {"amenity": "bar"}},
    ]
}


def test_parse_elements_keeps_only_named_mapped_places():
    items = parse_elements(SAMPLE)
    assert [i.ref for i in items] == ["node/1", "way/2"]
    assert items[0].categories == ["restaurant"] and items[1].categories == ["nature"]


def test_parse_hours_simple_and_unknown():
    assert len(parse_hours("Mo-Fr 12:00-15:00; Sa 19:00-23:00")) == 6
    assert len(parse_hours("24/7")) == 7
    assert parse_hours("Mo-Fr 12:00-15:00, 19:00-23:00; PH off") == []
    assert parse_hours(None) == []


def test_import_drafts_then_update_without_duplicates():
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        assert import_places(db, city, parse_elements(SAMPLE)) == (2, 0)
        assert import_places(db, city, parse_elements(SAMPLE)) == (0, 2)
        p = db.scalar(select(Place).where(Place.external_ref == "node/1"))
        assert p.status == "draft" and p.verified_at is None and p.wheelchair is True and len(p.hours) == 6
        assert "ivoirienne, grillades" in p.short_description and p.district is not None and p.is_demo is False
        assert (
            db.scalar(
                select(PlaceExternalId.external_id).where(
                    PlaceExternalId.place_id == p.id, PlaceExternalId.provider == "wikidata"
                )
            )
            == "Q900001"
        )


def test_import_publish_indexes_for_rag():
    data = {
        "elements": [
            {
                "type": "node",
                "id": 77,
                "lat": 5.35,
                "lon": -3.99,
                "tags": {"amenity": "cafe", "name": "Café Publié OSM"},
            }
        ]
    }
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        import_places(db, city, parse_elements(data), publish=True)
        p = db.scalar(select(Place).where(Place.external_ref == "node/77"))
        assert p.status == "published" and p.embedding is not None
        assert db.scalar(select(PlaceDocument.id).where(PlaceDocument.place_id == p.id)) is not None


def test_wikimedia_enrich_keeps_only_free_licenses():
    def handler(req: httpx.Request) -> httpx.Response:
        if "wikidata" in req.url.host:
            return httpx.Response(
                200,
                json={
                    "entities": {
                        "Q900001": {"claims": {"P18": [{"mainsnak": {"datavalue": {"value": "Resto test.jpg"}}}]}}
                    }
                },
            )
        return httpx.Response(
            200,
            json={
                "query": {
                    "pages": {
                        "1": {
                            "title": "File:Resto test.jpg",
                            "imageinfo": [
                                {
                                    "url": "https://upload.wikimedia.org/x.jpg",
                                    "thumburl": "https://upload.wikimedia.org/x-1280.jpg",
                                    "thumbwidth": 1280,
                                    "thumbheight": 853,
                                    "extmetadata": {
                                        "LicenseShortName": {"value": "CC BY-SA 4.0"},
                                        "Artist": {"value": "<a href='#'>Jane Doe</a>"},
                                    },
                                }
                            ],
                        }
                    }
                }
            },
        )

    with SessionLocal() as db, httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert enrich(db, client) == 1
        p = db.scalar(select(Place).where(Place.external_ref == "node/1"))
        m = db.scalar(select(Media).where(Media.place_id == p.id, Media.source_url.is_not(None)))
        assert p.cover_url.endswith("x-1280.jpg") and m.credit.startswith("Jane Doe · CC BY-SA 4.0")
        assert enrich(db, client) == 0  # idempotent


def test_wikimedia_rejects_non_free_license():
    def handler(req: httpx.Request) -> httpx.Response:
        if "wikidata" in req.url.host:
            return httpx.Response(
                200, json={"entities": {"Q1": {"claims": {"P18": [{"mainsnak": {"datavalue": {"value": "a.jpg"}}}]}}}}
            )
        return httpx.Response(
            200,
            json={
                "query": {
                    "pages": {
                        "1": {
                            "title": "File:a.jpg",
                            "imageinfo": [
                                {"url": "u", "extmetadata": {"LicenseShortName": {"value": "All rights reserved"}}}
                            ],
                        }
                    }
                }
            },
        )

    from app.importers.wikimedia import file_info

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert file_info(client, ["a.jpg"]) == {}


def test_multi_value_tags_are_sanitized():
    data = {
        "elements": [
            {
                "type": "node",
                "id": 88,
                "lat": 5.31,
                "lon": -4.1,
                "tags": {
                    "amenity": "restaurant",
                    "name": "Campement Test",
                    "phone": "+225 06 49 12 19;+225 01 91 56 05;+225 59 58 33 58",
                },
            }
        ]
    }
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        import_places(db, city, parse_elements(data), publish=False)
        assert db.scalar(select(Place).where(Place.external_ref == "node/88")).phone == "+225 06 49 12 19"


def test_generic_names_and_name_categories():
    from app.importers.osm import describe, is_generic_name, name_categories

    for n in (
        "Maquis",
        "Kiosque à café",
        "Buvette Traditionnelle",
        "Garbadrome",
        "Restaurant Africain",
        "Café Express",
    ):
        assert is_generic_name(n), n
    for n in ("Maquis Chez Tantie Awa", "Bushman Café", "Le Toit d'Abidjan"):
        assert not is_generic_name(n), n
    assert name_categories("Maquis Chez Tantie") == {"maquis"} and "lounge" in name_categories("Sky Lounge")
    assert (
        describe(["restaurant"], {"cuisine": "african;french;fish;grill;pizza"})[0]
        == "Restaurant · cuisine africaine, française, poisson, grillades"
    )


def test_generic_place_is_kept_as_draft():
    data = {
        "elements": [
            {"type": "node", "id": 99, "lat": 5.31, "lon": -4.0, "tags": {"amenity": "restaurant", "name": "Maquis"}}
        ]
    }
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        import_places(db, city, parse_elements(data), publish=True)
        assert db.scalar(select(Place).where(Place.external_ref == "node/99")).status == "draft"
