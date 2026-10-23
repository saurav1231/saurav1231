"""Churn (customers we are losing), retention (customers who come back) and who to call this week."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import BLUE_RAMP, SAFFRON, SERIES, STATUS, filters, numbers, pct, rupees, setup_page, show, style

setup_page("Churn and retention")
require_admin()
f = filters()
w = f["window"]
st.title("Churn & retention")
st.markdown(f"<p class='note'>A customer counts as <b>lost (churned)</b> after <b>{w} days</b> without a new trip "
            f"(change it in the sidebar). <b>At risk</b> = {w // 2}–{w} days. <b>Won back</b> = came back after more than "
            f"{w} days.</p>", unsafe_allow_html=True)

orders_all = f["orders_all"]
table = m.customer_table(f["customers"], orders_all, f["as_of"], w)
counts = table["status"].value_counts().reindex(m.STATUS_ORDER, fill_value=0)
churn = m.churn_by_period(orders_all, f["freq"], w, f["as_of"])
in_range = churn[(churn["period"] >= pd.Period(f["start"], f["freq"])) & (churn["period"] <= pd.Period(f["end"], f["freq"]))]
full = in_range[in_range["period"] < pd.Period(f["as_of"], f["freq"])]

c = st.columns(5)
for col, s in zip(c, m.STATUS_ORDER):
    col.metric(s, f"{counts[s]:,}")
c[4].metric(f"Churn rate, last full {f['freq_name'].lower()}", pct(full["churn_rate"].iloc[-1], 1) if len(full) else "–",
            help="Customers lost during the period ÷ customers active at its start")

a, b = st.columns([2, 3])
with a:
    st.subheader("All customers by status")
    fig = go.Figure(go.Bar(x=counts.index, y=counts.values, marker_color=[STATUS[s] for s in counts.index],
                           text=counts.values, textposition="outside", cliponaxis=False))
    show(style(fig, 320, legend=False))
with b:
    st.subheader(f"Churn rate per {f['freq_name'].lower()}")
    fig = go.Figure(go.Scatter(x=in_range["label"], y=in_range["churn_rate"], mode="lines+markers",
                               line=dict(color=SAFFRON, width=2), marker=dict(size=8),
                               hovertemplate="%{x}<br>%{y:.1%} churned<extra></extra>"))
    fig.update_yaxes(tickformat=".0%", rangemode="tozero")
    show(style(fig, 320, legend=False))

st.subheader("Lost vs won back")
fig = go.Figure()
fig.add_bar(x=in_range["label"], y=in_range["lost"], name="Lost", marker_color=SERIES[1])
fig.add_bar(x=in_range["label"], y=in_range["won_back"], name="Won back", marker_color=SERIES[0])
fig.update_layout(barmode="group")
show(style(fig, 300))
numbers(in_range[["label", "active_at_start", "lost", "won_back", "churn_rate", "retention_rate"]].round(3))

# ---- cohorts
st.subheader("Do first-time pilgrims come back?")
mode = st.radio("Show", ["By then (cumulative)", "In that period only"], horizontal=True)
cfreq = "Q" if f["freq"] == "M" else f["freq"]
st.markdown(f"<p class='note'>Each row is a group of customers by the {'quarter' if cfreq == 'Q' else 'year'} of their "
            "first trip (group size in brackets). Each column is how many quarters/years later. The value is the share of "
            "the group who had booked another trip.</p>", unsafe_allow_html=True)
coh = m.cohort_repeat(orders_all, cfreq, f["as_of"], cumulative=mode.startswith("By"))
if coh.empty:
    st.write("No trips yet.")
else:
    fig = go.Figure(go.Heatmap(z=coh.values, x=[f"+{c}" for c in coh.columns], y=coh.index, colorscale=BLUE_RAMP,
                               zmin=0, zmax=max(0.05, float(pd.DataFrame(coh).max().max())),
                               text=coh.map(lambda v: "" if pd.isna(v) else f"{v:.0%}").values, texttemplate="%{text}",
                               colorbar=dict(tickformat=".0%"),
                               hovertemplate="%{y}<br>%{x} later: %{z:.0%}<extra></extra>"))
    fig.update_yaxes(autorange="reversed")
    fig.update_xaxes(title=f"{'Quarters' if cfreq == 'Q' else 'Years'} after first trip")
    show(style(fig, 60 + 28 * len(coh), legend=False))

# ---- who to call
st.subheader("Who to call this week")
st.markdown("<p class='note'>At-risk customers, most valuable first. A personal call or WhatsApp with a journey that "
            "fits their last trip (see <i>How customers move</i>) is the best way to win them back.</p>", unsafe_allow_html=True)
risk = table[table["status"] == "At risk"].sort_values("revenue", ascending=False)
view = pd.DataFrame({
    "Name": risk["name"], "Phone": risk["phone"], "Email": risk["email"], "Trips": risk["trips"],
    "Spent": risk["revenue"].map(lambda v: rupees(v, short=False)),
    "Last trip": risk["last_trip"].dt.strftime("%d %b %Y"), "Days since": risk["days_since_last"].astype("Int64"),
})
st.dataframe(view.head(50), use_container_width=True, hide_index=True)
st.download_button("Download the full list (CSV)", view.to_csv(index=False).encode("utf-8-sig"),
                   file_name="ayana-at-risk-customers.csv", mime="text/csv")
