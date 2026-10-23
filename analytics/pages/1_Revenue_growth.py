"""Revenue growth, where growth comes from, and regrowth (customers coming back, rebounds after a dip)."""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from ayana_analytics import metrics as m
from ayana_analytics.auth import require_admin
from ayana_analytics.ui import SAFFRON, SERIES, filters, money_axis, numbers, pct, rupees, setup_page, show, style

setup_page("Revenue growth")
require_admin()
f = filters()
st.title("Revenue growth & regrowth")

orders_all = f["orders_all"][f["orders_all"]["paid_at"] <= f["end"]]
rev = m.revenue_by_period(orders_all, f["freq"], f["start"], f["end"])
unit = f["freq_name"].lower()

total = rev["revenue"].sum()
last = rev.iloc[-1] if len(rev) else None
c = st.columns(4)
c[0].metric("Revenue in period", rupees(total))
c[1].metric(f"Latest {unit} vs previous", rupees(last["revenue"]) if last is not None else "–",
            None if last is None or pd.isna(last["growth_pct"]) else f"{last['growth_pct']:+.0f}%")
c[2].metric(f"Latest {unit} vs a year before", "–" if last is None or pd.isna(last["yoy_pct"]) else f"{last['yoy_pct']:+.0f}%")
c[3].metric(f"Average per {unit}", rupees(rev["revenue"].mean() if len(rev) else 0))
if f["freq"] == "M":
    st.caption("Tip: pilgrimages are seasonal. Compare with *a year before* rather than the previous month, or group by Quarter.")

st.subheader(f"Revenue per {unit}")
fig = go.Figure(go.Bar(x=rev["label"], y=rev["revenue"], marker_color=SAFFRON, name="Revenue",
                       hovertemplate="%{x}<br>₹%{y:,.0f}<extra></extra>"))
fig.add_scatter(x=rev["label"], y=rev["rolling"], mode="lines", line=dict(color=SERIES[0], width=2), name="3-period average")
show(money_axis(style(fig), rev["revenue"]))

a, b = st.columns(2)
with a:
    st.subheader(f"Growth vs previous {unit}")
    g = rev.dropna(subset=["growth_pct"])
    fig = go.Figure(go.Bar(x=g["label"], y=g["growth_pct"], marker_color=[SERIES[0] if v >= 0 else SERIES[1] for v in g["growth_pct"]],
                           hovertemplate="%{x}<br>%{y:+.0f}%<extra></extra>"))
    fig.update_yaxes(ticksuffix="%")
    show(style(fig, 300, legend=False))
with b:
    st.subheader("Growth vs the same time last year")
    g = rev.dropna(subset=["yoy_pct"])
    if g.empty:
        st.write("Needs at least a year of history.")
    else:
        fig = go.Figure(go.Scatter(x=g["label"], y=g["yoy_pct"], mode="lines+markers", line=dict(color=SERIES[0], width=2),
                                   marker=dict(size=8), hovertemplate="%{x}<br>%{y:+.0f}%<extra></extra>"))
        fig.update_yaxes(ticksuffix="%")
        show(style(fig, 300, legend=False))

# ---- where growth came from
st.subheader("Where the growth came from")
st.markdown(
    "<p class='note'>Each bar splits the change in revenue by customer behaviour. Above zero: <b>new</b> pilgrims "
    "(first trip), <b>won back</b> (came back after skipping at least one period, the <i>regrowth</i>) and "
    "<b>spent more</b> than in the previous period. Below zero: <b>spent less</b> and <b>did not travel</b> this period. "
    "Most pilgrims travel once a year, so <i>Quarter</i> or <i>Year</i> gives the clearest picture.</p>",
    unsafe_allow_html=True)
ga = m.growth_accounting(orders_all, f["freq"])
ga = ga[ga["period"] >= pd.Period(f["start"], f["freq"])]
fig = go.Figure()
for col, name, color in [("new", "New pilgrims", SERIES[0]), ("won_back", "Won back (regrowth)", SERIES[1]),
                         ("expansion", "Spent more", SERIES[2]), ("contraction", "Spent less", SERIES[3]),
                         ("lost", "Did not travel this period", SERIES[4])]:
    fig.add_bar(x=ga["label"], y=ga[col], name=name, marker_color=color, hovertemplate="%{x}<br>" + name + ": ₹%{y:,.0f}<extra></extra>")
fig.update_layout(barmode="relative")
gains = ga[["new", "won_back", "expansion"]].sum(axis=1)
losses = ga[["contraction", "lost"]].sum(axis=1)
show(money_axis(style(fig, 380), list(gains) + list(losses)))
q = ga.dropna(subset=["quick_ratio"])
if len(q):
    st.markdown(f"<p class='note'><b>Growth quick ratio</b> (gains ÷ losses) for the latest {unit}: "
                f"<b>{q['quick_ratio'].iloc[-1]:.1f}</b>. Above 1 means revenue gained from new, returning and bigger "
                f"bookings outweighs revenue lost; above 4 is excellent.</p>", unsafe_allow_html=True)
numbers(ga[["label", "new", "won_back", "expansion", "retained", "contraction", "lost", "quick_ratio",
            "new_customers", "won_back_customers", "lost_customers"]].round(2))

# ---- new vs returning
st.subheader("New vs returning pilgrims")
nr = m.new_vs_returning(orders_all, f["freq"])
nr = nr[(nr["period"] >= pd.Period(f["start"], f["freq"])) & (nr["period"] <= pd.Period(f["end"], f["freq"]))]
fig = go.Figure()
fig.add_bar(x=nr["label"], y=nr["New pilgrims"], name="New pilgrims", marker_color=SERIES[0])
fig.add_bar(x=nr["label"], y=nr["Returning pilgrims"], name="Returning pilgrims", marker_color=SERIES[1])
fig.update_layout(barmode="stack")
fig.update_traces(hovertemplate="%{x}<br>₹%{y:,.0f}<extra></extra>")
show(money_axis(style(fig, 340), nr["New pilgrims"] + nr["Returning pilgrims"]))
share = nr["Returning pilgrims"].sum() / max(nr[["New pilgrims", "Returning pilgrims"]].to_numpy().sum(), 1)
st.markdown(f"<p class='note'>Returning pilgrims brought <b>{pct(share)}</b> of revenue in this period.</p>", unsafe_allow_html=True)

# ---- rebounds
st.subheader("Rebounds after a dip")
r = rev.reset_index(drop=True)
rebounds = []
for i in range(1, len(r)):
    if i >= 2 and r.loc[i - 1, "revenue"] < r.loc[i - 2, "revenue"] and r.loc[i, "revenue"] > r.loc[i - 1, "revenue"]:
        peak = r.loc[: i - 1, "revenue"].max()
        rebounds.append({"Period": r.loc[i, "label"], "Revenue": rupees(r.loc[i, "revenue"], short=False),
                         "Up from the dip": f"{(r.loc[i, 'revenue'] / max(r.loc[i - 1, 'revenue'], 1) - 1) * 100:+.0f}%",
                         "Share of earlier peak regained": pct(r.loc[i, "revenue"] / peak) if peak else "–"})
if rebounds:
    st.dataframe(pd.DataFrame(rebounds), use_container_width=True, hide_index=True)
else:
    st.write("No dip-and-recovery in this period.")

# ---- by destination / type
st.subheader("Revenue by destination")
o = f["orders"].assign(period=m.to_period(f["orders"]["paid_at"], f["freq"]))
top = o.groupby("destination")["amount"].sum().nlargest(5).index
o["group"] = o["destination"].where(o["destination"].isin(top), "Other")
t = o.pivot_table(index="period", columns="group", values="amount", aggfunc="sum", fill_value=0)
order = list(top) + (["Other"] if "Other" in t.columns else [])
fig = go.Figure()
for i, col in enumerate(order):
    fig.add_scatter(x=[m.period_label(p) for p in t.index], y=t[col], mode="lines+markers", name=col,
                    line=dict(color=SERIES[i], width=2), marker=dict(size=8), hovertemplate=col + "<br>%{x}: ₹%{y:,.0f}<extra></extra>")
show(money_axis(style(fig, 360), t.to_numpy().ravel() if len(t) else []))
