// node --test src/modules/taxi/services/deliveryPricing.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret-for-delivery-pricing';

const {
  buildPricingFromSetPrice,
  buildPricingFromVehicle,
  findDeliverySetPrice,
  overlayCatalogWithDeliverySetPrices,
  resolveDeliveryPricing,
} = await import('./deliveryPricingService.js');
const { planDeliveryPricingMigration } = await import('./deliveryPricingMigration.js');

// ---- a tiny stand-in for the SetPrice model --------------------------------

const matchesValue = (actual, expected) => {
  if (expected && typeof expected === 'object' && '$ne' in expected) return String(actual) !== String(expected.$ne);
  if (expected && typeof expected === 'object' && '$in' in expected) return expected.$in.map(String).includes(String(actual));
  if (expected === null) return actual === null || actual === undefined;
  return String(actual) === String(expected);
};

const makeSetPriceModel = (rows) => ({
  seen: [],
  find(filter) {
    const matched = rows.filter((row) => Object.entries(filter).every(([key, value]) => matchesValue(row[key], value)));
    const chain = { sort: () => chain, lean: async () => matched };
    return chain;
  },
  findOne(filter) {
    this.seen.push(filter);
    const matched = rows.find((row) => Object.entries(filter).every(([key, value]) => matchesValue(row[key], value))) || null;
    const chain = { sort: () => chain, lean: async () => matched };
    return chain;
  },
});

const ZONE = { _id: 'zoneA', service_location_id: 'locA' };
const VEHICLE = { _id: 'v1', transport_type: 'delivery', service_tax: 5, delivery_distance_pricing: { enabled: true, base_price: 45, free_distance: 2, distance_price: 12 } };

const row = (overrides = {}) => ({
  _id: `r${Math.random()}`,
  vehicle_type: 'v1',
  transport_type: 'delivery',
  pricing_scope: 'ride',
  active: 1,
  status: 'active',
  zone_id: null,
  service_location_id: null,
  base_price: 100,
  base_distance: 3,
  price_per_distance: 20,
  service_tax: 18,
  ...overrides,
});

// ---- Set Price -> fare inputs ------------------------------------------------

test('Set Price rows map to the distance-charge block; an all-zero rule is "not priced"', () => {
  assert.deepEqual(buildPricingFromSetPrice(row()), {
    enabled: true, base_price: 100, base_distance: 3, free_distance: 3, distance_price: 20,
  });
  assert.equal(buildPricingFromSetPrice(row({ base_price: 0, price_per_distance: 0 })).enabled, false);
  assert.equal(buildPricingFromSetPrice(row({ base_price: -5, price_per_distance: 'abc' })).enabled, false);
});

test('legacy vehicle values map the same way (free_distance is the base distance)', () => {
  assert.deepEqual(buildPricingFromVehicle(VEHICLE), {
    enabled: true, base_price: 45, base_distance: 2, free_distance: 2, distance_price: 12,
  });
  assert.equal(buildPricingFromVehicle(null).enabled, false);
  assert.equal(buildPricingFromVehicle({ delivery_distance_pricing: { enabled: false } }).enabled, false);
});

// ---- which row wins -------------------------------------------------------------

test('most specific rule wins: pickup zone, then service location, then All Zones', async () => {
  const zoneRule = row({ _id: 'zone', zone_id: 'zoneA', service_location_id: 'locA', base_price: 1 });
  const locationRule = row({ _id: 'loc', service_location_id: 'locA', base_price: 2 });
  const globalRule = row({ _id: 'global', base_price: 3 });

  const all = makeSetPriceModel([globalRule, locationRule, zoneRule]);
  assert.equal((await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: ZONE, deps: { SetPrice: all } }))._id, 'zone');

  const noZone = makeSetPriceModel([globalRule, locationRule]);
  assert.equal((await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: ZONE, deps: { SetPrice: noZone } }))._id, 'loc');

  const onlyGlobal = makeSetPriceModel([globalRule]);
  assert.equal((await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: ZONE, deps: { SetPrice: onlyGlobal } }))._id, 'global');
  assert.equal((await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: null, deps: { SetPrice: onlyGlobal } }))._id, 'global', 'pickup outside every zone uses All Zones');
});

test("another zone's rule is never used (the All Zones fallback requires no zone)", async () => {
  const otherZone = makeSetPriceModel([row({ zone_id: 'zoneB', service_location_id: 'locB' })]);
  assert.equal(await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: ZONE, deps: { SetPrice: otherZone } }), null);
  assert.equal(await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: null, deps: { SetPrice: otherZone } }), null);
});

test("only DELIVERY rules count: 'both' and 'taxi' rows, other vehicles, inactive and package rows are ignored", async () => {
  const noise = makeSetPriceModel([
    row({ transport_type: 'both' }),
    row({ transport_type: 'taxi' }),
    row({ vehicle_type: 'other-vehicle' }),
    row({ active: 0 }),
    row({ status: 'inactive' }),
    row({ pricing_scope: 'package' }),
  ]);
  assert.equal(await findDeliverySetPrice({ vehicleTypeId: 'v1', zone: ZONE, deps: { SetPrice: noise } }), null);
  assert.equal(await findDeliverySetPrice({ vehicleTypeId: null, zone: ZONE, deps: { SetPrice: noise } }), null);
});

// ---- the resolver the quote and the booking share --------------------------------------

test('Set Price wins over the vehicle type, and brings its own service tax', async () => {
  const SetPrice = makeSetPriceModel([row({ _id: 'rule1' })]);
  const result = await resolveDeliveryPricing({
    vehicle: VEHICLE,
    pickupCoords: [75.85, 22.71],
    deps: { SetPrice, findZone: async () => ZONE },
  });

  assert.equal(result.source, 'set_price');
  assert.equal(result.setPriceId, 'rule1');
  assert.equal(result.pricing.base_price, 100, 'not the vehicle 45');
  assert.equal(result.pricing.distance_price, 20, 'not the vehicle 12');
  assert.equal(result.serviceTaxPercentage, 18, 'not the vehicle 5');
  assert.deepEqual(result.zone, { id: 'zoneA', serviceLocationId: 'locA' });
});

test('no delivery Set Price yet: falls back to the vehicle type values', async () => {
  const result = await resolveDeliveryPricing({
    vehicle: VEHICLE,
    pickupCoords: [75.85, 22.71],
    deps: { SetPrice: makeSetPriceModel([row({ transport_type: 'both' })]), findZone: async () => ZONE },
  });

  assert.equal(result.source, 'vehicle');
  assert.equal(result.setPriceId, null);
  assert.equal(result.pricing.base_price, 45);
  assert.equal(result.serviceTaxPercentage, 5);
});

test('a Set Price that exists but has no charges means "not priced", not a silent fallback', async () => {
  const result = await resolveDeliveryPricing({
    vehicle: VEHICLE,
    pickupCoords: [75.85, 22.71],
    deps: { SetPrice: makeSetPriceModel([row({ base_price: 0, price_per_distance: 0 })]), findZone: async () => ZONE },
  });
  assert.equal(result.source, 'set_price');
  assert.equal(result.pricing.enabled, false);
});

test('a pickup outside every zone (or a failing zone lookup) still resolves', async () => {
  const outside = await resolveDeliveryPricing({
    vehicle: VEHICLE,
    pickupCoords: [0, 0],
    deps: { SetPrice: makeSetPriceModel([row()]), findZone: async () => null },
  });
  assert.equal(outside.source, 'set_price');
  assert.equal(outside.zone, null);

  const failing = await resolveDeliveryPricing({
    vehicle: VEHICLE,
    pickupCoords: [0, 0],
    deps: { SetPrice: makeSetPriceModel([]), findZone: async () => { throw new Error('zone db down'); } },
  });
  assert.equal(failing.source, 'vehicle');
});

// ---- public catalog ----------------------------------------------------------------------

test('catalog: goods vehicles show the All Zones Set Price rate; taxi-only vehicles are untouched', async () => {
  const vehicles = [
    { _id: 'v1', transport_type: 'delivery', service_tax: 5, delivery_distance_pricing: { enabled: true, base_price: 45, free_distance: 2, distance_price: 12, free_time: 10, time_price: 30 } },
    { _id: 'v2', transport_type: 'both', service_tax: 0, delivery_distance_pricing: { enabled: true, base_price: 10 } },
    { _id: 'v3', transport_type: 'taxi', service_tax: 0, delivery_distance_pricing: { enabled: false } },
  ];
  const SetPrice = makeSetPriceModel([
    row({ vehicle_type: 'v1' }),
    row({ vehicle_type: 'v2', zone_id: 'zoneA' }), // zone-specific: cannot be shown without a pickup
    row({ vehicle_type: 'v3' }),
  ]);

  const [v1, v2, v3] = await overlayCatalogWithDeliverySetPrices(vehicles, { SetPrice });

  assert.equal(v1.delivery_pricing_source, 'set_price');
  assert.equal(v1.delivery_distance_pricing.base_price, 100);
  assert.equal(v1.delivery_distance_pricing.distance_price, 20);
  assert.equal(v1.delivery_distance_pricing.free_distance, 3);
  assert.equal(v1.delivery_distance_pricing.free_time, 10, 'detention terms stay from the vehicle');
  assert.equal(v1.service_tax, 18);

  assert.equal(v2.delivery_pricing_source, 'vehicle');
  assert.equal(v2.delivery_distance_pricing.base_price, 10);

  assert.equal(v3.delivery_pricing_source, undefined);
  assert.equal(v3.delivery_distance_pricing.enabled, false);
});

test('catalog with no goods vehicles does not query at all', async () => {
  const SetPrice = { find() { throw new Error('should not be called'); } };
  const result = await overlayCatalogWithDeliverySetPrices([{ _id: 'v3', transport_type: 'taxi' }], { SetPrice });
  assert.equal(result.length, 1);
});

// ---- migration plan --------------------------------------------------------------------------

test('migration: creates a delivery row from legacy values, skips what is done or empty', () => {
  const vehicles = [
    { _id: 'a', name: 'Truck', transport_type: 'delivery', service_tax: 5, admin_commission_type_from_driver: 1, admin_commission_from_driver: 12,
      delivery_distance_pricing: { enabled: true, base_price: 45, free_distance: 2, distance_price: 12 } },
    { _id: 'b', name: 'Already done', transport_type: 'delivery', delivery_distance_pricing: { enabled: true, base_price: 10 } },
    { _id: 'c', name: 'No pricing', transport_type: 'both', delivery_distance_pricing: { enabled: false } },
    { _id: 'd', name: 'Taxi car', transport_type: 'taxi', delivery_distance_pricing: { enabled: true, base_price: 99 } },
  ];
  const plan = planDeliveryPricingMigration({
    vehicles,
    setPrices: [{ vehicle_type: 'b', transport_type: 'delivery', zone_id: null, service_location_id: null, active: 1, status: 'active' }],
  });

  assert.deepEqual(plan.map((item) => [item.name, item.action]), [
    ['Truck', 'create'], ['Already done', 'skip'], ['No pricing', 'skip'],
  ]);
  const { row: created } = plan[0];
  assert.equal(created.transport_type, 'delivery');
  assert.equal(created.zone_id, null);
  assert.equal(created.base_price, 45);
  assert.equal(created.base_distance, 2);
  assert.equal(created.price_per_distance, 12);
  assert.equal(created.service_tax, 5);
  assert.equal(created.admin_commission_from_driver, 12, 'no shared rule: commission from the vehicle');
  assert.deepEqual(created.payment_type, ['cash', 'online']);
});

test("migration clones payment/commission/cancellation from the vehicle's existing 'both' rule so only the fare changes", () => {
  const plan = planDeliveryPricingMigration({
    vehicles: [{ _id: 'a', name: 'Bike', transport_type: 'both', service_tax: 0, admin_commission_from_driver: 99,
      delivery_distance_pricing: { enabled: true, base_price: 30, free_distance: 1, distance_price: 8 } }],
    setPrices: [{
      vehicle_type: 'a', transport_type: 'both', zone_id: null, service_location_id: null, active: 1, status: 'active',
      payment_type: ['cash'], admin_commission_type_from_driver: 2, admin_commission_from_driver: 15,
      admin_commission_for_owner: 3, user_cancellation_fee: 20, user_cancellation_fee_type: 'fixed',
      driver_cancellation_fee: 10, cancellation_fee_goes_to: 'driver',
    }],
  });

  const { row: created } = plan[0];
  assert.deepEqual(created.payment_type, ['cash']);
  assert.equal(created.admin_commission_type_from_driver, 2);
  assert.equal(created.admin_commission_from_driver, 15, "the 'both' rule's commission, not the vehicle's 99");
  assert.equal(created.admin_commission_for_owner, 3);
  assert.equal(created.user_cancellation_fee, 20);
  assert.equal(created.user_cancellation_fee_type, 'fixed');
  assert.equal(created.cancellation_fee_goes_to, 'driver');
  assert.equal(created.base_price, 30, 'fare still comes from the vehicle values');
});

test('migration is idempotent: a second plan after applying skips everything', () => {
  const vehicles = [{ _id: 'a', name: 'Truck', transport_type: 'delivery', delivery_distance_pricing: { enabled: true, base_price: 45 } }];
  const first = planDeliveryPricingMigration({ vehicles, setPrices: [] });
  assert.equal(first[0].action, 'create');
  const second = planDeliveryPricingMigration({ vehicles, setPrices: [{ ...first[0].row, vehicle_type: 'a' }] });
  assert.equal(second[0].action, 'skip');
});
