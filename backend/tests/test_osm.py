from sqlalchemy import select

from app.db import SessionLocal
from app.importers.osm import import_places, parse_elements, parse_hours
from app.models import City, Place

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
                "opening_hours": "Mo-Fr 12:00-15:00; Sa 19:00-23:00",
                "wheelchair": "yes",
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
    assert parse_hours("Mo-Fr 12:00-15:00, 19:00-23:00; PH off") == []
    assert parse_hours(None) == []


def test_import_creates_drafts_once():
    with SessionLocal() as db:
        city = db.scalar(select(City).where(City.slug == "abidjan"))
        assert import_places(db, city, parse_elements(SAMPLE)) == (2, 0)
        assert import_places(db, city, parse_elements(SAMPLE)) == (0, 2)
        p = db.scalar(select(Place).where(Place.external_ref == "node/1"))
        assert p.status == "draft" and p.verified_at is None and p.wheelchair is True and len(p.hours) == 6
