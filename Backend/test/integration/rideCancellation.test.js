// Real-database tests: every cancelled ride stores and returns `cancellation { by, at, code, reason, fee, ... }`.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const rideBody = (vehicle, overrides = {}) => ({
  pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', ...overrides,
});
const loadRide = (id) => t.m.Ride.findById(id).lean();
const bookTaxi = async (rider, vehicle, overrides) => {
  const res = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle, overrides) });
  assert.equal(res.status, 201, res.text);
  return res.body.data.ride._id;
};
const feeVehicle = (fee = 25) => t.factories.vehicle({ setPrice: { user_cancellation_fee_type: 'fixed', user_cancellation_fee: fee, cancellation_fee_goes_to: 'admin', driver_cancellation_fee_type: 'fixed', driver_cancellation_fee: 40 } });

test('a ride that is not cancelled has cancellation: null', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const rideId = await bookTaxi(rider, vehicle);
  const res = await t.api('GET', `/rides/${rideId}`, { token: rider.token });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.cancellation, null, 'no cancellation yet');
});

test('rider cancel: by user, their reason, the fee actually charged; returned by the cancel API and the ride', async () => {
  const vehicle = await feeVehicle(25);
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 500);
  const rideId = await bookTaxi(rider, vehicle);

  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token, body: { reason: 'Driver too far away' } });
  assert.equal(cancel.status, 200, cancel.text);
  const block = cancel.body.data.cancellation;
  assert.equal(block.by, 'user');
  assert.equal(block.code, 'cancelled_by_user');
  assert.equal(block.reason, 'Driver too far away');
  assert.equal(block.fee, 25);
  assert.equal(block.feeStatus, 'charged');
  assert.equal(block.feeGoesTo, 'admin');
  assert.ok(block.at && Date.now() - new Date(block.at).getTime() < 60_000);

  const stored = await loadRide(rideId);
  assert.equal(stored.cancellation.by, 'user');
  assert.equal(stored.cancellation.fee, 25);

  const later = await t.api('GET', `/rides/${rideId}`, { token: rider.token });
  assert.equal(later.body.data.cancellation.reason, 'Driver too far away');
});

test('rider cancel with no wallet balance: fee was due but not charged', async () => {
  const vehicle = await feeVehicle(25);
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 0);
  const rideId = await bookTaxi(rider, vehicle);

  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.body.data.cancellation.fee, 0);
  assert.equal(cancel.body.data.cancellation.feeStatus, 'not_charged');
  assert.equal(cancel.body.data.cancellation.reason, 'Cancelled by rider', 'default reason');
});

test('a very long reason is cut to 300 characters', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const rideId = await bookTaxi(rider, vehicle);
  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token, body: { reason: 'x'.repeat(500) } });
  assert.equal(cancel.body.data.cancellation.reason.length, 300);
});

test('admin cancel: by admin', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const rideId = await bookTaxi(rider, vehicle);
  await t.dispatchService.cancelRideByAdmin(rideId);
  const ride = await loadRide(rideId);
  assert.equal(ride.cancellation.by, 'admin');
  assert.equal(ride.cancellation.code, 'cancelled_by_admin');

  // a repeat admin cancel keeps the original record
  const firstAt = ride.cancellation.at;
  await t.dispatchService.cancelRideByAdmin(rideId);
  assert.equal(String((await loadRide(rideId)).cancellation.at), String(firstAt));
});

test('driver cancels an upcoming scheduled ride: by driver, with the driver fee', async () => {
  const vehicle = await feeVehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await bookTaxi(rider, vehicle, { scheduledAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString() });
  await t.acceptRide(rideId, driver.driver._id);

  const res = await t.api('POST', `/drivers/scheduled-rides/${rideId}/cancel`, { token: driver.token, body: {} });
  assert.equal(res.status, 200, res.text);
  const ride = await loadRide(rideId);
  assert.equal(ride.cancellation.by, 'driver');
  assert.equal(ride.cancellation.code, 'cancelled_by_driver');
  assert.equal(ride.cancellation.fee, 40);
  assert.equal(ride.cancellation.feeGoesTo, 'user');

  const riderView = await t.api('GET', `/rides/${rideId}`, { token: rider.token });
  assert.equal(riderView.body.data.cancellation.by, 'driver');
});

test('driver cancel on a bidding ride cancels it: by driver with the driver\'s reason; a re-opened ride has no cancellation', async () => {
  const bidVehicle = await t.factories.vehicle({ dispatch_type: 'bidding' });
  const driver = await t.factories.driver({ vehicleTypeId: bidVehicle._id });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: rideBody(bidVehicle, { fare: 1000, serviceType: 'intercity', bookingMode: 'bidding', intercity: { fromCity: 'Indore', toCity: 'Bhopal', passengers: 1 } }),
  });
  const ride = created.body.data.ride;
  const bid = await t.rideService.submitRideBid({ rideId: ride._id, driverId: driver.driver._id, bidFare: 1000 });
  const accepted = await t.rideService.acceptRideBidAssignment({ rideId: ride._id, bidId: bid.bid.id, userId: rider.user._id });
  await t.dispatchService.notifyRideAccepted(accepted);
  const res = await t.api('POST', `/rides/${ride._id}/driver-cancel`, { token: driver.token, body: { reason: 'Vehicle broke down' } });
  assert.equal(res.status, 200, res.text);
  const stored = await loadRide(ride._id);
  assert.equal(stored.cancellation.by, 'driver');
  assert.equal(stored.cancellation.reason, 'Vehicle broke down');

  // normal ride: the driver cancel re-opens the search, so the ride itself is NOT cancelled
  const vehicle = await t.factories.vehicle();
  const driver2 = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider2 = await t.factories.user();
  const rideId = await bookTaxi(rider2, vehicle);
  await t.acceptRide(rideId, driver2.driver._id);
  await t.api('POST', `/rides/${rideId}/driver-cancel`, { token: driver2.token, body: { reason: 'x' } });
  const reopened = await loadRide(rideId);
  assert.equal(reopened.status, 'searching');
  assert.equal(reopened.cancellation?.by || '', '');
});

test('system cancels: no driver found, and goods advance not paid in time', async () => {
  await t.setSettings('transport_ride', { trip_accept_reject_duration_for_driver: '1', maximum_time_for_find_drivers_for_regular_ride: '2' });
  try {
    const vehicle = await t.factories.vehicle(); // no driver for this vehicle type
    const rider = await t.factories.user();
    const rideId = await bookTaxi(rider, vehicle);
    const ride = await waitFor(async () => {
      const current = await loadRide(rideId);
      return current.status === 'cancelled' ? current : null;
    }, { timeout: 15000, message: 'no-driver cancel' });
    assert.equal(ride.cancellation.by, 'system');
    assert.equal(ride.cancellation.code, 'no_driver_found');
  } finally {
    await t.setSettings('transport_ride', { trip_accept_reject_duration_for_driver: '15', maximum_time_for_find_drivers_for_regular_ride: '300' });
  }

  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const res = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' } },
  });
  assert.equal(res.status, 201, res.text);
  await t.m.Ride.updateOne({ _id: res.body.data.rideId }, { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } }, { timestamps: false, strict: false });
  await t.m.Ride.collection.updateOne({ _id: new t.mongoose.Types.ObjectId(res.body.data.rideId) }, { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } });
  await t.dispatchService.expireStaleAdvanceRides();
  const expired = await loadRide(res.body.data.rideId);
  assert.equal(expired.status, 'cancelled');
  assert.equal(expired.cancellation.by, 'system');
  assert.equal(expired.cancellation.code, 'advance_not_paid');
});

test('a new booking replacing an open one: the old one is cancelled by user with code replaced_by_new_booking', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const first = await bookTaxi(rider, vehicle);
  await bookTaxi(rider, vehicle);
  const old = await loadRide(first);
  assert.equal(old.status, 'cancelled');
  assert.equal(old.cancellation.by, 'user');
  assert.equal(old.cancellation.code, 'replaced_by_new_booking');
});

test('admin trip list rows carry the cancellation block', async () => {
  const admin = await t.factories.admin();
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const rideId = await bookTaxi(rider, vehicle);
  await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token, body: { reason: 'Changed plans' } });

  const list = await t.api('GET', '/admin/ride-requests?limit=100', { token: admin.token });
  assert.equal(list.status, 200, list.text);
  const rows = list.body.data?.results || [];
  const row = rows.find((item) => item.id === String(rideId));
  assert.ok(row, 'ride row found in the admin list');
  assert.equal(row.cancellation.by, 'user');
  assert.equal(row.cancellation.reason, 'Changed plans');
});

test('ride history (GET /rides and GET /deliveries) carries cancellation; null for rides that were not cancelled', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const cancelled = await bookTaxi(rider, vehicle);
  await t.api('PATCH', `/rides/${cancelled}/cancel`, { token: rider.token, body: { reason: 'Plans changed' } });
  const open = await bookTaxi(rider, vehicle);

  const history = await t.api('GET', '/rides', { token: rider.token });
  assert.equal(history.status, 200, history.text);
  const items = history.body.data.results || history.body.data;
  const a = items.find((item) => item.rideId === String(cancelled));
  const b = items.find((item) => item.rideId === String(open));
  assert.equal(a.cancellation.by, 'user');
  assert.equal(a.cancellation.reason, 'Plans changed');
  assert.equal(b.cancellation, null);
});

test('feeGoesTo is "driver" only when the driver really received the rider\'s cancellation fee', async () => {
  const vehicle = await t.factories.vehicle({ setPrice: { user_cancellation_fee_type: 'fixed', user_cancellation_fee: 30, cancellation_fee_goes_to: 'driver' } });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });

  // accepted ride: the fee is credited to the driver
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 500);
  const rideId = await bookTaxi(rider, vehicle);
  await t.acceptRide(rideId, driver.driver._id);
  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.body.data.cancellation.fee, 30);
  assert.equal(cancel.body.data.cancellation.feeGoesTo, 'driver');
  const credit = await t.m.WalletTransaction.findOne({ rideId, driverId: driver.driver._id }).lean();
  assert.ok(credit && credit.amount === 30, 'the driver wallet really got the fee');

  // no driver assigned yet: the setting says "driver" but nobody can receive it, so the platform keeps it
  const rider2 = await t.factories.user();
  await t.factories.wallet(rider2.user._id, 500);
  const searching = await bookTaxi(rider2, vehicle);
  const cancel2 = await t.api('PATCH', `/rides/${searching}/cancel`, { token: rider2.token });
  assert.equal(cancel2.body.data.cancellation.fee, 30);
  assert.equal(cancel2.body.data.cancellation.feeGoesTo, 'admin');
});
