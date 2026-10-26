"""Modèle relationnel. Voir docs/DATABASE.md pour les choix (index, volumétrie, partitionnement)."""
import uuid
from datetime import date, datetime, time

from geoalchemy2 import Geography
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Column,
    Computed,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def uid() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ---------- Référentiels géographiques et taxonomie ----------

class City(Base):
    __tablename__ = "cities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    country_code: Mapped[str] = mapped_column(String(2), default="CI")
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Abidjan")
    center = mapped_column(Geography("POINT", srid=4326), nullable=False)
    districts: Mapped[list["District"]] = relationship(back_populates="city", order_by="District.name")


class District(Base):
    __tablename__ = "districts"
    __table_args__ = (UniqueConstraint("city_id", "slug"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="CASCADE"))
    slug: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(120))
    center = mapped_column(Geography("POINT", srid=4326), nullable=True)
    city: Mapped[City] = relationship(back_populates="districts")


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(64))
    sort: Mapped[int] = mapped_column(SmallInteger, default=0)


class Ambiance(Base):
    __tablename__ = "ambiances"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class DataSource(Base):
    """Provenance des données : démo, OSM, partenaire, curation, utilisateur."""
    __tablename__ = "data_sources"
    __table_args__ = (CheckConstraint("kind in ('demo','osm','partner','curated','user')"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(120), unique=True)
    license: Mapped[str | None] = mapped_column(String(120))
    attribution: Mapped[str | None] = mapped_column(String(255))


class Partner(Base):
    __tablename__ = "partners"
    id: Mapped[uuid.UUID] = uid()
    name: Mapped[str] = mapped_column(String(160))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(16), default="prospect")
    created_at: Mapped[datetime] = created()


# ---------- Lieux ----------

place_categories = Table(
    "place_categories", Base.metadata,
    Column("place_id", UUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
    Index("ix_place_categories_category", "category_id"),
)
place_ambiances = Table(
    "place_ambiances", Base.metadata,
    Column("place_id", UUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
    Column("ambiance_id", Integer, ForeignKey("ambiances.id", ondelete="CASCADE"), primary_key=True),
    Index("ix_place_ambiances_ambiance", "ambiance_id"),
)
place_tags = Table(
    "place_tags", Base.metadata,
    Column("place_id", UUID(as_uuid=True), ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Place(Base):
    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint("price_level between 1 and 4", name="ck_places_price_level"),
        CheckConstraint("budget_min_fcfa is null or budget_max_fcfa is null or budget_min_fcfa <= budget_max_fcfa", name="ck_places_budget"),
        CheckConstraint("confidence between 0 and 1", name="ck_places_confidence"),
        CheckConstraint("tier in ('free','premium')", name="ck_places_tier"),
        CheckConstraint("status in ('draft','published','closed','archived')", name="ck_places_status"),
        Index("ix_places_location", "location", postgresql_using="gist"),
        Index("ix_places_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_places_category_slugs", "category_slugs", postgresql_using="gin"),
        Index("ix_places_ambiance_slugs", "ambiance_slugs", postgresql_using="gin"),
        Index("ix_places_city_status_tier", "city_id", "status", "tier"),
        Index("ix_places_name_trgm", "name", postgresql_using="gin", postgresql_ops={"name": "gin_trgm_ops"}),
    )
    id: Mapped[uuid.UUID] = uid()
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    short_description: Mapped[str] = mapped_column(String(280), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id"))
    district_id: Mapped[int | None] = mapped_column(ForeignKey("districts.id"))
    address: Mapped[str | None] = mapped_column(String(255))
    location = mapped_column(Geography("POINT", srid=4326, spatial_index=False), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))
    website: Mapped[str | None] = mapped_column(String(255))
    price_level: Mapped[int | None] = mapped_column(SmallInteger)
    budget_min_fcfa: Mapped[int | None] = mapped_column(Integer)
    budget_max_fcfa: Mapped[int | None] = mapped_column(Integer)
    tier: Mapped[str] = mapped_column(String(8), default="free")
    status: Mapped[str] = mapped_column(String(12), default="published")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id"))
    external_ref: Mapped[str | None] = mapped_column(String(120))
    partner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("partners.id", ondelete="SET NULL"))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    # Agrégats dénormalisés (maintenus par les services) pour éviter les jointures dans le parcours critique
    rating_avg: Mapped[float | None] = mapped_column(Float)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    popularity: Mapped[int] = mapped_column(Integer, default=0)
    category_slugs: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    ambiance_slugs: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    cover_key: Mapped[str | None] = mapped_column(String(255))  # clé objet S3 de la couverture
    cover_gradient: Mapped[list[str]] = mapped_column(ARRAY(String(9)), default=lambda: ["#1E3A4C", "#0E0F13"])
    # Équipements : null = inconnu (jamais supposé)
    has_parking: Mapped[bool | None] = mapped_column(Boolean)
    wheelchair: Mapped[bool | None] = mapped_column(Boolean)
    wifi: Mapped[bool | None] = mapped_column(Boolean)
    card_payment: Mapped[bool | None] = mapped_column(Boolean)
    mobile_money: Mapped[bool | None] = mapped_column(Boolean)
    outdoor: Mapped[bool | None] = mapped_column(Boolean)
    reviews_summary: Mapped[str | None] = mapped_column(Text)
    search_vector = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('simple', f_unaccent(coalesce(name,'') || ' ' || coalesce(short_description,'') || ' ' || coalesce(description,'')))", persisted=True),
    )
    embedding = mapped_column(Vector(384), nullable=True)  # préparé pour la recherche sémantique
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    city: Mapped[City] = relationship()
    district: Mapped[District | None] = relationship()
    source: Mapped[DataSource | None] = relationship()
    categories: Mapped[list[Category]] = relationship(secondary=place_categories)
    ambiances: Mapped[list[Ambiance]] = relationship(secondary=place_ambiances)
    hours: Mapped[list["OpeningHours"]] = relationship(cascade="all, delete-orphan", order_by="OpeningHours.weekday")
    media: Mapped[list["Media"]] = relationship(cascade="all, delete-orphan", order_by="Media.position")


class OpeningHours(Base):
    """Créneau hebdomadaire. closes <= opens signifie une fermeture après minuit."""
    __tablename__ = "opening_hours"
    __table_args__ = (CheckConstraint("weekday between 0 and 6"), Index("ix_opening_hours_place_day", "place_id", "weekday"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    weekday: Mapped[int] = mapped_column(SmallInteger)  # 0 = lundi
    opens: Mapped[time] = mapped_column(Time)
    closes: Mapped[time] = mapped_column(Time)


class OpeningException(Base):
    __tablename__ = "opening_exceptions"
    __table_args__ = (UniqueConstraint("place_id", "day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(Date)
    closed: Mapped[bool] = mapped_column(Boolean, default=True)
    opens: Mapped[time | None] = mapped_column(Time)
    closes: Mapped[time | None] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(String(255))


class Media(Base):
    """Métadonnées des médias. Les fichiers vivent dans un stockage objet (S3), jamais en base."""
    __tablename__ = "media"
    __table_args__ = (Index("ix_media_place", "place_id", "position"),)
    id: Mapped[uuid.UUID] = uid()
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    storage_key: Mapped[str | None] = mapped_column(String(255))
    gradient: Mapped[list[str]] = mapped_column(ARRAY(String(9)), default=list)
    alt: Mapped[str] = mapped_column(String(255), default="")
    credit: Mapped[str | None] = mapped_column(String(160))
    license: Mapped[str | None] = mapped_column(String(80))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(SmallInteger, default=0)
    moderation_status: Mapped[str] = mapped_column(String(12), default="approved")
    created_at: Mapped[datetime] = created()


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_place_start", "place_id", "starts_at"),)
    id: Mapped[uuid.UUID] = uid()
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_fcfa: Mapped[int | None] = mapped_column(Integer)


# ---------- Utilisateurs, droits, abonnements ----------

class Plan(Base):
    __tablename__ = "plans"
    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    price_fcfa: Mapped[int | None] = mapped_column(Integer)  # null = prix non fixé
    concierge_per_day: Mapped[int] = mapped_column(Integer)
    itinerary_max_steps: Mapped[int] = mapped_column(SmallInteger)
    can_see_gems: Mapped[bool] = mapped_column(Boolean, default=False)
    features: Mapped[list[str]] = mapped_column(ARRAY(String(160)), default=list)
    sort: Mapped[int] = mapped_column(SmallInteger, default=0)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role in ('user','curator','admin')", name="ck_users_role"),
        Index("ix_users_email_lower", func.lower(text("email")), unique=True),
    )
    id: Mapped[uuid.UUID] = uid()
    email: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(10), default="user")
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code"), default="free")
    location_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    location_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = created()
    plan: Mapped[Plan] = relationship(lazy="joined")
    preferences: Mapped["UserPreferences | None"] = relationship(uselist=False, cascade="all, delete-orphan", lazy="joined")


class UserPreferences(Base):
    __tablename__ = "user_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    categories: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    ambiances: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    budget_max_fcfa: Mapped[int | None] = mapped_column(Integer)
    home_city: Mapped[str | None] = mapped_column(String(64))


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (Index("ix_subscriptions_user", "user_id", "status"),)
    id: Mapped[uuid.UUID] = uid()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code"))
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|active|canceled|expired
    provider: Mapped[str] = mapped_column(String(32))
    provider_ref: Mapped[str | None] = mapped_column(String(120))
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created()


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("provider", "provider_ref"), Index("ix_payments_user", "user_id", "created_at"))
    id: Mapped[uuid.UUID] = uid()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subscriptions.id", ondelete="SET NULL"))
    amount_fcfa: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="XOF")
    provider: Mapped[str] = mapped_column(String(32))
    provider_ref: Mapped[str] = mapped_column(String(120))
    method: Mapped[str | None] = mapped_column(String(32))  # orange_money | wave | mtn_momo | card
    status: Mapped[str] = mapped_column(String(16))  # pending|succeeded|failed|refunded
    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created()


# ---------- Contenus utilisateurs ----------

class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("place_id", "user_id"),
        CheckConstraint("rating between 1 and 5"),
        Index("ix_reviews_place_created", "place_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = uid()
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    rating: Mapped[int] = mapped_column(SmallInteger)
    text: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="published")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created()
    user: Mapped[User | None] = relationship()


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("kind in ('closed','wrong_hours','wrong_location','wrong_price','other')"),
        CheckConstraint("status in ('open','resolved','rejected')"),
        Index("ix_reports_status_created", "status", "created_at"),
    )
    id: Mapped[uuid.UUID] = uid()
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(10), default="open")
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created()
    place: Mapped[Place] = relationship(foreign_keys=[place_id])


class Favorite(Base):
    __tablename__ = "favorites"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created()


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (Index("ix_collections_user", "user_id"),)
    id: Mapped[uuid.UUID] = uid()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))  # null = éditoriale
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(500), default="")
    is_editorial: Mapped[bool] = mapped_column(Boolean, default=False)
    premium_only: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = created()


class CollectionItem(Base):
    __tablename__ = "collection_items"
    collection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True)
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created()


class Itinerary(Base):
    __tablename__ = "itineraries"
    __table_args__ = (Index("ix_itineraries_user", "user_id", "created_at"),)
    id: Mapped[uuid.UUID] = uid()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    day: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = created()
    steps: Mapped[list["ItineraryStep"]] = relationship(cascade="all, delete-orphan", order_by="ItineraryStep.position")


class ItineraryStep(Base):
    __tablename__ = "itinerary_steps"
    __table_args__ = (UniqueConstraint("itinerary_id", "position"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    itinerary_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("itineraries.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(SmallInteger)
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    start_time: Mapped[time | None] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(String(280))
    place: Mapped[Place] = relationship()


class SearchHistory(Base):
    """Historique minimal : zone approximative (≈1 km), purgé après N jours. Candidat au partitionnement mensuel."""
    __tablename__ = "search_history"
    __table_args__ = (Index("ix_search_history_created", "created_at"), Index("ix_search_history_user", "user_id", "created_at"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    query: Mapped[str | None] = mapped_column(String(200))
    filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    approx_lat: Mapped[float | None] = mapped_column(Float)
    approx_lng: Mapped[float | None] = mapped_column(Float)
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = created()


class ConciergeUsage(Base):
    __tablename__ = "concierge_usage"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


# ---------- Curation, audit ----------

class CurationItem(Base):
    __tablename__ = "curation_items"
    __table_args__ = (
        CheckConstraint("status in ('pending','approved','rejected')"),
        Index("ix_curation_status", "status", "created_at"),
    )
    id: Mapped[uuid.UUID] = uid()
    place_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(String(40))  # gem_candidate | stale | contradictory | user_reports
    detail: Mapped[str] = mapped_column(String(500), default="")
    proposed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(10), default="pending")
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = created()
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    place: Mapped[Place] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_created", "created_at"), Index("ix_audit_entity", "entity_type", "entity_id"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = created()
