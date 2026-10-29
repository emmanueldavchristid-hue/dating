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
    body = {
        "content": [
            {
                "type": "tool_use",
                "name": "set_filters",
                "input": {
                    "categories": ["plage", "inventee"],
                    "ambiances": ["calme"],
                    "open_now": True,
                    "budget_max_fcfa": 9000,
                },
            }
        ]
    }
    llm = AnthropicProvider(
        "k", "m", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body)))
    )
    p = llm.extract("...", ["plage", "bar"], ["calme"])
    assert p.categories == ["plage"] and p.budget_max_fcfa == 9000 and p.open_now
    down = AnthropicProvider("k", "m", httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503))))
    assert down.extract("...", ["plage"], []) is None and down.compose("...", []) is None


def test_find_city_in_message():
    from app.services.intent import find_city

    cities = {"Abidjan": "abidjan", "Grand-Bassam": "grand-bassam", "Assinie": "assinie"}
    assert find_city("une plage à Grand-Bassam ce week-end", cities) == "grand-bassam"
    assert find_city("on va à Bassam ?", cities) == "grand-bassam"
    assert find_city("un maquis à Yopougon", cities) is None
