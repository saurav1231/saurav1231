import { useState } from 'react';
import { api, apiUpload, formatDate, formatPrice, mediaUrl } from '../api.js';
import { useApi } from '../useApi.js';
import AdminAnalytics from './AdminAnalytics.jsx';
import { ConfirmButton, ErrorBox, Spinner, StatusPill } from '../components/ui.jsx';

function Overview() {
  const { data, loading } = useApi('/admin/stats');
  if (loading) return <Spinner />;
  return (
    <>
      <div className="stats">
        <div><span>Revenue</span><strong>{formatPrice(data.revenue)}</strong></div>
        <div><span>Confirmed</span><strong>{data.bookings.CONFIRMED || 0}</strong></div>
        <div><span>Pending</span><strong>{data.bookings.PENDING || 0}</strong></div>
        <div><span>Customers</span><strong>{data.users}</strong></div>
        <div><span>Live packages</span><strong>{data.packages}</strong></div>
      </div>
      <h3>Latest bookings</h3>
      <BookingTable bookings={data.recent} />
    </>
  );
}

function BookingTable({ bookings }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Ref</th><th>Customer</th><th>Journey</th><th>Date</th><th>Pax</th><th>Amount</th><th>Status</th></tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{b.bookingRef}</td>
              <td>{b.user?.name}<br /><span className="small muted">{b.user?.email} {b.contactPhone}</span></td>
              <td>{b.package?.title}</td>
              <td>{b.departure ? formatDate(b.departure.startDate) : '-'}</td>
              <td>{b.travelers}</td>
              <td>{formatPrice(b.amount)}</td>
              <td><StatusPill status={b.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bookings() {
  const [status, setStatus] = useState('');
  const { data, loading } = useApi('/admin/bookings', { status });
  return (
    <>
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s}>{s}</option>)}
      </select>
      {loading ? <Spinner /> : <BookingTable bookings={data.bookings} />}
    </>
  );
}

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const EMPTY = {
  slug: '', title: '', summary: '', description: '', category: 'Pilgrimage', durationDays: 3, price: 10000,
  destinationId: '', imageUrl: '', highlights: '', inclusions: '', exclusions: '', itinerary: '', isFeatured: false,
};

function PackageForm({ initial, destinations, onSaved, onCancel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    const body = {
      slug: f.slug, title: f.title, summary: f.summary, description: f.description, category: f.category,
      durationDays: Number(f.durationDays), pricePerPerson: Math.round(Number(f.price) * 100),
      destinationId: f.destinationId, imageUrl: f.imageUrl, isFeatured: f.isFeatured,
      highlights: lines(f.highlights), inclusions: lines(f.inclusions), exclusions: lines(f.exclusions),
      itinerary: lines(f.itinerary).map((l) => {
        const [title, ...rest] = l.split('|');
        return { title: title.trim(), description: (rest.join('|') || title).trim() };
      }),
    };
    try {
      if (f.id) await api(`/admin/packages/${f.id}`, { method: 'PUT', body });
      else await api('/admin/packages', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form className="admin-form" onSubmit={save}>
      <h3>{f.id ? 'Edit package' : 'New package'}</h3>
      <div className="form-grid">
        <label>Title<input required value={f.title} onChange={set('title')} /></label>
        <label>URL slug<input required value={f.slug} onChange={set('slug')} placeholder="kashi-yatra" /></label>
        <label>Category<input required value={f.category} onChange={set('category')} /></label>
        <label>Destination
          <select required value={f.destinationId} onChange={set('destinationId')}>
            <option value="">Choose...</option>
            {destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label>Days<input type="number" min="1" value={f.durationDays} onChange={set('durationDays')} /></label>
        <label>Price per person (₹)<input type="number" min="1" value={f.price} onChange={set('price')} /></label>
        <label className="span-2">Image URL (optional)<input value={f.imageUrl} onChange={set('imageUrl')} /></label>
        <label className="span-2">Summary<input required value={f.summary} onChange={set('summary')} /></label>
        <label className="span-2">Description<textarea rows="3" required value={f.description} onChange={set('description')} /></label>
        <label>Highlights (one per line)<textarea rows="4" value={f.highlights} onChange={set('highlights')} /></label>
        <label>Itinerary (one day per line: Title | details)<textarea rows="4" value={f.itinerary} onChange={set('itinerary')} /></label>
        <label>Included (one per line)<textarea rows="3" value={f.inclusions} onChange={set('inclusions')} /></label>
        <label>Not included (one per line)<textarea rows="3" value={f.exclusions} onChange={set('exclusions')} /></label>
        <label className="check"><input type="checkbox" checked={f.isFeatured} onChange={set('isFeatured')} /> Featured on home page</label>
      </div>
      <ErrorBox error={error} />
      {error?.details && <pre className="small">{JSON.stringify(error.details, null, 2)}</pre>}
      <div className="row">
        <button className="btn">Save</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function DepartureForm({ pkg, onSaved }) {
  const [startDate, setStartDate] = useState('');
  const [seatsTotal, setSeats] = useState(20);
  const [error, setError] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/packages/${pkg.id}/departures`, { method: 'POST', body: { startDate, seatsTotal: Number(seatsTotal) } });
      setStartDate('');
      onSaved();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="row" onSubmit={add}>
      <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <input type="number" min="1" value={seatsTotal} onChange={(e) => setSeats(e.target.value)} style={{ width: 90 }} aria-label="Seats" />
      <button className="btn btn-small">Add date</button>
      <ErrorBox error={error} />
    </form>
  );
}

// Upload, reorder and delete photos of one package. The first photo is the cover.
function PhotoManager({ pkg, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const images = pkg.images || [];

  const upload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      await apiUpload(`/admin/packages/${pkg.id}/images`, files);
      onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };
  const move = async (i, dir) => {
    const ids = images.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`/admin/packages/${pkg.id}/images/order`, { method: 'PUT', body: { ids } });
    onChange();
  };
  const makeCover = async (i) => {
    const ids = images.map((x) => x.id);
    ids.unshift(ids.splice(i, 1)[0]);
    await api(`/admin/packages/${pkg.id}/images/order`, { method: 'PUT', body: { ids } });
    onChange();
  };
  const remove = async (id) => {
    await api(`/admin/images/${id}`, { method: 'DELETE' });
    onChange();
  };

  return (
    <div className="photos">
      <div className="photo-grid">
        {images.map((img, i) => (
          <figure key={img.id} className={i === 0 ? 'is-cover' : ''}>
            <img src={mediaUrl(img.thumbUrl)} alt={img.alt} />
            {i === 0 && <span className="badge">Cover</span>}
            <figcaption>
              <button className="link" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">←</button>
              {i > 0 && <button className="link" onClick={() => makeCover(i)}>Make cover</button>}
              <button className="link" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Move right">→</button>
              <ConfirmButton confirmText="Delete?" onConfirm={() => remove(img.id)}>Delete</ConfirmButton>
            </figcaption>
          </figure>
        ))}
        <label className="photo-add">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={upload} disabled={busy} />
          <span>{busy ? 'Uploading...' : '+ Add photos'}</span>
          <small>JPG, PNG or WEBP · up to 15 MB each</small>
        </label>
      </div>
      <ErrorBox error={error} />
    </div>
  );
}

function Packages() {
  const { data, loading, reload } = useApi('/admin/packages');
  const { data: dests } = useApi('/destinations');
  const [editing, setEditing] = useState(null);
  const [photosFor, setPhotosFor] = useState(null);

  if (loading) return <Spinner />;
  if (editing) {
    return (
      <PackageForm
        initial={editing}
        destinations={dests?.destinations || []}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
    );
  }

  const toForm = (p) => ({
    ...EMPTY, ...p, price: p.pricePerPerson / 100, imageUrl: p.imageUrl || '',
    highlights: p.highlights.join('\n'), inclusions: p.inclusions.join('\n'), exclusions: p.exclusions.join('\n'),
    itinerary: p.itinerary.map((d) => `${d.title} | ${d.description}`).join('\n'),
  });

  return (
    <>
      <button className="btn" onClick={() => setEditing(EMPTY)}>+ New package</button>
      {data.packages.map((p) => (
        <div key={p.id} className={`admin-pkg ${p.isActive ? '' : 'inactive'}`}>
          <div className="row spread">
            <div>
              <h3>{p.title} {!p.isActive && <span className="pill">hidden</span>}</h3>
              <p className="muted small">{p.destination.name} · {p.category} · {p.durationDays} days · {formatPrice(p.pricePerPerson)}</p>
            </div>
            <div className="row">
              <button className="link" onClick={() => setPhotosFor(photosFor === p.id ? null : p.id)}>
                Photos ({p.images?.length || 0})
              </button>
              <button className="link" onClick={() => setEditing(toForm(p))}>Edit</button>
              {p.isActive && (
                <ConfirmButton confirmText="Confirm hide" onConfirm={async () => { await api(`/admin/packages/${p.id}`, { method: 'DELETE' }); reload(); }}>Hide</ConfirmButton>
              )}
            </div>
          </div>
          <div className="dates">
            {p.departures.map((d) => (
              <span key={d.id} className="chip">{formatDate(d.startDate)} · {d.seatsBooked}/{d.seatsTotal}</span>
            ))}
          </div>
          {photosFor === p.id && <PhotoManager pkg={p} onChange={reload} />}
          <DepartureForm pkg={p} onSaved={reload} />
        </div>
      ))}
    </>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('overview');
  return (
    <div className="page">
      <h1>Admin</h1>
      <div className="tabs">
        {['overview', 'analytics', 'bookings', 'packages'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'analytics' && <AdminAnalytics />}
      {tab === 'bookings' && <Bookings />}
      {tab === 'packages' && <Packages />}
    </div>
  );
}
