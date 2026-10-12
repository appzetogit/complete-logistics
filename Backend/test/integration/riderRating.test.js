// Real-database tests: the driver rates the rider; the rider's average reaches the driver app.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

// A ride by `rider`, driven by `driver`, already completed.
const completedRide = async ({ vehicle, driver, rider, status = 'completed' }) => {
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = String(created.body.data.ride._id);
  await t.m.Ride.updateOne(
    { _id: rideId },
    { $set: { driverId: driver.driver._id, status, liveStatus: status, completedAt: status === 'completed' ? new Date() : null } },
  );
  await t.m.User.updateOne({ _id: rider.user._id }, { $set: { currentRideId: null } });
  return rideId;
};

const rate = (rideId, token, body) => t.api('PATCH', `/rides/${rideId}/rider-rating`, { token, body });

test('driver rates the rider once per completed ride; the rider average updates', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();

  const first = await completedRide({ vehicle, driver, rider });
  const res = await rate(first, driver.token, { rating: 4, comment: '  polite  ' });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.driverFeedback.rating, 4);
  assert.equal(res.body.data.driverFeedback.comment, 'polite');
  assert.ok(res.body.data.driverFeedback.submittedAt);
  assert.equal(res.body.data.user.rating, 4);
  assert.equal(res.body.data.user.ratingCount, 1);

  assert.equal((await rate(first, driver.token, { rating: 1 })).status, 409, 'only once');

  const second = await completedRide({ vehicle, driver, rider });
  assert.equal((await rate(second, driver.token, { rating: 5 })).status, 200);
  const stored = await t.m.User.findById(rider.user._id).lean();
  assert.equal(stored.ratingCount, 2);
  assert.equal(stored.totalRatingScore, 9);
  assert.equal(stored.rating, 4.5);
});

test('rejects bad ratings, other drivers, unfinished rides and non-drivers', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const stranger = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await completedRide({ vehicle, driver, rider });

  for (const rating of [0, 6, 3.5, 'x', null]) {
    assert.equal((await rate(rideId, driver.token, { rating })).status, 400, `rating ${rating}`);
  }
  assert.equal((await rate(rideId, driver.token, { rating: 4, comment: 'x'.repeat(501) })).status, 400);
  assert.equal((await rate(rideId, driver.token, { rating: 4, comment: { a: 1 } })).status, 400, 'comment must be text');
  assert.equal((await rate(rideId, stranger.token, { rating: 4 })).status, 404, 'not their ride');
  assert.ok([401, 403].includes((await rate(rideId, rider.token, { rating: 4 })).status), 'riders cannot use it');
  assert.equal((await rate('not-an-id', driver.token, { rating: 4 })).status, 404);

  const ongoing = await completedRide({ vehicle, driver, rider, status: 'ongoing' });
  assert.equal((await rate(ongoing, driver.token, { rating: 4 })).status, 404, 'only completed rides');

  const untouched = await t.m.User.findById(rider.user._id).lean();
  assert.equal(untouched.ratingCount || 0, 0, 'nothing counted');
});

test('a double tap counts once', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await completedRide({ vehicle, driver, rider });

  const results = await Promise.all(Array.from({ length: 8 }, () => rate(rideId, driver.token, { rating: 5 })));
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));
  const stored = await t.m.User.findById(rider.user._id).lean();
  assert.equal(stored.ratingCount, 1);
  assert.equal(stored.totalRatingScore, 5);
});

test('the rider never sees the driver rating; the driver sees it on the ride', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await completedRide({ vehicle, driver, rider });
  await rate(rideId, driver.token, { rating: 2, comment: 'late to pickup' });

  const asRider = await t.api('GET', `/rides/${rideId}`, { token: rider.token });
  assert.equal(asRider.status, 200, asRider.text);
  assert.equal('driverFeedback' in asRider.body.data, false);
  assert.ok(!asRider.text.includes('late to pickup'));

  const history = await t.api('GET', '/rides', { token: rider.token });
  assert.ok(!history.text.includes('late to pickup'));

  const asDriver = await t.api('GET', `/rides/${rideId}`, { token: driver.token });
  assert.equal(asDriver.body.data.driverFeedback.rating, 2);
});

test('the ride offer a driver receives carries the rider rating', async () => {
  const vehicle = await t.factories.vehicle();
  const rated = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const pastRide = await completedRide({ vehicle, driver: rated, rider });
  await rate(pastRide, rated.token, { rating: 3 });
  // Free the first driver so only the new one gets the offer.
  await t.m.Driver.updateOne({ _id: rated.driver._id }, { $set: { isOnline: false } });

  const offered = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = String(created.body.data.ride._id);

  let offer = null;
  for (let i = 0; i < 50 && !offer; i += 1) {
    const offers = await t.api('GET', '/drivers/ride-offers', { token: offered.token });
    offer = (offers.body.data?.results || []).find((item) => String(item.rideId) === rideId) || null;
    if (!offer) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(offer, 'offer reached the driver');
  assert.equal(offer.user.rating, 3);
  assert.equal(offer.user.ratingCount, 1);
});

test('driver ride history shows which rides were rated and the rider rating', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rated = await completedRide({ vehicle, driver, rider });
  const unrated = await completedRide({ vehicle, driver, rider });
  await rate(rated, driver.token, { rating: 5 });

  const history = await t.api('GET', '/rides', { token: driver.token });
  assert.equal(history.status, 200, history.text);
  const byId = Object.fromEntries(history.body.data.results.map((ride) => [ride.rideId, ride]));
  assert.equal(byId[rated].driverFeedback.rating, 5);
  assert.equal(byId[unrated].driverFeedback, null);
  assert.equal(byId[rated].user.rating, 5);

  const riderHistory = await t.api('GET', '/rides', { token: rider.token });
  assert.ok(riderHistory.body.data.results.every((ride) => !('driverFeedback' in ride)));
});

test('if the rider average cannot be updated, the rating is released and can be sent again', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await completedRide({ vehicle, driver, rider });

  const original = t.m.User.updateOne;
  t.m.User.updateOne = function failingOnce() {
    t.m.User.updateOne = original;
    return { maxTimeMS: () => Promise.reject(new Error('simulated write failure')) };
  };
  try {
    const failed = await rate(rideId, driver.token, { rating: 4 });
    assert.equal(failed.status, 500);
  } finally {
    t.m.User.updateOne = original;
  }
  const released = await t.m.Ride.collection.findOne({ _id: new t.mongoose.Types.ObjectId(rideId) });
  assert.equal(released.driverFeedback, undefined, 'claim released');

  assert.equal((await rate(rideId, driver.token, { rating: 4 })).status, 200, 'retry works');
  assert.equal((await t.m.User.findById(rider.user._id).lean()).ratingCount, 1);
});
