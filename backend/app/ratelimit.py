"""Limitation de débit en mémoire (fenêtre glissante par clé).

Suffisant pour une instance unique. En multi-instance, remplacer le stockage par Redis
(même interface `hit`)."""
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request

from app.config import get_settings
from app.errors import ApiError


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limit(scope: str, per_minute: int | None = None):
    def dependency(request: Request) -> None:
        n = per_minute or get_settings().rate_limit_per_minute
        if not limiter.hit(f"{scope}:{client_ip(request)}", n):
            raise ApiError(429, "rate_limited", "Trop de requêtes, réessaie dans un instant")
    return dependency
