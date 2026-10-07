// Real-database tests: goods riders can pay the 20% advance or the full fare up front.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const round2 = (n) => Math.round(n * 100) / 100;

const setup = async () => {
  const vehicle = await t.factories.vehicle({ commission: 10 });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 5000);
  return { vehicle, rider, driver };
};

const quote = async ({ vehicle, rider }) => {
  const res = await t.api('POST', '/deliveries/quote', {
    token: rider.token,
    body: { vehicleTypeId: String(vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop },
  });
  assert.equal(res.status, 200, res.text);
  return res.body.data;
};

const book = async ({ vehicle, rider }, extra = {}) => {
  const res = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, pickupAddress: 'A', dropAddress: 'B',
      vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
      ...extra,
    },
  });
  assert.equal(res.status, 201, res.text);
  return res.body.data;
};

const payWithWallet = (rider, rideId) => t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
const setTransport = (values) => t.setSettings('transport_ride', values);
const reset = () => setTransport({ goods_advance_percent: '20', goods_advance_allow_full: 'true' });

test('quote offers [20, 100] when full payment is allowed', async () => {
  await reset();
  const q = await quote(await setup());
  assert.deepEqual(q.advanceOptions, [20, 100]);
  assert.equal(q.advancePercent, 20);
});

test('quote offers only the default when full payment is switched off', async () => {
  await setTransport({ goods_advance_percent: '20', goods_advance_allow_full: 'false' });
  const q = await quote(await setup());
  assert.deepEqual(q.advanceOptions, [20]);
  await reset();
});

test('default percent already 100 gives just [100]; advance off gives no options', async () => {
  await setTransport({ goods_advance_percent: '100', goods_advance_allow_full: 'true' });
  assert.deepEqual((await quote(await setup())).advanceOptions, [100]);

  await setTransport({ goods_advance_percent: '0', goods_advance_allow_full: 'true' });
  assert.deepEqual((await quote(await setup())).advanceOptions, []);
  await reset();
});

test('advancePercent 100: whole fare is the advance, nothing remains, still not dispatched', async () => {
  await reset();
  const ctx = await setup();
  const delivery = await book(ctx, { advancePercent: 100 });
  assert.equal(delivery.goodsAdvance.percent, 100);
  assert.equal(delivery.goodsAdvance.amount, round2(delivery.fare));
  assert.equal(delivery.goodsAdvance.status, 'pending');
  assert.equal(delivery.remainingFare, 0);
  const ride = await t.m.Ride.findById(delivery.rideId).lean();
  assert.equal(ride.status, 'searching');
});

test('advancePercent is ignored when full is disallowed, tampered, or omitted', async () => {
  await setTransport({ goods_advance_percent: '20', goods_advance_allow_full: 'false' });
  assert.equal((await book(await setup(), { advancePercent: 100 })).goodsAdvance.percent, 20);

  await reset();
  assert.equal((await book(await setup(), { advancePercent: 37 })).goodsAdvance.percent, 20);
  assert.equal((await book(await setup(), { advancePercent: -5 })).goodsAdvance.percent, 20);
  assert.equal((await book(await setup(), { advancePercent: 'abc' })).goodsAdvance.percent, 20);
  assert.equal((await book(await setup())).goodsAdvance.percent, 20);
});

test('fully prepaid ride: pay -> dispatch -> completes with nothing due; driver gets fare - commission', async () => {
  await reset();
  const ctx = await setup();
  const delivery = await book(ctx, { advancePercent: 100 });
  const fare = delivery.fare;

  const paid = await payWithWallet(ctx.rider, delivery.rideId);
  assert.equal(paid.status, 201, paid.text);
  assert.equal(paid.body.data.goodsAdvance.status, 'paid');
  assert.equal(paid.body.data.remainingFare, 0);

  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  for (const status of ['arriving', 'goods_loaded', 'started', 'arrived', 'goods_delivered', 'completed']) {
    const res = await t.api('PATCH', `/rides/${delivery.rideId}/status`, {
      token: ctx.driver.token, body: { status, proofImageUrl: 'https://example.com/p.jpg' },
    });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }

  // nothing is due: no wallet charge and no Razorpay order for 0
  const walletPay = await t.api('POST', `/rides/${delivery.rideId}/complete-payment/wallet`, { token: ctx.rider.token, body: { rating: 5, tipAmount: 0 } });
  assert.equal(walletPay.status, 400);
  assert.match(walletPay.body.message, /No payable amount/);
  const order = await t.api('POST', `/rides/${delivery.rideId}/complete-payment/razorpay/order`, { token: ctx.rider.token, body: { rating: 5, tipAmount: 0 } });
  assert.equal(order.status, 400);
  assert.match(order.body.message, /No payable amount/);

  const feedback = await t.api('PATCH', `/rides/${delivery.rideId}/feedback`, { token: ctx.rider.token, body: { rating: 5 } });
  assert.equal(feedback.status, 200, feedback.text);

  const rows = await t.m.WalletTransaction.find({ rideId: delivery.rideId }).lean();
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(round2(total), round2(fare - round2(fare * 0.1)));
});

test('paid in full: user cancel forfeits it, admin cancel refunds the full fare', async () => {
  await reset();
  const a = await setup();
  const forfeited = await book(a, { advancePercent: 100 });
  await payWithWallet(a.rider, forfeited.rideId);
  const cancel = await t.api('PATCH', `/rides/${forfeited.rideId}/cancel`, { token: a.rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.body.data.advanceRefunded, false);
  assert.equal((await t.m.Ride.findById(forfeited.rideId).lean()).goodsAdvance.status, 'forfeited');

  const b = await setup();
  const refunded = await book(b, { advancePercent: 100 });
  await payWithWallet(b.rider, refunded.rideId);
  await t.acceptRide(refunded.rideId, b.driver.driver._id);
  await t.dispatchService.cancelRideByAdmin(refunded.rideId);
  const ride = await t.m.Ride.findById(refunded.rideId).lean();
  assert.equal(ride.goodsAdvance.status, 'refunded');
  const wallet = await t.m.UserWallet.findOne({ userId: b.rider.user._id }).lean();
  assert.equal(wallet.refundWallet, round2(refunded.fare));
});
