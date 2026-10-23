"""Fill an empty database with destinations, packages, itineraries, departure dates and the admin user.
Safe to run again (updates by slug / email).

    python -m scripts.seed
"""
import json
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import ADMIN, Departure, Destination, ItineraryDay, Package, User
from app.security import hash_password

DATA = json.loads((Path(__file__).parent / "seed_data.json").read_text(encoding="utf-8"))


def upcoming_dates(count=4, first_in_days=14, gap_days=21):
    return [date.today() + timedelta(days=first_in_days + i * gap_days) for i in range(count)]


def main():
    s = get_settings()
    with SessionLocal() as db:
        email = s.admin_email.lower()
        admin = db.scalar(select(User).where(User.email == email))
        if admin:
            admin.role = ADMIN
        else:
            db.add(User(name="Ayana Admin", email=email, role=ADMIN, password_hash=hash_password(s.admin_password)))

        dest_ids = {}
        for d in DATA["destinations"]:
            row = db.scalar(select(Destination).where(Destination.slug == d["slug"])) or Destination(slug=d["slug"])
            row.name, row.state, row.country = d["name"], d.get("state"), d.get("country", "India")
            row.description, row.latitude, row.longitude = d["description"], d["latitude"], d["longitude"]
            db.add(row)
            db.flush()
            dest_ids[d["slug"]] = row.id

        for p in DATA["packages"]:
            pkg = db.scalar(select(Package).where(Package.slug == p["slug"])) or Package(slug=p["slug"])
            kailash = p["slug"].startswith("kailash")
            pkg.title, pkg.summary, pkg.description = p["title"], p["summary"], p["description"]
            pkg.category, pkg.duration_days = p["category"], p["durationDays"]
            pkg.price_per_person = p["priceRupees"] * 100
            pkg.is_featured = p["featured"]
            pkg.highlights, pkg.inclusions, pkg.exclusions = p["highlights"], p["inclusions"], p["exclusions"]
            pkg.max_group_size = 8 if kailash else 15
            pkg.destination_id = dest_ids[p["destination"]]
            pkg.itinerary = []
            db.add(pkg)
            db.flush()
            pkg.itinerary = [ItineraryDay(day_number=i + 1, title=d["title"], description=d["description"])
                             for i, d in enumerate(p["itinerary"])]
            future = db.scalar(select(func.count()).select_from(Departure)
                               .where(Departure.package_id == pkg.id, Departure.start_date >= date.today()))
            if not future:
                for i, start in enumerate(upcoming_dates()):
                    db.add(Departure(package_id=pkg.id, start_date=start, seats_total=16 if kailash else 30,
                                     # example of peak-season pricing on the 4th date
                                     price_override=round(pkg.price_per_person * 1.1) if i == 3 else None))
        db.commit()
    print(f"Seeded {len(DATA['destinations'])} destinations, {len(DATA['packages'])} packages, admin {s.admin_email}")


if __name__ == "__main__":
    main()
