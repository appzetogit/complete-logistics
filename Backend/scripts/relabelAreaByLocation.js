/**
 * One-off, idempotent: puts drivers and rides into the right state for the state-wise admin view, by where
 * they are. Only the LABEL `area_location_id` is changed (it feeds the admin's state view and nothing else): dispatch,
 * pricing and a driver's `service_location_id` are never touched.
 *
 *   - driver: the nearest city that belongs to a state, from the driver's `location` (within --max-km)
 *   - ride:   the same, from the pickup point
 *   (riders are NOT state-wise: every admin sees every rider, so they are never touched here)
 *
 * Cities WITHOUT a state, and any city named "India" (the country-wide one), are never a target. Records with no
 * real location (never sent one: the placeholder default point), or no city within reach, are left as they are and
 * have to be set by hand in the admin panel. Nothing is written without --apply.
 *
 *   node scripts/relabelAreaByLocation.js                   dry run: counts per city
 *   node scripts/relabelAreaByLocation.js --apply           write
 *   node scripts/relabelAreaByLocation.js --max-km=300      how far a city may be (default 150)
 *   node scripts/relabelAreaByLocation.js --assign-city=Bengaluru --phones=9876543210,9123456780 [--apply]
 *       puts these drivers (by phone) into that city (a city that has a state), whatever their location says
 *   node scripts/relabelAreaByLocation.js --exclude=<id>,<id>   more locations that are never a target
 *
 * Run from the Backend folder (reads .env). Create each state's city first (Pricing > Service Location, with its state).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const apply = process.argv.includes('--apply');
const argValue = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] || '';
const maxKm = Number(argValue('max-km')) || 150;
const extraExcluded = new Set(argValue('exclude').split(',').map((v) => v.trim()).filter(Boolean));

const toRad = (deg) => (deg * Math.PI) / 180;
const distanceKm = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
// A real GPS point. [0,0] and the schema default (the centre of Indore, 75.8577 / 22.7196) are placeholders, not a place:
// every driver who never sent a location holds that default, so it must never decide a state.
const DEFAULT_POINT = [75.8577, 22.7196];
const isPoint = (c) => Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(Number(n))) && !(Number(c[0]) === 0 && Number(c[1]) === 0);
// a driver / ride point must also not be the placeholder; a CITY may of course sit anywhere (Indore's centre is that default)
const validPoint = (c) => isPoint(c) && !(Math.abs(Number(c[0]) - DEFAULT_POINT[0]) < 0.001 && Math.abs(Number(c[1]) - DEFAULT_POINT[1]) < 0.001);

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi' });
  const { ServiceLocation } = await import('../src/modules/taxi/admin/models/ServiceLocation.js');
  const { State } = await import('../src/modules/taxi/admin/models/State.js');
  const { Driver } = await import('../src/modules/taxi/driver/models/Driver.js');
  const { Ride } = await import('../src/modules/taxi/user/models/Ride.js');
  
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  const states = new Map((await State.find().select('name').lean()).map((s) => [String(s._id), s.name]));
  const allLocations = await ServiceLocation.find().select('name service_location_name state_id location').lean();
  const targets = allLocations
    .filter((l) => l.state_id && !extraExcluded.has(String(l._id)) && !/^india$/i.test(String(l.name || l.service_location_name || '').trim()) && isPoint(l.location?.coordinates))
    .map((l) => ({ id: String(l._id), name: l.name || l.service_location_name, state: states.get(String(l.state_id)) || '?', point: l.location.coordinates.map(Number) }));

  console.log(`Target cities (have a state, not "India"): ${targets.length}`);
  targets.forEach((t) => console.log(`  - ${t.name} (${t.state})`));
  if (!targets.length) {
    console.log('No target city. Create the cities (with their state) first.');
    await mongoose.disconnect();
    return;
  }
  const nameOf = (id) => {
    const found = allLocations.find((l) => String(l._id) === String(id));
    return found ? `${found.name || found.service_location_name}${found.state_id ? '' : ' [no state]'}` : String(id || 'none');
  };
  const nearest = (point) => {
    let best = null;
    for (const t of targets) {
      const km = distanceKm(point, t.point);
      if (km <= maxKm && (!best || km < best.km)) best = { ...t, km };
    }
    return best;
  };

  const relabel = async (label, Model, pointOf, extraSelect = '') => {
    const moves = new Map();
    let changed = 0;
    let skipped = 0;
    const cursor = Model.find().select(`area_location_id ${extraSelect}`).lean().cursor();
    for await (const doc of cursor) {
      const point = pointOf(doc);
      if (!validPoint(point)) { skipped += 1; continue; }
      const target = nearest(point.map(Number));
      if (!target) { skipped += 1; continue; }
      if (String(doc.area_location_id || '') === target.id) continue;
      const key = `${nameOf(doc.area_location_id)}  ->  ${target.name} (${target.state})`;
      moves.set(key, (moves.get(key) || 0) + 1);
      changed += 1;
      if (apply) await Model.updateOne({ _id: doc._id }, { $set: { area_location_id: new mongoose.Types.ObjectId(target.id) } });
    }
    console.log(`\n${label}: ${changed} to relabel, ${skipped} left (no point or no city within ${maxKm} km)`);
    [...moves.entries()].sort().forEach(([key, n]) => console.log(`  ${n}\t${key}`));
  };

  // ---- by hand: --assign-city=<name> --phones=<a,b,c> (drivers with that phone) ----
  const assignCity = argValue('assign-city');
  if (assignCity) {
    const city = targets.find((t) => t.name.toLowerCase() === assignCity.toLowerCase());
    if (!city) throw new Error(`no target city named "${assignCity}" (has a state, not India). Cities: ${targets.map((t) => t.name).join(', ')}`);
    const phones = argValue('phones').split(',').map((p) => p.trim()).filter(Boolean);
    if (!phones.length) throw new Error('--phones=<a,b,c> is required with --assign-city');
    const cityId = new mongoose.Types.ObjectId(city.id);
    for (const [label, Model] of [['Drivers', Driver]]) {
      const found = await Model.find({ phone: { $in: phones } }).select('name phone area_location_id').lean();
      console.log(`
${label} to put into ${city.name} (${city.state}): ${found.length} of ${phones.length} phones matched`);
      found.forEach((d) => console.log(`  ${d.name || '-'}  ${d.phone}  (now: ${nameOf(d.area_location_id)})`));
      if (apply && found.length) await Model.updateMany({ _id: { $in: found.map((d) => d._id) } }, { $set: { area_location_id: cityId } });
    }
    await mongoose.disconnect();
    return;
  }

  await relabel('Drivers', Driver, (d) => d.location?.coordinates, 'location');
  // drivers that still sit in a state-less city after this: they need a city by hand
  const statelessIds = new Set(allLocations.filter((l) => !l.state_id).map((l) => String(l._id)));
  const unplaced = (await Driver.find().select('name phone area_location_id location').lean()).filter((d) => !d.area_location_id || statelessIds.has(String(d.area_location_id)));
  const willMove = (d) => validPoint(d.location?.coordinates) && nearest(d.location.coordinates.map(Number));
  const needHand = unplaced.filter((d) => !willMove(d));
  console.log(`
Drivers that cannot be placed by location (no real GPS point, or no city near): ${needHand.length}`);
  needHand.slice(0, 60).forEach((d) => console.log(`  ${d.name || '-'}  ${d.phone || ''}`));
  if (needHand.length) console.log('  -> put them in a city with: --assign-city=<city> --phones=<phone,phone,...>');

  await relabel('Rides', Ride, (r) => r.pickupLocation?.coordinates, 'pickupLocation');

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
