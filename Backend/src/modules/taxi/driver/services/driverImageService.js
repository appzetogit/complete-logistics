import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Driver } from '../models/Driver.js';

// Driver images (profile photo, documents, daily selfie, vehicle photo) arrive from the apps as base64 data URLs.
// Stored as-is they made every driver payload huge (GET /drivers/me was ~2.4 MB) and every Mongo document heavy.
// Here they become files under /uploads and only the absolute URL is kept.
//
//   - only real JPEG / PNG / WebP pictures are accepted (checked by their bytes, not only the declared type):
//     an SVG or HTML file served from /uploads, on the admin panel's domain, could run script there
//   - size limit per image (decoded), 400 with a clear message otherwise
//   - '' clears the image; a value that is already a URL is kept as it is

export const DRIVER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const DRIVER_DOCUMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const DECLARED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);
const DATA_URL_PATTERN = /^data:([a-z0-9.+/-]+)(?:;[a-z0-9=._-]+)*;base64,([\s\S]*)$/i;

const sniffImageType = (bytes) => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
};

export const isInlineImage = (value) => typeof value === 'string' && value.trim().startsWith('data:');

let warnedRelative = false;
const uploadUrl = (relativePath) => {
  const base = env.uploads.publicBaseUrl;
  if (!/^https?:\/\//i.test(base) && !warnedRelative) {
    warnedRelative = true;
    console.warn('[uploads] PUBLIC_BACKEND_URL is not set: image URLs are relative (/uploads/...). Set it in .env.');
  }
  return `${base}/${relativePath}`;
};

const invalidImage = (label, message) => new ApiError(400, `${label} ${message}`, { code: 'INVALID_IMAGE' });

/**
 * Decodes and checks a data URL; returns { bytes, type } or throws a 400.
 */
const decodeImage = (value, { label, maxBytes }) => {
  const match = DATA_URL_PATTERN.exec(String(value).trim());
  if (!match) throw invalidImage(label, 'is not a valid image');
  if (!DECLARED_TYPES.has(match[1].toLowerCase())) throw invalidImage(label, 'must be a JPEG, PNG or WebP image');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw invalidImage(label, 'is empty');
  if (maxBytes && bytes.length > maxBytes) {
    throw invalidImage(label, `is too large (${(bytes.length / 1024 / 1024).toFixed(1)} MB). The limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const type = sniffImageType(bytes);
  if (!type) throw invalidImage(label, 'must be a JPEG, PNG or WebP image');
  return { bytes, type };
};

// Content-addressed: the same picture always gets the same file. write: false only computes the URL (dry runs).
const writeImage = async ({ bytes, type }, folder, { write = true } = {}) => {
  const digest = crypto.createHash('sha1').update(bytes).digest('hex');
  const relativePath = `${folder}/${digest}.${EXTENSION_BY_TYPE[type]}`;
  if (write) {
    await mkdir(path.join(env.uploads.dir, folder), { recursive: true });
    await writeFile(path.join(env.uploads.dir, relativePath), bytes);
  }
  return uploadUrl(relativePath);
};

/**
 * An image field from the app -> what to store: '' clears, a URL is kept, a data URL becomes a stored file's URL.
 */
export const storeDriverImage = async (value, { folder, label = 'Image', maxBytes = DRIVER_IMAGE_MAX_BYTES } = {}) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!isInlineImage(text)) return text;
  return writeImage(decodeImage(text, { label, maxBytes }), folder);
};

/**
 * Every data-URL string anywhere inside `value` (a document object, arrays included) becomes a stored file's URL.
 * The same picture repeated in several fields (previewUrl, secureUrl, imageUrl, images[]) is written once.
 * strict: a bad picture throws a 400 (new uploads); lenient (backfill): it is left untouched and reported.
 */
export const storeInlineImagesDeep = async (value, { folder, label = 'Document image', maxBytes, strict = true, write = true, cache = new Map(), failures = [] } = {}) => {
  if (isInlineImage(value)) {
    const key = value.trim();
    if (!cache.has(key)) {
      try {
        cache.set(key, await writeImage(decodeImage(key, { label, maxBytes }), folder, { write }));
      } catch (error) {
        if (strict) throw error;
        failures.push(error.message);
        cache.set(key, value);
      }
    }
    return cache.get(key);
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await storeInlineImagesDeep(item, { folder, label, maxBytes, strict, write, cache, failures }));
    return out;
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value) && !value._bsontype) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = await storeInlineImagesDeep(item, { folder, label, maxBytes, strict, write, cache, failures });
    }
    return out;
  }
  return value;
};

const hasInlineDeep = (value) => {
  if (isInlineImage(value)) return true;
  if (Array.isArray(value)) return value.some(hasInlineDeep);
  if (value && typeof value === 'object' && !(value instanceof Date) && !value._bsontype) return Object.values(value).some(hasInlineDeep);
  return false;
};

/** Does this driver (lean object or document) still carry base64 images? */
export const driverHasInlineImages = (driver) =>
  isInlineImage(driver?.profileImage)
  || isInlineImage(driver?.profile_picture)
  || isInlineImage(driver?.vehicleImage)
  || isInlineImage(driver?.onlineSelfie?.imageUrl)
  || hasInlineDeep(driver?.documents);

/**
 * Converts a driver's stored base64 images to files (older rows). Lenient: a picture that cannot be converted
 * (e.g. not a JPEG/PNG/WebP) stays as it is and is reported, so nothing is ever lost. No size limit here.
 * Returns { $set, failures, bytesBefore, bytesAfter }; saves only when `apply` is true.
 */
export const healDriverInlineImages = async (driver, { apply = true } = {}) => {
  const plain = typeof driver?.toObject === 'function' ? driver.toObject() : driver;
  const $set = {};
  const failures = [];
  const cache = new Map();
  // A dry run (apply: false) writes no files and saves nothing; it only measures.
  const options = { strict: false, write: apply, cache, failures, maxBytes: 0 };

  if (isInlineImage(plain.profileImage)) {
    $set.profileImage = await storeInlineImagesDeep(plain.profileImage, { ...options, folder: 'drivers/profile', label: 'Profile photo' });
  }
  if (isInlineImage(plain.profile_picture)) {
    $set.profile_picture = await storeInlineImagesDeep(plain.profile_picture, { ...options, folder: 'drivers/profile', label: 'Profile photo' });
  }
  if (isInlineImage(plain.vehicleImage)) {
    $set.vehicleImage = await storeInlineImagesDeep(plain.vehicleImage, { ...options, folder: 'drivers/vehicles', label: 'Vehicle photo' });
  }
  if (isInlineImage(plain.onlineSelfie?.imageUrl)) {
    $set['onlineSelfie.imageUrl'] = await storeInlineImagesDeep(plain.onlineSelfie.imageUrl, { ...options, folder: 'drivers/selfies', label: 'Selfie' });
  }
  if (hasInlineDeep(plain.documents)) {
    $set.documents = await storeInlineImagesDeep(plain.documents, { ...options, folder: 'drivers/documents', label: 'Document image' });
  }

  const sizeOf = (value) => Buffer.byteLength(JSON.stringify(value ?? ''));
  const before = { profileImage: plain.profileImage, profilePicture: plain.profile_picture, vehicleImage: plain.vehicleImage, selfie: plain.onlineSelfie?.imageUrl, documents: plain.documents };
  const after = {
    profileImage: $set.profileImage ?? plain.profileImage,
    profilePicture: $set.profile_picture ?? plain.profile_picture,
    vehicleImage: $set.vehicleImage ?? plain.vehicleImage,
    selfie: $set['onlineSelfie.imageUrl'] ?? plain.onlineSelfie?.imageUrl,
    documents: $set.documents ?? plain.documents,
  };

  if (apply && Object.keys($set).length) {
    await Driver.updateOne({ _id: plain._id }, { $set });
    if (typeof driver?.set === 'function') {
      for (const [key, value] of Object.entries($set)) driver.set(key, value);
    }
  }
  return { $set, failures, bytesBefore: sizeOf(before), bytesAfter: sizeOf(after) };
};
