"""Checks the analytics definitions on tiny, hand-made data."""
import pandas as pd
import pytest

from ayana_analytics import metrics as m

T = pd.Timestamp


def orders(rows):
    df = pd.DataFrame(rows, columns=["user_id", "paid_at", "amount", "destination", "category"])
    df["paid_at"] = pd.to_datetime(df["paid_at"])
    df["booking_id"] = [f"b{i}" for i in range(len(df))]
    df["start_date"] = df["paid_at"] + pd.Timedelta(days=30)
    return df


O = orders([
    ("a", "2025-01-10", 100, "Varanasi", "Pilgrimage"),
    ("a", "2025-02-10", 150, "Kedarnath", "Char Dham"),
    ("b", "2025-01-20", 200, "Rishikesh", "Yoga Retreat"),
    ("c", "2025-02-05", 50, "Varanasi", "Pilgrimage"),
    ("b", "2025-04-01", 100, "Dharamshala", "Meditation"),  # b skipped Feb & Mar -> won back in Apr
])


def test_revenue_by_period_growth():
    r = m.revenue_by_period(O, "M", T("2025-01-01"), T("2025-04-30"))
    assert list(r["revenue"]) == [300, 200, 0, 100]
    assert r.loc[1, "growth_pct"] == pytest.approx(-33.333, rel=1e-3)
    assert list(r["cumulative"]) == [300, 500, 500, 600]
    assert r.loc[0, "customers"] == 2


def test_growth_accounting():
    g = m.growth_accounting(O, "M").set_index("label")
    feb, mar, apr = g.loc["Feb 2025"], g.loc["Mar 2025"], g.loc["Apr 2025"]
    assert feb["new"] == 50 and feb["expansion"] == 50 and feb["lost"] == -200  # c new, a grew 100->150, b gone
    assert mar["lost"] == -200 and mar["new"] == 0  # a and c had nothing in March
    assert apr["won_back"] == 100 and apr["won_back_customers"] == 1


def test_new_vs_returning():
    t = m.new_vs_returning(O, "M").set_index("label")
    assert t.loc["Jan 2025", "New pilgrims"] == 300
    assert t.loc["Feb 2025", "Returning pilgrims"] == 150 and t.loc["Feb 2025", "New pilgrims"] == 50


def test_customer_status_and_churn():
    customers = pd.DataFrame({"user_id": ["a", "b", "c", "d"], "name": list("abcd"), "email": list("abcd"),
                              "phone": list("abcd"), "signed_up_at": pd.to_datetime(["2025-01-01"] * 4)})
    t = m.customer_table(customers, O, T("2025-12-31"), window=365).set_index("user_id")
    assert t.loc["d", "status"] == "Never booked"
    assert t.loc["b", "trips"] == 2 and t.loc["b", "status"] == "At risk"  # 274 days since April
    t2 = m.customer_table(customers, O, T("2026-03-01"), window=365).set_index("user_id")
    assert t2.loc["a", "status"] == "Lost (churned)"

    c = m.churn_by_period(O, "Q", window=60, as_of=T("2025-12-31")).set_index("label")
    # with a 60-day window: c (last trip Feb 5) and a (Feb 10) are lost in Q2, b's Jan trip had no follow-up within 60 days
    assert c.loc["Q2 2025", "lost"] == 3 and c.loc["Q2 2025", "won_back"] == 1


def test_cohort_repeat():
    c = m.cohort_repeat(O, "M", T("2025-04-30"))
    jan = c.loc["Jan 2025 (2)"]
    assert jan[1] == 0.5  # a came back in Feb
    assert jan[3] == 1.0  # by April both a and b came back
    assert pd.isna(c.loc["Apr 2025 (0)", 1]) if "Apr 2025 (0)" in c.index else True


def test_rfm_segments_and_flows():
    customers = pd.DataFrame({"user_id": list("abc"), "name": list("abc"), "email": list("abc"), "phone": list("abc"),
                              "signed_up_at": pd.to_datetime(["2025-01-01"] * 3)})
    t = m.customer_table(customers, O, T("2025-05-01"), window=365)
    r = m.rfm(t)
    assert set(r["segment"]) <= set(m.RFM_SEGMENTS) and len(r) == 3
    flows = m.destination_flows(O)
    row = flows[(flows["source"] == "Trip 1 · Varanasi") & (flows["target"] == "Trip 2 · Kedarnath")]
    assert int(row["customers"].iloc[0]) == 1
    assert "No trip 2 yet" in set(flows["target"])
    assert m.transitions(O).loc["Pilgrimage", "Char Dham"] == 1


def test_funnel():
    customers = pd.DataFrame({"user_id": list("abcd")})
    bookings = pd.DataFrame({"user_id": list("abc")})
    f = m.funnel(customers, bookings, O).set_index("step")["customers"]
    assert list(f) == [4, 3, 3, 2, 0]
