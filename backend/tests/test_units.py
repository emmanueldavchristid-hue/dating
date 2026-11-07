"""Tests unitaires purs (sans base)."""

from datetime import datetime, time

import httpx

from app.adapters.llm import AnthropicProvider
from app.adapters.routing import NoRouting, OsrmRouting
from app.services.hours import Slot, open_status
from app.services.intent import normalize, parse, parse_budget

MON = datetime(2026, 10, 26)  # lundi


def at(h, m=0, day=0):
    return MON.replace(day=26 + day, hour=h, minute=m)


def test_hours_unknown_without_data():
    assert open_status([], at(12)) == ("unknown", None)


def test_hours_simple_slot():
    slots = [Slot(0, time(12), time(15))]
    assert open_status(slots, at(13)) == ("open", "15:00")
    assert open_status(slots, at(15)) == ("closed", None)


def test_hours_overnight_slot_same_and_next_day():
    slots = [Slot(0, time(22), time(4))]  # lundi 22h → mardi 4h
    assert open_status(slots, at(23))[0] == "open"
    assert open_status(slots, at(3, day=1)) == ("open", "04:00")
    assert open_status(slots, at(5, day=1))[0] == "closed"
    assert open_status(slots, at(21))[0] == "closed"


def test_hours_closed_exception():
    assert open_status([Slot(0, time(8), time(18))], at(10), closed_today=True)[0] == "closed"


def test_budget_parsing():
    assert parse_budget(normalize("budget 20 000 fcfa")) == 20000
    assert parse_budget(normalize("15k pour deux")) == 15000
    assert parse_budget(normalize("à moins de 30 min")) is None
    assert parse_budget(normalize("pour 2 personnes")) is None


def test_intent_extraction():
    p = parse(
        "Un endroit calme au bord de l'eau pour un dîner romantique, 25 000 F max, à Cocody", {"Cocody": "cocody"}
    )
    assert "restaurant" in p.categories
    assert {"calme", "romantique", "plein-air"} <= set(p.ambiances)
    assert p.budget_max_fcfa == 25000
    assert p.district == "cocody"
    assert parse("un maquis pas cher entre potes").budget_max_fcfa == 10000
    assert parse("on sort maintenant").open_now is True


def test_no_routing_returns_nothing():
    assert NoRouting().durations((5.3, -4.0), [(5.31, -4.01)]) == [None]


def test_osrm_adapter_parses_and_degrades():
    ok = httpx.Client(
        transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"durations": [[0, 600, None]]}))
    )
    res = OsrmRouting("http://osrm", ok).durations((5.3, -4.0), [(5.31, -4.01), (5.32, -4.02)])
    assert res[0].minutes == 10 and res[0].source == "osrm" and res[1] is None
    ko = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert OsrmRouting("http://osrm", ko).durations((5.3, -4.0), [(5.31, -4.01)]) == [None]


def test_llm_extract_only_allowed_values_and_fails_safely():
    import json as _json

    text = _json.dumps(
        {"categories": ["plage", "inventee"], "ambiances": ["calme"], "open_now": True, "budget_max_fcfa": 9000}
    )
    body = {"content": [{"type": "text", "text": text}]}
    llm = AnthropicProvider(
        "k", "m", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body)))
    )
    p = llm.extract("...", {"plage": "Plages", "bar": "Bars"}, ["calme"])
    assert p.categories == ["plage"] and p.budget_max_fcfa == 9000 and p.open_now
    down = AnthropicProvider("k", "m", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503))))
    assert down.extract("...", {"plage": "Plages"}, []) is None and down.compose("...", []) is None


def test_openai_compatible_chain_falls_back_to_next_provider():
    from app.adapters.llm import ChainProvider, OpenAICompatibleProvider

    ok_body = {"choices": [{"message": {"content": '{"categories": ["bowling"], "ambiances": [], "open_now": false}'}}]}
    seen = []

    def groq(r):
        seen.append(("groq", r.url.host))
        return httpx.Response(429)

    def gemini(r):
        seen.append(("gemini", r.url.host))
        assert r.headers["authorization"] == "Bearer g-key"
        return httpx.Response(200, json=ok_body)

    chain = ChainProvider(
        [
            OpenAICompatibleProvider(
                "groq", "https://api.groq.com/openai/v1", "k", "m", httpx.Client(transport=httpx.MockTransport(groq))
            ),
            OpenAICompatibleProvider(
                "gemini", "https://gemini.test/v1", "g-key", "m", httpx.Client(transport=httpx.MockTransport(gemini))
            ),
        ]
    )
    p = chain.extract("un booling", {"bowling": "Bowling"}, [])
    assert p.categories == ["bowling"] and chain.name == "gemini" and [s[0] for s in seen] == ["groq", "gemini"]


def test_intent_understands_local_words_and_typos():
    from app.services.intent import parse

    assert parse("un booling entre amis").categories == ["bowling"]
    assert parse("karoke ce soir").categories == ["karaoke"]
    assert parse("où y a gbê ce soir ?").categories == ["club"]
    assert parse("chicha sympa").categories == ["lounge"]
    assert parse("moins cher").categories == []
    assert parse("nightclub").categories == ["club"]


def test_osm_leisure_centres_are_kept_and_sports_grounds_are_not():
    from app.importers.osm import is_excluded, osm_categories

    assert osm_categories({"leisure": "sports_centre", "sport": "10pin"}, "Strike Bowl") == ["bowling"]
    assert osm_categories({"leisure": "sports_centre", "sport": "karting"}, "SuperKart") == ["karting"]
    assert osm_categories({"leisure": "sports_centre", "sport": "multi"}, "International Club and Paintball Park") == [
        "paintball"
    ]
    assert osm_categories({"leisure": "sports_centre", "sport": "soccer"}, "Le Temple du Foot") == []
    assert osm_categories({"amenity": "fast_food", "brand": "KFC"}, "KFC Yopougon") == ["fast-food"]
    assert osm_categories({"amenity": "fast_food"}, "Garba chez Tantie") == ["maquis"]
    assert not is_excluded("Maquis L'Ambassade", {"amenity": "bar"}, ["bar", "maquis"])
    assert is_excluded("Ambassade de France", {"leisure": "garden"}, ["nature"])
    assert is_excluded("Ex-cinema Benin", {"amenity": "cinema"}, ["cinema"])


def test_find_city_in_message():
    from app.services.intent import find_city

    cities = {"Abidjan": "abidjan", "Grand-Bassam": "grand-bassam", "Assinie": "assinie"}
    assert find_city("une plage à Grand-Bassam ce week-end", cities) == "grand-bassam"
    assert find_city("on va à Bassam ?", cities) == "grand-bassam"
    assert find_city("un maquis à Yopougon", cities) is None


def test_osrm_route_returns_path_and_fails_safely():
    from app.adapters.routing import OsrmRouting

    body = {
        "routes": [
            {
                "duration": 1080.0,
                "distance": 7240.0,
                "geometry": {"coordinates": [[-4.0, 5.3], [-3.99, 5.31], [-3.98, 5.32]]},
            }
        ]
    }
    seen = []

    def ok(r):
        seen.append(str(r.url))
        return httpx.Response(200, json=body)

    route = OsrmRouting("http://osrm", httpx.Client(transport=httpx.MockTransport(ok))).route(
        (5.3, -4.0), (5.32, -3.98)
    )
    assert route.minutes == 18 and route.distance_km == 7.2 and route.path[0] == (5.3, -4.0)
    assert "/route/v1/driving/-4.0,5.3;-3.98,5.32" in seen[0]
    ko = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    assert OsrmRouting("http://osrm", ko).route((5.3, -4.0), (5.32, -3.98)) is None


def test_google_places_links_only_matching_names_and_caps_daily_calls():
    from app.adapters.google_places import GooglePlaces, same_place

    assert same_place("Strike Bowl", "Strike Bowl Abidjan") and same_place("Maquis Chez Ambroise", "Chez Ambroise")
    assert not same_place("Maquis Le Baobab", "Restaurant Le Wafou")

    def handler(r: httpx.Request) -> httpx.Response:
        assert r.headers["x-goog-api-key"] == "k"
        if r.url.path.endswith(":searchText"):
            return httpx.Response(200, json={"places": [{"id": "G1", "displayName": {"text": "Strike Bowl"}}]})
        if r.url.path.endswith("/media"):
            return httpx.Response(200, json={"photoUri": "https://lh3.googleusercontent.com/x"})
        return httpx.Response(
            200,
            json={"photos": [{"name": "places/G1/photos/P1", "authorAttributions": [{"displayName": "Awa"}]}]},
        )

    g = GooglePlaces("k", daily_cap=2, client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert g.find_place_id("Strike Bowl", 5.3, -4.0, "Abidjan") == "G1"
    assert g.find_place_id("Le Wafou", 5.3, -4.0, "Abidjan") is None
    photos = g.photos("G1")
    assert photos[0].credit == "Photo : Awa · Google"
    assert g.photo_uri(photos[0].name) == "https://lh3.googleusercontent.com/x"
    assert g.photos("G1") == photos  # en cache, pas de nouvel appel
    g._uris.clear()
    assert g.photo_uri(photos[0].name) is None  # plafond quotidien atteint (2 appels)
