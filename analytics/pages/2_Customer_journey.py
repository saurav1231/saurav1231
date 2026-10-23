"""How customers move: sign-up to repeat trips, which dham they visit next, and timing."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import BLUE_RAMP, MUTED, SAFFRON, SERIES, filters, label_room, numbers, pct, setup_page, show, style

setup_page("Customer journey")
require_admin()
f = filters()
st.title("How customers move")
st.markdown("<p class='note'>Uses all customers who signed up in the selected period, and everything they did afterwards.</p>",
            unsafe_allow_html=True)

cust = f["customers"][(f["customers"]["signed_up_at"] >= f["start"]) & (f["customers"]["signed_up_at"] <= f["end"])]
ids = set(cust["user_id"])
bookings = f["bookings_all"][f["bookings_all"]["user_id"].isin(ids)]
orders = f["orders_all"][f["orders_all"]["user_id"].isin(ids)]

# ---- funnel
st.subheader("From sign-up to loyal pilgrim")
fun = m.funnel(cust, bookings, orders)
fig = go.Figure(go.Bar(y=fun["step"], x=fun["customers"], orientation="h", marker_color=SAFFRON,
                       text=[f"{n:,} · {pct(s)}" for n, s in zip(fun["customers"], fun["share_of_signups"])],
                       textposition="outside", cliponaxis=False, hovertemplate="%{y}: %{x:,}<extra></extra>"))
fig.update_yaxes(autorange="reversed", showgrid=False)
fig.update_xaxes(showgrid=False, showticklabels=False)
show(label_room(style(fig, 300, legend=False), fun["customers"].max()))
step = fun.dropna(subset=["share_of_previous"])
weakest = step.loc[step["share_of_previous"].idxmin()] if len(step) else None
if weakest is not None:
    st.markdown(f"<p class='note'>Biggest drop: only <b>{pct(weakest['share_of_previous'])}</b> make it to "
                f"<b>{weakest['step'].lower()}</b> from the step before.</p>", unsafe_allow_html=True)

# ---- booking outcomes
a, b = st.columns(2)
with a:
    st.subheader("What happens to bookings")
    outcome = bookings["status"].map({"CONFIRMED": "Paid", "EXPIRED": "Not paid in time", "CANCELLED": "Cancelled",
                                      "PENDING": "Waiting for payment"}).value_counts()
    fig = go.Figure(go.Sankey(
        node=dict(label=["Booking started"] + list(outcome.index), pad=18, thickness=14,
                  color=[MUTED] + [SERIES[i] for i in range(len(outcome))]),
        link=dict(source=[0] * len(outcome), target=list(range(1, len(outcome) + 1)), value=list(outcome.values),
                  color="rgba(169,163,189,0.25)")))
    show(style(fig, 300, legend=False))
with b:
    st.subheader("Second chances")
    r = m.retry_after_failure(bookings)
    st.metric("Customers whose booking was not completed", f"{r['had_failed_booking']:,}")
    st.metric("…who paid for a trip later anyway", f"{r['paid_later']:,}",
              pct(r["paid_later"] / r["had_failed_booking"]) if r["had_failed_booking"] else None, delta_color="off")
    st.markdown("<p class='note'>A reminder on WhatsApp within an hour of an unpaid booking usually lifts this number.</p>",
                unsafe_allow_html=True)

# ---- movement between dhams
st.subheader("Where pilgrims go next")
field = st.radio("Show by", ["destination", "category"], horizontal=True,
                 format_func=lambda x: "Destination" if x == "destination" else "Journey type")
flows = m.destination_flows(orders, steps=3, field=field)
if flows.empty:
    st.write("Not enough repeat trips yet.")
else:
    min_n = st.slider("Hide flows with fewer customers than", 1, 20, 2)
    fl = flows[flows["customers"] >= min_n]
    labels = list(dict.fromkeys(list(fl["source"]) + list(fl["target"])))
    idx = {l: i for i, l in enumerate(labels)}
    places = sorted({l.split(" · ", 1)[1] for l in labels if " · " in l})
    color_of = {p: SERIES[i % len(SERIES)] for i, p in enumerate(places)}
    node_colors = [color_of.get(l.split(" · ", 1)[1], MUTED) if " · " in l else MUTED for l in labels]
    fig = go.Figure(go.Sankey(
        node=dict(label=labels, pad=12, thickness=12, color=node_colors),
        link=dict(source=fl["source"].map(idx), target=fl["target"].map(idx), value=fl["customers"],
                  color="rgba(169,163,189,0.22)", hovertemplate="%{source.label} → %{target.label}: %{value} customers<extra></extra>")))
    show(style(fig, 560, legend=False))
    numbers(flows.sort_values("customers", ascending=False), "See all flows")

st.subheader("From one journey type to the next")
tr = m.transitions(orders, "category")
if tr.empty:
    st.write("Not enough repeat trips yet.")
else:
    share = tr.div(tr.sum(axis=1), axis=0)
    fig = go.Figure(go.Heatmap(z=share.values, x=share.columns, y=share.index, colorscale=BLUE_RAMP, zmin=0, zmax=1,
                               text=tr.values, texttemplate="%{text}", colorbar=dict(tickformat=".0%", title="share"),
                               hovertemplate="%{y} → %{x}<br>%{z:.0%} of next trips (%{text})<extra></extra>"))
    fig.update_xaxes(title="Next trip")
    fig.update_yaxes(title="Previous trip", autorange="reversed")
    show(style(fig, 420, legend=False))

# ---- timing
st.subheader("Timing")
t = m.timing(cust, bookings, orders)
cols = st.columns(3)
for col, (key, title, unit) in zip(cols, [("signup_to_first_booking", "Sign-up → first booking", "days"),
                                          ("between_trips", "Time between trips", "days"),
                                          ("booked_ahead", "Booked ahead of departure", "days")]):
    s = t[key]
    with col:
        st.metric(title, f"{s.median():.0f} {unit}" if len(s) else "–", help="Median (half are shorter, half longer)")
        if len(s):
            fig = go.Figure(go.Histogram(x=s, nbinsx=24, marker_color=SAFFRON, hovertemplate="%{x} days: %{y}<extra></extra>"))
            fig.update_xaxes(title="days")
            show(style(fig, 220, legend=False))

# ---- sign-ups vs first trips
st.subheader("Sign-ups and first trips")
fr = f["freq"]
su = cust.groupby(m.to_period(cust["signed_up_at"], fr)).size().rename("Sign-ups")
first = orders.groupby("user_id")["paid_at"].min()
ft = first.groupby(m.to_period(first, fr)).size().rename("First paid trips")
st_df = pd.concat([su, ft], axis=1).fillna(0)
st_df = st_df[st_df.index <= pd.Period(f["end"], fr)]
fig = go.Figure()
fig.add_bar(x=[m.period_label(p) for p in st_df.index], y=st_df["Sign-ups"], name="Sign-ups", marker_color=SERIES[0])
fig.add_bar(x=[m.period_label(p) for p in st_df.index], y=st_df["First paid trips"], name="First paid trips", marker_color=SERIES[1])
fig.update_layout(barmode="group")
show(style(fig, 320))
