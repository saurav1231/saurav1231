import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see server/.env.example)`);
  return value;
}

const paymentMode = (process.env.PAYMENT_MODE || 'mock').toLowerCase();

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
  serveClient: process.env.SERVE_CLIENT === 'true',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bookingHoldMinutes: Number(process.env.BOOKING_HOLD_MINUTES || 30),
  payment: {
    mode: paymentMode, // 'mock' | 'razorpay'
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
};

if (config.payment.mode === 'razorpay' && (!config.payment.razorpayKeyId || !config.payment.razorpayKeySecret)) {
  throw new Error('PAYMENT_MODE=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
}
if (config.isProd && config.payment.mode === 'mock') {
  console.warn('[ayana] WARNING: PAYMENT_MODE=mock in production. Customers can confirm bookings without paying.');
}
