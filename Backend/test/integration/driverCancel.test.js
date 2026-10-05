// Real-database + real-socket tests: driver cancels an accepted ride, daily limit, block.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const [PICKUP_LNG, PICKUP_LAT] = [75.8577, 22.7196];

const rideBody = (vehicle, overrides = {}) => ({
  pickup: [PICKUP_LNG, PICKUP_LAT],
  drop: [75.8777, 22.7396],
  fare: 150,
  vehicleTypeId: String(vehicle._id),
  paymentMethod: 'cash',
  ...overrides,
});

const loadRide = (id) => t.m.Ride.findById(id).lean();
const loadDriver = (id) => t.m.Driver.findById(id).lean();
const cancel = (driver, rideId, reason = 'test') =>
  t.api('POST', `/rides/${rideId}/driver-cancel`, { token: driver.token, body: { reason } });

// rider books, driver accepts (like the socket event does)
const bookAndAccept = async ({ vehicle, driver, riderOverrides = {}, body = {}, selfie = '' }) => {
  const rider = await t.factories.user(riderOverrides);
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle, body) });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id, selfie);
  return { rider, rideId };
};

test('cancel puts the ride back to searching, excludes the cancelling driver and re-offers it to another', async () => {
  const vehicle = await t.factories.vehicle();
  const driverA = await t.factories.driver({ vehicleTypeId: vehicle._id, name: 'Driver A' });
  const driverB = await t.factories.driver({
    vehicleTypeId: vehicle._id,
    name: 'Driver B',
    location: { type: 'Point', coordinates: [PICKUP_LNG + 0.003, PICKUP_LAT + 0.003] },
  });
  const rider = await t.factories.user();

  const sockA = await t.connectSocket(driverA.token);
  const sockB = await t.connectSocket(driverB.token);
  const sockRider = await t.connectSocket(rider.token);

  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle) });
  const rideId = created.body.data.ride._id;
  sockRider.socket.emit('ride:join', { rideId });
  await waitFor(() => sockRider.of('ride:joined')[0], { message: 'rider in ride room' });

  // nearest driver (A) is offered the ride first; accepts with a selfie over the real socket
  await waitFor(() => sockA.of('rideRequest')[0], { message: 'A offered the ride' });
  assert.equal(sockB.of('rideRequest').length, 0, 'one-by-one dispatch: B not offered yet');
  sockA.socket.emit('acceptRide', { rideId, selfieUrl: 'https://cdn.example.com/selfies/a.jpg' });
  await waitFor(() => sockA.of('rideAccepted')[0], { message: 'A accepted' });
  sockA.socket.emit('ride:join', { rideId });
  await waitFor(() => sockA.of('ride:joined')[0], { message: 'A in ride room' });

  const res = await cancel(driverA, rideId, 'Customer not reachable');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.redispatched, true);
  assert.equal(res.body.data.status, 'searching');
  assert.equal(res.body.data.cancelLimit, 3);
  assert.equal(res.body.data.cancelsToday, 1);
  assert.equal(res.body.data.cancelsLeft, 2);
  assert.equal(res.body.data.cancelBlocked, false);

  const ride = await loadRide(rideId);
  assert.equal(ride.status, 'searching');
  assert.equal(ride.liveStatus, 'searching');
  assert.equal(ride.driverId, null);
  assert.equal(ride.acceptedAt, null);
  assert.equal(ride.acceptSelfie, undefined, "old driver's selfie is cleared from the live ride");
  assert.equal(ride.driverCancellations.length, 1, 'audit entry kept');
  assert.equal(ride.driverCancellations[0].reason, 'Customer not reachable');
  assert.equal(ride.driverCancellations[0].acceptSelfieUrl, 'https://cdn.example.com/selfies/a.jpg');
  assert.ok(ride.dispatchTracking.rejectedDriverIds.includes(String(driverA.driver._id)));

  const dA = await loadDriver(driverA.driver._id);
  assert.equal(dA.isOnRide, false);
  assert.equal(dA.isOnline, true, 'not blocked yet, still online');
  assert.equal(dA.cancelTracking.count, 1);

  // rider is told; B is offered the ride; A is not offered it again
  await waitFor(() => sockRider.of('rideDriverCancelled')[0], { message: 'rider told driver cancelled' });
  const offerToB = await waitFor(() => sockB.of('rideRequest').find((e) => e.payload.rideId === rideId), { message: 'B offered the ride' });
  assert.equal(offerToB.payload.rideId, rideId);
  await sleep(600);
  assert.equal(sockA.of('rideRequest').filter((e) => e.payload.rideId === rideId).length, 1, 'A only ever saw the original offer');

  // B takes it and drives it; A must receive none of that ride's live updates
  await t.acceptRide(rideId, driverB.driver._id);
  const eventsBefore = sockA.events.length;
  assert.equal((await t.api('PATCH', `/rides/${rideId}/status`, { token: driverB.token, body: { status: 'arriving' } })).status, 200);
  await sleep(600);
  const leaked = sockA.events.slice(eventsBefore).filter((e) => JSON.stringify(e.payload ?? {}).includes(rideId));
  assert.equal(leaked.length, 0, `old driver still receives ride updates: ${JSON.stringify(leaked.map((e) => e.name))}`);

  // and A can no longer touch the ride over REST
  assert.equal((await t.api('GET', `/rides/${rideId}`, { token: driverA.token })).status, 403);
  assert.equal((await cancel(driverA, rideId)).status, 404);
});

test('cancel rules: only own, accepted, not-started, not-future-scheduled rides', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const other = await t.factories.driver({ vehicleTypeId: vehicle._id });

  const { rider, rideId } = await bookAndAccept({ vehicle, driver });

  assert.equal((await t.api('POST', `/rides/${rideId}/driver-cancel`, { token: rider.token, body: {} })).status, 403, 'rider cannot');
  assert.equal((await cancel(other, rideId)).status, 404, "another driver's ride");
  assert.equal((await t.api('POST', `/rides/${rideId}/driver-cancel`, { body: {} })).status, 401);

  // once the trip has started the driver can no longer cancel
  for (const status of ['arriving', 'started']) {
    await t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body: { status } });
  }
  const started = await cancel(driver, rideId);
  assert.equal(started.status, 409);
  assert.match(started.body.message, /can no longer be cancelled/);
  assert.equal((await loadDriver(driver.driver._id)).cancelTracking?.count ?? 0, 0, 'rejected attempts are not counted');

  // an upcoming scheduled ride is cancelled from the scheduled screen instead
  const future = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  const driver2 = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const scheduled = await bookAndAccept({ vehicle, driver: driver2, body: { scheduledAt: future } });
  const res = await cancel(driver2, scheduled.rideId);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /scheduled/i);
  assert.equal((await loadRide(scheduled.rideId)).status, 'accepted', 'ride untouched');
});

test('two simultaneous cancels count once', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const { rideId } = await bookAndAccept({ vehicle, driver });

  const results = await Promise.all([cancel(driver, rideId), cancel(driver, rideId)]);
  const statuses = results.map((r) => r.status).sort();
  assert.equal(statuses.filter((s) => s === 200).length, 1, `exactly one wins: ${statuses}`);
  assert.equal((await loadDriver(driver.driver._id)).cancelTracking.count, 1);
  assert.equal((await loadRide(rideId)).driverCancellations.length, 1);
});

test('3rd cancel blocks the driver: offline, 403 on online/accept/bid, no offers, shown in /me; admin can clear', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const sock = await t.connectSocket(driver.token);
  const admin = await t.factories.admin();

  const results = [];
  for (let i = 1; i <= 3; i += 1) {
    const { rideId } = await bookAndAccept({ vehicle, driver });
    const res = await cancel(driver, rideId);
    assert.equal(res.status, 200, res.text);
    results.push(res.body.data);
  }

  assert.deepEqual(results.map((r) => r.cancelsLeft), [2, 1, 0]);
  assert.deepEqual(results.map((r) => r.cancelBlocked), [false, false, true]);
  const blockedUntil = new Date(results[2].blockedUntil);
  assert.ok(blockedUntil > new Date(), 'blocked into the future');
  assert.equal(new Date(blockedUntil.getTime() + 330 * 60000).getUTCHours(), 0, 'block ends at IST midnight');
  assert.equal((await loadDriver(driver.driver._id)).isOnline, false, 'forced offline');

  const blockedEvent = await waitFor(() => sock.of('driver:blocked')[0], { message: 'driver:blocked event' });
  assert.equal(blockedEvent.payload.reason, 'daily_cancel_limit');

  // go online -> 403 with the machine-readable code
  const goOnline = await t.api('PATCH', '/drivers/online', {
    token: driver.token,
    body: { location: [PICKUP_LNG, PICKUP_LAT], selfieImageUrl: 'https://cdn.example.com/s.jpg' },
  });
  assert.equal(goOnline.status, 403, goOnline.text);
  assert.equal(goOnline.body.details.code, 'DRIVER_CANCEL_BLOCKED');
  assert.ok(goOnline.body.details.blockedUntil);

  // accept and bid are refused too
  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { isOnline: true } }); // even if somehow online
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle) });
  const rideId = created.body.data.ride._id;
  await assert.rejects(t.rideService.acceptRideAssignment({ rideId, driverId: driver.driver._id }), (e) => e.statusCode === 403);
  assert.equal((await loadRide(rideId)).status, 'searching', 'ride not taken by a blocked driver');
  // matching skips them: nobody else exists, so no offer is made
  await sleep(800);
  assert.equal(sock.of('rideRequest').filter((e) => e.payload.rideId === rideId).length, 0, 'blocked driver gets no offers');

  // /me tells the app
  const me = await t.api('GET', '/drivers/me', { token: driver.token });
  assert.equal(me.body.data.cancelBlocked, true);
  assert.equal(me.body.data.cancelsLeft, 0);
  assert.equal(me.body.data.cancelLimit, 3);
  assert.ok(me.body.data.blockedUntil);

  // admin sees the counter and can lift the block
  const adminView = await t.api('GET', `/admin/drivers/${driver.driver._id}`, { token: admin.token });
  assert.equal(adminView.body.data.cancel_tracking.count, 3);
  const cleared = await t.api('PATCH', `/admin/drivers/${driver.driver._id}/clear-cancel-block`, { token: admin.token });
  assert.equal(cleared.status, 200, cleared.text);
  assert.equal(cleared.body.data.cancelBlocked, false);
  assert.equal(cleared.body.data.cancelsLeft, 3);

  const online = await t.api('PATCH', '/drivers/online', {
    token: driver.token,
    body: { location: [PICKUP_LNG, PICKUP_LAT], selfieImageUrl: 'https://cdn.example.com/s.jpg' },
  });
  assert.equal(online.status, 200, online.text);
  const taken = await t.rideService.acceptRideAssignment({ rideId, driverId: driver.driver._id });
  assert.equal(String(taken.driverId), String(driver.driver._id), 'unblocked driver can accept again');
});

test('the block and the count reset on the next IST day', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  for (let i = 0; i < 3; i += 1) {
    const { rideId } = await bookAndAccept({ vehicle, driver });
    await cancel(driver, rideId);
  }
  assert.equal((await t.api('GET', '/drivers/me', { token: driver.token })).body.data.cancelBlocked, true);

  // pretend it is tomorrow: yesterday's date key, block already expired
  await t.m.Driver.updateOne(
    { _id: driver.driver._id },
    { $set: { 'cancelTracking.dateKey': '2000-01-01', 'cancelTracking.blockedUntil': new Date(Date.now() - 1000) } },
  );
  const me = (await t.api('GET', '/drivers/me', { token: driver.token })).body.data;
  assert.equal(me.cancelBlocked, false);
  assert.equal(me.cancelsToday, 0);
  assert.equal(me.cancelsLeft, 3);

  const online = await t.api('PATCH', '/drivers/online', {
    token: driver.token, body: { location: [PICKUP_LNG, PICKUP_LAT], selfieImageUrl: 'https://cdn.example.com/s.jpg' },
  });
  assert.equal(online.status, 200, online.text);
  const { rideId } = await bookAndAccept({ vehicle, driver });
  const next = await cancel(driver, rideId);
  assert.equal(next.body.data.cancelsToday, 1, 'count restarted');
  assert.equal(next.body.data.cancelBlocked, false);
});

test('rejecting a request does not count as a cancel', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const sock = await t.connectSocket(driver.token);
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle) });
  const rideId = created.body.data.ride._id;
  await waitFor(() => sock.of('rideRequest')[0], { message: 'offer' });

  sock.socket.emit('rejectRide', { rideId });
  await sleep(500);
  assert.equal((await loadDriver(driver.driver._id)).cancelTracking?.count ?? 0, 0);
});

test('limit setting: 0 turns blocking off, a custom limit applies', async () => {
  await t.setSettings('transport_ride', { driver_daily_cancel_limit: '0' });
  const vehicle = await t.factories.vehicle();
  const unlimited = await t.factories.driver({ vehicleTypeId: vehicle._id });
  let last;
  for (let i = 0; i < 4; i += 1) {
    const { rideId } = await bookAndAccept({ vehicle, driver: unlimited });
    last = await cancel(unlimited, rideId);
    assert.equal(last.status, 200);
  }
  assert.equal(last.body.data.cancelBlocked, false);
  assert.equal(last.body.data.cancelsToday, 4);
  assert.equal((await loadDriver(unlimited.driver._id)).isOnline, true);

  await t.setSettings('transport_ride', { driver_daily_cancel_limit: '1' });
  const strict = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const { rideId } = await bookAndAccept({ vehicle, driver: strict });
  const res = await cancel(strict, rideId);
  assert.equal(res.body.data.cancelBlocked, true, 'limit 1: first cancel blocks');
  await t.setSettings('transport_ride', { driver_daily_cancel_limit: '3' });
});

test('goods booking: advance stays held while the ride is re-dispatched, and is refunded if no driver is found later', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 5000);

  const booked = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: [PICKUP_LNG, PICKUP_LAT], drop: [75.8777, 22.7396], vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
    },
  });
  const { rideId } = booked.body.data;
  const advance = booked.body.data.goodsAdvance.amount;
  await t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
  await t.acceptRide(rideId, driver.driver._id);

  const res = await cancel(driver, rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.redispatched, true);
  assert.equal(res.body.data.advanceRefunded, false);

  const ride = await loadRide(rideId);
  assert.equal(ride.status, 'searching');
  assert.equal(ride.goodsAdvance.status, 'paid', 'advance still held for the continuing booking');
  assert.equal((await t.m.UserWallet.findOne({ userId: rider.user._id }).lean()).refundWallet, 0);

  // booking later ends (admin cancel stands in for "no driver found"): advance is refunded
  await t.dispatchService.cancelRideByAdmin(rideId);
  assert.equal((await loadRide(rideId)).goodsAdvance.status, 'refunded');
  assert.equal((await t.m.UserWallet.findOne({ userId: rider.user._id }).lean()).refundWallet, advance);
});

test('bidding rides cannot be re-opened: a driver cancel cancels the whole booking', async () => {
  const vehicle = await t.factories.vehicle({ dispatch_type: 'bidding' });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const riderSocket = await t.connectSocket(rider.token);

  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: rideBody(vehicle, { fare: 1000, serviceType: 'intercity', bookingMode: 'bidding', intercity: { fromCity: 'Indore', toCity: 'Bhopal', passengers: 1 } }),
  });
  assert.equal(created.status, 201, created.text);
  const ride = created.body.data.ride;
  assert.equal(ride.bookingMode, 'bidding', 'created as a driver-bid ride');

  const bid = await t.rideService.submitRideBid({ rideId: ride._id, driverId: driver.driver._id, bidFare: 1000 });
  const accepted = await t.rideService.acceptRideBidAssignment({ rideId: ride._id, bidId: bid.bid.id, userId: rider.user._id });
  await t.dispatchService.notifyRideAccepted(accepted);

  const res = await cancel(driver, ride._id);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.redispatched, false);
  assert.equal(res.body.data.status, 'cancelled');

  const after = await loadRide(ride._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.biddingStatus, 'cancelled');
  assert.equal((await t.m.User.findById(rider.user._id).lean()).currentRideId, null);
  await waitFor(() => riderSocket.of('rideCancelled')[0], { message: 'rider told the ride is cancelled' });
  assert.equal((await loadDriver(driver.driver._id)).cancelTracking.count, 1, 'still counts as a cancel');
});

test('a blocked driver cannot place a bid either', async () => {
  const vehicle = await t.factories.vehicle({ dispatch_type: 'bidding' });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: rideBody(vehicle, { fare: 1000, serviceType: 'intercity', bookingMode: 'bidding', intercity: { fromCity: 'A', toCity: 'B', passengers: 1 } }),
  });
  const rideId = created.body.data.ride._id;

  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { 'cancelTracking.blockedUntil': new Date(Date.now() + 3600 * 1000) } });
  await assert.rejects(
    t.rideService.submitRideBid({ rideId, driverId: driver.driver._id, bidFare: 1000 }),
    (error) => error.statusCode === 403 && error.details?.code === 'DRIVER_CANCEL_BLOCKED',
  );

  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { 'cancelTracking.blockedUntil': null } });
  const ok = await t.rideService.submitRideBid({ rideId, driverId: driver.driver._id, bidFare: 1000 });
  assert.equal(ok.bid.bidFare, 1000, 'unblocked driver can bid');
});
