/**
 * One-off, idempotent: makes sure a city exists in a state, and (optionally) takes a country-wide location out of
 * its state. The same two things an admin does in Pricing > Service Location, for when the panel is not at hand.
 * Nothing is written without --apply.
 *
 *   node scripts/ensureStateCity.js --city=Bengaluru --state=Karnataka --lat=12.9716 --lng=77.5946 --detach=India
 *   node scripts/ensureStateCity.js --city=Bengaluru --state=Karnataka --lat=12.9716 --lng=77.5946 --detach=India --apply
 *
 *   --city / --state / --lat / --lng   the city to have (created when no city of that name + state exists yet)
 *   --detach=<name>                     a location (for example "India") whose state is cleared, so it no longer
 *                                       puts every record in one state. Optional.
 *
 * Run it from the Backend folder (it reads .env).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const apply = process.argv.includes('--apply');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || '';

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  const cityName = arg('city');
  const stateName = arg('state');
  const lat = Number(arg('lat'));
  const lng = Number(arg('lng'));
  const detach = arg('detach');
  if (!cityName || !stateName || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('usage: --city=<name> --state=<name> --lat=<lat> --lng=<lng> [--detach=<name>] [--apply]');
  }

  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi' });
  const { ServiceLocation } = await import('../src/modules/taxi/admin/models/ServiceLocation.js');
  const { State } = await import('../src/modules/taxi/admin/models/State.js');
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  const state = await State.findOne({ name: new RegExp(`^${stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (!state) throw new Error(`no state named "${stateName}" (create it first in Admin Management > States)`);

  const existing = await ServiceLocation.findOne({ name: new RegExp(`^${cityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), state_id: state._id }).lean();
  if (existing) {
    console.log(`City "${cityName}" already exists in ${state.name} (${existing._id}). Nothing to create.`);
  } else {
    console.log(`Will create city "${cityName}" in ${state.name} at ${lat}, ${lng}.`);
    if (apply) {
      const created = await ServiceLocation.create({
        name: cityName,
        service_location_name: cityName,
        country: 'India',
        state_id: state._id,
        latitude: lat,
        longitude: lng,
        location: { type: 'Point', coordinates: [lng, lat] },
        status: 'active',
        active: true,
      });
      console.log(`Created ${created._id}.`);
    }
  }

  if (detach) {
    const matches = await ServiceLocation.find({ name: new RegExp(`^${detach.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('name state_id').lean();
    if (!matches.length) console.log(`No location named "${detach}" to detach.`);
    for (const loc of matches) {
      if (!loc.state_id) {
        console.log(`"${loc.name}" (${loc._id}) already has no state.`);
        continue;
      }
      console.log(`Will clear the state of "${loc.name}" (${loc._id}).`);
      if (apply) await ServiceLocation.updateOne({ _id: loc._id }, { $set: { state_id: null } });
    }
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
