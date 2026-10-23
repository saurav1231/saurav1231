"""All analytics calculations, as plain pandas functions (no Streamlit), so they can be tested.

Words used here:
  order      = a paid booking (one row per successful payment)
  period     = Month / Quarter / Year bucket
  window (W) = days without a new trip after which we call a customer "lost" (churned).
               Pilgrims often travel once a year, so the default is 365 days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

FREQS = {"Month": "M", "Quarter": "Q", "Year": "Y"}
SEASON_LAG = {"M": 12, "Q": 4, "Y": 1}


def to_period(s: pd.Series, freq: str) -> pd.Series:
    return s.dt.to_period(freq)


def period_label(p: pd.Period) -> str:
    if p.freqstr.startswith("M"):
        return p.strftime("%b %Y")
    if p.freqstr.startswith("Q"):
        return f"Q{p.quarter} {p.year}"
    return str(p.year)


# ---------------------------------------------------------------- revenue growth
def revenue_by_period(orders: pd.DataFrame, freq: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """Revenue, orders, customers and growth % per period. Growth uses full history, then trims to start..end."""
    if orders.empty:
        return pd.DataFrame(columns=["period", "label", "revenue", "orders", "customers", "aov", "growth_pct", "yoy_pct",
                                     "rolling", "cumulative"])
    o = orders.assign(period=to_period(orders["paid_at"], freq))
    g = o.groupby("period").agg(revenue=("amount", "sum"), orders=("booking_id", "count"), customers=("user_id", "nunique"))
    full = pd.period_range(min(g.index.min(), pd.Period(start, freq)), pd.Period(end, freq), freq=freq)
    g = g.reindex(full, fill_value=0)
    g["aov"] = (g["revenue"] / g["orders"].replace(0, np.nan)).fillna(0)
    g["growth_pct"] = g["revenue"].pct_change().replace([np.inf, -np.inf], np.nan) * 100
    g["yoy_pct"] = g["revenue"].pct_change(SEASON_LAG[freq]).replace([np.inf, -np.inf], np.nan) * 100
    g["rolling"] = g["revenue"].rolling(3, min_periods=1).mean()
    g = g[(g.index >= pd.Period(start, freq)) & (g.index <= pd.Period(end, freq))].copy()
    g["cumulative"] = g["revenue"].cumsum()
    g = g.reset_index(names="period")
    g["label"] = g["period"].map(period_label)
    return g


def growth_accounting(orders: pd.DataFrame, freq: str) -> pd.DataFrame:
    """Splits each period's revenue change into where it came from:
    new (first-ever trip), won back (returned after skipping at least one period), expansion (spent more than
    last period), contraction (spent less), lost (spent last period, nothing now). Quick ratio = gains / losses."""
    cols = ["period", "label", "new", "won_back", "expansion", "retained", "contraction", "lost", "quick_ratio",
            "new_customers", "won_back_customers", "lost_customers"]
    if orders.empty:
        return pd.DataFrame(columns=cols)
    o = orders.assign(period=to_period(orders["paid_at"], freq))
    m = o.pivot_table(index="user_id", columns="period", values="amount", aggfunc="sum", fill_value=0)
    m = m.reindex(columns=pd.period_range(m.columns.min(), m.columns.max(), freq=freq), fill_value=0)
    seen_before = m.cumsum(axis=1).shift(1, axis=1).fillna(0) > 0
    rows = []
    for i, p in enumerate(m.columns):
        cur = m[p]
        prev = m[m.columns[i - 1]] if i else pd.Series(0, index=m.index)
        before = seen_before[p]
        both = (cur > 0) & (prev > 0)
        new = cur[(cur > 0) & ~before]
        won = cur[(cur > 0) & (prev == 0) & before]
        exp = (cur - prev)[both & (cur > prev)]
        con = (cur - prev)[both & (cur < prev)]
        lost = -prev[(prev > 0) & (cur == 0)]
        gains, losses = new.sum() + won.sum() + exp.sum(), -(con.sum() + lost.sum())
        rows.append({
            "period": p, "label": period_label(p), "new": new.sum(), "won_back": won.sum(), "expansion": exp.sum(),
            "retained": np.minimum(cur, prev)[both].sum(), "contraction": con.sum(), "lost": lost.sum(),
            "quick_ratio": gains / losses if losses else np.nan,
            "new_customers": len(new), "won_back_customers": len(won), "lost_customers": len(lost),
        })
    return pd.DataFrame(rows, columns=cols)


def new_vs_returning(orders: pd.DataFrame, freq: str) -> pd.DataFrame:
    """Revenue per period from first-time pilgrims vs returning pilgrims."""
    if orders.empty:
        return pd.DataFrame(columns=["period", "label", "New pilgrims", "Returning pilgrims"])
    o = orders.sort_values("paid_at").copy()
    o["trip_no"] = o.groupby("user_id").cumcount() + 1
    o["type"] = np.where(o["trip_no"] == 1, "New pilgrims", "Returning pilgrims")
    o["period"] = to_period(o["paid_at"], freq)
    t = o.pivot_table(index="period", columns="type", values="amount", aggfunc="sum", fill_value=0)
    t = t.reindex(columns=["New pilgrims", "Returning pilgrims"], fill_value=0)
    t = t.reindex(pd.period_range(t.index.min(), t.index.max(), freq=freq), fill_value=0).reset_index(names="period")
    t["label"] = t["period"].map(period_label)
    return t


# ---------------------------------------------------------------- customers, churn, retention
STATUS_ORDER = ["Active", "At risk", "Lost (churned)", "Never booked"]


def customer_table(customers: pd.DataFrame, orders: pd.DataFrame, as_of: pd.Timestamp, window: int) -> pd.DataFrame:
    """One row per customer with trips, revenue, last trip and status.
    Active: travelled within W/2 days · At risk: W/2..W days · Lost: more than W days · Never booked: no paid trip."""
    agg = orders.groupby("user_id").agg(first_trip=("paid_at", "min"), last_trip=("paid_at", "max"),
                                        trips=("booking_id", "count"), revenue=("amount", "sum"))
    t = customers.set_index("user_id").join(agg, how="left")
    t["trips"] = t["trips"].fillna(0).astype(int)
    t["revenue"] = t["revenue"].fillna(0.0)
    t["days_since_last"] = (as_of - t["last_trip"]).dt.days
    t["status"] = np.select(
        [t["trips"] == 0, t["days_since_last"] <= window / 2, t["days_since_last"] <= window],
        ["Never booked", "Active", "At risk"], default="Lost (churned)")
    return t.reset_index()


def churn_by_period(orders: pd.DataFrame, freq: str, window: int, as_of: pd.Timestamp) -> pd.DataFrame:
    """For each period: customers active at its start (a trip in the previous W days), how many crossed W days
    without a new trip during the period (lost), how many came back after more than W days (won back), churn rate."""
    cols = ["period", "label", "active_at_start", "lost", "won_back", "churn_rate", "retention_rate"]
    if orders.empty:
        return pd.DataFrame(columns=cols)
    w = pd.Timedelta(days=window)
    o = orders.sort_values(["user_id", "paid_at"])[["user_id", "paid_at"]].copy()
    o["next"] = o.groupby("user_id")["paid_at"].shift(-1)
    o["prev"] = o.groupby("user_id")["paid_at"].shift(1)
    lost_at = (o["paid_at"] + w)[(o["next"].isna() | (o["next"] - o["paid_at"] > w)) & (o["paid_at"] + w <= as_of)]
    won_at = o["paid_at"][o["prev"].notna() & (o["paid_at"] - o["prev"] > w)]
    periods = pd.period_range(o["paid_at"].min() + w, as_of, freq=freq)
    rows = []
    for p in periods:
        start, end = p.start_time, p.end_time
        active = o[(o["paid_at"] > start - w) & (o["paid_at"] <= start)]["user_id"].nunique()
        lost = int(((lost_at >= start) & (lost_at <= end)).sum())
        won = int(((won_at >= start) & (won_at <= end)).sum())
        rate = lost / active if active else np.nan
        rows.append({"period": p, "label": period_label(p), "active_at_start": active, "lost": lost, "won_back": won,
                     "churn_rate": rate, "retention_rate": 1 - rate if active else np.nan})
    return pd.DataFrame(rows, columns=cols)


def cohort_repeat(orders: pd.DataFrame, freq: str, as_of: pd.Timestamp, cumulative: bool = True) -> pd.DataFrame:
    """Rows: cohort = period of a customer's first trip. Columns: periods since then.
    Value: share of the cohort who had booked another trip by then (cumulative) or in that period."""
    if orders.empty:
        return pd.DataFrame()
    o = orders.assign(period=to_period(orders["paid_at"], freq))
    first = o.groupby("user_id")["period"].min().rename("cohort")
    o = o.join(first, on="user_id")
    o["age"] = (o["period"] - o["cohort"]).apply(lambda x: x.n)
    sizes = first.value_counts().sort_index()
    repeat = o[o["age"] > 0]
    now = pd.Period(as_of, freq)
    max_age = int((now - sizes.index.min()).n)
    out = pd.DataFrame(index=sizes.index, columns=range(1, max_age + 1), dtype=float)
    for cohort, size in sizes.items():
        r = repeat[repeat["cohort"] == cohort]
        for age in range(1, int((now - cohort).n) + 1):
            users = r[r["age"] <= age] if cumulative else r[r["age"] == age]
            out.loc[cohort, age] = users["user_id"].nunique() / size
    out.index = [f"{period_label(c)} ({n})" for c, n in sizes.items()]
    return out


RFM_SEGMENTS = ["Champions", "Loyal", "New pilgrims", "Promising", "Can't lose them", "At risk", "Hibernating"]
RFM_ADVICE = {
    "Champions": "Travel often and recently. Ask for reviews and referrals; offer early access to new journeys.",
    "Loyal": "Repeat pilgrims. Suggest the natural next dham (see Customer journey).",
    "New pilgrims": "First trip was recent. Send trip photos, a thank-you and a next-journey idea.",
    "Promising": "One trip, a while ago. A seasonal reminder (Shravan, Char Dham opening) works well.",
    "Can't lose them": "Big spenders who have gone quiet. Call them personally.",
    "At risk": "Travelled more than once but not lately. Win-back offer before they are lost.",
    "Hibernating": "One trip long ago. Low-cost reminders only.",
}


def rfm(table: pd.DataFrame) -> pd.DataFrame:
    """Recency / Frequency / Monetary scores (1-5) and a plain-language segment for every paying customer."""
    t = table[table["trips"] > 0].copy()
    if t.empty:
        return t.assign(R=[], F=[], M=[], segment=[])
    t["R"] = pd.qcut(t["days_since_last"].rank(method="first", ascending=False), 5, labels=False) + 1
    t["F"] = t["trips"].clip(upper=5)
    t["M"] = pd.qcut(t["revenue"].rank(method="first"), 5, labels=False) + 1
    t["segment"] = np.select(
        [(t["F"] >= 3) & (t["R"] <= 2) & (t["M"] >= 4),
         (t["R"] >= 4) & (t["F"] >= 3),
         (t["F"] >= 2) & (t["R"] <= 2),
         (t["F"] >= 2),
         (t["F"] == 1) & (t["R"] >= 4),
         (t["F"] == 1) & (t["R"] == 3)],
        ["Can't lose them", "Champions", "At risk", "Loyal", "New pilgrims", "Promising"], default="Hibernating")
    return t


# ---------------------------------------------------------------- customer journey
def funnel(customers: pd.DataFrame, bookings: pd.DataFrame, orders: pd.DataFrame) -> pd.DataFrame:
    trips = orders.groupby("user_id").size()
    steps = [("Signed up", customers["user_id"].nunique()),
             ("Started a booking", bookings[bookings["user_id"].isin(customers["user_id"])]["user_id"].nunique()),
             ("Paid for a trip", int((trips >= 1).sum())),
             ("Came back for a 2nd trip", int((trips >= 2).sum())),
             ("3 or more trips", int((trips >= 3).sum()))]
    f = pd.DataFrame(steps, columns=["step", "customers"])
    f["share_of_signups"] = f["customers"] / max(f["customers"].iloc[0], 1)
    f["share_of_previous"] = f["customers"] / f["customers"].shift(1).replace(0, np.nan)
    return f


def trip_sequence(orders: pd.DataFrame) -> pd.DataFrame:
    o = orders.sort_values(["user_id", "paid_at"]).copy()
    o["trip_no"] = o.groupby("user_id").cumcount() + 1
    return o


def destination_flows(orders: pd.DataFrame, steps: int = 3, field: str = "destination") -> pd.DataFrame:
    """Links for a Sankey: 1st trip place -> 2nd trip place -> 3rd, plus 'No next trip yet'."""
    o = trip_sequence(orders)
    wide = o.pivot_table(index="user_id", columns="trip_no", values=field, aggfunc="first")
    links = []
    for k in range(1, steps):
        if k not in wide.columns:
            break
        src = wide[k].dropna()
        nxt = wide[k + 1] if k + 1 in wide.columns else pd.Series(index=wide.index, dtype=object)
        pairs = pd.DataFrame({"source": src.map(lambda v: f"Trip {k} · {v}"),
                              "target": nxt.reindex(src.index).map(lambda v: f"Trip {k + 1} · {v}", na_action="ignore")})
        pairs["target"] = pairs["target"].fillna(f"No trip {k + 1} yet")
        links.append(pairs.value_counts().rename("customers").reset_index())
    return pd.concat(links, ignore_index=True) if links else pd.DataFrame(columns=["source", "target", "customers"])


def transitions(orders: pd.DataFrame, field: str = "category") -> pd.DataFrame:
    """How many times customers moved from X on one trip to Y on their next trip."""
    o = trip_sequence(orders)
    o["next"] = o.groupby("user_id")[field].shift(-1)
    pairs = o.dropna(subset=["next"])
    return pd.crosstab(pairs[field], pairs["next"]) if not pairs.empty else pd.DataFrame()


def timing(customers: pd.DataFrame, bookings: pd.DataFrame, orders: pd.DataFrame) -> dict[str, pd.Series]:
    """Days from sign-up to first booking, days between trips, days booked ahead of departure."""
    first_booking = bookings.groupby("user_id")["created_at"].min()
    signup = customers.set_index("user_id")["signed_up_at"]
    to_first = (first_booking - signup.reindex(first_booking.index)).dt.days.dropna()
    o = trip_sequence(orders)
    gaps = o.groupby("user_id")["paid_at"].diff().dt.days.dropna()
    lead = (o["start_date"] - o["paid_at"]).dt.days
    return {"signup_to_first_booking": to_first[to_first >= 0], "between_trips": gaps, "booked_ahead": lead[lead >= 0]}


def retry_after_failure(bookings: pd.DataFrame) -> dict[str, int]:
    """Customers whose booking expired/was cancelled: how many paid later anyway?"""
    b = bookings.sort_values("created_at")
    failed = b[b["status"].isin(["EXPIRED", "CANCELLED"])].groupby("user_id")["created_at"].min()
    paid = b[b["status"] == "CONFIRMED"].groupby("user_id")["created_at"].max()
    recovered = paid.reindex(failed.index) > failed
    return {"had_failed_booking": int(len(failed)), "paid_later": int(recovered.sum())}


# ---------------------------------------------------------------- journeys and seats
def occupancy(departures: pd.DataFrame, as_of: pd.Timestamp) -> pd.DataFrame:
    past = departures[(departures["start_date"] < as_of) & (departures["seats_booked"] > 0)].copy()
    past["fill"] = past["seats_booked"] / past["seats_total"]
    return past


def package_health(bookings: pd.DataFrame, reviews: pd.DataFrame) -> pd.DataFrame:
    g = bookings.groupby("package").agg(bookings=("booking_id", "count"),
                                        paid=("status", lambda s: (s == "CONFIRMED").sum()),
                                        revenue=("amount", lambda a: a[bookings.loc[a.index, "status"] == "CONFIRMED"].sum()))
    g["not_completed_pct"] = 1 - g["paid"] / g["bookings"]
    r = reviews.groupby("package")["rating"].agg(["mean", "count"]).rename(columns={"mean": "rating", "count": "reviews"})
    return g.join(r, how="left").sort_values("revenue", ascending=False)
