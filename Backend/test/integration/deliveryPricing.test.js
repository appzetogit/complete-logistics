// Real-database tests: goods fares come from Pricing > Set Price, not the Vehicle Type page.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  await t.setSettings('transport_ride', { goods_advance_percent: '0' }); // keep advance out of these fare tests
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });

const PICKUP = [75.8577, 22.7196];
const DROP = [75.8777, 22.7396];
const FAR_AWAY = [77.2090, 28.6139]; // Delhi: outside every zone we create

const round2 = (n) => Math.round(n * 100) / 100;
const near = (actual, expected, tolerance = 0.06) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
const expectedTotal = ({ base, baseDistance, perKm, tax }, distanceKm) =>
  (base + Math.max(distanceKm - baseDistance, 0) * perKm) * (1 + tax / 100);
// distanceKm is rounded to 2 decimals before it is multiplied by the per-km rate, so allow for that
const nearTotal = (actual, params, distanceKm) =>
  near(actual, expectedTotal(params, distanceKm), (params.perKm * 0.01 + 0.1) * (1 + params.tax / 100));

const quote = async (rider, vehicle, pickup = PICKUP) => {
  const res = await t.api('POST', '/deliveries/quote', {
    token: rider.token,
    body: { vehicleTypeId: String(vehicle._id), pickup, drop: DROP },
  });
  assert.equal(res.status, 200, res.text);
  return res.body.data;
};

const createSetPrice = (vehicle, overrides = {}) =>
  t.api('POST', '/admin/types/set-prices', {
    token: admin.token,
    body: {
      vehicle_type: String(vehicle._id),
      transport_type: 'delivery',
      zone_id: null,
      payment_type: ['cash', 'online'],
      admin_commission_type_from_driver: 1,
      admin_commission_from_driver: 10,
      service_tax: 10,
      base_price: 200,
      base_distance: 2,
      price_per_distance: 50,
      ...overrides,
    },
  });

const book = async (rider, vehicle, pickup = PICKUP, extra = {}) => {
  const res = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: {
      pickup, drop: DROP, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
      parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
      ...extra,
    },
  });
  assert.equal(res.status, 201, res.text);
  return res.body.data;
};

// The factory vehicle: old prices saved on the vehicle type (base 100 for 1 km, 10/km, never used for goods any
// more) + a shared 'both' Set Price, and NO delivery Set Price (each test creates the one it needs).
const newVehicle = (overrides) => t.factories.vehicle({ commission: 20, deliverySetPrice: false, ...overrides });

// A goods booking without asserting success (for the "not priced" cases).
const tryBook = (rider, vehicle, pickup = PICKUP) => t.api('POST', '/deliveries', {
  token: rider.token,
  body: {
    pickup, drop: DROP, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
    parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' },
  },
});

test('no delivery Set Price: "price not set" and the booking is refused (the vehicle type prices are never used)', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();

  const q = await quote(rider, vehicle);
  assert.equal(q.pricingSource, 'none');
  assert.equal(q.setPriceId, null);
  assert.equal(q.priceNotSet, true);
  assert.equal(q.priced, false);
  assert.equal(q.total, 0, 'not the 100 + 10/km saved on the vehicle type');

  const refused = await tryBook(rider, vehicle);
  assert.equal(refused.status, 409, refused.text);
  assert.equal(refused.body.code, 'PRICE_NOT_SET');
  assert.equal(await t.m.Ride.countDocuments({ userId: rider.user._id }), 0, 'nothing booked');
});

test("a shared 'both'/taxi Set Price is never used for goods fares", async () => {
  const vehicle = await newVehicle(); // factory created a transport_type 'both' Set Price with commission 20
  const bothRows = await t.m.SetPrice.find({ vehicle_type: vehicle._id, transport_type: 'both' }).lean();
  assert.equal(bothRows.length, 1);
  await t.m.SetPrice.updateOne({ _id: bothRows[0]._id }, { $set: { base_price: 5000, price_per_distance: 999 } });

  const q = await quote(await t.factories.user(), vehicle);
  assert.equal(q.pricingSource, 'none');
  assert.equal(q.priceNotSet, true);
  assert.equal(q.total, 0, `goods fare must not use the taxi row (got ${q.total})`);
});

test('creating a delivery Set Price from the admin API switches the fare to it, for quote and booking', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();
  const before = await quote(rider, vehicle);

  const created = await createSetPrice(vehicle);
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.data.transport_type, 'delivery');

  const after = await quote(rider, vehicle);
  assert.equal(after.pricingSource, 'set_price');
  assert.equal(after.setPriceId, String(created.body.data._id));
  assert.notEqual(after.total, before.total);
  nearTotal(after.total, { base: 200, baseDistance: 2, perKm: 50, tax: 10 }, after.distanceKm);
  assert.equal(after.basePrice, 200);
  assert.equal(after.baseDistanceKm, 2);
  assert.equal(after.serviceTaxPercentage, 10);

  const delivery = await book(rider, vehicle);
  assert.equal(delivery.fare, after.total, 'the rider is charged exactly the quote');
});

test('editing the Set Price changes the next quote immediately (no stale price)', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();
  const created = await createSetPrice(vehicle);
  const first = await quote(rider, vehicle);

  const patched = await t.api('PATCH', `/admin/types/set-prices/${created.body.data._id}`, {
    token: admin.token, body: { base_price: 400, price_per_distance: 80, service_tax: 0 },
  });
  assert.equal(patched.status, 200, patched.text);

  const second = await quote(rider, vehicle);
  nearTotal(second.total, { base: 400, baseDistance: 2, perKm: 80, tax: 0 }, second.distanceKm);
  assert.ok(second.total > first.total);
});

test('zone rule beats All Zones; a pickup outside the zone uses All Zones', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();
  const location = await t.mongoose.model('TaxiServiceLocation').create({
    name: 'Indore', service_location_name: 'Indore', latitude: 22.72, longitude: 75.86,
    location: { type: 'Point', coordinates: [75.86, 22.72] },
  });
  const zone = await t.mongoose.model('TaxiZone').create({
    name: 'Indore Central',
    service_location_id: location._id,
    geometry: { type: 'Polygon', coordinates: [[[75.80, 22.65], [75.90, 22.65], [75.90, 22.75], [75.80, 22.75], [75.80, 22.65]]] },
  });

  const globalRule = await createSetPrice(vehicle, { base_price: 200 });
  const zoneRule = await createSetPrice(vehicle, { zone_id: String(zone._id), base_price: 300, base_distance: 1, price_per_distance: 60, service_tax: 0 });
  assert.equal(zoneRule.status, 200, zoneRule.text);

  const inZone = await quote(rider, vehicle, PICKUP);
  assert.equal(inZone.setPriceId, String(zoneRule.body.data._id));
  nearTotal(inZone.total, { base: 300, baseDistance: 1, perKm: 60, tax: 0 }, inZone.distanceKm);

  const outside = await quote(rider, vehicle, FAR_AWAY);
  assert.equal(outside.setPriceId, String(globalRule.body.data._id), 'outside the zone: All Zones rule');

  // the booking also carries the zone-level rule (commission / payment methods follow the same row)
  const delivery = await book(rider, vehicle, PICKUP);
  assert.equal(delivery.fare, inZone.total);
  assert.equal(delivery.pricingSnapshot.setPriceId, String(zoneRule.body.data._id));
});

test('a zone that has no rule of its own is not priced from another zone', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();
  const zoneB = await t.mongoose.model('TaxiZone').create({
    name: 'Other zone',
    geometry: { type: 'Polygon', coordinates: [[[77.0, 28.4], [77.4, 28.4], [77.4, 28.8], [77.0, 28.8], [77.0, 28.4]]] },
  });
  await createSetPrice(vehicle, { zone_id: String(zoneB._id), base_price: 999 });

  const q = await quote(rider, vehicle, PICKUP); // Indore, rule exists only for the Delhi zone
  assert.equal(q.pricingSource, 'none', "the Delhi zone's rate must not leak into Indore");
  assert.equal(q.priceNotSet, true);
  assert.equal((await tryBook(rider, vehicle, PICKUP)).body.code, 'PRICE_NOT_SET');
});

test('a delivery Set Price with no charges is "not priced", it does not silently use the vehicle values', async () => {
  const vehicle = await newVehicle();
  await createSetPrice(vehicle, { base_price: 0, price_per_distance: 0, service_tax: 0 });
  const rider = await t.factories.user();
  const q = await quote(rider, vehicle);
  assert.equal(q.pricingSource, 'set_price');
  assert.equal(q.priced, false);
  assert.equal(q.priceNotSet, true);
  assert.equal(q.total, 0);
  assert.equal((await tryBook(rider, vehicle)).body.code, 'PRICE_NOT_SET', 'and it cannot be booked');
});

test('delivery rows do not leak into taxi: a taxi ride on the same vehicle still uses the taxi/both row', async () => {
  const vehicle = await newVehicle();
  await createSetPrice(vehicle, { admin_commission_from_driver: 33, payment_type: ['cash'] });
  const bothRow = await t.m.SetPrice.findOne({ vehicle_type: vehicle._id, transport_type: 'both' }).lean();
  const rider = await t.factories.user();

  const ride = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: PICKUP, drop: DROP, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(ride.status, 201, ride.text);
  // the rider's booking response carries no commission terms; the stored ride does
  assert.equal(ride.body.data.ride.pricingSnapshot?.admin_commission_from_driver, undefined);
  const stored = await t.m.Ride.findById(ride.body.data.ride._id).lean();
  assert.equal(String(stored.pricingSnapshot.setPriceId), String(bothRow._id));
  assert.equal(stored.pricingSnapshot.admin_commission_from_driver, 20);

  // and the taxi Set Price listing the user app reads never contains the delivery row
  const taxiList = await t.api('GET', '/users/set-prices?scope=ride&transport_type=taxi&limit=100', {});
  assert.equal(taxiList.status, 200);
  const rows = taxiList.body.results || taxiList.body.data?.results || [];
  assert.ok(rows.every((row) => row.transport_type === 'taxi'), 'only taxi rows come back for transport_type=taxi');
  const deliveryList = await t.api('GET', '/users/set-prices?scope=ride&transport_type=delivery&limit=100', {});
  const deliveryRows = deliveryList.body.results || deliveryList.body.data?.results || [];
  assert.ok(deliveryRows.length >= 1 && deliveryRows.every((row) => row.transport_type === 'delivery'));
});

test('the goods booking takes commission from the delivery Set Price', async () => {
  const vehicle = await newVehicle(); // 'both' row says commission 20
  const created = await createSetPrice(vehicle, { admin_commission_from_driver: 25, payment_type: ['cash', 'online'] });
  const delivery = await book(await t.factories.user(), vehicle);
  assert.equal(delivery.pricingSnapshot.setPriceId, String(created.body.data._id));
  // the commission terms are stored on the ride, but the rider's booking response does not show them
  assert.equal(delivery.pricingSnapshot.admin_commission_from_driver, undefined);
  const stored = await t.m.Ride.findById(delivery.rideId).lean();
  assert.equal(stored.pricingSnapshot.admin_commission_from_driver, 25);
});

test('public vehicle catalog shows the All Zones Set Price rate and refreshes when it changes', async () => {
  const vehicle = await newVehicle();
  const find = async () => {
    const res = await t.api('GET', '/users/vehicle-types', {});
    assert.equal(res.status, 200, res.text);
    return res.body.data.results.find((item) => String(item._id) === String(vehicle._id));
  };

  const unpriced = await find();
  assert.equal(unpriced.delivery_pricing_source, 'none', 'no All Zones delivery Set Price yet');
  assert.equal(unpriced.delivery_distance_pricing.base_price, 0, 'the vehicle type price is not shown');
  assert.equal(unpriced.delivery_distance_pricing.enabled, false);

  const created = await createSetPrice(vehicle, { base_price: 250, base_distance: 3, price_per_distance: 40, service_tax: 12 });
  const overlaid = await find(); // catalog is cached 5 min: the create must have invalidated it
  assert.equal(overlaid.delivery_pricing_source, 'set_price');
  assert.equal(overlaid.delivery_distance_pricing.base_price, 250);
  assert.equal(overlaid.delivery_distance_pricing.distance_price, 40);
  assert.equal(overlaid.delivery_distance_pricing.free_distance, 3);
  assert.equal(overlaid.service_tax, 12);

  await t.api('PATCH', `/admin/types/set-prices/${created.body.data._id}`, { token: admin.token, body: { base_price: 260 } });
  assert.equal((await find()).delivery_distance_pricing.base_price, 260, 'update invalidates the catalog cache');

  await t.api('DELETE', `/admin/types/set-prices/${created.body.data._id}`, { token: admin.token });
  const afterDelete = await find();
  assert.equal(afterDelete.delivery_pricing_source, 'none', 'deleting the rule leaves the vehicle unpriced');
  assert.equal(afterDelete.delivery_distance_pricing.base_price, 0);
});

test('Vehicle Type page saves (without any price fields) leave the legacy values and options intact', async () => {
  const vehicle = await newVehicle();
  const before = (await t.api('GET', `/admin/types/vehicle-types/${vehicle._id}`, { token: admin.token })).body.data;
  const legacy = before.delivery_distance_pricing;
  assert.equal(legacy.base_price, 100);

  // what the trimmed Vehicle Type form now sends: no delivery_distance_pricing / service_tax / commissions
  const saved = await t.api('PATCH', `/admin/types/vehicle-types/${vehicle._id}`, {
    token: admin.token,
    body: { name: 'Renamed Truck', transport_type: 'both', icon_types: 'car', capacity: 0, load_capacity_ton: 5,
      load_height_options: [{ key: '6ft', label: '6 ft', height_ft: 6, price: 50 }] },
  });
  assert.equal(saved.status, 200, saved.text);

  const after = (await t.api('GET', `/admin/types/vehicle-types/${vehicle._id}`, { token: admin.token })).body.data;
  assert.equal(after.name, 'Renamed Truck');
  assert.equal(after.delivery_distance_pricing.base_price, 100, 'legacy values untouched');
  assert.equal(after.load_height_options[0].price, 50, 'load height options still saved from the vehicle page');
});

test('load height and extras (vehicle options) are still added on top of the Set Price fare', async () => {
  const vehicle = await newVehicle({
    load_height_options: [{ key: 'h6', label: '6 ft', height_ft: 6, price: 40 }],
    extra_options: [{ key: 'tarp', label: 'Tarpaulin', price: 25 }],
  });
  await createSetPrice(vehicle, { service_tax: 0 });
  const rider = await t.factories.user();

  const plain = await quote(rider, vehicle);
  const res = await t.api('POST', '/deliveries/quote', {
    token: rider.token,
    body: { vehicleTypeId: String(vehicle._id), pickup: PICKUP, drop: DROP, loadHeightKey: 'h6', extraKeys: ['tarp'] },
  });
  assert.equal(res.status, 200, res.text);
  near(res.body.data.total - plain.total, 65, 0.02);
  assert.equal(res.body.data.pricingSource, 'set_price');
});

test('MIGRATION: copying the vehicle type prices into a Delivery Set Price makes the vehicle bookable at those prices', async () => {
  const { planDeliveryPricingMigration } = await import('../../src/modules/taxi/services/deliveryPricingMigration.js');
  const vehicle = await newVehicle({ service_tax: 5, commission: 15 });
  const rider = await t.factories.user();

  const beforeQuote = await quote(rider, vehicle);
  assert.equal(beforeQuote.pricingSource, 'none', 'not bookable before the migration');
  assert.equal((await tryBook(rider, vehicle)).body.code, 'PRICE_NOT_SET');

  const vehicles = await t.m.Vehicle.find({ _id: vehicle._id }).lean();
  const setPrices = await t.m.SetPrice.find({ vehicle_type: vehicle._id }).lean();
  const plan = planDeliveryPricingMigration({ vehicles, setPrices });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, 'create');
  await t.m.SetPrice.create(plan[0].row);

  const afterQuote = await quote(rider, vehicle);
  assert.equal(afterQuote.pricingSource, 'set_price', 'now served from Set Price');
  nearTotal(afterQuote.total, { base: 100, baseDistance: 1, perKm: 10, tax: 5 }, afterQuote.distanceKm);

  const afterBooking = await book(rider, vehicle);
  assert.equal(afterBooking.fare, afterQuote.total);
  const stored = await t.m.Ride.findById(afterBooking.rideId).lean();
  assert.equal(stored.pricingSnapshot.admin_commission_from_driver, 15, "commission copied from the vehicle's Set Price");
  assert.deepEqual(stored.pricingSnapshot.allowed_payment_methods, ['cash', 'online']);

  // running it again finds nothing left to do
  const again = planDeliveryPricingMigration({
    vehicles,
    setPrices: await t.m.SetPrice.find({ vehicle_type: vehicle._id }).lean(),
  });
  assert.equal(again[0].action, 'skip');
});

test('lifecycle: commission at completion follows the Delivery Set Price, not the shared row', async () => {
  const vehicle = await newVehicle(); // shared 'both' row commission = 20
  const rider = await t.factories.user();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const created = await createSetPrice(vehicle, { admin_commission_from_driver: 15 });
  assert.ok([200, 201].includes(created.status), created.text);

  const delivery = await book(rider, vehicle);
  const fare = delivery.fare;

  await t.acceptRide(delivery.rideId, driver.driver._id);
  for (const status of ['arriving', 'goods_loaded', 'started', 'arrived', 'goods_delivered', 'completed']) {
    const res = await t.patchRideStatus(delivery.rideId, {
      token: driver.token,
      body: { status, proofImageUrl: 'https://example.com/p.jpg' },
    });
    assert.equal(res.status, 200, `${status}: ${res.text}`);
  }

  const rows = await t.m.WalletTransaction.find({ rideId: delivery.rideId }).lean();
  const commissionRow = rows.find((row) => row.type === 'commission_deduction');
  assert.ok(commissionRow, `no commission row: ${JSON.stringify(rows.map((r) => r.type))}`);
  near(Math.abs(commissionRow.amount), round2(fare * 0.15), 0.02);
});

test('deleting the Delivery Set Price makes the vehicle unpriced again (no fallback to the vehicle type)', async () => {
  const vehicle = await newVehicle();
  const rider = await t.factories.user();
  const legacy = await quote(rider, vehicle);
  assert.equal(legacy.pricingSource, 'none');

  const created = await createSetPrice(vehicle);
  const priced = await quote(rider, vehicle);
  assert.equal(priced.pricingSource, 'set_price');

  const removed = await t.api('DELETE', `/admin/types/set-prices/${created.body.data._id}`, { token: admin.token });
  assert.equal(removed.status, 200, removed.text);

  const after = await quote(rider, vehicle);
  assert.equal(after.pricingSource, 'none');
  assert.equal(after.total, 0);
  assert.equal((await tryBook(rider, vehicle)).body.code, 'PRICE_NOT_SET');
});
