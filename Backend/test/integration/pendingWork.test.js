// Real-database tests for the 13 Oct pending list: nearby drivers without identities (#7), vehicle images as
// URLs (#4), driven distance (#9), fast accept / rideAcceptFailed (#11), goods trip distance (#12), banners /
// map icons / logout (#15) and catalog-consistent driver vehicles (#18).
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
let admin;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const IDENTITY_KEYS = ['name', 'phone', 'vehicleNumber', 'vehicleMake', 'vehicleModel', 'vehicleColor', 'rating', '_id'];

const createRide = async (rider, vehicle, body = {}) => {
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', ...body },
  });
  assert.equal(created.status, 201, created.text);
  return String(created.body.data.ride._id);
};

// ------------------------------------------------------------------ #4 vehicle images
test('#4 base64 vehicle images are turned into files once; the catalog only ever sends URLs', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Inline Image Van' });
  await t.m.Vehicle.collection.updateOne({ _id: vehicle._id }, { $set: { image: TINY_PNG, map_icon: TINY_PNG } });

  const res = await fetch(`${t.baseUrl}/api/v1/users/vehicle-types`);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes('data:image'), 'no base64 in the response');
  assert.match(res.headers.get('cache-control') || '', /max-age=60/);
  const row = JSON.parse(text).data.results.find((item) => item.id === String(vehicle._id));
  assert.match(row.image, /\/uploads\/vehicles\/[0-9a-f]{40}\.png$/);
  assert.equal(row.map_icon, row.image, 'same picture, same file');

  const stored = await t.m.Vehicle.collection.findOne({ _id: vehicle._id });
  assert.equal(stored.image, row.image, 'the document now holds the URL');

  const icons = await (await fetch(`${t.baseUrl}/api/v1/users/vehicle-map-icons`)).json();
  const icon = icons.data.results.find((item) => item.vehicleTypeId === String(vehicle._id));
  assert.equal(icon.mapIconUrl, row.map_icon);
});

// ------------------------------------------------------------------ #7 available drivers
test('#7 nearby drivers: markers only, one call for all types, login required for the summary', async () => {
  const sedan = await t.factories.vehicle({ name: 'Marker Sedan' });
  const bike = await t.factories.vehicle({ name: 'Marker Bike', icon_types: 'bike' });
  const sedanDriver = await t.factories.driver({ vehicleTypeId: sedan._id, vehicleIconType: 'car', name: 'Secret Name', vehicleNumber: 'MP09SECRET' });
  await t.factories.driver({ vehicleTypeId: bike._id, vehicleIconType: 'bike', location: { type: 'Point', coordinates: [t.locations.pickup[0] + 0.01, t.locations.pickup[1]] } });
  const rider = await t.factories.user();
  const [lng, lat] = t.locations.pickup;

  const anonymous = await t.api('GET', `/rides/available-drivers/summary?lat=${lat}&lng=${lng}`);
  assert.equal(anonymous.status, 401);

  const res = await t.api('GET', `/rides/available-drivers/summary?lat=${lat}&lng=${lng}&vehicleTypeIds=${sedan._id},${bike._id}`, { token: rider.token });
  assert.equal(res.status, 200, res.text);
  const sedanRow = res.body.data.byVehicleType[String(sedan._id)];
  const bikeRow = res.body.data.byVehicleType[String(bike._id)];
  assert.equal(sedanRow.totalDrivers, 1);
  assert.equal(bikeRow.totalDrivers, 1);
  assert.ok(bikeRow.closestDriverDistanceMeters > 900 && bikeRow.closestDriverDistanceMeters < 1200, JSON.stringify(bikeRow));
  assert.ok(bikeRow.closestDriverEtaMinutes >= 1);
  assert.ok(!res.text.includes('Secret Name') && !res.text.includes('MP09SECRET') && !res.text.includes(String(sedanDriver.driver._id)));
  for (const marker of [...sedanRow.drivers, ...bikeRow.drivers]) {
    for (const key of IDENTITY_KEYS) assert.equal(marker[key], undefined, `marker has no ${key}`);
    assert.equal(marker.location.type, 'Point');
    assert.match(marker.markerId, /^[0-9a-f]{16}$/);
  }

  const again = await t.api('GET', `/rides/available-drivers/summary?lat=${lat}&lng=${lng}&vehicleTypeIds=${sedan._id}`, { token: rider.token });
  assert.equal(again.body.data.byVehicleType[String(sedan._id)].drivers[0].markerId, sedanRow.drivers[0].markerId, 'stable marker id');

  // the old per-type endpoint keeps its shape but no longer says who the drivers are
  const old = await t.api('GET', `/rides/available-drivers?vehicleTypeId=${sedan._id}&lat=${lat}&lng=${lng}`);
  assert.equal(old.status, 200);
  assert.equal(old.body.data.totalDrivers, 1);
  assert.ok(Number.isFinite(old.body.data.closestDriverDistanceMeters));
  for (const key of IDENTITY_KEYS) assert.equal(old.body.data.drivers[0][key], undefined, `old endpoint has no ${key}`);
});

// ------------------------------------------------------------------ #9 driven distance
test('#9 driven distance: summed from GPS while started, jitter and impossible jumps ignored', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const rideId = await createRide(rider, vehicle);
  await t.acceptRide(rideId, driver.driver._id);
  const move = (coordinates) => t.rideService.updateRideDriverLocation({ rideId, driverId: driver.driver._id, coordinates });
  const ageLastPoint = (seconds) => t.m.Ride.updateOne({ _id: rideId }, { $set: { 'travelAnchor.at': new Date(Date.now() - seconds * 1000) } });
  const driven = async () => Math.round((await t.m.Ride.findById(rideId).lean()).actualDistanceMeters);

  await move(t.locations.pickup);
  await ageLastPoint(60);
  await move([t.locations.pickup[0] + 0.005, t.locations.pickup[1]]); // ~514 m before the trip started
  assert.equal(await driven(), 0, 'nothing counts before the trip starts');

  await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'arriving', coordinates: t.locations.pickup } });
  await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'started' } });
  await move(t.locations.pickup);
  await ageLastPoint(60);
  await move([t.locations.pickup[0] + 0.005, t.locations.pickup[1]]); // ~514 m in 60 s
  const afterFirstLeg = await driven();
  assert.ok(afterFirstLeg > 480 && afterFirstLeg < 550, String(afterFirstLeg));

  await move([t.locations.pickup[0] + 0.005, t.locations.pickup[1] + 0.00001]); // ~1 m: jitter
  assert.equal(await driven(), afterFirstLeg);
  // crawling: 2 m steps are each below the jitter floor, but they add up from the anchor
  await ageLastPoint(60);
  for (let i = 1; i <= 5; i += 1) {
    await move([t.locations.pickup[0] + 0.005 + i * 0.00002, t.locations.pickup[1]]);
  }
  const afterCrawl = await driven();
  assert.ok(afterCrawl - afterFirstLeg >= 6 && afterCrawl - afterFirstLeg <= 12, `crawl ${afterCrawl - afterFirstLeg}`);
  await move([t.locations.pickup[0] + 0.3, t.locations.pickup[1]]); // ~30 km instantly: a bad fix
  assert.equal(await driven(), afterCrawl);

  await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'arrived' } });
  await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'completed' } });
  const ride = (await t.api('GET', `/rides/${rideId}`, { token: rider.token })).body.data;
  assert.equal(Math.round(ride.actualDistanceMeters), afterCrawl);
  const me = (await t.api('GET', '/drivers/me', { token: driver.token })).body.data;
  const today = me.todaySummary || me.driver?.todaySummary;
  assert.equal(Math.round(today.distanceMeters), afterCrawl, "today's distance uses what was driven");
});

// ------------------------------------------------------------------ #11 accept
test('#11 accept answers right away (ack + rideAccepted); a lost race gets rideAcceptFailed', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Accept Sedan' });
  const a = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const b = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.setSettings('transport_ride', { trip_dispatch_type: '2' });
  try {
    const rider = await t.factories.user();
    const riderSocket = await t.connectSocket(rider.token);
    const rideId = await createRide(rider, vehicle);
    await waitFor(async () => (await t.m.Ride.findById(rideId).lean()).dispatchTracking.notifiedDriverIds.length >= 2, { message: 'both offered' });

    const socketA = await t.connectSocket(a.token);
    const socketB = await t.connectSocket(b.token);
    const ackA = await new Promise((resolve) => socketA.socket.emit('acceptRide', { rideId }, resolve));
    assert.equal(ackA.ok, true, JSON.stringify(ackA));
    assert.equal(ackA.rideId, rideId);
    await waitFor(() => socketA.of('rideAccepted')[0], { message: 'rideAccepted to A' });
    await waitFor(() => riderSocket.of('rideAccepted').length, { message: 'rider told in the background' });

    const ackB = await new Promise((resolve) => socketB.socket.emit('acceptRide', { rideId }, resolve));
    assert.equal(ackB.ok, false);
    assert.equal(ackB.code, 'RIDE_NOT_AVAILABLE');
    const failed = await waitFor(() => socketB.of('rideAcceptFailed')[0], { message: 'rideAcceptFailed to B' });
    assert.equal(failed.payload.rideId, rideId);
    assert.equal(failed.payload.code, 'RIDE_NOT_AVAILABLE');
    assert.ok(failed.payload.reason);
    assert.ok(socketB.of('errorMessage').length, 'older builds still get errorMessage');

    // no ack callback (older app builds) still works
    const other = await createRide(await t.factories.user(), vehicle);
    await waitFor(async () => (await t.m.Ride.findById(other).lean()).dispatchTracking.notifiedDriverIds.length >= 1, { message: 'offered' });
    socketB.socket.emit('acceptRide', { rideId: other });
    await waitFor(async () => String((await t.m.Ride.findById(other).lean()).driverId || '') !== '', { message: 'accepted without ack' });
  } finally {
    await t.setSettings('transport_ride', { trip_dispatch_type: '1' });
  }
});

// ------------------------------------------------------------------ #12 goods distance
test('#12 goods booking saves the trip distance/duration and prices from it (quote = booking)', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Goods Distance Van' }); // base 100 for 1 km, then 10/km
  const rider = await t.factories.user();
  const body = { vehicleTypeId: String(vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop };

  const quote = await t.api('POST', '/deliveries/quote', { token: rider.token, body: { ...body, estimatedDistanceMeters: 5000, estimatedDurationMinutes: 18 } });
  assert.equal(quote.status, 200, quote.text);
  assert.equal(quote.body.data.estimatedDistanceMeters, 5000);
  assert.equal(quote.body.data.distanceSource, 'route');
  const booking = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: { ...body, paymentMethod: 'cash', parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' }, estimatedDistanceMeters: 5000, estimatedDurationMinutes: 18 },
  });
  assert.equal(booking.status, 201, booking.text);
  const ride = await t.m.Ride.findById(booking.body.data.rideId).lean();
  assert.equal(ride.estimatedDistanceMeters, 5000);
  assert.equal(ride.estimatedDurationMinutes, 18);
  assert.equal(ride.fare, quote.body.data.total, 'charged what was quoted');

  // nothing sent: the straight line (about 3 km here), and a duration from it; never 0
  const straight = await t.api('POST', '/deliveries/quote', { token: rider.token, body });
  assert.equal(straight.body.data.distanceSource, 'straight_line');
  assert.ok(straight.body.data.estimatedDistanceMeters > 2500 && straight.body.data.estimatedDistanceMeters < 3500, straight.text);
  assert.ok(straight.body.data.estimatedDurationMinutes > 0);

  // a "route" shorter than the straight line is not believed
  const tooShort = await t.api('POST', '/deliveries/quote', { token: rider.token, body: { ...body, estimatedDistanceMeters: 100 } });
  assert.equal(tooShort.body.data.distanceSource, 'straight_line');
  assert.equal(tooShort.body.data.total, straight.body.data.total);
});

// ------------------------------------------------------------------ #15 banners, logout
test('#15 banners: active ones with image URLs, newest first', async () => {
  const { Banner } = await import('../../src/modules/taxi/admin/promotions/models/Banner.js');
  await Banner.deleteMany({});
  await Banner.create({ title: 'Old', image: 'https://cdn.example.com/old.png', active: true, deep_link: 'rentol://offers', createdAt: new Date(Date.now() - 60000) });
  await Banner.create({ title: 'Hidden', image: 'https://cdn.example.com/hidden.png', active: false });
  await Banner.create({ title: 'Inline', image: TINY_PNG, active: true });
  await Banner.create({ title: 'New', image: 'https://cdn.example.com/new.png', active: true, external_link: 'https://rentol.in' });

  const res = await t.api('GET', '/users/banners');
  assert.equal(res.status, 200, res.text);
  const titles = res.body.data.results.map((item) => item.title);
  assert.deepEqual(titles, ['New', 'Old']);
  assert.equal(res.body.data.results[0].url, 'https://rentol.in');
  assert.equal(res.body.data.results[1].deepLink, 'rentol://offers');
  assert.deepEqual(res.body.data.results.map((item) => item.order), [1, 2]);
});

test('#15 logout: push tokens cleared and the old token stops working; a new login works', async () => {
  const rider = await t.factories.user({ fcmTokenMobile: 'phone-token-'.padEnd(40, 'x') });
  assert.equal((await t.api('GET', '/users/me', { token: rider.token })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // JWT times are whole seconds

  const out = await t.api('POST', '/users/logout', { token: rider.token });
  assert.equal(out.status, 200, out.text);
  const stored = await t.m.User.findById(rider.user._id).lean();
  assert.equal(stored.fcmTokenMobile, '');

  const stale = await t.api('GET', '/users/me', { token: rider.token });
  assert.equal(stale.status, 401);
  assert.equal(stale.body.code, 'SESSION_ENDED');
  await assert.rejects(t.connectSocket(rider.token), 'the socket refuses the old token too');

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const fresh = t.tokenFor(rider.user._id, 'user');
  assert.equal((await t.api('GET', '/users/me', { token: fresh })).status, 200);
});

// ------------------------------------------------------------------ #18 driver vehicle follows the catalog
test('#18 admin driver edit: type and icon follow the catalog vehicle; an unknown vehicle is refused', async () => {
  const truck = await t.factories.vehicle({ name: 'Heavy Truck', icon_types: 'truck' });
  const bike = await t.factories.vehicle({ name: 'City Bike', icon_types: 'bike' });
  const driver = await t.factories.driver({ vehicleType: 'car', vehicleIconType: 'car' });
  const edit = (body) => t.api('PATCH', `/admin/drivers/${driver.driver._id}`, { token: admin.token, body });

  assert.equal((await edit({ vehicle_type_id: String(truck._id) })).status, 200);
  let stored = await t.m.Driver.findById(driver.driver._id).lean();
  assert.equal(stored.vehicleIconType, 'truck');
  assert.equal(String(stored.vehicleTypeId), String(truck._id));

  assert.equal((await edit({ vehicle_type_id: String(bike._id), vehicle_type: 'car' })).status, 200);
  stored = await t.m.Driver.findById(driver.driver._id).lean();
  assert.equal(stored.vehicleType, 'bike', 'the catalog wins over a free-text type');
  assert.equal(stored.vehicleIconType, 'bike');

  const unknown = await edit({ vehicle_type_id: String(new t.mongoose.Types.ObjectId()) });
  assert.equal(unknown.status, 400);
  assert.equal(String((await t.m.Driver.findById(driver.driver._id).lean()).vehicleTypeId), String(bike._id), 'unchanged');
});

test('#10 during a ride the ride location updates keep the online heartbeat alive', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rideId = await createRide(await t.factories.user(), vehicle);
  await t.acceptRide(rideId, driver.driver._id);
  const stale = new Date(Date.now() - 30 * 60 * 1000);
  await t.m.Driver.updateOne({ _id: driver.driver._id }, { $set: { 'incentiveTracking.lastSeenAt': stale } });
  await t.rideService.updateRideDriverLocation({ rideId, driverId: driver.driver._id, coordinates: t.locations.pickup });
  await waitFor(async () => {
    const seen = (await t.m.Driver.findById(driver.driver._id).lean()).incentiveTracking?.lastSeenAt;
    return seen && new Date(seen) > stale;
  }, { message: 'heartbeat refreshed by the ride location' });
});

test('#7 the heading from the driver app reaches the map marker', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Heading Sedan' });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const socket = await t.connectSocket(driver.token);
  socket.socket.emit('locationUpdate', { coordinates: t.locations.pickup, heading: 450 });
  await waitFor(async () => (await t.m.Driver.findById(driver.driver._id).lean()).heading === 90, { message: 'heading saved (normalised)' });
  const rider = await t.factories.user();
  const [lng, lat] = t.locations.pickup;
  const res = await t.api('GET', `/rides/available-drivers/summary?lat=${lat}&lng=${lng}&vehicleTypeIds=${vehicle._id}`, { token: rider.token });
  assert.equal(res.body.data.byVehicleType[String(vehicle._id)].drivers[0].heading, 90);
});

test('#4 an image that cannot be converted stays in the database (not erased) and is left out of the response', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Broken Image Van' });
  const broken = 'data:text/plain;base64,aGVsbG8=';
  // an admin edit clears the 1-minute catalog cache, so the next read really loads (and tries to convert) it
  const touched = await t.api('PATCH', `/admin/types/vehicle-types/${vehicle._id}`, { token: admin.token, body: { description: 'cache bust' } });
  assert.equal(touched.status, 200, touched.text);
  await t.m.Vehicle.collection.updateOne({ _id: vehicle._id }, { $set: { image: broken } });
  const res = await fetch(`${t.baseUrl}/api/v1/users/vehicle-types`).then((r) => r.text());
  const row = JSON.parse(res).data.results.find((item) => item.id === String(vehicle._id));
  assert.ok(row, 'the vehicle is in this (uncached) catalog');
  assert.equal(row.image, '', 'never sent');
  assert.ok(!res.includes('data:text/plain'));
  assert.equal((await t.m.Vehicle.collection.findOne({ _id: vehicle._id })).image, broken, 'kept for a later retry');
});
