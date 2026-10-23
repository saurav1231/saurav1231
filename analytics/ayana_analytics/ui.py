"""Shared look for every page: colours, chart styling, sidebar filters, number formats."""
from datetime import date, timedelta

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from .data import load_all
from .metrics import FREQS

# Validated dark-mode categorical palette, always used in this order.
SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
SAFFRON = "#f08a24"  # single-series charts (Ayana brand)
# Reserved status colours - always shown with a text label too
STATUS = {"Active": "#0ca30c", "At risk": "#fab219", "Lost (churned)": "#d03b3b", "Never booked": "#7d7891"}
BLUE_RAMP = [[0, "#13112a"], [0.15, "#0d366b"], [0.45, "#2a78d6"], [0.75, "#86b6ef"], [1, "#cde2fb"]]
TEXT, MUTED, GRID = "#f4efe6", "#a9a3bd", "rgba(255,255,255,0.08)"


def setup_page(title: str):
    st.set_page_config(page_title=f"{title} · Ayana Insights", page_icon=":material/temple_hindu:", layout="wide")
    st.markdown(
        """<style>
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Inter:wght@400;500;600&display=swap');
        html, body, [class*="css"] { font-family: 'Inter', system-ui, sans-serif; }
        h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif !important; font-weight: 600 !important; }
        [data-testid="stMetricValue"] { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 2rem; }
        [data-testid="stMetric"] { background: #181633; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 0.8rem 1rem; }
        .note { color: #a9a3bd; font-size: 0.9rem; }
        </style>""",
        unsafe_allow_html=True,
    )


def rupees(v: float, short: bool = True) -> str:
    """₹ in Indian units. short: ₹12K, ₹3.4L, ₹1.20Cr · long: ₹1,23,45,678"""
    if v is None or pd.isna(v):
        return "–"
    if not short:
        sign, digits = ("-" if v < 0 else ""), str(int(round(abs(v))))
        head, tail = digits[:-3], digits[-3:]
        groups = [head[max(i - 2, 0):i] for i in range(len(head), 0, -2)][::-1]
        return f"{sign}₹" + ",".join(groups + [tail])
    a = abs(v)
    if a >= 1e7:
        return f"₹{v / 1e7:.2f}".rstrip("0").rstrip(".") + "Cr"
    if a >= 1e5:
        return f"₹{v / 1e5:.1f}".removesuffix(".0") + "L"
    if a >= 1e3:
        return f"₹{v / 1e3:.0f}K"
    return f"₹{v:.0f}"


def pct(v, digits=None) -> str:
    """Percent; small values get one decimal so 0.4% doesn't show as 0%."""
    if v is None or pd.isna(v):
        return "–"
    if digits is None:
        digits = 1 if 0 < abs(v) < 0.1 else 0
    return f"{v * 100:.{digits}f}%"


def style(fig: go.Figure, height: int = 360, legend: bool = True) -> go.Figure:
    fig.update_layout(
        height=height, margin=dict(l=8, r=8, t=30, b=8), paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, system-ui, sans-serif", color=TEXT, size=13), hoverlabel=dict(bgcolor="#0b0a1a"),
        showlegend=legend, legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, font=dict(color=MUTED)),
        bargap=0.35,
    )
    fig.update_xaxes(showgrid=False, linecolor=GRID, tickfont=dict(color=MUTED))
    fig.update_yaxes(gridcolor=GRID, zeroline=True, zerolinecolor=GRID, tickfont=dict(color=MUTED))
    return fig


def nice_ticks(lo: float, hi: float, n: int = 5) -> list[float]:
    """Round tick values covering lo..hi (always includes 0)."""
    lo, hi = min(lo, 0), max(hi, 0)
    span = hi - lo or 1
    raw = span / n
    mag = 10 ** np.floor(np.log10(raw))
    step = next(s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw)
    return list(np.arange(np.floor(lo / step) * step, np.ceil(hi / step) * step + step * 0.5, step))


def money_axis(fig: go.Figure, values, axis: str = "y") -> go.Figure:
    """Label a money axis in Indian units (₹50K, ₹2.5L, ₹1.2Cr) instead of 2.5M."""
    vals = pd.Series(list(values), dtype=float).dropna()
    ticks = nice_ticks(vals.min() if len(vals) else 0, vals.max() if len(vals) else 0)
    upd = dict(tickvals=ticks, ticktext=[rupees(t) for t in ticks])
    (fig.update_yaxes if axis == "y" else fig.update_xaxes)(**upd)
    return fig


def label_room(fig: go.Figure, max_value: float, axis: str = "x") -> go.Figure:
    """Extra space so values printed at the end of horizontal bars are not cut off."""
    (fig.update_xaxes if axis == "x" else fig.update_yaxes)(range=[0, (max_value or 1) * 1.22])
    return fig


def show(fig: go.Figure):
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})


def numbers(df: pd.DataFrame, label: str = "See the numbers"):
    with st.expander(label):
        st.dataframe(df, use_container_width=True, hide_index=True)


def filters() -> dict:
    """Sidebar filters shared by all pages (remembered while you move between pages)."""
    data = load_all()
    today = date.today()
    ss = st.session_state
    # Streamlit forgets widget values when you change page, so each filter keeps its value in a separate key.
    defaults = {"f_range": (today - timedelta(days=365), today), "f_freq": "Month", "f_window": 365, "f_dest": [], "f_cat": []}
    for k, v in defaults.items():
        ss.setdefault(k, v)
        ss["w_" + k] = ss[k]

    def keep_value(k):
        ss[k] = ss["w_" + k]

    with st.sidebar:
        st.header("Filters")
        st.date_input("Period", key="w_f_range", max_value=today, on_change=keep_value, args=("f_range",))
        st.radio("Group by", list(FREQS), key="w_f_freq", horizontal=True, on_change=keep_value, args=("f_freq",))
        st.slider("Call a customer lost after (days without a trip)", 90, 730, step=15, key="w_f_window",
                  on_change=keep_value, args=("f_window",), help="Pilgrims often travel once a year, so 365 days is a good start.")
        st.multiselect("Destinations", sorted(data["bookings"]["destination"].unique()), key="w_f_dest",
                       on_change=keep_value, args=("f_dest",))
        st.multiselect("Journey types", sorted(data["bookings"]["category"].unique()), key="w_f_cat",
                       on_change=keep_value, args=("f_cat",))
        if st.button("Refresh data", use_container_width=True):
            load_all.clear()
            st.rerun()
    rng = ss.f_range if isinstance(ss.f_range, (list, tuple)) and len(ss.f_range) == 2 else (ss.f_range[0], today)
    start, end = pd.Timestamp(rng[0]), pd.Timestamp(rng[1]) + pd.Timedelta(hours=23, minutes=59)

    def keep(df):
        m = pd.Series(True, index=df.index)
        if ss.f_dest:
            m &= df["destination"].isin(ss.f_dest)
        if ss.f_cat:
            m &= df["category"].isin(ss.f_cat)
        return df[m]

    return {
        "start": start, "end": end, "freq": FREQS[ss.f_freq], "freq_name": ss.f_freq, "window": int(ss.f_window),
        "as_of": pd.Timestamp(today) + pd.Timedelta(hours=23, minutes=59),
        "customers": data["customers"], "bookings_all": keep(data["bookings"]), "orders_all": keep(data["orders"]),
        "bookings": keep(data["bookings"]).query("@start <= created_at <= @end"),
        "orders": keep(data["orders"]).query("@start <= paid_at <= @end"),
        "departures": keep(data["departures"]), "reviews": data["reviews"],
        "filtered": bool(ss.f_dest or ss.f_cat),
    }
