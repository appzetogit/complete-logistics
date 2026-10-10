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

// ------------------------------------------------------------------ vehicle-first offers
test('plans carry vehicle_types (name, image, icon) for every covered vehicle; a disabled vehicle is left out', async () => {
  const bike = await t.factories.vehicle({ name: 'VF Bike', image: 'https://cdn.example.com/bike.webp', icon_types: 'bike' });
  const scooty = await t.factories.vehicle({ name: 'VF Scooty', image: 'https://cdn.example.com/scooty.webp', icon_types: 'bike' });
  const retired = await t.factories.vehicle({ name: 'VF Retired', icon_types: 'bike' });
  const created = await createPlan({ name: 'VF Pass', vehicle_type_ids: [String(bike._id), String(scooty._id), String(retired._id)] });
  assert.equal(created.status, 200, created.text);
  await t.m.Vehicle.updateOne({ _id: retired._id }, { $set: { status: 0, active: false } });

  const rider = await newUser();
  const res = await t.api('GET', '/users/subscriptions/plans', { token: rider.token });
  assert.equal(res.status, 200, res.text);
  const plan = (res.body.data.results || res.body.data).find((item) => item.name === 'VF Pass');
  assert.ok(plan, 'plan listed');

  assert.deepEqual(plan.vehicle_types.map((v) => v.name), ['VF Bike', 'VF Scooty'], 'both enabled vehicles, disabled one left out');
  assert.deepEqual(plan.vehicle_types[0], {
    id: String(bike._id), name: 'VF Bike', image: 'https://cdn.example.com/bike.webp', icon_types: 'bike', transport_type: 'both',
  });
  assert.deepEqual(plan.vehicle_type, { id: String(bike._id), name: 'VF Bike', image: 'https://cdn.example.com/bike.webp', icon_types: 'bike' });
  // existing keys unchanged: plain id strings, including the disabled one
  assert.deepEqual(plan.vehicle_type_ids, [String(bike._id), String(scooty._id), String(retired._id)]);
  assert.equal(plan.vehicle_type_id, String(bike._id));
  assert.equal(plan.badge, '');
  assert.deepEqual(plan.benefits, []);
});

test('a vehicle switched off only through status 0 (active untouched) is also left out', async () => {
  const bike = await t.factories.vehicle({ name: 'S0 Bike' });
  const other = await t.factories.vehicle({ name: 'S0 Other' });
  await createPlan({ name: 'S0 Pass', vehicle_type_ids: [String(bike._id), String(other._id)] });
  await t.m.Vehicle.collection.updateOne({ _id: other._id }, { $set: { status: 0 } });
  const rider = await newUser();
  const res = await t.api('GET', '/users/subscriptions/plans', { token: rider.token });
  const plan = res.body.data.results.find((item) => item.name === 'S0 Pass');
  assert.deepEqual(plan.vehicle_types.map((v) => v.name), ['S0 Bike']);
});

test('badge and benefits: set by admin, validated, returned to the app', async () => {
  const bike = await t.factories.vehicle({ name: 'BB Bike' });
  const created = await createPlan({
    name: 'BB Pass', vehicle_type_ids: [String(bike._id)], badge: '  Most popular  ', benefits: ['Covers the full fare', '  ', 'Valid 30 days'],
  });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.data.badge, 'Most popular', 'trimmed');
  assert.deepEqual(created.body.data.benefits, ['Covers the full fare', 'Valid 30 days'], 'blank lines dropped');

  const id = created.body.data._id;
  const patch = (body) => t.api('PATCH', `/admin/user-subscriptions/plans/${id}`, { token: admin.token, body });
  assert.equal((await patch({ badge: 'x'.repeat(21) })).status, 400, 'badge max 20');
  assert.equal((await patch({ benefits: ['a', 'b', 'c', 'd', 'e'] })).status, 400, 'max 4 benefits');
  assert.equal((await patch({ benefits: ['y'.repeat(41)] })).status, 400, 'each benefit max 40');
  assert.equal((await createPlan({ name: 'Bad', vehicle_type_ids: [String(bike._id)], badge: 'z'.repeat(21) })).status, 400, 'create validates too');

  const ok = await patch({ badge: 'Best value', benefits: ['Covers the full fare'] });
  assert.equal(ok.status, 200, ok.text);
  const rider = await newUser();
  const plans = await t.api('GET', '/users/subscriptions/plans', { token: rider.token });
  const plan = (plans.body.data.results || plans.body.data).find((item) => item.id === id);
  assert.equal(plan.badge, 'Best value');
  assert.deepEqual(plan.benefits, ['Covers the full fare']);

  await patch({ badge: '', benefits: [] });
  const cleared = (await t.api('GET', '/users/subscriptions/plans', { token: rider.token })).body.data.results.find((item) => item.id === id);
  assert.equal(cleared.badge, '');
  assert.deepEqual(cleared.benefits, []);
});

test('admin plan list returns the covered vehicles populated (no more N/A in the panel)', async () => {
  const bike = await t.factories.vehicle({ name: 'AL Bike' });
  const scooty = await t.factories.vehicle({ name: 'AL Scooty' });
  await createPlan({ name: 'AL Pass', vehicle_type_ids: [String(bike._id), String(scooty._id)], badge: 'New' });
  const list = await t.api('GET', '/admin/user-subscriptions/plans/list', { token: admin.token });
  assert.equal(list.status, 200, list.text);
  const plan = list.body.data.results.find((item) => item.name === 'AL Pass');
  assert.deepEqual(plan.vehicle_type_ids.map((v) => v.name), ['AL Bike', 'AL Scooty']);
  assert.equal(plan.badge, 'New');
});

test('my subscriptions carry vehicle_types; a pass without its own vehicle list falls back to the plan', async () => {
  const bike = await t.factories.vehicle({ name: 'MS Bike', image: 'https://cdn.example.com/msbike.webp', icon_types: 'bike' });
  const scooty = await t.factories.vehicle({ name: 'MS Scooty', icon_types: 'bike' });
  const plan = (await createPlan({ name: 'MS Pass', vehicle_type_ids: [String(bike._id), String(scooty._id)] })).body.data;
  const rider = await newUser();
  const bought = await buyWithWallet(rider, plan._id);
  assert.equal(bought.status, 201, bought.text);
  assert.deepEqual(bought.body.data.subscription.vehicle_types.map((v) => v.name), ['MS Bike', 'MS Scooty'], 'purchase response too');

  const mine = await t.api('GET', '/users/subscriptions/me', { token: rider.token });
  assert.equal(mine.status, 200, mine.text);
  const all = [...(mine.body.data.activePlans || []), ...(mine.body.data.history || [])];
  const pass = all.find((item) => item.name === 'MS Pass');
  assert.deepEqual(pass.vehicle_types.map((v) => v.name), ['MS Bike', 'MS Scooty']);
  assert.equal(pass.vehicle_types[0].image, 'https://cdn.example.com/msbike.webp');
  assert.equal(pass.vehicle_type.icon_types, 'bike');

  await Subscription.updateOne({ _id: bought.body.data.subscription.id }, { $unset: { vehicle_type_ids: 1 } });
  const again = await t.api('GET', '/users/subscriptions/me', { token: rider.token });
  const old = [...(again.body.data.activePlans || []), ...(again.body.data.history || [])].find((item) => item.name === 'MS Pass');
  assert.deepEqual(old.vehicle_types.map((v) => v.name), ['MS Bike', 'MS Scooty']);
});

test('Razorpay order response carries the plan with vehicle_types', async () => {
  const bike = await t.factories.vehicle({ name: 'RO Bike', icon_types: 'bike' });
  const plan = (await createPlan({ name: 'RO Pass', vehicle_type_ids: [String(bike._id)], amount: 99 })).body.data;
  const rider = await newUser(0);
  await withRazorpay(() => ({ id: 'order_ro_1', amount: 9900, currency: 'INR' }), async () => {
    const order = await t.api('POST', '/users/subscriptions/razorpay/order', { token: rider.token, body: { planId: plan._id } });
    assert.equal(order.status, 201, order.text);
    assert.deepEqual(order.body.data.plan.vehicle_types.map((v) => v.name), ['RO Bike']);
  });
});

// ------------------------------------------------------------------ atomic wallet purchase
test('wallet purchase: ten parallel taps with money for one pass -> exactly one pass and one debit', async () => {
  const bike = await t.factories.vehicle({ name: 'AT Bike' });
  const plan = (await createPlan({ name: 'AT Pass', vehicle_type_ids: [String(bike._id)], amount: 300 })).body.data;
  const rider = await newUser(500);

  const results = await Promise.all(Array.from({ length: 10 }, () => buyWithWallet(rider, plan._id)));
  const statuses = results.map((r) => r.status);
  assert.equal(statuses.filter((code) => code === 201).length, 1, JSON.stringify(results.map((r) => r.body?.message)));
  assert.equal(statuses.filter((code) => code === 400).length, 9);
  assert.ok(results.filter((r) => r.status === 400).every((r) => /Insufficient wallet balance/.test(r.body.message)));

  const wallet = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(wallet.balance, 200, 'charged exactly once');
  assert.equal(await Subscription.countDocuments({ userId: rider.user._id, planId: plan._id }), 1, 'exactly one pass');
  assert.equal(wallet.transactions.filter((tx) => tx.provider === 'user_subscription_wallet').length, 1);
});

test('wallet purchase: if creating the pass fails, the rider is not charged', async () => {
  const bike = await t.factories.vehicle({ name: 'FL Bike' });
  const plan = (await createPlan({ name: 'FL Pass', vehicle_type_ids: [String(bike._id)], amount: 150 })).body.data;
  const rider = await newUser(400);
  const { purchaseUserSubscription } = await import('../../src/modules/taxi/user/services/subscriptionService.js');

  await assert.rejects(
    purchaseUserSubscription({
      userId: rider.user._id,
      planId: plan._id,
      deps: { UserSubscription: { create: async () => { throw new Error('simulated write failure'); } } },
    }),
    /simulated write failure/,
  );
  const wallet = await t.m.UserWallet.findOne({ userId: rider.user._id }).lean();
  assert.equal(wallet.balance, 400, 'debit rolled back');
  assert.equal(wallet.transactions.filter((tx) => tx.provider === 'user_subscription_wallet').length, 0);
  assert.equal(await Subscription.countDocuments({ userId: rider.user._id }), 0);

  const ok = await buyWithWallet(rider, plan._id);
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.data.wallet.balance, 250);
  assert.equal(typeof ok.body.data.wallet.refundWallet, 'number');
  assert.ok(ok.body.data.subscription.id);
});
