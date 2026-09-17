// How many concurrent realtime clients does this deployment actually hold?
//
// Speaks the Socket.IO v4 protocol over a raw WebSocket (via ws, already
// present as socket.io's own dependency) so the test needs nothing installed.
// Connections are held open, because the number that matters is concurrent
// sockets, not connections per second.
//
//   node scripts/loadTest.js --sockets=2000
//   node scripts/loadTest.js --sockets=5000 --ramp=4 --url=https://udanxpress.com
import { WebSocket } from 'ws';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { signAccessToken } from '../src/modules/taxi/services/tokenService.js';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const target = Number(arg('sockets', 1000));
const rampMs = Number(arg('ramp', 3));
const baseUrl = String(arg('url', 'https://udanxpress.com'));
const socketUrl = `${baseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const open = (token, stats) => new Promise((resolve) => {
  const startedAt = Date.now();
  let settled = false;

  const finish = (ok, reason) => {
    if (settled) return;
    settled = true;
    if (ok) {
      stats.connected += 1;
      stats.latencies.push(Date.now() - startedAt);
    } else {
      stats.failed += 1;
      stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
    }
    resolve();
  };

  let socket;
  try {
    socket = new WebSocket(socketUrl, { handshakeTimeout: 20000 });
  } catch (error) {
    return finish(false, error.message);
  }

  stats.sockets.push(socket);

  socket.on('message', (raw) => {
    const frame = raw.toString();
    // 0 = transport open, 40 = namespace joined, 44 = rejected, 2 = ping
    if (frame.startsWith('0{')) socket.send(`40${JSON.stringify({ token })}`);
    else if (frame.startsWith('40')) finish(true);
    else if (frame.startsWith('44')) finish(false, `rejected: ${frame.slice(2, 80)}`);
    else if (frame === '2') socket.send('3');
  });

  socket.on('error', (error) => finish(false, error.message.slice(0, 60)));
  socket.on('close', () => {
    if (!settled) finish(false, 'closed before connect');
    else stats.dropped += 1;
  });
});

const run = async () => {
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, autoIndex: false });
  const users = await mongoose.connection.db
    .collection('taxiusers')
    .find({ deletedAt: null }, { projection: { _id: 1 } })
    .limit(200)
    .toArray();

  if (!users.length) throw new Error('no users to authenticate as');

  const tokens = users.map((u) => signAccessToken({ sub: String(u._id), role: 'user' }));
  await mongoose.disconnect();

  const stats = { connected: 0, failed: 0, dropped: 0, latencies: [], reasons: {}, sockets: [] };
  console.log(`opening ${target} sockets -> ${socketUrl}\n`);

  const pending = [];
  for (let i = 0; i < target; i += 1) {
    pending.push(open(tokens[i % tokens.length], stats));
    if (rampMs) await sleep(rampMs);

    if ((i + 1) % 500 === 0) {
      console.log(`  ${i + 1} attempted  ok=${stats.connected} failed=${stats.failed} dropped=${stats.dropped}`);
    }
  }

  await Promise.all(pending);
  await sleep(3000); // let late drops surface

  console.log(`\nconnected      ${stats.connected} / ${target}`);
  console.log(`failed         ${stats.failed}`);
  console.log(`dropped after  ${stats.dropped}`);
  console.log(`connect ms     p50=${percentile(stats.latencies, 50)} p95=${percentile(stats.latencies, 95)} max=${percentile(stats.latencies, 100)}`);
  for (const [reason, count] of Object.entries(stats.reasons).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${count} x ${reason}`);
  }

  for (const socket of stats.sockets) socket.close();
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
