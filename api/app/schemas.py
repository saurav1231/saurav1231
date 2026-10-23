"""Shapes of incoming request bodies. Field names arrive in camelCase from the website
(e.g. contactPhone) and are available here in snake_case (contact_phone)."""
import re
from datetime import date

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pydantic.alias_generators import to_camel


class In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


class RegisterIn(In):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    password: str = Field(min_length=8, max_length=100)


class LoginIn(In):
    email: EmailStr
    password: str = Field(min_length=1)


class ReviewIn(In):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=5, max_length=2000)


class BookingIn(In):
    package_slug: str = Field(min_length=1)
    departure_id: str = Field(min_length=1)
    travelers: int = Field(ge=1, le=50)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str = Field(min_length=7, max_length=20)
    special_requests: str | None = Field(default=None, max_length=2000)


class OrderIn(In):
    booking_id: str = Field(min_length=1)


class VerifyIn(BaseModel):  # Razorpay sends snake_case names
    razorpay_order_id: str = Field(min_length=1)
    razorpay_payment_id: str = Field(min_length=1)
    razorpay_signature: str | None = None


class ItineraryDayIn(In):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)


SLUG = re.compile(r"^[a-z0-9-]+$")


class PackageIn(In):
    slug: str
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(min_length=10, max_length=400)
    description: str = Field(min_length=10)
    category: str = Field(min_length=2, max_length=60)
    duration_days: int = Field(ge=1, le=60)
    price_per_person: int = Field(ge=100)  # paise
    image_url: str | None = Field(default=None, max_length=500)
    highlights: list[str] = []
    inclusions: list[str] = []
    exclusions: list[str] = []
    max_group_size: int = Field(default=20, ge=1, le=500)
    is_active: bool = True
    is_featured: bool = False
    destination_id: str = Field(min_length=1)
    itinerary: list[ItineraryDayIn] = []

    @field_validator("slug")
    @classmethod
    def slug_ok(cls, v):
        if not SLUG.match(v):
            raise ValueError("lowercase letters, numbers and dashes only")
        return v

    @field_validator("image_url")
    @classmethod
    def url_ok(cls, v):
        if v and not re.match(r"^https?://", v):
            raise ValueError("must start with http:// or https://")
        return v or None


class DepartureIn(In):
    start_date: date
    seats_total: int = Field(ge=1, le=1000)
    price_override: int | None = Field(default=None, ge=100)
    is_active: bool = True


class DeparturePatch(In):
    start_date: date | None = None
    seats_total: int | None = Field(default=None, ge=1, le=1000)
    price_override: int | None = Field(default=None, ge=100)
    is_active: bool | None = None


class DestinationIn(In):
    slug: str
    name: str = Field(min_length=2, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    country: str = Field(default="India", max_length=80)
    description: str = Field(min_length=5)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    image_url: str | None = Field(default=None, max_length=500)

    @field_validator("slug")
    @classmethod
    def slug_ok(cls, v):
        if not SLUG.match(v):
            raise ValueError("lowercase letters, numbers and dashes only")
        return v


class ImageOrderIn(In):
    ids: list[str] = Field(min_length=1)


class ImagePatch(In):
    alt: str = Field(max_length=200)
