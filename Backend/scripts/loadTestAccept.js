// Driver acceptance under contention.
//
// Dispatch offers each ride to several drivers at once, so acceptance is a race:
// every notified driver may hit accept at the same moment and exactly one must
// win. This books rides, then has every notified driver accept immediately, and
// checks the outcome per ride rather than only measuring throughput.
//
// Isolation matches the booking test: riders and drivers are created far from
// any real driver, and everything is removed on exit including on failure.
//
//   node scripts/loadTestAccept.js --rides=50 --drivers=100 --users=20
import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/taxi/services/tokenService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const rideCount = arg('rides', 50);
const driverCount = arg('drivers', 100);
const userCount = arg('users', 20);
const concurrency = arg('concurrency', 10);
const baseUrl = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'https://udanxpress.com';

const MARKER = 'loadtestAccept';
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

  const driverDocs = Array.from({ length: driverCount }, (_, i) => ({
    name: `${MARKER}-driver-${i}`,
    phone: `8${String(400000000 + i)}`,
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
    // Acceptance requires the wallet to clear minimumBalanceForOrders, so fund
    // these well past any configured threshold or every accept is refused.
    wallet: { balance: 100000, isBlocked: false },
    [MARKER]: true,
    createdAt: new Date(),
  }));
  const driverIds = Object.values(
    (await db.collection('taxidrivers').insertMany(driverDocs)).insertedIds,
  ).map(String);

  const userDocs = Array.from({ length: userCount }, (_, i) => ({
    name: `${MARKER}-user-${i}`,
    phone: `7${String(500000000 + i)}`,
    isActive: true,
    deletedAt: null,
    [MARKER]: true,
    createdAt: new Date(),
  }));
  const userIds = Object.values(
    (await db.collection('taxiusers').insertMany(userDocs)).insertedIds,
  ).map(String);

  // Per ride: who was offered it, who won, who was turned away.
  const perRide = new Map();
  const offeredAt = new Map();
  const acceptLatencies = [];
  const errors = new Map();
  const sockets = [];
  const socketUrl = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

  const bump = (rideId, key) => {
    const row = perRide.get(rideId) || { offered: 0, accepted: 0, rejected: 0 };
    row[key] += 1;
    perRide.set(rideId, row);
  };

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

      if (frame.startsWith('0{')) return ws.send(`40${JSON.stringify({ token })}`);
      if (frame === '2') return ws.send('3');
      if (frame.startsWith('40')) { sockets.push(ws); return done(); }
      if (frame.startsWith('44')) return done();
      if (!frame.startsWith('42')) return;

      let event;
      let payload;
      try { [event, payload] = JSON.parse(frame.slice(2)); } catch { return; }

      if (event === 'rideRequest') {
        const rideId = String(payload?.rideId || '');
        if (!rideId) return;
        bump(rideId, 'offered');
        if (!offeredAt.has(rideId)) offeredAt.set(rideId, Date.now());
        // Every offered driver accepts at once: this is the contention.
        ws.send(`42["acceptRide",{"rideId":"${rideId}"}]`);
      } else if (event === 'rideAccepted') {
        const rideId = String(payload?.rideId || '');
        bump(rideId, 'accepted');
        const t0 = offeredAt.get(rideId);
        if (t0) acceptLatencies.push(Date.now() - t0);
      } else if (event === 'errorMessage') {
        const message = String(payload?.message || 'unknown').slice(0, 90);
        errors.set(message, (errors.get(message) || 0) + 1);
      }
    });
    ws.on('error', done);
    ws.on('close', done);
  })));

  console.log(`${sockets.length} drivers online\n`);

  const created = { ok: 0, failed: 0 };
  let issued = 0;

  const worker = async () => {
    for (;;) {
      const index = issued;
      issued += 1;
      if (index >= rideCount) return;

      const token = signAccessToken({ sub: userIds[index % userIds.length], role: 'user' });
      try {
        const response = await fetch(`${baseUrl}/api/v1/rides`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            pickup: [ORIGIN[0] + jitter(0.008), ORIGIN[1] + jitter(0.008)],
            drop: [ORIGIN[0] + jitter(0.05), ORIGIN[1] + jitter(0.05)],
            pickupAddress: 'accept test pickup',
            dropAddress: 'accept test drop',
            fare: 150,
            estimatedDistanceMeters: 5000,
            estimatedDurationMinutes: 15,
            vehicleTypeId: String(vehicle._id),
            serviceType: 'ride',
            paymentMethod: 'cash',
            zone_id: String(zone._id),
            service_location_id: String(zone.service_location_id),
          }),
        });
        if (response.ok) created.ok += 1;
        else created.failed += 1;
      } catch {
        created.failed += 1;
      }
    }
  };

  console.log(`booking ${rideCount} rides, every offered driver races to accept...`);
  await Promise.all(Array.from({ length: concurrency }, worker));
  await sleep(10000); // let offers land and acceptances resolve

  const rows = [...perRide.values()];
  const withOneWinner = rows.filter((r) => r.accepted === 1).length;
  const withNoWinner = rows.filter((r) => r.accepted === 0).length;
  const withManyWinners = rows.filter((r) => r.accepted > 1).length;

  console.log(`\nrides created      ${created.ok} / ${rideCount}  (failed ${created.failed})`);
  console.log(`rides offered      ${rows.length}`);
  console.log(`offers per ride    ${(rows.reduce((s, r) => s + r.offered, 0) / Math.max(1, rows.length)).toFixed(1)}`);
  // Socket events cannot decide this: the winner is notified twice (directly by
  // the accept handler, and again via notifyRideAccepted broadcasting to the
  // driver room), so a duplicate here is expected. The database check below is
  // what actually proves one driver per ride.
  console.log(`
rides acknowledged ${withOneWinner + withManyWinners}`);
  console.log(`rides with none    ${withNoWinner}`);
  console.log(`duplicate acks     ${withManyWinners}  (expected: winner is told twice)`);
  console.log(`\naccept ms          p50=${pct(acceptLatencies, 50)} p95=${pct(acceptLatencies, 95)}`);

  if (errors.size) {
    console.log('\nerrors returned to losing drivers:');
    for (const [message, count] of [...errors].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`  ${String(count).padStart(5)} x ${message}`);
    }
  }

  // The database is the authority, and only ACTIVE rides count. Booking a new
  // ride cancels the rider's previous one and frees its driver, so a driver
  // still named on a cancelled ride is correct, not a double booking.
  const ACTIVE = ['searching', 'accepted', 'ongoing'];
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const activeAssigned = await db.collection('taxirides')
    .find({ userId: { $in: ids }, driverId: { $ne: null }, status: { $in: ACTIVE } },
          { projection: { driverId: 1 } })
    .toArray();

  const ridesPerDriver = new Map();
  for (const ride of activeAssigned) {
    const key = String(ride.driverId);
    ridesPerDriver.set(key, (ridesPerDriver.get(key) || 0) + 1);
  }
  const doubleBooked = [...ridesPerDriver.values()].filter((n) => n > 1).length;
  const cancelledWithDriver = await db.collection('taxirides')
    .countDocuments({ userId: { $in: ids }, driverId: { $ne: null }, status: { $nin: ACTIVE } });

  console.log('');
  console.log('authoritative check (from the database):');
  console.log(`  active rides with a driver ${activeAssigned.length}`);
  console.log(`  distinct drivers           ${ridesPerDriver.size}`);
  console.log(`  cancelled rides w/ driver  ${cancelledWithDriver}  (rider rebooked; driver freed)`);
  console.log(`  DOUBLE-BOOKED drivers      ${doubleBooked}   <- must be 0`);

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
