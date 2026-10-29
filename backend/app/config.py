"""Configuration centralisée, lue depuis l'environnement (.env)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Sortie"  # nom de code, remplaçable
    environment: str = "development"
    database_url: str = "postgresql+psycopg://sortie:sortie@localhost:5432/sortie"

    jwt_secret: str = Field(default="dev-only-change-me-please-32-bytes-min")
    jwt_ttl_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    timezone: str = "Africa/Abidjan"
    default_city: str = "abidjan"

    # Adaptateurs (vides = désactivés, l'app fonctionne sans)
    routing_provider: str = "none"  # none | osrm
    osrm_url: str = ""  # ex. https://router.project-osrm.org (respecter ses conditions d'usage)
    llm_provider: str = "none"  # none | anthropic
    anthropic_api_key: str = ""
    llm_model: str = "claude-haiku-5-5"
    payments_provider: str = "none"  # none | (agrégateur Mobile Money à intégrer)
    map_provider: str = "osm"
    media_base_url: str = ""  # URL publique du bucket S3 / CDN (sinon : PUBLIC_BASE_URL/media)
    media_dir: str = "media"  # stockage local des photos envoyées
    public_base_url: str = "http://localhost:8000"  # adresse publique de l'API (ex. IP du PC sur le Wi-Fi)
    embeddings_provider: str = "hashing"  # hashing (hors ligne) | fastembed (modèle multilingue)
    google_places_api_key: str = ""  # optionnel : photos via l'API officielle Google Places (jamais stockées)

    # Vie privée & abus
    search_history_retention_days: int = 30
    rate_limit_per_minute: int = 120
    auth_rate_limit_per_minute: int = 10

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and s.jwt_secret.startswith("dev-only"):
        raise RuntimeError("JWT_SECRET doit être défini en production")
    return s
