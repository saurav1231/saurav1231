import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { unitPrice } from '../lib/serialize.js';
import { config } from '../config.js';

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newBookingRef() {
  const bytes = crypto.randomBytes(6);
  let ref = '';
  for (const b of bytes) ref += REF_ALPHABET[b % REF_ALPHABET.length];
  return `AYN-${ref}`;
}

// Atomically takes `count` seats from a departure. Returns false if not enough seats.
async function holdSeats(tx, departureId, count) {
  const changed = await tx.$executeRaw`
    UPDATE Departure SET seatsBooked = seatsBooked + ${count}
    WHERE id = ${departureId} AND isActive = true AND seatsBooked + ${count} <= seatsTotal`;
  return changed === 1;
}

async function releaseSeats(tx, departureId, count) {
  await tx.$executeRaw`
    UPDATE Departure SET seatsBooked = GREATEST(seatsBooked - ${count}, 0) WHERE id = ${departureId}`;
}

// Creates a PENDING booking and holds the seats until it is paid or expires.
// The price is always computed on the server, never trusted from the browser.
export async function createBooking(user, input) {
  const pkg = await prisma.package.findFirst({ where: { slug: input.packageSlug, isActive: true } });
  if (!pkg) throw notFound('Package not found');
  const departure = await prisma.departure.findFirst({
    where: { id: input.departureId, packageId: pkg.id, isActive: true },
  });
  if (!departure) throw notFound('Departure date not found');
  if (departure.startDate < new Date()) throw badRequest('This departure has already started');
  if (input.travelers > pkg.maxGroupSize) throw badRequest(`Max ${pkg.maxGroupSize} travellers per booking`);

  const amount = unitPrice(pkg, departure) * input.travelers;

  return prisma.$transaction(async (tx) => {
    const ok = await holdSeats(tx, departure.id, input.travelers);
    if (!ok) throw conflict('Not enough seats left on this date');
    return tx.booking.create({
      data: {
        bookingRef: newBookingRef(),
        userId: user.id,
        packageId: pkg.id,
        departureId: departure.id,
        travelers: input.travelers,
        amount,
        currency: pkg.currency,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        specialRequests: input.specialRequests || null,
        expiresAt: new Date(Date.now() + config.bookingHoldMinutes * 60_000),
      },
    });
  });
}

export async function cancelPendingBooking(bookingId) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw notFound('Booking not found');
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (count !== 1) throw badRequest('Only unpaid bookings can be cancelled online. Contact us for paid bookings.');
    await releaseSeats(tx, booking.departureId, booking.travelers);
    return tx.booking.findUnique({ where: { id: bookingId } });
  });
}

// Marks unpaid bookings past their hold time as EXPIRED and frees their seats.
export async function expireStaleBookings() {
  const stale = await prisma.booking.findMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id } });
      const { count } = await tx.booking.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      if (count === 1) await releaseSeats(tx, booking.departureId, booking.travelers);
    });
  }
  return stale.length;
}

// Called after a payment is verified (checkout callback or webhook). Safe to call twice.
export async function markPaymentPaid({ providerOrderId, providerPaymentId, raw }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { providerOrderId } });
    if (!payment) throw notFound('Payment order not found');
    if (payment.status === 'PAID' || payment.status === 'REFUND_PENDING' || payment.status === 'REFUNDED') {
      return tx.booking.findUnique({ where: { id: payment.bookingId } });
    }

    const booking = await tx.booking.findUnique({ where: { id: payment.bookingId } });
    let paymentStatus = 'PAID';

    const confirmed = await tx.booking.updateMany({
      where: { id: booking.id, status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    });

    if (confirmed.count === 0) {
      if (booking.status === 'CONFIRMED') {
        // Booking was already paid through another order: this payment is a duplicate.
        paymentStatus = 'REFUND_PENDING';
      } else {
        // Booking expired/cancelled before the money arrived: try to grab the seats again.
        const ok = await holdSeats(tx, booking.departureId, booking.travelers);
        if (ok) {
          await tx.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
        } else {
          paymentStatus = 'REFUND_PENDING';
          console.warn(`[ayana] Booking ${booking.bookingRef} paid but sold out. Refund needed.`);
        }
      }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: paymentStatus, providerPaymentId, rawResponse: raw ?? undefined },
    });
    return tx.booking.findUnique({ where: { id: booking.id } });
  });
}

// Package rating is denormalised on Package for fast listing pages.
export async function refreshPackageRating(packageId) {
  const agg = await prisma.review.aggregate({
    where: { packageId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.package.update({
    where: { id: packageId },
    data: { ratingAvg: Number((agg._avg.rating || 0).toFixed(2)), ratingCount: agg._count._all },
  });
}
