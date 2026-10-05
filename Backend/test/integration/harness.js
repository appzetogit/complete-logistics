// Integration-test harness: boots the real Express app + Socket.IO server in
// this process against a LOCAL MongoDB replica set (transactions are required).
//
//   INTEGRATION_MONGODB_URI="mongodb://127.0.0.1:27099/?replicaSet=rs0&directConnection=true" \
//     npm run test:integration
//
// Safety: refuses to run against anything but localhost, and blanks every
// external service (Firebase, Redis, SMS, SMTP) before the app is imported so a
// test can never touch production data or send real messages.
import net from 'node:net';
import { createServer } from 'node:http';
import { io as socketClient } from 'socket.io-client';

const rawUri = process.env.INTEGRATION_MONGODB_URI;

if (!rawUri) {
  throw new Error('Set INTEGRATION_MONGODB_URI to a local MongoDB replica set to run integration tests.');
}

const host = new URL(rawUri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error(`Refusing to run integration tests against non-local MongoDB host "${host}".`);
}

const redisUrl = process.env.INTEGRATION_REDIS_URL || '';
if (redisUrl && !/^redis:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(redisUrl)) {
  throw new Error('Refusing to run integration tests against a non-local Redis.');
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (check, { timeout = 8000, interval = 50, message = 'condition' } = {}) => {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${message}`);
    await sleep(interval);
  }
};

// ---- fake SMTP sink ---------------------------------------------------------

export const startFakeSmtp = async () => {
  const messages = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let current = { to: [], raw: '' };

    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.raw = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          messages.push(current);
          current = { to: [], raw: '' };
          socket.write('250 queued\r\n');
          continue;
        }

        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const command = line.toUpperCase();

        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250-fake\r\n250 AUTH PLAIN\r\n');
        } else if (command.startsWith('AUTH')) {
          socket.write('235 ok\r\n');
        } else if (command.startsWith('MAIL FROM')) {
          socket.write('250 ok\r\n');
        } else if (command.startsWith('RCPT TO')) {
          current.to.push(line.slice(line.indexOf('<') + 1, line.indexOf('>')));
          socket.write('250 ok\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (command === 'QUIT') {
          socket.write('221 bye\r\n');
          socket.end();
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });
    socket.on('error', () => {});
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, messages, close: () => new Promise((resolve) => server.close(resolve)) };
};

// ---- app bootstrap ----------------------------------------------------------

export const bootstrap = async ({ smtpPort = 1 } = {}) => {
  const dbName = `rentol_it_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: rawUri,
    MONGODB_DB_NAME: dbName,
    JWT_SECRET: 'integration-test-secret-not-for-production',
    // external services: blank (defined-but-empty beats .env, dotenv never overrides)
    // Redis is off unless a LOCAL one is supplied (exercises the dispatch lease + rate limits).
    REDIS_ENABLED: redisUrl ? 'true' : 'false',
    REDIS_URL: redisUrl,
    FIREBASE_DATABASE_URL: '',
    FIREBASE_SERVICE_ACCOUNT_PATH: '',
    FIREBASE_SERVICE_ACCOUNT_JSON: '',
    FIREBASE_SERVICE_ACCOUNT: '',
    SMS_INDIA_HUB_USERNAME: '',
    SMS_INDIA_HUB_PASSWORD: '',
    SMS_INDIA_HUB_API_KEY: '',
    SMS_INDIA_HUB_API_KEY_OVERRIDE: '',
    // OTP: static code so signup can be driven without an SMS provider
    USE_DEFAULT_OTP: 'true',
    STATIC_OTP_CODE: '1234',
    STATIC_OTP_PHONE: '9000000000',
    // mail: local fake SMTP sink
    EMAIL_HOST: '127.0.0.1',
    EMAIL_PORT: String(smtpPort),
    EMAIL_USER: 'test',
    EMAIL_PASS: 'test',
    EMAIL_FROM: '"Rentol Test" <test@example.com>',
    PUBLIC_BACKEND_URL: 'http://127.0.0.1:0',
  });

  const mongoose = (await import('mongoose')).default;
  const { connectDatabase } = await import('../../src/config/database.js');
  const { createApp } = await import('../../src/app.js');
  const { configureTaxiSocketServer } = await import('../../src/modules/taxi/socket/index.js');
  const { signAccessToken } = await import('../../src/modules/taxi/services/tokenService.js');
  const { invalidateCachedValue } = await import('../../src/utils/cache.js');

  await connectDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const httpServer = createServer(createApp());
  const io = await configureTaxiSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  const m = {
    Admin: (await import('../../src/modules/taxi/admin/models/Admin.js')).Admin,
    AdminBusinessSetting: (await import('../../src/modules/taxi/admin/models/AdminBusinessSetting.js')).AdminBusinessSetting,
    Vehicle: (await import('../../src/modules/taxi/admin/models/Vehicle.js')).Vehicle,
    SetPrice: (await import('../../src/modules/taxi/admin/models/SetPrice.js')).SetPrice,
    Driver: (await import('../../src/modules/taxi/driver/models/Driver.js')).Driver,
    WalletTransaction: (await import('../../src/modules/taxi/driver/models/WalletTransaction.js')).WalletTransaction,
    Ride: (await import('../../src/modules/taxi/user/models/Ride.js')).Ride,
    User: (await import('../../src/modules/taxi/user/models/User.js')).User,
    UserWallet: (await import('../../src/modules/taxi/user/models/UserWallet.js')).UserWallet,
    Delivery: (await import('../../src/modules/taxi/user/models/Delivery.js')).Delivery,
  };
  const rideService = await import('../../src/modules/taxi/services/rideService.js');
  const dispatchService = await import('../../src/modules/taxi/services/dispatchService.js');

  const tokenFor = (id, role) => signAccessToken({ sub: String(id), role });

  const api = async (method, path, { token, body } = {}) => {
    const response = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-json */ }
    return { status: response.status, body: json, text };
  };

  let counter = 0;
  const nextPhone = () => String(7000000000 + (Date.now() % 1000000) * 100 + (counter += 1)).slice(0, 10);

  const factories = {
    user: async (overrides = {}) => {
      const user = await m.User.create({ name: 'Test Rider', phone: nextPhone(), email: 'rider@example.com', ...overrides });
      return { user, token: tokenFor(user._id, 'user') };
    },
    driver: async (overrides = {}) => {
      const driver = await m.Driver.create({
        name: 'Test Driver',
        phone: nextPhone(),
        password: 'not-a-real-hash',
        vehicleType: 'car',
        vehicleNumber: 'MP09AB0001',
        approve: true,
        status: 'approved',
        isOnline: true,
        isOnRide: false,
        location: { type: 'Point', coordinates: [75.8577, 22.7196] },
        wallet: { balance: 2000, cashLimit: 500, isBlocked: false },
        ...overrides,
      });
      return { driver, token: tokenFor(driver._id, 'driver') };
    },
    admin: async () => {
      const admin = await m.Admin.create({
        name: 'Test Admin',
        email: `admin${(counter += 1)}@example.com`,
        password: 'not-a-real-hash',
        admin_type: 'superadmin',
        role: 'superadmin',
        permissions: ['*'],
        active: true,
        status: 'active',
      });
      return { admin, token: tokenFor(admin._id, 'admin') };
    },
    // A vehicle type plus the SetPrice that drives commission and payment methods.
    vehicle: async ({ commission = 20, setPrice = {}, ...overrides } = {}) => {
      const vehicle = await m.Vehicle.create({
        name: 'Test Sedan',
        transport_type: 'both',
        delivery_distance_pricing: { enabled: true, base_price: 100, base_distance: 1, distance_price: 10 },
        ...overrides,
      });
      await m.SetPrice.create({
        vehicle_type: vehicle._id,
        transport_type: 'both',
        payment_type: ['cash', 'online'],
        admin_commission_type_from_driver: 1,
        admin_commission_from_driver: commission,
        ...setPrice,
      });
      return vehicle;
    },
    wallet: async (userId, balance) =>
      m.UserWallet.updateOne({ userId }, { $set: { balance, refundWallet: 0 }, $setOnInsert: { transactions: [] } }, { upsert: true }),
  };

  // Update a business-settings section and drop the 30s in-process cache.
  const setSettings = async (section, values) => {
    await m.AdminBusinessSetting.updateOne(
      { scope: 'default' },
      { $set: Object.fromEntries(Object.entries(values).map(([k, v]) => [`${section}.${k}`, v])) },
      { upsert: true },
    );
    await invalidateCachedValue(`cache:settings:${section}`);
  };

  // Same thing the socket `acceptRide` event does.
  const acceptRide = async (rideId, driverId, selfieUrl = '') => {
    const ride = await rideService.acceptRideAssignment({ rideId, driverId, selfieUrl });
    await dispatchService.notifyRideAccepted(ride);
    return ride;
  };

  const connectSocket = async (token) => {
    const socket = socketClient(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true });
    const events = [];
    socket.onAny((name, payload) => events.push({ name, payload }));
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return { socket, events, of: (name) => events.filter((e) => e.name === name) };
  };

  const sockets = [];
  const trackedSocket = async (token) => {
    const connection = await connectSocket(token);
    sockets.push(connection.socket);
    return connection;
  };

  const stop = async () => {
    sockets.forEach((socket) => socket.close());
    try { await mongoose.connection.dropDatabase(); } catch { /* ignore */ }
    await new Promise((resolve) => io.close(resolve));
    await mongoose.disconnect();
  };

  return {
    api, baseUrl, m, mongoose, tokenFor, factories, setSettings, acceptRide,
    connectSocket: trackedSocket, rideService, dispatchService, stop,
    locations: { pickup: [75.8577, 22.7196], drop: [75.8777, 22.7396] },
  };
};
