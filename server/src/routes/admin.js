import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { deleteImageFiles, savePackageImage, uploadImages } from '../services/imageService.js';

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

// ---------- Analytics ----------
// Everything is computed from the same MySQL tables the site uses.
const num = (v) => Number(v ?? 0); // MySQL SUM/COUNT come back as BigInt

router.get('/analytics', async (req, res) => {
  const { months } = validate(z.object({ months: z.coerce.number().int().min(1).max(36).default(12) }), req.query);
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));

  const [revenueRows, bookingRows, topPackages, byDestination, byCategory, funnelRows, repeatRows, upcoming] = await Promise.all([
    prisma.$queryRaw`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, SUM(amount) AS revenue, COUNT(*) AS payments
      FROM Payment WHERE status = 'PAID' AND createdAt >= ${since}
      GROUP BY month ORDER BY month`,
    prisma.$queryRaw`
      SELECT DATE_FORMAT(createdAt, '%Y-%m') AS month, COUNT(*) AS created,
             SUM(status = 'CONFIRMED') AS confirmed, SUM(CASE WHEN status = 'CONFIRMED' THEN travelers ELSE 0 END) AS travelers
      FROM Booking WHERE createdAt >= ${since}
      GROUP BY month ORDER BY month`,
    prisma.$queryRaw`
      SELECT p.title, p.slug, COUNT(*) AS bookings, SUM(b.travelers) AS travelers, SUM(b.amount) AS revenue
      FROM Booking b JOIN Package p ON p.id = b.packageId
      WHERE b.status = 'CONFIRMED' AND b.createdAt >= ${since}
      GROUP BY p.id, p.title, p.slug ORDER BY revenue DESC LIMIT 10`,
    prisma.$queryRaw`
      SELECT d.name, COUNT(*) AS bookings, SUM(b.amount) AS revenue
      FROM Booking b JOIN Package p ON p.id = b.packageId JOIN Destination d ON d.id = p.destinationId
      WHERE b.status = 'CONFIRMED' AND b.createdAt >= ${since}
      GROUP BY d.id, d.name ORDER BY revenue DESC`,
    prisma.$queryRaw`
      SELECT p.category AS name, COUNT(*) AS bookings, SUM(b.amount) AS revenue
      FROM Booking b JOIN Package p ON p.id = b.packageId
      WHERE b.status = 'CONFIRMED' AND b.createdAt >= ${since}
      GROUP BY p.category ORDER BY revenue DESC`,
    prisma.$queryRaw`
      SELECT status, COUNT(*) AS n FROM Booking WHERE createdAt >= ${since} GROUP BY status`,
    prisma.$queryRaw`
      SELECT COUNT(*) AS customers, SUM(n > 1) AS repeaters
      FROM (SELECT userId, COUNT(*) AS n FROM Booking WHERE status = 'CONFIRMED' GROUP BY userId) t`,
    prisma.departure.findMany({
      where: { isActive: true, startDate: { gte: new Date(), lte: new Date(Date.now() + 60 * 86_400_000) } },
      orderBy: { startDate: 'asc' },
      take: 15,
      include: { package: { select: { title: true } } },
    }),
  ]);

  // one entry per month, including months with no sales
  const monthKeys = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(since);
    d.setUTCMonth(since.getUTCMonth() + i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const rev = Object.fromEntries(revenueRows.map((r) => [r.month, r]));
  const bk = Object.fromEntries(bookingRows.map((r) => [r.month, r]));
  const monthly = monthKeys.map((m) => ({
    month: m,
    revenue: num(rev[m]?.revenue),
    bookingsCreated: num(bk[m]?.created),
    bookingsConfirmed: num(bk[m]?.confirmed),
    travelers: num(bk[m]?.travelers),
  }));

  const funnel = Object.fromEntries(funnelRows.map((r) => [r.status, num(r.n)]));
  const created = Object.values(funnel).reduce((a, b) => a + b, 0);
  const confirmed = funnel.CONFIRMED || 0;
  const revenue = monthly.reduce((a, m) => a + m.revenue, 0);

  res.json({
    months,
    since,
    summary: {
      revenue,
      confirmedBookings: confirmed,
      travelers: monthly.reduce((a, m) => a + m.travelers, 0),
      averageBookingValue: confirmed ? Math.round(revenue / confirmed) : 0,
      conversionRate: created ? confirmed / created : 0,
      repeatCustomers: num(repeatRows[0]?.repeaters),
      payingCustomers: num(repeatRows[0]?.customers),
    },
    funnel: { created, ...funnel },
    monthly,
    topPackages: topPackages.map((r) => ({ title: r.title, slug: r.slug, bookings: num(r.bookings), travelers: num(r.travelers), revenue: num(r.revenue) })),
    byDestination: byDestination.map((r) => ({ name: r.name, bookings: num(r.bookings), revenue: num(r.revenue) })),
    byCategory: byCategory.map((r) => ({ name: r.name, bookings: num(r.bookings), revenue: num(r.revenue) })),
    upcomingDepartures: upcoming.map((d) => ({
      id: d.id, title: d.package.title, startDate: d.startDate, seatsBooked: d.seatsBooked, seatsTotal: d.seatsTotal,
    })),
  });
});

// Download all bookings as a CSV file (opens in Excel / Google Sheets).
router.get('/export/bookings.csv', async (_req, res) => {
  const rows = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      package: { select: { title: true } },
      departure: { select: { startDate: true } },
      payments: { where: { status: 'PAID' }, select: { providerPaymentId: true } },
    },
  });
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Booking ref', 'Booked on', 'Status', 'Customer', 'Email', 'Phone', 'Journey', 'Departure', 'Travellers', 'Amount (INR)', 'Payment ID'];
  const lines = rows.map((b) => [
    b.bookingRef, b.createdAt.toISOString().slice(0, 10), b.status, b.contactName, b.user.email, b.contactPhone,
    b.package.title, b.departure.startDate.toISOString().slice(0, 10), b.travelers, (b.amount / 100).toFixed(2),
    b.payments[0]?.providerPaymentId || '',
  ].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ayana-bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [header.join(','), ...lines].join('\n')); // BOM so Excel reads ₹/Hindi correctly
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
      images: { orderBy: { sortOrder: 'asc' } },
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

// ---------- Photos ----------
// Upload: multipart/form-data with one or more files in the field "images".
router.post('/packages/:id/images', uploadImages, async (req, res) => {
  const pkg = await prisma.package.findUnique({ where: { id: req.params.id } });
  if (!pkg) throw notFound('Package not found');
  if (!req.files?.length) throw badRequest('Choose at least one photo');
  const last = await prisma.packageImage.findFirst({ where: { packageId: pkg.id }, orderBy: { sortOrder: 'desc' } });
  let order = (last?.sortOrder ?? -1) + 1;
  const created = [];
  for (const file of req.files) {
    const urls = await savePackageImage(pkg.id, file.buffer);
    created.push(
      await prisma.packageImage.create({
        data: { packageId: pkg.id, ...urls, alt: pkg.title, sortOrder: order++ },
      }),
    );
  }
  res.status(201).json({ images: created });
});

// Reorder: body { ids: [imageId, ...] } in the new order. The first one becomes the cover.
router.put('/packages/:id/images/order', async (req, res) => {
  const { ids } = validate(z.object({ ids: z.array(z.string()).min(1) }), req.body);
  await prisma.$transaction(
    ids.map((id, i) => prisma.packageImage.updateMany({ where: { id, packageId: req.params.id }, data: { sortOrder: i } })),
  );
  res.json({ ok: true });
});

router.patch('/images/:id', async (req, res) => {
  const { alt } = validate(z.object({ alt: z.string().max(200) }), req.body);
  const image = await prisma.packageImage.update({ where: { id: req.params.id }, data: { alt } });
  res.json({ image });
});

router.delete('/images/:id', async (req, res) => {
  const image = await prisma.packageImage.delete({ where: { id: req.params.id } });
  await deleteImageFiles(image);
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
