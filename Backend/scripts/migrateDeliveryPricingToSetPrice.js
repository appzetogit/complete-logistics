/**
 * Copies goods (delivery) prices from the Vehicle Type page into Pricing >
 * Set Price, so the fare comes from Set Price from now on.
 *
 * For every delivery/both vehicle that still has pricing on the vehicle type
 * (base price, base distance, distance price, service tax) and no "All Zones"
 * delivery Set Price yet, this creates one delivery Set Price row with those
 * values. Payment methods, commissions and cancellation fees are copied from
 * the vehicle's existing 'both' Set Price when there is one, so the migration
 * changes the fare and nothing else. Nothing is deleted or modified; the old
 * vehicle values stay as the fallback. Safe to run again (it skips vehicles
 * that already have the row).
 *
 * Usage (dry run: prints the plan, writes nothing):
 *   node scripts/migrateDeliveryPricingToSetPrice.js
 *
 * Usage (apply; also writes a file listing the created ids so it can be undone):
 *   node scripts/migrateDeliveryPricingToSetPrice.js --apply
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = String(process.env.MONGODB_URI || '').trim();
const DB_NAME = String(process.env.MONGODB_DB_NAME || 'appzeto_taxi').trim();

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in Backend/.env');
}

const { Vehicle } = await import('../src/modules/taxi/admin/models/Vehicle.js');
const { SetPrice } = await import('../src/modules/taxi/admin/models/SetPrice.js');
const { planDeliveryPricingMigration } = await import('../src/modules/taxi/services/deliveryPricingMigration.js');

try {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${mongoose.connection.host}/${DB_NAME}  (${APPLY ? 'APPLY' : 'dry run'})`);

  const [vehicles, setPrices] = await Promise.all([Vehicle.find().lean(), SetPrice.find().lean()]);
  const plan = planDeliveryPricingMigration({ vehicles, setPrices });

  for (const item of plan) {
    const detail = item.row
      ? `base ${item.row.base_price} for ${item.row.base_distance} km, then ${item.row.price_per_distance}/km, tax ${item.row.service_tax}%`
      : '';
    console.log(`${item.action === 'create' ? 'CREATE' : 'skip  '}  ${item.name.padEnd(28)} ${detail}  (${item.reason})`);
  }

  const toCreate = plan.filter((item) => item.action === 'create');
  console.log(`\n${toCreate.length} to create, ${plan.length - toCreate.length} skipped.`);

  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to create them.');
  } else if (toCreate.length > 0) {
    const created = await SetPrice.insertMany(toCreate.map((item) => item.row));
    const file = path.resolve(__dirname, `../delivery-pricing-migration-${Date.now()}.json`);
    await fs.writeFile(
      file,
      JSON.stringify({ createdSetPriceIds: created.map((row) => String(row._id)) }, null, 2),
    );
    console.log(`Created ${created.length} Set Price rows. Undo list written to ${file}`);
  }
} finally {
  await mongoose.disconnect();
}
