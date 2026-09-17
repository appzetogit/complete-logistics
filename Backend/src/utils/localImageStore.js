import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

// Images arrive from admin panels and apps as base64 data URLs. Stored as-is
// they become part of every document that references them -- ten vehicle rows
// once held 10 MB of base64, and each ride copied one of those blobs into
// itself, turning 342 rides into 48 MB. Keep the file on disk, keep only the
// URL in Mongo.

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export const isDataUrl = (value) => typeof value === 'string' && value.trim().startsWith('data:');

/**
 * Write a base64 data URL to the uploads volume and return its public URL.
 * Content-addressed by SHA-1, so the same image stored twice reuses one file.
 * Any value that is already a URL is returned untouched, making this safe to
 * call on mixed data.
 */
export const storeDataUrlImage = async (value, folder = 'general') => {
  if (!isDataUrl(value)) {
    return typeof value === 'string' ? value : '';
  }

  const match = DATA_URL_PATTERN.exec(value.trim());
  if (!match) {
    return '';
  }

  const [, mimeType, base64Payload] = match;
  const bytes = Buffer.from(base64Payload, 'base64');

  if (!bytes.length) {
    return '';
  }

  const extension = EXTENSIONS[mimeType.toLowerCase()] || 'bin';
  const digest = crypto.createHash('sha1').update(bytes).digest('hex');
  const relativePath = `${folder}/${digest}.${extension}`;

  await mkdir(path.join(env.uploads.dir, folder), { recursive: true });
  await writeFile(path.join(env.uploads.dir, relativePath), bytes);

  return `${env.uploads.publicBaseUrl}/${relativePath}`;
};
