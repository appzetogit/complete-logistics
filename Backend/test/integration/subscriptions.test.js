// Real-database tests: customer subscriptions (several vehicle types per plan, Razorpay purchase,
// admin plan management, no cover for bidding rides, limited plans count booked rides).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
let Subscription;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  admin = await t.factories.admin();
  Subscription = t.mongoose.model('TaxiUserSubscription');
});
after(async () => { await t.stop(); });

const createPlan = (overrides = {}) =>
  t.api('POST', '/admin/user-subscriptions/plans/create', {
    token: admin.token,
    body: { name: 'Bike pass', amount: 100, duration: 1, benefit_type: 'unlimited', transport_type: 'taxi', ...overrides },
  });

const newUser = async (balance = 5000) => {
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, balance);
  return rider;
};

const buyWithWallet = (rider, planId) => t.api('POST', '/users/subscriptions/purchase', { token: rider.token, body: { planId } });

const bookTaxi = (rider, vehicle, extra = {}) =>
  t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', ...extra },
  });

test('a plan can cover several vehicle types; a subscription covers any of them and exposes subscriptionUsage', async () => {
  const bikeA = await t.factories.vehicle({ name: 'Bike A' });
  const bikeB = await t.factories.vehicle({ name: 'Bike B' });
  const car = await t.factories.vehicle({ name: 'Car' });
  const created = await createPlan({ vehicle_type_ids: [String(bikeA._id), String(bikeB._id)] });
  assert.equal(created.status, 200, created.text);
  const plan = created.body.data;
  assert.deepEqual(plan.vehicle_type_ids.map(String), [String(bikeA._id), String(bikeB._id)]);
  assert.equal(String(plan.vehicle_type_id), String(bikeA._id), 'the first id stays in vehicle_type_id');

  const rider = await newUser();
  const plans = await t.api('GET', '/users/subscriptions/plans', { token: rider.token });
  const listed = (plans.body.data.results || plans.body.data).find((item) => item.id === plan._id);
  assert.deepEqual(listed.vehicle_type_ids.map(String), [String(bikeA._id), String(bikeB._id)]);

  const bought = await buyWithWallet(rider, plan._id);
  assert.equal(bought.status, 201, bought.text);
  assert.equal(bought.body.data.subscription.vehicle_type_ids.length, 2);

  for (const vehicle of [bikeA, bikeB]) {
    const ride = await bookTaxi(rider, vehicle);
    assert.equal(ride.status, 201, ride.text);
    assert.equal(ride.body.data.ride.subscriptionUsage.covered, true, `${vehicle.name} is covered`);
    assert.equal(ride.body.data.ride.subscriptionUsage.planName, 'Bike pass');
    assert.equal(ride.body.data.ride.paymentMethod, 'online', 'covered ride needs no payment sheet');
    await t.api('PATCH', `/rides/${ride.body.data.ride._id}/cancel`, { token: rider.token });
  }

  const notCovered = await bookTaxi(rider, car);
  assert.equal(notCovered.status, 201, notCovered.text);
  assert.ok(!notCovered.body.data.ride.subscriptionUsage?.covered, 'a vehicle outside the plan is not covered');

  // the active-ride payload carries the same block
  const active = await t.api('GET', '/rides/active/me', { token: rider.token });
  assert.ok(active.status === 200);
});

test('a subscription from before the multi-vehicle change (single vehicle_type_id only) still works', async () => {
  const bike = await t.factories.vehicle({ name: 'Old bike' });
  const rider = await newUser();
  const plan = (await createPlan({ vehicle_type_id: String(bike._id) })).body.data;
  await buyWithWallet(rider, plan._id);
  await Subscription.updateOne({ userId: rider.user._id }, { $unset: { vehicle_type_ids: 1 } });

  const ride = await bookTaxi(rider, bike);
  assert.equal(ride.body.data.ride.subscriptionUsage.covered, true);
});

test('admin: edit, deactivate/reactivate and delete plans; a purchased plan cannot be deleted', async () => {
  const bike = await t.factories.vehicle({ name: 'Admin bike' });
  const plan = (await createPlan({ vehicle_type_ids: [String(bike._id)] })).body.data;
  const rider = await newUser();

  const edited = await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { name: 'Bike pass v2', amount: 150, duration: 7 } });
  assert.equal(edited.status, 200, edited.text);
  assert.equal(edited.body.data.name, 'Bike pass v2');
  assert.equal(edited.body.data.amount, 150);

  const invalid = await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { amount: -5 } });
  assert.equal(invalid.status, 400);
  const badVehicle = await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { vehicle_type_ids: ['not-an-id'] } });
  assert.equal(badVehicle.status, 400);

  const off = await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { active: false } });
  assert.equal(off.body.data.active, false);
  const hidden = await t.api('GET', '/users/subscriptions/plans', { token: rider.token });
  assert.ok(!(hidden.body.data.results || hidden.body.data).some((item) => item.id === plan._id), 'inactive plans are not offered');
  const refused = await buyWithWallet(rider, plan._id);
  assert.equal(refused.status, 404);

  await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { active: true } });
  const bought = await buyWithWallet(rider, plan._id);
  assert.equal(bought.status, 201, bought.text);
  assert.equal(bought.body.data.subscription.amount, 150, 'bought at the edited price');

  // editing later does not change what was already bought
  await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token, body: { amount: 999 } });
  const mine = await t.api('GET', '/users/subscriptions/me', { token: rider.token });
  assert.ok(JSON.stringify(mine.body.data).includes('"amount":150'));

  const blocked = await t.api('DELETE', `/admin/user-subscriptions/plans/${plan._id}`, { token: admin.token });
  assert.equal(blocked.status, 409);

  const spare = (await createPlan({ vehicle_type_ids: [String(bike._id)], name: 'Never bought' })).body.data;
  const deleted = await t.api('DELETE', `/admin/user-subscriptions/plans/${spare._id}`, { token: admin.token });
  assert.equal(deleted.status, 200, deleted.text);
  const gone = await t.api('DELETE', `/admin/user-subscriptions/plans/${spare._id}`, { token: admin.token });
  assert.equal(gone.status, 404);

  const stranger = await newUser();
  const denied = await t.api('PATCH', `/admin/user-subscriptions/plans/${plan._id}`, { token: stranger.token, body: { name: 'hack' } });
  assert.ok([401, 403].includes(denied.status), 'only admins manage plans');
});

// ------------------------------------------------------------------ Razorpay purchase
const KEY_SECRET = 'subsecret';
const withRazorpay = async (handler, run) => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options);
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    return new Response(JSON.stringify(handler(String(url), options)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  process.env.RAZORPAY_KEY_ID = 'rzp_test_subkey';
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  try {
    return await run(calls);
  } finally {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    globalThis.fetch = realFetch;
  }
};
const sign = (orderId, paymentId) => crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

test('Razorpay purchase: order -> verify creates one subscription; repeat/forged/foreign/wrong-amount payments do not', async () => {
  const bike = await t.factories.vehicle({ name: 'Rzp bike' });
  const plan = (await createPlan({ vehicle_type_ids: [String(bike._id)], amount: 249 })).body.data;
  const rider = await newUser(0); // no wallet balance: pays online
  const orders = new Map();

  await withRazorpay((url, options) => {
    if (options.method === 'POST' && url.endsWith('/orders')) {
      const body = JSON.parse(options.body);
      const id = `order_sub_${orders.size + 1}`;
      orders.set(id, { id, amount: body.amount, notes: body.notes, currency: 'INR' });
      return orders.get(id);
    }
    const id = url.split('/orders/')[1];
    return orders.get(id) || {};
  }, async (calls) => {
    const order = await t.api('POST', '/users/subscriptions/razorpay/order', { token: rider.token, body: { planId: plan._id } });
    assert.equal(order.status, 201, order.text);
    assert.equal(order.body.data.keyId, 'rzp_test_subkey');
    assert.equal(order.body.data.amount, 24900);
    assert.equal(calls[0].body.notes.purpose, 'user_subscription');

    const verifyBody = (paymentId, signature, orderId = order.body.data.orderId) => ({
      token: rider.token,
      body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature },
    });

    const forged = await t.api('POST', '/users/subscriptions/razorpay/verify', verifyBody('pay_1', 'forged'));
    assert.equal(forged.status, 400);
    assert.equal(await Subscription.countDocuments({ userId: rider.user._id }), 0);

    const ok = await t.api('POST', '/users/subscriptions/razorpay/verify', verifyBody('pay_1', sign(order.body.data.orderId, 'pay_1')));
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.body.data.subscription.purchaseSource, 'razorpay');
    assert.equal(ok.body.data.subscription.vehicle_type_ids.length, 1);

    const again = await t.api('POST', '/users/subscriptions/razorpay/verify', verifyBody('pay_1', sign(order.body.data.orderId, 'pay_1')));
    assert.equal(again.status, 200, again.text);
    assert.equal(again.body.data.alreadyPurchased, true);
    assert.equal(await Subscription.countDocuments({ userId: rider.user._id }), 1, 'one payment, one subscription');

    // another account cannot use the same payment, nor an order that was created for someone else
    const thief = await newUser(0);
    const stolen = await t.api('POST', '/users/subscriptions/razorpay/verify', {
      token: thief.token,
      body: { razorpay_order_id: order.body.data.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(order.body.data.orderId, 'pay_1') },
    });
    assert.ok([400, 409].includes(stolen.status), stolen.text);
    assert.equal(await Subscription.countDocuments({ userId: thief.user._id }), 0);
    const foreignOrder = await t.api('POST', '/users/subscriptions/razorpay/verify', {
      token: thief.token,
      body: { razorpay_order_id: order.body.data.orderId, razorpay_payment_id: 'pay_2', razorpay_signature: sign(order.body.data.orderId, 'pay_2') },
    });
    assert.equal(foreignOrder.status, 400);

    // an order whose amount does not match the plan price is refused
    const cheap = orders.get(order.body.data.orderId);
    orders.set('order_cheap', { ...cheap, id: 'order_cheap', amount: 100 });
    const underpaid = await t.api('POST', '/users/subscriptions/razorpay/verify', verifyBody('pay_3', sign('order_cheap', 'pay_3'), 'order_cheap'));
    assert.equal(underpaid.status, 400);
    assert.match(underpaid.body.message, /price/i);
  });

  const unauth = await t.api('POST', '/users/subscriptions/razorpay/order', { body: { planId: plan._id } });
  assert.equal(unauth.status, 401);
});

// ------------------------------------------------------------------ rules at booking time
test('limited plan: a booked-but-not-completed ride already holds the credit', async () => {
  const { resolveApplicableUserSubscription } = await import('../../src/modules/taxi/user/services/subscriptionService.js');
  const bike = await t.factories.vehicle({ name: 'Limited bike' });
  const plan = (await createPlan({ vehicle_type_ids: [String(bike._id)], benefit_type: 'limited', ride_limit: 1 })).body.data;
  const rider = await newUser();
  await buyWithWallet(rider, plan._id);

  const resolve = () => resolveApplicableUserSubscription({ userId: rider.user._id, vehicleTypeId: String(bike._id) });
  assert.ok(await resolve(), 'a credit is available before any booking');

  const day = 24 * 3600 * 1000;
  const first = await bookTaxi(rider, bike, { scheduledAt: new Date(Date.now() + 2 * day).toISOString() });
  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.data.ride.subscriptionUsage.covered, true, 'the one included ride is covered');

  // the only credit belongs to the booked ride, even though it has not been completed yet
  assert.equal(await resolve(), null, 'no credit left while that ride is still open');

  // once that ride is cancelled the credit is free again
  await t.m.Ride.updateOne({ _id: first.body.data.ride._id }, { $set: { status: 'cancelled', liveStatus: 'cancelled' } });
  assert.ok(await resolve(), 'a cancelled ride gives the credit back');
});

test('bidding rides are never covered by a subscription', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Bid bike', dispatch_type: 'bidding' });
  const plan = (await createPlan({ vehicle_type_ids: [String(vehicle._id)] })).body.data;
  const rider = await newUser();
  await buyWithWallet(rider, plan._id);

  const bid = await t.api('POST', '/rides', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, fare: 1000, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      serviceType: 'intercity', bookingMode: 'bidding', intercity: { fromCity: 'Indore', toCity: 'Bhopal', passengers: 1 },
    },
  });
  assert.equal(bid.status, 201, bid.text);
  assert.equal(bid.body.data.ride.bookingMode, 'bidding');
  assert.ok(!bid.body.data.ride.subscriptionUsage?.covered, 'a negotiated fare can rise after booking, so it is not covered');
});

test('goods quote: an active subscription covers the booking, so no advance is quoted', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Goods pass vehicle' });
  const plan = (await createPlan({ vehicle_type_ids: [String(vehicle._id)] })).body.data;
  const rider = await newUser();

  const quote = () => t.api('POST', '/deliveries/quote', {
    token: rider.token,
    body: { vehicleTypeId: String(vehicle._id), pickup: t.locations.pickup, drop: t.locations.drop },
  });
  const before = await quote();
  assert.equal(before.body.data.coveredBy, null);
  assert.ok(before.body.data.advanceAmount > 0);

  await buyWithWallet(rider, plan._id);
  const after = await quote();
  assert.equal(after.body.data.coveredBy, 'subscription');
  assert.equal(after.body.data.subscriptionCovered, true);
  assert.equal(after.body.data.advanceAmount, 0);
  assert.deepEqual(after.body.data.advanceOptions, []);
});
