"""Database tables (SQLAlchemy). Alembic turns changes here into migrations.

Money is stored as whole paise (₹18,999 = 1899900) so there are no rounding errors.
All times are stored in UTC.
"""
import secrets
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# Status values (kept as plain strings so they read well in SQL and in Streamlit)
USER, ADMIN = "USER", "ADMIN"
PENDING, CONFIRMED, CANCELLED, EXPIRED = "PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"
CREATED, PAID, FAILED, REFUND_PENDING, REFUNDED = "CREATED", "PAID", "FAILED", "REFUND_PENDING", "REFUNDED"


def new_id() -> str:
    return secrets.token_hex(12)


def utcnow() -> datetime:
    # naive UTC datetime, which is what MySQL DATETIME stores
    return datetime.now(timezone.utc).replace(tzinfo=None)


# DATETIME with milliseconds on MySQL
Timestamp = DateTime().with_variant(mysql.DATETIME(fsp=3), "mysql")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(191), unique=True)
    phone: Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default=USER)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow, onupdate=utcnow)

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")


class Destination(Base):
    __tablename__ = "destinations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(191), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(80), default="India")
    description: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    image_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)

    packages: Mapped[list["Package"]] = relationship(back_populates="destination")


class Package(Base):
    __tablename__ = "packages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(191), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(String(400))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), index=True)  # Pilgrimage, Yoga Retreat, Trek ...
    duration_days: Mapped[int] = mapped_column(Integer)
    price_per_person: Mapped[int] = mapped_column(Integer)  # paise
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    image_url: Mapped[str | None] = mapped_column(String(500))
    highlights: Mapped[list] = mapped_column(JSON, default=list)
    inclusions: Mapped[list] = mapped_column(JSON, default=list)
    exclusions: Mapped[list] = mapped_column(JSON, default=list)
    max_group_size: Mapped[int] = mapped_column(Integer, default=20)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow, onupdate=utcnow)

    destination: Mapped[Destination] = relationship(back_populates="packages")
    images: Mapped[list["PackageImage"]] = relationship(
        back_populates="package", order_by="PackageImage.sort_order", cascade="all, delete-orphan"
    )
    itinerary: Mapped[list["ItineraryDay"]] = relationship(
        back_populates="package", order_by="ItineraryDay.day_number", cascade="all, delete-orphan"
    )
    departures: Mapped[list["Departure"]] = relationship(
        back_populates="package", order_by="Departure.start_date", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(back_populates="package", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_packages_active_featured", "is_active", "is_featured"),)


class PackageImage(Base):
    """Photos uploaded in admin. The lowest sort_order is the cover."""

    __tablename__ = "package_images"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(500))  # large, max 1600 px wide (webp)
    thumb_url: Mapped[str] = mapped_column(String(500))  # small, 640 px wide
    alt: Mapped[str] = mapped_column(String(200), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)

    package: Mapped[Package] = relationship(back_populates="images")
    __table_args__ = (Index("ix_package_images_order", "package_id", "sort_order"),)


class ItineraryDay(Base):
    __tablename__ = "itinerary_days"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    day_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)

    package: Mapped[Package] = relationship(back_populates="itinerary")
    __table_args__ = (UniqueConstraint("package_id", "day_number"),)


class Departure(Base):
    """A dated batch of a package with limited seats."""

    __tablename__ = "departures"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    start_date: Mapped[date] = mapped_column(Date)
    seats_total: Mapped[int] = mapped_column(Integer)
    seats_booked: Mapped[int] = mapped_column(Integer, default=0)  # includes seats held by unpaid bookings
    price_override: Mapped[int | None] = mapped_column(Integer)  # paise, replaces the package price for this date
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    package: Mapped[Package] = relationship(back_populates="departures")
    __table_args__ = (Index("ix_departures_package_date", "package_id", "start_date"),)


class Booking(Base):
    __tablename__ = "bookings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    booking_ref: Mapped[str] = mapped_column(String(20), unique=True)  # AYN-7K2P9Q
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id"))
    departure_id: Mapped[str] = mapped_column(ForeignKey("departures.id"))
    travelers: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)  # paise
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(20), default=PENDING)
    contact_name: Mapped[str] = mapped_column(String(120))
    contact_phone: Mapped[str] = mapped_column(String(20))
    special_requests: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(Timestamp)  # seat hold ends here if still unpaid
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="bookings")
    package: Mapped[Package] = relationship()
    departure: Mapped[Departure] = relationship()
    payments: Mapped[list["Payment"]] = relationship(back_populates="booking", order_by="Payment.created_at")
    __table_args__ = (Index("ix_bookings_status_expires", "status", "expires_at"),)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    booking_id: Mapped[str] = mapped_column(ForeignKey("bookings.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20), default="razorpay")
    provider_order_id: Mapped[str] = mapped_column(String(100), unique=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    amount: Mapped[int] = mapped_column(Integer)  # paise
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(20), default=CREATED)
    raw_response: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow, onupdate=utcnow)

    booking: Mapped[Booking] = relationship(back_populates="payments")


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    package_id: Mapped[str] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)  # 1..5
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(Timestamp, default=utcnow)

    user: Mapped[User] = relationship()
    package: Mapped[Package] = relationship(back_populates="reviews")
    __table_args__ = (UniqueConstraint("user_id", "package_id"),)
