// node --test src/modules/taxi/user/services/freeRideService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret-for-free-ride-service';

const {
  buildFreeRidesSummary,
  consumeFreeRide,
  normalizeFreeRideSettings,
  resolveFreeRideForNewRide,
} = await import('./freeRideService.js');

const settings = (overrides = {}) =>
  normalizeFreeRideSettings({ enabled: '1', limit: '3', max_fare: '500', ...overrides });

const resolve = ({ used = 0, outstanding = 0, fare = 100, cfg = settings() } = {}) =>
  resolveFreeRideForNewRide({
    user: { _id: 'u1', freeRidesUsed: used },
    fare,
    deps: { getSettings: async () => cfg, countOutstanding: async () => outstanding },
  });

// A tiny in-memory stand-in for the Ride/User models used by consumeFreeRide.
const makeModels = ({ failUserUpdate = false } = {}) => {
  const rides = new Map();
  const users = new Map();
  const Ride = {
    updateOne: async (filter, update) => {
      const ride = rides.get(String(filter._id));
      if (!ride) return { modifiedCount: 0 };
      if (filter['freeRide.consumedAt'] === null && ride.consumedAt !== null) return { modifiedCount: 0 };
      ride.consumedAt = update.$set['freeRide.consumedAt'];
      return { modifiedCount: 1 };
    },
  };
  const User = {
    updateOne: async (filter, update) => {
      if (failUserUpdate) throw new Error('db down');
      users.set(String(filter._id), (users.get(String(filter._id)) || 0) + update.$inc.freeRidesUsed);
      return { modifiedCount: 1 };
    },
  };
  return { rides, users, deps: { Ride, User } };
};

test('defaults: feature is off, limit 3', () => {
  const normalized = normalizeFreeRideSettings({});
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.limit, 3);
});

test('flag off: no ride is ever free', async () => {
  const result = await resolve({ cfg: settings({ enabled: '0' }) });
  assert.equal(result.covered, false);
});

test('flag on: first 3 rides are free, the 4th is charged', async () => {
  for (const used of [0, 1, 2]) {
    const result = await resolve({ used });
    assert.equal(result.covered, true, `ride #${used + 1} should be free`);
    assert.equal(result.freeRidesUsedBefore, used);
  }
  assert.equal((await resolve({ used: 3 })).covered, false);
});

test('free rides already booked but not completed count against the limit', async () => {
  assert.equal((await resolve({ used: 1, outstanding: 2 })).covered, false);
  assert.equal((await resolve({ used: 1, outstanding: 1 })).covered, true);
});

test('fare above max_fare is charged normally; 0 means no cap', async () => {
  assert.equal((await resolve({ fare: 501 })).covered, false);
  assert.equal((await resolve({ fare: 500 })).covered, true);
  assert.equal((await resolve({ fare: 99999, cfg: settings({ max_fare: '0' }) })).covered, true);
});

test('invalid fare is never free', async () => {
  assert.equal((await resolve({ fare: -5 })).covered, false);
  assert.equal((await resolve({ fare: 'abc' })).covered, false);
});

test('completing a free ride counts once, even if completion runs twice', async () => {
  const { rides, users, deps } = makeModels();
  rides.set('r1', { consumedAt: null });
  const ride = { _id: 'r1', userId: 'u1', freeRide: { covered: true } };

  assert.equal(await consumeFreeRide({ ride, deps }), true);
  assert.equal(await consumeFreeRide({ ride, deps }), false);
  assert.equal(users.get('u1'), 1);
});

test('goods (parcel) rides count the same as passenger rides', async () => {
  const { rides, users, deps } = makeModels();
  rides.set('p1', { consumedAt: null });
  await consumeFreeRide({
    ride: { _id: 'p1', userId: 'u1', serviceType: 'parcel', freeRide: { covered: true } },
    deps,
  });
  assert.equal(users.get('u1'), 1);
});

test('a ride that was not free, or was cancelled before completion, is never counted', async () => {
  const { rides, users, deps } = makeModels();
  rides.set('r2', { consumedAt: null });
  // Not free:
  assert.equal(await consumeFreeRide({ ride: { _id: 'r2', userId: 'u1', freeRide: { covered: false } }, deps }), false);
  // Cancelled rides never reach consumeFreeRide (it only runs on completion):
  assert.equal(users.get('u1'), undefined);
});

test('a failed counter update rolls the flag back so a retry can succeed', async () => {
  const failing = makeModels({ failUserUpdate: true });
  failing.rides.set('r3', { consumedAt: null });
  const ride = { _id: 'r3', userId: 'u1', freeRide: { covered: true } };

  await assert.rejects(consumeFreeRide({ ride, deps: failing.deps }), /db down/);
  assert.equal(failing.rides.get('r3').consumedAt, null);

  const healthy = makeModels();
  healthy.rides.set('r3', { consumedAt: null });
  assert.equal(await consumeFreeRide({ ride, deps: healthy.deps }), true);
});

test('summary shape for the apps', () => {
  assert.deepEqual(
    buildFreeRidesSummary({ settings: { enabled: false, limit: 3 }, used: 0 }),
    { enabled: false, limit: 3, used: 0, left: 3, maxFare: 0 },
  );
  assert.deepEqual(
    buildFreeRidesSummary({ settings: { enabled: true, limit: 3, maxFare: 500 }, used: 5 }),
    { enabled: true, limit: 3, used: 5, left: 0, maxFare: 500 },
  );
});
