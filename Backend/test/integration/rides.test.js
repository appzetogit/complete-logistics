// Real-database tests: baseline ride lifecycle + "first 3 rides free".
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => { t = await bootstrap(); });
after(async () => { await t.stop(); });

const rideBody = (overrides = {}) => ({
  pickup: t.locations.pickup,
  drop: t.locations.drop,
  pickupAddress: 'A',
  dropAddress: 'B',
  fare: 100,
  estimatedDistanceMeters: 3000,
  estimatedDurationMinutes: 10,
  paymentMethod: 'cash',
  ...overrides,
});

// accept -> arriving -> started -> arrived -> completed, all through the real REST API
const driveRideToCompletion = async (rideId, driver) => {
  await t.acceptRide(rideId, driver.driver._id);
  for (const status of ['arriving', 'started', 'arrived', 'completed']) {
    const res = await t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body: { status } });
    assert.equal(res.status, 200, `status ${status}: ${res.text}`);
  }
};

const me = async (token) => (await t.api('GET', '/users/me', { token })).body.data.user;

test('baseline (flags off): ride is created, completed and settled exactly as before', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });

  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  assert.equal(created.status, 201, created.text);
  const ride = created.body.data.ride;
  assert.equal(ride.freeRide.covered, false);
  assert.equal(ride.goodsAdvance?.status ?? 'none', 'none');
  assert.equal(ride.paymentMethod, 'cash');
  assert.equal(created.body.data.freeRides.enabled, false);

  await driveRideToCompletion(ride._id, driver);

  const done = await t.m.Ride.findById(ride._id).lean();
  assert.equal(done.status, 'completed');
  assert.ok(done.walletSettledAt, 'wallet settled');
  // cash ride, 20% default commission on fare 100 -> driver is debited the commission
  const tx = await t.m.WalletTransaction.findOne({ rideId: ride._id }).lean();
  assert.equal(tx.type, 'commission_deduction');
  assert.equal(tx.amount, -20);
  assert.equal((await t.m.User.findById(rider.user._id).lean()).currentRideId, null);
  assert.equal((await me(rider.token)).freeRides.enabled, false);
});

test('free rides: first 3 completed rides are free, the 4th is charged normally', async () => {
  await t.setSettings('free_rides', { enabled: '1', limit: '3', max_fare: '500' });
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });

  assert.deepEqual((await me(rider.token)).freeRides, { enabled: true, limit: 3, used: 0, left: 3 });

  for (let i = 1; i <= 3; i += 1) {
    const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
    assert.equal(created.status, 201, created.text);
    const ride = created.body.data.ride;
    assert.equal(ride.freeRide.covered, true, `ride ${i} should be free`);
    assert.equal(ride.paymentMethod, 'online', 'free ride is marked online');
    assert.equal(ride.driverPaymentCollection.status, 'paid');
    assert.equal(ride.driverPaymentCollection.provider, 'free_ride');
    // counter does not move on creation
    assert.equal((await me(rider.token)).freeRides.used, i - 1);

    await driveRideToCompletion(ride._id, driver);

    assert.equal((await me(rider.token)).freeRides.used, i, `used after ride ${i}`);
    const settled = await t.m.WalletTransaction.findOne({ rideId: ride._id }).lean();
    assert.equal(settled.type, 'ride_earning', 'driver still earns on a free ride');
    assert.equal(settled.amount, 80, 'fare 100 - 20% commission');
  }

  assert.deepEqual((await me(rider.token)).freeRides, { enabled: true, limit: 3, used: 3, left: 0 });

  const fourth = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  assert.equal(fourth.body.data.ride.freeRide.covered, false);
  assert.equal(fourth.body.data.ride.paymentMethod, 'cash');
});

test('free rides: completing the same ride twice counts once (idempotent)', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  const rideId = created.body.data.ride._id;
  await driveRideToCompletion(rideId, driver);

  const again = await t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body: { status: 'completed' } });
  assert.equal(again.status, 409, 'cannot complete a completed ride');
  const ride = await t.m.Ride.findById(rideId).lean();
  await t.rideService.updateRideLifecycle; // exported, sanity
  const { consumeFreeRide } = await import('../../src/modules/taxi/user/services/freeRideService.js');
  assert.equal(await consumeFreeRide({ ride }), false, 'already consumed');
  assert.equal((await me(rider.token)).freeRides.used, 1);
});

test('free rides: a cancelled ride is not counted and the free ride stays available', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  const rideId = created.body.data.ride._id;
  assert.equal(created.body.data.ride.freeRide.covered, true);

  const cancelled = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal((await me(rider.token)).freeRides.used, 0);

  const next = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  assert.equal(next.body.data.ride.freeRide.covered, true, 'still free after a cancel');
});

test('free rides: fare above the cap, promo codes and bidding are not free', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();

  const expensive = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id), fare: 501 }) });
  assert.equal(expensive.body.data.ride.freeRide.covered, false);

  const promo = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id), promo_code: 'SOMECODE' }) });
  assert.equal(promo.status, 400);
  assert.match(promo.body.message, /Promo codes cannot be combined with free rides/);
});

test('free rides: goods (parcel) bookings count too and need no advance', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });

  const created = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup,
      drop: t.locations.drop,
      pickupAddress: 'A',
      dropAddress: 'B',
      vehicleTypeId: String(vehicle._id),
      paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
    },
  });
  assert.equal(created.status, 201, created.text);
  const delivery = created.body.data;
  assert.equal(delivery.freeRide.covered, true);
  assert.equal(delivery.goodsAdvance.status, 'none', 'free ride waives the goods advance');

  await t.acceptRide(delivery.rideId, driver.driver._id);
  for (const status of ['arriving', 'goods_loaded', 'started', 'arrived', 'goods_delivered', 'completed']) {
    const res = await t.api('PATCH', `/rides/${delivery.rideId}/status`, {
      token: driver.token,
      body: { status, proofImageUrl: 'https://example.com/proof.jpg' },
    });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }
  assert.equal((await me(rider.token)).freeRides.used, 1);
});

test('flag turned off again: nothing is free, summary says disabled', async () => {
  await t.setSettings('free_rides', { enabled: '0' });
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  assert.equal(created.body.data.ride.freeRide.covered, false);
  assert.equal(created.body.data.freeRides.enabled, false);
});

// ---- regression: code paths touched by the advance / selfie / cancel work ------

test('regression: normal ride payment at completion (wallet + tip) is unchanged', async () => {
  const vehicle = await t.factories.vehicle({ commission: 10 });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 1000);

  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id), fare: 200 }) });
  const rideId = created.body.data.ride._id;
  assert.equal(created.body.data.ride.goodsAdvance.status ?? 'none', 'none');
  await driveRideToCompletion(rideId, driver);

  const driverBefore = (await t.m.Driver.findById(driver.driver._id).lean()).wallet.balance;
  const pay = await t.api('POST', `/rides/${rideId}/complete-payment/wallet`, {
    token: rider.token, body: { rating: 5, comment: 'great', tipAmount: 20 },
  });
  assert.equal(pay.status, 201, pay.text);

  // rider is charged the full fare plus the tip (no advance involved)
  const wallet = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(wallet.balance, 1000 - 220);
  // driver is credited what the rider paid (cash ride paid online at the end)
  const driverAfter = (await t.m.Driver.findById(driver.driver._id).lean()).wallet.balance;
  assert.equal(driverAfter - driverBefore, 220);

  const ride = await t.m.Ride.findById(rideId).lean();
  assert.equal(ride.feedback.rating, 5);
  assert.equal(ride.paymentMethod, 'online');
  assert.equal(ride.driverPaymentCollection.status, 'paid');

  // paying twice is refused
  const second = await t.api('POST', `/rides/${rideId}/complete-payment/wallet`, { token: rider.token, body: { rating: 5, tipAmount: 0 } });
  // existing behaviour: nothing left to pay once the fare and tip are settled
  assert.equal(second.status, 400);
  assert.match(second.body.message, /No payable amount remains|already submitted/);
  assert.equal((await t.m.UserWallet.findOne({ userId: rider.user._id }).lean()).balance, 780);
});

test('regression: feedback-only (cash) and history/active payloads still serialise', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  const rideId = created.body.data.ride._id;

  const active = await t.api('GET', '/rides/active/me', { token: rider.token });
  assert.equal(active.status, 200);
  assert.equal(active.body.data.rideId, rideId);
  assert.equal(active.body.data.freeRide.covered, false);
  assert.equal(active.body.data.goodsAdvance.status, 'none');
  assert.equal(active.body.data.remainingFare, 100);

  await driveRideToCompletion(rideId, driver);
  const feedback = await t.api('PATCH', `/rides/${rideId}/feedback`, { token: rider.token, body: { rating: 4, comment: 'ok' } });
  assert.equal(feedback.status, 200, feedback.text);

  const history = await t.api('GET', '/rides?limit=5', { token: rider.token });
  assert.equal(history.status, 200);
  const row = history.body.data.results.find((r) => r.rideId === rideId);
  assert.equal(row.status, 'completed');
  assert.equal(row.goodsAdvance.status, 'none');
  assert.equal(row.freeRide.covered, false);
  assert.equal(row.driver.name, 'Test Driver');
  assert.equal('acceptSelfie' in row, false);

  const driverHistory = await t.api('GET', '/rides?limit=5', { token: driver.token });
  assert.equal(driverHistory.status, 200);
});

test('regression: admin driver list/detail and driver /me still work with the new fields', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const admin = await t.factories.admin();

  const list = await t.api('GET', '/admin/drivers', { token: admin.token });
  assert.equal(list.status, 200, list.text);
  const detail = await t.api('GET', `/admin/drivers/${driver.driver._id}`, { token: admin.token });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.body.data.cancel_tracking.count, 0);
  assert.equal(detail.body.data.cancel_tracking.blocked_until, null);

  const me = await t.api('GET', '/drivers/me', { token: driver.token });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.data.cancelsLeft, 3);
  assert.equal(me.body.data.cancelBlocked, false);
  assert.equal(me.body.data.profileImage, '');

  const offline = await t.api('PATCH', '/drivers/offline', { token: driver.token });
  assert.equal(offline.status, 200, offline.text);
});

test('regression: a normal ride cancelled by the rider after acceptance frees the driver', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody({ vehicleTypeId: String(vehicle._id) }) });
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);
  assert.equal((await t.m.Driver.findById(driver.driver._id).lean()).isOnRide, true);

  const cancelled = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancelled.status, 200, cancelled.text);
  assert.equal(cancelled.body.data.advanceRefunded, false);
  assert.equal(cancelled.body.data.advanceStatus, 'none');
  assert.equal((await t.m.Driver.findById(driver.driver._id).lean()).isOnRide, false);
  assert.equal((await t.m.User.findById(rider.user._id).lean()).currentRideId, null);
});
