/**
 * One-off, idempotent: copies a driver's vehicle year into the canonical `vehicleYear` field from wherever it ended up
 * (onboarding.vehicle.year from app signup and admin edit, onboarding.vehicleYear from admin create). Drivers that
 * already have a year are never touched. Nothing is written without --apply.
 *
 *   node scripts/backfillVehicleYear.js            dry run: counts and a few examples
 *   node scripts/backfillVehicleYear.js --apply    write
 *
 * Run it from the Backend folder (it reads .env), after the code that writes `vehicleYear` is deployed.
 * The collection is the one of the Driver model (taxidrivers), not "drivers".
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const apply = process.argv.includes('--apply');

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi' });
  const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');

  console.log(`Database: ${mongoose.connection.name}, collection: ${Driver.collection.collectionName}`);
  console.log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  const currentYear = new Date().getFullYear();
  const total = await Driver.countDocuments();
  const cursor = Driver.find({
    $or: [{ vehicleYear: { $exists: false } }, { vehicleYear: '' }, { vehicleYear: null }],
  })
    .select('onboarding.vehicle.year onboarding.vehicleYear')
    .lean()
    .cursor();

  let scanned = 0;
  let fillable = 0;
  let updated = 0;
  const examples = [];

  for await (const driver of cursor) {
    scanned += 1;
    const year = String(driver.onboarding?.vehicle?.year || driver.onboarding?.vehicleYear || '').trim();
    if (!/^\d{4}$/.test(year) || Number(year) < 1980 || Number(year) > currentYear) continue;
    fillable += 1;
    if (examples.length < 3) examples.push(`${driver._id} -> ${year}`);
    if (!apply) continue;
    // only while it is still empty, so a year typed in the meantime is never overwritten
    const result = await Driver.updateOne(
      { _id: driver._id, $or: [{ vehicleYear: { $exists: false } }, { vehicleYear: '' }, { vehicleYear: null }] },
      { $set: { vehicleYear: year } },
    );
    updated += result.modifiedCount;
  }

  console.log(JSON.stringify({ drivers: total, withoutYear: scanned, canBeFilled: fillable, ...(apply ? { updated } : {}) }));
  examples.forEach((line) => console.log(`  e.g. ${line}`));
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
