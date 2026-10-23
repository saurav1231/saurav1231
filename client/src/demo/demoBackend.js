// In-browser stand-in for the Ayana API, used only by the demo build (VITE_DEMO=true).
// It mirrors the real endpoints closely enough to click through the whole site,
// keeps data in localStorage, and simulates payments. No server or money involved.
import seed from './demo-data.json';

const STORE_KEY = 'ayana_demo_db_v1';
const HOLD_MINUTES = 30;
const ADMIN = { id: 'u_admin', name: 'Ayana Admin', email: 'admin@ayana.travel', password: 'Admin@12345', role: 'ADMIN' };

function fresh() {
  return { users: [ADMIN], packages: structuredClone(seed.packages), destinations: seed.destinations, bookings: [], payments: [] };
}

let db;
function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    db = raw ? JSON.parse(raw) : fresh();
  } catch {
    db = fresh();
  }
  return db;
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {
    /* storage blocked: keep working in memory */
  }
}

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const fail = (status, msg, details) => {
  throw new ApiError(status, msg, details);
};

const uid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();
const publicUser = ({ password, ...u }) => u;
const unitPrice = (pkg, d) => d?.priceOverride ?? pkg.pricePerPerson;

function currentUser(token) {
  if (!token) return null;
  return load().users.find((u) => u.id === token) || null;
}
function needUser(token) {
  const u = currentUser(token);
  if (!u) fail(401, 'Please log in');
  return u;
}
function needAdmin(token) {
  const u = needUser(token);
  if (u.role !== 'ADMIN') fail(403, 'Admins only');
  return u;
}

function expireStale() {
  const t = Date.now();
  for (const b of load().bookings) {
    if (b.status === 'PENDING' && new Date(b.expiresAt).getTime() < t) {
      b.status = 'EXPIRED';
      const dep = findDeparture(b.departureId);
      if (dep) dep.seatsBooked = Math.max(0, dep.seatsBooked - b.travelers);
    }
  }
}

function findDeparture(id) {
  for (const p of load().packages) {
    const d = p.departures.find((x) => x.id === id);
    if (d) return d;
  }
  return null;
}

const listView = (p) => ({
  id: p.id, slug: p.slug, title: p.title, summary: p.summary, category: p.category, durationDays: p.durationDays,
  pricePerPerson: p.pricePerPerson, currency: p.currency, imageUrl: p.imageUrl, isFeatured: p.isFeatured,
  ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
  destination: (({ name, slug, state, latitude, longitude }) => ({ name, slug, state, latitude, longitude }))(p.destination),
});

function bookingView(b) {
  const pkg = load().packages.find((p) => p.id === b.packageId);
  const dep = findDeparture(b.departureId);
  const user = load().users.find((u) => u.id === b.userId);
  return {
    ...b,
    package: { title: pkg.title, slug: pkg.slug, durationDays: pkg.durationDays, imageUrl: pkg.imageUrl, category: pkg.category },
    departure: { startDate: dep.startDate },
    user: user && { name: user.name, email: user.email, phone: user.phone },
    payments: load().payments.filter((x) => x.bookingId === b.id),
  };
}

const SORTS = {
  popular: (a, b) => b.isFeatured - a.isFeatured || b.ratingCount - a.ratingCount,
  price_asc: (a, b) => a.pricePerPerson - b.pricePerPerson,
  price_desc: (a, b) => b.pricePerPerson - a.pricePerPerson,
  duration: (a, b) => a.durationDays - b.durationDays,
  newest: (a, b) => (b.createdAt > a.createdAt ? 1 : -1),
};

const routes = [
  // ---------- auth ----------
  ['POST', /^\/auth\/register$/, ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!body.name || body.name.trim().length < 2) fail(400, 'Please enter your name');
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Please enter a valid email');
    if (!body.password || body.password.length < 8) fail(400, 'Password needs at least 8 characters');
    if (load().users.some((u) => u.email === email)) fail(409, 'An account with this email already exists');
    const user = { id: uid('u'), name: body.name.trim(), email, phone: body.phone || null, password: body.password, role: 'USER', createdAt: now() };
    load().users.push(user);
    save();
    return { token: user.id, user: publicUser(user) };
  }],
  ['POST', /^\/auth\/login$/, ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    const user = load().users.find((u) => u.email === email && u.password === body.password);
    if (!user) fail(401, 'Wrong email or password');
    return { token: user.id, user: publicUser(user) };
  }],
  ['GET', /^\/auth\/me$/, ({ token }) => ({ user: publicUser(needUser(token)) })],

  // ---------- catalog ----------
  ['GET', /^\/destinations$/, () => ({
    destinations: load().destinations.map((d) => ({
      ...d,
      packageCount: load().packages.filter((p) => p.isActive && p.destinationId === d.id).length,
    })),
  })],
  ['GET', /^\/categories$/, () => {
    const counts = {};
    load().packages.filter((p) => p.isActive).forEach((p) => (counts[p.category] = (counts[p.category] || 0) + 1));
    return { categories: Object.keys(counts).sort().map((name) => ({ name, count: counts[name] })) };
  }],
  ['GET', /^\/packages$/, ({ query }) => {
    let rows = load().packages.filter((p) => p.isActive);
    const q = (query.search || '').toLowerCase();
    if (q) rows = rows.filter((p) => [p.title, p.summary, p.destination.name].some((s) => s.toLowerCase().includes(q)));
    if (query.category) rows = rows.filter((p) => p.category === query.category);
    if (query.destination) rows = rows.filter((p) => p.destination.slug === query.destination);
    if (query.minPrice) rows = rows.filter((p) => p.pricePerPerson >= query.minPrice * 100);
    if (query.maxPrice) rows = rows.filter((p) => p.pricePerPerson <= query.maxPrice * 100);
    if (query.maxDays) rows = rows.filter((p) => p.durationDays <= Number(query.maxDays));
    if (query.featured) rows = rows.filter((p) => String(p.isFeatured) === query.featured);
    rows = [...rows].sort(SORTS[query.sort] || SORTS.popular);
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 12);
    return {
      packages: rows.slice((page - 1) * limit, page * limit).map(listView),
      page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit),
    };
  }],
  ['GET', /^\/packages\/([\w-]+)$/, ({ params }) => {
    expireStale();
    const p = load().packages.find((x) => x.slug === params[0] && x.isActive);
    if (!p) fail(404, 'Package not found');
    const today = new Date().toISOString().slice(0, 10);
    return {
      package: {
        ...p,
        departures: p.departures
          .filter((d) => d.isActive !== false && d.startDate.slice(0, 10) >= today)
          .sort((a, b) => (a.startDate > b.startDate ? 1 : -1))
          .map((d) => ({ id: d.id, startDate: d.startDate, seatsTotal: d.seatsTotal, seatsLeft: Math.max(0, d.seatsTotal - d.seatsBooked), price: unitPrice(p, d) })),
      },
    };
  }],
  ['POST', /^\/packages\/([\w-]+)\/reviews$/, ({ params, body, token }) => {
    const user = needUser(token);
    const p = load().packages.find((x) => x.slug === params[0]);
    if (!p) fail(404, 'Package not found');
    if (!load().bookings.some((b) => b.userId === user.id && b.packageId === p.id && b.status === 'CONFIRMED')) {
      fail(400, 'You can review a journey after booking it');
    }
    if (!body.comment || body.comment.trim().length < 5) fail(400, 'Please write at least a few words');
    p.reviews = p.reviews.filter((r) => r.userId !== user.id);
    const review = { id: uid('r'), userId: user.id, rating: Number(body.rating), comment: body.comment.trim(), createdAt: now(), user: { name: user.name } };
    p.reviews.unshift(review);
    p.ratingCount = p.reviews.length;
    p.ratingAvg = p.reviews.reduce((s, r) => s + r.rating, 0) / p.reviews.length;
    save();
    return { review };
  }],

  // ---------- bookings ----------
  ['POST', /^\/bookings$/, ({ body, token }) => {
    const user = needUser(token);
    const p = load().packages.find((x) => x.slug === body.packageSlug && x.isActive);
    if (!p) fail(404, 'Package not found');
    const dep = p.departures.find((d) => d.id === body.departureId);
    if (!dep) fail(404, 'Departure date not found');
    const travelers = Number(body.travelers);
    if (!(travelers >= 1)) fail(400, 'Add at least one traveller');
    if (travelers > p.maxGroupSize) fail(400, `Max ${p.maxGroupSize} travellers per booking`);
    if (!body.contactName || body.contactName.trim().length < 2) fail(400, 'Please enter the lead traveller name');
    if (!body.contactPhone || body.contactPhone.trim().length < 7) fail(400, 'Please enter a valid phone number');
    expireStale();
    if (dep.seatsBooked + travelers > dep.seatsTotal) fail(409, 'Not enough seats left on this date');
    dep.seatsBooked += travelers;
    const booking = {
      id: uid('b'),
      bookingRef: `AYN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      userId: user.id, packageId: p.id, departureId: dep.id, travelers,
      amount: unitPrice(p, dep) * travelers, currency: p.currency, status: 'PENDING',
      contactName: body.contactName.trim(), contactPhone: body.contactPhone.trim(), specialRequests: body.specialRequests || null,
      expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(), createdAt: now(),
    };
    load().bookings.unshift(booking);
    save();
    return { booking };
  }],
  ['GET', /^\/bookings\/me$/, ({ token }) => {
    const user = needUser(token);
    expireStale();
    return { bookings: load().bookings.filter((b) => b.userId === user.id).map(bookingView) };
  }],
  ['GET', /^\/bookings\/([\w-]+)$/, ({ params, token }) => {
    const user = needUser(token);
    expireStale();
    const b = load().bookings.find((x) => x.id === params[0]);
    if (!b) fail(404, 'Booking not found');
    if (b.userId !== user.id && user.role !== 'ADMIN') fail(403, 'Not allowed');
    return { booking: bookingView(b) };
  }],
  ['POST', /^\/bookings\/([\w-]+)\/cancel$/, ({ params, token }) => {
    const user = needUser(token);
    const b = load().bookings.find((x) => x.id === params[0] && x.userId === user.id);
    if (!b) fail(404, 'Booking not found');
    if (b.status !== 'PENDING') fail(400, 'Only unpaid bookings can be cancelled online');
    b.status = 'CANCELLED';
    const dep = findDeparture(b.departureId);
    dep.seatsBooked = Math.max(0, dep.seatsBooked - b.travelers);
    save();
    return { booking: bookingView(b) };
  }],

  // ---------- payments (simulated) ----------
  ['GET', /^\/payments\/config$/, () => ({ mode: 'mock', keyId: null })],
  ['POST', /^\/payments\/order$/, ({ body, token }) => {
    const user = needUser(token);
    const b = load().bookings.find((x) => x.id === body.bookingId && x.userId === user.id);
    if (!b) fail(404, 'Booking not found');
    if (b.status !== 'PENDING') fail(400, `Booking is ${b.status.toLowerCase()}`);
    const payment = { id: uid('p'), bookingId: b.id, provider: 'mock', providerOrderId: uid('order'), amount: b.amount, status: 'CREATED', createdAt: now() };
    load().payments.push(payment);
    save();
    return { mode: 'mock', orderId: payment.providerOrderId, amount: b.amount, currency: b.currency, bookingRef: b.bookingRef };
  }],
  ['POST', /^\/payments\/verify$/, ({ body, token }) => {
    needUser(token);
    const pay = load().payments.find((x) => x.providerOrderId === body.razorpay_order_id);
    if (!pay) fail(404, 'Payment order not found');
    const b = load().bookings.find((x) => x.id === pay.bookingId);
    pay.status = 'PAID';
    pay.providerPaymentId = body.razorpay_payment_id;
    if (b.status === 'PENDING') b.status = 'CONFIRMED';
    save();
    return { booking: bookingView(b) };
  }],

  // ---------- admin ----------
  ['GET', /^\/admin\/stats$/, ({ token }) => {
    needAdmin(token);
    expireStale();
    const d = load();
    const byStatus = {};
    d.bookings.forEach((b) => (byStatus[b.status] = (byStatus[b.status] || 0) + 1));
    return {
      packages: d.packages.filter((p) => p.isActive).length,
      users: d.users.length,
      revenue: d.payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0),
      bookings: byStatus,
      recent: d.bookings.slice(0, 8).map(bookingView),
    };
  }],
  ['GET', /^\/admin\/bookings$/, ({ token, query }) => {
    needAdmin(token);
    expireStale();
    return { bookings: load().bookings.filter((b) => !query.status || b.status === query.status).map(bookingView) };
  }],
  ['GET', /^\/admin\/packages$/, ({ token }) => {
    needAdmin(token);
    return { packages: load().packages };
  }],
  ['POST', /^\/admin\/packages$/, ({ token, body }) => {
    needAdmin(token);
    if (load().packages.some((p) => p.slug === body.slug)) fail(409, 'That URL slug is already used');
    const dest = load().destinations.find((d) => d.id === body.destinationId);
    if (!dest) fail(400, 'Choose a destination');
    const id = uid('pkg');
    const pkg = {
      ...body, id, currency: 'INR', imageUrl: body.imageUrl || null, isActive: true, ratingAvg: 0, ratingCount: 0,
      maxGroupSize: 15, destination: dest, reviews: [], departures: [], createdAt: now(),
      itinerary: body.itinerary.map((d, i) => ({ ...d, id: uid('day'), dayNumber: i + 1 })),
    };
    load().packages.unshift(pkg);
    save();
    return { package: pkg };
  }],
  ['PUT', /^\/admin\/packages\/([\w-]+)$/, ({ token, body, params }) => {
    needAdmin(token);
    const pkg = load().packages.find((p) => p.id === params[0]);
    if (!pkg) fail(404, 'Package not found');
    const dest = load().destinations.find((d) => d.id === body.destinationId) || pkg.destination;
    Object.assign(pkg, body, {
      imageUrl: body.imageUrl || null, destination: dest,
      itinerary: body.itinerary.map((d, i) => ({ ...d, id: uid('day'), dayNumber: i + 1 })),
    });
    save();
    return { package: pkg };
  }],
  ['DELETE', /^\/admin\/packages\/([\w-]+)$/, ({ token, params }) => {
    needAdmin(token);
    const pkg = load().packages.find((p) => p.id === params[0]);
    if (pkg) pkg.isActive = false;
    save();
    return null;
  }],
  ['POST', /^\/admin\/packages\/([\w-]+)\/departures$/, ({ token, params, body }) => {
    needAdmin(token);
    const pkg = load().packages.find((p) => p.id === params[0]);
    if (!pkg) fail(404, 'Package not found');
    if (!body.startDate) fail(400, 'Pick a start date');
    const dep = { id: uid('dep'), startDate: new Date(body.startDate).toISOString(), seatsTotal: Number(body.seatsTotal), seatsBooked: 0, priceOverride: null, isActive: true };
    pkg.departures.push(dep);
    pkg.departures.sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
    save();
    return { departure: dep };
  }],
];

export async function demoRequest(method, path, { body, query, token }) {
  await new Promise((r) => setTimeout(r, 120)); // feel like a network call
  for (const [m, re, handler] of routes) {
    const match = path.match(re);
    if (m === method && match) {
      return structuredClone(handler({ params: match.slice(1), body: body || {}, query: query || {}, token }) ?? null);
    }
  }
  fail(404, `Route not found: ${method} ${path}`);
}

export function resetDemo() {
  db = fresh();
  save();
}
