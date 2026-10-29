"""Schémas d'entrée/sortie conformes à docs/API.md."""

from datetime import date as Date
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Slug = str


class LatLng(BaseModel):
    lat: float
    lng: float


class Cover(BaseModel):
    url: str | None
    gradient: list[str]
    alt: str


class TravelOut(BaseModel):
    mode: str
    minutes: int
    source: str


class PlaceCard(BaseModel):
    id: str
    slug: str
    name: str
    short_description: str
    city: str
    district: str | None
    categories: list[str]
    ambiances: list[str]
    price_level: int | None
    budget_min_fcfa: int | None
    budget_max_fcfa: int | None
    rating_avg: float | None
    rating_count: int
    cover: Cover
    location: LatLng | None
    distance_km: float | None
    travel: TravelOut | None
    open_status: Literal["open", "closed", "unknown"]
    closes_at: str | None
    tier: Literal["free", "premium"]
    locked: bool
    is_demo: bool
    verified_at: datetime | None
    confidence: float
    score: float | None
    reasons: list[str]
    match: int | None = None


class Amenities(BaseModel):
    parking: bool | None
    wheelchair: bool | None
    wifi: bool | None
    card_payment: bool | None
    mobile_money: bool | None
    outdoor: bool | None


class HoursOut(BaseModel):
    weekday: int
    open: str
    close: str


class PhotoOut(BaseModel):
    id: str | None = None
    url: str | None
    gradient: list[str]
    alt: str
    credit: str | None


class ReviewOut(BaseModel):
    id: str
    author: str
    rating: int
    text: str
    created_at: datetime


class SourceOut(BaseModel):
    kind: str
    attribution: str | None


class EventOut(BaseModel):
    id: str
    title: str
    starts_at: datetime
    price_fcfa: int | None


class PlaceDetail(PlaceCard):
    description: str
    address: str | None
    phone: str | None
    website: str | None
    hours: list[HoursOut]
    amenities: Amenities
    photos: list[PhotoOut]
    reviews_summary: str | None
    reviews: list[ReviewOut]
    source: SourceOut
    events: list[EventOut]
    is_favorite: bool


class Origin(LatLng):
    source: Literal["gps", "city"]


class SearchResult(BaseModel):
    items: list[PlaceCard]
    total: int
    page: int
    page_size: int
    origin: Origin


class HomeSection(BaseModel):
    key: str
    title: str
    subtitle: str
    items: list[PlaceCard]


class HomeOut(BaseModel):
    sections: list[HomeSection]


# ---------- Utilisateur ----------


class Preferences(BaseModel):
    categories: list[str] = []
    ambiances: list[str] = []
    budget_max_fcfa: int | None = None
    home_city: str | None = None


class PreferencesPatch(BaseModel):
    categories: list[str] | None = Field(default=None, max_length=30)
    ambiances: list[str] | None = Field(default=None, max_length=20)
    budget_max_fcfa: int | None = Field(default=None, ge=0, le=10_000_000)
    home_city: str | None = Field(default=None, max_length=64)


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    plan: str
    preferences: Preferences
    location_consent: bool


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("display_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Nom requis")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ConsentIn(BaseModel):
    location: bool


# ---------- Contenus ----------


class ReportIn(BaseModel):
    kind: Literal["closed", "wrong_hours", "wrong_location", "wrong_price", "other"]
    message: str = Field(default="", max_length=1000)


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)


class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class CollectionSummary(BaseModel):
    id: str
    name: str
    description: str
    count: int


class CollectionDetail(BaseModel):
    id: str
    name: str
    description: str
    items: list[PlaceCard]


class CollectionItemIn(BaseModel):
    place_id: str


class ItineraryStepIn(BaseModel):
    place_id: str
    start_time: time | None = None
    note: str | None = Field(default=None, max_length=280)


class ItineraryIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    date: Date | None = None
    steps: list[ItineraryStepIn] = Field(min_length=1, max_length=10)


class ItineraryStepOut(BaseModel):
    position: int
    place: PlaceCard
    start_time: str | None
    note: str | None
    leg_km: float | None


class ItineraryOut(BaseModel):
    id: str
    title: str
    date: Date | None
    steps: list[ItineraryStepOut]


class ItinerarySummary(BaseModel):
    id: str
    title: str
    date: Date | None
    step_count: int


class SuggestIn(BaseModel):
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    city: str | None = None
    categories: list[str] = []
    ambiances: list[str] = []
    budget_max_fcfa: int | None = Field(default=None, ge=0)
    steps: int = Field(default=2, ge=2, le=5)


class SuggestStep(BaseModel):
    place: PlaceCard
    leg_km: float | None


class SuggestOut(BaseModel):
    steps: list[SuggestStep]
    total_budget_min_fcfa: int | None
    total_budget_max_fcfa: int | None
    notes: list[str]


class ConciergeIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    city: str | None = None


class Parsed(BaseModel):
    categories: list[str] = []
    ambiances: list[str] = []
    budget_max_fcfa: int | None = None
    open_now: bool = False
    q: str | None = None
    district: str | None = None


class Quota(BaseModel):
    used: int
    limit: int


class ConciergeOut(BaseModel):
    reply: str
    places: list[PlaceCard]
    parsed: Parsed
    provider: str
    retrieval: str = "lexical"
    quota: Quota


class PlanOut(BaseModel):
    code: str
    name: str
    price_fcfa: int | None
    features: list[str]
    quotas: dict


class SubscriptionOut(BaseModel):
    plan: str
    status: str
    current_period_end: datetime | None


class CheckoutIn(BaseModel):
    plan: Literal["plus", "insider"]


# ---------- Admin ----------


class AdminPlaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=160, pattern=r"^[a-z0-9-]+$")
    city: str
    district: str | None = None
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    categories: list[str] = Field(min_length=1)
    ambiances: list[str] = []
    short_description: str = Field(default="", max_length=280)
    description: str = ""
    price_level: int | None = Field(default=None, ge=1, le=4)
    budget_min_fcfa: int | None = Field(default=None, ge=0)
    budget_max_fcfa: int | None = Field(default=None, ge=0)
    tier: Literal["free", "premium"] = "free"
    status: Literal["draft", "published", "closed", "archived"] = "published"
    address: str | None = None
    phone: str | None = None
    website: str | None = None


class AdminPlacePatch(BaseModel):
    name: str | None = Field(default=None, max_length=160)
    short_description: str | None = Field(default=None, max_length=280)
    description: str | None = None
    tier: Literal["free", "premium"] | None = None
    status: Literal["draft", "published", "closed", "archived"] | None = None
    categories: list[str] | None = None
    ambiances: list[str] | None = None
    budget_min_fcfa: int | None = None
    budget_max_fcfa: int | None = None
    price_level: int | None = Field(default=None, ge=1, le=4)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    mark_verified: bool = False


class AdminUserPatch(BaseModel):
    role: Literal["user", "curator", "admin"] | None = None
    plan: Literal["free", "plus", "insider"] | None = None


class StatusPatch(BaseModel):
    status: Literal["open", "resolved", "rejected"]


class CurationDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str | None = Field(default=None, max_length=500)
