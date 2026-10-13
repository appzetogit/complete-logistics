// Find catalog and driver vehicle data that is wrong or inconsistent, and optionally fix what can be fixed safely.
//
//   node scripts/reportVehicleDataIssues.js           report only (changes nothing)
//   node scripts/reportVehicleDataIssues.js --apply   align each driver's vehicleType / vehicleIconType with the
//                                                     catalog vehicle they are assigned to
//
// Reported but never changed automatically (fix them in the admin panel):
//   - vehicle type names that look like typos (e.g. "RENTOL TEXI")
//   - driver make / model / colour values that look like test data (e.g. "bmw" for a bike, "gvfr", "truvck")
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

const APPLY = process.argv.includes('--apply');

const NAME_TYPOS = [/\btexi\b/i, /\btaxy\b/i, /\btruvck\b/i, /\btruk\b/i, /\bscooty\b/i];
// Short values with no vowel, keyboard mashes and obvious placeholders.
const looksLikeJunk = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^(test|testing|abc|xyz|asdf|qwerty|na|n\/a|none|null|undefined|-+|\.+)$/i.test(text)) return true;
  if (/^[^aeiou\d\s]{4,}$/i.test(text)) return true; // e.g. "gvfr"
  return NAME_TYPOS.some((pattern) => pattern.test(text));
};

// Same rule the backend uses for a driver's generic vehicle type.
const genericVehicleType = (vehicle) => {
  const text = String(vehicle?.icon_types || vehicle?.name || '').trim().toLowerCase();
  if (text.includes('bike') || text.includes('scooter')) return 'bike';
  if (text.includes('auto') || text.includes('rickshaw')) return 'auto';
  return 'car';
};

const run = async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  const { db } = mongoose.connection;

  const vehicles = await db.collection('taxivehicles').find({}, { projection: { name: 1, icon_types: 1 } }).toArray()
    .catch(() => []);
  const vehicleById = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle]));

  console.log(`\n== Vehicle types (${vehicles.length})`);
  for (const vehicle of vehicles) {
    if (NAME_TYPOS.some((pattern) => pattern.test(String(vehicle.name || '')))) {
      console.log(`  name typo?  ${vehicle._id}  "${vehicle.name}"`);
    }
  }

  const drivers = await db.collection('taxidrivers').find(
    { deletedAt: null },
    { projection: { name: 1, phone: 1, vehicleTypeId: 1, vehicleType: 1, vehicleIconType: 1, vehicleMake: 1, vehicleModel: 1, vehicleColor: 1 } },
  ).toArray();

  console.log(`\n== Drivers (${drivers.length})`);
  let mismatched = 0;
  let fixed = 0;
  for (const driver of drivers) {
    const vehicle = driver.vehicleTypeId ? vehicleById.get(String(driver.vehicleTypeId)) : null;
    const label = `${driver._id}  ${driver.name || ''} (${driver.phone || ''})`;

    if (driver.vehicleTypeId && !vehicle) {
      console.log(`  unknown vehicle type  ${label}  vehicleTypeId=${driver.vehicleTypeId}`);
    }
    if (vehicle) {
      const expectedType = genericVehicleType(vehicle);
      const expectedIcon = vehicle.icon_types || expectedType;
      if (driver.vehicleType !== expectedType || driver.vehicleIconType !== expectedIcon) {
        mismatched += 1;
        console.log(`  type/icon mismatch  ${label}  has ${driver.vehicleType}/${driver.vehicleIconType}, catalog "${vehicle.name}" says ${expectedType}/${expectedIcon}`);
        if (APPLY) {
          await db.collection('taxidrivers').updateOne(
            { _id: driver._id },
            { $set: { vehicleType: expectedType, vehicleIconType: expectedIcon } },
          );
          fixed += 1;
        }
      }
    }
    for (const field of ['vehicleMake', 'vehicleModel', 'vehicleColor']) {
      if (looksLikeJunk(driver[field])) {
        console.log(`  check ${field}  ${label}  "${driver[field]}"`);
      }
    }
  }

  console.log(`\n${mismatched} driver(s) with a type/icon that disagrees with the catalog${APPLY ? `, ${fixed} fixed` : ' (run with --apply to fix)'}.`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
