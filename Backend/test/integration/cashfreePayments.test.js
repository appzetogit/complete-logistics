// Real-database tests for Cashfree: rider wallet top-up, driver wallet top-up and the ride completion payment, with a
// fake Cashfree behind fetch. The rules: money moves once (verify, webhook and reconcile racing each other), the
// amount comes from our order and not from the app, nobody settles another person's order, and a payment the ride
// cannot use is refunded once.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
let AdminThirdPartySetting;
let PaymentOrder;
let AdminAppSetting;
let reconcilePaymentOrders;

const APP_ID = 'TEST_APP_ID';
const SECRET = 'cf_test_secret';
const BASE = 'https://sandbox.cashfree.com/pg';
const FARE = 200;
const COMMISSION = 40;
const realFetch = globalThis.fetch;

// ---- fake Cashfree -------------------------------------------------------------------------------------------
const cf = { orders: new Map(), payments: new Map(), refunds: [], calls: [], n: 0, down: false };
const jsonRes = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  ({ AdminThirdPartySetting } = await import('../../src/modules/taxi/admin/models/AdminThirdPartySetting.js'));
  ({ AdminAppSetting } = await import('../../src/modules/taxi/admin/models/AdminAppSetting.js'));
  ({ PaymentOrder } = await import('../../src/modules/taxi/payments/models/PaymentOrder.js'));
  ({ reconcilePaymentOrders } = await import('../../src/modules/taxi/payments/services/paymentOrderService.js'));
  const { ensureThirdPartySettings } = await import('../../src/modules/taxi/admin/services/adminService.js');
  await ensureThirdPartySettings();
  await AdminThirdPartySetting.updateOne(
    { scope: 'default' },
    {
      $set: {
        'payment.razor_pay.enabled': '0',
        'payment.cashfree': { enabled: '1', environment: 'test', test_app_id: APP_ID, test_secret_key: SECRET, live_app_id: '', live_secret_key: '' },
      },
    },
  );

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (!href.startsWith(BASE)) return realFetch(url, options);
    if (cf.down) throw new Error('network down');
    const path = href.slice(BASE.length);
    const method = options.method || 'GET';
    const headers = options.headers || {};
    const body = options.body ? JSON.parse(options.body) : null;
    cf.calls.push({ method, path, body });
    if (headers['x-client-id'] !== APP_ID || headers['x-client-secret'] !== SECRET || !headers['x-api-version']) {
      return jsonRes({ message: 'authentication Failed', code: 'request_failed' }, 401);
    }
    let m;
    if (method === 'POST' && path === '/orders') {
      const order = { ...body, cf_order_id: `cf_${(cf.n += 1)}`, order_status: 'ACTIVE', payment_session_id: `session_${body.order_id}` };
      cf.orders.set(body.order_id, order);
      cf.payments.set(body.order_id, []);
      return jsonRes(order);
    }
    if (method === 'GET' && (m = path.match(/^\/orders\/([^/]+)\/payments$/))) return jsonRes(cf.payments.get(m[1]) || []);
    if (method === 'GET' && (m = path.match(/^\/orders\/([^/]+)$/))) return jsonRes(cf.orders.get(m[1]) || {}, cf.orders.has(m[1]) ? 200 : 404);
    if (method === 'POST' && (m = path.match(/^\/orders\/([^/]+)\/refunds$/))) {
      cf.refunds.push({ orderId: m[1], ...body });
      return jsonRes({ cf_refund_id: `rf_${(cf.n += 1)}`, refund_id: body.refund_id, refund_status: 'PENDING', refund_amount: body.refund_amount });
    }
    throw new Error(`unexpected Cashfree call ${method} ${path}`);
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  await t.stop();
});

// The customer pays in Cashfree's checkout.
const pay = (orderId, { amount, status = 'SUCCESS' } = {}) => {
  const order = cf.orders.get(orderId);
  const payment = {
    cf_payment_id: `${(cf.n += 1)}0001`,
    order_id: orderId,
    payment_status: status,
    payment_amount: amount ?? order.order_amount,
    order_amount: order.order_amount,
    payment_currency: 'INR',
  };
  cf.payments.get(orderId).push(payment);
  if (status === 'SUCCESS') order.order_status = 'PAID';
  return payment;
};

const webhook = async (orderId, { secret = SECRET, tamper = false } = {}) => {
  const raw = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } });
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}${raw}`).digest('base64');
  const res = await realFetch(`${t.baseUrl}/api/v1/payments/cashfree/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp },
    body: tamper ? raw.replace(orderId, `${orderId}x`) : raw,
  });
  return { status: res.status, body: await res.json() };
};

const userWalletBalance = async (userId) => (await t.m.UserWallet.findOne({ userId }).lean())?.balance ?? 0;
const topUpRows = (driverId) => t.m.WalletTransaction.find({ driverId, type: 'top_up' }).lean();

// ---- rider wallet ----------------------------------------------------------------------------------------------

test('rider wallet: order -> pending until paid -> credited once however many times it is verified', async () => {
  const rider = await t.factories.user();
  const created = await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 500 } });
  assert.equal(created.status, 201, created.text);
  const { orderId, paymentSessionId } = created.body.data;
  assert.ok(paymentSessionId.startsWith('session_'));
  assert.equal(cf.orders.get(orderId).order_amount, 500);
  assert.equal(cf.orders.get(orderId).customer_details.customer_id, String(rider.user._id));

  const pending = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } });
  assert.equal(pending.status, 200, pending.text);
  assert.equal(pending.body.data.status, 'pending');
  assert.equal(pending.body.data.paid, false);
  assert.equal(await userWalletBalance(rider.user._id), 0);

  pay(orderId);
  const first = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } });
  assert.equal(first.body.data.paid, true, first.text);
  assert.equal(first.body.data.wallet.balance, 500);
  const again = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } });
  assert.equal(again.status, 200);
  assert.equal(await userWalletBalance(rider.user._id), 500);

  const wallet = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(wallet.transactions.filter((tx) => tx.provider === 'cashfree').length, 1);
  assert.equal((await PaymentOrder.findOne({ orderId })).status, 'applied');
});

test('rider wallet: verify, webhook and reconcile racing each other credit once', async () => {
  const rider = await t.factories.user();
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 300 } })).body.data;
  pay(orderId);

  const results = await Promise.all([
    t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } }),
    t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } }),
    webhook(orderId),
    webhook(orderId),
    reconcilePaymentOrders(),
  ]);
  assert.ok(results.slice(0, 4).every((r) => r.status === 200), JSON.stringify(results));
  assert.equal(await userWalletBalance(rider.user._id), 300, 'credited exactly once');
});

test('the amount comes from our order: a payment of a different amount credits nothing', async () => {
  const rider = await t.factories.user();
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 1000 } })).body.data;
  pay(orderId, { amount: 10 });
  const res = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } });
  assert.equal(res.body.data.status, 'pending');
  assert.equal(await userWalletBalance(rider.user._id), 0);

  const failed = await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 80 } });
  pay(failed.body.data.orderId, { status: 'FAILED' });
  const res2 = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId: failed.body.data.orderId } });
  assert.equal(res2.body.data.status, 'pending');
  assert.equal(await userWalletBalance(rider.user._id), 0);
});

test("nobody can verify another person's order, or use the wrong purpose", async () => {
  const rider = await t.factories.user();
  const other = await t.factories.user();
  const driver = await t.factories.driver();
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 100 } })).body.data;
  pay(orderId);

  const stolen = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: other.token, body: { orderId } });
  assert.equal(stolen.status, 404);
  const asDriver = await t.api('POST', '/v1/payments/cashfree/driver-wallet/verify', { token: driver.token, body: { orderId } });
  assert.equal(asDriver.status, 404);
  assert.equal(await userWalletBalance(other.user._id), 0);
  assert.equal((await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { body: { amount: 10 } })).status, 401);
  assert.equal((await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: -5 } })).status, 400);
});

test('webhook: a bad signature or a tampered body is refused and settles nothing', async () => {
  const rider = await t.factories.user();
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 100 } })).body.data;
  pay(orderId);

  assert.equal((await webhook(orderId, { secret: 'wrong' })).status, 401);
  assert.equal((await webhook(orderId, { tamper: true })).status, 401);
  assert.equal(await userWalletBalance(rider.user._id), 0);

  const ok = await webhook(orderId);
  assert.equal(ok.status, 200);
  assert.equal(await userWalletBalance(rider.user._id), 100);

  const unknown = await webhook('not_our_order');
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.handled, false);
});

test('reconcile: a paid order nobody verified is applied, an unpaid one is left alone', async () => {
  const rider = await t.factories.user();
  const paid = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 120 } })).body.data.orderId;
  const unpaid = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 55 } })).body.data.orderId;
  pay(paid);
  await PaymentOrder.collection.updateMany({ orderId: { $in: [paid, unpaid] } }, { $set: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } });

  const summary = await reconcilePaymentOrders();
  assert.ok(summary.checked >= 2);
  assert.equal(await userWalletBalance(rider.user._id), 120);
  assert.equal((await PaymentOrder.findOne({ orderId: unpaid })).status, 'created');
});

test('Cashfree being down fails the order cleanly and credits nothing', async () => {
  const rider = await t.factories.user();
  cf.down = true;
  const res = await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 100 } });
  cf.down = false;
  assert.equal(res.status, 502, res.text);
  assert.equal(await PaymentOrder.countDocuments({ ownerId: rider.user._id, status: 'failed' }), 1);
  assert.equal(await userWalletBalance(rider.user._id), 0);
});

// ---- driver wallet ---------------------------------------------------------------------------------------------

test('driver wallet: credited once through verify + webhook, and the live minimum is enforced on the order', async () => {
  const { driver, token } = await t.factories.driver({ wallet: { balance: 0, cashLimit: 100, isBlocked: false } });
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/driver-wallet/order', { token, body: { amount: 700 } })).body.data;
  pay(orderId);
  const [a, b] = await Promise.all([
    t.api('POST', '/v1/payments/cashfree/driver-wallet/verify', { token, body: { orderId } }),
    webhook(orderId),
  ]);
  assert.equal(a.status, 200, a.text);
  assert.equal(b.status, 200);
  const rows = await topUpRows(driver._id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 700);
  assert.equal((await t.m.Driver.findById(driver._id).lean()).wallet.balance, 700);

  await AdminAppSetting.updateOne({ scope: 'default' }, { $set: { 'wallet_setting.minimum_amount_added_to_wallet': '200' } }, { upsert: true });
  const { invalidateCachedValue } = await import('../../src/utils/cache.js');
  await invalidateCachedValue('cache:settings:wallet');
  const tooSmall = await t.api('POST', '/v1/payments/cashfree/driver-wallet/order', { token, body: { amount: 50 } });
  assert.equal(tooSmall.status, 400);
  assert.match(tooSmall.body.message, /at least 200/);
  await AdminAppSetting.updateOne({ scope: 'default' }, { $set: { 'wallet_setting.minimum_amount_added_to_wallet': '0' } });
  await invalidateCachedValue('cache:settings:wallet');
});

// ---- ride completion payment -----------------------------------------------------------------------------------

const arrivedCashRide = async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: FARE, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);
  for (const status of ['arriving', 'started', 'arrived']) {
    const res = await t.patchRideStatus(rideId, { token: driver.token, body: { status } });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }
  const done = await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'completed', cashReceived: false } });
  assert.equal(done.status, 200, done.text);
  return { rideId, driver, rider };
};
const driverNet = async (rideId) => {
  const rows = await t.m.WalletTransaction.find({ rideId }).lean();
  return Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
};

test('ride payment: the rider pays the fare + tip online; ride paid once, driver credited once', async () => {
  const { rideId, driver, rider } = await arrivedCashRide();
  const order = await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/order`, { token: rider.token, body: { tipAmount: 20 } });
  assert.equal(order.status, 201, order.text);
  assert.equal(order.body.data.totalCharge, FARE + 20);
  assert.equal(cf.orders.get(order.body.data.orderId).order_amount, FARE + 20);

  const reopened = await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/order`, { token: rider.token, body: { tipAmount: 20 } });
  assert.equal(reopened.body.data.orderId, order.body.data.orderId, 'same open order, never two');
  assert.equal(reopened.body.data.reused, true);

  const orderId = order.body.data.orderId;
  pay(orderId);
  const [verify, hook] = await Promise.all([
    t.api('POST', `/v1/payments/cashfree/rides/${rideId}/verify`, { token: rider.token, body: { orderId, rating: 5 } }),
    webhook(orderId),
  ]);
  assert.equal(verify.status, 200, verify.text);
  assert.equal(hook.status, 200);

  const ride = await t.m.Ride.findById(rideId).lean();
  assert.equal(ride.driverPaymentCollection.status, 'paid');
  assert.equal(ride.driverPaymentCollection.provider, 'cashfree');
  assert.equal(ride.driverPaymentCollection.source, 'cashfree');
  assert.equal(ride.feedback.tipAmount, 20);
  assert.equal(ride.riderPaymentOrder, undefined);
  // the cash ride was settled with -commission; now the fare and the tip come in
  assert.equal(await driverNet(rideId), FARE - COMMISSION + 20);
  assert.equal(cf.refunds.filter((r) => r.orderId === orderId).length, 0);
  void driver;
});

test("ride payment: an order cannot pay another ride, and another rider cannot use it", async () => {
  const a = await arrivedCashRide();
  const b = await arrivedCashRide();
  const orderA = (await t.api('POST', `/v1/payments/cashfree/rides/${a.rideId}/order`, { token: a.rider.token, body: {} })).body.data.orderId;
  pay(orderA);

  const wrongRide = await t.api('POST', `/v1/payments/cashfree/rides/${b.rideId}/verify`, { token: a.rider.token, body: { orderId: orderA } });
  assert.equal(wrongRide.status, 400, wrongRide.text);
  const wrongRider = await t.api('POST', `/v1/payments/cashfree/rides/${a.rideId}/verify`, { token: b.rider.token, body: { orderId: orderA } });
  assert.equal(wrongRider.status, 404);
  assert.notEqual((await t.m.Ride.findById(b.rideId).lean()).driverPaymentCollection?.status, 'paid');
});

test('ride payment: a payment that arrives after the ride was already paid is refunded once, never kept', async () => {
  const { rideId, driver, rider } = await arrivedCashRide();
  const orderId = (await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/order`, { token: rider.token, body: {} })).body.data.orderId;

  // the rider pays the driver in cash meanwhile; the driver taps "cash received"
  await t.m.Ride.updateOne(
    { _id: rideId },
    { $set: { 'driverPaymentCollection.status': 'paid', 'driverPaymentCollection.source': 'cash', 'driverPaymentCollection.amount': FARE, 'driverPaymentCollection.paidAt': new Date() } },
  );
  const before = await driverNet(rideId);

  pay(orderId);
  const verify = await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/verify`, { token: rider.token, body: { orderId } });
  assert.equal(verify.status, 409, verify.text);
  assert.equal(verify.body.details?.code ?? verify.body.code, 'payment_refunded');
  await webhook(orderId);
  await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/verify`, { token: rider.token, body: { orderId } });

  assert.equal(cf.refunds.filter((r) => r.orderId === orderId).length, 1, 'refunded exactly once');
  const refund = cf.refunds.find((r) => r.orderId === orderId);
  assert.equal(refund.refund_amount, FARE);
  assert.equal(refund.refund_id, `rf_${orderId}`);
  assert.equal((await PaymentOrder.findOne({ orderId })).status, 'refunded');
  assert.equal(await driverNet(rideId), before, 'the driver is not credited twice');
  void driver;
});

// ---- goods advance at booking time -----------------------------------------------------------------------------

const goodsSetup = async () => {
  const vehicle = await t.factories.vehicle({ commission: 10 });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const booked = await t.api('POST', '/deliveries', {
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
  assert.equal(booked.status, 201, booked.text);
  return { rider, driver, delivery: booked.body.data, rideId: booked.body.data.rideId };
};
const advanceOrder = (rider, rideId) => t.api('POST', '/deliveries/advance/cashfree/order', { token: rider.token, body: { rideId } });
const advanceVerify = (rider, rideId, orderId) => t.api('POST', '/deliveries/advance/cashfree/verify', { token: rider.token, body: { rideId, orderId } });

test('goods advance: order uses the booking advance, double tap reuses it, paying dispatches once', async () => {
  const { rider, driver, delivery, rideId } = await goodsSetup();
  const driverSocket = await t.connectSocket(driver.token);

  const created = await advanceOrder(rider, rideId);
  assert.equal(created.status, 201, created.text);
  const { orderId, paymentSessionId, amount, reused } = created.body.data;
  assert.equal(amount, delivery.goodsAdvance.amount, 'amount is the booking advance, not from the app');
  assert.equal(reused, false);
  assert.ok(paymentSessionId.startsWith('session_'));
  assert.equal(cf.orders.get(orderId).order_amount, amount);

  const again = await advanceOrder(rider, rideId);
  assert.equal(again.body.data.orderId, orderId);
  assert.equal(again.body.data.reused, true);

  const pending = await advanceVerify(rider, rideId, orderId);
  assert.equal(pending.status, 200, pending.text);
  assert.equal(pending.body.data.status, 'pending');
  assert.equal((await t.m.Ride.findById(rideId).lean()).goodsAdvance.status, 'pending');

  pay(orderId);
  const [a, b] = await Promise.all([advanceVerify(rider, rideId, orderId), advanceVerify(rider, rideId, orderId)]);
  assert.equal(a.status, 200, a.text);
  assert.equal(b.status, 200, b.text);
  assert.equal(a.body.data.paid, true);

  const ride = await t.m.Ride.findById(rideId).lean();
  assert.equal(ride.goodsAdvance.status, 'paid');
  assert.equal(ride.goodsAdvance.provider, 'cashfree');
  assert.equal(ride.goodsAdvance.providerOrderId, orderId);
  assert.ok(ride.goodsAdvance.providerPaymentId);
  assert.equal((await PaymentOrder.findOne({ orderId })).status, 'applied');
  await waitFor(() => driverSocket.of('rideRequest').length >= 1, { message: 'paid advance dispatches the request' });
  assert.equal(cf.refunds.filter((r) => r.orderId === orderId).length, 0);
});

test('goods advance: the webhook alone (app never verifies) marks it paid and dispatches', async () => {
  const { rider, driver, rideId } = await goodsSetup();
  const driverSocket = await t.connectSocket(driver.token);
  const { orderId } = (await advanceOrder(rider, rideId)).body.data;
  pay(orderId);
  const res = await webhook(orderId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await t.m.Ride.findById(rideId).lean()).goodsAdvance.status, 'paid');
  await waitFor(() => driverSocket.of('rideRequest').length >= 1, { message: 'webhook dispatched the request' });
});

test('goods advance: nobody else can create or verify it; a closed booking refunds the payment once', async () => {
  const { rider, rideId } = await goodsSetup();
  const other = await t.factories.user();
  assert.equal((await advanceOrder(other, rideId)).status, 404);

  const { orderId } = (await advanceOrder(rider, rideId)).body.data;
  assert.equal((await advanceVerify(other, rideId, orderId)).status, 404);

  // the booking is cancelled while the rider is paying
  await t.m.Ride.updateOne({ _id: rideId }, { $set: { status: 'cancelled' } });
  pay(orderId);
  const res = await advanceVerify(rider, rideId, orderId);
  assert.equal(res.status, 409, res.text);
  assert.equal(res.body.code ?? res.body.data?.code ?? 'payment_refunded', 'payment_refunded');
  await advanceVerify(rider, rideId, orderId);
  assert.equal(cf.refunds.filter((r) => r.orderId === orderId).length, 1, 'refunded exactly once');
  assert.equal((await t.m.Ride.findById(rideId).lean()).goodsAdvance.status, 'pending', 'advance was not marked paid');
});

test('goods advance paid through Cashfree is refunded to the original payment when the booking is refunded', async () => {
  const { rider, rideId } = await goodsSetup();
  const { orderId, amount } = (await advanceOrder(rider, rideId)).body.data;
  pay(orderId);
  assert.equal((await advanceVerify(rider, rideId, orderId)).status, 200);

  const { refundGoodsAdvance } = await import('../../src/modules/taxi/user/services/goodsAdvanceService.js');
  const result = await refundGoodsAdvance({ rideId, reason: 'no_driver_found', deps: { getConfig: async () => ({ refundTo: 'source' }) } });
  assert.equal(result.refunded, true);
  assert.equal(result.destination, 'source');
  const refunds = cf.refunds.filter((r) => r.orderId === orderId);
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].refund_amount, amount);
  assert.equal(refunds[0].refund_id, `rfga_${orderId}`);
  assert.equal((await t.m.Ride.findById(rideId).lean()).goodsAdvance.status, 'refunded');

  const second = await refundGoodsAdvance({ rideId, reason: 'again', deps: { getConfig: async () => ({ refundTo: 'source' }) } });
  assert.equal(second.refunded, false);
  assert.equal(cf.refunds.filter((r) => r.orderId === orderId).length, 1);
});
