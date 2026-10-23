// Admin → Analytics tab. All numbers come from GET /api/admin/analytics.
import { useState } from 'react';
import { formatDate, formatPrice, IS_DEMO, tokenStore } from '../api.js';
import { useApi } from '../useApi.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

// ₹ in Indian short units: 12.4K, 3.2L, 1.1Cr
function shortINR(paise) {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(0)}K`;
  return `₹${Math.round(r)}`;
}
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

// "Nice" axis maximum and 4 ticks.
function ticksFor(max) {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  return [0, 1, 2, 3, 4].map((i) => i * step);
}

function RevenueChart({ monthly }) {
  const [hover, setHover] = useState(null);
  const W = 720;
  const H = 240;
  const pad = { l: 56, r: 12, t: 16, b: 28 };
  const ticks = ticksFor(Math.max(...monthly.map((m) => m.revenue)));
  const top = ticks[ticks.length - 1] || 1;
  const band = (W - pad.l - pad.r) / monthly.length;
  const bar = Math.min(24, band * 0.6);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const best = monthly.reduce((a, m, i) => (m.revenue > monthly[a].revenue ? i : a), 0);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Revenue by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="tick">{shortINR(t)}</text>
          </g>
        ))}
        {monthly.map((m, i) => {
          const x = pad.l + band * i + (band - bar) / 2;
          const h = Math.max(0, y(0) - y(m.revenue));
          const r = Math.min(4, h);
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && (
                <path
                  className={`col ${hover === i ? 'on' : ''}`}
                  d={`M${x},${y(0)} V${y(m.revenue) + r} Q${x},${y(m.revenue)} ${x + r},${y(m.revenue)} H${x + bar - r} Q${x + bar},${y(m.revenue)} ${x + bar},${y(m.revenue) + r} V${y(0)} Z`}
                />
              )}
              <text x={x + bar / 2} y={H - 8} textAnchor="middle" className="tick">{monthLabel(m.month)}</text>
              {i === best && m.revenue > 0 && hover === null && (
                <text x={x + bar / 2} y={y(m.revenue) - 6} textAnchor="middle" className="val">{shortINR(m.revenue)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${((pad.l + band * (hover + 0.5)) / W) * 100}%` }}>
          <strong>{monthLabel(monthly[hover].month)} {monthly[hover].month.slice(0, 4)}</strong>
          <span>{formatPrice(monthly[hover].revenue)} revenue</span>
          <span>{monthly[hover].bookingsConfirmed} paid of {monthly[hover].bookingsCreated} bookings</span>
          <span>{monthly[hover].travelers} travellers</span>
        </div>
      )}
    </div>
  );
}

// Horizontal bars with the value at the tip.
function BarList({ rows, value, label, format = (v) => v }) {
  const max = Math.max(1, ...rows.map(value));
  if (!rows.length) return <p className="muted small">No paid bookings in this period yet.</p>;
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div key={label(r)} className="barrow" title={`${label(r)}: ${format(value(r))}`}>
          <span className="barlabel">{label(r)}</span>
          <span className="bartrack">
            <span className="barfill" style={{ width: `${(value(r) / max) * 78}%` }} />
            <span className="barval">{format(value(r))}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

async function downloadCsv(setError) {
  if (IS_DEMO) return setError(new Error('Export works on the real site. This preview cannot download files.'));
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/export/bookings.csv`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
    if (!res.ok) throw new Error('Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `ayana-bookings-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    setError(err);
  }
}

export default function AdminAnalytics() {
  const [months, setMonths] = useState(12);
  const [error, setError] = useState(null);
  const { data, loading, error: loadError } = useApi('/admin/analytics', { months });

  return (
    <div className="analytics">
      <div className="row spread">
        <div className="segmented" role="group" aria-label="Period">
          {[3, 6, 12].map((m) => (
            <button key={m} className={months === m ? 'active' : ''} onClick={() => setMonths(m)}>
              {m} months
            </button>
          ))}
        </div>
        <div className="row">
          {!IS_DEMO && (
            <a className="btn btn-small" href={import.meta.env.VITE_INSIGHTS_URL || '/insights/'} target="_blank" rel="noreferrer">
              Open Ayana Insights: churn, journeys, growth
            </a>
          )}
          <button className="btn btn-small btn-ghost" onClick={() => downloadCsv(setError)}>Export bookings to Excel (CSV)</button>
        </div>
      </div>
      <ErrorBox error={error || loadError} />
      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="stats">
            <div><span>Revenue</span><strong>{shortINR(data.summary.revenue)}</strong></div>
            <div><span>Paid bookings</span><strong>{data.summary.confirmedBookings}</strong></div>
            <div><span>Travellers</span><strong>{data.summary.travelers}</strong></div>
            <div><span>Avg. booking</span><strong>{shortINR(data.summary.averageBookingValue)}</strong></div>
            <div><span>Booked → paid</span><strong>{Math.round(data.summary.conversionRate * 100)}%</strong></div>
            <div><span>Repeat customers</span><strong>{data.summary.repeatCustomers}<small> / {data.summary.payingCustomers}</small></strong></div>
          </div>

          <section className="panel">
            <h3>Revenue by month</h3>
            <RevenueChart monthly={data.monthly} />
          </section>

          <div className="panel-grid">
            <section className="panel">
              <h3>Top journeys by revenue</h3>
              <BarList rows={data.topPackages} value={(r) => r.revenue} label={(r) => r.title} format={shortINR} />
            </section>
            <section className="panel">
              <h3>Revenue by destination</h3>
              <BarList rows={data.byDestination} value={(r) => r.revenue} label={(r) => r.name} format={shortINR} />
            </section>
            <section className="panel">
              <h3>What happened to bookings</h3>
              <BarList
                rows={[
                  { name: 'Started', n: data.funnel.created || 0 },
                  { name: 'Paid', n: data.funnel.CONFIRMED || 0 },
                  { name: 'Not paid in time', n: data.funnel.EXPIRED || 0 },
                  { name: 'Cancelled', n: data.funnel.CANCELLED || 0 },
                ]}
                value={(r) => r.n}
                label={(r) => r.name}
              />
            </section>
            <section className="panel">
              <h3>Seats filled · next 60 days</h3>
              {data.upcomingDepartures.length ? (
                <div className="barlist">
                  {data.upcomingDepartures.map((d) => (
                    <div key={d.id} className="barrow">
                      <span className="barlabel">{formatDate(d.startDate)} · {d.title}</span>
                      <span className="bartrack">
                        <span className="barfill" style={{ width: `${(d.seatsBooked / d.seatsTotal) * 78}%` }} />
                        <span className="barval">{d.seatsBooked}/{d.seatsTotal}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">No departures in the next 60 days.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
