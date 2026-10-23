"""Public pages: destinations, categories, package search and detail, reviews."""
import math
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..errors import bad_request, not_found
from ..models import CONFIRMED, Booking, Destination, Package, Review, User
from ..schemas import ReviewIn
from ..security import current_user
from ..serializers import (departure_public, destination_out, image_out, iso, itinerary_out, package_base,
                           package_card)
from ..services.booking import refresh_package_rating

router = APIRouter(tags=["catalog"])


@router.get("/destinations")
def destinations(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Package.destination_id, func.count()).where(Package.is_active.is_(True))
                             .group_by(Package.destination_id)).all())
    rows = db.scalars(select(Destination).order_by(Destination.name)).all()
    return {"destinations": [{**destination_out(d), "packageCount": counts.get(d.id, 0)} for d in rows]}


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    rows = db.execute(select(Package.category, func.count()).where(Package.is_active.is_(True))
                      .group_by(Package.category).order_by(Package.category)).all()
    return {"categories": [{"name": name, "count": n} for name, n in rows]}


SORTS = {
    "popular": [Package.is_featured.desc(), Package.rating_count.desc()],
    "price_asc": [Package.price_per_person.asc()],
    "price_desc": [Package.price_per_person.desc()],
    "duration": [Package.duration_days.asc()],
    "newest": [Package.created_at.desc()],
}


@router.get("/packages")
def list_packages(
    db: Session = Depends(get_db),
    search: str | None = Query(None, max_length=100),
    category: str | None = Query(None, max_length=60),
    destination: str | None = Query(None, max_length=191),  # destination slug
    min_price: int | None = Query(None, alias="minPrice", ge=0),  # rupees
    max_price: int | None = Query(None, alias="maxPrice", ge=0),  # rupees
    max_days: int | None = Query(None, alias="maxDays", ge=1),
    featured: Literal["true", "false"] | None = None,
    sort: Literal["popular", "price_asc", "price_desc", "duration", "newest"] = "popular",
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
):
    filters = [Package.is_active.is_(True)]
    if search:
        filters.append(or_(Package.title.contains(search, autoescape=True),
                           Package.summary.contains(search, autoescape=True),
                           Package.destination.has(Destination.name.contains(search, autoescape=True))))
    if category:
        filters.append(Package.category == category)
    if destination:
        filters.append(Package.destination.has(Destination.slug == destination))
    if min_price is not None:
        filters.append(Package.price_per_person >= min_price * 100)
    if max_price is not None:
        filters.append(Package.price_per_person <= max_price * 100)
    if max_days:
        filters.append(Package.duration_days <= max_days)
    if featured:
        filters.append(Package.is_featured.is_(featured == "true"))

    total = db.scalar(select(func.count()).select_from(Package).where(*filters))
    rows = db.scalars(
        select(Package).where(*filters).order_by(*SORTS[sort]).offset((page - 1) * limit).limit(limit)
        .options(selectinload(Package.destination), selectinload(Package.images))
    ).all()
    return {"packages": [package_card(p) for p in rows], "page": page, "limit": limit, "total": total,
            "totalPages": math.ceil(total / limit)}


@router.get("/packages/{slug}")
def package_detail(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Package).where(Package.slug == slug, Package.is_active.is_(True)).options(
        selectinload(Package.destination), selectinload(Package.itinerary), selectinload(Package.images),
        selectinload(Package.departures)))
    if not p:
        raise not_found("Package not found")
    today = date.today()
    reviews = db.execute(select(Review, User.name).join(User, User.id == Review.user_id)
                         .where(Review.package_id == p.id).order_by(Review.created_at.desc()).limit(20)).all()
    return {"package": {
        **package_base(p),
        "destination": destination_out(p.destination),
        "itinerary": itinerary_out(p),
        "images": [image_out(i) for i in p.images],
        "departures": [departure_public(d, p) for d in p.departures if d.is_active and d.start_date >= today],
        "reviews": [{"id": r.id, "rating": r.rating, "comment": r.comment, "createdAt": iso(r.created_at),
                     "user": {"name": name}} for r, name in reviews],
    }}


@router.post("/packages/{slug}/reviews", status_code=201)
def add_review(slug: str, data: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Only travellers with a confirmed booking can review."""
    p = db.scalar(select(Package).where(Package.slug == slug))
    if not p:
        raise not_found("Package not found")
    booked = db.scalar(select(Booking.id).where(Booking.user_id == user.id, Booking.package_id == p.id,
                                                Booking.status == CONFIRMED).limit(1))
    if not booked:
        raise bad_request("You can review a journey after booking it")
    review = db.scalar(select(Review).where(Review.user_id == user.id, Review.package_id == p.id))
    if review:
        review.rating, review.comment = data.rating, data.comment
    else:
        review = Review(user_id=user.id, package_id=p.id, rating=data.rating, comment=data.comment)
        db.add(review)
    db.commit()
    refresh_package_rating(db, p.id)
    return {"review": {"id": review.id, "rating": review.rating, "comment": review.comment,
                       "createdAt": iso(review.created_at)}}
