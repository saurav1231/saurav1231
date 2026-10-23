import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { departureView } from '../lib/serialize.js';
import { requireAuth } from '../middleware/auth.js';
import { refreshPackageRating } from '../services/bookingService.js';

const router = Router();

router.get('/destinations', async (_req, res) => {
  const destinations = await prisma.destination.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { packages: { where: { isActive: true } } } } },
  });
  res.json({
    destinations: destinations.map(({ _count, ...d }) => ({ ...d, packageCount: _count.packages })),
  });
});

router.get('/categories', async (_req, res) => {
  const rows = await prisma.package.groupBy({
    by: ['category'],
    where: { isActive: true },
    _count: { _all: true },
    orderBy: { category: 'asc' },
  });
  res.json({ categories: rows.map((r) => ({ name: r.category, count: r._count._all })) });
});

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  destination: z.string().trim().max(191).optional(), // destination slug
  minPrice: z.coerce.number().int().min(0).optional(), // rupees
  maxPrice: z.coerce.number().int().min(0).optional(), // rupees
  maxDays: z.coerce.number().int().min(1).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'duration', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

const SORTS = {
  popular: [{ isFeatured: 'desc' }, { ratingCount: 'desc' }],
  price_asc: [{ pricePerPerson: 'asc' }],
  price_desc: [{ pricePerPerson: 'desc' }],
  duration: [{ durationDays: 'asc' }],
  newest: [{ createdAt: 'desc' }],
};

router.get('/packages', async (req, res) => {
  const q = validate(listSchema, req.query);
  const where = { isActive: true };
  if (q.search) {
    where.OR = [
      { title: { contains: q.search } },
      { summary: { contains: q.search } },
      { destination: { name: { contains: q.search } } },
    ];
  }
  if (q.category) where.category = q.category;
  if (q.destination) where.destination = { slug: q.destination };
  if (q.minPrice != null || q.maxPrice != null) {
    where.pricePerPerson = {};
    if (q.minPrice != null) where.pricePerPerson.gte = q.minPrice * 100;
    if (q.maxPrice != null) where.pricePerPerson.lte = q.maxPrice * 100;
  }
  if (q.maxDays) where.durationDays = { lte: q.maxDays };
  if (q.featured) where.isFeatured = q.featured === 'true';

  const [total, packages] = await Promise.all([
    prisma.package.count({ where }),
    prisma.package.findMany({
      where,
      orderBy: SORTS[q.sort],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true, slug: true, title: true, summary: true, category: true, durationDays: true,
        pricePerPerson: true, currency: true, imageUrl: true, isFeatured: true,
        ratingAvg: true, ratingCount: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumbUrl: true, alt: true } },
        destination: { select: { name: true, slug: true, state: true, latitude: true, longitude: true } },
      },
    }),
  ]);
  res.json({ packages, page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) });
});

router.get('/packages/:slug', async (req, res) => {
  const pkg = await prisma.package.findFirst({
    where: { slug: req.params.slug, isActive: true },
    include: {
      destination: true,
      itinerary: { orderBy: { dayNumber: 'asc' } },
      images: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true, thumbUrl: true, alt: true } },
      departures: { where: { isActive: true, startDate: { gte: new Date() } }, orderBy: { startDate: 'asc' } },
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!pkg) throw notFound('Package not found');
  res.json({ package: { ...pkg, departures: pkg.departures.map((d) => departureView(d, pkg)) } });
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(5).max(2000),
});

// Only travellers with a confirmed booking can review.
router.post('/packages/:slug/reviews', requireAuth, async (req, res) => {
  const data = validate(reviewSchema, req.body);
  const pkg = await prisma.package.findUnique({ where: { slug: req.params.slug } });
  if (!pkg) throw notFound('Package not found');
  const booked = await prisma.booking.findFirst({
    where: { userId: req.user.id, packageId: pkg.id, status: 'CONFIRMED' },
  });
  if (!booked) throw badRequest('You can review a journey after booking it');
  const review = await prisma.review.upsert({
    where: { userId_packageId: { userId: req.user.id, packageId: pkg.id } },
    create: { userId: req.user.id, packageId: pkg.id, ...data },
    update: data,
  });
  await refreshPackageRating(pkg.id);
  res.status(201).json({ review });
});

export default router;
