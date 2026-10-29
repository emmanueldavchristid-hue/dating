"""Stockage des médias. La base ne contient que des clés ; les fichiers vivent hors de PostgreSQL.

- Local (défaut, développement et test sur PC) : dossier MEDIA_DIR servi par l'API sous /media.
- Production : un bucket S3 compatible derrière MEDIA_BASE_URL (CDN) ; l'écriture S3 se branche dans `save`."""

import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings
from app.errors import ApiError

MAX_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1600
ALLOWED = {"JPEG", "PNG", "WEBP", "MPO", "HEIF"}


def public_url(key: str | None) -> str | None:
    if not key:
        return None
    s = get_settings()
    base = s.media_base_url or f"{s.public_base_url.rstrip('/')}/media"
    return f"{base.rstrip('/')}/{key.lstrip('/')}"


def process_image(data: bytes) -> tuple[bytes, int, int]:
    """Vérifie que c'est une vraie image, la redresse, la réduit et la réencode en JPEG :
    les métadonnées (dont la position GPS de l'appareil) sont supprimées."""
    if len(data) > MAX_BYTES:
        raise ApiError(413, "file_too_large", "Image trop lourde (8 Mo maximum)")
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.verify()
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError) as e:
        raise ApiError(400, "invalid_image", "Fichier image invalide") from e
    if fmt not in ALLOWED:
        raise ApiError(400, "invalid_image", "Formats acceptés : JPEG, PNG, WebP")
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue(), img.width, img.height


def save(prefix: str, data: bytes) -> str:
    key = f"{prefix.strip('/')}/{uuid.uuid4().hex}.jpg"
    path = Path(get_settings().media_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def delete(key: str | None) -> None:
    if key:
        (Path(get_settings().media_dir) / key).unlink(missing_ok=True)
