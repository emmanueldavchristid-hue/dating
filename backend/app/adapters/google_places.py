"""Photos des lieux via l'API officielle Google Places (New).

Règles (conditions Google Maps Platform) :
- seul l'identifiant Google du lieu (place_id) est conservé durablement (table place_external_ids) ;
- les photos ne sont jamais copiées : l'app les demande au moment de l'affichage, via notre serveur,
  qui garde la clé secrète et redirige vers l'adresse temporaire fournie par Google ;
- l'auteur de chaque photo est crédité, avec la mention Google.
Les noms de photos sont gardés au plus une heure en mémoire (performance) et un plafond quotidien évite
toute dépense surprise (GOOGLE_PHOTOS_DAILY_CAP)."""

import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import date
from threading import Lock

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)
BASE = "https://places.googleapis.com/v1"
CACHE_TTL_S = 3600


@dataclass(frozen=True)
class GooglePhoto:
    name: str  # identifiant de la photo chez Google (temporaire)
    credit: str  # « Photo : <auteur> · Google »


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(re.findall(r"[a-z0-9]+", s))


def same_place(ours: str, theirs: str) -> bool:
    """Le résultat Google est-il bien notre lieu ? Au moins un mot distinctif en commun (ou un nom inclus)."""
    a, b = _norm(ours), _norm(theirs)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    generic = {"restaurant", "maquis", "bar", "le", "la", "les", "chez", "de", "du", "des", "cafe", "club", "lounge"}
    wa = {w for w in a.split() if len(w) > 2 and w not in generic}
    return bool(wa & set(b.split()))


class GooglePlaces:
    def __init__(self, api_key: str, daily_cap: int, client: httpx.Client | None = None) -> None:
        self.api_key, self.daily_cap = api_key, daily_cap
        self.client = client or httpx.Client(timeout=10.0)
        self._cache: dict[str, tuple[float, list[GooglePhoto]]] = {}
        self._uris: dict[tuple[str, int], tuple[float, str]] = {}
        self._day, self._count = date.today(), 0
        self._lock = Lock()

    def _budget(self) -> bool:
        with self._lock:
            if self._day != date.today():
                self._day, self._count = date.today(), 0
            if self._count >= self.daily_cap:
                return False
            self._count += 1
            return True

    def find_place_id(self, name: str, lat: float, lng: float, city: str) -> str | None:
        """Recherche du lieu près de sa position ; renvoie son place_id seulement si le nom correspond."""
        try:
            r = self.client.post(
                f"{BASE}/places:searchText",
                headers={
                    "X-Goog-Api-Key": self.api_key,
                    "X-Goog-FieldMask": "places.id,places.displayName",
                    "Content-Type": "application/json",
                },
                json={
                    "textQuery": f"{name}, {city}",
                    "maxResultCount": 3,
                    "languageCode": "fr",
                    "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 300.0}},
                },
            )
            r.raise_for_status()
            for p in r.json().get("places", []):
                if same_place(name, (p.get("displayName") or {}).get("text", "")):
                    return p["id"]
        except (httpx.HTTPError, KeyError, ValueError) as e:
            log.warning("Google Places indisponible : %s", type(e).__name__)
        return None

    def photos(self, place_id: str) -> list[GooglePhoto]:
        hit = self._cache.get(place_id)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            return hit[1]
        if not self._budget():
            return []
        try:
            r = self.client.get(
                f"{BASE}/places/{place_id}",
                headers={"X-Goog-Api-Key": self.api_key, "X-Goog-FieldMask": "photos"},
            )
            r.raise_for_status()
            out = []
            for ph in r.json().get("photos", [])[:6]:
                authors = ", ".join(
                    a.get("displayName", "") for a in ph.get("authorAttributions", []) if a.get("displayName")
                )
                out.append(GooglePhoto(ph["name"], f"Photo : {authors} · Google" if authors else "Photo · Google"))
        except (httpx.HTTPError, KeyError, ValueError) as e:
            log.warning("Google Places indisponible : %s", type(e).__name__)
            return []
        self._cache[place_id] = (time.monotonic(), out)
        return out

    def photo_uri(self, photo_name: str, max_width: int = 1200) -> str | None:
        """Adresse temporaire de l'image chez Google (la clé reste sur le serveur)."""
        hit = self._uris.get((photo_name, max_width))
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S - 600:
            return hit[1]
        if not self._budget():
            return None
        try:
            r = self.client.get(
                f"{BASE}/{photo_name}/media",
                params={"maxWidthPx": max_width, "skipHttpRedirect": "true"},
                headers={"X-Goog-Api-Key": self.api_key},
            )
            r.raise_for_status()
            uri = r.json().get("photoUri")
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Google Places indisponible : %s", type(e).__name__)
            return None
        if uri:
            self._uris[(photo_name, max_width)] = (time.monotonic(), uri)
        return uri


_instance: GooglePlaces | None = None


def get_google() -> GooglePlaces | None:
    """None si aucune clé n'est configurée : l'app garde ses dégradés et ses propres photos."""
    global _instance
    s = get_settings()
    if not s.google_places_api_key:
        return None
    if _instance is None or _instance.api_key != s.google_places_api_key:
        _instance = GooglePlaces(s.google_places_api_key, s.google_photos_daily_cap)
    return _instance
