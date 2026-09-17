import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OLD_CLOUD_NAME = String(process.argv[2] || 'appzeto-master-product').trim();
const DB_NAME = String(process.argv[3] || process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim() || 'appzeto_taxi';
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const NEW_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const NEW_CLOUDINARY_API_KEY = String(process.env.CLOUDINARY_API_KEY || '').trim();
const NEW_CLOUDINARY_API_SECRET = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const BATCH_SIZE = 200;

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

if (!NEW_CLOUD_NAME || !NEW_CLOUDINARY_API_KEY || !NEW_CLOUDINARY_API_SECRET) {
  throw new Error('Missing Cloudinary credentials in Backend/.env');
}

if (!OLD_CLOUD_NAME) {
  throw new Error('Usage: node scripts/migrateCloudinaryImages.js <oldCloudName> [dbName]');
}

const OLD_CLOUDINARY_URL_PATTERN = new RegExp(`https?:\\/\\/res\\.cloudinary\\.com\\/${OLD_CLOUD_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/image\\/upload\\/[^\\s"'<>]+`, 'gi');

const shouldSkipCollection = (name) =>
  !name
  || name.startsWith('system.');

const buildSignature = (params, apiSecret) => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
};

const parseCloudinaryPublicId = (url) => {
  const parsedUrl = new URL(url);
  const marker = '/image/upload/';
  const markerIndex = parsedUrl.pathname.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  const afterUpload = parsedUrl.pathname.slice(markerIndex + marker.length);
  const segments = afterUpload.split('/').filter(Boolean);
  const versionIndex = segments.findIndex((segment) => /^v\d+$/.test(segment));
  const assetSegments = versionIndex >= 0 ? segments.slice(versionIndex + 1) : segments;

  if (!assetSegments.length) {
    return null;
  }

  const lastSegment = assetSegments[assetSegments.length - 1];
  const extensionIndex = lastSegment.lastIndexOf('.');
  const format = extensionIndex > 0 ? lastSegment.slice(extensionIndex + 1) : '';
  const normalizedLastSegment = extensionIndex > 0 ? lastSegment.slice(0, extensionIndex) : lastSegment;
  const publicId = [...assetSegments.slice(0, -1), normalizedLastSegment].join('/');

  return {
    publicId,
    format,
  };
};

const uploadRemoteImageToCloudinary = async (sourceUrl) => {
  const parsedAsset = parseCloudinaryPublicId(sourceUrl);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    overwrite: 'true',
    public_id: parsedAsset?.publicId || `migrated/${Date.now()}`,
    timestamp,
    unique_filename: 'false',
  };

  if (parsedAsset?.format) {
    params.format = parsedAsset.format;
  }

  const signature = buildSignature(params, NEW_CLOUDINARY_API_SECRET);
  const formData = new FormData();
  formData.append('file', sourceUrl);
  formData.append('api_key', NEW_CLOUDINARY_API_KEY);
  formData.append('timestamp', timestamp);
  formData.append('public_id', params.public_id);
  formData.append('overwrite', params.overwrite);
  formData.append('unique_filename', params.unique_filename);
  if (params.format) {
    formData.append('format', params.format);
  }
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${NEW_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Cloudinary upload failed for ${sourceUrl}`);
  }

  return payload?.secure_url || '';
};

const replaceCloudinaryUrlsInValue = async (value, migrateUrl, cache) => {
  if (typeof value === 'string') {
    const matches = [...value.matchAll(OLD_CLOUDINARY_URL_PATTERN)];

    if (!matches.length) {
      return { nextValue: value, changed: false, migratedCount: 0 };
    }

    let nextValue = value;
    let changed = false;
    let migratedCount = 0;

    for (const match of matches) {
      const oldUrl = match[0];
      let newUrl = cache.get(oldUrl);

      if (!newUrl) {
        newUrl = await migrateUrl(oldUrl);
        cache.set(oldUrl, newUrl);
        migratedCount += 1;
      }

      if (newUrl && newUrl !== oldUrl) {
        nextValue = nextValue.split(oldUrl).join(newUrl);
        changed = true;
      }
    }

    return { nextValue, changed, migratedCount };
  }

  if (Array.isArray(value)) {
    let changed = false;
    let migratedCount = 0;
    const nextValue = [];

    for (const item of value) {
      const result = await replaceCloudinaryUrlsInValue(item, migrateUrl, cache);
      nextValue.push(result.nextValue);
      changed = changed || result.changed;
      migratedCount += result.migratedCount;
    }

    return { nextValue, changed, migratedCount };
  }

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId) && !(value instanceof Buffer)) {
    let changed = false;
    let migratedCount = 0;
    const nextValue = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const result = await replaceCloudinaryUrlsInValue(nestedValue, migrateUrl, cache);
      nextValue[key] = result.nextValue;
      changed = changed || result.changed;
      migratedCount += result.migratedCount;
    }

    return { nextValue, changed, migratedCount };
  }

  return { nextValue: value, changed: false, migratedCount: 0 };
};

const migrateCollection = async (collection, migrateUrl, cache) => {
  const cursor = collection.find({});
  const updates = [];
  let scanned = 0;
  let updated = 0;
  let migratedAssets = 0;

  const flush = async () => {
    if (!updates.length) {
      return;
    }

    await collection.bulkWrite(updates, { ordered: false });
    updated += updates.length;
    updates.length = 0;
  };

  for await (const document of cursor) {
    scanned += 1;
    const { nextValue, changed, migratedCount } = await replaceCloudinaryUrlsInValue(document, migrateUrl, cache);

    if (changed) {
      updates.push({
        replaceOne: {
          filter: { _id: document._id },
          replacement: nextValue,
        },
      });
    }

    migratedAssets += migratedCount;

    if (updates.length >= BATCH_SIZE) {
      await flush();
    }
  }

  await flush();

  return { scanned, updated, migratedAssets };
};

const main = async () => {
  const connection = await mongoose.createConnection(MONGODB_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 30000,
  }).asPromise();

  const urlCache = new Map();

  try {
    const db = connection.db;
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((entry) => entry.name).filter((name) => !shouldSkipCollection(name));

    console.log(`Connected to ${DB_NAME}. Scanning ${collectionNames.length} collections for Cloudinary URLs from ${OLD_CLOUD_NAME}...`);

    for (const collectionName of collectionNames) {
      const collection = db.collection(collectionName);
      const summary = await migrateCollection(
        collection,
        uploadRemoteImageToCloudinary,
        urlCache,
      );

      if (summary.updated > 0 || summary.migratedAssets > 0) {
        console.log(`${collectionName}: scanned ${summary.scanned}, updated ${summary.updated}, migrated ${summary.migratedAssets} unique assets`);
      }
    }

    console.log(`Migration complete. Total unique assets copied: ${urlCache.size}`);
  } finally {
    await connection.close();
  }
};

main().catch((error) => {
  console.error('Cloudinary migration failed:', error);
  process.exitCode = 1;
});
