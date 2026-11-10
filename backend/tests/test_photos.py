import io

from PIL import Image

API = "/api/v1"


def _jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (3000, 2000), (200, 120, 40))
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (5.0, 20.0, 0.0), 3: "W", 4: (4.0, 1.0, 0.0)}  # GPSInfo
    exif[0x010F] = "PhoneMaker"
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def _curator(client):
    r = client.post(f"{API}/auth/login", json={"email": "curateur@sortie.demo", "password": "Demo-2026!"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


RIGHTS = {"source_kind": "team", "author": "Équipe Sortie", "rights_confirmed": "true"}


def _place(client):
    return client.get(f"{API}/places/search", params={"city": "abidjan", "q": "Kapokier"}).json()["items"][0]


def test_curator_uploads_photo_cleaned_and_resized(client, tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path))
    h, place = _curator(client), _place(client)
    r = client.post(
        f"{API}/admin/places/{place['id']}/photos",
        headers=h,
        files={"file": ("photo.jpg", _jpeg_with_gps(), "image/jpeg")},
        data={**RIGHTS, "make_cover": "true"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_cover"] is True and body["url"].startswith("http://localhost:8000/media/places/")
    saved = next(tmp_path.rglob("*.jpg"))
    img = Image.open(saved)
    assert max(img.size) == 1600, "image réduite"
    assert not img.getexif().get(0x8825) and not img.getexif().get(0x010F), "métadonnées (GPS) supprimées"
    detail = client.get(f"{API}/places/{place['slug']}").json()
    assert detail["cover"]["kind"] == "photo" and detail["cover"]["credit"] == "Photo : Équipe Sortie"
    assert detail["cover"]["url"] == body["url"] and any(p["id"] == body["id"] for p in detail["photos"])
    assert client.delete(f"{API}/admin/photos/{body['id']}", headers=h).status_code == 204
    cover = client.get(f"{API}/places/{place['slug']}").json()["cover"]
    assert cover["url"] is None and cover["kind"] == "illustration" and cover["credit"] == "Illustration"
    assert not list(tmp_path.rglob("*.jpg")), "fichier supprimé"


def test_upload_rejects_non_images_and_regular_users(client, free_h):
    place = _place(client)
    files = {"file": ("x.jpg", b"pas une image", "image/jpeg")}
    assert client.post(f"{API}/admin/places/{place['id']}/photos", headers=free_h, files=files).status_code == 403
    r = client.post(f"{API}/admin/places/{place['id']}/photos", headers=_curator(client), files=files, data=RIGHTS)
    assert r.status_code == 400 and r.json()["code"] == "invalid_image"


def test_upload_rejects_oversized(client):
    big = b"\xff\xd8" + b"0" * (8 * 1024 * 1024 + 10)
    r = client.post(
        f"{API}/admin/places/{_place(client)['id']}/photos",
        headers=_curator(client),
        files={"file": ("big.jpg", big, "image/jpeg")},
        data=RIGHTS,
    )
    assert r.status_code == 413


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (800, 600), (10, 120, 200)).save(buf, "PNG")
    return buf.getvalue()


def test_upload_requires_rights_and_owner_authorization(client):
    h, place = _curator(client), _place(client)
    url = f"{API}/admin/places/{place['id']}/photos"
    files = {"file": ("p.png", _png(), "image/png")}
    r = client.post(url, headers=h, files=files, data={"source_kind": "team", "author": "Moi"})
    assert r.status_code == 422 and r.json()["code"] == "rights_required", "case « j'ai le droit » obligatoire"
    r = client.post(
        url, headers=h, files=files, data={"source_kind": "owner", "author": "Le gérant", "rights_confirmed": "true"}
    )
    assert r.status_code == 422 and r.json()["code"] == "rights_required", "autorisation du lieu à préciser"
    r = client.post(
        url, headers=h, files=files, data={"author": "x", "rights_confirmed": "true", "source_kind": "google"}
    )
    assert r.status_code == 422, "on ne téléverse pas une photo Google ou trouvée sur Internet"


def test_photo_order_real_then_validated_wikimedia_then_illustration(client, tmp_path, monkeypatch):
    from sqlalchemy import select

    from app.config import get_settings
    from app.db import SessionLocal
    from app.models import Media, Place
    from app.services.photos import wikimedia_candidate

    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path))
    h, place = _curator(client), _place(client)
    detail = lambda: client.get(f"{API}/places/{place['slug']}").json()  # noqa: E731
    assert detail()["cover"]["kind"] == "illustration", "visuel de démo : signalé comme illustration"

    with SessionLocal() as db:  # photo Wikimedia trouvée automatiquement : à valider, donc invisible
        p = db.get(Place, place["id"])
        info = {
            "url": "https://upload.wikimedia.org/wikipedia/commons/a/ab/Kapokier.jpg",
            "artist": "Jane Doe",
            "license": "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
        }
        m = wikimedia_candidate(p, info)
        db.add(m)
        db.commit()
        wid = str(m.id)
    assert detail()["cover"]["kind"] == "illustration" and not detail()["photos"]
    listing = client.get(f"{API}/admin/places/{place['id']}/photos", headers=h).json()
    w = next(i for i in listing["items"] if i["id"] == wid)
    assert w["status"] == "pending" and w["source_page"] == "https://commons.wikimedia.org/wiki/File:Kapokier.jpg"

    assert client.patch(f"{API}/admin/photos/{wid}", headers=h, json={"status": "approved"}).status_code == 200
    d = detail()
    assert (
        d["cover"]["kind"] == "wikimedia"
        and d["cover"]["credit"] == "Photo : Jane Doe · CC BY-SA 4.0 · Wikimedia Commons"
    )
    assert d["photos"][0]["author"] == "Jane Doe" and d["photos"][0]["license_url"].startswith(
        "https://creativecommons"
    )

    r = client.post(
        f"{API}/admin/places/{place['id']}/photos",
        headers=h,
        files={"file": ("p.png", _png(), "image/png")},
        data={
            "source_kind": "owner",
            "author": "Le Kapokier",
            "rights_confirmed": "true",
            "rights_note": "Accord écrit du gérant, 10/11",
        },
    )
    assert r.status_code == 201, r.text
    real = r.json()
    d = detail()
    assert d["cover"]["kind"] == "photo" and d["cover"]["url"] == real["url"], "la photo réelle passe devant Wikimedia"
    assert [p["kind"] for p in d["photos"]] == ["photo", "wikimedia"]
    assert d["photos"][0]["credit"] == "Photo : Le Kapokier, avec son autorisation"
    # même « en couverture », Wikimedia ne passe pas devant une photo réelle
    client.patch(f"{API}/admin/photos/{wid}/cover", headers=h)
    assert detail()["cover"]["kind"] == "photo"
    # refuser puis supprimer : retour à l'illustration
    client.patch(f"{API}/admin/photos/{wid}", headers=h, json={"status": "rejected"})
    assert client.delete(f"{API}/admin/photos/{real['id']}", headers=h).status_code == 204
    assert detail()["cover"]["kind"] == "illustration"
    with SessionLocal() as db:
        db.query(Media).filter(Media.id == wid).delete()
        db.commit()
        assert db.scalar(select(Place.cover_kind).where(Place.id == place["id"])) is None


def test_wikimedia_cannot_be_validated_without_author_and_license(client):
    from app.db import SessionLocal
    from app.models import Media, Place
    from app.services.photos import wikimedia_candidate

    place = _place(client)
    with SessionLocal() as db:
        m = wikimedia_candidate(
            db.get(Place, place["id"]), {"url": "https://upload.wikimedia.org/x.jpg", "artist": "A"}
        )
        db.add(m)
        db.commit()
        mid = str(m.id)
    try:
        r = client.patch(f"{API}/admin/photos/{mid}", headers=_curator(client), json={"status": "approved"})
        assert r.status_code == 422 and r.json()["code"] == "rights_required"
    finally:
        with SessionLocal() as db:
            db.query(Media).filter(Media.id == mid).delete()
            db.commit()
