// Real-database tests: 20% advance on goods bookings + refund / forfeit rules.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, waitFor } from './harness.js';

let t;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

const deliveryBody = (vehicle, overrides = {}) => ({
  pickup: t.locations.pickup,
  drop: t.locations.drop,
  pickupAddress: 'A',
  dropAddress: 'B',
  vehicleTypeId: String(vehicle._id),
  paymentMethod: 'cash',
  parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
  ...overrides,
});

const round2 = (n) => Math.round(n * 100) / 100;

const setup = async ({ commission = 10, balance = 5000 } = {}) => {
  const vehicle = await t.factories.vehicle({ commission });
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  await t.factories.wallet(rider.user._id, balance);
  return { vehicle, rider, driver };
};

const book = async ({ vehicle, rider }) => {
  const res = await t.api('POST', '/deliveries', { token: rider.token, body: deliveryBody(vehicle) });
  assert.equal(res.status, 201, res.text);
  return res.body.data;
};

const payWithWallet = (rider, rideId) => t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });
const walletOf = async (userId) => t.m.UserWallet.findOne({ userId }).lean();
const loadRide = (rideId) => t.m.Ride.findById(rideId).lean();

test('quote returns advance and remaining amounts (20% default)', async () => {
  const { vehicle, rider } = await setup();
  const res = await t.api('POST', '/deliveries/quote', {
    token: rider.token,
    body: { vehicleTypeId: String(vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop },
  });
  assert.equal(res.status, 200, res.text);
  const q = res.body.data;
  assert.ok(q.total > 0);
  assert.equal(q.advancePercent, 20);
  assert.equal(q.advanceAmount, round2(q.total * 0.2));
  assert.equal(q.remainingAmount, round2(q.total - q.advanceAmount));
});

test('booking starts as pending and is NOT dispatched until the advance is paid', async () => {
  const { vehicle, rider, driver } = await setup();
  const driverSocket = await t.connectSocket(driver.token);

  const delivery = await book({ vehicle, rider });
  assert.equal(delivery.goodsAdvance.status, 'pending');
  assert.equal(delivery.goodsAdvance.percent, 20);
  assert.equal(delivery.remainingFare, round2(delivery.fare - delivery.goodsAdvance.amount));
  assert.equal(delivery.goodsAdvance.amount, round2(delivery.fare * 0.2));

  await sleep(1500);
  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.status, 'searching');
  assert.equal(ride.dispatchTracking.notifiedDriverIds.length, 0, 'no driver was notified');
  assert.equal(ride.dispatchTracking.lastDispatchAttemptAt, null, 'no dispatch attempt ran');
  assert.equal(driverSocket.of('rideRequest').length, 0, 'driver never saw the request');

  // the recovery sweep must not pick it up either
  await t.dispatchService.restoreScheduledDispatches();
  await sleep(800);
  assert.equal(driverSocket.of('rideRequest').length, 0, 'recovery sweep skipped the unpaid booking');
});

test('the /rides + parcel and socket-style bypass is gated too', async () => {
  const { vehicle, rider } = await setup();
  const res = await t.api('POST', '/rides', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, fare: 400, vehicleTypeId: String(vehicle._id),
      serviceType: 'parcel', paymentMethod: 'cash',
    },
  });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.data.ride.goodsAdvance.status, 'pending');
  assert.equal(res.body.data.ride.goodsAdvance.amount, 80);
  await sleep(800);
  const ride = await loadRide(res.body.data.ride._id);
  assert.equal(ride.dispatchTracking.notifiedDriverIds.length, 0);
});

test('plain taxi rides never get an advance', async () => {
  const { vehicle, rider } = await setup();
  const res = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 400, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(res.body.data.ride.goodsAdvance.status, 'none');
});

test('wallet payment: insufficient balance is rejected; paying dispatches and is idempotent', async () => {
  const { vehicle, rider, driver } = await setup({ balance: 1 });
  const driverSocket = await t.connectSocket(driver.token);
  const delivery = await book({ vehicle, rider });
  const advance = delivery.goodsAdvance.amount;

  const poor = await payWithWallet(rider, delivery.rideId);
  assert.equal(poor.status, 400);
  assert.match(poor.body.message, /Insufficient wallet balance/);
  assert.equal((await walletOf(rider.user._id)).balance, 1, 'nothing debited');
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'pending');

  await t.factories.wallet(rider.user._id, 1000);

  // someone else cannot pay for this booking
  const intruder = await t.factories.user();
  await t.factories.wallet(intruder.user._id, 1000);
  assert.equal((await payWithWallet(intruder, delivery.rideId)).status, 404);

  const paid = await payWithWallet(rider, delivery.rideId);
  assert.equal(paid.status, 201, paid.text);
  assert.equal(paid.body.data.goodsAdvance.status, 'paid');
  assert.equal(round2((await walletOf(rider.user._id)).balance), round2(1000 - advance));

  // dispatch started: the driver gets the request, carrying the advance info
  const offer = await waitFor(() => driverSocket.of('rideRequest')[0], { message: 'rideRequest after payment' });
  assert.equal(offer.payload.rideId, delivery.rideId);
  assert.equal(offer.payload.goodsAdvance.status, 'paid');
  assert.equal(offer.payload.remainingFare, delivery.remainingFare);

  const again = await payWithWallet(rider, delivery.rideId);
  assert.equal(again.status, 200);
  assert.equal(round2((await walletOf(rider.user._id)).balance), round2(1000 - advance), 'debited only once');

  // two simultaneous payments on a fresh booking still debit once
  const second = await setup({ balance: 1000 });
  const bookingB = await book(second);
  const results = await Promise.all([payWithWallet(second.rider, bookingB.rideId), payWithWallet(second.rider, bookingB.rideId)]);
  assert.ok(results.every((r) => [200, 201].includes(r.status)), JSON.stringify(results.map((r) => r.text)));
  assert.equal(round2((await walletOf(second.rider.user._id)).balance), round2(1000 - bookingB.goodsAdvance.amount));
});

test('razorpay endpoints: wiring, ownership and validation (gateway itself is not called)', async () => {
  const { vehicle, rider } = await setup();
  const delivery = await book({ vehicle, rider });

  const missing = await t.api('POST', '/deliveries/advance/razorpay/verify', { token: rider.token, body: { rideId: delivery.rideId } });
  assert.equal(missing.status, 400);

  const wrongOrder = await t.api('POST', '/deliveries/advance/razorpay/verify', {
    token: rider.token,
    body: { rideId: delivery.rideId, razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'sig' },
  });
  assert.equal(wrongOrder.status, 400);
  assert.match(wrongOrder.body.message, /does not belong/);

  const unauth = await t.api('POST', '/deliveries/advance/razorpay/order', { body: { rideId: delivery.rideId } });
  assert.equal(unauth.status, 401);

  const otherUser = await t.factories.user();
  const foreign = await t.api('POST', '/deliveries/advance/razorpay/order', { token: otherUser.token, body: { rideId: delivery.rideId } });
  assert.equal(foreign.status, 404);

  // gateway not configured in the test DB -> the order endpoint stops before any network call
  const order = await t.api('POST', '/deliveries/advance/razorpay/order', { token: rider.token, body: { rideId: delivery.rideId } });
  assert.ok([400, 403, 500].includes(order.status), order.text);
});

test('completion with a cash remainder: driver wallet = advance - commission, rider pays only the rest', async () => {
  const { vehicle, rider, driver } = await setup({ commission: 10 });
  const delivery = await book({ vehicle, rider });
  await payWithWallet(rider, delivery.rideId);
  const fare = delivery.fare;
  const advance = delivery.goodsAdvance.amount;
  const commission = round2(fare * 0.1);

  await t.acceptRide(delivery.rideId, driver.driver._id);
  for (const status of ['arriving', 'goods_loaded', 'started', 'arrived', 'goods_delivered', 'completed']) {
    const res = await t.api('PATCH', `/rides/${delivery.rideId}/status`, {
      token: driver.token,
      body: { status, proofImageUrl: 'https://example.com/p.jpg' },
    });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }

  const settle = await t.m.WalletTransaction.findOne({ rideId: delivery.rideId, type: { $in: ['ride_earning', 'commission_deduction'] } }).lean();
  assert.equal(settle.type, 'ride_earning');
  assert.equal(settle.amount, round2(advance - commission), 'platform owes advance minus commission');

  // rider pays the remaining amount from the wallet at completion
  const before = (await walletOf(rider.user._id)).balance;
  const pay = await t.api('POST', `/rides/${delivery.rideId}/complete-payment/wallet`, {
    token: rider.token, body: { rating: 5, tipAmount: 0 },
  });
  assert.equal(pay.status, 201, pay.text);
  const after = (await walletOf(rider.user._id)).balance;
  assert.equal(round2(before - after), round2(fare - advance), 'rider charged fare - advance');

  // driver ends up with fare - commission in total (cash in hand covers nothing here: paid online)
  const totalWallet = (await t.m.WalletTransaction.find({ rideId: delivery.rideId }).lean()).reduce((sum, row) => sum + row.amount, 0);
  assert.equal(round2(totalWallet), round2(fare - commission));
});

test('rider cancels after the advance is paid: advance forfeited, no refund, repeat cancel is harmless', async () => {
  const { vehicle, rider, driver } = await setup();
  const delivery = await book({ vehicle, rider });
  await payWithWallet(rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, driver.driver._id);
  const walletBefore = await walletOf(rider.user._id);

  const cancel = await t.api('PATCH', `/rides/${delivery.rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  assert.equal(cancel.body.data.advanceRefunded, false);
  assert.equal(cancel.body.data.advanceStatus, 'forfeited');

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'forfeited');
  const walletAfter = await walletOf(rider.user._id);
  assert.equal(walletAfter.balance, walletBefore.balance);
  assert.equal(walletAfter.refundWallet, walletBefore.refundWallet, 'nothing refunded');

  const again = await t.api('PATCH', `/rides/${delivery.rideId}/cancel`, { token: rider.token });
  assert.equal(again.status, 200);
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'forfeited');
});

test('rider cancels before paying: nothing was charged, nothing to refund', async () => {
  const { vehicle, rider } = await setup();
  const delivery = await book({ vehicle, rider });
  const cancel = await t.api('PATCH', `/rides/${delivery.rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.data.advanceRefunded, false);
  assert.equal((await loadRide(delivery.rideId)).goodsAdvance.status, 'pending');
  assert.equal((await walletOf(rider.user._id)).balance, 5000);
});

test('admin cancels: advance is refunded to refundWallet once, and the rider is notified', async () => {
  const { vehicle, rider, driver } = await setup();
  const riderSocket = await t.connectSocket(rider.token);
  const delivery = await book({ vehicle, rider });
  await payWithWallet(rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, driver.driver._id);

  await t.dispatchService.cancelRideByAdmin(delivery.rideId);
  await t.dispatchService.cancelRideByAdmin(delivery.rideId); // repeat is harmless

  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.goodsAdvance.status, 'refunded');
  assert.equal(ride.goodsAdvance.refundDestination, 'refund_wallet');
  const wallet = await walletOf(rider.user._id);
  assert.equal(wallet.refundWallet, delivery.goodsAdvance.amount, 'refunded exactly once');

  const event = await waitFor(() => riderSocket.of('goodsAdvance:refunded')[0], { message: 'refund event' });
  assert.equal(event.payload.amount, delivery.goodsAdvance.amount);
  assert.equal(event.payload.destination, 'refund_wallet');
});

test('refund destination can be the spendable wallet balance', async () => {
  await t.setSettings('transport_ride', { goods_advance_refund_to: 'wallet' });
  const { vehicle, rider, driver } = await setup({ balance: 1000 });
  const delivery = await book({ vehicle, rider });
  await payWithWallet(rider, delivery.rideId);
  await t.acceptRide(delivery.rideId, driver.driver._id);
  const debited = (await walletOf(rider.user._id)).balance;

  await t.dispatchService.cancelRideByAdmin(delivery.rideId);
  const wallet = await walletOf(rider.user._id);
  assert.equal(round2(wallet.balance), round2(debited + delivery.goodsAdvance.amount));
  assert.equal(wallet.refundWallet, 0);
  await t.setSettings('transport_ride', { goods_advance_refund_to: 'refund_wallet' });
});

test('no driver found: the advance is refunded automatically', async () => {
  await t.setSettings('transport_ride', {
    trip_accept_reject_duration_for_driver: '1',
    maximum_time_for_find_drivers_for_regular_ride: '2',
  });
  const vehicle = await t.factories.vehicle({ commission: 10 });
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 1000); // no drivers exist for this vehicle type

  const delivery = await book({ vehicle, rider });
  assert.equal((await payWithWallet(rider, delivery.rideId)).status, 201);

  // The ride is cancelled first and the refund lands right after, so wait for the refund itself.
  await waitFor(async () => (await walletOf(rider.user._id)).refundWallet > 0, { timeout: 15000, message: 'automatic refund' });
  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.status, 'cancelled');
  assert.equal(ride.goodsAdvance.status, 'refunded');
  assert.equal(ride.goodsAdvance.refundDestination, 'refund_wallet');
  assert.equal((await walletOf(rider.user._id)).refundWallet, delivery.goodsAdvance.amount);
  assert.equal((await t.m.User.findById(rider.user._id).lean()).currentRideId, null);

  await t.setSettings('transport_ride', {
    trip_accept_reject_duration_for_driver: '15',
    maximum_time_for_find_drivers_for_regular_ride: '300',
  });
});

test('an unpaid booking expires after the payment window and can no longer be paid', async () => {
  const { vehicle, rider } = await setup();
  const delivery = await book({ vehicle, rider });
  // createdAt is immutable in Mongoose, so backdate through the raw collection.
  await t.m.Ride.collection.updateOne(
    { _id: new t.mongoose.Types.ObjectId(delivery.rideId) },
    { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } },
  );

  await t.dispatchService.expireStaleAdvanceRides();
  const ride = await loadRide(delivery.rideId);
  assert.equal(ride.status, 'cancelled');
  assert.equal((await t.m.User.findById(rider.user._id).lean()).currentRideId, null);

  const late = await payWithWallet(rider, delivery.rideId);
  assert.equal(late.status, 409);
  assert.equal((await walletOf(rider.user._id)).balance, 5000, 'not charged');

  // a booking inside the window is left alone
  const fresh = await book({ vehicle, rider });
  await t.dispatchService.expireStaleAdvanceRides();
  assert.equal((await loadRide(fresh.rideId)).status, 'searching');
});

test('advance percent is configurable and 0 disables it', async () => {
  await t.setSettings('transport_ride', { goods_advance_percent: '50' });
  const a = await setup();
  const half = await book(a);
  assert.equal(half.goodsAdvance.amount, round2(half.fare * 0.5));

  await t.setSettings('transport_ride', { goods_advance_percent: '0' });
  const b = await setup();
  const none = await book(b);
  assert.equal(none.goodsAdvance.status, 'none');
  await t.setSettings('transport_ride', { goods_advance_percent: '20' });
});

test('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in the env are used when the admin settings only hold demo keys', async () => {
  const { vehicle, rider } = await setup();
  const delivery = await book({ vehicle, rider });
  const orderRequest = () => t.api('POST', '/deliveries/advance/razorpay/order', { token: rider.token, body: { rideId: delivery.rideId } });

  const withoutEnv = await orderRequest();
  assert.match(withoutEnv.body.message, /demo placeholders/);

  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options);
    calls.push({ url: String(url), auth: options?.headers?.Authorization });
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'order_env_test', amount: body.amount, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_envkey';
  process.env.RAZORPAY_KEY_SECRET = 'envsecret';
  try {
    const withEnv = await orderRequest();
    assert.equal(withEnv.status, 201, withEnv.text);
    assert.equal(withEnv.body.data.keyId, 'rzp_test_envkey');
    assert.equal(withEnv.body.data.orderId, 'order_env_test');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].auth, `Basic ${Buffer.from('rzp_test_envkey:envsecret').toString('base64')}`);
  } finally {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    globalThis.fetch = realFetch;
  }
});
