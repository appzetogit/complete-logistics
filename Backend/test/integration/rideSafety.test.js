// Real-database tests: the ride status guards (order, arrival radius, start OTP), who sees what (OTP / earnings),
// and the waiting charge.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  await t.setSettings('transport_ride', { arrival_radius_meters: '200', drop_radius_meters: '300' });
});
after(async () => { await t.stop(); });

// About 3.1 km north of the pickup.
const FAR_AWAY = [t => t.locations.pickup[0], t => t.locations.pickup[1] + 0.028];
const farFromPickup = () => [FAR_AWAY[0](t), FAR_AWAY[1](t)];
// 50 m east of a point.
const near = ([lng, lat]) => [lng + 0.0005, lat];

const acceptedRide = async ({ body = {} } = {}) => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', ...body },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = String(created.body.data.ride._id);
  await t.acceptRide(rideId, driver.driver._id);
  return { rideId, driver, rider, vehicle };
};

const raw = (rideId, token, body) => t.api('PATCH', `/rides/${rideId}/status`, { token, body });
const step = (rideId, driver, status, extra = {}) => t.patchRideStatus(rideId, { token: driver.token, body: { status, ...extra } });

// ------------------------------------------------------------------ 1. arrival / drop radius
test('"at pickup" 3 km away is rejected with the distance; at the pickup it works', async () => {
  const { rideId, driver } = await acceptedRide();
  const far = await raw(rideId, driver.token, { status: 'arriving', coordinates: farFromPickup() });
  assert.equal(far.status, 409, far.text);
  assert.equal(far.body.code, 'OUT_OF_ARRIVAL_RADIUS');
  assert.equal(far.body.details.target, 'pickup');
  assert.equal(far.body.details.radiusMeters, 200);
  assert.ok(far.body.details.distanceMeters > 3000 && far.body.details.distanceMeters < 3300, far.text);
  assert.equal((await t.m.Ride.findById(rideId).lean()).liveStatus, 'accepted', 'nothing changed');

  const close = await raw(rideId, driver.token, { status: 'arriving', coordinates: near(t.locations.pickup) });
  assert.equal(close.status, 200, close.text);
});

test('without coordinates the last saved GPS point is used if fresh; stale or missing -> LOCATION_REQUIRED', async () => {
  const { rideId, driver } = await acceptedRide();
  const none = await raw(rideId, driver.token, { status: 'arriving' });
  assert.equal(none.status, 409);
  assert.equal(none.body.code, 'LOCATION_REQUIRED');

  await t.m.Ride.updateOne({ _id: rideId }, { $set: { lastDriverLocation: { type: 'Point', coordinates: near(t.locations.pickup), updatedAt: new Date(Date.now() - 5 * 60 * 1000) } } });
  assert.equal((await raw(rideId, driver.token, { status: 'arriving' })).body.code, 'LOCATION_REQUIRED', 'a 5 min old point does not count');

  await t.m.Ride.updateOne({ _id: rideId }, { $set: { 'lastDriverLocation.updatedAt': new Date() } });
  assert.equal((await raw(rideId, driver.token, { status: 'arriving' })).status, 200, 'a fresh point does');
});

test('drop radius: "at drop" is rejected away from the drop; completing after it is not re-checked', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  await step(rideId, driver, 'started');
  const farArrive = await raw(rideId, driver.token, { status: 'arrived', coordinates: t.locations.pickup });
  assert.equal(farArrive.status, 409);
  assert.equal(farArrive.body.code, 'OUT_OF_ARRIVAL_RADIUS');
  assert.equal(farArrive.body.details.target, 'drop');
  assert.equal(farArrive.body.details.radiusMeters, 300);
  assert.equal((await step(rideId, driver, 'arrived')).status, 200);
  // the drop was verified at "arrived": the driver may have moved off while collecting cash
  const completed = await raw(rideId, driver.token, { status: 'completed', coordinates: t.locations.pickup });
  assert.equal(completed.status, 200, completed.text);
});

test("no ride GPS point: the driver's live location (fresh heartbeat) is used", async () => {
  const { rideId, driver } = await acceptedRide();
  const atPickup = { location: { type: 'Point', coordinates: near(t.locations.pickup) } };
  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { ...atPickup, 'incentiveTracking.lastSeenAt': new Date(Date.now() - 10 * 60 * 1000) } });
  assert.equal((await raw(rideId, driver.token, { status: 'arriving' })).body.code, 'LOCATION_REQUIRED', 'a stale heartbeat does not count');
  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { 'incentiveTracking.lastSeenAt': new Date() } });
  assert.equal((await raw(rideId, driver.token, { status: 'arriving' })).status, 200);

  const far = await acceptedRide();
  await t.m.Driver.updateOne({ _id: far.driver.driver._id }, { $set: { location: { type: 'Point', coordinates: farFromPickup() }, 'incentiveTracking.lastSeenAt': new Date() } });
  assert.equal((await raw(far.rideId, far.driver.token, { status: 'arriving' })).body.code, 'OUT_OF_ARRIVAL_RADIUS');
});

test('rollout switches: location unknown can be allowed, and the start OTP can be turned off', async () => {
  try {
    await t.setSettings('transport_ride', { status_location_required: '0' });
    const unknown = await acceptedRide();
    assert.equal((await raw(unknown.rideId, unknown.driver.token, { status: 'arriving' })).status, 200, 'no position: allowed');
    const far = await acceptedRide();
    assert.equal((await raw(far.rideId, far.driver.token, { status: 'arriving', coordinates: farFromPickup() })).body.code,
      'OUT_OF_ARRIVAL_RADIUS', 'a known far position is still refused');

    await t.setSettings('transport_ride', { start_trip_otp_required: '0' });
    assert.equal((await raw(unknown.rideId, unknown.driver.token, { status: 'started' })).status, 200, 'no OTP needed');
  } finally {
    await t.setSettings('transport_ride', { status_location_required: '1', start_trip_otp_required: '1' });
  }
});

test('radius 0 turns the check off; the admin value is used right after saving', async () => {
  const admin = await t.factories.admin();
  const save = (settings) => t.api('PATCH', '/admin/general-settings/transport-ride', { token: admin.token, body: { settings } });
  try {
    assert.equal((await save({ arrival_radius_meters: '0' })).status, 200);
    const { rideId, driver } = await acceptedRide();
    assert.equal((await raw(rideId, driver.token, { status: 'arriving', coordinates: farFromPickup() })).status, 200, 'off');

    await save({ arrival_radius_meters: '5000' });
    const second = await acceptedRide();
    assert.equal((await raw(second.rideId, second.driver.token, { status: 'arriving', coordinates: farFromPickup() })).status, 200, '3.1 km < 5 km');
  } finally {
    await save({ arrival_radius_meters: '200' });
  }
});

test('bad coordinates are a 400, not a pass', async () => {
  const { rideId, driver } = await acceptedRide();
  assert.equal((await raw(rideId, driver.token, { status: 'arriving', coordinates: ['x', 1] })).status, 400);
  assert.equal((await raw(rideId, driver.token, { status: 'arriving', coordinates: [500, 22] })).status, 400);
});

// ------------------------------------------------------------------ 2. start OTP
test('start needs the rider OTP; wrong ones count down and then lock', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  const { otp } = await t.m.Ride.findById(rideId).lean();
  const wrong = otp === '0000' ? '1111' : '0000';

  const missing = await raw(rideId, driver.token, { status: 'started' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'OTP_REQUIRED');

  for (let left = 4; left >= 1; left -= 1) {
    const res = await raw(rideId, driver.token, { status: 'started', otp: wrong });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_OTP');
    assert.equal(res.body.details.attemptsLeft, left);
  }
  const fifth = await raw(rideId, driver.token, { status: 'started', otp: wrong });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.body.code, 'OTP_LOCKED');

  const correctButLocked = await raw(rideId, driver.token, { status: 'started', otp });
  assert.equal(correctButLocked.status, 429, 'locked even for the right OTP');
  assert.equal((await t.m.Ride.findById(rideId).lean()).liveStatus, 'arriving');

  // lock over: a new round, and the right OTP starts the trip
  await t.m.Ride.updateOne({ _id: rideId }, { $set: { 'otpCheck.lockedUntil': new Date(Date.now() - 1000) } });
  const afterLock = await raw(rideId, driver.token, { status: 'started', otp: wrong });
  assert.equal(afterLock.body.details.attemptsLeft, 4, 'counting starts over');
  const ok = await raw(rideId, driver.token, { status: 'started', otp: ` ${otp} ` });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await t.m.Ride.findById(rideId).lean()).liveStatus, 'started');
});

test('parallel wrong OTPs cannot get more than 5 tries', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  const { otp } = await t.m.Ride.findById(rideId).lean();
  const wrong = otp === '0000' ? '1111' : '0000';
  await Promise.all(Array.from({ length: 12 }, () => raw(rideId, driver.token, { status: 'started', otp: wrong })));
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.ok(stored.otpCheck.lockedUntil > new Date(), 'locked');
  assert.equal((await raw(rideId, driver.token, { status: 'started', otp })).status, 429);
});

test('socket status update: wrong OTP comes back as errorMessage with the code', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  const socket = await t.connectSocket(driver.token);
  // the server registers a socket's handlers after its async auth: re-send the join until it answers
  await waitFor(() => {
    if (socket.of('ride:joined')[0]) return true;
    socket.socket.emit('ride:join', { rideId });
    return false;
  }, { message: 'joined' });
  socket.socket.emit('ride:status:update', { rideId, status: 'started', otp: 'zzzz' });
  const error = await waitFor(() => socket.of('errorMessage')[0], { message: 'error event' });
  assert.equal(error.payload.code, 'INVALID_OTP');
  assert.equal((await t.m.Ride.findById(rideId).lean()).liveStatus, 'arriving');

  const { otp } = await t.m.Ride.findById(rideId).lean();
  socket.socket.emit('ride:status:update', { rideId, status: 'started', otp });
  await waitFor(async () => (await t.m.Ride.findById(rideId).lean()).liveStatus === 'started', { message: 'started over socket' });
});

// ------------------------------------------------------------------ 3. strict order
test('steps cannot be skipped', async () => {
  const { rideId, driver } = await acceptedRide();
  const { otp } = await t.m.Ride.findById(rideId).lean();
  for (const status of ['started', 'arrived', 'completed']) {
    const res = await step(rideId, driver, status, { otp });
    assert.equal(res.status, 409, `${status} from accepted: ${res.text}`);
    assert.equal(res.body.code, 'INVALID_STATUS_TRANSITION');
  }
  await step(rideId, driver, 'arriving');
  assert.equal((await step(rideId, driver, 'completed')).status, 409, 'completed from arriving');
  assert.equal((await step(rideId, driver, 'arrived')).status, 409, 'arrived from arriving');
  await step(rideId, driver, 'started');
  assert.equal((await step(rideId, driver, 'completed')).status, 409, 'completed from started (must reach the drop first)');
  assert.equal((await step(rideId, driver, 'arrived')).status, 200);
  assert.equal((await step(rideId, driver, 'completed')).status, 200);
  assert.equal((await step(rideId, driver, 'completed')).status, 409, 'a completed ride cannot be completed again');
});

test('arriving -> accepted still undoes a mistaken "at pickup"', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  assert.equal((await step(rideId, driver, 'accepted')).status, 200);
  assert.equal((await t.m.Ride.findById(rideId).lean()).arrivedAt, null);
});

// ------------------------------------------------------------------ 5 + 6. who sees what
test('the OTP only reaches the rider; earnings and commission only reach the driver', async () => {
  const { rideId, driver, rider } = await acceptedRide();
  const riderSocket = await t.connectSocket(rider.token);
  const driverSocket = await t.connectSocket(driver.token);
  await step(rideId, driver, 'arriving');
  await step(rideId, driver, 'started');
  await step(rideId, driver, 'arrived');
  const done = await step(rideId, driver, 'completed');
  assert.equal(done.status, 200);
  assert.ok(Number(done.body.data.driverEarnings) > 0, 'the driver sees their earnings in the response');
  assert.equal('otp' in done.body.data, false, 'no OTP in the driver response');

  await waitFor(() => riderSocket.of('ride:state').some((e) => e.payload?.liveStatus === 'completed'), { message: 'rider ride:state' });
  await waitFor(() => driverSocket.of('ride:state').some((e) => e.payload?.liveStatus === 'completed'), { message: 'driver ride:state' });
  for (const event of riderSocket.of('ride:state').filter((e) => e.payload?.rideId === rideId)) {
    assert.equal('driverEarnings' in event.payload, false);
    assert.equal('commissionAmount' in event.payload, false);
    assert.equal(event.payload.pricingSnapshot?.admin_commission_from_driver, undefined);
    assert.ok(event.payload.otp, 'the rider has the OTP');
  }
  for (const event of driverSocket.of('ride:state').filter((e) => e.payload?.rideId === rideId)) {
    assert.equal('otp' in event.payload, false, 'never the OTP to the driver');
  }
  for (const event of driverSocket.of('rideAccepted')) {
    assert.equal('otp' in (event.payload || {}), false);
  }

  const asRider = (await t.api('GET', `/rides/${rideId}`, { token: rider.token })).body.data;
  assert.ok(asRider.otp);
  assert.equal(asRider.driverEarnings, undefined);
  assert.equal(asRider.commissionAmount, undefined);
  assert.equal(asRider.pricingSnapshot?.admin_commission_from_driver, undefined);
  assert.equal(asRider.otpCheck, undefined);

  const asDriver = (await t.api('GET', `/rides/${rideId}`, { token: driver.token })).body.data;
  assert.equal(asDriver.otp, undefined);
  assert.ok(Number(asDriver.driverEarnings) > 0);

  const riderHistory = (await t.api('GET', '/rides', { token: rider.token })).body.data.results.find((r) => r.rideId === rideId);
  assert.equal('driverEarnings' in riderHistory, false);
  assert.equal(riderHistory.pricingSnapshot?.admin_commission_from_driver, undefined);
  const driverHistory = (await t.api('GET', '/rides', { token: driver.token })).body.data.results.find((r) => r.rideId === rideId);
  assert.equal('otp' in driverHistory, false);
  assert.ok(Number(driverHistory.driverEarnings) > 0);
});

// ------------------------------------------------------------------ 8. waiting charge
test('waiting at the pickup beyond the free minutes is billed when the trip starts', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  // 10 min waited, 3 free, Rs 2 a minute
  await t.m.Ride.updateOne({ _id: rideId }, {
    $set: {
      arrivedAt: new Date(Date.now() - 10 * 60 * 1000 - 5000),
      'pricingSnapshot.waiting_charge': 2,
      'pricingSnapshot.free_waiting_before': 3,
    },
  });
  const started = await step(rideId, driver, 'started');
  assert.equal(started.status, 200, started.text);
  assert.equal(started.body.data.waitingMinutes, 7);
  assert.equal(started.body.data.waitingCharge, 14);
  assert.equal(started.body.data.fare, 164);

  await step(rideId, driver, 'started'); // repeating the step does not bill twice
  assert.equal((await t.m.Ride.findById(rideId).lean()).fare, 164);

  await step(rideId, driver, 'arrived');
  const done = await step(rideId, driver, 'completed');
  const settled = await t.m.Ride.findById(rideId).lean();
  assert.equal(settled.fare, 164);
  assert.ok(Math.abs(settled.driverEarnings + settled.commissionAmount - 164) < 0.01, 'settled on fare + waiting');
  assert.equal(done.body.data.waitingCharge, 14);
});

test('no waiting charge inside the free minutes, without a rate, or on a free ride', async () => {
  const within = await acceptedRide();
  await step(within.rideId, within.driver, 'arriving');
  await t.m.Ride.updateOne({ _id: within.rideId }, { $set: { arrivedAt: new Date(Date.now() - 2 * 60 * 1000), 'pricingSnapshot.waiting_charge': 2, 'pricingSnapshot.free_waiting_before': 3 } });
  const a = await step(within.rideId, within.driver, 'started');
  assert.equal(a.body.data.waitingCharge, 0);
  assert.equal(a.body.data.fare, 150);

  const covered = await acceptedRide();
  await step(covered.rideId, covered.driver, 'arriving');
  await t.m.Ride.updateOne({ _id: covered.rideId }, { $set: { arrivedAt: new Date(Date.now() - 30 * 60 * 1000), 'pricingSnapshot.waiting_charge': 2, 'freeRide.covered': true } });
  const b = await step(covered.rideId, covered.driver, 'started');
  assert.equal(b.body.data.waitingCharge, 0, 'the rider pays nothing on a free ride');
});

test('OTP: once the 5 tries are used up, even the right OTP is refused (no parallel bypass)', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  const { otp } = await t.m.Ride.findById(rideId).lean();
  // the moment a racing request used the 5th try but before the lock was written
  await t.m.Ride.updateOne({ _id: rideId }, { $set: { 'otpCheck.failedAttempts': 5, 'otpCheck.lockedUntil': null } });
  const res = await raw(rideId, driver.token, { status: 'started', otp });
  assert.equal(res.status, 429, res.text);
  assert.equal(res.body.code, 'OTP_LOCKED');
  assert.equal((await t.m.Ride.findById(rideId).lean()).liveStatus, 'arriving');

  // one try left and ten guesses at once (one of them right): at most one is even compared
  const second = await acceptedRide();
  await step(second.rideId, second.driver, 'arriving');
  const right = (await t.m.Ride.findById(second.rideId).lean()).otp;
  const wrong = right === '0000' ? '1111' : '0000';
  await t.m.Ride.updateOne({ _id: second.rideId }, { $set: { 'otpCheck.failedAttempts': 4 } });
  const guesses = [...Array.from({ length: 9 }, () => wrong), right];
  const results = await Promise.all(guesses.map((guess) => raw(second.rideId, second.driver.token, { status: 'started', otp: guess })));
  const stored = await t.m.Ride.findById(second.rideId).lean();
  assert.ok(results.filter((r) => r.status === 400).length <= 1, 'at most one guess compared');
  if (stored.liveStatus !== 'started') {
    assert.ok(stored.otpCheck.lockedUntil > new Date(), 'locked when the right one did not get the slot');
  }
});

test('the rider gets off early: "arrived" with endTripEarly ends a passenger ride away from the drop', async () => {
  const { rideId, driver, rider } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  await step(rideId, driver, 'started');
  const midway = [t.locations.pickup[0] + 0.01, t.locations.pickup[1] + 0.01];
  assert.equal((await raw(rideId, driver.token, { status: 'arrived', coordinates: midway })).body.code, 'OUT_OF_ARRIVAL_RADIUS');
  const early = await raw(rideId, driver.token, { status: 'arrived', coordinates: midway, endTripEarly: true });
  assert.equal(early.status, 200, early.text);
  assert.ok(early.body.data.earlyDrop.distanceFromDropMeters > 1000, JSON.stringify(early.body.data.earlyDrop));
  assert.equal((await step(rideId, driver, 'completed')).status, 200);
  const asRider = (await t.api('GET', `/rides/${rideId}`, { token: rider.token })).body.data;
  assert.ok(asRider.earlyDrop?.at, 'recorded on the ride');
});

test('goods cannot end early: they must reach the drop', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const ride = await t.m.Ride.create({
    userId: (await t.factories.user()).user._id, driverId: driver.driver._id, serviceType: 'parcel',
    status: 'ongoing', liveStatus: 'started', fare: 200, otp: '1234',
    pickupLocation: { type: 'Point', coordinates: t.locations.pickup }, dropLocation: { type: 'Point', coordinates: t.locations.drop },
  });
  const res = await raw(String(ride._id), driver.token, { status: 'arrived', coordinates: t.locations.pickup, endTripEarly: true });
  assert.equal(res.body.code, 'OUT_OF_ARRIVAL_RADIUS');
});

test('waiting on a scheduled ride counts only from the pickup time; settlement keeps the waiting terms', async () => {
  const { rideId, driver } = await acceptedRide();
  await step(rideId, driver, 'arriving');
  // arrived 25 min early for a ride scheduled 6 min ago: 6 min waited, 3 free -> 3 billed
  await t.m.Ride.updateOne({ _id: rideId }, {
    $set: {
      arrivedAt: new Date(Date.now() - 25 * 60 * 1000),
      scheduledAt: new Date(Date.now() - 6 * 60 * 1000 - 5000),
      'pricingSnapshot.waiting_charge': 2,
      'pricingSnapshot.free_waiting_before': 3,
    },
  });
  const started = await step(rideId, driver, 'started');
  assert.equal(started.body.data.waitingMinutes, 3);
  assert.equal(started.body.data.waitingCharge, 6);
  await step(rideId, driver, 'arrived');
  await step(rideId, driver, 'completed');
  const settled = await t.m.Ride.findById(rideId).lean();
  assert.equal(settled.pricingSnapshot.waiting_charge, 2, 'settlement no longer wipes the waiting terms');
  assert.equal(settled.pricingSnapshot.free_waiting_before, 3);
});
