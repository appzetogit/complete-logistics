import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const DATA_URI_PATTERN = /^data:([^;,]+)(;charset=[^;,]+)?;base64,(.*)$/is;

const resolveBaseUrl = () =>
  (env.publicBackendUrl || `http://localhost:${env.port}`).replace(/\/+$/, '');

/**
 * Persists a `data:` URI to disk under `Backend/uploads/<folder>/<sha1>.<ext>`
 * and returns the served URL. Content-addressed so re-saving the same image
 * reuses the existing file. Anything that isn't a recognized base64 data URI
 * (already a URL, empty, unsupported mime) is returned unchanged so callers
 * can pass values through without checking the shape first.
 */
export const storeDataUrlImage = async (value, folder = 'misc') => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = DATA_URI_PATTERN.exec(raw);
  if (!match) return raw;

  const mime = match[1].trim().toLowerCase();
  const extension = MIME_EXTENSIONS[mime];
  if (!extension) return raw;

  let buffer;
  try {
    buffer = Buffer.from(match[3], 'base64');
  } catch {
    return raw;
  }
  if (!buffer.length) return raw;

  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  const fileName = `${hash}.${extension}`;
  const targetDir = path.join(UPLOADS_ROOT, folder);
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, fileName), buffer);

  return `${resolveBaseUrl()}/uploads/${folder}/${fileName}`;
};
