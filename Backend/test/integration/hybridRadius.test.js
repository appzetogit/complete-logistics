// Real-database tests: hybrid driver radius. The Admin keeps the default radius, the allowed range and an ON/OFF switch;
// a driver can pick their own radius inside that range; the backend works out each driver's effective radius and ride
// matching / dispatch use it per driver.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, waitFor } from './harness.js';

let t;
let matchingService;
let transportSettings;
let admin;

before(async () => {
  t = await bootstrap();
  matchingService = await import('../../src/modules/taxi/services/matchingService.js');
  transportSettings = await import('../../src/modules/taxi/services/transportSettingsService.js');
  admin = await t.factories.admin();
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

// ---- helpers ------------------------------------------------------------------------------------------------------

const adminGet = () => t.api('GET', '/admin/general-settings/transport-ride', { token: admin.token });
const adminSave = (settings) => t.api('PATCH', '/admin/general-settings/transport-ride', { token: admin.token, body: { settings } });
const setRadius = async ({ def = 5, min = 2, max = 15, on = true } = {}) => {
  const res = await adminSave({
    driver_search_radius: String(def),
    driver_min_search_radius: String(min),
    driver_max_search_radius: String(max),
    allow_driver_custom_search_radius: on ? '1' : '0',
  });
  assert.equal(res.status, 200, res.text);
};
const radiusOf = (driver) => t.api('GET', '/drivers/service-radius', { token: driver.token });
const chooseRadius = (driver, body) => t.api('PATCH', '/drivers/service-radius', { token: driver.token, body });
const storedDriver = (id) => t.m.Driver.findById(id).lean();

// a point `km` kilometres north of the test pickup
const northOfPickup = (km) => {
  const [lng, lat] = t.locations.pickup;
  return { type: 'Point', coordinates: [lng, lat + km / 111.32] };
};

// ---- Admin settings --------------------------------------------------------------------------------------------------

test('Admin: the existing radius setting now comes with min, max and the switch (switch is OFF by default)', async () => {
  const res = await adminGet();
  assert.equal(res.status, 200, res.text);
  const s = res.body.data.settings;
  assert.equal(s.driver_search_radius, '5');
  assert.equal(s.driver_min_search_radius, '2');
  assert.equal(s.driver_max_search_radius, '15');
  assert.equal(s.allow_driver_custom_search_radius, '0');
});

test('Admin: saves default, min, max and the switch', async () => {
  await setRadius({ def: 6, min: 3, max: 12, on: true });
  const s = (await adminGet()).body.data.settings;
  assert.deepEqual(
    [s.driver_search_radius, s.driver_min_search_radius, s.driver_max_search_radius, s.allow_driver_custom_search_radius],
    ['6', '3', '12', '1'],
  );
  await setRadius();
});

test('Admin: invalid configurations are rejected and nothing is saved', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: true });
  const cases = [
    [{ driver_min_search_radius: '0' }, /Minimum radius must be greater than 0/],
    [{ driver_min_search_radius: '-2' }, /Minimum radius must be greater than 0/],
    [{ driver_max_search_radius: '1' }, /Maximum radius must be greater/],
    [{ driver_search_radius: '1' }, /Default radius must be between/],
    [{ driver_search_radius: '20' }, /Default radius must be between/],
    [{ driver_search_radius: 'abc' }, /Default radius/],
  ];
  for (const [patch, message] of cases) {
    const res = await adminSave(patch);
    assert.equal(res.status, 400, JSON.stringify(patch));
    assert.match(res.body.message, message);
  }
  const s = (await adminGet()).body.data.settings;
  assert.equal(s.driver_search_radius, '5');
  assert.equal(s.driver_min_search_radius, '2');
  assert.equal(s.driver_max_search_radius, '15');
});

test('Admin: other transport settings still save without touching the radius', async () => {
  await setRadius();
  const res = await adminSave({ trip_accept_reject_duration_for_driver: '20' });
  assert.equal(res.status, 200, res.text);
  const s = (await adminGet()).body.data.settings;
  assert.equal(s.trip_accept_reject_duration_for_driver, '20');
  assert.equal(s.driver_search_radius, '5');
  await adminSave({ trip_accept_reject_duration_for_driver: '15' });
});

test('Admin: only an admin can change it (no token, rider and driver are refused)', async () => {
  const body = { settings: { driver_search_radius: '9' } };
  assert.equal((await t.api('PATCH', '/admin/general-settings/transport-ride', { body })).status, 401);
  const rider = await t.factories.user();
  const driver = await t.factories.driver();
  assert.equal((await t.api('PATCH', '/admin/general-settings/transport-ride', { token: rider.token, body })).status, 403);
  assert.equal((await t.api('PATCH', '/admin/general-settings/transport-ride', { token: driver.token, body })).status, 403);
  assert.equal((await adminGet()).body.data.settings.driver_search_radius, '5');
});

// ---- Driver API -----------------------------------------------------------------------------------------------------------

test('Driver API: a new driver is on the Admin default', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  const res = await radiusOf(driver);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, {
    defaultRadius: 5, minRadius: 2, maxRadius: 15, allowCustomRadius: true,
    serviceRadius: null, isCustomRadius: false, customRadiusActive: false, effectiveRadius: 5,
  });
});

test('Driver API: saves a valid radius, the effective radius follows, and it is stored on the driver', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  const res = await chooseRadius(driver, { serviceRadius: 8 });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.serviceRadius, 8);
  assert.equal(res.body.data.isCustomRadius, true);
  assert.equal(res.body.data.effectiveRadius, 8);
  const stored = await storedDriver(driver.driver._id);
  assert.equal(stored.serviceRadius, 8);
  assert.equal(stored.isCustomRadius, true);
  assert.equal((await radiusOf(driver)).body.data.effectiveRadius, 8);
});

test('Driver API: values outside the Admin range, or not numbers, are rejected and nothing changes', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  await chooseRadius(driver, { serviceRadius: 8 });

  for (const bad of [1, 1.9, 15.1, 100, 0, -5, 'abc', '', null, undefined]) {
    const res = await chooseRadius(driver, { serviceRadius: bad });
    assert.equal(res.status, 400, `serviceRadius ${JSON.stringify(bad)}`);
  }
  const range = await chooseRadius(driver, { serviceRadius: 1 });
  assert.equal(range.body.details.code, 'radius_out_of_range');
  assert.equal(range.body.details.minRadius, 2);
  assert.equal(range.body.details.maxRadius, 15);
  assert.equal((await storedDriver(driver.driver._id)).serviceRadius, 8, 'the earlier valid choice is untouched');
});

test('Driver API: the limits are inclusive', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  assert.equal((await chooseRadius(driver, { serviceRadius: 2 })).status, 200);
  assert.equal((await chooseRadius(driver, { serviceRadius: 15 })).status, 200);
});

test('Driver API: the effective radius is worked out by the backend, whatever the client sends', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  const res = await chooseRadius(driver, { serviceRadius: 8, effectiveRadius: 99, defaultRadius: 99, maxRadius: 99, allowCustomRadius: false });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.effectiveRadius, 8);
  assert.equal(res.body.data.maxRadius, 15, 'the Admin limits are not editable from here');
  assert.equal((await adminGet()).body.data.settings.driver_max_search_radius, '15');
});

test('Driver API: going back to the default keeps the saved number', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  await chooseRadius(driver, { serviceRadius: 8 });
  const res = await chooseRadius(driver, { isCustomRadius: false });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.isCustomRadius, false);
  assert.equal(res.body.data.effectiveRadius, 5);
  assert.equal(res.body.data.serviceRadius, 8);
  assert.equal((await chooseRadius(driver, { serviceRadius: 8 })).body.data.effectiveRadius, 8);
});

test('Driver API: needs a driver login, and a driver can only change their own radius', async () => {
  await setRadius();
  const me = await t.factories.driver();
  const other = await t.factories.driver();
  const rider = await t.factories.user();

  assert.equal((await t.api('GET', '/drivers/service-radius')).status, 401);
  assert.equal((await t.api('PATCH', '/drivers/service-radius', { body: { serviceRadius: 8 } })).status, 401);
  assert.equal((await t.api('GET', '/drivers/service-radius', { token: rider.token })).status, 403);
  assert.equal((await t.api('PATCH', '/drivers/service-radius', { token: rider.token, body: { serviceRadius: 8 } })).status, 403);

  // naming somebody else in the body or the query changes nothing: the driver is the one in the token
  const res = await t.api('PATCH', `/drivers/service-radius?driverId=${other.driver._id}`, {
    token: me.token,
    body: { serviceRadius: 9, driverId: String(other.driver._id), _id: String(other.driver._id), id: String(other.driver._id) },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal((await storedDriver(me.driver._id)).serviceRadius, 9);
  assert.equal((await storedDriver(other.driver._id)).serviceRadius, null);
  assert.equal((await storedDriver(other.driver._id)).isCustomRadius, false);
});

// ---- Business scenarios -------------------------------------------------------------------------------------------------

test('Scenario 3: Admin changes the default: default drivers follow, valid custom drivers keep their radius', async () => {
  await setRadius({ def: 5 });
  const plain = await t.factories.driver();
  const custom = await t.factories.driver();
  await chooseRadius(custom, { serviceRadius: 8 });

  await setRadius({ def: 6 });
  assert.equal((await radiusOf(plain)).body.data.effectiveRadius, 6);
  assert.equal((await radiusOf(custom)).body.data.effectiveRadius, 8);
  await setRadius();
});

test('Scenario 4 + 5: switching custom radius OFF forces the default, ON restores the saved choice', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  await chooseRadius(driver, { serviceRadius: 8 });

  await setRadius({ on: false });
  const off = (await radiusOf(driver)).body.data;
  assert.equal(off.allowCustomRadius, false);
  assert.equal(off.effectiveRadius, 5);
  assert.equal(off.serviceRadius, 8, 'kept');
  assert.equal(off.isCustomRadius, true, 'kept');
  const blocked = await chooseRadius(driver, { serviceRadius: 9 });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.details.code, 'custom_radius_disabled');
  assert.equal((await storedDriver(driver.driver._id)).serviceRadius, 8, 'nothing written while OFF');

  await setRadius({ on: true });
  const on = (await radiusOf(driver)).body.data;
  assert.equal(on.effectiveRadius, 8);
  assert.equal(on.customRadiusActive, true);
});

test('Scenario 6: new limits that exclude a saved radius make it inactive, without deleting it', async () => {
  await setRadius();
  const driver = await t.factories.driver();
  await chooseRadius(driver, { serviceRadius: 8 });

  await setRadius({ def: 5, min: 2, max: 6 });
  const narrowed = (await radiusOf(driver)).body.data;
  assert.equal(narrowed.effectiveRadius, 5);
  assert.equal(narrowed.customRadiusActive, false);
  assert.equal(narrowed.serviceRadius, 8, 'not overwritten');
  assert.equal((await storedDriver(driver.driver._id)).serviceRadius, 8);

  assert.equal((await chooseRadius(driver, { serviceRadius: 8 })).status, 400, 'a new choice must fit the new limits');
  assert.equal((await chooseRadius(driver, { serviceRadius: 4 })).body.data.effectiveRadius, 4);

  await setRadius({ def: 5, min: 2, max: 15 });
  assert.equal((await radiusOf(driver)).body.data.effectiveRadius, 4);
});

// ---- Matching: who is offered a ride --------------------------------------------------------------------------------------------

const makeDriver = async (vehicle, km, own) => {
  const created = await t.factories.driver({
    vehicleTypeId: vehicle._id,
    location: northOfPickup(km),
    ...(own === undefined ? {} : { serviceRadius: own, isCustomRadius: true }),
  });
  return created;
};

const matchedIds = async (vehicle, attemptRadiusMeters = 5000) => {
  const config = await transportSettings.resolveTransportDispatchConfig();
  const result = await matchingService.matchDrivers(t.locations.pickup, {
    maxDistance: attemptRadiusMeters,
    vehicleTypeId: vehicle._id,
    driverRadius: config.driverRadius,
  });
  return new Set(result.drivers.map((d) => String(d._id)));
};

test('Matching: each driver is judged by their own radius; nobody else is affected', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: true });
  const vehicle = await t.factories.vehicle();

  const d = {
    nearCustom: await makeDriver(vehicle, 2.5, 3),     // inside own 3 km
    insideDefaultOutsideOwn: await makeDriver(vehicle, 4, 3), // inside the default 5 km but outside own 3 km
    farCustom: await makeDriver(vehicle, 7, 8),        // beyond the default, inside own 8 km
    defaultNear: await makeDriver(vehicle, 4),         // default 5 km
    defaultFar: await makeDriver(vehicle, 7),          // outside the default 5 km
    customTooFar: await makeDriver(vehicle, 12, 10),   // outside own 10 km
    customFar: await makeDriver(vehicle, 9, 10),       // inside own 10 km
    staleOutOfRange: await makeDriver(vehicle, 4, 20), // saved 20 km is above the max: default 5 km applies, 4 km is inside
    staleFar: await makeDriver(vehicle, 6, 20),        // default 5 km applies, 6 km is outside
  };

  const ids = await matchedIds(vehicle);
  const name = (key) => String(d[key].driver._id);

  assert.equal(ids.has(name('nearCustom')), true, 'A: 3 km radius, 2.5 km away');
  assert.equal(ids.has(name('insideDefaultOutsideOwn')), false, 'a 3 km driver is not offered a 4 km ride');
  assert.equal(ids.has(name('farCustom')), true, 'B: 8 km radius, 7 km away (beyond the default)');
  assert.equal(ids.has(name('defaultNear')), true, 'C: default 5 km, 4 km away');
  assert.equal(ids.has(name('defaultFar')), false, 'C: default 5 km, 7 km away');
  assert.equal(ids.has(name('customFar')), true, 'D: 10 km radius, 9 km away');
  assert.equal(ids.has(name('customTooFar')), false, 'D: 10 km radius, 12 km away');
  assert.equal(ids.has(name('staleOutOfRange')), true, 'saved radius outside the limits: default applies');
  assert.equal(ids.has(name('staleFar')), false, 'saved radius outside the limits: default applies');
  assert.equal(ids.size, 5);
});

test('Matching: with custom radius OFF everybody uses the default, as before', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: false });
  const vehicle = await t.factories.vehicle();
  const small = await makeDriver(vehicle, 4, 3);
  const big = await makeDriver(vehicle, 7, 8);
  const plainNear = await makeDriver(vehicle, 4);
  const plainFar = await makeDriver(vehicle, 7);

  const ids = await matchedIds(vehicle);
  assert.equal(ids.has(String(small.driver._id)), true, 'its own 3 km is ignored while OFF');
  assert.equal(ids.has(String(big.driver._id)), false, 'its own 8 km is ignored while OFF');
  assert.equal(ids.has(String(plainNear.driver._id)), true);
  assert.equal(ids.has(String(plainFar.driver._id)), false);
});

test('Matching: the default radius still grows with each dispatch attempt for drivers on the default', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: true });
  const vehicle = await t.factories.vehicle();
  const plain = await makeDriver(vehicle, 7);
  const custom = await makeDriver(vehicle, 7, 3);

  assert.equal((await matchedIds(vehicle, 5000)).has(String(plain.driver._id)), false, 'attempt 1: 5 km');
  const later = await matchedIds(vehicle, 7500);
  assert.equal(later.has(String(plain.driver._id)), true, 'attempt 2: 7.5 km');
  assert.equal(later.has(String(custom.driver._id)), false, 'a custom radius is fixed, it does not grow');
});

test('Matching: many nearby drivers outside their own radius do not push eligible ones out of the result', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: true });
  const vehicle = await t.factories.vehicle();
  const crowd = [];
  for (let i = 0; i < 12; i += 1) crowd.push(await makeDriver(vehicle, 3 + i * 0.01, 2)); // near, but only 2 km each
  const wanted = await makeDriver(vehicle, 9, 12);

  const config = await transportSettings.resolveTransportDispatchConfig();
  const result = await matchingService.matchDrivers(t.locations.pickup, {
    maxDistance: 5000, vehicleTypeId: vehicle._id, driverRadius: config.driverRadius, limit: 3,
  });
  const ids = result.drivers.map((x) => String(x._id));
  assert.deepEqual(ids, [String(wanted.driver._id)], 'the 12 nearer drivers are outside their own 2 km radius');
});

// ---- Dispatch end to end -----------------------------------------------------------------------------------------------------

test('Dispatch: a ride request reaches only the drivers whose own radius covers the pickup', async () => {
  await setRadius({ def: 5, min: 2, max: 15, on: true });
  await t.setSettings('transport_ride', { trip_dispatch_type: '2' }); // broadcast: everyone eligible is offered at once

  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 0);

  const small = await makeDriver(vehicle, 4, 3);   // default 5 would cover 4 km, own 3 km does not
  const wide = await makeDriver(vehicle, 7, 8);    // beyond the default, inside own 8 km
  const plainNear = await makeDriver(vehicle, 4);  // default
  const plainFar = await makeDriver(vehicle, 7);   // outside default

  const sockets = {};
  for (const [key, d] of Object.entries({ small, wide, plainNear, plainFar })) {
    sockets[key] = await t.connectSocket(d.token);
  }
  await sleep(300);

  const book = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(book.status, 201, book.text);
  const rideId = book.body.data.ride._id;
  const offered = (key) => sockets[key].of('rideRequest').some((e) => e.payload.rideId === rideId);

  await waitFor(() => offered('wide') && offered('plainNear'), { message: 'the eligible drivers are offered the ride' });
  await sleep(800);
  assert.equal(offered('wide'), true);
  assert.equal(offered('plainNear'), true);
  assert.equal(offered('small'), false, 'inside the default radius but outside their own 3 km');
  assert.equal(offered('plainFar'), false, 'outside the default radius');

  await t.setSettings('transport_ride', { trip_dispatch_type: '1' });
});
