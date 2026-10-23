"""Admin-only endpoints: dashboard numbers, analytics, CSV export, packages, photos, dates, bookings."""
import csv
import io
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..errors import not_found
from ..models import (CONFIRMED, PAID, Booking, Departure, Destination, ItineraryDay, Package, PackageImage, Payment,
                      User)
from ..schemas import DepartureIn, DeparturePatch, DestinationIn, ImageOrderIn, ImagePatch, PackageIn
from ..security import admin_user
from ..serializers import (booking_out, departure_admin, destination_out, image_out, iso, itinerary_out,
                           package_base)
from ..services.images import delete_image_files, read_uploads, save_package_image

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(admin_user)])

BOOKING_LOAD = (selectinload(Booking.package).selectinload(Package.images), selectinload(Booking.departure),
                selectinload(Booking.payments), selectinload(Booking.user))


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    by_status = dict(db.execute(select(Booking.status, func.count()).group_by(Booking.status)).all())
    recent = db.scalars(select(Booking).order_by(Booking.created_at.desc()).limit(8).options(*BOOKING_LOAD)).all()
    return {
        "packages": db.scalar(select(func.count()).select_from(Package).where(Package.is_active.is_(True))),
        "users": db.scalar(select(func.count()).select_from(User)),
        "revenue": int(db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.status == PAID))),
        "bookings": by_status,
        "recent": [booking_out(b, with_user=True) for b in recent],
    }


# ---------- Analytics (the quick view inside the admin panel; the deep dive is the Streamlit app) ----------
@router.get("/analytics")
def analytics(months: int = Query(12, ge=1, le=36), db: Session = Depends(get_db)):
    today = date.today()
    y, m = today.year, today.month - (months - 1)
    while m < 1:
        y, m = y - 1, m + 12
    since = datetime(y, m, 1)
    keys = []
    for i in range(months):
        mm = m - 1 + i
        keys.append(f"{y + mm // 12:04d}-{mm % 12 + 1:02d}")

    q = lambda sql, **p: db.execute(text(sql), {"since": since, **p}).mappings().all()  # noqa: E731
    revenue = {r["month"]: r for r in q(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(amount) AS revenue FROM payments "
        "WHERE status = 'PAID' AND created_at >= :since GROUP BY month")}
    bookings = {r["month"]: r for r in q(
        "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS created, SUM(status = 'CONFIRMED') AS confirmed, "
        "SUM(CASE WHEN status = 'CONFIRMED' THEN travelers ELSE 0 END) AS travelers FROM bookings "
        "WHERE created_at >= :since GROUP BY month")}
    monthly = [{
        "month": k,
        "revenue": int(revenue.get(k, {}).get("revenue") or 0),
        "bookingsCreated": int(bookings.get(k, {}).get("created") or 0),
        "bookingsConfirmed": int(bookings.get(k, {}).get("confirmed") or 0),
        "travelers": int(bookings.get(k, {}).get("travelers") or 0),
    } for k in keys]

    top = q("SELECT p.title, p.slug, COUNT(*) AS bookings, SUM(b.travelers) AS travelers, SUM(b.amount) AS revenue "
            "FROM bookings b JOIN packages p ON p.id = b.package_id WHERE b.status = 'CONFIRMED' AND b.created_at >= :since "
            "GROUP BY p.id, p.title, p.slug ORDER BY revenue DESC LIMIT 10")
    by_dest = q("SELECT d.name, COUNT(*) AS bookings, SUM(b.amount) AS revenue FROM bookings b "
                "JOIN packages p ON p.id = b.package_id JOIN destinations d ON d.id = p.destination_id "
                "WHERE b.status = 'CONFIRMED' AND b.created_at >= :since GROUP BY d.id, d.name ORDER BY revenue DESC")
    by_cat = q("SELECT p.category AS name, COUNT(*) AS bookings, SUM(b.amount) AS revenue FROM bookings b "
               "JOIN packages p ON p.id = b.package_id WHERE b.status = 'CONFIRMED' AND b.created_at >= :since "
               "GROUP BY p.category ORDER BY revenue DESC")
    funnel = {r["status"]: int(r["n"]) for r in q(
        "SELECT status, COUNT(*) AS n FROM bookings WHERE created_at >= :since GROUP BY status")}
    rep = db.execute(text("SELECT COUNT(*) AS customers, SUM(n > 1) AS repeaters FROM "
                          "(SELECT user_id, COUNT(*) AS n FROM bookings WHERE status = 'CONFIRMED' GROUP BY user_id) t")).mappings().one()
    upcoming = db.execute(select(Departure, Package.title).join(Package).where(
        Departure.is_active.is_(True), Departure.start_date >= today, Departure.start_date <= today + timedelta(days=60))
        .order_by(Departure.start_date).limit(15)).all()

    created = sum(funnel.values())
    confirmed = funnel.get(CONFIRMED, 0)
    total_revenue = sum(x["revenue"] for x in monthly)
    num = lambda rows: [{k: (int(v) if k in ("bookings", "travelers", "revenue") else v) for k, v in r.items()} for r in rows]  # noqa: E731
    return {
        "months": months, "since": iso(since),
        "summary": {
            "revenue": total_revenue,
            "confirmedBookings": confirmed,
            "travelers": sum(x["travelers"] for x in monthly),
            "averageBookingValue": round(total_revenue / confirmed) if confirmed else 0,
            "conversionRate": confirmed / created if created else 0,
            "repeatCustomers": int(rep["repeaters"] or 0),
            "payingCustomers": int(rep["customers"] or 0),
        },
        "funnel": {"created": created, **funnel},
        "monthly": monthly,
        "topPackages": num(top),
        "byDestination": num(by_dest),
        "byCategory": num(by_cat),
        "upcomingDepartures": [{"id": d.id, "title": title, "startDate": iso(d.start_date),
                                "seatsBooked": d.seats_booked, "seatsTotal": d.seats_total} for d, title in upcoming],
    }


@router.get("/export/bookings.csv")
def export_bookings(db: Session = Depends(get_db)):
    """All bookings as a CSV file that opens in Excel / Google Sheets."""
    rows = db.scalars(select(Booking).order_by(Booking.created_at.desc()).options(*BOOKING_LOAD)).all()
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel shows ₹ and Hindi names correctly
    w = csv.writer(buf)
    w.writerow(["Booking ref", "Booked on", "Status", "Customer", "Email", "Phone", "Journey", "Departure",
                "Travellers", "Amount (INR)", "Payment ID"])
    for b in rows:
        paid = next((p.provider_payment_id for p in b.payments if p.status == PAID), "")
        w.writerow([b.booking_ref, b.created_at.date().isoformat(), b.status, b.contact_name, b.user.email,
                    b.contact_phone, b.package.title, b.departure.start_date.isoformat(), b.travelers,
                    f"{b.amount / 100:.2f}", paid])
    filename = f"ayana-bookings-{date.today().isoformat()}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ---------- Packages ----------
def package_admin_out(p: Package) -> dict:
    recent = date.today() - timedelta(days=30)  # hide old dates to keep the admin page short
    return {**package_base(p), "destination": {"name": p.destination.name},
            "departures": [departure_admin(d) for d in p.departures if d.start_date >= recent],
            "itinerary": itinerary_out(p), "images": [image_out(i) for i in p.images]}


@router.get("/packages")
def list_packages(db: Session = Depends(get_db)):
    rows = db.scalars(select(Package).order_by(Package.created_at.desc()).options(
        selectinload(Package.destination), selectinload(Package.departures), selectinload(Package.itinerary),
        selectinload(Package.images))).all()
    return {"packages": [package_admin_out(p) for p in rows]}


def _apply(p: Package, data: PackageIn) -> None:
    fields = data.model_dump(exclude={"itinerary"})
    for k, v in fields.items():
        setattr(p, k, v)
    p.itinerary = [ItineraryDay(day_number=i + 1, title=d.title, description=d.description) for i, d in enumerate(data.itinerary)]


@router.post("/packages", status_code=201)
def create_package(data: PackageIn, db: Session = Depends(get_db)):
    if not db.get(Destination, data.destination_id):
        raise not_found("Destination not found")
    p = Package()
    _apply(p, data)
    db.add(p)
    db.commit()
    return {"package": package_base(p)}


@router.put("/packages/{package_id}")
def update_package(package_id: str, data: PackageIn, db: Session = Depends(get_db)):
    p = db.get(Package, package_id)
    if not p:
        raise not_found("Package not found")
    p.itinerary = []
    db.flush()  # remove old itinerary rows first, so day numbers can be reused
    _apply(p, data)
    db.commit()
    return {"package": package_base(p)}


@router.delete("/packages/{package_id}", status_code=204)
def hide_package(package_id: str, db: Session = Depends(get_db)):
    """Soft delete: the package disappears from the site but old bookings stay intact."""
    db.execute(update(Package).where(Package.id == package_id).values(is_active=False))
    db.commit()
    return Response(status_code=204)


# ---------- Photos ----------
@router.post("/packages/{package_id}/images", status_code=201)
async def upload_images(package_id: str, images: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    p = db.get(Package, package_id)
    if not p:
        raise not_found("Package not found")
    blobs = await read_uploads(images)
    order = (db.scalar(select(func.max(PackageImage.sort_order)).where(PackageImage.package_id == p.id)) or -1) + 1
    created = []
    for data in blobs:
        urls = save_package_image(p.id, data)
        img = PackageImage(package_id=p.id, url=urls["url"], thumb_url=urls["thumb_url"], alt=p.title, sort_order=order)
        order += 1
        db.add(img)
        created.append(img)
    db.commit()
    return {"images": [image_out(i) for i in created]}


@router.put("/packages/{package_id}/images/order")
def reorder_images(package_id: str, data: ImageOrderIn, db: Session = Depends(get_db)):
    """New order of photo ids; the first one becomes the cover."""
    for i, image_id in enumerate(data.ids):
        db.execute(update(PackageImage).where(PackageImage.id == image_id, PackageImage.package_id == package_id)
                   .values(sort_order=i))
    db.commit()
    return {"ok": True}


@router.patch("/images/{image_id}")
def edit_image(image_id: str, data: ImagePatch, db: Session = Depends(get_db)):
    img = db.get(PackageImage, image_id)
    if not img:
        raise not_found("Photo not found")
    img.alt = data.alt
    db.commit()
    return {"image": image_out(img)}


@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: str, db: Session = Depends(get_db)):
    img = db.get(PackageImage, image_id)
    if not img:
        raise not_found("Photo not found")
    urls = (img.url, img.thumb_url)
    db.delete(img)
    db.commit()
    delete_image_files(*urls)
    return Response(status_code=204)


# ---------- Departures & destinations ----------
@router.post("/packages/{package_id}/departures", status_code=201)
def add_departure(package_id: str, data: DepartureIn, db: Session = Depends(get_db)):
    if not db.get(Package, package_id):
        raise not_found("Package not found")
    d = Departure(package_id=package_id, **data.model_dump())
    db.add(d)
    db.commit()
    return {"departure": departure_admin(d)}


@router.patch("/departures/{departure_id}")
def edit_departure(departure_id: str, data: DeparturePatch, db: Session = Depends(get_db)):
    d = db.get(Departure, departure_id)
    if not d:
        raise not_found("Departure not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    return {"departure": departure_admin(d)}


@router.post("/destinations", status_code=201)
def add_destination(data: DestinationIn, db: Session = Depends(get_db)):
    d = Destination(**data.model_dump())
    db.add(d)
    db.commit()
    return {"destination": destination_out(d)}


# ---------- Bookings ----------
@router.get("/bookings")
def list_bookings(status: Literal["PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"] | None = None,
                  db: Session = Depends(get_db)):
    stmt = select(Booking).order_by(Booking.created_at.desc()).limit(200).options(*BOOKING_LOAD)
    if status:
        stmt = stmt.where(Booking.status == status)
    return {"bookings": [booking_out(b, with_user=True) for b in db.scalars(stmt).all()]}
