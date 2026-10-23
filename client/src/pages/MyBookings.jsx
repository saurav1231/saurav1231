import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api.js';
import { useApi } from '../useApi.js';
import { ConfirmButton, ErrorBox, Spinner, StatusPill } from '../components/ui.jsx';

function ReviewForm({ slug }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [state, setState] = useState(null);

  if (state === 'done') return <span className="small muted">Thank you for your review!</span>;
  if (!open) return <button className="link" onClick={() => setOpen(true)}>Write a review</button>;

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/packages/${slug}/reviews`, { method: 'POST', body: { rating, comment } });
      setState('done');
    } catch (err) {
      setState(err);
    }
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
      </select>
      <input required minLength={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was your journey?" />
      <button className="btn btn-small">Post</button>
      {state instanceof Error && <ErrorBox error={state} />}
    </form>
  );
}

export default function MyBookings() {
  const { data, error, loading, reload } = useApi('/bookings/me');
  const cancel = async (id) => {
    await api(`/bookings/${id}/cancel`, { method: 'POST' });
    reload();
  };

  if (loading) return <Spinner />;
  return (
    <div className="page">
      <h1>My bookings</h1>
      <ErrorBox error={error} />
      {!data?.bookings.length && (
        <p className="empty">No bookings yet. <Link to="/packages">Find a journey</Link></p>
      )}
      <div className="booking-list">
        {data?.bookings.map((b) => (
          <div key={b.id} className="booking-row">
            <div>
              <Link to={`/packages/${b.package.slug}`}><h3>{b.package.title}</h3></Link>
              <p className="muted">
                {b.bookingRef} · {formatDate(b.departure.startDate)} · {b.travelers} traveller{b.travelers > 1 ? 's' : ''}
              </p>
            </div>
            <div className="booking-actions">
              <strong>{formatPrice(b.amount, b.currency)}</strong>
              <StatusPill status={b.status} />
              {b.status === 'PENDING' && (
                <>
                  <Link className="btn btn-small" to={`/checkout/${b.id}`}>Pay now</Link>
                  <ConfirmButton confirmText="Confirm cancel" onConfirm={() => cancel(b.id)}>Cancel</ConfirmButton>
                </>
              )}
              {b.status === 'CONFIRMED' && <ReviewForm slug={b.package.slug} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
