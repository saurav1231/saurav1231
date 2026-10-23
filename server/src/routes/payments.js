import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { markPaymentPaid } from '../services/bookingService.js';
import {
  createGatewayOrder,
  paymentMode,
  publicPaymentConfig,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../services/paymentService.js';

const router = Router();

router.get('/config', (_req, res) => res.json(publicPaymentConfig()));

// Step 1: create a gateway order for a PENDING booking.
router.post('/order', requireAuth, async (req, res) => {
  const { bookingId } = validate(z.object({ bookingId: z.string().min(1) }), req.body);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { package: { select: { title: true } } },
  });
  if (!booking) throw notFound('Booking not found');
  if (booking.userId !== req.user.id) throw forbidden();
  if (booking.status !== 'PENDING') throw badRequest(`Booking is ${booking.status.toLowerCase()}`);
  if (booking.expiresAt < new Date()) throw badRequest('Seat hold expired, please book again');

  const order = await createGatewayOrder({
    amount: booking.amount,
    currency: booking.currency,
    receipt: booking.bookingRef,
    notes: { bookingId: booking.id, bookingRef: booking.bookingRef },
  });
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider: paymentMode,
      providerOrderId: order.id,
      amount: booking.amount,
      currency: booking.currency,
    },
  });

  res.status(201).json({
    mode: paymentMode,
    orderId: order.id,
    amount: booking.amount,
    currency: booking.currency,
    keyId: publicPaymentConfig().keyId,
    name: 'Ayana',
    description: booking.package.title,
    prefill: { name: booking.contactName, email: req.user.email, contact: booking.contactPhone },
    bookingRef: booking.bookingRef,
  });
});

// Step 2: browser sends back what Razorpay Checkout returned. We verify the signature.
router.post('/verify', requireAuth, async (req, res) => {
  const body = validate(
    z.object({
      razorpay_order_id: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_signature: z.string().optional(),
    }),
    req.body,
  );
  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: body.razorpay_order_id },
    include: { booking: true },
  });
  if (!payment) throw notFound('Payment order not found');
  if (payment.booking.userId !== req.user.id) throw forbidden();

  if (paymentMode === 'razorpay') {
    const ok = verifyCheckoutSignature({
      orderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    });
    if (!ok) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw badRequest('Payment verification failed');
    }
  } else if (payment.provider !== 'mock') {
    throw badRequest('Mock payments are disabled');
  }

  const booking = await markPaymentPaid({
    providerOrderId: body.razorpay_order_id,
    providerPaymentId: body.razorpay_payment_id,
    raw: body,
  });
  res.json({ booking });
});

// Step 3 (safety net): Razorpay calls this server-to-server, even if the customer closed the tab.
// Mounted with express.raw() in app.js so the signature can be checked on the exact bytes.
export async function razorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  const event = JSON.parse(req.body.toString('utf8'));
  const entity = event.payload?.payment?.entity;

  if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity?.order_id) {
    try {
      await markPaymentPaid({ providerOrderId: entity.order_id, providerPaymentId: entity.id, raw: entity });
    } catch (err) {
      console.error('[ayana] webhook could not mark payment paid', err.message);
    }
  } else if (event.event === 'payment.failed' && entity?.order_id) {
    await prisma.payment.updateMany({
      where: { providerOrderId: entity.order_id, status: 'CREATED' },
      data: { status: 'FAILED', rawResponse: entity },
    });
  }
  res.json({ received: true });
}

export default router;
