import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res) => {
  const [packages, users, bookingsByStatus, revenue, recent] = await Promise.all([
    prisma.package.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.booking.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { package: { select: { title: true } }, user: { select: { name: true, email: true } } },
    }),
  ]);
  res.json({
    packages,
    users,
    revenue: revenue._sum.amount || 0,
    bookings: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count._all])),
    recent,
  });
});

// ---------- Packages ----------
const itineraryDay = z.object({ title: z.string().min(1).max(200), description: z.string().min(1) });
const packageSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes only'),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().min(10).max(400),
  description: z.string().trim().min(10),
  category: z.string().trim().min(2).max(60),
  durationDays: z.coerce.number().int().min(1).max(60),
  pricePerPerson: z.coerce.number().int().min(100), // paise
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  highlights: z.array(z.string()).default([]),
  inclusions: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  maxGroupSize: z.coerce.number().int().min(1).max(500).default(20),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  destinationId: z.string().min(1),
  itinerary: z.array(itineraryDay).default([]),
});

router.get('/packages', async (_req, res) => {
  const packages = await prisma.package.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      destination: { select: { name: true } },
      departures: { orderBy: { startDate: 'asc' } },
      itinerary: { orderBy: { dayNumber: 'asc' } },
    },
  });
  res.json({ packages });
});

router.post('/packages', async (req, res) => {
  const { itinerary, imageUrl, ...data } = validate(packageSchema, req.body);
  const pkg = await prisma.package.create({
    data: {
      ...data,
      imageUrl: imageUrl || null,
      itinerary: { create: itinerary.map((d, i) => ({ ...d, dayNumber: i + 1 })) },
    },
  });
  res.status(201).json({ package: pkg });
});

router.put('/packages/:id', async (req, res) => {
  const { itinerary, imageUrl, ...data } = validate(packageSchema, req.body);
  const pkg = await prisma.$transaction(async (tx) => {
    await tx.itineraryDay.deleteMany({ where: { packageId: req.params.id } });
    return tx.package.update({
      where: { id: req.params.id },
      data: {
        ...data,
        imageUrl: imageUrl || null,
        itinerary: { create: itinerary.map((d, i) => ({ ...d, dayNumber: i + 1 })) },
      },
    });
  });
  res.json({ package: pkg });
});

// Soft delete: keeps bookings history intact.
router.delete('/packages/:id', async (req, res) => {
  await prisma.package.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.status(204).end();
});

// ---------- Departures ----------
const departureSchema = z.object({
  startDate: z.coerce.date(),
  seatsTotal: z.coerce.number().int().min(1).max(1000),
  priceOverride: z.coerce.number().int().min(100).nullable().optional(),
  isActive: z.boolean().default(true),
});

router.post('/packages/:id/departures', async (req, res) => {
  const data = validate(departureSchema, req.body);
  const pkg = await prisma.package.findUnique({ where: { id: req.params.id } });
  if (!pkg) throw notFound('Package not found');
  const departure = await prisma.departure.create({ data: { ...data, packageId: pkg.id } });
  res.status(201).json({ departure });
});

router.patch('/departures/:id', async (req, res) => {
  const data = validate(departureSchema.partial(), req.body);
  const departure = await prisma.departure.update({ where: { id: req.params.id }, data });
  res.json({ departure });
});

// ---------- Destinations ----------
const destinationSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(80).default('India'),
  description: z.string().trim().min(5),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  imageUrl: z.string().url().max(500).optional(),
});

router.post('/destinations', async (req, res) => {
  const destination = await prisma.destination.create({ data: validate(destinationSchema, req.body) });
  res.status(201).json({ destination });
});

// ---------- Bookings ----------
router.get('/bookings', async (req, res) => {
  const { status } = validate(
    z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED']).optional() }),
    req.query,
  );
  const bookings = await prisma.booking.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      user: { select: { name: true, email: true, phone: true } },
      package: { select: { title: true } },
      departure: { select: { startDate: true } },
      payments: { select: { status: true, amount: true, providerPaymentId: true } },
    },
  });
  res.json({ bookings });
});

export default router;
