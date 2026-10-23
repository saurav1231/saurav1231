"""Turn database rows into the JSON the website expects (camelCase keys, ISO dates)."""
from datetime import date, datetime

from .models import Booking, Departure, Destination, Package, PackageImage, User


def iso(value):
    """2026-11-06T00:00:00.000Z style, the same format JavaScript produces."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="milliseconds") + "Z"
    if isinstance(value, date):
        return f"{value.isoformat()}T00:00:00.000Z"
    return value


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "phone": u.phone, "role": u.role,
            "createdAt": iso(u.created_at), "updatedAt": iso(u.updated_at)}


def destination_out(d: Destination) -> dict:
    return {"id": d.id, "slug": d.slug, "name": d.name, "state": d.state, "country": d.country,
            "description": d.description, "latitude": d.latitude, "longitude": d.longitude,
            "imageUrl": d.image_url, "createdAt": iso(d.created_at)}


def image_out(i: PackageImage) -> dict:
    return {"id": i.id, "url": i.url, "thumbUrl": i.thumb_url, "alt": i.alt, "sortOrder": i.sort_order}


def unit_price(pkg: Package, dep: Departure | None) -> int:
    return dep.price_override if dep is not None and dep.price_override is not None else pkg.price_per_person


def departure_public(d: Departure, pkg: Package) -> dict:
    return {"id": d.id, "startDate": iso(d.start_date), "seatsLeft": max(0, d.seats_total - d.seats_booked),
            "seatsTotal": d.seats_total, "price": unit_price(pkg, d)}


def departure_admin(d: Departure) -> dict:
    return {"id": d.id, "startDate": iso(d.start_date), "seatsTotal": d.seats_total, "seatsBooked": d.seats_booked,
            "priceOverride": d.price_override, "isActive": d.is_active}


def package_base(p: Package) -> dict:
    return {
        "id": p.id, "slug": p.slug, "title": p.title, "summary": p.summary, "description": p.description,
        "category": p.category, "durationDays": p.duration_days, "pricePerPerson": p.price_per_person,
        "currency": p.currency, "imageUrl": p.image_url, "highlights": p.highlights or [],
        "inclusions": p.inclusions or [], "exclusions": p.exclusions or [], "maxGroupSize": p.max_group_size,
        "isActive": p.is_active, "isFeatured": p.is_featured, "ratingAvg": p.rating_avg,
        "ratingCount": p.rating_count, "destinationId": p.destination_id,
        "createdAt": iso(p.created_at), "updatedAt": iso(p.updated_at),
    }


def package_card(p: Package) -> dict:
    """Small version for listing pages."""
    d = p.destination
    return {
        "id": p.id, "slug": p.slug, "title": p.title, "summary": p.summary, "category": p.category,
        "durationDays": p.duration_days, "pricePerPerson": p.price_per_person, "currency": p.currency,
        "imageUrl": p.image_url, "isFeatured": p.is_featured, "ratingAvg": p.rating_avg, "ratingCount": p.rating_count,
        "images": [{"url": i.url, "thumbUrl": i.thumb_url, "alt": i.alt} for i in p.images[:1]],
        "destination": {"name": d.name, "slug": d.slug, "state": d.state, "latitude": d.latitude, "longitude": d.longitude},
    }


def itinerary_out(p: Package) -> list[dict]:
    return [{"id": x.id, "dayNumber": x.day_number, "title": x.title, "description": x.description} for x in p.itinerary]


def payment_out(pay) -> dict:
    return {"id": pay.id, "status": pay.status, "amount": pay.amount, "providerPaymentId": pay.provider_payment_id,
            "createdAt": iso(pay.created_at)}


def booking_out(b: Booking, with_user: bool = False) -> dict:
    p = b.package
    out = {
        "id": b.id, "bookingRef": b.booking_ref, "userId": b.user_id, "packageId": b.package_id,
        "departureId": b.departure_id, "travelers": b.travelers, "amount": b.amount, "currency": b.currency,
        "status": b.status, "contactName": b.contact_name, "contactPhone": b.contact_phone,
        "specialRequests": b.special_requests, "expiresAt": iso(b.expires_at),
        "createdAt": iso(b.created_at), "updatedAt": iso(b.updated_at),
        "package": {"title": p.title, "slug": p.slug, "durationDays": p.duration_days, "imageUrl": p.image_url,
                    "category": p.category, "images": [{"thumbUrl": i.thumb_url} for i in p.images[:1]]},
        "departure": {"startDate": iso(b.departure.start_date)},
        "payments": [payment_out(x) for x in b.payments],
    }
    if with_user:
        out["user"] = {"name": b.user.name, "email": b.user.email, "phone": b.user.phone}
    return out
