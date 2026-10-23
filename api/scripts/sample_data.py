"""Creates ~2 years of SAMPLE customers, bookings, payments and reviews so the analytics
(admin tab and Streamlit app) have realistic patterns to show: growth, seasonality,
repeat pilgrims, customers who stop coming (churn) and customers who come back.

    python -m scripts.sample_data          # never on the live server

Sample customers use @example.com emails, so they are easy to spot and delete.
"""
import random
from collections import defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import (CANCELLED, CONFIRMED, EXPIRED, PAID, Booking, Departure, Package, Payment, Review, User,
                        utcnow)
from app.security import hash_password
from app.services.booking import new_booking_ref

rng = random.Random(7)
FIRST_NAMES = ["Asha", "Rohan", "Meera", "Vikram", "Pooja", "Arjun", "Kavya", "Siddharth", "Neha", "Rahul", "Ananya",
               "Karan", "Divya", "Aditya", "Ishita", "Manish", "Sneha", "Harsh", "Ritu", "Gaurav", "Lakshmi", "Suresh",
               "Priya", "Amit", "Deepa", "Nikhil", "Shreya", "Varun", "Anjali", "Mohan"]
LAST_NAMES = ["Verma", "Iyer", "Nair", "Singh", "Patel", "Rao", "Menon", "Jain", "Gupta", "Sharma", "Das", "Malhotra",
              "Reddy", "Kulkarni", "Bose", "Tiwari", "Joshi", "Agarwal", "Saxena", "Mehta", "Pillai", "Chatterjee"]

# Where pilgrims usually go next (destination slug -> likely next destinations)
NEXT = {
    "varanasi": ["kedarnath", "puri", "ujjain", "bodh-gaya", "rameswaram"],
    "rishikesh": ["dharamshala", "kedarnath", "rishikesh", "bodh-gaya"],
    "kedarnath": ["kailash", "varanasi", "rishikesh", "ujjain"],
    "bodh-gaya": ["dharamshala", "varanasi", "rishikesh"],
    "amritsar": ["varanasi", "rishikesh", "dharamshala"],
    "tirupati": ["rameswaram", "puri", "tirupati"],
    "puri": ["rameswaram", "varanasi", "tirupati"],
    "dharamshala": ["bodh-gaya", "rishikesh", "kailash"],
    "rameswaram": ["tirupati", "puri", "varanasi"],
    "ujjain": ["varanasi", "kedarnath", "puri"],
    "kailash": ["kedarnath", "rishikesh"],
}
FIRST_TRIP_WEIGHTS = {"varanasi": 18, "rishikesh": 16, "amritsar": 12, "tirupati": 12, "kedarnath": 10, "puri": 9,
                      "ujjain": 8, "bodh-gaya": 6, "dharamshala": 5, "rameswaram": 4, "kailash": 1}
SEASON = {1: 0.8, 2: 0.9, 3: 1.0, 4: 1.3, 5: 1.4, 6: 1.2, 7: 0.7, 8: 0.8, 9: 1.0, 10: 1.3, 11: 1.4, 12: 1.2}


def main():
    if get_settings().is_production:
        raise SystemExit("Refusing to create sample data in production.")
    now = utcnow()
    start = now - timedelta(days=730)
    with SessionLocal() as db:
        packages = db.scalars(select(Package)).all()
        by_dest = defaultdict(list)
        for p in packages:
            by_dest[p.destination.slug].append(p)
        departures: dict[tuple[str, date], Departure] = {}
        pwd = hash_password("sample-password")
        reviewed: set[tuple[str, str]] = set()  # one review per person per package

        def departure_for(pkg: Package, booked_at: datetime) -> Departure:
            day = (booked_at + timedelta(days=rng.randint(20, 75))).date()
            day = day.replace(day=1 if day.day < 15 else 15)
            key = (pkg.id, day)
            if key not in departures:
                d = Departure(package_id=pkg.id, start_date=day, seats_total=16 if pkg.slug.startswith("kailash") else 30,
                              seats_booked=0)
                db.add(d)
                departures[key] = d
            return departures[key]

        def pick_package(dest_slug: str) -> Package:
            options = by_dest.get(dest_slug) or packages
            return rng.choice(options)

        n_customers, n_bookings, ref_n = 0, 0, 0
        signup = start
        while signup < now:
            # more sign-ups as the business grows, with pilgrimage seasons
            progress = (signup - start).days / 730
            gap_hours = 40 / ((0.6 + progress * 1.6) * SEASON[signup.month])
            signup += timedelta(hours=rng.expovariate(1 / gap_hours))
            if signup >= now:
                break
            n_customers += 1
            user = User(name=f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}", email=f"sample{n_customers}@example.com",
                        phone=f"9{rng.randint(100000000, 999999999)}", password_hash=pwd, created_at=signup, updated_at=signup)
            db.add(user)
            db.flush()
            if rng.random() > 0.72:  # some people sign up and never book
                continue

            loyalty = rng.choice([0.3, 0.45, 0.7])  # how likely this person is to travel again
            when = signup + timedelta(days=rng.expovariate(1 / 12))
            dest = rng.choices(list(FIRST_TRIP_WEIGHTS), weights=FIRST_TRIP_WEIGHTS.values())[0]
            trips = 0
            while when < now:
                pkg = pick_package(dest)
                travelers = rng.choices([1, 2, 3, 4, 5], weights=[22, 38, 15, 17, 8])[0]
                r = rng.random()
                status = CONFIRMED if r < 0.74 else EXPIRED if r < 0.9 else CANCELLED
                dep = departure_for(pkg, when)
                ref_n += 1
                b = Booking(booking_ref=new_booking_ref(), user_id=user.id, package_id=pkg.id, departure=dep,
                            travelers=travelers, amount=pkg.price_per_person * travelers, status=status,
                            contact_name=user.name, contact_phone=user.phone, created_at=when, updated_at=when,
                            expires_at=when + timedelta(minutes=30))
                db.add(b)
                n_bookings += 1
                if status != CONFIRMED:
                    if rng.random() < 0.45:  # tries again a few days later
                        when += timedelta(days=rng.uniform(0.5, 6))
                        continue
                    break
                dep.seats_booked += travelers
                db.add(Payment(booking=b, provider="mock", provider_order_id=f"sample_order_{ref_n}",
                               provider_payment_id=f"sample_pay_{ref_n}", amount=b.amount, status=PAID,
                               created_at=when + timedelta(minutes=4), updated_at=when + timedelta(minutes=4)))
                trip_end = datetime.combine(dep.start_date, datetime.min.time()) + timedelta(days=pkg.duration_days)
                if trip_end < now and rng.random() < 0.4 and (user.id, pkg.id) not in reviewed:
                    reviewed.add((user.id, pkg.id))
                    db.add(Review(user_id=user.id, package_id=pkg.id, rating=rng.choices([5, 4, 3, 2], weights=[55, 30, 10, 5])[0],
                                  comment=rng.choice(["Beautifully organised darshan.", "Our guide made it special.",
                                                      "Peaceful and well paced.", "Hotels could be better, darshan was great."]),
                                  created_at=trip_end + timedelta(days=3)))
                trips += 1
                if rng.random() > loyalty * (0.75 ** (trips - 1)):
                    break  # this pilgrim doesn't come back (churn)
                when += timedelta(days=rng.uniform(90, 430))
                dest = rng.choice(NEXT.get(pkg.destination.slug, list(FIRST_TRIP_WEIGHTS)))
            if n_customers % 50 == 0:
                db.flush()
        db.commit()
        for p in packages:
            avg, count = db.execute(select(func.avg(Review.rating), func.count()).where(Review.package_id == p.id)).one()
            p.rating_avg, p.rating_count = round(float(avg or 0), 2), count
        db.commit()
    print(f"Created {n_customers} sample customers and {n_bookings} sample bookings.")


if __name__ == "__main__":
    main()
