// Real-database tests: goods requests must reach the driver (offer recovery, re-send on connect,
// retry instead of cancel, webhook / reconcile when the rider's verify call is lost, replaced bookings).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, waitFor } from './harness.js';

process.env.DISPATCH_ERROR_RETRY_DELAY_MS = '300';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const setup = async () => {
  const vehicle = await t.factories.vehicle({ commission: 10 });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 5000);
  return { vehicle, rider, driver };
};

const book = async ({ vehicle, rider }) => {
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

const payWithWallet = (rider, rideId) => t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
const loadRide = (rideId) => t.m.Ride.findById(rideId).lean();

test('GET /drivers/ride-offers returns the request the driver was offered, in the rideRequest shape', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const delivery = await book(ctx);

  const before = await t.api('GET', '/drivers/ride-offers', { token: ctx.driver.token });
  assert.equal(before.status, 200, before.text);
  assert.equal(before.body.data.results.length, 0, 'an unpaid booking is never offered');

  await payWithWallet(ctx.rider, delivery.rideId);
  const event = await waitFor(() => live.of('rideRequest').find((e) => e.payload.rideId === delivery.rideId), { message: 'rideRequest' });

  const res = await t.api('GET', '/drivers/ride-offers', { token: ctx.driver.token });
  assert.equal(res.status, 200, res.text);
  const offer = res.body.data.results.find((item) => item.rideId === delivery.rideId);
  assert.ok(offer, 'the open offer is listed');
  assert.equal(offer.fare, event.payload.fare);
  assert.equal(offer.remainingFare, event.payload.remainingFare);
  assert.equal(offer.goodsAdvance.status, 'paid');

  const noAuth = await t.api('GET', '/drivers/ride-offers');
  assert.equal(noAuth.status, 401);
  const other = await t.factories.driver({ vehicleTypeId: ctx.vehicle._id });
  const otherRes = await t.api('GET', '/drivers/ride-offers', { token: other.token });
  assert.equal(otherRes.body.data.results.length, 0, 'only the notified driver sees it');

  // once rejected it is no longer offered
  await t.m.Ride.updateOne({ _id: delivery.rideId }, { $addToSet: { 'dispatchTracking.rejectedDriverIds': String(ctx.driver.driver._id) } });
  const rejected = await t.api('GET', '/drivers/ride-offers', { token: ctx.driver.token });
  assert.equal(rejected.body.data.results.length, 0);
});

test('a driver whose socket was down gets the open request re-sent when it connects', async () => {
  const ctx = await setup();
  const delivery = await book(ctx);
  await payWithWallet(ctx.rider, delivery.rideId);
  // wait until the dispatch notified the driver (nobody was listening)
  await waitFor(async () => (await loadRide(delivery.rideId)).dispatchTracking.notifiedDriverIds.length > 0, { message: 'driver notified' });

  const late = await t.connectSocket(ctx.driver.token);
  const event = await waitFor(() => late.of('rideRequest').find((e) => e.payload.rideId === delivery.rideId), { message: 're-sent rideRequest' });
  assert.equal(event.payload.goodsAdvance.status, 'paid');
});

test('a transient error while matching retries instead of cancelling the paid booking', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const delivery = await book(ctx);

  const realFind = t.m.Driver.find;
  let failures = 0;
  t.m.Driver.find = function patchedFind(...args) {
    if (failures < 1) {
      failures += 1;
      throw new Error('simulated transient database error');
    }
    return realFind.apply(this, args);
  };
  try {
    await payWithWallet(ctx.rider, delivery.rideId);
    await waitFor(() => live.of('rideRequest').find((e) => e.payload.rideId === delivery.rideId), { message: 'rideRequest after a retry', timeout: 8000 });
  } finally {
    t.m.Driver.find = realFind;
  }

  assert.equal(failures, 1);
  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.status, 'searching', 'still searching, not cancelled');
  assert.equal(ride.goodsAdvance.status, 'paid', 'advance untouched');
});

test('a new booking replaces a paid, unaccepted one: advance refunded, drivers told to drop it', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const first = await book(ctx);
  await payWithWallet(ctx.rider, first.rideId);
  await waitFor(() => live.of('rideRequest').find((e) => e.payload.rideId === first.rideId), { message: 'first offer' });

  const second = await book(ctx);
  assert.notEqual(second.rideId, first.rideId);

  const oldRide = await loadRide(first.rideId);
  assert.equal(oldRide.status, 'cancelled');
  assert.equal(oldRide.goodsAdvance.status, 'refunded', 'not forfeited: the rider did not really cancel');
  const wallet = await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean();
  assert.equal(wallet.refundWallet, first.goodsAdvance.amount);

  const closed = await waitFor(() => live.of('rideRequestClosed').find((e) => e.payload.rideId === first.rideId), { message: 'rideRequestClosed' });
  assert.equal(closed.payload.reason, 'user-replaced-booking');
});

test('replacing a booking a driver already accepted still forfeits the advance', async () => {
  const ctx = await setup();
  const first = await book(ctx);
  await payWithWallet(ctx.rider, first.rideId);
  await t.acceptRide(first.rideId, ctx.driver.driver._id);

  await book(ctx);
  assert.equal((await loadRide(first.rideId)).goodsAdvance.status, 'forfeited');
});

test('a stale isOnRide flag is healed by the sweep; a busy driver keeps it', async () => {
  const ctx = await setup();
  const stale = await t.factories.driver({ vehicleTypeId: ctx.vehicle._id, isOnRide: true });
  const delivery = await book(ctx);
  await payWithWallet(ctx.rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  assert.equal((await t.m.Driver.findById(ctx.driver.driver._id).lean()).isOnRide, true);

  const healed = await t.dispatchService.healStaleDriverOnRideFlags();
  assert.ok(healed >= 1);
  assert.equal((await t.m.Driver.findById(stale.driver._id).lean()).isOnRide, false);
  assert.equal((await t.m.Driver.findById(ctx.driver.driver._id).lean()).isOnRide, true, 'a driver on a live ride is left alone');
});

// ---------------------------------------------------------------- webhook / reconcile

const WEBHOOK_SECRET = 'whsec_test_secret';
const withRazorpayStub = async (handler, run) => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options);
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    const result = handler(String(url), options);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_envkey';
  process.env.RAZORPAY_KEY_SECRET = 'envsecret';
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  try {
    return await run(calls);
  } finally {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    globalThis.fetch = realFetch;
  }
};

const startOnlineAdvance = async (ctx, orderId) => {
  const delivery = await book(ctx);
  await t.m.Ride.updateOne(
    { _id: delivery.rideId },
    { $set: { 'goodsAdvance.provider': 'razorpay', 'goodsAdvance.providerOrderId': orderId }, $addToSet: { 'goodsAdvance.providerOrderIds': orderId } },
  );
  return delivery;
};

const webhookBody = (delivery, ctx, { orderId, paymentId, amount, event = 'payment.captured' }) => JSON.stringify({
  event,
  payload: {
    payment: { entity: { id: paymentId, order_id: orderId, amount, status: 'captured', notes: {} } },
    order: { entity: { id: orderId, notes: { rideId: delivery.rideId, userId: String(ctx.rider.user._id), purpose: 'goods_advance' } } },
  },
});

const postWebhook = (rawBody, signature) => fetch(`${t.baseUrl}/api/v1/deliveries/advance/razorpay/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
  body: rawBody,
});
const sign = (rawBody, secret = WEBHOOK_SECRET) => crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

test('webhook: a captured payment marks the advance paid and starts dispatch without any verify call', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const delivery = await startOnlineAdvance(ctx, 'order_wh_1');
  const amount = Math.round(delivery.goodsAdvance.amount * 100);
  const raw = webhookBody(delivery, ctx, { orderId: 'order_wh_1', paymentId: 'pay_wh_1', amount });

  await withRazorpayStub(() => ({}), async () => {
    assert.equal((await postWebhook(raw, 'bad-signature')).status, 400);
    assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'pending', 'bad signature changes nothing');

    const ok = await postWebhook(raw, sign(raw));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).handled, true);
  });

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'paid');
  assert.equal(ride.goodsAdvance.providerPaymentId, 'pay_wh_1');
  await waitFor(() => live.of('rideRequest').find((e) => e.payload.rideId === delivery.rideId), { message: 'driver notified after webhook' });

  // Razorpay retries webhooks: the same event again is harmless
  await withRazorpayStub(() => ({}), async (calls) => {
    const again = await postWebhook(raw, sign(raw));
    assert.equal(again.status, 200);
    assert.equal(calls.length, 0, 'no refund, no extra work');
  });
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'paid');
});

test('webhook: wrong amount is ignored; a second payment on a paid advance is refunded; no secret = 503', async () => {
  const ctx = await setup();
  const delivery = await startOnlineAdvance(ctx, 'order_wh_2');
  const amount = Math.round(delivery.goodsAdvance.amount * 100);

  await withRazorpayStub(() => ({}), async () => {
    const wrong = webhookBody(delivery, ctx, { orderId: 'order_wh_2', paymentId: 'pay_wrong', amount: amount + 100 });
    const res = await postWebhook(wrong, sign(wrong));
    assert.equal((await res.json()).handled, false);
    assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'pending');
  });

  const good = webhookBody(delivery, ctx, { orderId: 'order_wh_2', paymentId: 'pay_first', amount });
  const dup = webhookBody(delivery, ctx, { orderId: 'order_wh_2b', paymentId: 'pay_second', amount });
  await withRazorpayStub(() => ({}), async (calls) => {
    await postWebhook(good, sign(good));
    assert.equal((await loadRide(delivery.rideId)).goodsAdvance.providerPaymentId, 'pay_first');
    const res = await postWebhook(dup, sign(dup));
    assert.equal(res.status, 200);
    const refund = calls.find((call) => call.url.includes('/payments/pay_second/refund'));
    assert.ok(refund, 'the extra payment was refunded');
    assert.equal(refund.body.amount, amount);
  });
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.providerPaymentId, 'pay_first', 'first payment kept');

  const noSecret = await postWebhook(good, sign(good));
  assert.equal(noSecret.status, 503);
});

test('reconcile: the rider paid but verify was lost; asking again finds the payment, pays the advance and dispatches', async () => {
  const ctx = await setup();
  const live = await t.connectSocket(ctx.driver.token);
  const delivery = await startOnlineAdvance(ctx, 'order_rec_old');
  const amount = Math.round(delivery.goodsAdvance.amount * 100);
  // the rider then opened checkout again (new order), but the money went through the OLD one
  await t.m.Ride.updateOne({ _id: delivery.rideId }, {
    $set: { 'goodsAdvance.providerOrderId': 'order_rec_new' },
    $addToSet: { 'goodsAdvance.providerOrderIds': 'order_rec_new' },
  });
  const notes = { rideId: delivery.rideId, userId: String(ctx.rider.user._id), purpose: 'goods_advance' };

  await withRazorpayStub((url) => {
    if (url.endsWith('/orders/order_rec_old/payments')) return { items: [{ id: 'pay_rec', status: 'captured', amount }] };
    if (url.endsWith('/orders/order_rec_new/payments')) return { items: [] };
    if (url.includes('/orders/')) return { notes, amount };
    return {};
  }, async () => {
    const stranger = await t.factories.user();
    const denied = await t.api('POST', '/deliveries/advance/razorpay/reconcile', { token: stranger.token, body: { rideId: delivery.rideId } });
    assert.equal(denied.status, 404);

    const res = await t.api('POST', '/deliveries/advance/razorpay/reconcile', { token: ctx.rider.token, body: { rideId: delivery.rideId } });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.goodsAdvance.status, 'paid');
  });

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.providerPaymentId, 'pay_rec');
  assert.equal(ride.goodsAdvance.providerOrderId, 'order_rec_old');
  await waitFor(() => live.of('rideRequest').find((e) => e.payload.rideId === delivery.rideId), { message: 'driver notified after reconcile' });
});

test('reconcile: nothing captured yet -> 404, booking stays payable', async () => {
  const ctx = await setup();
  const delivery = await startOnlineAdvance(ctx, 'order_rec_none');
  await withRazorpayStub((url) => (url.endsWith('/payments') ? { items: [{ id: 'pay_x', status: 'failed', amount: 1 }] } : { notes: {} }), async () => {
    const res = await t.api('POST', '/deliveries/advance/razorpay/reconcile', { token: ctx.rider.token, body: { rideId: delivery.rideId } });
    assert.equal(res.status, 404);
  });
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'pending');
});

test('verify is not starved by the shared payment rate limit (20 order attempts, verify still answers)', async () => {
  const ctx = await setup();
  const delivery = await book(ctx);
  let last;
  for (let i = 0; i < 14; i += 1) {
    last = await t.api('POST', '/deliveries/advance/razorpay/order', { token: ctx.rider.token, body: { rideId: delivery.rideId } });
  }
  assert.equal(last.status, 429, 'the order endpoint is still rate limited');
  const verify = await t.api('POST', '/deliveries/advance/razorpay/verify', {
    token: ctx.rider.token, body: { rideId: delivery.rideId, razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 's' },
  });
  assert.notEqual(verify.status, 429, 'verify has its own, higher limit');
  await sleep(0);
});

test('one-by-one: a driver the dispatch already moved past is not offered the request again', async () => {
  await t.setSettings('transport_ride', { trip_accept_reject_duration_for_driver: '2' });
  try {
    const vehicle = await t.factories.vehicle({ commission: 10 });
    const rider = await t.factories.user();
    const a = await t.factories.driver({ vehicleTypeId: vehicle._id });
    const b = await t.factories.driver({ vehicleTypeId: vehicle._id });
    await t.factories.wallet(rider.user._id, 5000);
    const delivery = await book({ vehicle, rider });
    await payWithWallet(rider, delivery.rideId);

    const ride = await waitFor(async () => {
      const current = await loadRide(delivery.rideId);
      return current.dispatchTracking.notifiedDriverIds.length >= 2 ? current : null;
    }, { message: 'dispatch moved to the second driver', timeout: 12000 });

    const [firstId, secondId] = ride.dispatchTracking.notifiedDriverIds;
    const tokenOf = (id) => [a, b].find((item) => String(item.driver._id) === id).token;

    const first = await t.api('GET', '/drivers/ride-offers', { token: tokenOf(firstId) });
    assert.equal(first.body.data.results.length, 0, 'window closed for the first driver');
    const second = await t.api('GET', '/drivers/ride-offers', { token: tokenOf(secondId) });
    assert.equal(second.body.data.results.length, 1, 'the driver whose turn it is still sees it');
  } finally {
    await t.setSettings('transport_ride', { trip_accept_reject_duration_for_driver: '15' });
  }
});
