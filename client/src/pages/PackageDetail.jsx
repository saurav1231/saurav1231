import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, formatDate, formatPrice, mediaUrl } from '../api.js';
import { useApi } from '../useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Cover, ErrorBox, Spinner, Stars } from '../components/ui.jsx';

function BookingPanel({ pkg }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [departureId, setDepartureId] = useState(pkg.departures[0]?.id || '');
  const [travelers, setTravelers] = useState(1);
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [specialRequests, setSpecialRequests] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const departure = pkg.departures.find((d) => d.id === departureId);
  const total = (departure?.price || pkg.pricePerPerson) * travelers;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { booking } = await api('/bookings', {
        method: 'POST',
        body: { packageSlug: pkg.slug, departureId, travelers, contactName, contactPhone, specialRequests: specialRequests || undefined },
      });
      navigate(`/checkout/${booking.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!pkg.departures.length) {
    return <aside className="book-panel"><p>New dates coming soon. Write to hello@ayana.travel to get notified.</p></aside>;
  }

  return (
    <form className="book-panel" onSubmit={submit}>
      <div className="book-price">
        {formatPrice(departure?.price || pkg.pricePerPerson, pkg.currency)} <small>per person</small>
      </div>
      <label>
        Departure date
        <select value={departureId} onChange={(e) => setDepartureId(e.target.value)}>
          {pkg.departures.map((d) => (
            <option key={d.id} value={d.id} disabled={d.seatsLeft === 0}>
              {formatDate(d.startDate)} · {d.seatsLeft ? `${d.seatsLeft} seats left` : 'Sold out'}
            </option>
          ))}
        </select>
      </label>
      <label>
        Travellers
        <input type="number" min="1" max={Math.min(pkg.maxGroupSize, departure?.seatsLeft || 1)} value={travelers} onChange={(e) => setTravelers(Math.max(1, Number(e.target.value)))} />
      </label>
      <label>
        Lead traveller name
        <input required value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </label>
      <label>
        Phone (WhatsApp)
        <input required type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </label>
      <label>
        Special requests (optional)
        <textarea rows="2" value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} placeholder="Diet, mobility, senior citizens..." />
      </label>
      <div className="book-total">
        <span>Total</span>
        <strong>{formatPrice(total, pkg.currency)}</strong>
      </div>
      <ErrorBox error={error} />
      {user ? (
        <button className="btn btn-block" disabled={busy || !departure?.seatsLeft}>
          {busy ? 'Reserving...' : 'Reserve & pay'}
        </button>
      ) : (
        <button type="button" className="btn btn-block" onClick={() => navigate(`/login?next=/packages/${pkg.slug}`)}>
          Sign in to book
        </button>
      )}
      <p className="small muted center">Seats are held for 30 minutes while you pay.</p>
    </form>
  );
}

function Gallery({ images, title }) {
  const [open, setOpen] = useState(null); // index of the photo shown full screen
  if (images.length < 2) return null;
  const show = (i) => setOpen((i + images.length) % images.length);
  return (
    <section>
      <h2>Photos</h2>
      <div className="gallery">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
            <img src={mediaUrl(img.thumbUrl)} alt={img.alt || title} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="lightbox" role="dialog" aria-label="Photo viewer" onClick={() => setOpen(null)}>
          <img src={mediaUrl(images[open].url)} alt={images[open].alt || title} onClick={(e) => e.stopPropagation()} />
          <button className="lb-prev" onClick={(e) => { e.stopPropagation(); show(open - 1); }} aria-label="Previous photo">‹</button>
          <button className="lb-next" onClick={(e) => { e.stopPropagation(); show(open + 1); }} aria-label="Next photo">›</button>
          <button className="lb-close" onClick={() => setOpen(null)} aria-label="Close">×</button>
        </div>
      )}
    </section>
  );
}

export default function PackageDetail() {
  const { slug } = useParams();
  const { data, error, loading } = useApi(`/packages/${slug}`);
  if (loading) return <Spinner />;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;
  const pkg = data.package;

  return (
    <div className="page detail">
      <div className="detail-hero">
        <Cover pkg={pkg} className="cover-large" large />
        <div>
          <span className="chip">{pkg.category}</span>
          <h1>{pkg.title}</h1>
          <p className="muted">
            {pkg.destination.name}, {pkg.destination.state} · {pkg.durationDays} days · <Stars value={pkg.ratingAvg} count={pkg.ratingCount} />
          </p>
          <p className="lead">{pkg.summary}</p>
        </div>
      </div>

      <div className="detail-body">
        <div>
          <section>
            <h2>About this journey</h2>
            <p>{pkg.description}</p>
            <ul className="ticks">
              {pkg.highlights.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </section>

          <Gallery images={pkg.images || []} title={pkg.title} />

          <section>
            <h2>Day by day</h2>
            <ol className="timeline">
              {pkg.itinerary.map((d) => (
                <li key={d.id}>
                  <span className="day">Day {d.dayNumber}</span>
                  <h3>{d.title}</h3>
                  <p className="muted">{d.description}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="two-col">
            <div>
              <h2>Included</h2>
              <ul className="ticks">{pkg.inclusions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h2>Not included</h2>
              <ul className="crosses">{pkg.exclusions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </section>

          <section>
            <h2>Traveller reviews</h2>
            {pkg.reviews.length ? (
              pkg.reviews.map((r) => (
                <blockquote key={r.id} className="review">
                  <div className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                  <p>{r.comment}</p>
                  <cite>{r.user.name} · {formatDate(r.createdAt)}</cite>
                </blockquote>
              ))
            ) : (
              <p className="muted">No reviews yet. Travellers can review after their journey.</p>
            )}
          </section>
        </div>
        <BookingPanel pkg={pkg} />
      </div>
    </div>
  );
}
