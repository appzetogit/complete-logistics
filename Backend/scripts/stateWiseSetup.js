/**
 * State-wise admin view: one-time setup helpers. Safe to re-run. Nothing is written without --apply.
 *
 *   node scripts/stateWiseSetup.js seed-states [--apply]
 *       Adds the states and union territories of India (matched by code, existing ones are left alone).
 *
 *   node scripts/stateWiseSetup.js map-locations --map "Indore=MP,Pune=MH,Mumbai=MH" [--apply]
 *       Puts service locations (cities) into states. Without --map it only lists the cities that have no state.
 *
 *   node scripts/stateWiseSetup.js backfill [--apply]
 *       Labels rides, drivers and riders that have no city yet (rides/drivers/riders: area_location_id) from their
 *       service location, zone or coordinates. Rider = city of their latest labelled ride.
 *
 * Run it from the Backend folder (it reads .env): dry run first, then again with --apply.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const [command, ...rest] = process.argv.slice(2);
const apply = rest.includes('--apply');
const optionValue = (name) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : '';
};

const INDIA_STATES = [
  ['Andhra Pradesh', 'AP'], ['Arunachal Pradesh', 'AR'], ['Assam', 'AS'], ['Bihar', 'BR'], ['Chhattisgarh', 'CG'],
  ['Goa', 'GA'], ['Gujarat', 'GJ'], ['Haryana', 'HR'], ['Himachal Pradesh', 'HP'], ['Jharkhand', 'JH'],
  ['Karnataka', 'KA'], ['Kerala', 'KL'], ['Madhya Pradesh', 'MP'], ['Maharashtra', 'MH'], ['Manipur', 'MN'],
  ['Meghalaya', 'ML'], ['Mizoram', 'MZ'], ['Nagaland', 'NL'], ['Odisha', 'OD'], ['Punjab', 'PB'],
  ['Rajasthan', 'RJ'], ['Sikkim', 'SK'], ['Tamil Nadu', 'TN'], ['Telangana', 'TS'], ['Tripura', 'TR'],
  ['Uttar Pradesh', 'UP'], ['Uttarakhand', 'UK'], ['West Bengal', 'WB'],
  ['Andaman and Nicobar Islands', 'AN'], ['Chandigarh', 'CH'], ['Dadra and Nagar Haveli and Daman and Diu', 'DD'],
  ['Delhi', 'DL'], ['Jammu and Kashmir', 'JK'], ['Ladakh', 'LA'], ['Lakshadweep', 'LD'], ['Puducherry', 'PY'],
];

const log = (...args) => console.log(...args);

const seedStates = async ({ State }) => {
  const existing = new Set((await State.find().select('code').lean()).map((row) => row.code));
  const missing = INDIA_STATES.filter(([, code]) => !existing.has(code));
  log(`${INDIA_STATES.length - missing.length} states already there, ${missing.length} to add.`);
  if (apply && missing.length) {
    await State.insertMany(missing.map(([name, code]) => ({ name, code })));
    log('Added.');
  }
};

const mapLocations = async ({ State, ServiceLocation }) => {
  const pairs = String(optionValue('--map') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const states = await State.find().lean();
  const byCode = new Map(states.map((row) => [row.code, row]));

  if (!pairs.length) {
    const unmapped = await ServiceLocation.find({ $or: [{ state_id: null }, { state_id: { $exists: false } }] }).select('name').lean();
    log(`${unmapped.length} service locations without a state:`);
    unmapped.forEach((row) => log(`  - ${row.name}`));
    log('Map them with:  --map "CityName=MP,OtherCity=MH" --apply');
    return;
  }

  for (const pair of pairs) {
    const [cityName, code] = pair.split('=').map((part) => String(part || '').trim());
    const state = byCode.get(code.toUpperCase());
    const city = await ServiceLocation.findOne({ $or: [{ name: cityName }, { service_location_name: cityName }] });
    if (!state || !city) {
      log(`  skip "${pair}": ${!state ? `no state with code ${code}` : `no service location named ${cityName}`}`);
      continue;
    }
    log(`  ${city.name} -> ${state.name}${apply ? '' : '  (dry run)'}`);
    if (apply) await ServiceLocation.updateOne({ _id: city._id }, { $set: { state_id: state._id } });
  }
};

const backfill = async ({ Ride, Driver, User, Zone }) => {
  const { resolveAreaLocationId } = await import('../src/modules/taxi/services/serviceAreaService.js');
  const cache = new Map();
  const resolveCached = async (args) => {
    const key = `${args.serviceLocationId || ''}|${args.zoneId || ''}|${(args.coordinates || []).map((n) => Number(n).toFixed(3)).join(',')}`;
    if (!cache.has(key)) cache.set(key, await resolveAreaLocationId(args).catch(() => null));
    return cache.get(key);
  };

  const run = async (label, Model, filter, pick) => {
    const cursor = Model.find(filter).lean().cursor();
    let seen = 0;
    let resolved = 0;
    let batch = [];
    const flush = async () => {
      if (apply && batch.length) await Model.bulkWrite(batch, { ordered: false });
      batch = [];
    };
    for await (const doc of cursor) {
      seen += 1;
      const areaId = await pick(doc);
      if (areaId) {
        resolved += 1;
        batch.push({ updateOne: { filter: { _id: doc._id, area_location_id: null }, update: { $set: { area_location_id: areaId } } } });
        if (batch.length >= 500) await flush();
      }
    }
    await flush();
    log(`${label}: ${seen} without a city, ${resolved} can be labelled, ${seen - resolved} unresolved.${apply ? '' : '  (dry run)'}`);
  };

  const noArea = { $or: [{ area_location_id: null }, { area_location_id: { $exists: false } }] };

  await run('rides', Ride, noArea, (ride) => resolveCached({
    coordinates: ride.pickupLocation?.coordinates,
    serviceLocationId: ride.service_location_id,
  }));

  await run('drivers', Driver, noArea, async (driver) => {
    if (driver.service_location_id) return driver.service_location_id;
    if (driver.zoneId) {
      const zone = await Zone.findById(driver.zoneId).select('service_location_id').lean();
      if (zone?.service_location_id) return zone.service_location_id;
    }
    return resolveCached({ coordinates: driver.location?.coordinates });
  });

  await run('riders', User, noArea, async (user) => {
    const latest = await Ride.findOne({ userId: user._id, area_location_id: { $ne: null } })
      .sort({ createdAt: -1 })
      .select('area_location_id')
      .lean();
    return latest?.area_location_id || null;
  });
};

const main = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!['seed-states', 'map-locations', 'backfill'].includes(command)) {
    log('Usage: node scripts/stateWiseSetup.js <seed-states|map-locations|backfill> [--apply]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'appzeto_taxi' });
  log(apply ? 'APPLYING changes.' : 'Dry run: nothing is written. Add --apply to write.');

  const models = {
    State: (await import('../src/modules/taxi/admin/models/State.js')).State,
    ServiceLocation: (await import('../src/modules/taxi/admin/models/ServiceLocation.js')).ServiceLocation,
    Ride: (await import('../src/modules/taxi/user/models/Ride.js')).Ride,
    Driver: (await import('../src/modules/taxi/driver/models/Driver.js')).Driver,
    User: (await import('../src/modules/taxi/user/models/User.js')).User,
    Zone: (await import('../src/modules/taxi/driver/models/Zone.js')).Zone,
  };

  if (command === 'seed-states') await seedStates(models);
  if (command === 'map-locations') await mapLocations(models);
  if (command === 'backfill') await backfill(models);
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
