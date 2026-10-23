import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Requires a valid "Authorization: Bearer <token>" header; sets req.user.
export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Session expired, please log in again');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'ADMIN') throw forbidden('Admins only');
  next();
}
