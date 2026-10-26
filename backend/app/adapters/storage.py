"""Stockage objet (S3 compatible). La base ne contient que des clés ; l'URL publique est dérivée ici."""

from app.config import get_settings


def public_url(key: str | None) -> str | None:
    base = get_settings().media_base_url
    if not key or not base:
        return None
    return f"{base.rstrip('/')}/{key.lstrip('/')}"
