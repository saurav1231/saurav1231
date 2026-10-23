import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import bookingRoutes from './routes/bookings.js';
import paymentRoutes, { razorpayWebhook } from './routes/payments.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Nginx / Hostinger proxy

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.clientUrls }));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // Webhook needs the raw body for signature checks, so it is registered before express.json().
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), razorpayWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 50 }));

  // Uploaded package photos (on the VPS Nginx serves this folder directly, see deploy/nginx.conf)
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d' }));
  app.use('/uploads', (_req, res) => res.status(404).end());

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api', catalogRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', notFoundHandler);

  // Optional: serve the built React app from the same Node process (single-app hosting).
  if (config.serveClient) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
    app.use(express.static(dist, { maxAge: '7d', index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
