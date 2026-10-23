"""Business rules for bookings: seat holds, cancellations, expiry and confirming payments."""
import logging
import secrets
from datetime import date, timedelta

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import SessionLocal
from ..errors import bad_request, conflict, not_found
from ..models import (CANCELLED, CONFIRMED, EXPIRED, PAID, PENDING, REFUND_PENDING, REFUNDED, Booking, Departure,
                      Package, Payment, Review, User, utcnow)
from ..schemas import BookingIn
from ..serializers import unit_price

log = logging.getLogger("ayana")
REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read on the phone


def new_booking_ref() -> str:
    return "AYN-" + "".join(secrets.choice(REF_ALPHABET) for _ in range(6))


def hold_seats(db: Session, departure_id: str, count: int) -> bool:
    """Takes seats in ONE SQL statement, so two people can never get the last seat."""
    result = db.execute(
        text("UPDATE departures SET seats_booked = seats_booked + :n "
             "WHERE id = :id AND is_active = 1 AND seats_booked + :n <= seats_total"),
        {"n": count, "id": departure_id},
    )
    return result.rowcount == 1


def release_seats(db: Session, departure_id: str, count: int) -> None:
    db.execute(
        text("UPDATE departures SET seats_booked = GREATEST(seats_booked - :n, 0) WHERE id = :id"),
        {"n": count, "id": departure_id},
    )


def create_booking(db: Session, user: User, data: BookingIn) -> Booking:
    """PENDING booking that holds seats until paid or expired. The price is always worked out here."""
    pkg = db.scalar(select(Package).where(Package.slug == data.package_slug, Package.is_active.is_(True)))
    if not pkg:
        raise not_found("Package not found")
    dep = db.scalar(select(Departure).where(Departure.id == data.departure_id, Departure.package_id == pkg.id,
                                            Departure.is_active.is_(True)))
    if not dep:
        raise not_found("Departure date not found")
    if dep.start_date < date.today():
        raise bad_request("This departure has already started")
    if data.travelers > pkg.max_group_size:
        raise bad_request(f"Max {pkg.max_group_size} travellers per booking")

    if not hold_seats(db, dep.id, data.travelers):
        db.rollback()
        raise conflict("Not enough seats left on this date")
    booking = Booking(
        booking_ref=new_booking_ref(), user_id=user.id, package_id=pkg.id, departure_id=dep.id,
        travelers=data.travelers, amount=unit_price(pkg, dep) * data.travelers, currency=pkg.currency,
        contact_name=data.contact_name, contact_phone=data.contact_phone,
        special_requests=data.special_requests or None,
        expires_at=utcnow() + timedelta(minutes=get_settings().booking_hold_minutes),
    )
    db.add(booking)
    db.commit()  # seat hold and booking are saved together
    return booking


def cancel_pending_booking(db: Session, booking: Booking) -> Booking:
    changed = db.execute(update(Booking).where(Booking.id == booking.id, Booking.status == PENDING)
                         .values(status=CANCELLED, updated_at=utcnow())).rowcount
    if changed != 1:
        db.rollback()
        raise bad_request("Only unpaid bookings can be cancelled online. Contact us for paid bookings.")
    release_seats(db, booking.departure_id, booking.travelers)
    db.commit()
    db.refresh(booking)
    return booking


def expire_stale_bookings() -> int:
    """Runs every minute: unpaid bookings past their hold time become EXPIRED and free their seats."""
    with SessionLocal() as db:
        stale = db.scalars(select(Booking).where(Booking.status == PENDING, Booking.expires_at < utcnow()).limit(200)).all()
        for b in stale:
            changed = db.execute(update(Booking).where(Booking.id == b.id, Booking.status == PENDING)
                                 .values(status=EXPIRED, updated_at=utcnow())).rowcount
            if changed == 1:
                release_seats(db, b.departure_id, b.travelers)
            db.commit()
        return len(stale)


def mark_payment_paid(db: Session, provider_order_id: str, provider_payment_id: str, raw: dict | None) -> Booking:
    """Called by /payments/verify AND by the Razorpay webhook. Safe to call twice."""
    payment = db.scalar(select(Payment).where(Payment.provider_order_id == provider_order_id).with_for_update())
    if not payment:
        raise not_found("Payment order not found")
    booking = db.get(Booking, payment.booking_id)
    if payment.status in (PAID, REFUND_PENDING, REFUNDED):
        db.rollback()
        return booking

    new_status = PAID
    confirmed = db.execute(update(Booking).where(Booking.id == booking.id, Booking.status == PENDING)
                           .values(status=CONFIRMED, updated_at=utcnow())).rowcount
    if confirmed == 0:
        db.refresh(booking)
        if booking.status == CONFIRMED:
            new_status = REFUND_PENDING  # already paid through another order: duplicate payment
        elif hold_seats(db, booking.departure_id, booking.travelers):
            booking.status = CONFIRMED  # expired/cancelled before the money arrived, seats still free
        else:
            new_status = REFUND_PENDING
            log.warning("Booking %s paid but sold out. Refund needed.", booking.booking_ref)

    payment.status = new_status
    payment.provider_payment_id = provider_payment_id
    payment.raw_response = raw
    db.commit()
    db.refresh(booking)
    return booking


def refresh_package_rating(db: Session, package_id: str) -> None:
    avg, count = db.execute(select(func.avg(Review.rating), func.count(Review.id)).where(Review.package_id == package_id)).one()
    pkg = db.get(Package, package_id)
    pkg.rating_avg = round(float(avg or 0), 2)
    pkg.rating_count = count
    db.commit()
