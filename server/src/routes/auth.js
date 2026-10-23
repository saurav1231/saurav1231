import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../lib/validate.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { publicUser } from '../lib/serialize.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20).optional(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res) => {
  const data = validate(registerSchema, req.body);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict('An account with this email already exists');
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash: await bcrypt.hash(data.password, 10) },
  });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const data = validate(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
    throw unauthorized('Wrong email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

export default router;
