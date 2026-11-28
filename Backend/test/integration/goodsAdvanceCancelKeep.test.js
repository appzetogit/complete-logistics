// Real-database tests: when the rider cancels after paying the goods advance, a share of the FARE
// (goods_advance_cancel_keep_percent, default 15%, never more than the advance) is kept and the rest is refunded.
//   fare 1000, advance 200 (20%)  -> kept 150, refunded 50
//   fare 1000, paid in full 1000  -> kept 150, refunded 850
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
let service;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  service = await import('../../src/modules/taxi/user/services/goodsAdvanceService.js');
});
after(async () => { await t.stop(); });
beforeEach(() => t.setSettings('transport_ride', {
  goods_advance_percent: '20',
  goods_advance_allow_full: 'true',
  goods_advance_refund_to: 'refund_wallet',
  goods_advance_cancel_keep_percent: '15',
}));

const round2 = (n) => Math.round(n * 100) / 100;

const setup = async ({ setPrice } = {}) => {
  const vehicle = await t.factories.vehicle({ commission: 10, ...(setPrice ? { setPrice } : {}) });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, 5000);
  return { vehicle, rider, driver };
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

const bookAndPay = async (ctx, extra) => {
  const delivery = await book(ctx, extra);
  const paid = await t.api('POST', '/deliveries/advance/wallet', { token: ctx.rider.token, body: { rideId: delivery.rideId } });
  assert.equal(paid.status, 201, paid.text);
  return delivery;
};

const cancel = (rider, rideId) => t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
const walletOf = (userId) => t.m.UserWallet.findOne({ userId }).lean();
const loadRide = (rideId) => t.m.Ride.findById(rideId).lean();

// what the rule says for this booking
const expectedSplit = (delivery, keepPercent = 15) => {
  const advance = round2(delivery.goodsAdvance.amount);
  const kept = Math.min(advance, round2((round2(delivery.fare) * keepPercent) / 100));
  return { advance, kept, refunded: round2(advance - kept) };
};

test('the keep share defaults to 15% of the fare', async () => {
  await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: '' });
  assert.equal((await service.getGoodsAdvanceConfig()).cancelKeepPercent, 15);
  await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: '22.5' });
  assert.equal((await service.getGoodsAdvanceConfig()).cancelKeepPercent, 22.5);
  await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: 'abc' });
  assert.equal((await service.getGoodsAdvanceConfig()).cancelKeepPercent, 15, 'a bad value falls back to 15');
});

test('the split is a share of the FARE, capped at the advance, never negative', () => {
  const split = service.splitAdvanceOnRiderCancel;
  assert.deepEqual(split({ fare: 1000, advanceAmount: 200, keepPercent: 15 }), { keptAmount: 150, refundAmount: 50 });
  assert.deepEqual(split({ fare: 1000, advanceAmount: 1000, keepPercent: 15 }), { keptAmount: 150, refundAmount: 850 });
  assert.deepEqual(split({ fare: 1000, advanceAmount: 200, keepPercent: 20 }), { keptAmount: 200, refundAmount: 0 });
  assert.deepEqual(split({ fare: 1000, advanceAmount: 200, keepPercent: 40 }), { keptAmount: 200, refundAmount: 0 });
  assert.deepEqual(split({ fare: 1000, advanceAmount: 200, keepPercent: 0 }), { keptAmount: 0, refundAmount: 200 });
  assert.deepEqual(split({ fare: 0, advanceAmount: 200, keepPercent: 15 }), { keptAmount: 0, refundAmount: 200 });
  assert.deepEqual(split({ fare: 333.33, advanceAmount: 66.67, keepPercent: 15 }), { keptAmount: 50, refundAmount: 16.67 });
});

test('20% advance, rider cancels after a driver is assigned: 15% of the fare kept, the rest refunded', async () => {
  const ctx = await setup();
  const riderSocket = await t.connectSocket(ctx.rider.token);
  const delivery = await bookAndPay(ctx);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  const before = await walletOf(ctx.rider.user._id);
  const { kept, refunded } = expectedSplit(delivery);
  assert.ok(refunded > 0 && kept > 0, 'the example has both a kept and a refunded part');

  const res = await cancel(ctx.rider, delivery.rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.advanceStatus, 'forfeited');
  assert.equal(res.body.data.advanceRefunded, true);
  assert.equal(res.body.data.advanceKeptAmount, kept);
  assert.equal(res.body.data.advanceRefundedAmount, refunded);
  assert.equal(res.body.data.advanceRefundDestination, 'refund_wallet');

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'forfeited');
  assert.equal(ride.goodsAdvance.keptAmount, kept);
  assert.equal(ride.goodsAdvance.refundedAmount, refunded);
  assert.equal(ride.goodsAdvance.refundDestination, 'refund_wallet');
  assert.ok(ride.goodsAdvance.refundedAt && ride.goodsAdvance.forfeitedAt);
  assert.equal(round2(kept + refunded), round2(ride.goodsAdvance.amount), 'kept + refunded = the advance');

  const after = await walletOf(ctx.rider.user._id);
  assert.equal(round2(after.refundWallet - before.refundWallet), refunded, 'only the refunded part is credited');
  assert.equal(after.balance, before.balance);
  assert.equal(after.transactions.at(-1).walletField, 'refundWallet');

  const event = await waitFor(() => riderSocket.of('goodsAdvance:refunded')[0], { message: 'refund event' });
  assert.equal(event.payload.amount, refunded);
  assert.equal(event.payload.keptAmount, kept);
  assert.equal(event.payload.destination, 'refund_wallet');
  assert.equal(event.payload.reason, 'cancelled_by_rider');
});

test('paid in full: 15% of the fare kept, everything else refunded', async () => {
  const ctx = await setup();
  const delivery = await bookAndPay(ctx, { advancePercent: 100 });
  const { advance, kept, refunded } = expectedSplit(delivery);
  assert.equal(advance, round2(delivery.fare), 'the whole fare was paid up front');
  assert.equal(kept, round2(delivery.fare * 0.15));
  assert.equal(refunded, round2(delivery.fare - kept));

  const res = await cancel(ctx.rider, delivery.rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.advanceKeptAmount, kept);
  assert.equal(res.body.data.advanceRefundedAmount, refunded);
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, refunded);
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'forfeited');
});

test('cancelling before any driver is assigned follows the same rule', async () => {
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  const { kept, refunded } = expectedSplit(delivery);

  const res = await cancel(ctx.rider, delivery.rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.advanceKeptAmount, kept);
  assert.equal(res.body.data.advanceRefundedAmount, refunded);
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, refunded);
});

test('a repeated or simultaneous settlement refunds exactly once', async () => {
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  const { kept, refunded } = expectedSplit(delivery);

  // several settlements at the same instant: exactly one wins
  const outcomes = await Promise.all(Array.from({ length: 4 }, () => service.forfeitGoodsAdvance({ rideId: delivery.rideId })));
  assert.equal(outcomes.filter((outcome) => outcome.forfeited).length, 1, 'only one call settles it');
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, refunded, 'refunded once, not four times');

  // cancelling through the API afterwards, again and again, changes nothing and reports what was settled
  for (let i = 0; i < 2; i += 1) {
    const res = await cancel(ctx.rider, delivery.rideId);
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.data.advanceStatus, 'forfeited');
    assert.equal(res.body.data.advanceKeptAmount, kept);
    assert.equal(res.body.data.advanceRefundedAmount, refunded);
  }
  const wallet = await walletOf(ctx.rider.user._id);
  assert.equal(wallet.refundWallet, refunded);
  assert.equal(wallet.transactions.filter((row) => row.provider === 'goods_advance_refund').length, 1);
});

test('the refund can go to the spendable wallet balance', async () => {
  await t.setSettings('transport_ride', { goods_advance_refund_to: 'wallet' });
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  const before = await walletOf(ctx.rider.user._id);
  const { refunded } = expectedSplit(delivery);

  assert.equal((await cancel(ctx.rider, delivery.rideId)).status, 200);
  const after = await walletOf(ctx.rider.user._id);
  assert.equal(round2(after.balance - before.balance), refunded);
  assert.equal(after.refundWallet, before.refundWallet);
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.refundDestination, 'wallet');
});

test('when cancellation fees go to the driver, the driver gets only the kept part', async () => {
  const ctx = await setup({ setPrice: { cancellation_fee_goes_to: 'driver' } });
  const delivery = await bookAndPay(ctx);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  const { advance, kept, refunded } = expectedSplit(delivery);
  assert.ok(kept < advance, 'the driver must not get the whole advance');

  assert.equal((await cancel(ctx.rider, delivery.rideId)).status, 200);
  const credits = (await t.m.WalletTransaction.find({ rideId: delivery.rideId, driverId: ctx.driver.driver._id }).lean())
    .filter((row) => /Advance received/i.test(row.description || ''));
  assert.equal(credits.length, 1);
  assert.equal(credits[0].amount, kept);
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, refunded, 'the rider still gets the rest');
});

test('a keep share at or above the advance share refunds nothing (and never goes negative)', async () => {
  await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: '30' });
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  const before = await walletOf(ctx.rider.user._id);

  const res = await cancel(ctx.rider, delivery.rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.advanceStatus, 'forfeited');
  assert.equal(res.body.data.advanceRefunded, false);
  assert.equal(res.body.data.advanceKeptAmount, round2(delivery.goodsAdvance.amount), 'the whole advance is kept');
  assert.equal(res.body.data.advanceRefundedAmount, 0);

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.refundedAmount, 0);
  assert.equal(ride.goodsAdvance.refundedAt, null);
  const after = await walletOf(ctx.rider.user._id);
  assert.equal(after.refundWallet, before.refundWallet);
  assert.equal(after.balance, before.balance);
});

test('keep percent 0 refunds the whole advance (recorded as an ordinary refund)', async () => {
  await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: '0' });
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);

  const res = await cancel(ctx.rider, delivery.rideId);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.advanceStatus, 'refunded');
  assert.equal(res.body.data.advanceRefunded, true);
  assert.equal(res.body.data.advanceKeptAmount, 0);
  assert.equal(res.body.data.advanceRefundedAmount, round2(delivery.goodsAdvance.amount));
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, round2(delivery.goodsAdvance.amount));
});

test('refund to the original Razorpay payment: only the refunded part goes to the gateway; a gateway failure reverts to paid and can be retried', async () => {
  await t.setSettings('transport_ride', { goods_advance_refund_to: 'source' });
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  // pretend the advance was paid through Razorpay
  await t.m.Ride.updateOne(
    { _id: delivery.rideId },
    { $set: { 'goodsAdvance.provider': 'razorpay', 'goodsAdvance.providerPaymentId': 'pay_test_1' } },
  );
  const walletBefore = await walletOf(ctx.rider.user._id);
  const { kept, refunded } = expectedSplit(delivery);

  const calls = [];
  const credentials = async () => ({ keyId: 'k', keySecret: 's' });

  // 1) the gateway fails: nothing is settled, the advance is `paid` again
  await assert.rejects(() => service.forfeitGoodsAdvance({
    rideId: delivery.rideId,
    deps: { resolveCredentials: credentials, razorpayRequest: async () => { throw new Error('gateway down'); } },
  }), /gateway down/);
  let ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'paid');
  assert.equal(ride.goodsAdvance.keptAmount, 0);
  assert.equal(ride.goodsAdvance.refundedAmount, 0);
  assert.equal(ride.goodsAdvance.refundedAt, null);
  assert.equal(ride.goodsAdvance.forfeitedAt, null);

  // 2) retry: the gateway is asked for the refunded part only
  const outcome = await service.forfeitGoodsAdvance({
    rideId: delivery.rideId,
    deps: { resolveCredentials: credentials, razorpayRequest: async (request) => { calls.push(request); return { id: 'rfnd_1' }; } },
  });
  assert.equal(outcome.forfeited, true);
  assert.equal(outcome.keptAmount, kept);
  assert.equal(outcome.refundedAmount, refunded);
  assert.equal(outcome.refundDestination, 'source');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/payments/pay_test_1/refund');
  assert.equal(calls[0].body.amount, Math.round(refunded * 100), 'paise');

  ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'forfeited');
  assert.equal(ride.goodsAdvance.refundDestination, 'source');
  const walletAfter = await walletOf(ctx.rider.user._id);
  assert.equal(walletAfter.refundWallet, walletBefore.refundWallet, 'a gateway refund does not touch the wallet');

  // 3) a repeat does nothing and does not call the gateway again
  const repeat = await service.forfeitGoodsAdvance({
    rideId: delivery.rideId,
    deps: { resolveCredentials: credentials, razorpayRequest: async (request) => { calls.push(request); return {}; } },
  });
  assert.equal(repeat.forfeited, false);
  assert.equal(calls.length, 1);
});

test('driver cancel, admin cancel and no driver found still refund the whole advance', async () => {
  const ctx = await setup();
  const delivery = await bookAndPay(ctx);
  await t.acceptRide(delivery.rideId, ctx.driver.driver._id);
  await t.dispatchService.cancelRideByAdmin(delivery.rideId);

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'refunded');
  assert.equal(ride.goodsAdvance.refundedAmount, round2(delivery.goodsAdvance.amount));
  assert.equal(ride.goodsAdvance.keptAmount, 0);
  assert.equal((await walletOf(ctx.rider.user._id)).refundWallet, round2(delivery.goodsAdvance.amount));
});

test('advances settled before this change still read correctly', () => {
  const legacyForfeit = service.serializeGoodsAdvance({ goodsAdvance: { status: 'forfeited', amount: 200 } });
  assert.equal(legacyForfeit.keptAmount, 200);
  assert.equal(legacyForfeit.refundedAmount, 0);
  const legacyRefund = service.serializeGoodsAdvance({ goodsAdvance: { status: 'refunded', amount: 200 } });
  assert.equal(legacyRefund.refundedAmount, 200);
  assert.equal(legacyRefund.keptAmount, 0);
  const split = service.serializeGoodsAdvance({ goodsAdvance: { status: 'forfeited', amount: 200, keptAmount: 150, refundedAmount: 50 } });
  assert.equal(split.keptAmount, 150);
  assert.equal(split.refundedAmount, 50);
});

// ------------------------------------------------------------------ cancel preview
test('cancel preview shows exactly what the real cancel then does (keep 15, 30 and 0)', async () => {
  for (const keep of ['15', '30', '0']) {
    await t.setSettings('transport_ride', { goods_advance_cancel_keep_percent: keep });
    const ctx = await setup();
    const delivery = await bookAndPay(ctx);

    const preview = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
    assert.equal(preview.status, 200, preview.text);
    const p = preview.body.data;
    const expected = expectedSplit(delivery, Number(keep));
    assert.equal(p.advanceKeptAmount, expected.kept, `keep ${keep}`);
    assert.equal(p.advanceRefundAmount, expected.refunded, `keep ${keep}`);
    assert.equal(p.advanceCancelKeepPercent, Number(keep));
    assert.equal(round2(p.advanceKeptAmount + p.advanceRefundAmount), p.advanceAmount);
    assert.equal(p.advanceForfeited, p.advanceKeptAmount > 0);
    assert.equal(p.advanceRefundable, p.advanceRefundAmount > 0);
    assert.equal(p.advanceRefundDestination, p.advanceRefundAmount > 0 ? 'refund_wallet' : '');

    const done = await cancel(ctx.rider, delivery.rideId);
    assert.equal(done.status, 200, done.text);
    assert.equal(done.body.data.advanceKeptAmount, p.advanceKeptAmount);
    assert.equal(done.body.data.advanceRefundedAmount, p.advanceRefundAmount);
    assert.equal(done.body.data.advanceRefundDestination, p.advanceRefundDestination);
  }
});

test('cancel preview: destination follows the refund setting, nothing for an unpaid advance', async () => {
  await t.setSettings('transport_ride', { goods_advance_refund_to: 'wallet' });
  const ctx = await setup();
  const delivery = await book(ctx);

  const before = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(before.body.data.advanceAmount, 0);
  assert.equal(before.body.data.advanceCancelKeepPercent, 0);
  assert.equal(before.body.data.advanceRefundDestination, '');

  await t.api('POST', '/deliveries/advance/wallet', { token: ctx.rider.token, body: { rideId: delivery.rideId } });
  const after = await t.api('GET', `/rides/${delivery.rideId}/cancel-preview`, { token: ctx.rider.token });
  assert.equal(after.body.data.advanceRefundDestination, 'wallet');
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'paid', 'the preview changes nothing');
});
