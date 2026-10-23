import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

// Keeps uploads in memory just long enough for sharp to resize them.
export const uploadImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(badRequest(`${file.originalname}: use JPG, PNG, WEBP or AVIF photos`));
  },
}).array('images', 12);

// Saves a large (1600px) and a small (640px) WEBP copy. Returns their public URLs.
export async function savePackageImage(packageId, buffer) {
  const dir = path.join(config.uploadDir, 'packages', packageId);
  await fs.mkdir(dir, { recursive: true });
  const name = crypto.randomBytes(8).toString('hex');
  const base = sharp(buffer, { failOn: 'error' }).rotate(); // rotate = respect phone camera orientation
  try {
    await base.metadata();
  } catch {
    throw badRequest('One of the files is not a readable photo');
  }
  await base.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, `${name}.webp`));
  await base.clone().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 75 }).toFile(path.join(dir, `${name}-thumb.webp`));
  const urlBase = `/uploads/packages/${packageId}/${name}`;
  return { url: `${urlBase}.webp`, thumbUrl: `${urlBase}-thumb.webp` };
}

export async function deleteImageFiles(image) {
  for (const u of [image.url, image.thumbUrl]) {
    if (!u?.startsWith('/uploads/')) continue;
    await fs.rm(path.join(config.uploadDir, u.slice('/uploads/'.length)), { force: true });
  }
}
