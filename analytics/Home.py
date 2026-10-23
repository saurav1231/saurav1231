"""Ayana Insights - admin analytics.  Run:  streamlit run Home.py"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import (SAFFRON, SERIES, STATUS, filters, label_room, money_axis, numbers, pct, rupees,
                                setup_page, show, style)

setup_page("Overview")
require_admin()
f = filters()

st.title("Ayana Insights")
st.markdown(f"<p class='note'>{f['start']:%d %b %Y} – {f['end']:%d %b %Y}"
            f"{' · filtered' if f['filtered'] else ''} · compared with the {(f['end'] - f['start']).days + 1} days before</p>",
            unsafe_allow_html=True)

orders_all, orders = f["orders_all"], f["orders"]
span = f["end"] - f["start"]
prev = orders_all[(orders_all["paid_at"] >= f["start"] - span) & (orders_all["paid_at"] < f["start"])]
first_trip = orders_all.groupby("user_id")["paid_at"].min()


def summary(o: pd.DataFrame, start, end) -> dict:
    """Headline numbers for paid trips in [start, end]."""
    firsts = first_trip[(first_trip >= start) & (first_trip <= end) & first_trip.index.isin(o["user_id"])]
    returning = o[o["paid_at"] > o["user_id"].map(first_trip)]  # not the customer's first ever trip
    return {"revenue": o["amount"].sum(), "trips": len(o), "customers": o["user_id"].nunique(), "new": len(firsts),
            "aov": o["amount"].mean() if len(o) else 0, "returning_share": len(returning) / len(o) if len(o) else 0}


now, before = summary(orders, f['start'], f['end']), summary(prev, f['start'] - span, f['start'])


def delta(a, b):
    if not b:
        return None
    return f"{(a - b) / b * 100:+.0f}%"


table = m.customer_table(f["customers"], orders_all, f["as_of"], f["window"])
c = st.columns(6)
c[0].metric("Revenue", rupees(now["revenue"]), delta(now["revenue"], before["revenue"]))
c[1].metric("Paid trips", f"{now['trips']:,}", delta(now["trips"], before["trips"]))
c[2].metric("Paying customers", f"{now['customers']:,}", delta(now["customers"], before["customers"]))
c[3].metric("New pilgrims", f"{now['new']:,}", delta(now["new"], before["new"]),
            help="Customers whose first ever paid trip falls in this period")
c[4].metric("Repeat trips", pct(now["returning_share"]),
            f"{(now['returning_share'] - before['returning_share']) * 100:+.0f} pts" if before["trips"] else None)
c[5].metric("Avg. booking", rupees(now["aov"]), delta(now["aov"], before["aov"]))

# ---- plain-language highlights
rev = m.revenue_by_period(orders_all, f["freq"], f["start"], f["end"])
status_counts = table["status"].value_counts().reindex(m.STATUS_ORDER, fill_value=0)
at_risk_value = table.loc[table["status"] == "At risk", "revenue"].sum()
notes = []
if before["revenue"]:
    change = (now["revenue"] - before["revenue"]) / before["revenue"]
    notes.append(f"Revenue is **{'up' if change >= 0 else 'down'} {abs(change):.0%}** compared with the previous period.")
if len(rev) > 1 and rev["revenue"].max() > 0:
    best = rev.loc[rev["revenue"].idxmax()]
    notes.append(f"Best {f['freq_name'].lower()}: **{best['label']}** with {rupees(best['revenue'])}.")
notes.append(f"**{status_counts['At risk']}** customers are at risk of not coming back; together they have spent "
             f"**{rupees(at_risk_value)}** with you. See *Churn and retention*.")
ga = m.growth_accounting(orders_all[orders_all["paid_at"] <= f["end"]], f["freq"])
ga = ga[ga["period"] >= pd.Period(f["start"], f["freq"])]
if len(ga):
    notes.append(f"**{int(ga['won_back_customers'].sum())}** pilgrims came back after a break in this period (regrowth), "
                 f"worth {rupees(ga['won_back'].sum())}.")
st.info("  \n".join(f"• {n}" for n in notes))

# ---- revenue trend
left, right = st.columns([3, 2])
with left:
    st.subheader(f"Revenue by {f['freq_name'].lower()}")
    fig = go.Figure(go.Bar(x=rev["label"], y=rev["revenue"], marker_color=SAFFRON, name="Revenue",
                           hovertemplate="%{x}<br>₹%{y:,.0f}<extra></extra>"))
    fig.add_scatter(x=rev["label"], y=rev["rolling"], mode="lines", line=dict(color=SERIES[0], width=2),
                    name="3-period average", hovertemplate="%{x}<br>avg ₹%{y:,.0f}<extra></extra>")
    show(money_axis(style(fig), rev["revenue"]))
with right:
    st.subheader("Customers today")
    fig = go.Figure(go.Bar(y=status_counts.index, x=status_counts.values, orientation="h",
                           marker_color=[STATUS[s] for s in status_counts.index], text=status_counts.values,
                           textposition="outside", cliponaxis=False, hovertemplate="%{y}: %{x}<extra></extra>"))
    fig.update_yaxes(autorange="reversed", showgrid=False)
    show(label_room(style(fig, legend=False), status_counts.max()))
    st.markdown(f"<p class='note'>Active = trip in the last {f['window'] // 2} days · At risk = {f['window'] // 2}–"
                f"{f['window']} days · Lost = more than {f['window']} days without a trip.</p>", unsafe_allow_html=True)

numbers(rev[["label", "revenue", "orders", "customers", "aov", "growth_pct", "yoy_pct"]].rename(columns={
    "label": "Period", "revenue": "Revenue ₹", "orders": "Paid trips", "customers": "Customers", "aov": "Avg booking ₹",
    "growth_pct": "Growth vs previous %", "yoy_pct": "Growth vs last year %"}).round(1))

st.subheader("Go deeper")
cols = st.columns(5)
cols[0].page_link("pages/1_Revenue_growth.py", label="Revenue growth & regrowth")
cols[1].page_link("pages/2_Customer_journey.py", label="How customers move")
cols[2].page_link("pages/3_Churn_and_retention.py", label="Churn & retention")
cols[3].page_link("pages/4_Customer_segments.py", label="Customer segments")
cols[4].page_link("pages/5_Journeys_and_seats.py", label="Journeys & seats")
