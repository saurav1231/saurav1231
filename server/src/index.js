import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { expireStaleBookings } from './services/bookingService.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[ayana] API running on http://localhost:${config.port} (payments: ${config.payment.mode})`);
});

// Release seats held by unpaid bookings every minute.
const timer = setInterval(() => {
  expireStaleBookings().catch((err) => console.error('[ayana] expire job failed', err.message));
}, 60_000);

async function shutdown() {
  clearInterval(timer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
