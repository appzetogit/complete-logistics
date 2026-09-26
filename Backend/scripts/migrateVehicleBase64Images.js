/**
 * One-time migration: turn base64 `data:` URIs stored on vehicle types into
 * real files under `Backend/uploads/vehicles/` and rewrite the document to
 * point at the served URL instead.
 *
 * Why: the goods vehicles were saved with the whole PNG inlined into
 * `image`, which made `/users/vehicle-types` a ~7MB response and meant the
 * apps could not treat the field as a URL. Taxi vehicles already store
 * `https://<host>/uploads/vehicles/<sha1>.webp`, so this brings the delivery
 * ones in line.
 *
 * Usage (dry run — reports what it would do, changes nothing):
 *   node scripts/migrateVehicleBase64Images.js
 *
 * Usage (apply):
 *   node scripts/migrateVehicleBase64Images.js --apply
 *
 * Optional base URL override (defaults to $PUBLIC_BASE_URL then udanxpress.com):
 *   node scripts/migrateVehicleBase64Images.js --apply --base-url=https://udanxpress.com
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const BASE_URL = String(
  process.argv.find((a) => a.startsWith('--base-url='))?.split('=').slice(1).join('=')
    || process.env.PUBLIC_BASE_URL
    || 'https://udanxpress.com',
).trim().replace(/\/+$/, '');

const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const UPLOAD_DIR = path.resolve(__dirname, '../uploads/vehicles');

/** Fields on a vehicle type doc that may hold an inlined image. */
const IMAGE_FIELDS = ['image', 'icon', 'map_icon'];

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const DATA_URI_PATTERN = /^data:([^;,]+)(;charset=[^;,]+)?;base64,(.*)$/is;

const parseDataUri = (value) => {
  const match = DATA_URI_PATTERN.exec(String(value || '').trim());
  if (!match) return null;

  const mime = match[1].trim().toLowerCase();
  const extension = MIME_EXTENSIONS[mime];
  if (!extension) return null;

  let buffer;
  try {
    buffer = Buffer.from(match[3], 'base64');
  } catch {
    return null;
  }

  return buffer.length ? { buffer, extension } : null;
};

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const run = async () => {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${DB_NAME}${APPLY ? '' : '  (DRY RUN — pass --apply to write)'}`);

  const collection = mongoose.connection.collection('taxivehicles');
  const docs = await collection
    .find({ $or: IMAGE_FIELDS.map((field) => ({ [field]: /^data:/i })) })
    .toArray();

  if (!docs.length) {
    console.log('No vehicle types hold inlined base64 images. Nothing to do.');
    return;
  }

  if (APPLY) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }

  // Identical blobs across fields/documents collapse onto one file because the
  // name is the content hash.
  const writtenFiles = new Map();
  let bytesInlined = 0;
  let updatedDocs = 0;

  for (const doc of docs) {
    const updates = {};

    for (const field of IMAGE_FIELDS) {
      const parsed = parseDataUri(doc[field]);
      if (!parsed) continue;

      const hash = crypto.createHash('sha1').update(parsed.buffer).digest('hex');
      const fileName = `${hash}.${parsed.extension}`;
      const url = `${BASE_URL}/uploads/vehicles/${fileName}`;

      bytesInlined += String(doc[field]).length;

      if (!writtenFiles.has(fileName)) {
        writtenFiles.set(fileName, parsed.buffer.length);
        if (APPLY) {
          await fs.writeFile(path.join(UPLOAD_DIR, fileName), parsed.buffer);
        }
      }

      updates[field] = url;
    }

    if (!Object.keys(updates).length) continue;

    console.log(
      `  ${doc.name || doc._id}: ${Object.entries(updates)
        .map(([field, url]) => `${field} -> ${url.split('/').pop()}`)
        .join(', ')}`,
    );

    if (APPLY) {
      await collection.updateOne({ _id: doc._id }, { $set: updates });
    }
    updatedDocs += 1;
  }

  const bytesOnDisk = [...writtenFiles.values()].reduce((sum, n) => sum + n, 0);
  console.log('');
  console.log(`Vehicle types ${APPLY ? 'updated' : 'to update'}: ${updatedDocs}`);
  console.log(`Files ${APPLY ? 'written' : 'to write'}:        ${writtenFiles.size} (${formatBytes(bytesOnDisk)})`);
  console.log(`Base64 removed from DB:   ${formatBytes(bytesInlined)}`);

  if (!APPLY) {
    console.log('');
    console.log('Dry run only — re-run with --apply to write the files and update the documents.');
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
