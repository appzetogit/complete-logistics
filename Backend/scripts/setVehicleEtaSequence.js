/**
 * Sets the per-module pickup ETA and list sequence on every vehicle type.
 *
 * These are display values the rider sees, so they are listed here explicitly
 * rather than derived — edit the table below and re-run to change them.
 *
 * Vehicles are matched by name (case-insensitive, trimmed). A name in the
 * table that matches nothing is reported rather than silently skipped, so a
 * renamed vehicle cannot quietly keep stale values.
 *
 * Usage (dry run — prints the diff, writes nothing):
 *   node scripts/setVehicleEtaSequence.js
 *
 * Usage (apply, after backing up current values):
 *   node scripts/setVehicleEtaSequence.js --apply
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

/**
 * Passenger list: ordered smallest/cheapest vehicle first, which is the
 * convention riders expect. The existing Bike/Small auto/Big Auto numbering
 * (1/2/3) is preserved; the five unnumbered vehicles are appended in
 * increasing capacity.
 */
const TAXI = [
  { name: 'Bike', sequence: 1, eta: 3 },
  { name: 'Small auto', sequence: 2, eta: 4 },
  { name: 'Big Auto', sequence: 3, eta: 5 },
  { name: 'E-Richshaw', sequence: 4, eta: 5 },
  { name: 'Mini Car', sequence: 5, eta: 5 },
  { name: 'EV/ CNG Cars', sequence: 6, eta: 6 },
  { name: 'Sedan', sequence: 7, eta: 6 },
  { name: '7 Seater (Bolero/Scorpio)', sequence: 8, eta: 8 },
];

/**
 * Goods list: same small-to-large convention. The existing relative order
 * (Pickup -> Small -> Medium -> Heavy) is kept; Bike Parcel, which had no
 * sequence, takes the front as the smallest option.
 */
const DELIVERY = [
  { name: 'Bike Parcel', sequence: 1, eta: 10 },
  { name: 'Pickup Carrier', sequence: 2, eta: 20 },
  { name: 'Small Trucks', sequence: 3, eta: 25 },
  { name: 'Medium Trucks', sequence: 4, eta: 30 },
  { name: 'Heavy Truck', sequence: 5, eta: 35 },
];

const norm = (value) => String(value || '').trim().toLowerCase();

const run = async () => {
  await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
  console.log(`Connected to ${DB_NAME}${APPLY ? '' : '   (DRY RUN — pass --apply to write)'}\n`);

  const collection = mongoose.connection.collection('taxivehicles');
  const docs = await collection.find({}).toArray();

  // Back up whatever is there now, so the change can be undone exactly.
  if (APPLY) {
    const snapshot = docs.map((d) => ({
      _id: String(d._id),
      name: d.name,
      taxi_sequence: d.taxi_sequence ?? 0,
      taxi_eta_minutes: d.taxi_eta_minutes ?? 0,
      delivery_sequence: d.delivery_sequence ?? 0,
      delivery_eta_minutes: d.delivery_eta_minutes ?? 0,
    }));
    const file = path.resolve(__dirname, `../eta-sequence-backup-${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(snapshot, null, 2));
    console.log(`Previous values saved to ${file}\n`);
  }

  const byName = new Map(docs.map((d) => [norm(d.name), d]));
  const missing = [];
  let updated = 0;

  const applyTable = async (table, seqField, etaField, label) => {
    console.log(`--- ${label} ---`);
    for (const row of table) {
      const doc = byName.get(norm(row.name));
      if (!doc) {
        missing.push(row.name);
        console.log(`  ${row.name.padEnd(28)} NOT FOUND`);
        continue;
      }

      const beforeSeq = doc[seqField] ?? 0;
      const beforeEta = doc[etaField] ?? 0;
      console.log(
        `  ${String(doc.name).padEnd(28)} seq ${String(beforeSeq).padStart(2)} -> ${String(row.sequence).padStart(2)}` +
        `   eta ${String(beforeEta).padStart(2)} -> ${String(row.eta).padStart(2)} min`,
      );

      if (APPLY) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { [seqField]: row.sequence, [etaField]: row.eta } },
        );
      }
      updated += 1;
    }
    console.log('');
  };

  await applyTable(TAXI, 'taxi_sequence', 'taxi_eta_minutes', 'PASSENGER');
  await applyTable(DELIVERY, 'delivery_sequence', 'delivery_eta_minutes', 'GOODS');

  console.log(`Vehicles ${APPLY ? 'updated' : 'to update'}: ${updated}`);
  if (missing.length) {
    console.log(`Not matched by name: ${missing.join(', ')}`);
  }
  if (!APPLY) {
    console.log('\nDry run only — re-run with --apply to write.');
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
