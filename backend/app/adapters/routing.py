"""Fournisseurs d'itinéraires interchangeables. Par défaut : aucun → aucun temps de trajet n'est affiché.

On ne convertit JAMAIS une distance à vol d'oiseau en durée."""
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.config import get_settings


@dataclass(frozen=True)
class Travel:
    mode: str
    minutes: int
    source: str


class RoutingProvider(Protocol):
    name: str

    def durations(self, origin: tuple[float, float], dests: list[tuple[float, float]], mode: str = "driving") -> list[Travel | None]: ...


class NoRouting:
    name = "none"

    def durations(self, origin, dests, mode="driving"):
        return [None] * len(dests)


class OsrmRouting:
    """OSRM (service /table). Respecter les conditions d'usage du serveur utilisé ; préférer une instance auto-hébergée."""
    name = "osrm"

    def __init__(self, base_url: str, client: httpx.Client | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=3.0)

    def durations(self, origin, dests, mode="driving"):
        if not dests:
            return []
        profile = "driving" if mode == "driving" else "foot"
        coords = ";".join(f"{lng},{lat}" for lat, lng in [origin, *dests])
        try:
            r = self.client.get(f"{self.base_url}/table/v1/{profile}/{coords}", params={"sources": "0", "annotations": "duration"})
            r.raise_for_status()
            row = r.json()["durations"][0][1:]
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            return [None] * len(dests)
        return [Travel(mode, max(1, round(d / 60)), "osrm") if d is not None else None for d in row]


def get_routing() -> RoutingProvider:
    s = get_settings()
    if s.routing_provider == "osrm" and s.osrm_url:
        return OsrmRouting(s.osrm_url)
    return NoRouting()
