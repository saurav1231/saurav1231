"""Reads the live Ayana database into pandas tables. Cached for 10 minutes (Refresh button clears it)."""
import os
from pathlib import Path

import pandas as pd
import streamlit as st
from dotenv import dotenv_values
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent


def database_url() -> str:
    url = os.environ.get("ANALYTICS_DATABASE_URL") or dotenv_values(ROOT / ".env").get("ANALYTICS_DATABASE_URL")
    if not url:
        url = os.environ.get("DATABASE_URL") or dotenv_values(ROOT.parent / "api" / ".env").get("DATABASE_URL")
    if not url:
        raise RuntimeError("Set ANALYTICS_DATABASE_URL in analytics/.env")
    return url


@st.cache_resource
def engine():
    return create_engine(database_url(), pool_pre_ping=True, pool_recycle=3600)


def _read(sql: str, **params) -> pd.DataFrame:
    with engine().connect() as conn:
        return pd.read_sql(text(sql), conn, params=params)


@st.cache_data(ttl=600, show_spinner="Loading data…")
def load_all() -> dict[str, pd.DataFrame]:
    customers = _read("SELECT id AS user_id, name, email, phone, created_at AS signed_up_at FROM users WHERE role = 'USER'")
    bookings = _read("""
        SELECT b.id AS booking_id, b.booking_ref, b.user_id, b.status, b.travelers, b.amount / 100 AS amount,
               b.created_at, d.start_date, p.slug AS package_slug, p.title AS package, p.category,
               p.duration_days, ds.name AS destination
        FROM bookings b
        JOIN packages p ON p.id = b.package_id
        JOIN destinations ds ON ds.id = p.destination_id
        JOIN departures d ON d.id = b.departure_id""")
    payments = _read("""
        SELECT pay.booking_id, pay.amount / 100 AS amount, pay.created_at AS paid_at
        FROM payments pay WHERE pay.status = 'PAID'""")
    departures = _read("""
        SELECT d.id AS departure_id, d.start_date, d.seats_total, d.seats_booked, p.title AS package, p.category,
               ds.name AS destination
        FROM departures d JOIN packages p ON p.id = d.package_id JOIN destinations ds ON ds.id = p.destination_id""")
    reviews = _read("""
        SELECT r.rating, r.created_at, p.title AS package FROM reviews r JOIN packages p ON p.id = r.package_id""")
    for df, cols in ((customers, ["signed_up_at"]), (bookings, ["created_at", "start_date"]),
                     (payments, ["paid_at"]), (departures, ["start_date"]), (reviews, ["created_at"])):
        for c in cols:
            df[c] = pd.to_datetime(df[c])
    for df in (bookings, payments):
        df["amount"] = df["amount"].astype(float)
    # one row per paid booking, with who / what / when
    orders = payments.merge(bookings.drop(columns=["amount"]), on="booking_id", how="inner")
    return {"customers": customers, "bookings": bookings, "orders": orders, "departures": departures, "reviews": reviews}
