import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../config.js';

const { mode, razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret } = config.payment;

const razorpay = mode === 'razorpay' ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret }) : null;

export const paymentMode = mode;

// Creates an order at the gateway. Amount is in paise.
export async function createGatewayOrder({ amount, currency, receipt, notes }) {
  if (mode === 'mock') {
    return { id: `mock_order_${crypto.randomBytes(8).toString('hex')}`, amount, currency };
  }
  return razorpay.orders.create({ amount, currency, receipt, notes });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Razorpay Checkout returns signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto.createHmac('sha256', razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

// Webhook header X-Razorpay-Signature = HMAC_SHA256(raw body, webhook_secret)
export function verifyWebhookSignature(rawBody, signature) {
  if (!razorpayWebhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', razorpayWebhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

export function publicPaymentConfig() {
  return { mode, keyId: mode === 'razorpay' ? razorpayKeyId : null };
}
