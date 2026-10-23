import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api.js';
import { useApi } from '../useApi.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Spinner, StatusPill } from '../components/ui.jsx';

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Razorpay. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

function useCountdown(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(until).getTime() - now);
  return `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
}

export default function Checkout() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(`/bookings/${bookingId}`);
  const [payError, setPayError] = useState(null);
  const [busy, setBusy] = useState(false);
  const booking = data?.booking;
  const countdown = useCountdown(booking?.expiresAt || 0);

  const pay = async () => {
    setBusy(true);
    setPayError(null);
    try {
      const order = await api('/payments/order', { method: 'POST', body: { bookingId } });

      if (order.mode === 'mock') {
        // Local development only: pretend the gateway approved the payment.
        await api('/payments/verify', {
          method: 'POST',
          body: { razorpay_order_id: order.orderId, razorpay_payment_id: `mock_pay_${Date.now()}` },
        });
        reload();
        return;
      }

      await loadRazorpayScript();
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        order_id: order.orderId,
        prefill: { ...order.prefill, email: user.email },
        notes: { bookingRef: order.bookingRef },
        theme: { color: '#f08a24' },
        handler: async (response) => {
          try {
            await api('/payments/verify', { method: 'POST', body: response });
          } catch (err) {
            setPayError(err);
          }
          reload();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on('payment.failed', (resp) => setPayError(new Error(resp.error?.description || 'Payment failed')));
      rzp.open();
    } catch (err) {
      setPayError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !booking) return <Spinner />;
  if (error) return <div className="page"><ErrorBox error={error} /></div>;

  const confirmed = booking.status === 'CONFIRMED';

  return (
    <div className="page narrow">
      {confirmed ? (
        <div className="success">
          <div className="success-mark">✓</div>
          <h1>Your journey is confirmed</h1>
          <p className="lead">Booking reference <strong>{booking.bookingRef}</strong>. Our team will call you within 24 hours with the details.</p>
        </div>
      ) : (
        <h1>Complete your booking</h1>
      )}

      <div className="summary">
        <div className="summary-row"><span>Journey</span><strong>{booking.package.title}</strong></div>
        <div className="summary-row"><span>Departure</span><strong>{formatDate(booking.departure.startDate)}</strong></div>
        <div className="summary-row"><span>Travellers</span><strong>{booking.travelers}</strong></div>
        <div className="summary-row"><span>Lead traveller</span><strong>{booking.contactName} · {booking.contactPhone}</strong></div>
        <div className="summary-row"><span>Status</span><StatusPill status={booking.status} /></div>
        <div className="summary-row total"><span>Total</span><strong>{formatPrice(booking.amount, booking.currency)}</strong></div>
      </div>

      {booking.status === 'PENDING' && (
        <>
          <p className="muted center">Seats held for <strong>{countdown}</strong></p>
          <ErrorBox error={payError} />
          <button className="btn btn-block" onClick={pay} disabled={busy}>
            {busy ? 'Opening payment...' : `Pay ${formatPrice(booking.amount, booking.currency)}`}
          </button>
          <p className="small muted center">UPI · Cards · Net banking · Wallets, secured by Razorpay</p>
        </>
      )}
      {(booking.status === 'EXPIRED' || booking.status === 'CANCELLED') && (
        <p className="center">
          This booking is {booking.status.toLowerCase()}. <Link to={`/packages/${booking.package.slug}`}>Book again</Link>
        </p>
      )}
      {confirmed && (
        <p className="center"><Link className="btn" to="/my-bookings">Go to my bookings</Link></p>
      )}
    </div>
  );
}
