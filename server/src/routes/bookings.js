import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { cancelPendingBooking, createBooking } from '../services/bookingService.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  packageSlug: z.string().min(1),
  departureId: z.string().min(1),
  travelers: z.coerce.number().int().min(1).max(50),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(7).max(20),
  specialRequests: z.string().trim().max(2000).optional(),
});

const bookingInclude = {
  package: { select: { title: true, slug: true, durationDays: true, imageUrl: true, category: true } },
  departure: { select: { startDate: true } },
  payments: { select: { id: true, status: true, amount: true, providerPaymentId: true, createdAt: true } },
};

async function loadOwnBooking(req) {
  const booking = await prisma.booking.findUnique({ where: { id: req.params.id }, include: bookingInclude });
  if (!booking) throw notFound('Booking not found');
  if (booking.userId !== req.user.id && req.user.role !== 'ADMIN') throw forbidden();
  return booking;
}

router.post('/', async (req, res) => {
  const data = validate(createSchema, req.body);
  const booking = await createBooking(req.user, data);
  res.status(201).json({ booking });
});

router.get('/me', async (req, res) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: bookingInclude,
  });
  res.json({ bookings });
});

router.get('/:id', async (req, res) => {
  res.json({ booking: await loadOwnBooking(req) });
});

router.post('/:id/cancel', async (req, res) => {
  await loadOwnBooking(req);
  const booking = await cancelPendingBooking(req.params.id);
  res.json({ booking });
});

export default router;
