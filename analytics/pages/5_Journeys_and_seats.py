"""Which journeys earn, which fill their seats, which lose bookings, and how they are rated."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import SAFFRON, filters, label_room, money_axis, numbers, pct, rupees, setup_page, show, style

setup_page("Journeys and seats")
require_admin()
f = filters()
st.title("Journeys & seats")

health = m.package_health(f["bookings"], f["reviews"])
if health.empty:
    st.write("No bookings in this period.")
    st.stop()

a, b = st.columns(2)
with a:
    st.subheader("Revenue by journey")
    h = health.sort_values("revenue")
    fig = go.Figure(go.Bar(y=h.index, x=h["revenue"], orientation="h", marker_color=SAFFRON,
                           text=h["revenue"].map(rupees), textposition="outside", cliponaxis=False,
                           hovertemplate="%{y}<br>₹%{x:,.0f}<extra></extra>"))
    fig.update_yaxes(showgrid=False)
    fig = money_axis(style(fig, 420, legend=False), [0, h["revenue"].max() * 1.2], axis="x")
    show(label_room(fig, h["revenue"].max()))
with b:
    st.subheader("Bookings that were not completed")
    h = health.sort_values("not_completed_pct")
    fig = go.Figure(go.Bar(y=h.index, x=h["not_completed_pct"], orientation="h", marker_color=SAFFRON,
                           text=h["not_completed_pct"].map(pct), textposition="outside", cliponaxis=False,
                           hovertemplate="%{y}<br>%{x:.0%} not paid or cancelled<extra></extra>"))
    fig.update_xaxes(tickformat=".0%")
    fig.update_yaxes(showgrid=False)
    show(label_room(style(fig, 420, legend=False), h["not_completed_pct"].max()))
    st.markdown("<p class='note'>A high share can mean the price surprises people at checkout, or dates fill up.</p>",
                unsafe_allow_html=True)

st.subheader("How full were past departures")
occ = m.occupancy(f["departures"], f["as_of"])
occ = occ[(occ["start_date"] >= f["start"]) & (occ["start_date"] <= f["end"])]
if occ.empty:
    st.write("No departures in this period.")
else:
    by_dest = occ.groupby("destination")["fill"].mean().sort_values()
    c1, c2 = st.columns(2)
    with c1:
        fig = go.Figure(go.Bar(y=by_dest.index, x=by_dest.values, orientation="h", marker_color=SAFFRON,
                               text=[pct(v) for v in by_dest.values], textposition="outside", cliponaxis=False))
        fig.update_xaxes(tickformat=".0%", range=[0, 1.15])
        fig.update_yaxes(showgrid=False)
        show(style(fig, 380, legend=False))
        st.caption("Average share of seats filled, by destination")
    with c2:
        fig = go.Figure(go.Histogram(x=occ["fill"], nbinsx=10, marker_color=SAFFRON, hovertemplate="%{x:.0%}: %{y} departures<extra></extra>"))
        fig.update_xaxes(tickformat=".0%", title="seats filled")
        show(style(fig, 380, legend=False))
        st.caption("Number of departures by how full they were")

st.subheader("Upcoming departures")
up = f["departures"][(f["departures"]["start_date"] >= pd.Timestamp.today().normalize())].sort_values("start_date").head(30)
st.dataframe(pd.DataFrame({"Date": up["start_date"].dt.strftime("%d %b %Y"), "Journey": up["package"],
                           "Seats booked": up["seats_booked"], "Seats": up["seats_total"],
                           "Filled": (up["seats_booked"] / up["seats_total"]).map(pct)}),
             use_container_width=True, hide_index=True)

numbers(health.reset_index().rename(columns={"package": "Journey", "bookings": "Bookings", "paid": "Paid",
                                             "revenue": "Revenue ₹", "not_completed_pct": "Not completed",
                                             "rating": "Avg rating", "reviews": "Reviews"}).round(2), "Journey table")
