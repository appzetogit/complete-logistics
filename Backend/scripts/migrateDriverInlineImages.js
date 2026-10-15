/**
 * One-time: drivers whose profile photo, documents, daily selfie or vehicle photo are still stored as base64
 * (data:image/...) get them written to /uploads as files; only the URLs stay in Mongo. Nothing is lost: a picture
 * that cannot be converted (not a JPEG / PNG / WebP) is left as it is and listed.
 *
 *   node scripts/migrateDriverInlineImages.js           dry run: lists the drivers and the size saved, changes nothing
 *   node scripts/migrateDriverInlineImages.js --apply   writes the files and updates the drivers
 *
 * Safe to run again (drivers already converted are skipped) and while the app is live. Run it on the server, so
 * the files land in the same uploads folder the site serves (UPLOAD_DIR in Backend/.env).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();
if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const { env } = await import('../src/config/env.js');
const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
const { driverHasInlineImages, healDriverInlineImages } = await import('../src/modules/taxi/driver/services/driverImageService.js');

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

try {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${mongoose.connection.host}/${DB_NAME}  (${APPLY ? 'APPLY' : 'dry run'})`);
  console.log(`Files go to ${env.uploads.dir}`);
  console.log(`URLs start with ${env.uploads.publicBaseUrl}/`);
  if (!/^https?:\/\//i.test(env.uploads.publicBaseUrl)) {
    console.log('WARNING: PUBLIC_BACKEND_URL is not set in .env, so the URLs would be relative. Set it first.');
  }
  console.log('');

  const cursor = Driver.find({})
    .select('name phone profileImage profile_picture vehicleImage onlineSelfie documents')
    .lean()
    .cursor();

  let drivers = 0;
  let converted = 0;
  let before = 0;
  let after = 0;
  for await (const driver of cursor) {
    if (!driverHasInlineImages(driver)) continue;
    drivers += 1;
    // Dry run: no file is written and Mongo is untouched; the sizes are measured only.
    const result = await healDriverInlineImages(driver, { apply: APPLY });
    before += result.bytesBefore;
    after += result.bytesAfter;
    if (Object.keys(result.$set).length) converted += 1;
    console.log(`${String(driver._id)}  ${driver.name || ''} ${driver.phone || ''}  ${mb(result.bytesBefore)} -> ${mb(result.bytesAfter)}  [${Object.keys(result.$set).join(', ')}]`);
    for (const failure of result.failures) console.log(`   left as is: ${failure}`);
  }

  console.log(`\n${drivers} driver(s) with base64 images; ${mb(before)} -> ${mb(after)} in total.`);
  console.log(APPLY ? `Converted ${converted} driver(s).` : 'Dry run only. Add --apply to save the changes.');
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
