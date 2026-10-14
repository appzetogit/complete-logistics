// Real-database tests: paying a cash ride online at the drop (QR or in-app), "cash received", and the payment
// safety rules: the driver is credited exactly once and never loses money, the rider never pays twice, a payment
// for another ride is refused, a second payment is refunded, both apps get `ride:state` live.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const FARE = 200;
const COMMISSION = 40; // 20 % (harness default)
const KEY_SECRET = 'envsecret';
const WEBHOOK_SECRET = 'whsec_ride_test';
const round2 = (n) => Math.round(n * 100) / 100;

// ---- fake Razorpay -------------------------------------------------------------------------------------------

const rp = { orders: new Map(), payments: new Map(), qrs: new Map(), calls: [], n: 0 };
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const realFetch = globalThis.fetch;

before(() => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_envkey';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (!href.startsWith('https://api.razorpay.com/v1')) return realFetch(url, options);
    const path = href.slice('https://api.razorpay.com/v1'.length);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    rp.calls.push({ method, path, body });
    let m;
    if (method === 'POST' && path === '/orders') {
      const order = { id: `order_${(rp.n += 1)}`, amount: body.amount, currency: 'INR', status: 'created', notes: body.notes };
      rp.orders.set(order.id, order);
      return json(order);
    }
    if (method === 'GET' && (m = path.match(/^\/orders\/([^/]+)$/))) return json(rp.orders.get(m[1]) || {});
    if (method === 'GET' && (m = path.match(/^\/payments\/qr_codes\/([^/]+)\/payments$/))) {
      return json({ items: rp.qrs.get(m[1])?.payments || [] });
    }
    if (method === 'GET' && (m = path.match(/^\/payments\/qr_codes\/([^/]+)$/))) return json(rp.qrs.get(m[1]) || {});
    if (method === 'POST' && path === '/payments/qr_codes') {
      const qr = {
        id: `qr_${(rp.n += 1)}`, entity: 'qr_code', status: 'active', image_url: 'https://rzp.io/qr.png',
        payment_amount: body.payment_amount, payments_amount_received: 0, notes: body.notes, payments: [],
      };
      rp.qrs.set(qr.id, qr);
      return json(qr);
    }
    if (method === 'POST' && (m = path.match(/^\/payments\/qr_codes\/([^/]+)\/close$/))) {
      const qr = rp.qrs.get(m[1]);
      if (qr) qr.status = 'closed';
      return json(qr || {});
    }
    if (method === 'GET' && (m = path.match(/^\/payments\/([^/]+)$/))) return json(rp.payments.get(m[1]) || {});
    if (method === 'POST' && (m = path.match(/^\/payments\/([^/]+)\/capture$/))) {
      const payment = rp.payments.get(m[1]);
      payment.status = 'captured';
      return json(payment);
    }
    if (method === 'POST' && (m = path.match(/^\/payments\/([^/]+)\/refund$/))) {
      return json({ id: `rfnd_${(rp.n += 1)}`, payment_id: m[1], amount: body.amount, status: 'processed' });
    }
    throw new Error(`unexpected Razorpay call ${method} ${path}`);
  };
});
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
});

const callsTo = (pattern) => rp.calls.filter((c) => pattern.test(`${c.method} ${c.path}`));

// The rider pays an order in the checkout: Razorpay creates a captured (or only authorized) payment.
const payOrder = (orderId, { status = 'captured' } = {}) => {
  const order = rp.orders.get(orderId);
  const payment = { id: `pay_${(rp.n += 1)}`, order_id: orderId, amount: order.amount, currency: 'INR', status };
  rp.payments.set(payment.id, payment);
  order.status = 'paid';
  const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${payment.id}`).digest('hex');
  return { razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: signature };
};

// The rider scans the driver's QR and pays it.
const payQr = (qrId) => {
  const qr = rp.qrs.get(qrId);
  const payment = { id: `pay_${(rp.n += 1)}`, amount: qr.payment_amount, currency: 'INR', status: 'captured' };
  qr.payments.push(payment);
  qr.payments_amount_received = qr.payment_amount;
  qr.status = 'closed';
  return payment;
};

const postWebhook = async (event) => {
  const raw = JSON.stringify(event);
  const res = await realFetch(`${t.baseUrl}/api/v1/rides/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex') },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
};
const qrCreditedEvent = (qrId, payment) => ({
  event: 'qr_code.credited',
  payload: { qr_code: { entity: { id: qrId, notes: rp.qrs.get(qrId).notes } }, payment: { entity: payment } },
});

// ---- ride helpers -------------------------------------------------------------------------------------------

const setup = async ({ balance = 1000 } = {}) => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, balance);
  return { vehicle, driver, rider };
};

const bookAndArrive = async ({ vehicle, driver, rider }, { paymentMethod = 'cash' } = {}) => {
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: FARE, vehicleTypeId: String(vehicle._id), paymentMethod },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);
  for (const status of ['arriving', 'started', 'arrived']) {
    const res = await t.patchRideStatus(rideId, { token: driver.token, body: { status } });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }
  return rideId;
};

const complete = (rideId, driver, extra = {}) => t.patchRideStatus(rideId, { token: driver.token, body: { status: 'completed', ...extra } });
const driverWalletRows = (rideId) => t.m.WalletTransaction.find({ rideId }).sort({ createdAt: 1 }).lean();
const driverNet = async (rideId) => round2((await driverWalletRows(rideId)).reduce((sum, row) => sum + row.amount, 0));
const loadRide = (rideId) => t.m.Ride.findById(rideId).lean();
const walletPay = (rideId, rider, body = {}) => t.api('POST', `/rides/${rideId}/complete-payment/wallet`, { token: rider.token, body });
const createQr = (rideId, driver, body = {}) => t.api('POST', '/drivers/payments/qr', { token: driver.token, body: { rideId, ...body } });
const qrStatus = (rideId, driver) => t.api('GET', `/drivers/payments/qr/status?rideId=${rideId}`, { token: driver.token });

// ---- 1. cash received -----------------------------------------------------------------------------------------

test('cash ride, driver taps "Cash received": every rider payment is ALREADY_PAID, driver wallet only -commission', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const done = await complete(rideId, ctx.driver, { cashReceived: true });
  assert.equal(done.status, 200, done.text);

  const ride = await loadRide(rideId);
  assert.equal(ride.driverPaymentCollection.status, 'paid');
  assert.equal(ride.driverPaymentCollection.source, 'cash');
  assert.equal(ride.driverPaymentCollection.amount, FARE);
  assert.equal(ride.settledAs, 'cash');

  const pay = await walletPay(rideId, ctx.rider, { rating: 5 });
  assert.equal(pay.status, 409, pay.text);
  assert.equal(pay.body.code, 'ALREADY_PAID');
  const order = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: {} });
  assert.equal(order.body.code, 'ALREADY_PAID');
  const qr = await createQr(rideId, ctx.driver);
  assert.equal(qr.body.code, 'ALREADY_PAID');

  assert.equal((await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean()).balance, 1000, 'rider not charged');
  assert.equal(await driverNet(rideId), -COMMISSION);

  const asRider = (await t.api('GET', '/rides', { token: ctx.rider.token })).body.data.results.find((r) => r.rideId === rideId);
  assert.equal(asRider.isPaid, true);
  assert.equal(asRider.amountToCollect, 0);
  assert.equal(asRider.paidBy, 'cash');
});

test('current apps: completing with paymentMethod "cash" counts as cash received; cashReceived:false keeps it payable', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  assert.equal((await complete(rideId, ctx.driver, { paymentMethod: 'cash' })).status, 200);
  assert.equal((await loadRide(rideId)).driverPaymentCollection.source, 'cash');
  const pay = await walletPay(rideId, ctx.rider);
  assert.equal(pay.body.code, 'ALREADY_PAID');

  const other = await setup();
  const openRide = await bookAndArrive(other);
  assert.equal((await complete(openRide, other.driver, { paymentMethod: 'cash', cashReceived: false })).status, 200);
  assert.notEqual((await loadRide(openRide)).driverPaymentCollection?.status, 'paid');
  const later = await walletPay(openRide, other.rider);
  assert.equal(later.status, 201, later.text);
  assert.equal(await driverNet(openRide), FARE - COMMISSION);
});

// ---- 2. rider pays in the app at the drop ------------------------------------------------------------------------

test('cash ride, rider pays from the wallet at the drop (no rating): driver gets ride:state live, ends at fare - commission', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const live = await t.connectSocket(ctx.driver.token);

  const pay = await walletPay(rideId, ctx.rider); // status "arrived", no rating
  assert.equal(pay.status, 201, pay.text);
  await waitFor(() => live.of('ride:state').find((e) => e.payload.rideId === rideId && e.payload.isPaid === true), { message: 'driver told the ride is paid' });

  let ride = await loadRide(rideId);
  assert.equal(ride.paymentMethod, 'online');
  assert.equal(ride.paymentSwitchedFrom, 'cash');
  assert.equal(ride.driverPaymentCollection.source, 'wallet');
  assert.deepEqual(await driverWalletRows(rideId), [], 'nothing credited before completion (settlement does it)');

  // the driver's (old) app still says cash at completion: ignored, the ride stays paid online
  const done = await complete(rideId, ctx.driver, { paymentMethod: 'cash', cashReceived: true });
  assert.equal(done.status, 200, done.text);
  ride = await loadRide(rideId);
  assert.equal(ride.paymentMethod, 'online');
  assert.equal(ride.driverPaymentCollection.source, 'wallet');
  assert.equal(ride.settledAs, 'online');
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
  assert.equal((await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean()).balance, 1000 - FARE);

  // rating later, on its own
  const rate = await t.api('PATCH', `/rides/${rideId}/feedback`, { token: ctx.rider.token, body: { rating: 4 } });
  assert.equal(rate.status, 200, rate.text);
  assert.equal((await loadRide(rideId)).feedback.rating, 4);
});

test('paying before the driver reaches the drop is refused', async () => {
  const ctx = await setup();
  const created = await t.api('POST', '/rides', {
    token: ctx.rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: FARE, vehicleTypeId: String(ctx.vehicle._id), paymentMethod: 'cash' },
  });
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, ctx.driver.driver._id);
  const pay = await walletPay(rideId, ctx.rider);
  assert.equal(pay.status, 409);
  assert.equal(pay.body.code, 'PAYMENT_NOT_ALLOWED');
  const qr = await createQr(rideId, ctx.driver);
  assert.equal(qr.body.code, 'PAYMENT_NOT_ALLOWED');
});

// ---- 3 + 4. driver QR, webhook, poll ----------------------------------------------------------------------------

test('driver QR: amount from the server; rider pays with the driver app closed; webhook credits once; poll + retry add nothing', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const done = await complete(rideId, ctx.driver); // old app: no cashReceived -> settled as cash, still payable
  assert.equal(done.status, 200, done.text);
  assert.equal(await driverNet(rideId), -COMMISSION);

  const qr = await createQr(rideId, ctx.driver, { amount: 1 }); // the app's amount is ignored
  assert.equal(qr.status, 200, qr.text);
  assert.equal(qr.body.data.amount, FARE);
  assert.equal(rp.qrs.get(qr.body.data.id).payment_amount, FARE * 100);

  const payment = payQr(qr.body.data.id);
  const hook = await postWebhook(qrCreditedEvent(qr.body.data.id, payment));
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  assert.equal(hook.body.status, 'applied');

  let ride = await loadRide(rideId);
  assert.equal(ride.driverPaymentCollection.status, 'paid');
  assert.equal(ride.driverPaymentCollection.source, 'qr');
  assert.equal(ride.driverPaymentCollection.providerPaymentId, payment.id);
  assert.equal(ride.paymentMethod, 'online');
  assert.equal(ride.paymentSwitchedFrom, 'cash');
  assert.equal(await driverNet(rideId), FARE - COMMISSION, 'driver credited the fare once');

  // the driver opens the app again (poll) and Razorpay retries the webhook: no second credit
  const status = await qrStatus(rideId, ctx.driver);
  assert.equal(status.status, 200, status.text);
  assert.equal(status.body.data.paid, true);
  const again = await postWebhook(qrCreditedEvent(qr.body.data.id, payment));
  assert.equal(again.body.status, 'already_applied');
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
  assert.equal(callsTo(/refund/).filter((c) => c.path.includes(payment.id)).length, 0, 'never refunded');
});

test('QR paid, the driver app polls before any webhook: credited once, the later webhook is a no-op', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const qr = await createQr(rideId, ctx.driver); // at the drop, before completion
  const payment = payQr(qr.body.data.id);

  const status = await qrStatus(rideId, ctx.driver);
  assert.equal(status.body.data.paid, true, status.text);
  assert.equal(status.body.data.source, 'qr');
  assert.deepEqual(await driverWalletRows(rideId), [], 'not settled yet: nothing credited now');

  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  assert.equal(await driverNet(rideId), FARE - COMMISSION, 'settled as a paid online ride');

  const hook = await postWebhook(qrCreditedEvent(qr.body.data.id, payment));
  assert.equal(hook.body.status, 'already_applied');
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
});

test('a new QR closes the old one; a late payment on the old QR after the ride is paid is refunded', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const first = await createQr(rideId, ctx.driver);
  const second = await createQr(rideId, ctx.driver);
  assert.notEqual(first.body.data.id, second.body.data.id);
  assert.equal(rp.qrs.get(first.body.data.id).status, 'closed', 'old QR closed');

  const paidSecond = payQr(second.body.data.id);
  assert.equal((await postWebhook(qrCreditedEvent(second.body.data.id, paidSecond))).body.status, 'applied');
  // the rider somehow also paid the old one (Razorpay delivered it anyway)
  const paidFirst = payQr(first.body.data.id);
  const late = await postWebhook(qrCreditedEvent(first.body.data.id, paidFirst));
  assert.equal(late.body.status, 'duplicate');
  assert.equal(late.body.refunded, true);
  assert.equal(callsTo(new RegExp(`POST /payments/${paidFirst.id}/refund`)).length, 1);
  assert.equal((await loadRide(rideId)).paymentRefunds[0].paymentId, paidFirst.id);

  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  assert.equal(await driverNet(rideId), FARE - COMMISSION, 'one payment counted');
});

// ---- 5 + 6. in-app checkout -------------------------------------------------------------------------------------

test('checkout: double tap gets the same order; verify credits; a second paid order is refunded (ALREADY_PAID)', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  assert.equal((await complete(rideId, ctx.driver)).status, 200);

  const a = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: {} });
  const b = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: {} });
  assert.equal(a.status, 201, a.text);
  assert.equal(b.body.data.orderId, a.body.data.orderId, 'same open order');
  assert.equal(b.body.data.reused, true);

  const verify = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/verify`, {
    token: ctx.rider.token, body: { ...payOrder(a.body.data.orderId), rating: 5 },
  });
  assert.equal(verify.status, 200, verify.text);
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
  assert.equal((await loadRide(rideId)).feedback.rating, 5);

  // a second order paid for the same ride (old app, two devices...): refunded, not kept
  const extraOrder = { id: 'order_extra', amount: FARE * 100, currency: 'INR', status: 'created', notes: { ...rp.orders.get(a.body.data.orderId).notes } };
  rp.orders.set(extraOrder.id, extraOrder);
  const second = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/verify`, { token: ctx.rider.token, body: payOrder('order_extra') });
  assert.equal(second.status, 409, second.text);
  assert.equal(second.body.code, 'ALREADY_PAID');
  assert.equal(second.body.details.refunded, true);
  assert.equal(callsTo(/refund/).filter((c) => c.body?.notes?.rideId === rideId).length, 1);
  assert.equal(await driverNet(rideId), FARE - COMMISSION, 'still credited once');

  // the app retries the first verify: fine, nothing new
  const retry = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/verify`, {
    token: ctx.rider.token,
    body: { razorpay_order_id: a.body.data.orderId, razorpay_payment_id: verify.body.data.driverPaymentCollection.providerPaymentId, razorpay_signature: 'x' },
  });
  assert.equal(retry.status, 200, retry.text);
});

test('checkout: an order made for another ride is rejected, even for the same amount', async () => {
  const ctx = await setup();
  const rideA = await bookAndArrive(ctx);
  assert.equal((await complete(rideA, ctx.driver)).status, 200); // done, not paid yet
  const otherDriver = await t.factories.driver({ vehicleTypeId: ctx.vehicle._id });
  const rideB = await bookAndArrive({ ...ctx, driver: otherDriver }); // same fare, so the same amount

  const orderA = await t.api('POST', `/rides/${rideA}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: {} });
  assert.equal(orderA.status, 201, orderA.text);
  const paid = payOrder(orderA.body.data.orderId);
  const wrong = await t.api('POST', `/rides/${rideB}/complete-payment/razorpay/verify`, { token: ctx.rider.token, body: paid });
  assert.equal(wrong.status, 400, wrong.text);
  assert.equal(wrong.body.code, 'PAYMENT_NOT_ALLOWED');
  assert.equal((await loadRide(rideB)).driverPaymentCollection?.status !== 'paid', true);

  // the same payment on its own ride is fine
  const right = await t.api('POST', `/rides/${rideA}/complete-payment/razorpay/verify`, { token: ctx.rider.token, body: paid });
  assert.equal(right.status, 200, right.text);
});

test('checkout: an authorized (not auto-captured) payment is captured on verify', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const order = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: { tipAmount: 20 } });
  assert.equal(order.body.data.totalCharge, FARE + 20);
  const paid = payOrder(order.body.data.orderId, { status: 'authorized' });
  const verify = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/verify`, { token: ctx.rider.token, body: paid });
  assert.equal(verify.status, 200, verify.text);
  assert.equal(callsTo(new RegExp(`POST /payments/${paid.razorpay_payment_id}/capture`)).length, 1);
  assert.equal(rp.payments.get(paid.razorpay_payment_id).status, 'captured');

  const rows = await driverWalletRows(rideId);
  assert.equal(rows.length, 1, 'only the tip now (ride not settled yet)');
  assert.equal(rows[0].amount, 20);
  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  assert.equal(await driverNet(rideId), FARE - COMMISSION + 20);
});

test('webhook for a checkout payment the app never verified: applied once, a later verify is a no-op', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  const order = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: {} });
  const paid = payOrder(order.body.data.orderId);
  const payment = rp.payments.get(paid.razorpay_payment_id);
  const hook = await postWebhook({
    event: 'payment.captured',
    payload: { payment: { entity: payment }, order: { entity: rp.orders.get(order.body.data.orderId) } },
  });
  assert.equal(hook.body.status, 'applied');
  assert.equal(await driverNet(rideId), FARE - COMMISSION);

  const verify = await t.api('POST', `/rides/${rideId}/complete-payment/razorpay/verify`, { token: ctx.rider.token, body: paid });
  assert.equal(verify.status, 200, verify.text);
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
});

test('webhook: bad signature is refused, other events and other payments are ignored', async () => {
  const raw = JSON.stringify({ event: 'qr_code.credited', payload: {} });
  const bad = await realFetch(`${t.baseUrl}/api/v1/rides/payments/razorpay/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'nope' }, body: raw,
  });
  assert.equal(bad.status, 400);
  assert.equal((await postWebhook({ event: 'refund.processed', payload: {} })).body.handled, false);
  const goods = await postWebhook({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: 'pay_goods', order_id: 'order_goods', amount: 5000, status: 'captured' } },
      order: { entity: { id: 'order_goods', notes: { purpose: 'goods_advance', rideId: '64b000000000000000000000' } } },
    },
  });
  assert.equal(goods.status, 200);
  assert.equal(goods.body.handled, false);
});

// ---- 7. the driver cannot switch the method -------------------------------------------------------------------

test('driver sends paymentMethod "online" on an unpaid cash ride: ignored, no earnings credited', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const done = await complete(rideId, ctx.driver, { paymentMethod: 'online' });
  assert.equal(done.status, 200, done.text);
  const ride = await loadRide(rideId);
  assert.equal(ride.paymentMethod, 'cash');
  assert.equal(ride.settledAs, 'cash');
  assert.equal(await driverNet(rideId), -COMMISSION);
  assert.equal(await t.m.WalletTransaction.countDocuments({ rideId, type: 'ride_earning' }), 0);
});

test('online ride the rider has not paid at completion: commission only, the fare is credited when they pay', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx, { paymentMethod: 'online' });
  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  let ride = await loadRide(rideId);
  assert.equal(ride.paymentMethod, 'online');
  assert.equal(ride.settledAs, 'cash');
  assert.equal(await driverNet(rideId), -COMMISSION);

  const pay = await walletPay(rideId, ctx.rider, { rating: 5 });
  assert.equal(pay.status, 201, pay.text);
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
  ride = await loadRide(rideId);
  assert.equal(ride.paymentSwitchedFrom, '', 'it was online all along');
});

test('two wallet payments at the same moment: the rider is charged once', async () => {
  const ctx = await setup();
  const rideId = await bookAndArrive(ctx);
  const results = await Promise.all([walletPay(rideId, ctx.rider), walletPay(rideId, ctx.rider), walletPay(rideId, ctx.rider)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => r.text).join('\n'));
  assert.equal((await t.m.UserWallet.findOne({ userId: ctx.rider.user._id }).lean()).balance, 1000 - FARE);
  assert.equal((await complete(rideId, ctx.driver)).status, 200);
  assert.equal(await driverNet(rideId), FARE - COMMISSION);
});
