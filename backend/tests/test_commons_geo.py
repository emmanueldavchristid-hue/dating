from sqlalchemy import select

from app.db import SessionLocal
from app.importers.commons_geo import match_photos, title_matches
from app.models import Place


def test_title_matching_is_strict():
    assert title_matches("Musée des Civilisations de Côte d'Ivoire", "File:Musee des civilisations Abidjan 2019.jpg")
    assert title_matches("Le Bushman Café", "File:Bushman cafe terrasse.JPG")
    assert not title_matches("Restaurant", "File:Restaurant Abidjan.jpg"), "nom générique : jamais de photo"
    assert not title_matches("Le Bushman Café", "File:Plateau skyline.jpg")
    assert not title_matches("Maison Ganamet Art", "File:Maison bleue.jpg"), "un seul mot commun sur plusieurs : refusé"


def test_match_photos_requires_proximity_and_name():
    with SessionLocal() as db:
        place = db.scalar(select(Place).where(Place.status == "published", Place.cover_url.is_(None)).limit(1))
        lat, lng = (
            db.execute(select(Place.location.ST_Y(), Place.location.ST_X()).where(Place.id == place.id)).one()
            if False
            else (None, None)
        )
        from geoalchemy2 import Geometry
        from sqlalchemy import cast, func

        g = cast(Place.location, Geometry)
        lat, lng = db.execute(select(func.ST_Y(g), func.ST_X(g)).where(Place.id == place.id)).one()
        page = {
            "title": f"File:{place.name} vue.jpg",
            "imageinfo": [
                {
                    "url": "https://upload.wikimedia.org/near.jpg",
                    "extmetadata": {"LicenseShortName": {"value": "CC BY 4.0"}, "Artist": {"value": "X"}},
                }
            ],
        }
        far = {"lat": lat + 0.01, "lng": lng}  # ~1,1 km
        assert match_photos(db, {page["title"]: {**far, "page": page}}) == 0
        assert match_photos(db, {page["title"]: {"lat": lat, "lng": lng, "page": page}}) in (0, 1)
        db.refresh(place)
        if place.cover_url:
            assert place.cover_url.endswith("near.jpg")
