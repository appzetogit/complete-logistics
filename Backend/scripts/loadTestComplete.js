// Ride completion under load, and whether the money comes out right.
//
// Completion is the only flow that moves money: it debits commission from the
// driver wallet for a cash ride and writes a wallet transaction. Throughput
// matters less here than arithmetic, so this checks the ledger afterwards --
// every completed ride settled exactly once, and each driver's balance down by
// exactly the commission charged.
//
// It also races two completions at the same ride to confirm the settlement
// guard holds, since updateRideLifecycle itself is not transactional and only
// the walletSettledAt compare-and-set stands between it and a double charge.
//
// Isolation matches the other load tests: accounts sit far from any real
// driver and everything is removed on exit, including wallet transactions.
//
//   node scripts/loadTestComplete.js --rides=100 --drivers=200 --users=100
import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/taxi/services/tokenService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const rideCount = arg('rides', 60);
const driverCount = arg('drivers', 150);
const userCount = arg('users', 60);
const concurrency = arg('concurrency', 15);
const raceCount = arg('race', 20);
const baseUrl = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'https://udanxpress.com';

const MARKER = 'loadtestComplete';
const ORIGIN = [77.5, 29.3];
const START_BALANCE = 100000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (spread) => (Math.random() - 0.5) * spread;
const pct = (values, p) => (values.length
  ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((p / 100) * values.length))]
  : 0);
const round2 = (n) => Math.round(n * 100) / 100;

const cleanup = async (db, userIds) => {
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const rides = await db.collection('taxirides')
    .find({ userId: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  const rideIds = rides.map((r) => r._id);

  const removed = {
    rides: (await db.collection('taxirides').deleteMany({ _id: { $in: rideIds } })).deletedCount,
    deliveries: (await db.collection('deliveries').deleteMany({ rideId: { $in: rideIds } })).deletedCount,
    walletTxns: (await db.collection('wallettransactions').deleteMany({ rideId: { $in: rideIds } })).deletedCount,
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

  const driverIds = Object.values((await db.collection('taxidrivers').insertMany(
    Array.from({ length: driverCount }, (_, i) => ({
      name: `${MARKER}-driver-${i}`,
      phone: `8${String(600000000 + i)}`,
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
      wallet: { balance: START_BALANCE, isBlocked: false },
      [MARKER]: true,
      createdAt: new Date(),
    })),
  )).insertedIds).map(String);

  const userIds = Object.values((await db.collection('taxiusers').insertMany(
    Array.from({ length: userCount }, (_, i) => ({
      name: `${MARKER}-user-${i}`,
      phone: `7${String(600000000 + i)}`,
      isActive: true,
      deletedAt: null,
      [MARKER]: true,
      createdAt: new Date(),
    })),
  )).insertedIds).map(String);

  // rideId -> driver that won it, so the completion call uses the right token.
  const wonBy = new Map();
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
      if (frame.startsWith('0{')) return ws.send(`40${JSON.stringify({ token })}`);
      if (frame === '2') return ws.send('3');
      if (frame.startsWith('40')) { sockets.push(ws); return done(); }
      if (frame.startsWith('44')) return done();
      if (!frame.startsWith('42')) return;

      let event;
      let payload;
      try { [event, payload] = JSON.parse(frame.slice(2)); } catch { return; }

      if (event === 'rideRequest') {
        ws.send(`42["acceptRide",{"rideId":"${String(payload?.rideId || '')}"}]`);
      } else if (event === 'rideAccepted') {
        const rideId = String(payload?.rideId || '');
        if (rideId && !wonBy.has(rideId)) wonBy.set(rideId, id);
      }
    });
    ws.on('error', done);
    ws.on('close', done);
  })));

  console.log(`${sockets.length} drivers online`);

  let issued = 0;
  const book = async () => {
    for (;;) {
      const index = issued;
      issued += 1;
      if (index >= rideCount) return;

      const token = signAccessToken({ sub: userIds[index % userIds.length], role: 'user' });
      try {
        await fetch(`${baseUrl}/api/v1/rides`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({
            pickup: [ORIGIN[0] + jitter(0.008), ORIGIN[1] + jitter(0.008)],
            drop: [ORIGIN[0] + jitter(0.05), ORIGIN[1] + jitter(0.05)],
            pickupAddress: 'complete test pickup',
            dropAddress: 'complete test drop',
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
      } catch {}
    }
  };

  console.log(`booking and accepting ${rideCount} rides...`);
  await Promise.all(Array.from({ length: concurrency }, book));
  await sleep(8000); // let acceptances settle

  const accepted = [...wonBy.entries()];
  console.log(`${accepted.length} rides accepted, completing them...\n`);

  const complete = (rideId, driverId) => fetch(`${baseUrl}/api/v1/rides/${rideId}/status`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${signAccessToken({ sub: driverId, role: 'driver' })}`,
    },
    body: JSON.stringify({ status: 'completed', paymentMethod: 'cash' }),
  });

  const stats = { ok: 0, failed: 0, latencies: [], codes: {}, messages: new Map() };
  // The first `raceCount` rides get two simultaneous completions; the rest get
  // one. A double charge would show up in the ledger check below either way.
  let cursor = 0;
  const completer = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= accepted.length) return;

      const [rideId, driverId] = accepted[index];
      const startedAt = Date.now();
      try {
        const calls = index < raceCount
          ? [complete(rideId, driverId), complete(rideId, driverId)]
          : [complete(rideId, driverId)];
        const responses = await Promise.all(calls);
        stats.latencies.push(Date.now() - startedAt);
        for (const r of responses) {
          stats.codes[r.status] = (stats.codes[r.status] || 0) + 1;
          if (!r.ok) {
            // The error handler puts the real reason in the body; without it a
            // 500 is indistinguishable from any other failure.
            const body = await r.json().catch(() => null);
            const message = `${r.status}: ${String(body?.message || 'no message').slice(0, 90)}`;
            stats.messages.set(message, (stats.messages.get(message) || 0) + 1);
          }
        }
        if (responses.some((r) => r.ok)) stats.ok += 1;
        else stats.failed += 1;
      } catch {
        stats.failed += 1;
      }
    }
  };

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: concurrency }, completer));
  const elapsed = (Date.now() - startedAt) / 1000;
  await sleep(5000); // let settlement finish

  console.log(`completed          ${stats.ok} / ${accepted.length}  (${(stats.ok / elapsed).toFixed(1)}/s)`);
  console.log(`failed             ${stats.failed}`);
  console.log(`status codes       ${JSON.stringify(stats.codes)}   (409s expected from the raced duplicates)`);
  console.log(`complete ms        p50=${pct(stats.latencies, 50)} p95=${pct(stats.latencies, 95)}`);
  if (stats.messages.size) {
    console.log('');
    console.log('rejections:');
    for (const [message, count] of [...stats.messages].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`  ${String(count).padStart(4)} x ${message}`);
    }
  }

  // --- the ledger has to agree with the rides -----------------------------
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const rides = await db.collection('taxirides')
    .find({ userId: { $in: ids }, status: 'completed' },
          { projection: { _id: 1, driverId: 1, fare: 1, commissionAmount: 1, driverEarnings: 1, walletSettledAt: 1 } })
    .toArray();

  const rideIds = rides.map((r) => r._id);
  const txns = await db.collection('wallettransactions')
    .find({ rideId: { $in: rideIds } }, { projection: { rideId: 1, driverId: 1, amount: 1, type: 1 } })
    .toArray();

  const txnsPerRide = new Map();
  for (const t of txns) {
    const key = String(t.rideId);
    txnsPerRide.set(key, (txnsPerRide.get(key) || 0) + 1);
  }
  const doubleCharged = [...txnsPerRide.values()].filter((n) => n > 1).length;
  const unsettled = rides.filter((r) => !r.walletSettledAt).length;

  // Every driver's balance should be START_BALANCE minus the commission on
  // each ride they completed.
  const expectedDebit = new Map();
  for (const ride of rides) {
    const key = String(ride.driverId);
    expectedDebit.set(key, round2((expectedDebit.get(key) || 0) + Number(ride.commissionAmount || 0)));
  }
  const drivers = await db.collection('taxidrivers')
    .find({ [MARKER]: true }, { projection: { _id: 1, 'wallet.balance': 1 } })
    .toArray();

  let mismatched = 0;
  for (const driver of drivers) {
    const expected = round2(START_BALANCE - (expectedDebit.get(String(driver._id)) || 0));
    if (round2(Number(driver.wallet?.balance ?? START_BALANCE)) !== expected) mismatched += 1;
  }

  const sampleFare = rides[0]?.fare ?? 0;
  console.log('\nledger check (from the database):');
  console.log(`  completed rides        ${rides.length}`);
  console.log(`  wallet transactions    ${txns.length}`);
  console.log(`  rides never settled    ${unsettled}`);
  console.log(`  DOUBLE-CHARGED rides   ${doubleCharged}   <- must be 0`);
  console.log(`  wrong wallet balances  ${mismatched}   <- must be 0`);
  console.log(`  sample: fare ${sampleFare}, commission ${rides[0]?.commissionAmount}, driver earns ${rides[0]?.driverEarnings}`);

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
