"""Payments: 1) create order  2) verify what Razorpay Checkout returned  3) webhook safety net."""
import json
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..errors import HttpError, bad_request, forbidden, not_found
from ..models import CREATED, FAILED, PENDING, Booking, Payment, User, utcnow
from ..schemas import OrderIn, VerifyIn
from ..security import current_user
from ..serializers import booking_out
from ..services.booking import mark_payment_paid
from ..services.payment import (create_gateway_order, public_payment_config, verify_checkout_signature,
                                verify_webhook_signature)
from .bookings import load_own_booking

router = APIRouter(prefix="/payments", tags=["payments"])
log = logging.getLogger("ayana")


@router.get("/config")
def config():
    return public_payment_config()


@router.post("/order", status_code=201)
def create_order(data: OrderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    b = db.get(Booking, data.booking_id)
    if not b:
        raise not_found("Booking not found")
    if b.user_id != user.id:
        raise forbidden()
    if b.status != PENDING:
        raise bad_request(f"Booking is {b.status.lower()}")
    if b.expires_at < utcnow():
        raise bad_request("Seat hold expired, please book again")
    try:
        order = create_gateway_order(b.amount, b.currency, b.booking_ref, {"bookingId": b.id, "bookingRef": b.booking_ref})
    except Exception:
        log.exception("Razorpay order failed")
        raise HttpError(502, "Payment service is not reachable. Please try again in a minute.")
    mode = get_settings().payment_mode
    db.add(Payment(booking_id=b.id, provider=mode, provider_order_id=order["id"], amount=b.amount, currency=b.currency))
    db.commit()
    return {
        "mode": mode, "orderId": order["id"], "amount": b.amount, "currency": b.currency,
        "keyId": public_payment_config()["keyId"], "name": "Ayana", "description": b.package.title,
        "prefill": {"name": b.contact_name, "email": user.email, "contact": b.contact_phone},
        "bookingRef": b.booking_ref,
    }


@router.post("/verify")
def verify(data: VerifyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    payment = db.scalar(select(Payment).where(Payment.provider_order_id == data.razorpay_order_id))
    if not payment:
        raise not_found("Payment order not found")
    if payment.booking.user_id != user.id:
        raise forbidden()
    if get_settings().payment_mode == "razorpay":
        if not verify_checkout_signature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature):
            payment.status = FAILED
            db.commit()
            raise bad_request("Payment verification failed")
    elif payment.provider != "mock":
        raise bad_request("Mock payments are disabled")
    booking = mark_payment_paid(db, data.razorpay_order_id, data.razorpay_payment_id, data.model_dump())
    return {"booking": booking_out(load_own_booking(db, booking.id, user))}


async def razorpay_webhook(request: Request):
    """Razorpay calls this server-to-server (even if the customer closed the tab).
    The signature is checked on the exact raw bytes received."""
    raw = await request.body()
    if not verify_webhook_signature(raw, request.headers.get("x-razorpay-signature")):
        raise bad_request("Invalid signature")
    event = json.loads(raw)
    entity = (event.get("payload", {}).get("payment") or {}).get("entity") or {}
    order_id = entity.get("order_id")
    from ..db import SessionLocal

    with SessionLocal() as db:
        if event.get("event") in ("payment.captured", "order.paid") and order_id:
            try:
                mark_payment_paid(db, order_id, entity.get("id"), entity)
            except HttpError as err:
                log.error("Webhook could not mark payment paid: %s", err.message)
        elif event.get("event") == "payment.failed" and order_id:
            db.execute(update(Payment).where(Payment.provider_order_id == order_id, Payment.status == CREATED)
                       .values(status=FAILED, raw_response=entity))
            db.commit()
    return {"received": True}
