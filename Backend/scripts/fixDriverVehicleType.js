/**
 * One-off, idempotent: fixes drivers whose coarse `vehicleType` (bike | auto | car) does not match their vehicle's icon
 * type. A "scooty" driver was stored as 'car', so the rider app drew a car for a scooter. The new value is worked out
 * from the driver's `vehicleIconType` exactly like new registrations (src/utils/genericVehicleType.js). Only
 * `vehicleType` is written. Nothing is written without --apply.
 *
 *   node scripts/fixDriverVehicleType.js            dry run: which drivers would change
 *   node scripts/fixDriverVehicleType.js --apply    write
 *
 * Run from the Backend folder (reads .env), after the code with the new mapping is deployed.
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
  const { genericVehicleTypeOf } = await import('../src/utils/genericVehicleType.js');

  console.log(`Database: ${mongoose.connection.name}`);
  console.log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  const drivers = await Driver.find({ vehicleIconType: { $nin: [null, ''] } }).select('name phone vehicleType vehicleIconType vehicleMake vehicleModel').lean();
  let changes = 0;
  for (const driver of drivers) {
    const next = genericVehicleTypeOf(driver.vehicleIconType);
    if (next === driver.vehicleType) continue;
    changes += 1;
    console.log(`  ${driver.name || '-'}  ${driver.phone || ''}  ${driver.vehicleMake || ''} ${driver.vehicleModel || ''}: vehicleType ${driver.vehicleType} -> ${next} (icon ${driver.vehicleIconType})`);
    if (apply) await Driver.updateOne({ _id: driver._id }, { $set: { vehicleType: next } });
  }
  console.log(`\n${drivers.length} drivers checked, ${changes} ${apply ? 'updated' : 'to update'}.`);
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
