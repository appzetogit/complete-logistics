// End-to-end booking load: user books -> dispatch matches -> drivers are told.
//
// Measures the whole chain, not just ride insertion, because dispatch is the
// expensive half: each booking runs a zone lookup, a geo query for nearby
// drivers, and a fan-out emit.
//
// Ride creation is rate limited to 10 per user per 10 minutes, so this needs at
// least one test user per ten rides.
//
// Everything it creates is marked and removed on exit, including on failure.
// Test drivers and riders sit in a corner of the zone far from any real driver,
// so real accounts are never matched or notified.
//
//   node scripts/loadTestBooking.js --users=60 --drivers=100 --rides=300
import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/taxi/services/tokenService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const userCount = arg('users', 60);
const driverCount = arg('drivers', 100);
const rideCount = arg('rides', 300);
const concurrency = arg('concurrency', 20);
const baseUrl = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'https://udanxpress.com';

const MARKER = 'loadtestBooking';
// Far south-west inside the Muzaffarnagar circle (centre 77.6777,29.4404 r=32.5km)
// and roughly 30km from the nearest real online driver, well outside the 3km
// match radius, so no real account can be pulled into a test dispatch.
const ORIGIN = [77.5, 29.3];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (spread) => (Math.random() - 0.5) * spread;
const pct = (values, p) => (values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((p / 100) * values.length))]
  : 0);

const cleanup = async (db, userIds) => {
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const rides = await db.collection('taxirides')
    .find({ userId: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  const rideIds = rides.map((r) => r._id);

  const removed = {
    rides: (await db.collection('taxirides').deleteMany({ _id: { $in: rideIds } })).deletedCount,
    deliveries: (await db.collection('deliveries').deleteMany({ rideId: { $in: rideIds } })).deletedCount,
    drivers: (await db.collection('taxidrivers').deleteMany({ [MARKER]: true })).deletedCount,
    users: (await db.collection('taxiusers').deleteMany({ [MARKER]: true })).deletedCount,
  };
  console.log(`\ncleaned up ${JSON.stringify(removed)}`);
};

const run = async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  const { db } = mongoose.connection;

  const zone = await db.collection('taxizones').findOne({ name: 'Muzaffarnagar' });
  const vehicle = await db.collection('taxivehicles').findOne({ name: 'SEDAN CAB' });
  if (!zone || !vehicle) throw new Error('zone or vehicle type missing');

  console.log(`zone=${zone._id} vehicle=${vehicle._id}`);
  console.log(`creating ${driverCount} drivers and ${userCount} riders near ${ORIGIN}...`);

  const driverDocs = Array.from({ length: driverCount }, (_, i) => ({
    name: `${MARKER}-driver-${i}`,
    phone: `8${String(200000000 + i)}`,
    isOnline: true,
    isOnRide: false,
    approve: true,
    status: 'active',
    vehicleTypeId: vehicle._id,
    vehicleType: 'car',
    vehicleIconType: 'car',
    zoneId: zone._id,
    service_location_id: zone.service_location_id,
    location: { type: 'Point', coordinates: [ORIGIN[0] + jitter(0.01), ORIGIN[1] + jitter(0.01)] },
    [MARKER]: true,
    createdAt: new Date(),
  }));
  const driverIds = Object.values(
    (await db.collection('taxidrivers').insertMany(driverDocs)).insertedIds,
  ).map(String);

  const userDocs = Array.from({ length: userCount }, (_, i) => ({
    name: `${MARKER}-user-${i}`,
    phone: `7${String(300000000 + i)}`,
    isActive: true,
    deletedAt: null,
    [MARKER]: true,
    createdAt: new Date(),
  }));
  const userIds = Object.values(
    (await db.collection('taxiusers').insertMany(userDocs)).insertedIds,
  ).map(String);

  // Drivers must be connected for dispatch to have somewhere to deliver.
  const notified = { count: 0, latencies: [] };
  const rideSentAt = new Map();
  const sockets = [];
  const socketUrl = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

  await Promise.all(driverIds.map((id) => new Promise((resolve) => {
    const token = signAccessToken({ sub: id, role: 'driver' });
    const ws = new WebSocket(socketUrl, { handshakeTimeout: 20000 });
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    ws.on('message', (raw) => {
      const frame = raw.toString();
      if (frame.startsWith('0{')) ws.send(`40${JSON.stringify({ token })}`);
      else if (frame.startsWith('40')) { sockets.push(ws); done(); }
      else if (frame.startsWith('44')) done();
      else if (frame === '2') ws.send('3');
      else if (frame.startsWith('42["rideRequest"')) {
        notified.count += 1;
        try {
          const rideId = String(JSON.parse(frame.slice(2))[1]?.rideId || '');
          const sentAt = rideSentAt.get(rideId);
          if (sentAt) notified.latencies.push(Date.now() - sentAt);
        } catch {}
      }
    });
    ws.on('error', done);
    ws.on('close', done);
  })));

  console.log(`${sockets.length} drivers online and listening\n`);

  const stats = { ok: 0, failed: 0, rateLimited: 0, latencies: [], codes: {} };
  const startedAt = Date.now();
  let issued = 0;

  const worker = async () => {
    for (;;) {
      const index = issued;
      issued += 1;
      if (index >= rideCount) return;

      const token = signAccessToken({ sub: userIds[index % userIds.length], role: 'user' });
      const body = {
        pickup: [ORIGIN[0] + jitter(0.008), ORIGIN[1] + jitter(0.008)],
        drop: [ORIGIN[0] + jitter(0.05), ORIGIN[1] + jitter(0.05)],
        pickupAddress: 'load test pickup',
        dropAddress: 'load test drop',
        fare: 150,
        estimatedDistanceMeters: 5000,
        estimatedDurationMinutes: 15,
        vehicleTypeId: String(vehicle._id),
        serviceType: 'ride',
        paymentMethod: 'cash',
        zone_id: String(zone._id),
        service_location_id: String(zone.service_location_id),
      };

      const startedRequestAt = Date.now();
      try {
        const response = await fetch(`${baseUrl}/api/v1/rides`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });

        stats.latencies.push(Date.now() - startedRequestAt);
        stats.codes[response.status] = (stats.codes[response.status] || 0) + 1;

        if (response.ok) {
          stats.ok += 1;
          const payload = await response.json().catch(() => null);
          const rideId = payload?.data?.ride?._id || payload?.data?._id;
          if (rideId) rideSentAt.set(String(rideId), startedRequestAt);
        } else if (response.status === 429) {
          stats.rateLimited += 1;
        } else {
          stats.failed += 1;
        }
      } catch {
        stats.failed += 1;
      }
    }
  };

  console.log(`booking ${rideCount} rides at concurrency ${concurrency}...`);
  await Promise.all(Array.from({ length: concurrency }, worker));
  // Measure booking throughput over the booking window only -- the settle wait
  // below is for dispatch fan-out and would understate the rate.
  const elapsed = (Date.now() - startedAt) / 1000;
  await sleep(6000);
  console.log(`\nrides created    ${stats.ok} / ${rideCount}  (${(stats.ok / elapsed).toFixed(1)}/s)`);
  console.log(`rate limited     ${stats.rateLimited}`);
  console.log(`failed           ${stats.failed}`);
  console.log(`status codes     ${JSON.stringify(stats.codes)}`);
  console.log(`create ms        p50=${pct(stats.latencies, 50)} p95=${pct(stats.latencies, 95)} max=${pct(stats.latencies, 100)}`);
  console.log(`driver notifies  ${notified.count}  (${(notified.count / Math.max(1, stats.ok)).toFixed(1)} per ride)`);
  console.log(`notify ms        p50=${pct(notified.latencies, 50)} p95=${pct(notified.latencies, 95)}`);

  for (const ws of sockets) ws.close();
  await cleanup(db, userIds);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (error) => {
  console.error(error);
  try {
    const { db } = mongoose.connection;
    const stale = await db.collection('taxiusers')
      .find({ [MARKER]: true }, { projection: { _id: 1 } })
      .toArray();
    await cleanup(db, stale.map((u) => String(u._id)));
  } catch {}
  process.exit(1);
});
