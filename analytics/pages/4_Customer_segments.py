"""RFM segments: Recency (how recently), Frequency (how often), Monetary (how much)."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import SAFFRON, filters, label_room, money_axis, rupees, setup_page, show, style

setup_page("Customer segments")
require_admin()
f = filters()
st.title("Customer segments")
st.markdown("<p class='note'>Every paying customer gets three scores from 1 to 5: <b>R</b>ecency (how recently they "
            "travelled), <b>F</b>requency (how many trips) and <b>M</b>onetary (how much they spent). The scores place "
            "them in a segment with a suggested action.</p>", unsafe_allow_html=True)

table = m.customer_table(f["customers"], f["orders_all"], f["as_of"], f["window"])
seg = m.rfm(table)
if seg.empty:
    st.write("No paying customers yet.")
    st.stop()

summary = seg.groupby("segment").agg(customers=("user_id", "count"), revenue=("revenue", "sum"),
                                     avg_trips=("trips", "mean"), avg_days_since=("days_since_last", "mean"))
summary = summary.reindex([s for s in m.RFM_SEGMENTS if s in summary.index])

a, b = st.columns(2)
with a:
    st.subheader("Customers per segment")
    fig = go.Figure(go.Bar(y=summary.index, x=summary["customers"], orientation="h", marker_color=SAFFRON,
                           text=summary["customers"], textposition="outside", cliponaxis=False))
    fig.update_yaxes(autorange="reversed", showgrid=False)
    show(label_room(style(fig, 320, legend=False), summary["customers"].max()))
with b:
    st.subheader("Lifetime revenue per segment")
    fig = go.Figure(go.Bar(y=summary.index, x=summary["revenue"], orientation="h", marker_color=SAFFRON,
                           text=summary["revenue"].map(rupees), textposition="outside", cliponaxis=False,
                           hovertemplate="%{y}: ₹%{x:,.0f}<extra></extra>"))
    fig.update_yaxes(autorange="reversed", showgrid=False)
    fig = money_axis(style(fig, 320, legend=False), [0, summary["revenue"].max() * 1.2], axis="x")
    show(label_room(fig, summary["revenue"].max()))

st.subheader("What to do with each segment")
st.dataframe(pd.DataFrame({
    "Segment": summary.index, "Customers": summary["customers"].values,
    "Lifetime revenue": [rupees(v, short=False) for v in summary["revenue"]],
    "Avg trips": summary["avg_trips"].round(1).values, "Avg days since last trip": summary["avg_days_since"].round(0).values,
    "Suggested action": [m.RFM_ADVICE[s] for s in summary.index],
}), use_container_width=True, hide_index=True)

st.subheader("Customers in a segment")
pick = st.selectbox("Segment", list(summary.index))
rows = seg[seg["segment"] == pick].sort_values("revenue", ascending=False)
view = pd.DataFrame({"Name": rows["name"], "Phone": rows["phone"], "Email": rows["email"], "Trips": rows["trips"],
                     "Spent": rows["revenue"].map(lambda v: rupees(v, short=False)),
                     "Last trip": rows["last_trip"].dt.strftime("%d %b %Y"), "R": rows["R"], "F": rows["F"], "M": rows["M"]})
st.dataframe(view, use_container_width=True, hide_index=True)
st.download_button(f"Download {pick} (CSV)", view.to_csv(index=False).encode("utf-8-sig"),
                   file_name=f"ayana-segment-{pick.lower().replace(' ', '-').replace(chr(39), '')}.csv", mime="text/csv")
