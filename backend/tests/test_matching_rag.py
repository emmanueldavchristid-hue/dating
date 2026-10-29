"""Matching (profil de goûts, affinité), lieux similaires, RAG et concierge."""

import httpx

from app.adapters.embeddings import HashingEmbedder, cosine
from app.adapters.llm import AnthropicProvider

API = "/api/v1"


def _first(client, headers=None, **params):
    return client.get(f"{API}/places/search", params={"city": "abidjan", **params}, headers=headers or {}).json()[
        "items"
    ][0]


def test_hashing_embedder_links_synonyms_to_concepts():
    e = HashingEmbedder()
    q, beach, bar = e.embed(["un coin au bord de la mer", "Plage avec transats et sable fin", "Bar à cocktails animé"])
    assert abs(cosine(q, q) - 1) < 1e-6
    assert cosine(q, beach) > cosine(q, bar)


def test_events_build_taste_and_match(client, new_user):
    h, _ = new_user
    assert client.get(f"{API}/me/taste", headers=h).json()["signals"] == 0
    assert _first(client, h)["match"] is None, "pas de match sans signaux ni préférences"
    beach = _first(client, h, categories="plage")
    for kind in ("favorite", "directions", "share"):
        assert client.post(f"{API}/events", headers=h, json={"type": kind, "place_id": beach["id"]}).status_code == 204
    taste = client.get(f"{API}/me/taste", headers=h).json()
    assert taste["signals"] == 3 and "plage" in [c["slug"] for c in taste["top_categories"]]
    items = client.get(f"{API}/places/search", params={"city": "abidjan", "page_size": 50}, headers=h).json()["items"]
    by_cat = {i["id"]: i for i in items}
    assert all(i["match"] is not None and 0 <= i["match"] <= 100 for i in items)
    beaches = [i["match"] for i in items if "plage" in i["categories"]]
    others = [i["match"] for i in items if not set(i["categories"]) & {"plage", "restaurant"}]
    assert min(beaches) > sum(others) / len(others), "les lieux proches des goûts ont une meilleure affinité"
    assert beach["id"] in by_cat


def test_events_validation(client, new_user):
    h, _ = new_user
    assert client.post(f"{API}/events", headers=h, json={"type": "hack", "place_id": "x"}).status_code == 422
    assert client.post(f"{API}/events", headers=h, json={"type": "view", "place_id": "not-a-uuid"}).status_code == 404
    pid = _first(client)["id"]
    assert (
        client.post(f"{API}/events", json={"type": "view", "place_id": pid}).status_code == 204
    )  # anonyme accepté, sans profil


def test_similar_places(client, free_h, insider_h):
    base = _first(client, q="ebene")
    sims = client.get(f"{API}/recommendations/similar/{base['slug']}", headers=free_h).json()
    assert sims and base["id"] not in {s["id"] for s in sims}
    assert all(s["tier"] == "free" for s in sims), "pas de pépite pour l'offre gratuite"
    assert all(s["reasons"] for s in sims[:3])
    gem = client.get(f"{API}/places/gems", headers=insider_h).json()[0]
    assert (
        client.get(f"{API}/recommendations/similar/{gem['slug']}", headers=free_h).json()["code"] == "premium_required"
    )
    assert client.get(f"{API}/recommendations/similar/{gem['slug']}", headers=insider_h).status_code == 200


def test_concierge_uses_rag_index(client, insider_h):
    r = client.post(
        f"{API}/concierge",
        headers=insider_h,
        json={"message": "un endroit au bord de la mer pour se détendre en famille"},
    ).json()
    assert r["retrieval"] == "lexical" and r["places"]
    assert any("plage" in p["categories"] for p in r["places"])
    r = client.post(
        f"{API}/concierge", headers=insider_h, json={"message": "des cocktails avec une belle vue en hauteur"}
    ).json()
    assert "rooftop" in r["parsed"]["categories"]
    assert any("rooftop" in p["categories"] for p in r["places"])


def test_concierge_follow_up_inherits_context(client, insider_h):
    r = client.post(
        f"{API}/concierge",
        headers=insider_h,
        json={
            "message": "moins cher",
            "history": [{"role": "user", "content": "un maquis entre amis"}, {"role": "assistant", "content": "…"}],
        },
    ).json()
    assert "maquis" in r["parsed"]["categories"] and r["parsed"]["budget_max_fcfa"] == 10000
    assert all(p["budget_min_fcfa"] <= 10000 for p in r["places"])


def test_concierge_history_is_bounded(client, insider_h):
    history = [{"role": "user", "content": "x"}] * 7
    assert (
        client.post(f"{API}/concierge", headers=insider_h, json={"message": "plage", "history": history}).status_code
        == 422
    )


def test_llm_reply_citing_unselected_place_is_rejected(client, insider_h, monkeypatch):
    """Si le LLM invente ou cite un lieu hors sélection, on revient au mode règles."""
    from app.routers import concierge as mod

    def fake(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        if "set_filters" in body:
            return httpx.Response(
                200,
                json={
                    "content": [
                        {"type": "tool_use", "input": {"categories": ["plage"], "ambiances": [], "open_now": False}}
                    ]
                },
            )
        return httpx.Response(
            200, json={"content": [{"type": "text", "text": "Allez plutôt au Club Orbite, c'est génial !"}]}
        )

    llm = AnthropicProvider("k", "m", httpx.Client(transport=httpx.MockTransport(fake)))
    monkeypatch.setattr(mod, "get_llm", lambda: llm)
    r = client.post(f"{API}/concierge", headers=insider_h, json={"message": "une plage"}).json()
    assert r["provider"] == "rules" and "Club Orbite" not in r["reply"]
    assert all("plage" in p["categories"] for p in r["places"])


def test_llm_grounded_reply_is_kept(client, insider_h, monkeypatch):
    from app.routers import concierge as mod

    def fake(request: httpx.Request) -> httpx.Response:
        body = request.read().decode()
        if "set_filters" in body:
            return httpx.Response(
                200,
                json={
                    "content": [
                        {"type": "tool_use", "input": {"categories": ["plage"], "ambiances": [], "open_now": False}}
                    ]
                },
            )
        return httpx.Response(
            200, json={"content": [{"type": "text", "text": "Je te conseille ces plages, parfaites pour se détendre."}]}
        )

    monkeypatch.setattr(
        mod, "get_llm", lambda: AnthropicProvider("k", "m", httpx.Client(transport=httpx.MockTransport(fake)))
    )
    r = client.post(f"{API}/concierge", headers=insider_h, json={"message": "une plage"}).json()
    assert r["provider"] == "anthropic" and r["reply"].startswith("Je te conseille")


def test_reindex_after_admin_edit(client, admin_h):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import PlaceDocument

    body = {
        "name": "Spot Index Test",
        "city": "abidjan",
        "district": "cocody",
        "lat": 5.35,
        "lng": -3.99,
        "categories": ["bar"],
        "short_description": "Terrasse secrète avec saxophoniste",
    }
    pid = client.post(f"{API}/admin/places", headers=admin_h, json=body).json()["id"]
    with SessionLocal() as db:
        docs = db.scalars(select(PlaceDocument.content).where(PlaceDocument.place_id == pid)).all()
    assert any("saxophoniste" in d for d in docs)


def test_export_includes_interactions(client, new_user):
    h, _ = new_user
    client.post(f"{API}/events", headers=h, json={"type": "share", "place_id": _first(client)["id"]})
    assert client.get(f"{API}/me/export", headers=h).json()["interactions"][0]["type"] == "share"


def test_locked_gems_do_not_leak_slug(client, free_h, insider_h):
    real = {g["slug"] for g in client.get(f"{API}/places/gems", headers=insider_h).json()}
    locked = client.get(f"{API}/places/gems", headers=free_h).json()
    assert all(g["slug"].startswith("pepite-") and g["slug"] not in real for g in locked)


def test_home_uses_district_as_origin_without_filtering(client):
    d = client.get(f"{API}/recommendations/home", params={"city": "abidjan", "district": "port-bouet"}).json()[
        "sections"
    ]
    items = [i for s in d for i in s["items"]]
    assert len({i["district"] for i in items}) > 1, "le quartier sert de point de départ, pas de filtre"


def test_match_scores_are_spread(client, free_h):
    items = client.get(f"{API}/places/search", params={"city": "abidjan", "page_size": 50}, headers=free_h).json()[
        "items"
    ]
    matches = [i["match"] for i in items if i["match"] is not None]
    assert matches and max(matches) < 100 and min(matches) < 50
