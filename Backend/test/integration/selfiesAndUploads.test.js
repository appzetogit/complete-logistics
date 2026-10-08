// Real-database tests: zone-edge search radius, upload hardening, accept-selfie flags,
// goods pickup/drop selfies, cancel preview and quotes covered by free rides.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfie-uploads-'));
process.env.UPLOAD_DIR = uploadDir;
process.env.PUBLIC_BACKEND_URL = '';

const { bootstrap, waitFor } = await import('./harness.js');

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  await t.setSettings('transport_ride', { goods_advance_percent: '20' });
});
after(async () => {
  await t.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const setup = async (vehicleOptions = {}) => {
  const vehicle = await t.factories.vehicle({ commission: 10, ...vehicleOptions });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 5000);
  return { vehicle, rider, driver };
};

const bookGoods = async ({ vehicle, rider }) => {
  const res = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, pickupAddress: 'A', dropAddress: 'B',
      vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
    },
  });
  assert.equal(res.status, 201, res.text);
  return res.body.data;
};

const payAdvance = (rider, rideId) => t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
const loadRide = (rideId) => t.m.Ride.findById(rideId).lean();
const patchStatus = (driver, rideId, body) => t.api('PATCH', `/rides/${rideId}/status`, { token: driver.token, body });

// ------------------------------------------------------------------ C3
test('C3: a pickup close to the zone edge still searches the full radius', async () => {
  const { matchDrivers } = await import('../../src/modules/taxi/services/matchingService.js');
  const location = await t.mongoose.model('TaxiServiceLocation').create({
    name: 'Edge City', service_location_name: 'Edge City', latitude: 22.7, longitude: 75.85,
    location: { type: 'Point', coordinates: [75.85, 22.7] },
  });
  const zone = await t.mongoose.model('TaxiZone').create({
    name: 'Edge Zone',
    service_location_id: location._id,
    geometry: { type: 'Polygon', coordinates: [[[75.80, 22.65], [75.90, 22.65], [75.90, 22.75], [75.80, 22.75], [75.80, 22.65]]] },
  });
  const vehicle = await t.factories.vehicle();
  // ~280 m from the north edge of the zone, driver ~1 km south of the pickup, inside the zone
  const pickup = [75.85, 22.7475];
  const driver = await t.factories.driver({
    vehicleTypeId: vehicle._id,
    zoneId: zone._id,
    service_location_id: location._id,
    location: { type: 'Point', coordinates: [75.85, 22.7385] },
  });

  const result = await matchDrivers(pickup, { maxDistance: 2000, vehicleTypeId: vehicle._id, serviceLocationId: location._id });
  assert.equal(result.searchRadiusMeters, 2000, 'radius is not shrunk to the edge distance');
  assert.ok(result.drivers.some((item) => String(item._id) === String(driver.driver._id)), 'the driver 1 km away is found');
});

// ------------------------------------------------------------------ C8
test('C8: image upload needs a login, accepts only images and returns an absolute URL in the one upload folder', async () => {
  const rider = await t.factories.user();

  const anonymous = await t.api('POST', '/common/upload/image', { body: { image: PNG, folder: 'selfies' } });
  assert.equal(anonymous.status, 401);

  const html = await t.api('POST', '/common/upload/image', { token: rider.token, body: { image: 'data:text/html;base64,PGgxPmhpPC9oMT4=', folder: 'x' } });
  assert.equal(html.status, 400);
  const svg = await t.api('POST', '/common/upload/image', { token: rider.token, body: { image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', folder: 'x' } });
  assert.equal(svg.status, 400);

  const ok = await t.api('POST', '/common/upload/image', { token: rider.token, body: { image: PNG, folder: 'selfies' } });
  assert.equal(ok.status, 200, ok.text);
  assert.match(ok.body.data.url, /^https?:\/\/[^/]+\/uploads\/.+\.png$/, 'absolute URL even when PUBLIC_BACKEND_URL is not set');

  const relative = new URL(ok.body.data.url).pathname.replace(/^\/uploads\//, '');
  assert.ok(fs.existsSync(path.join(uploadDir, relative)), 'file is in UPLOAD_DIR');

  const { env } = await import('../../src/config/env.js');
  assert.equal(path.resolve(env.uploads.dir), path.resolve(env.uploadDir), 'both upload stores share one folder');

  const driver = await t.factories.driver();
  const asDriver = await t.api('POST', '/common/upload/image', { token: driver.token, body: { image: PNG, folder: 'selfies' } });
  assert.equal(asDriver.status, 200, asDriver.text);
});

// ------------------------------------------------------------------ C9
test('C9: the driver is told the accept selfie is still owed (accept event, active ride) until it is uploaded', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const delivery = await bookGoods(ctx);
  await payAdvance(ctx.rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);

  const accepted = await waitFor(() => live.of('rideAccepted')[0], { message: 'rideAccepted for the driver' });
  assert.equal(accepted.payload.acceptSelfieRequired, true);

  const active = await t.api('GET', '/rides/active/me', { token: ctx.driver.token });
  assert.equal(active.body.data.acceptSelfieRequired, true);
  const riderView = await t.api('GET', '/rides/active/me', { token: ctx.rider.token });
  assert.equal(riderView.body.data.acceptSelfieRequired, undefined, 'the rider never sees selfie fields');

  const attach = await t.api('PATCH', `/rides/${delivery.rideId}/accept-selfie`, { token: ctx.driver.token, body: { selfieUrl: 'https://example.com/me.jpg' } });
  assert.equal(attach.status, 200, attach.text);
  const after = await t.api('GET', '/rides/active/me', { token: ctx.driver.token });
  assert.equal(after.body.data.acceptSelfieRequired, false);
});

test('C9: an accepted ride scheduled in the future is still returned to the driver while its selfie is missing', async () => {
  const ctx = await setup();
  const delivery = await bookGoods(ctx);
  await payAdvance(ctx.rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  await t.m.Ride.updateOne({ _id: delivery.rideId }, { $set: { scheduledAt: new Date(Date.now() + 24 * 3600 * 1000) } });

  const before = await t.api('GET', '/rides/active/me', { token: ctx.driver.token });
  assert.equal(before.body.data?.rideId, delivery.rideId, 'returned so the selfie screen can open');
  assert.equal(before.body.data.acceptSelfieRequired, true);

  await t.api('PATCH', `/rides/${delivery.rideId}/accept-selfie`, { token: ctx.driver.token, body: { selfieUrl: 'https://example.com/me.jpg' } });
  const after = await t.api('GET', '/rides/active/me', { token: ctx.driver.token });
  assert.equal(after.body.data ?? null, null, 'once the selfie is in, a future scheduled ride is not "active" again');
});

// ------------------------------------------------------------------ C10
const runToStep = async (ctx, delivery, steps) => {
  for (const step of steps) {
    const res = await patchStatus(ctx.driver, delivery.rideId, step);
    assert.equal(res.status, 200, `${step.status}: ${res.text}`);
  }
};

test('C10: goods pickup/drop selfies are stored for admin and never shown to the rider; optional by default', async () => {
  await t.setSettings('transport_ride', { goods_selfie_required: '0' });
  const ctx = await setup();
  const delivery = await bookGoods(ctx);
  await payAdvance(ctx.rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);

  await runToStep(ctx, delivery, [
    { status: 'arriving' },
    { status: 'goods_loaded', proofImageUrl: 'https://example.com/goods1.jpg', selfieImageUrl: 'https://example.com/self1.jpg' },
    { status: 'started' },
    { status: 'arrived' },
    // no selfie at the drop: allowed while the setting is off
    { status: 'goods_delivered', proofImageUrl: 'https://example.com/goods2.jpg' },
  ]);

  let ride = await loadRide(delivery.rideId);
  assert.equal(ride.parcel.pickupSelfie.imageUrl, 'https://example.com/self1.jpg');
  assert.equal(ride.parcel.pickupProof.imageUrl, 'https://example.com/goods1.jpg');

  const driverView = await t.api('GET', `/rides/${delivery.rideId}`, { token: ctx.driver.token });
  assert.equal(driverView.body.data.parcel.pickupSelfie.imageUrl, 'https://example.com/self1.jpg', 'driver sees their own');

  const riderView = await t.api('GET', `/rides/${delivery.rideId}`, { token: ctx.rider.token });
  assert.equal(riderView.status, 200, riderView.text);
  assert.equal(riderView.body.data.parcel.pickupSelfie, undefined, 'rider never sees the selfie');
  assert.equal(riderView.body.data.parcel.dropSelfie, undefined);
  assert.equal(riderView.body.data.parcel.pickupProof.imageUrl, 'https://example.com/goods1.jpg', 'the goods photo stays visible');
  const riderActive = await t.api('GET', '/deliveries/active/me', { token: ctx.rider.token });
  assert.equal(riderActive.body.data?.parcel?.pickupSelfie, undefined);
  assert.ok(ride.parcel.dropSelfie === undefined || !ride.parcel.dropSelfie?.imageUrl);
});

test('C10: with goods_selfie_required on, both steps need the selfie', async () => {
  await t.setSettings('transport_ride', { goods_selfie_required: '1' });
  try {
    const ctx = await setup();
    const delivery = await bookGoods(ctx);
    await payAdvance(ctx.rider, delivery.rideId);
    await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
    await patchStatus(ctx.driver, delivery.rideId, { status: 'arriving' });

    const noSelfie = await patchStatus(ctx.driver, delivery.rideId, { status: 'goods_loaded', proofImageUrl: 'https://example.com/g.jpg' });
    assert.equal(noSelfie.status, 400);
    assert.match(noSelfie.body.message, /selfie/i);

    const ok = await patchStatus(ctx.driver, delivery.rideId, { status: 'goods_loaded', proofImageUrl: 'https://example.com/g.jpg', selfieImageUrl: 'https://example.com/s.jpg' });
    assert.equal(ok.status, 200, ok.text);
    await patchStatus(ctx.driver, delivery.rideId, { status: 'started' });
    await patchStatus(ctx.driver, delivery.rideId, { status: 'arrived' });
    const dropNoSelfie = await patchStatus(ctx.driver, delivery.rideId, { status: 'goods_delivered', proofImageUrl: 'https://example.com/g2.jpg' });
    assert.equal(dropNoSelfie.status, 400);
    const dropOk = await patchStatus(ctx.driver, delivery.rideId, { status: 'goods_delivered', proofImageUrl: 'https://example.com/g2.jpg', selfieImageUrl: 'https://example.com/s2.jpg' });
    assert.equal(dropOk.status, 200, dropOk.text);
    assert.equal((await loadRide(delivery.rideId)).parcel.dropSelfie.imageUrl, 'https://example.com/s2.jpg');
  } finally {
    await t.setSettings('transport_ride', { goods_selfie_required: '0' });
  }
});

test('C10: the admin ride details carry the pickup and drop selfie URLs', async () => {
  const admin = await t.factories.admin();
  const ctx = await setup();
  const delivery = await bookGoods(ctx);
  await payAdvance(ctx.rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  await runToStep(ctx, delivery, [
    { status: 'arriving' },
    { status: 'goods_loaded', proofImageUrl: 'https://example.com/g.jpg', selfieImageUrl: 'https://example.com/s1.jpg' },
  ]);
  const list = await t.api('GET', '/admin/deliveries?limit=100', { token: admin.token });
  assert.equal(list.status, 200, list.text);
  const rows = list.body.data?.results || list.body.data?.rows || list.body.data || [];
  const code = String(delivery.rideId);
  const row = rows.find((item) => item.id === String(delivery.rideId));
  assert.ok(row, `admin delivery row ${code} found among ${JSON.stringify(rows.map((item) => item.id))} (status ${list.status}, keys ${Object.keys(list.body.data || {})})`);
  assert.equal(row.pickupSelfieUrl, 'https://example.com/s1.jpg');
  assert.equal(row.dropSelfieUrl, '');
});

// ------------------------------------------------------------------ C12
test('C12: cancel preview shows the cancellation fee and the advance that would be forfeited', async () => {
  const ctx = await setup({ setPrice: { user_cancellation_fee_type: 'fixed', user_cancellation_fee: 30, cancellation_fee_goes_to: 'admin' } });
  const delivery = await bookGoods(ctx);

  const unpaid = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(unpaid.status, 200, unpaid.text);
  assert.equal(unpaid.body.data.advanceForfeited, false, 'nothing paid yet, nothing to lose');
  assert.equal(unpaid.body.data.advanceAmount, 0);
  assert.equal(unpaid.body.data.advanceRefundable, false);
  assert.equal(typeof unpaid.body.data.fee, 'number');

  await payAdvance(ctx.rider, delivery.rideId);
  const paid = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(paid.body.data.advanceForfeited, true);
  assert.equal(paid.body.data.advanceAmount, delivery.goodsAdvance.amount);

  const stranger = await t.factories.user();
  const foreign = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: stranger.token });
  assert.equal(foreign.status, 404);
  const anonymous = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`);
  assert.equal(anonymous.status, 401);

  // the preview changes nothing
  assert.equal((await loadRide(delivery.rideId)).status, 'searching');

  await t.api('PATCH', `/rides/${delivery.rideId}/cancel`, { token: ctx.rider.token });
  const done = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(done.status, 409);
});

test('C12: the fee in the preview is the fee a plain taxi cancel really charges', async () => {
  const ctx = await setup({ setPrice: { user_cancellation_fee_type: 'fixed', user_cancellation_fee: 25, cancellation_fee_goes_to: 'admin' } });
  const res = await t.api('POST', '/rides', {
    token: ctx.rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(ctx.vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(res.status, 201, res.text);
  const rideId = res.body.data.ride._id;

  const preview = await t.api('GET', `/rides/${rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(preview.body.data.fee, 25);
  assert.equal(preview.body.data.feeGoesTo, 'admin');
  assert.equal(preview.body.data.walletCoversFee, true);
  assert.equal(preview.body.data.advanceForfeited, false);

  const before = (await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean()).balance;
  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: ctx.rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  const after = (await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean()).balance;
  assert.equal(before - after, 25, 'the preview matched the actual charge');
});

// ------------------------------------------------------------------ C11
test('C11: when free rides are on, /users/me carries maxFare and the goods quote says the ride is covered (no advance)', async () => {
  await t.setSettings('free_rides', { enabled: '1', limit: '3', max_fare: '500' });
  try {
    const ctx = await setup();
    const me = await t.api('GET', '/users/me', { token: ctx.rider.token });
    assert.equal(me.status, 200, me.text);
    const freeRides = me.body.data.user?.freeRides || me.body.data.freeRides;
    assert.deepEqual(freeRides, { enabled: true, limit: 3, used: 0, left: 3, maxFare: 500 });

    const quote = await t.api('POST', '/deliveries/quote', {
      token: ctx.rider.token,
      body: { vehicleTypeId: String(ctx.vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop },
    });
    assert.equal(quote.status, 200, quote.text);
    assert.equal(quote.body.data.coveredBy, 'free_ride');
    assert.equal(quote.body.data.freeRide.covered, true);
    assert.equal(quote.body.data.advanceAmount, 0);
    assert.equal(quote.body.data.remainingAmount, 0);
    assert.deepEqual(quote.body.data.advanceOptions, []);

    // and the booking agrees with the quote: free, no advance
    const delivery = await bookGoods(ctx);
    assert.equal(delivery.goodsAdvance.status, 'none');
    assert.equal(delivery.freeRide.covered, true);
  } finally {
    await t.setSettings('free_rides', { enabled: '0' });
  }
});
