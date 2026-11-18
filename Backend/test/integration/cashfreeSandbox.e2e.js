// End-to-end run against the REAL Cashfree sandbox (not part of the normal test run: no ".test.js" in the name).
//
//   CASHFREE_KEYS_CSV="C:/path/APIKey.csv" INTEGRATION_MONGODB_URI="mongodb://127.0.0.1:27099/?replicaSet=rs0&directConnection=true" \
//     node --test --test-force-exit test/integration/cashfreeSandbox.e2e.js
//
// Our own backend (real app, real database) talks to the sandbox; the "customer" pays with Cashfree's test UPI id
// through the same Order Pay API the checkout SDK uses. The CSV holds "AppId,SecretKey" and is never printed.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

const csv = process.env.CASHFREE_KEYS_CSV;
if (!csv) throw new Error('Set CASHFREE_KEYS_CSV to the sandbox APIKey.csv');
const [APP_ID, SECRET] = fs.readFileSync(csv, 'utf8').trim().split(',').map((v) => v.trim());
const SANDBOX = 'https://sandbox.cashfree.com/pg';
const FARE = 200;

let t;
let PaymentOrder;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  const { AdminThirdPartySetting } = await import('../../src/modules/taxi/admin/models/AdminThirdPartySetting.js');
  ({ PaymentOrder } = await import('../../src/modules/taxi/payments/models/PaymentOrder.js'));
  const { ensureThirdPartySettings } = await import('../../src/modules/taxi/admin/services/adminService.js');
  await ensureThirdPartySettings();
  // configured the way the Admin page saves it
  const { token } = await t.factories.admin();
  const saved = await t.api('PATCH', '/admin/integration-settings/payment-settings', {
    token,
    body: { cashfree: { enabled: '1', environment: 'test', test_app_id: APP_ID, test_secret_key: SECRET } },
  });
  assert.equal(saved.status, 200, saved.text);
  void AdminThirdPartySetting;
});
after(async () => { await t.stop(); });

const gatewayCall = async (method, path, body, extraHeaders = {}) => {
  const res = await fetch(`${SANDBOX}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-client-id': APP_ID, 'x-client-secret': SECRET, 'x-api-version': '2023-08-01', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// what the checkout SDK does with the payment session
const customerPays = async (paymentSessionId) => {
  const res = await gatewayCall('POST', '/orders/sessions', {
    payment_session_id: paymentSessionId,
    payment_method: { upi: { channel: 'collect', upi_id: 'testsuccess@gocash' } },
  }, { 'x-client-device': 'desktop' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
};

// the app calls verify until it is paid (UPI collect takes ~25 s in the sandbox)
const verifyUntilPaid = async (path, token, body, { timeout = 120000 } = {}) => {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await t.api('POST', path, { token, body });
    if (last.status !== 200 || last.body.data.status !== 'pending') return last;
    await sleep(4000);
  }
  throw new Error(`still pending after ${timeout} ms: ${last?.text}`);
};

const signedWebhook = async (orderId) => {
  const raw = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } });
  const timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', SECRET).update(`${timestamp}${raw}`).digest('base64');
  const res = await fetch(`${t.baseUrl}/api/v1/payments/cashfree/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
};

test('public gateway info says cashfree_checkout', async () => {
  const res = await t.api('GET', '/common/payment-gateway');
  assert.equal(res.status, 200, res.text);
  const gateway = res.body.data.activeGateway;
  assert.equal(gateway.slug, 'cashfree');
  assert.equal(gateway.walletTopUpMode, 'cashfree_checkout');
  assert.equal(gateway.ridePaymentMode, 'cashfree_checkout');
});

test('rider wallet: real order, real sandbox payment, credited once (verify + webhook + again)', async () => {
  const rider = await t.factories.user();
  const created = await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 25 } });
  assert.equal(created.status, 201, created.text);
  const { orderId, paymentSessionId, environment } = created.body.data;
  assert.equal(environment, 'sandbox');
  assert.ok(paymentSessionId);

  const before = await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } });
  assert.equal(before.body.data.status, 'pending');

  await customerPays(paymentSessionId);
  const paid = await verifyUntilPaid('/v1/payments/cashfree/user-wallet/verify', rider.token, { orderId });
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.body.data.paid, true, paid.text);
  assert.equal(paid.body.data.wallet.balance, 25);

  const [hook, again] = await Promise.all([
    signedWebhook(orderId),
    t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: rider.token, body: { orderId } }),
  ]);
  assert.equal(hook.status, 200);
  assert.equal(again.status, 200);
  const wallet = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(wallet.balance, 25, 'credited once');
  const row = await PaymentOrder.findOne({ orderId }).lean();
  assert.equal(row.status, 'applied');
  assert.match(row.providerPaymentId, /^\d+$/);
});

test('driver wallet: real payment credits the driver wallet once', async () => {
  const { driver, token } = await t.factories.driver({ wallet: { balance: 0, cashLimit: 100, isBlocked: false } });
  const created = await t.api('POST', '/v1/payments/cashfree/driver-wallet/order', { token, body: { amount: 40 } });
  assert.equal(created.status, 201, created.text);
  const { orderId, paymentSessionId } = created.body.data;
  await customerPays(paymentSessionId);
  const paid = await verifyUntilPaid('/v1/payments/cashfree/driver-wallet/verify', token, { orderId });
  assert.equal(paid.body.data.paid, true, paid.text);
  await signedWebhook(orderId);
  const rows = await t.m.WalletTransaction.find({ driverId: driver._id, type: 'top_up' }).lean();
  assert.equal(rows.length, 1);
  assert.equal((await t.m.Driver.findById(driver._id).lean()).wallet.balance, 40);
});

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
    assert.equal((await t.patchRideStatus(rideId, { token: driver.token, body: { status } })).status, 200);
  }
  assert.equal((await t.patchRideStatus(rideId, { token: driver.token, body: { status: 'completed', cashReceived: false } })).status, 200);
  return { rideId, driver, rider };
};

test('ride payment: fare + tip paid for real; ride paid, driver credited once', async () => {
  const { rideId, rider } = await arrivedCashRide();
  const created = await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/order`, { token: rider.token, body: { tipAmount: 10 } });
  assert.equal(created.status, 201, created.text);
  const { orderId, paymentSessionId, totalCharge } = created.body.data;
  assert.equal(totalCharge, FARE + 10);

  await customerPays(paymentSessionId);
  const paid = await verifyUntilPaid(`/v1/payments/cashfree/rides/${rideId}/verify`, rider.token, { orderId, rating: 5 });
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.body.data.paid, true);

  const ride = await t.m.Ride.findById(rideId).lean();
  assert.equal(ride.driverPaymentCollection.status, 'paid');
  assert.equal(ride.driverPaymentCollection.provider, 'cashfree');
  assert.equal(ride.feedback.tipAmount, 10);
  const rows = await t.m.WalletTransaction.find({ rideId }).lean();
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, FARE - 40 + 10);
  await signedWebhook(orderId);
  assert.equal((await t.m.WalletTransaction.find({ rideId }).lean()).length, rows.length, 'webhook after verify changes nothing');
});

test('ride payment: the ride gets paid in cash meanwhile -> the online payment is really refunded at Cashfree', async () => {
  const { rideId, rider } = await arrivedCashRide();
  const created = await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/order`, { token: rider.token, body: {} });
  const { orderId, paymentSessionId } = created.body.data;
  await t.m.Ride.updateOne(
    { _id: rideId },
    { $set: { 'driverPaymentCollection.status': 'paid', 'driverPaymentCollection.source': 'cash', 'driverPaymentCollection.amount': FARE, 'driverPaymentCollection.paidAt': new Date() } },
  );

  await customerPays(paymentSessionId);
  const result = await verifyUntilPaid(`/v1/payments/cashfree/rides/${rideId}/verify`, rider.token, { orderId });
  assert.equal(result.status, 409, result.text);
  assert.equal(result.body.details?.code ?? result.body.code, 'payment_refunded');

  const row = await PaymentOrder.findOne({ orderId }).lean();
  assert.equal(row.status, 'refunded', JSON.stringify(row.refund));
  const refund = await gatewayCall('GET', `/orders/${orderId}/refunds/rf_${orderId}`);
  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.equal(refund.body.refund_amount, FARE);

  // a second verify / webhook never refunds again
  await signedWebhook(orderId);
  await t.api('POST', `/v1/payments/cashfree/rides/${rideId}/verify`, { token: rider.token, body: { orderId } });
  const list = await gatewayCall('GET', `/orders/${orderId}/refunds`);
  assert.equal(list.body.length, 1, 'one refund at Cashfree');
});

test('security against the real gateway: wrong signature refused, other rider cannot verify, amount is ours', async () => {
  const rider = await t.factories.user();
  const other = await t.factories.user();
  const { orderId } = (await t.api('POST', '/v1/payments/cashfree/user-wallet/order', { token: rider.token, body: { amount: 15 } })).body.data;
  const raw = JSON.stringify({ data: { order: { order_id: orderId } } });
  const forged = await fetch(`${t.baseUrl}/api/v1/payments/cashfree/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'AAAA', 'x-webhook-timestamp': String(Date.now()) },
    body: raw,
  });
  assert.equal(forged.status, 401);
  assert.equal((await t.api('POST', '/v1/payments/cashfree/user-wallet/verify', { token: other.token, body: { orderId } })).status, 404);
  // a webhook claiming "paid" for an order nobody paid changes nothing: Cashfree is asked, not the body
  const hook = await signedWebhook(orderId);
  assert.equal(hook.body.status, 'pending');
  assert.equal((await t.m.UserWallet.findOne({ userId: rider.user._id }).lean())?.balance ?? 0, 0);
});
