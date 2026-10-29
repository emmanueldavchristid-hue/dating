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
        data={"make_cover": "true"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_cover"] is True and body["url"].startswith("http://localhost:8000/media/places/")
    saved = next(tmp_path.rglob("*.jpg"))
    img = Image.open(saved)
    assert max(img.size) == 1600, "image réduite"
    assert not img.getexif().get(0x8825) and not img.getexif().get(0x010F), "métadonnées (GPS) supprimées"
    detail = client.get(f"{API}/places/{place['slug']}").json()
    assert detail["cover"]["url"] == body["url"] and any(p["id"] == body["id"] for p in detail["photos"])
    assert client.delete(f"{API}/admin/photos/{body['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/places/{place['slug']}").json()["cover"]["url"] is None
    assert not list(tmp_path.rglob("*.jpg")), "fichier supprimé"


def test_upload_rejects_non_images_and_regular_users(client, free_h):
    place = _place(client)
    files = {"file": ("x.jpg", b"pas une image", "image/jpeg")}
    assert client.post(f"{API}/admin/places/{place['id']}/photos", headers=free_h, files=files).status_code == 403
    r = client.post(f"{API}/admin/places/{place['id']}/photos", headers=_curator(client), files=files)
    assert r.status_code == 400 and r.json()["code"] == "invalid_image"


def test_upload_rejects_oversized(client):
    big = b"\xff\xd8" + b"0" * (8 * 1024 * 1024 + 10)
    r = client.post(
        f"{API}/admin/places/{_place(client)['id']}/photos",
        headers=_curator(client),
        files={"file": ("big.jpg", big, "image/jpeg")},
    )
    assert r.status_code == 413
