// What the rider's app receives to draw the driver on the live-tracking map: a scooter must say bike / scooty,
// never car (the bug: driver.vehicleType was 'car' for a scooty and the ride's vehicleIconType was empty).
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => { t = await bootstrap(); });
after(async () => { await t.stop(); });

test('rider sees a scooty ride and a scooty driver as bike / scooty, not car', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Scooty Direct', icon_types: 'scooty', transport_type: 'taxi' });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id, vehicleType: 'bike', vehicleIconType: 'scooty', vehicleMake: 'TVS', vehicleModel: '133.3' });
  const rider = await t.factories.user();

  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 80, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' }, // no vehicleIconType, like the rider app
  });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);

  const active = await t.api('GET', '/rides/active/me', { token: rider.token });
  assert.equal(active.status, 200, active.text);
  const ride = active.body.data?.ride || active.body.data;
  assert.equal(ride.vehicleIconType, 'scooty', 'the ride carries the booked vehicle family (it used to be empty)');
  assert.equal(ride.vehicleType, 'Scooty Direct', 'and its name');
  const d = ride.driver || ride.driverId;
  assert.equal(d.vehicleIconType, 'scooty', 'the driver\'s real vehicle family');
  assert.equal(d.vehicleType, 'bike', 'the coarse class is bike, not car');
});
