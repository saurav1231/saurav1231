// Creates ~12 months of SAMPLE customers, bookings and payments so the admin
// analytics have something to show while you develop. Never run in production.
//   npm run db:sample
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to create sample data in production.');
  process.exit(1);
}

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const NAMES = ['Asha Verma', 'Rohan Iyer', 'Meera Nair', 'Vikram Singh', 'Pooja Patel', 'Arjun Rao', 'Kavya Menon', 'Siddharth Jain', 'Neha Gupta', 'Rahul Sharma', 'Ananya Das', 'Karan Malhotra', 'Divya Reddy', 'Aditya Kulkarni', 'Ishita Bose', 'Manish Tiwari', 'Sneha Joshi', 'Harsh Agarwal', 'Ritu Saxena', 'Gaurav Mehta'];

async function main() {
  const hash = await bcrypt.hash('sample-password', 10);
  const users = [];
  for (const [i, name] of NAMES.entries()) {
    const email = `sample${i + 1}@example.com`;
    users.push(await prisma.user.upsert({ where: { email }, update: {}, create: { name, email, phone: `98${String(10000000 + i * 7919).slice(0, 8)}`, passwordHash: hash } }));
  }
  const packages = await prisma.package.findMany({ include: { departures: true } });
  let count = 0;
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo--) {
    const perMonth = 6 + Math.round((11 - monthsAgo) * 1.4 + rnd() * 5); // business growing over the year
    for (let k = 0; k < perMonth; k++) {
      const pkg = pick(packages);
      const dep = pick(pkg.departures);
      const user = pick(users);
      const travelers = 1 + Math.floor(rnd() * 4);
      const created = new Date();
      created.setUTCMonth(created.getUTCMonth() - monthsAgo, 1 + Math.floor(rnd() * 27));
      const r = rnd();
      const status = r < 0.72 ? 'CONFIRMED' : r < 0.9 ? 'EXPIRED' : 'CANCELLED';
      const amount = (dep.priceOverride ?? pkg.pricePerPerson) * travelers;
      const booking = await prisma.booking.create({
        data: {
          bookingRef: `AYN-S${String(++count).padStart(5, '0')}`,
          userId: user.id, packageId: pkg.id, departureId: dep.id, travelers, amount, status,
          contactName: user.name, contactPhone: user.phone, createdAt: created, expiresAt: created,
        },
      });
      if (status === 'CONFIRMED') {
        await prisma.payment.create({
          data: { bookingId: booking.id, provider: 'mock', providerOrderId: `sample_order_${count}`, providerPaymentId: `sample_pay_${count}`, amount, status: 'PAID', createdAt: created },
        });
      }
    }
  }
  console.log(`Created ${count} sample bookings for ${users.length} sample customers.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
