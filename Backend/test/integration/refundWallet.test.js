// Real-database tests: refund credits (refundWallet) can be moved into the spendable balance, every wallet entry says
// which amount it touched, and driver-cancel compensation follows its setting.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const riderWithRefund = async ({ balance = 50, refund = 108, transactions = [] } = {}) => {
  const rider = await t.factories.user();
  // straight to the collection, so entries look like old data (no walletField filled in by the schema)
  await t.m.UserWallet.collection.updateOne(
    { userId: rider.user._id },
    { $set: { balance, refundWallet: refund, heldBalance: 0, transactions } },
    { upsert: true },
  );
  return rider;
};
const wallet = async (rider) => (await t.api('GET', '/users/wallet', { token: rider.token })).body.data;
const move = (rider, body = {}) => t.api('POST', '/users/wallet/refund/move', { token: rider.token, body });

test('GET /users/wallet tells the app the refund wallet can be moved (not spent automatically)', async () => {
  const rider = await riderWithRefund();
  const w = await wallet(rider);
  assert.equal(w.refundWallet, 108);
  assert.equal(w.refundWalletMovable, true);
  assert.equal(w.refundWalletSpendable, false);
});

test('move everything: refund 0, balance +108, one "Moved from refund wallet" entry', async () => {
  const rider = await riderWithRefund({ balance: 50, refund: 108 });
  const res = await move(rider);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.refundWallet, 0);
  assert.equal(res.body.data.balance, 158);
  const entry = res.body.data.recentTransactions[0];
  assert.deepEqual(
    { kind: entry.kind, amount: entry.amount, title: entry.title, walletField: entry.walletField },
    { kind: 'credit', amount: 108, title: 'Moved from refund wallet', walletField: 'balance' },
  );

  const again = await move(rider);
  assert.equal(again.status, 400);
  assert.equal(again.body.code, 'REFUND_WALLET_EMPTY');
});

test('move part of it; too much or a bad amount is refused with the standard codes', async () => {
  const rider = await riderWithRefund({ balance: 0, refund: 108 });
  const tooMuch = await move(rider, { amount: 200 });
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.body.code, 'AMOUNT_EXCEEDS_REFUND_WALLET');
  assert.equal(tooMuch.body.details.available, 108);
  for (const amount of [0, -5, 'abc']) {
    const bad = await move(rider, { amount });
    assert.equal(bad.status, 400, `amount ${amount}`);
    assert.equal(bad.body.code, 'INVALID_AMOUNT');
  }
  const part = await move(rider, { amount: 8.456 });
  assert.equal(part.status, 200, part.text);
  assert.equal(part.body.data.refundWallet, 99.54);
  assert.equal(part.body.data.balance, 8.46);
});

test('moves at the same time never move more than was there', async () => {
  const rider = await riderWithRefund({ balance: 0, refund: 100 });
  const results = await Promise.all(Array.from({ length: 6 }, () => move(rider, { amount: 40 })));
  const ok = results.filter((r) => r.status === 200).length;
  assert.equal(ok, 2, '100 holds two moves of 40');
  const stored = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(stored.refundWallet, 20);
  assert.equal(stored.balance, 80);

  const all = await riderWithRefund({ balance: 0, refund: 75 });
  const both = await Promise.all([move(all), move(all), move(all)]);
  assert.equal(both.filter((r) => r.status === 200).length, 1);
  const after2 = await t.m.UserWallet.findOne({ userId: all.user._id }).lean();
  assert.equal(after2.balance, 75);
  assert.equal(after2.refundWallet, 0);
});

test('history entries say which amount they touched (old entries recognised by their title)', async () => {
  const rider = await riderWithRefund({
    transactions: [
      { _id: new t.mongoose.Types.ObjectId(), kind: 'credit', amount: 54, title: 'Goods advance refund for booking 1a2b3c' },
      { _id: new t.mongoose.Types.ObjectId(), kind: 'credit', amount: 40, title: 'Driver cancellation compensation for booking 4d5e6f' },
      { _id: new t.mongoose.Types.ObjectId(), kind: 'credit', amount: 500, title: 'Wallet Refilled' },
      { _id: new t.mongoose.Types.ObjectId(), kind: 'debit', amount: 100, title: 'Ride payment for 777777' },
    ],
  });
  const fields = Object.fromEntries((await wallet(rider)).recentTransactions.map((tx) => [tx.title.split(' for ')[0], tx.walletField]));
  assert.deepEqual(fields, {
    'Goods advance refund': 'refundWallet',
    'Driver cancellation compensation': 'refundWallet',
    'Wallet Refilled': 'balance',
    'Ride payment': 'balance',
  });
});

// ---- driver-cancel compensation
const scheduledRideCancelledByDriver = async () => {
  const vehicle = await t.factories.vehicle({ setPrice: { driver_cancellation_fee_type: 'fixed', driver_cancellation_fee: 40 } });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const booked = await t.api('POST', '/rides', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      scheduledAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    },
  });
  assert.equal(booked.status, 201, booked.text);
  const rideId = booked.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);
  const res = await t.api('POST', `/drivers/scheduled-rides/${rideId}/cancel`, { token: driver.token, body: {} });
  assert.equal(res.status, 200, res.text);
  return rider;
};

test('driver-cancel compensation goes to the spendable wallet by default', async () => {
  const rider = await scheduledRideCancelledByDriver();
  const w = await wallet(rider);
  assert.equal(w.balance, 40);
  assert.equal(w.refundWallet, 0);
  assert.equal(w.recentTransactions[0].walletField, 'balance');
});

test('with driver_cancel_compensation_to = refund_wallet it lands in the refund wallet, marked as such', async () => {
  await t.setSettings('transport_ride', { driver_cancel_compensation_to: 'refund_wallet' });
  try {
    const rider = await scheduledRideCancelledByDriver();
    const w = await wallet(rider);
    assert.equal(w.balance, 0);
    assert.equal(w.refundWallet, 40);
    assert.equal(w.recentTransactions[0].walletField, 'refundWallet');
  } finally {
    await t.setSettings('transport_ride', { driver_cancel_compensation_to: 'wallet' });
  }
});
