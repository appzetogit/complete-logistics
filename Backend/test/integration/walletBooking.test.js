// Real-database tests: paying a ride from the rider's wallet (hold at booking, auto-debit at completion,
// shortfall, release on cancel, driver settlement).
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

const WALLET_PRICE = { payment_type: ['cash', 'online', 'wallet'] };

const setup = async ({ balance = 500, setPrice = {}, ...vehicleOverrides } = {}) => {
  const vehicle = await t.factories.vehicle({ setPrice: { ...WALLET_PRICE, ...setPrice }, ...vehicleOverrides });
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, balance);
  return { vehicle, driver, rider };
};

const book = (rider, vehicle, { fare = 180, paymentMethod = 'wallet', ...extra } = {}) => t.api('POST', '/rides', {
  token: rider.token,
  body: { pickup: t.locations.pickup, drop: t.locations.drop, fare, vehicleTypeId: String(vehicle._id), paymentMethod, ...extra },
});

const wallet = async (rider) => (await t.api('GET', '/users/wallet', { token: rider.token })).body.data;
const step = (rideId, driver, status, extra = {}) => t.patchRideStatus(rideId, { token: driver.token, body: { status, ...extra } });
const driveToCompletion = async (rideId, driver, { beforeStart } = {}) => {
  await t.acceptRide(rideId, driver.driver._id);
  assert.equal((await step(rideId, driver, 'arriving')).status, 200);
  if (beforeStart) await beforeStart();
  assert.equal((await step(rideId, driver, 'started')).status, 200);
  assert.equal((await step(rideId, driver, 'arrived')).status, 200);
  const done = await step(rideId, driver, 'completed');
  assert.equal(done.status, 200, done.text);
  return done.body.data;
};

test('book with wallet: the fare is held; the app sees the available and held amounts', async () => {
  const { vehicle, rider } = await setup({ balance: 500 });
  const res = await book(rider, vehicle);
  assert.equal(res.status, 201, res.text);
  const ride = res.body.data.ride;
  assert.equal(ride.paymentMethod, 'wallet');
  assert.equal(res.body.data.paymentMethodChanged, false);
  assert.deepEqual({ amount: ride.walletHold.amount, status: ride.walletHold.status }, { amount: 180, status: 'held' });

  const w = await wallet(rider);
  assert.equal(w.balance, 320);
  assert.equal(w.availableBalance, 320);
  assert.equal(w.heldBalance, 180);
  assert.equal(w.totalBalance, 500);
  assert.equal(w.recentTransactions[0].kind, 'hold');
});

test('complete: the hold is captured, the ride is paid (no payment sheet), the driver is credited', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  const done = await driveToCompletion(rideId, driver);
  assert.equal(done.paymentMethod, 'wallet');
  assert.equal(done.amountToCollect, 0, 'the driver collects nothing');

  const stored = await t.m.Ride.findById(rideId).lean();
  assert.equal(stored.walletHold.status, 'captured');
  assert.equal(stored.walletPayment.amount, 180);
  assert.equal(stored.walletShortfall, 0);
  assert.equal(stored.driverPaymentCollection.status, 'paid');
  assert.equal(stored.paymentMethod, 'wallet', 'settlement keeps the method');

  const w = await wallet(rider);
  assert.equal(w.balance, 320);
  assert.equal(w.heldBalance, 0);

  const asRider = (await t.api('GET', '/rides/active/me', { token: rider.token })).body.data;
  const history = (await t.api('GET', '/rides', { token: rider.token })).body.data.results.find((r) => r.rideId === rideId);
  assert.equal(history.isPaid, true);
  assert.deepEqual(history.walletPayment.amount, 180);
  assert.ok(asRider === null || asRider.rideId !== rideId);

  // nothing left to pay from the completion sheet
  const pay = await t.api('POST', `/rides/${rideId}/complete-payment/wallet`, { token: rider.token, body: { rating: 5 } });
  assert.equal(pay.status, 400, pay.text);

  // driver: credited fare - commission, like an online ride
  const earning = await t.m.WalletTransaction.findOne({ rideId, type: 'ride_earning' }).lean();
  assert.ok(earning && earning.amount > 0, 'driver credited');
  assert.equal(earning.amount, stored.driverEarnings);
});

test('fare grows (waiting): the extra comes from the free balance', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  await driveToCompletion(rideId, driver, {
    beforeStart: () => t.m.Ride.updateOne({ _id: rideId }, {
      $set: { arrivedAt: new Date(Date.now() - 6 * 60 * 1000 - 5000), 'pricingSnapshot.waiting_charge': 2, 'pricingSnapshot.free_waiting_before': 1 },
    }),
  });
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.equal(stored.fare, 190);
  assert.equal(stored.walletPayment.amount, 190);
  assert.equal(stored.walletShortfall, 0);
  assert.equal((await wallet(rider)).balance, 310);
});

test('the wallet cannot cover the extra: a shortfall is left payable, never a negative balance', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 180 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  const done = await driveToCompletion(rideId, driver, {
    beforeStart: () => t.m.Ride.updateOne({ _id: rideId }, {
      $set: { arrivedAt: new Date(Date.now() - 6 * 60 * 1000 - 5000), 'pricingSnapshot.waiting_charge': 2, 'pricingSnapshot.free_waiting_before': 1 },
    }),
  });
  assert.equal(done.walletShortfall, 10);
  assert.equal(done.isPaid, false);
  assert.equal(done.amountToCollect, 0, 'the driver collects nothing in cash (already credited)');
  assert.equal(done.riderPaysInApp, 10, 'the rider pays the rest in the app');
  const w = await wallet(rider);
  assert.equal(w.balance, 0);
  assert.equal(w.heldBalance, 0);

  // the rider tops up and pays only the 10 from the usual completion sheet
  await t.factories.wallet(rider.user._id, 50);
  const pay = await t.api('POST', `/rides/${rideId}/complete-payment/wallet`, { token: rider.token, body: { rating: 5 } });
  assert.equal(pay.status, 201, pay.text);
  assert.equal((await wallet(rider)).balance, 40);
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.equal(stored.paymentMethod, 'wallet', 'still a wallet ride on the receipt');
  assert.equal(stored.walletShortfall, 0);
});

test('not enough balance: the booking is refused with the numbers', async () => {
  const { vehicle, rider } = await setup({ balance: 100 });
  const res = await book(rider, vehicle);
  assert.equal(res.status, 402, res.text);
  assert.equal(res.body.code, 'INSUFFICIENT_WALLET_BALANCE');
  assert.deepEqual(
    { balance: res.body.details.balance, required: res.body.details.required, shortBy: res.body.details.shortBy },
    { balance: 100, required: 180, shortBy: 80 },
  );
  assert.equal(await t.m.Ride.countDocuments({ userId: rider.user._id }), 0);
  assert.equal((await wallet(rider)).balance, 100);
});

test('rider cancels before a driver accepts: the whole hold comes back', async () => {
  const { vehicle, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  const w = await wallet(rider);
  assert.equal(w.balance, 500);
  assert.equal(w.heldBalance, 0);
  assert.equal(w.recentTransactions[0].kind, 'release');
  assert.equal((await t.m.Ride.findById(rideId).lean()).walletHold.status, 'released');
});

test('rider cancels after accept with a ₹20 fee: the hold comes back and the fee is charged once', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500, setPrice: { user_cancellation_fee_type: 'fixed', user_cancellation_fee: 20 } });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  await t.acceptRide(rideId, driver.driver._id);
  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  const w = await wallet(rider);
  assert.equal(w.balance, 480);
  assert.equal(w.heldBalance, 0);
});

test('admin cancels / no driver: full release; a driver cancel that re-dispatches keeps the hold', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const first = String((await book(rider, vehicle)).body.data.ride._id);
  await t.acceptRide(first, driver.driver._id);
  const driverCancel = await t.api('POST', `/rides/${first}/driver-cancel`, { token: driver.token, body: { reason: 'flat tyre' } });
  assert.equal(driverCancel.status, 200, driverCancel.text);
  assert.equal((await t.m.Ride.findById(first).lean()).walletHold.status, 'held', 'the ride is looking for another driver');
  assert.equal((await wallet(rider)).heldBalance, 180);

  const removed = await t.api('DELETE', `/admin/ongoing-rides/${first}`, { token: admin.token });
  assert.equal(removed.status, 200, removed.text);
  await waitFor(async () => (await t.m.Ride.findById(first).lean()).walletHold.status === 'released', { message: 'released' });
  const w = await wallet(rider);
  assert.equal(w.balance, 500);
  assert.equal(w.heldBalance, 0);
});

test('completion retried / captured twice: the wallet is debited once', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  await driveToCompletion(rideId, driver);
  const { captureRideWalletPayment } = await import('../../src/modules/taxi/services/rideWalletService.js');
  const again = await Promise.all([captureRideWalletPayment({ rideId }), captureRideWalletPayment({ rideId })]);
  assert.deepEqual(again, [null, null], 'nothing more to capture');
  assert.equal((await wallet(rider)).balance, 320);
  const debits = (await t.m.UserWallet.findOne({ userId: rider.user._id }).lean()).transactions.filter((tx) => tx.kind === 'debit');
  assert.equal(debits.length, 1);
});

test('wallet not allowed for this vehicle: booked with the allowed method, and the app is told', async () => {
  const { vehicle, rider } = await setup({ balance: 500, setPrice: { payment_type: ['cash', 'online'] } });
  const res = await book(rider, vehicle);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.data.paymentMethodChanged, true);
  assert.equal(res.body.data.requestedPaymentMethod, 'wallet');
  assert.equal(res.body.data.ride.paymentMethod, 'cash');
  assert.equal(res.body.data.ride.walletHold, undefined);
  assert.equal((await wallet(rider)).balance, 500, 'nothing held');
});

test('goods with a 20% advance: the hold covers only the remaining 80%', async () => {
  const { vehicle, rider } = await setup({ balance: 2000 });
  const quote = await t.api('POST', '/deliveries/quote', {
    token: rider.token, body: { vehicleTypeId: String(vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop },
  });
  assert.equal(quote.status, 200, quote.text);
  const res = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, vehicleTypeId: String(vehicle._id), paymentMethod: 'wallet',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
    },
  });
  assert.equal(res.status, 201, res.text);
  const ride = await t.m.Ride.findById(res.body.data.rideId).lean();
  assert.equal(ride.paymentMethod, 'wallet');
  const expectedHold = Math.round((ride.fare - ride.goodsAdvance.amount) * 100) / 100;
  assert.ok(ride.goodsAdvance.amount > 0);
  assert.equal(ride.walletHold.amount, expectedHold);
  assert.equal((await wallet(rider)).heldBalance, expectedHold);
});

test('two holds at once with money for one: only one succeeds', async () => {
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 300);
  const { holdWalletForRide } = await import('../../src/modules/taxi/services/rideWalletService.js');
  const ids = [new t.mongoose.Types.ObjectId(), new t.mongoose.Types.ObjectId()];
  const results = await Promise.allSettled(ids.map((rideId) => holdWalletForRide({ userId: rider.user._id, rideId, amount: 180 })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.details.code, 'INSUFFICIENT_WALLET_BALANCE');
  const w = await wallet(rider);
  assert.equal(w.balance, 120);
  assert.equal(w.heldBalance, 180);
});

test('the driver sees a wallet ride on the offer and has nothing to collect', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  const offers = await waitFor(async () => {
    const res = await t.api('GET', '/drivers/ride-offers', { token: driver.token });
    return (res.body.data?.results || []).find((item) => String(item.rideId) === rideId) || null;
  }, { message: 'offer' });
  assert.equal(offers.paymentMethod, 'wallet');
  await t.acceptRide(rideId, driver.driver._id);
  const active = (await t.api('GET', '/rides/active/me', { token: driver.token })).body.data;
  assert.equal(active.paymentMethod, 'wallet');
  assert.equal(active.amountToCollect, 0);
});

test('the drivers summary tells the app which payment methods (incl. wallet) each vehicle allows', async () => {
  const withWallet = await t.factories.vehicle({ setPrice: WALLET_PRICE });
  const withoutWallet = await t.factories.vehicle({ setPrice: { payment_type: ['cash'] } });
  const rider = await t.factories.user();
  const [lng, lat] = t.locations.pickup;
  const res = await t.api('GET', `/rides/available-drivers/summary?lat=${lat}&lng=${lng}&vehicleTypeIds=${withWallet._id},${withoutWallet._id}`, { token: rider.token });
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.body.data.byVehicleType[String(withWallet._id)].allowedPaymentMethods, ['cash', 'online', 'wallet']);
  assert.deepEqual(res.body.data.byVehicleType[String(withoutWallet._id)].allowedPaymentMethods, ['cash']);
});


test('a driver cannot turn a cash ride into a wallet ride (no surprise wallet debit)', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle, { paymentMethod: 'cash' })).body.data.ride._id);
  await t.acceptRide(rideId, driver.driver._id);
  await step(rideId, driver, 'arriving');
  await step(rideId, driver, 'started');
  await step(rideId, driver, 'arrived');
  const done = await step(rideId, driver, 'completed', { paymentMethod: 'wallet' });
  assert.equal(done.status, 200, done.text);
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.notEqual(stored.paymentMethod, 'wallet');
  assert.equal(stored.walletPayment, undefined);
  assert.equal((await wallet(rider)).balance, 500, 'the wallet was not touched');
});

test('a wallet payment that did not run at completion is retried by the sweep (hold not stuck)', async () => {
  const { vehicle, driver, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  await driveToCompletion(rideId, driver);
  // put the ride and wallet back to "completed but never captured", as after a failed capture
  await t.m.Ride.updateOne({ _id: rideId }, {
    $unset: { walletPayment: 1, driverPaymentCollection: 1 },
    $set: { 'walletHold.status': 'held', walletShortfall: 0, completedAt: new Date(Date.now() - 5 * 60 * 1000) },
  });
  await t.m.UserWallet.updateOne({ userId: rider.user._id }, { $set: { balance: 320, heldBalance: 180 } });

  const { releaseStaleRideWalletHolds } = await import('../../src/modules/taxi/services/rideWalletService.js');
  await releaseStaleRideWalletHolds();
  const stored = await t.m.Ride.findById(rideId).lean();
  assert.equal(stored.walletHold.status, 'captured');
  assert.equal(stored.walletPayment.amount, 180);
  const w = await wallet(rider);
  assert.equal(w.balance, 320);
  assert.equal(w.heldBalance, 0, 'nothing left locked');
});

test('a release never gives back more than is held (no money created)', async () => {
  const { vehicle, rider } = await setup({ balance: 500 });
  const rideId = String((await book(rider, vehicle)).body.data.ride._id);
  const { releaseRideWalletHold } = await import('../../src/modules/taxi/services/rideWalletService.js');
  await Promise.all([releaseRideWalletHold({ rideId }), releaseRideWalletHold({ rideId }), releaseRideWalletHold({ rideId })]);
  const w = await wallet(rider);
  assert.equal(w.balance, 500);
  assert.equal(w.heldBalance, 0);
});

test('admin wallet debit is atomic and refuses to go below zero', async () => {
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 100);
  const debit = (amount) => t.api('POST', `/admin/wallet/users/${rider.user._id}/adjust`, { token: admin.token, body: { amount, operation: 'debit' } });
  assert.equal((await debit(150)).status, 400);
  const results = await Promise.all([debit(60), debit(60)]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, 'only one of two parallel debits fits');
  assert.equal((await wallet(rider)).balance, 40);
});
