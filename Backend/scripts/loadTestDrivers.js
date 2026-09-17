// What does a fleet of drivers pushing GPS actually cost this deployment?
//
// Each locationUpdate can trigger a zone lookup (first fix, then every 120m or
// 60s) and a driver write (every 25m or 15s). A driver at ~36 km/h clears 25m
// in under three seconds, so at realistic speed most updates do write -- this
// drives them that fast on purpose rather than measuring an idle fleet.
//
// Test drivers are created offline so matching cannot pick them up, and are
// removed again on exit.
//
//   node scripts/loadTestDrivers.js --drivers=500 --interval=3000 --duration=60
import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/taxi/services/tokenService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};

const driverCount = arg('drivers', 200);
const intervalMs = arg('interval', 3000);
const durationSec = arg('duration', 60);
const baseUrl = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] || 'https://udanxpress.com';
const socketUrl = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

const MARKER = 'loadtest-driver';
// Inside the Muzaffarnagar zone polygon, so the zone lookup resolves for real.
const ORIGIN = [77.75, 29.72];
const METERS_PER_DEG_LAT = 111320;
const METERS_PER_DEG_LNG = 111320 * Math.cos((ORIGIN[1] * Math.PI) / 180);
const SPEED_MPS = 10; // ~36 km/h

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// opcounters.update stays at zero for these writes regardless of driver, so
// count the documents actually modified instead.
const opcounters = async () => {
  const s = await mongoose.connection.db.admin().serverStatus();
  return {
    docsUpdated: s.metrics.document.updated,
    query: s.opcounters.query,
    command: s.opcounters.command,
  };
};

const run = async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  const drivers = mongoose.connection.db.collection('taxidrivers');

  console.log(`creating ${driverCount} offline test drivers...`);
  const seed = Array.from({ length: driverCount }, (_, i) => ({
    name: `${MARKER}-${i}`,
    phone: `9${String(100000000 + i)}`,
    isOnline: false,           // keep them out of matching
    isOnRide: false,
    approve: false,
    [MARKER]: true,            // marker for cleanup
    createdAt: new Date(),
  }));
  const inserted = await drivers.insertMany(seed);
  const ids = Object.values(inserted.insertedIds).map(String);

  const stats = { connected: 0, failed: 0, emitted: 0, errors: 0, closed: 0 };
  const sockets = [];

  const connect = (id) => new Promise((resolve) => {
    const token = signAccessToken({ sub: id, role: 'driver' });
    const socket = new WebSocket(socketUrl, { handshakeTimeout: 20000 });
    let settled = false;

    // Random start inside the zone, random heading, constant speed.
    const state = {
      lng: ORIGIN[0] + (Math.random() - 0.5) * 0.05,
      lat: ORIGIN[1] + (Math.random() - 0.5) * 0.03,
      heading: Math.random() * Math.PI * 2,
      socket,
    };

    socket.on('message', (raw) => {
      const frame = raw.toString();
      if (frame.startsWith('0{')) socket.send(`40${JSON.stringify({ token })}`);
      else if (frame.startsWith('40')) {
        if (!settled) { settled = true; stats.connected += 1; sockets.push(state); resolve(); }
      } else if (frame.startsWith('44')) {
        if (!settled) { settled = true; stats.failed += 1; resolve(); }
      } else if (frame === '2') socket.send('3');
      else if (frame.startsWith('42["errorMessage"')) stats.errors += 1;
    });

    socket.on('error', () => { if (!settled) { settled = true; stats.failed += 1; resolve(); } });
    socket.on('close', () => { stats.closed += 1; if (!settled) { settled = true; stats.failed += 1; resolve(); } });
  });

  console.log(`connecting ${driverCount} driver sockets...`);
  for (let i = 0; i < ids.length; i += 1) {
    connect(ids[i]);
    await sleep(2);
  }
  await sleep(5000);
  console.log(`connected ${stats.connected}, failed ${stats.failed}\n`);

  const before = await opcounters();
  const startedAt = Date.now();

  const tick = setInterval(() => {
    const stepMeters = SPEED_MPS * (intervalMs / 1000);
    for (const s of sockets) {
      if (s.socket.readyState !== 1) continue;
      s.lng += (Math.cos(s.heading) * stepMeters) / METERS_PER_DEG_LNG;
      s.lat += (Math.sin(s.heading) * stepMeters) / METERS_PER_DEG_LAT;
      s.socket.send(`42["locationUpdate",{"coordinates":[${s.lng.toFixed(6)},${s.lat.toFixed(6)}]}]`);
      stats.emitted += 1;
    }
  }, intervalMs);

  while ((Date.now() - startedAt) / 1000 < durationSec) {
    await sleep(10000);
    console.log(`  t+${Math.round((Date.now() - startedAt) / 1000)}s  emitted=${stats.emitted} live=${stats.connected - stats.closed} errors=${stats.errors}`);
  }

  clearInterval(tick);
  await sleep(3000); // let in-flight writes land
  const after = await opcounters();
  const elapsed = (Date.now() - startedAt) / 1000;

  console.log(`\ndrivers          ${stats.connected}`);
  console.log(`updates sent     ${stats.emitted}  (${(stats.emitted / elapsed).toFixed(0)}/s)`);
  console.log(`socket errors    ${stats.errors}`);
  console.log(`disconnects      ${stats.closed}`);
  const rate = (n) => `${n}  (${(n / elapsed).toFixed(0)}/s)`;
  console.log(`driver writes    ${rate(after.docsUpdated - before.docsUpdated)}`);
  console.log(`mongo queries    ${rate(after.query - before.query)}   <- zone lookups`);
  console.log(`mongo commands   ${rate(after.command - before.command)}`);

  for (const s of sockets) s.socket.close();
  const removed = await drivers.deleteMany({ [MARKER]: true });
  console.log(`\ncleaned up ${removed.deletedCount} test drivers`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.connection.db.collection('taxidrivers').deleteMany({ [MARKER]: true });
    console.error('test drivers cleaned up after failure');
  } catch {}
  process.exit(1);
});
