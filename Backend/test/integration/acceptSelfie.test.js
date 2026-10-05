// Real-database + real-socket tests: the accept selfie is admin/driver only, never the rider.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const SELFIE = 'https://cdn.example.com/selfies/accept-123.jpg';
const LATE_SELFIE = 'https://cdn.example.com/selfies/late-456.jpg';

const rideBody = (vehicle) => ({
  pickup: t.locations.pickup,
  drop: t.locations.drop,
  fare: 120,
  vehicleTypeId: String(vehicle._id),
  paymentMethod: 'cash',
});

const containsSelfie = (value) => JSON.stringify(value).includes('cdn.example.com/selfies');

test('rider never sees the selfie, over REST or sockets; driver and admin do', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({
    vehicleTypeId: vehicle._id,
    name: 'Asha Driver',
    profileImage: 'https://cdn.example.com/profiles/asha.jpg',
    vehicleNumber: 'MP09XY7777',
    vehicleModel: 'Dzire',
  });
  const admin = await t.factories.admin();

  const riderSocket = await t.connectSocket(rider.token);
  const driverSocket = await t.connectSocket(driver.token);

  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle) });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  riderSocket.socket.emit('ride:join', { rideId });
  await waitFor(() => riderSocket.of('ride:joined')[0], { message: 'rider joined ride room' });

  // driver accepts through the real socket event, with a selfie
  await waitFor(() => driverSocket.of('rideRequest')[0], { message: 'ride request reaches driver' });
  driverSocket.socket.emit('acceptRide', { rideId, selfieUrl: SELFIE });
  await waitFor(() => driverSocket.of('rideAccepted')[0], { message: 'driver accept confirmation' });
  await waitFor(() => riderSocket.of('rideAccepted')[0], { message: 'rider told the ride was accepted' });

  // selfie is stored for admin
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.equal(stored.acceptSelfie.imageUrl, SELFIE);

  // trigger room broadcasts: REST status update and a socket status update
  assert.equal((await t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body: { status: 'arriving' } })).status, 200);
  driverSocket.socket.emit('ride:join', { rideId });
  await waitFor(() => driverSocket.of('ride:joined')[0], { message: 'driver joined ride room' });
  driverSocket.socket.emit('ride:status:update', { rideId, status: 'started' });
  await waitFor(() => riderSocket.of('ride:state').length >= 2, { message: 'room ride:state broadcasts' });
  riderSocket.socket.emit('ride:rejoin-current');
  await sleep(500);

  // ---- rider: nothing anywhere ----
  assert.equal(containsSelfie(riderSocket.events), false, 'no rider socket event carries the selfie');
  assert.ok(riderSocket.of('ride:state').length >= 2);

  const riderViews = [
    await t.api('GET', `/rides/${rideId}`, { token: rider.token }),
    await t.api('GET', '/rides/active/me', { token: rider.token }),
    await t.api('GET', '/rides', { token: rider.token }),
  ];
  for (const view of riderViews) {
    assert.equal(view.status, 200, view.text);
    assert.equal(view.text.includes('cdn.example.com/selfies'), false, 'rider REST response has no selfie');
    assert.equal(view.text.includes('acceptSelfie'), false, 'not even the key');
  }

  // the rider still gets everything needed to recognise the driver
  const riderRide = riderViews[0].body.data;
  assert.equal(riderRide.driverId.name, 'Asha Driver');
  assert.equal(riderRide.driverId.profileImage, 'https://cdn.example.com/profiles/asha.jpg');
  assert.equal(riderRide.driverId.vehicleNumber, 'MP09XY7777');
  assert.equal(riderRide.driverId.vehicleModel, 'Dzire');
  const active = riderViews[1].body.data;
  assert.equal(active.driver.profileImage, 'https://cdn.example.com/profiles/asha.jpg');
  assert.equal(active.driver.vehicleNumber, 'MP09XY7777');

  // ---- driver: own selfie is still there ----
  const driverById = await t.api('GET', `/rides/${rideId}`, { token: driver.token });
  assert.equal(driverById.body.data.acceptSelfie.imageUrl, SELFIE);
  const driverActive = await t.api('GET', '/rides/active/me', { token: driver.token });
  assert.equal(driverActive.body.data.acceptSelfie.imageUrl, SELFIE);

  // ---- admin: unchanged ----
  for (const path of ['/admin/ongoing-rides', '/admin/ride-requests']) {
    const res = await t.api('GET', path, { token: admin.token });
    assert.equal(res.status, 200, `${path}: ${res.text}`);
    assert.ok(res.text.includes(SELFIE), `${path} still shows the accept selfie`);
  }
});

test('late selfie upload (PATCH /accept-selfie): driver sees it, rider does not, DB has it', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const riderSocket = await t.connectSocket(rider.token);

  const created = await t.api('POST', '/rides', { token: rider.token, body: rideBody(vehicle) });
  const rideId = created.body.data.ride._id;
  riderSocket.socket.emit('ride:join', { rideId });
  await waitFor(() => riderSocket.of('ride:joined')[0], { message: 'rider joined' });

  await t.acceptRide(rideId, driver.driver._id); // accepted without a selfie, like the new driver app

  const upload = await t.api('PATCH', `/rides/${rideId}/accept-selfie`, { token: driver.token, body: { selfieUrl: LATE_SELFIE } });
  assert.equal(upload.status, 200, upload.text);
  assert.equal(upload.body.data.acceptSelfie.imageUrl, LATE_SELFIE, 'driver upload flow still returns the selfie');
  assert.equal((await t.m.Ride.findById(rideId).lean()).acceptSelfie.imageUrl, LATE_SELFIE);

  // validation unchanged
  const empty = await t.api('PATCH', `/rides/${rideId}/accept-selfie`, { token: driver.token, body: {} });
  assert.equal(empty.status, 400);
  // a rider cannot call the driver endpoint
  assert.equal((await t.api('PATCH', `/rides/${rideId}/accept-selfie`, { token: rider.token, body: { selfieUrl: LATE_SELFIE } })).status, 403);

  // driver status update response keeps carrying it; the room broadcast does not
  const status = await t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body: { status: 'arriving' } });
  assert.equal(status.body.data.acceptSelfie.imageUrl, LATE_SELFIE);

  await sleep(500);
  assert.equal(containsSelfie(riderSocket.events), false);
  const riderView = await t.api('GET', `/rides/${rideId}`, { token: rider.token });
  assert.equal(riderView.text.includes('cdn.example.com/selfies'), false);
});

test('goods bookings: the rider-facing delivery APIs hide the selfie too, the driver view keeps it', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 5000);

  const booked = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
    },
  });
  const rideId = booked.body.data.rideId;
  await t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
  await t.acceptRide(rideId, driver.driver._id, SELFIE);

  const deliveryId = booked.body.data.deliveryId;
  for (const path of [`/deliveries/${deliveryId}`, '/deliveries/active/me', '/deliveries']) {
    const res = await t.api('GET', path, { token: rider.token });
    assert.equal(res.status, 200, `${path}: ${res.text}`);
    assert.equal(res.text.includes('cdn.example.com/selfies'), false, `${path} hides the selfie from the rider`);
  }

  const driverView = await t.api('GET', `/deliveries/${deliveryId}`, { token: driver.token });
  assert.equal(driverView.body.data.acceptSelfie.imageUrl, SELFIE);
  const driverActive = await t.api('GET', '/deliveries/active/me', { token: driver.token });
  assert.equal(driverActive.body.data.acceptSelfie.imageUrl, SELFIE);

  const admin = await t.factories.admin();
  const adminDeliveries = await t.api('GET', '/admin/deliveries', { token: admin.token });
  assert.ok(adminDeliveries.text.includes(SELFIE), 'admin deliveries page still shows the selfie');
});
