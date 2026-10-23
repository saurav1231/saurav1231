import hashlib
import hmac
import io
import json

from PIL import Image
from sqlalchemy import update

from app.config import get_settings
from app.db import SessionLocal
from app.models import Booking, utcnow
from app.services.booking import expire_stale_bookings

from .conftest import auth


def first_departure(client, slug="golden-temple-seva"):
    return client.get(f"/api/packages/{slug}").json()["package"]["departures"][0]


def book(client, token, travelers=2, slug="golden-temple-seva", dep=None):
    dep = dep or first_departure(client, slug)
    return client.post("/api/bookings", headers=auth(token), json={
        "packageSlug": slug, "departureId": dep["id"], "travelers": travelers,
        "contactName": "Test Pilgrim", "contactPhone": "9999999999"})


def test_catalog(client):
    assert client.get("/api/health").json()["ok"] is True
    data = client.get("/api/packages", params={"limit": 3, "sort": "price_asc"}).json()
    assert data["total"] == 11 and len(data["packages"]) == 3
    prices = [p["pricePerPerson"] for p in data["packages"]]
    assert prices == sorted(prices)
    assert client.get("/api/packages", params={"destination": "kedarnath"}).json()["total"] == 1
    assert client.get("/api/packages", params={"search": "yoga"}).json()["total"] >= 1
    detail = client.get("/api/packages/kailash-mansarovar-yatra").json()["package"]
    assert len(detail["itinerary"]) == 14 and len(detail["departures"]) == 4
    assert client.get("/api/packages/nope").status_code == 404
    dests = client.get("/api/destinations").json()["destinations"]
    assert {d["slug"] for d in dests} >= {"kedarnath", "varanasi", "puri", "amritsar", "rameswaram"}


def test_auth_errors(client):
    r = client.post("/api/auth/register", json={"name": "A", "email": "bad", "password": "x"})
    assert r.status_code == 400 and set(r.json()["details"]) == {"name", "email", "password"}
    assert client.post("/api/auth/login", json={"email": "admin@ayana.travel", "password": "wrong"}).status_code == 401
    assert client.get("/api/bookings/me").status_code == 401
    assert client.get("/api/bookings/me", headers=auth("garbage")).status_code == 401


def test_book_and_pay_mock(client, user_token):
    dep = first_departure(client)
    r = book(client, user_token, travelers=2, dep=dep)
    assert r.status_code == 201, r.text
    b = r.json()["booking"]
    assert b["status"] == "PENDING" and b["amount"] == dep["price"] * 2
    assert first_departure(client)["seatsLeft"] == dep["seatsLeft"] - 2

    order = client.post("/api/payments/order", headers=auth(user_token), json={"bookingId": b["id"]}).json()
    assert order["mode"] == "mock" and order["amount"] == b["amount"]
    r = client.post("/api/payments/verify", headers=auth(user_token),
                    json={"razorpay_order_id": order["orderId"], "razorpay_payment_id": "mock_pay_1"})
    assert r.json()["booking"]["status"] == "CONFIRMED"
    # calling verify again changes nothing
    r = client.post("/api/payments/verify", headers=auth(user_token),
                    json={"razorpay_order_id": order["orderId"], "razorpay_payment_id": "mock_pay_1"})
    assert r.json()["booking"]["status"] == "CONFIRMED"
    mine = client.get("/api/bookings/me", headers=auth(user_token)).json()["bookings"]
    assert mine[0]["payments"][0]["status"] == "PAID"
    # reviews only after a confirmed booking
    r = client.post("/api/packages/golden-temple-seva/reviews", headers=auth(user_token), json={"rating": 5, "comment": "Wonderful seva"})
    assert r.status_code == 201
    assert client.get("/api/packages/golden-temple-seva").json()["package"]["ratingCount"] == 1


def test_seat_limit_and_cancel(client, user_token):
    dep = first_departure(client, "kailash-mansarovar-yatra")
    assert book(client, user_token, travelers=9, slug="kailash-mansarovar-yatra", dep=dep).status_code == 400  # max group 8
    ids = []
    for _ in range(2):
        r = book(client, user_token, travelers=8, slug="kailash-mansarovar-yatra", dep=dep)
        assert r.status_code == 201
        ids.append(r.json()["booking"]["id"])
    r = book(client, user_token, travelers=1, slug="kailash-mansarovar-yatra", dep=dep)
    assert r.status_code == 409  # 16 seats, all held
    assert client.post(f"/api/bookings/{ids[0]}/cancel", headers=auth(user_token)).json()["booking"]["status"] == "CANCELLED"
    assert book(client, user_token, travelers=1, slug="kailash-mansarovar-yatra", dep=dep).status_code == 201


def test_expiry_releases_seats(client, user_token):
    dep = first_departure(client, "tirupati-balaji-darshan")
    b = book(client, user_token, travelers=3, slug="tirupati-balaji-darshan", dep=dep).json()["booking"]
    with SessionLocal() as db:
        db.execute(update(Booking).where(Booking.id == b["id"]).values(expires_at=utcnow()))
        db.commit()
    expire_stale_bookings()
    assert client.get(f"/api/bookings/{b['id']}", headers=auth(user_token)).json()["booking"]["status"] == "EXPIRED"
    assert first_departure(client, "tirupati-balaji-darshan")["seatsLeft"] == dep["seatsLeft"]


def test_razorpay_signature_and_webhook(client, user_token, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "payment_mode", "razorpay")
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_x")
    monkeypatch.setattr(s, "razorpay_key_secret", "sekret")
    monkeypatch.setattr(s, "razorpay_webhook_secret", "whsec")
    from app.routers import payments

    monkeypatch.setattr(payments, "create_gateway_order", lambda amount, currency, receipt, notes: {"id": "order_T1"})
    b = book(client, user_token, travelers=1).json()["booking"]
    order = client.post("/api/payments/order", headers=auth(user_token), json={"bookingId": b["id"]}).json()
    assert order["keyId"] == "rzp_test_x"

    bad = client.post("/api/payments/verify", headers=auth(user_token),
                      json={"razorpay_order_id": "order_T1", "razorpay_payment_id": "pay_1", "razorpay_signature": "abc"})
    assert bad.status_code == 400
    # webhook with a wrong signature is refused
    body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_1", "order_id": "order_T1"}}}})
    assert client.post("/api/payments/webhook", content=body, headers={"x-razorpay-signature": "nope"}).status_code == 400
    sig = hmac.new(b"whsec", body.encode(), hashlib.sha256).hexdigest()
    assert client.post("/api/payments/webhook", content=body, headers={"x-razorpay-signature": sig}).json() == {"received": True}
    assert client.get(f"/api/bookings/{b['id']}", headers=auth(user_token)).json()["booking"]["status"] == "CONFIRMED"


def test_admin(client, admin_token, user_token):
    assert client.get("/api/admin/stats", headers=auth(user_token)).status_code == 403
    stats = client.get("/api/admin/stats", headers=auth(admin_token)).json()
    assert stats["packages"] == 11 and "CONFIRMED" in stats["bookings"]
    a = client.get("/api/admin/analytics", params={"months": 6}, headers=auth(admin_token)).json()
    assert len(a["monthly"]) == 6 and a["summary"]["confirmedBookings"] >= 1
    csv_text = client.get("/api/admin/export/bookings.csv", headers=auth(admin_token)).text
    assert csv_text.startswith("﻿Booking ref")

    dests = client.get("/api/destinations").json()["destinations"]
    body = {"slug": "test-yatra", "title": "Test Yatra", "summary": "A short test summary", "description": "Long enough text",
            "category": "Pilgrimage", "durationDays": 2, "pricePerPerson": 500000, "destinationId": dests[0]["id"],
            "itinerary": [{"title": "Arrive", "description": "Settle in"}, {"title": "Depart", "description": "Go home"}]}
    r = client.post("/api/admin/packages", headers=auth(admin_token), json=body)
    assert r.status_code == 201, r.text
    pid = r.json()["package"]["id"]
    assert client.post("/api/admin/packages", headers=auth(admin_token), json=body).status_code == 409
    body["itinerary"] = [{"title": "Only day", "description": "All in one"}]
    assert client.put(f"/api/admin/packages/{pid}", headers=auth(admin_token), json=body).status_code == 200
    r = client.post(f"/api/admin/packages/{pid}/departures", headers=auth(admin_token), json={"startDate": "2030-01-15", "seatsTotal": 10})
    assert r.status_code == 201

    # photos
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1600), (200, 120, 40)).save(buf, "JPEG")
    files = [("images", ("a.jpg", buf.getvalue(), "image/jpeg")), ("images", ("b.jpg", buf.getvalue(), "image/jpeg"))]
    imgs = client.post(f"/api/admin/packages/{pid}/images", headers=auth(admin_token), files=files).json()["images"]
    assert len(imgs) == 2
    assert client.get(imgs[0]["thumbUrl"]).headers["content-type"] == "image/webp"
    bad = client.post(f"/api/admin/packages/{pid}/images", headers=auth(admin_token), files=[("images", ("x.jpg", b"hello", "image/jpeg"))])
    assert bad.status_code == 400
    ids = [i["id"] for i in imgs][::-1]
    assert client.put(f"/api/admin/packages/{pid}/images/order", headers=auth(admin_token), json={"ids": ids}).status_code == 200
    assert client.get("/api/packages/test-yatra").json()["package"]["images"][0]["id"] == ids[0]
    assert client.delete(f"/api/admin/images/{ids[0]}", headers=auth(admin_token)).status_code == 204
    assert client.delete(f"/api/admin/packages/{pid}", headers=auth(admin_token)).status_code == 204
    assert client.get("/api/packages/test-yatra").status_code == 404
