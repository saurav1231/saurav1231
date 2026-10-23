"""Customer bookings: create, list mine, view one, cancel unpaid."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..errors import forbidden, not_found
from ..models import ADMIN, Booking, Package, User
from ..schemas import BookingIn
from ..security import current_user
from ..serializers import booking_out
from ..services.booking import cancel_pending_booking, create_booking

router = APIRouter(prefix="/bookings", tags=["bookings"])

LOAD = (selectinload(Booking.package).selectinload(Package.images), selectinload(Booking.departure),
        selectinload(Booking.payments), selectinload(Booking.user))


def load_own_booking(db: Session, booking_id: str, user: User) -> Booking:
    b = db.scalar(select(Booking).where(Booking.id == booking_id).options(*LOAD))
    if not b:
        raise not_found("Booking not found")
    if b.user_id != user.id and user.role != ADMIN:
        raise forbidden()
    return b


@router.post("", status_code=201)
def create(data: BookingIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    booking = create_booking(db, user, data)
    return {"booking": booking_out(load_own_booking(db, booking.id, user))}


@router.get("/me")
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Booking).where(Booking.user_id == user.id).order_by(Booking.created_at.desc()).options(*LOAD)).all()
    return {"bookings": [booking_out(b) for b in rows]}


@router.get("/{booking_id}")
def one(booking_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"booking": booking_out(load_own_booking(db, booking_id, user))}


@router.post("/{booking_id}/cancel")
def cancel(booking_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = load_own_booking(db, booking_id, user)
    cancel_pending_booking(db, b)
    return {"booking": booking_out(load_own_booking(db, booking_id, user))}
