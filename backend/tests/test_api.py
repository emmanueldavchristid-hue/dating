"""Tests d'intégration de l'API (base réelle)."""

API = "/api/v1"


def search(client, headers=None, **params):
    r = client.get(f"{API}/places/search", params=params, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Méta & recherche ----------


def test_health_and_meta(client):
    assert client.get(f"{API}/health").json() == {"status": "ok", "db": "ok"}
    cats = client.get(f"{API}/meta/categories").json()
    assert {"plage", "maquis", "rooftop"} <= {c["slug"] for c in cats}
    cities = client.get(f"{API}/meta/cities").json()
    assert cities[0]["slug"] == "abidjan" and cities[0]["districts"]
    caps = client.get(f"{API}/meta/capabilities").json()
    assert caps["routing"] == "none" and caps["ai"] == "rules" and caps["demo_data"] is True


def test_search_by_city_is_honest(client):
    d = search(client, city="abidjan", page_size=50)
    assert d["origin"]["source"] == "city" and d["total"] > 20
    for item in d["items"]:
        assert item["tier"] == "free" and not item["locked"]
        assert item["travel"] is None, "aucun temps de trajet sans fournisseur d'itinéraire"
        assert item["distance_km"] is not None and item["is_demo"] is True
        assert item["open_status"] in ("open", "closed", "unknown")
        if item["open_status"] != "open":
            assert item["closes_at"] is None


def test_multi_category_and_ambiance_filters(client):
    d = search(client, city="abidjan", categories="plage,nature", ambiances="famille")
    assert d["total"] > 0
    for i in d["items"]:
        assert set(i["categories"]) & {"plage", "nature"} and "famille" in i["ambiances"]


def test_budget_filter_excludes_unknown_and_too_expensive(client):
    d = search(client, city="abidjan", budget_max=5000, page_size=50)
    assert d["total"] > 0
    assert all(i["budget_min_fcfa"] is not None and i["budget_min_fcfa"] <= 5000 for i in d["items"])


def test_open_now_only_returns_open_places(client):
    for i in search(client, city="abidjan", open_now="true", page_size=50)["items"]:
        assert i["open_status"] == "open"


def test_gps_search_sorted_by_distance_and_radius(client):
    d = search(client, lat=5.35, lng=-3.99, sort="distance", max_distance_km=5, page_size=50)
    dists = [i["distance_km"] for i in d["items"]]
    assert d["origin"]["source"] == "gps" and dists == sorted(dists) and all(x <= 5 for x in dists)


def test_text_search_accent_insensitive(client):
    names = [i["name"] for i in search(client, city="abidjan", q="ebene")["items"]]
    assert "La Terrasse Ébène" in names


def test_other_city_search(client):
    d = search(client, city="grand-bassam")
    assert d["total"] >= 2 and all(i["city"] == "Grand-Bassam" for i in d["items"])


def test_pagination_and_validation(client):
    p1, p2 = search(client, city="abidjan", page_size=5), search(client, city="abidjan", page_size=5, page=2)
    assert not {i["id"] for i in p1["items"]} & {i["id"] for i in p2["items"]}
    r = client.get(f"{API}/places/search", params={"lat": 5.3})
    assert r.status_code == 400 and r.json()["code"] == "invalid_location"
    assert client.get(f"{API}/places/search", params={"page_size": 500}).status_code == 422
    assert client.get(f"{API}/places/search", params={"city": "atlantide"}).json()["code"] == "unknown_city"


def test_ranking_reasons_are_factual(client, free_h):
    d = search(client, free_h, city="abidjan", categories="rooftop")
    assert d["items"][0]["reasons"] and d["items"][0]["score"] is not None


def test_home_sections(client):
    sections = client.get(f"{API}/recommendations/home", params={"city": "abidjan"}).json()["sections"]
    assert sections and all(s["items"] for s in sections)


def test_place_detail(client):
    slug = search(client, city="abidjan", q="Kapokier")["items"][0]["slug"]
    d = client.get(f"{API}/places/{slug}").json()
    assert d["source"]["kind"] == "demo" and d["hours"] and d["is_favorite"] is False
    assert client.get(f"{API}/places/inexistant").status_code == 404


# ---------- Premium : contrôle côté serveur ----------


def test_gems_locked_for_free_and_open_for_insider(client, free_h, insider_h):
    locked = client.get(f"{API}/places/gems", headers=free_h).json()
    assert locked and all(g["locked"] and g["location"] is None and g["name"] == "Pépite Insider" for g in locked)
    gems = client.get(f"{API}/places/gems", headers=insider_h).json()
    assert all(not g["locked"] and g["location"] for g in gems)
    slug = gems[0]["slug"]
    assert client.get(f"{API}/places/{slug}", headers=free_h).json()["code"] == "premium_required"
    assert client.get(f"{API}/places/{slug}").status_code == 403
    assert client.get(f"{API}/places/{slug}", headers=insider_h).status_code == 200
    assert all(i["tier"] == "free" for i in search(client, free_h, city="abidjan", page_size=50)["items"])
    assert any(i["tier"] == "premium" for i in search(client, insider_h, city="abidjan", page_size=50)["items"])


# ---------- Auth & compte ----------


def test_register_login_errors(client, new_user):
    _, email = new_user
    r = client.post(
        f"{API}/auth/register", json={"email": email.upper(), "password": "motdepasse-solide", "display_name": "X"}
    )
    assert r.status_code == 409
    assert client.post(f"{API}/auth/login", json={"email": email, "password": "mauvais"}).status_code == 401
    assert (
        client.post(
            f"{API}/auth/register", json={"email": "x@y.fr", "password": "court", "display_name": "X"}
        ).status_code
        == 422
    )
    assert client.get(f"{API}/me").json()["code"] == "not_authenticated"
    assert client.get(f"{API}/me", headers={"Authorization": "Bearer faux"}).status_code == 401


def test_auth_rate_limit(client):
    codes = [client.post(f"{API}/auth/login", json={"email": "a@b.fr", "password": "x"}).status_code for _ in range(12)]
    assert codes[-1] == 429


def test_preferences_and_consent(client, new_user):
    h, _ = new_user
    u = client.patch(
        f"{API}/me/preferences", headers=h, json={"categories": ["plage"], "budget_max_fcfa": 15000}
    ).json()
    assert u["preferences"]["categories"] == ["plage"] and u["preferences"]["budget_max_fcfa"] == 15000
    assert client.patch(f"{API}/me/preferences", headers=h, json={"categories": ["inconnue"]}).status_code == 400
    assert client.post(f"{API}/me/consent", headers=h, json={"location": True}).json()["location_consent"] is True


def test_favorites_and_collections(client, new_user):
    h, _ = new_user
    place = search(client, city="abidjan")["items"][0]
    assert client.put(f"{API}/me/favorites/{place['id']}", headers=h).status_code == 204
    assert client.put(f"{API}/me/favorites/{place['id']}", headers=h).status_code == 204  # idempotent
    assert [f["id"] for f in client.get(f"{API}/me/favorites", headers=h).json()] == [place["id"]]
    assert client.get(f"{API}/places/{place['slug']}", headers=h).json()["is_favorite"] is True
    c = client.post(f"{API}/me/collections", headers=h, json={"name": "Week-end"}).json()
    assert (
        client.post(f"{API}/me/collections/{c['id']}/items", headers=h, json={"place_id": place["id"]}).status_code
        == 204
    )
    assert client.get(f"{API}/me/collections", headers=h).json()[0]["count"] == 1
    assert client.get(f"{API}/me/collections/{c['id']}", headers=h).json()["items"][0]["id"] == place["id"]
    assert client.delete(f"{API}/me/collections/{c['id']}/items/{place['id']}", headers=h).status_code == 204
    assert client.delete(f"{API}/me/favorites/{place['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/me/favorites", headers=h).json() == []


def test_collection_isolation_between_users(client, new_user, free_h):
    h, _ = new_user
    c = client.post(f"{API}/me/collections", headers=h, json={"name": "Privée"}).json()
    assert client.get(f"{API}/me/collections/{c['id']}", headers=free_h).status_code == 404


def test_review_updates_rating(client, new_user):
    h, _ = new_user
    place = search(client, city="abidjan", q="Kapokier")["items"][0]
    r = client.post(f"{API}/places/{place['id']}/reviews", headers=h, json={"rating": 5, "text": "Top"})
    assert r.status_code == 201 and r.json()["rating_count"] == place["rating_count"] + 1
    assert client.post(f"{API}/places/{place['id']}/reviews", headers=h, json={"rating": 9}).status_code == 422


def test_report_and_admin_resolution(client, new_user, admin_h):
    h, _ = new_user
    place = search(client, city="abidjan")["items"][1]
    assert client.post(f"{API}/places/{place['id']}/reports", json={"kind": "closed"}).status_code == 401
    rep = client.post(
        f"{API}/places/{place['id']}/reports", headers=h, json={"kind": "wrong_hours", "message": "Fermé le lundi"}
    )
    assert rep.status_code == 201
    open_reports = client.get(f"{API}/admin/reports", headers=admin_h).json()["items"]
    assert any(r["id"] == rep.json()["id"] for r in open_reports)
    assert (
        client.patch(f"{API}/admin/reports/{rep.json()['id']}", headers=admin_h, json={"status": "resolved"}).json()[
            "status"
        ]
        == "resolved"
    )


def test_export_and_delete_account(client, new_user):
    h, email = new_user
    data = client.get(f"{API}/me/export", headers=h).json()
    assert data["account"]["email"] == email and "search_history" in data
    assert client.delete(f"{API}/me", headers=h).status_code == 204
    assert client.get(f"{API}/me", headers=h).status_code == 401


# ---------- Itinéraires, concierge, abonnement ----------


def test_itinerary_suggest_respects_plan(client, free_h, insider_h):
    s = client.post(f"{API}/itineraries/suggest", headers=free_h, json={"city": "abidjan", "steps": 2}).json()
    assert len(s["steps"]) == 2 and s["steps"][0]["leg_km"] is None and s["steps"][1]["leg_km"] is not None
    assert any("vol d'oiseau" in n for n in s["notes"])
    assert (
        client.post(f"{API}/itineraries/suggest", headers=free_h, json={"city": "abidjan", "steps": 4}).json()["code"]
        == "premium_required"
    )
    assert (
        len(
            client.post(f"{API}/itineraries/suggest", headers=insider_h, json={"city": "abidjan", "steps": 4}).json()[
                "steps"
            ]
        )
        == 4
    )


def test_itinerary_crud(client, new_user):
    h, _ = new_user
    ids = [i["id"] for i in search(client, city="abidjan", page_size=2)["items"]]
    it = client.post(
        f"{API}/me/itineraries", headers=h, json={"title": "Samedi", "steps": [{"place_id": i} for i in ids]}
    )
    assert it.status_code == 201 and len(it.json()["steps"]) == 2
    assert client.get(f"{API}/me/itineraries", headers=h).json()[0]["step_count"] == 2
    assert client.delete(f"{API}/me/itineraries/{it.json()['id']}", headers=h).status_code == 204


def test_concierge_rules_mode_and_quota(client, new_user):
    h, _ = new_user
    r = client.post(f"{API}/concierge", headers=h, json={"message": "Un maquis pas cher entre amis à Yopougon"}).json()
    assert r["provider"] == "rules" and "maquis" in r["parsed"]["categories"] and r["quota"] == {"used": 1, "limit": 3}
    names = {p["name"] for p in r["places"]}
    assert names and all(n in r["reply"] for n in names), "la réponse ne cite que des lieux de la base"
    for _ in range(2):
        client.post(f"{API}/concierge", headers=h, json={"message": "une plage"})
    over = client.post(f"{API}/concierge", headers=h, json={"message": "une plage"})
    assert over.status_code == 429 and over.json()["code"] == "quota_exceeded"
    assert client.post(f"{API}/concierge", json={"message": "x"}).status_code == 401


def test_concierge_never_invents_when_nothing_matches(client, insider_h):
    r = client.post(
        f"{API}/concierge", headers=insider_h, json={"message": "un club en famille calme", "city": "assinie"}
    ).json()
    for p in r["places"]:
        assert p["city"] == "Assinie"


def test_billing_is_honest(client, free_h):
    plans = client.get(f"{API}/billing/plans").json()
    assert [p["code"] for p in plans] == ["free", "plus", "insider"]
    r = client.post(f"{API}/billing/checkout", headers=free_h, json={"plan": "insider"})
    assert r.status_code == 501 and r.json()["code"] == "not_configured"
    assert client.get(f"{API}/me/subscription", headers=free_h).json()["plan"] == "free"


# ---------- Administration ----------


def test_admin_routes_are_protected(client, free_h):
    assert client.get(f"{API}/admin/stats").status_code == 401
    assert client.get(f"{API}/admin/stats", headers=free_h).json()["code"] == "forbidden"
    curator = client.post(f"{API}/auth/login", json={"email": "curateur@sortie.demo", "password": "Demo-2026!"}).json()[
        "access_token"
    ]
    ch = {"Authorization": f"Bearer {curator}"}
    assert client.get(f"{API}/admin/curation", headers=ch).status_code == 200
    assert client.get(f"{API}/admin/users", headers=ch).status_code == 403


def test_admin_place_lifecycle_and_audit(client, admin_h):
    body = {
        "name": "Nouveau Spot Test",
        "city": "abidjan",
        "district": "cocody",
        "lat": 5.35,
        "lng": -3.99,
        "categories": ["bar"],
        "ambiances": ["festif"],
        "budget_min_fcfa": 3000,
        "budget_max_fcfa": 9000,
    }
    p = client.post(f"{API}/admin/places", headers=admin_h, json=body)
    assert p.status_code == 201 and p.json()["is_demo"] is False
    assert client.post(f"{API}/admin/places", headers=admin_h, json=body).status_code == 409
    bad = client.patch(f"{API}/admin/places/{p.json()['id']}", headers=admin_h, json={"budget_min_fcfa": 99999})
    assert bad.status_code == 400
    assert (
        client.patch(
            f"{API}/admin/places/{p.json()['id']}", headers=admin_h, json={"tier": "premium", "mark_verified": True}
        ).json()["tier"]
        == "premium"
    )
    actions = [a["action"] for a in client.get(f"{API}/admin/audit", headers=admin_h).json()["items"]]
    assert "place.created" in actions and "place.updated" in actions


def test_admin_plan_grant_and_curation(client, admin_h, new_user):
    h, email = new_user
    uid = client.get(f"{API}/me", headers=h).json()["id"]
    assert (
        client.patch(f"{API}/admin/users/{uid}", headers=admin_h, json={"plan": "insider"}).json()["plan"] == "insider"
    )
    assert not client.get(f"{API}/places/gems", headers=h).json()[0]["locked"]
    items = client.get(f"{API}/admin/curation", headers=admin_h).json()["items"]
    assert items
    r = client.patch(f"{API}/admin/curation/{items[0]['id']}", headers=admin_h, json={"decision": "approved"})
    assert r.json()["status"] == "approved"


def test_tasks_flag_reported_places(client, new_user):
    from app.db import SessionLocal
    from app.tasks import flag_for_review, purge_history

    h, _ = new_user
    pid = search(client, city="abidjan")["items"][3]["id"]
    for kind in ("closed", "wrong_price"):
        client.post(f"{API}/places/{pid}/reports", headers=h, json={"kind": kind})
    with SessionLocal() as db:
        assert flag_for_review(db) >= 1
        assert purge_history(db) >= 0
