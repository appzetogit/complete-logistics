// State-wise admin view: an admin limited to a state only ever sees, opens and changes records of that state's
// cities; a super admin sees everything (or one state through the selector); legacy sub-admins without an area
// keep full access; new rides label their city.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let mp;
let mh;
let indore;
let pune;
let userIndore;
let userPune;
let driverIndore;
let driverPune;
let rideIndoreId;
let ridePuneId;
let superAdmin;
let mpAdmin;
let legacyAdmin;
let ServiceLocation;
let State;

const rowsOf = (res) => {
  const data = res.body?.data;
  const list = Array.isArray(data) ? data : data?.results || data?.items || data?.users || data?.drivers || data?.rides || [];
  return list.map((row) => String(row._id || row.id));
};
const get = (path, admin, headers) => t.api('GET', path, { token: admin.token, headers });

const makeSubAdmin = async (extra = {}) => {
  const admin = await t.m.Admin.create({
    name: 'Sub Admin',
    email: `sub${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`,
    password: 'x'.repeat(10),
    admin_type: 'subadmin',
    role: 'subadmin',
    permissions: ['*'],
    ...extra,
  });
  return { admin, token: t.tokenFor(admin._id, 'admin') };
};

before(async () => {
  t = await bootstrap();
  ({ State } = await import('../../src/modules/taxi/admin/models/State.js'));
  ({ ServiceLocation } = await import('../../src/modules/taxi/admin/models/ServiceLocation.js'));

  mp = await State.create({ name: 'Madhya Pradesh', code: 'MP' });
  mh = await State.create({ name: 'Maharashtra', code: 'MH' });
  indore = await ServiceLocation.create({
    name: 'Indore', service_location_name: 'Indore', state_id: mp._id, latitude: 22.7196, longitude: 75.8577,
    location: { type: 'Point', coordinates: [75.8577, 22.7196] },
  });
  pune = await ServiceLocation.create({
    name: 'Pune', service_location_name: 'Pune', state_id: mh._id, latitude: 18.5204, longitude: 73.8567,
    location: { type: 'Point', coordinates: [73.8567, 18.5204] },
  });

  userIndore = (await t.factories.user({ name: 'Indore Rider', area_location_id: indore._id })).user;
  userPune = (await t.factories.user({ name: 'Pune Rider', area_location_id: pune._id })).user;
  driverIndore = (await t.factories.driver({ name: 'Indore Driver', service_location_id: indore._id })).driver;
  driverPune = (await t.factories.driver({ name: 'Pune Driver', service_location_id: pune._id })).driver;

  const vehicle = await t.factories.vehicle();
  const insertRide = async (user, areaId) => String((await t.m.Ride.collection.insertOne({
    userId: user._id,
    vehicleTypeId: vehicle._id,
    status: 'completed',
    fare: 100,
    area_location_id: areaId,
    pickupLocation: { type: 'Point', coordinates: [75.8577, 22.7196] },
    dropLocation: { type: 'Point', coordinates: [75.8777, 22.7396] },
    createdAt: new Date(),
    updatedAt: new Date(),
  })).insertedId);
  rideIndoreId = await insertRide(userIndore, indore._id);
  ridePuneId = await insertRide(userPune, pune._id);

  superAdmin = await t.factories.admin();
  mpAdmin = await makeSubAdmin({ state_ids: [mp._id] });
  legacyAdmin = await makeSubAdmin();
});
after(async () => { await t.stop(); });

test('a state-limited admin lists only the riders of that state', async () => {
  const res = await get('/v1/admin/users?limit=100', mpAdmin);
  assert.equal(res.status, 200, res.text);
  const found = rowsOf(res);
  assert.ok(found.includes(String(userIndore._id)));
  assert.ok(!found.includes(String(userPune._id)), 'a Maharashtra rider is invisible to the MP admin');
});

test('opening a record of another state is a not-found, for reading and for changing it', async () => {
  assert.equal((await get(`/v1/admin/users/${userIndore._id}`, mpAdmin)).status, 200);
  assert.equal((await get(`/v1/admin/users/${userPune._id}`, mpAdmin)).status, 404);
  assert.equal((await get(`/v1/admin/drivers/${driverPune._id}`, mpAdmin)).status, 404);
  const change = await t.api('PATCH', `/v1/admin/drivers/${driverPune._id}`, { token: mpAdmin.token, body: { name: 'Hacked' } });
  assert.ok([403, 404].includes(change.status), change.text);
  assert.equal((await t.m.Driver.findById(driverPune._id).lean()).name, 'Pune Driver');
});

test('drivers and rides lists are limited the same way', async () => {
  const drivers = rowsOf(await get('/v1/admin/drivers?limit=100', mpAdmin));
  assert.ok(drivers.includes(String(driverIndore._id)));
  assert.ok(!drivers.includes(String(driverPune._id)));

  const rides = rowsOf(await get('/v1/admin/ride-requests?limit=100&tab=all', mpAdmin));
  assert.ok(rides.includes(rideIndoreId));
  assert.ok(!rides.includes(ridePuneId));
});

test('a super admin sees every state, or one state through the selector', async () => {
  const all = rowsOf(await get('/v1/admin/users?limit=100', superAdmin));
  assert.ok(all.includes(String(userIndore._id)) && all.includes(String(userPune._id)));

  const onlyMh = rowsOf(await get('/v1/admin/users?limit=100', superAdmin, { 'x-admin-state': String(mh._id) }));
  assert.ok(onlyMh.includes(String(userPune._id)));
  assert.ok(!onlyMh.includes(String(userIndore._id)));

  const everything = rowsOf(await get('/v1/admin/users?limit=100', superAdmin, { 'x-admin-state': 'all' }));
  assert.ok(everything.includes(String(userIndore._id)) && everything.includes(String(userPune._id)));
});

test('the selector can only narrow a limited admin, never widen it', async () => {
  const other = await get('/v1/admin/users?limit=100', mpAdmin, { 'x-admin-state': String(mh._id) });
  assert.equal(other.status, 200, other.text);
  assert.deepEqual(rowsOf(other), [], 'MP admin asking for Maharashtra gets nothing');
  const same = rowsOf(await get('/v1/admin/users?limit=100', mpAdmin, { 'x-admin-state': String(mp._id) }));
  assert.ok(same.includes(String(userIndore._id)));
});

test('a legacy sub-admin with no state or city assigned keeps seeing everything', async () => {
  const found = rowsOf(await get('/v1/admin/users?limit=100', legacyAdmin));
  assert.ok(found.includes(String(userIndore._id)) && found.includes(String(userPune._id)));
});

test('a city assigned directly limits an admin too, and an admin with a state that has no cities sees nothing', async () => {
  const cityAdmin = await makeSubAdmin({ service_location_ids: [pune._id] });
  const found = rowsOf(await get('/v1/admin/users?limit=100', cityAdmin));
  assert.ok(found.includes(String(userPune._id)) && !found.includes(String(userIndore._id)));

  const empty = await State.create({ name: 'Goa', code: 'GA' });
  const goaAdmin = await makeSubAdmin({ state_ids: [empty._id] });
  assert.deepEqual(rowsOf(await get('/v1/admin/users?limit=100', goaAdmin)), []);
});

test('states: super admin manages them, a limited admin only sees their own', async () => {
  const created = await t.api('POST', '/v1/admin/states', { token: superAdmin.token, body: { name: 'Kerala', code: 'kl' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.data.code, 'KL');
  const dup = await t.api('POST', '/v1/admin/states', { token: superAdmin.token, body: { name: 'Kerala 2', code: 'KL' } });
  assert.equal(dup.status, 409);

  const denied = await t.api('POST', '/v1/admin/states', { token: mpAdmin.token, body: { name: 'Nope', code: 'NP' } });
  assert.equal(denied.status, 403);

  const seen = (await get('/v1/admin/states', mpAdmin)).body.data.map((row) => row.code);
  assert.deepEqual(seen, ['MP']);
  const everything = (await get('/v1/admin/states', superAdmin)).body.data.map((row) => row.code);
  assert.ok(['MP', 'MH', 'KL'].every((code) => everything.includes(code)));

  // a state with cities cannot be deleted
  const blocked = await t.api('DELETE', `/v1/admin/states/${mp._id}`, { token: superAdmin.token });
  assert.equal(blocked.status, 409);
});

test('admin accounts: a limited admin cannot hand out areas outside their own', async () => {
  const body = (extra) => ({
    name: 'New Sub', email: `new${Date.now()}@example.com`, password: 'secret1', password_confirmation: 'secret1',
    admin_type: 'subadmin', permissions: ['users.view'], ...extra,
  });
  const outside = await t.api('POST', '/v1/admin/admin-management/admins', { token: mpAdmin.token, body: body({ state_ids: [String(mh._id)] }) });
  assert.equal(outside.status, 403, outside.text);
  const inside = await t.api('POST', '/v1/admin/admin-management/admins', { token: mpAdmin.token, body: body({ state_ids: [String(mp._id)] }) });
  assert.equal(inside.status, 200, inside.text);
  assert.deepEqual(inside.body.data.state_ids, [String(mp._id)]);
});

test('a new ride is labelled with the city of its pickup, and so is a rider who had none', async () => {
  const vehicle = await t.factories.vehicle();
  const rider = await t.factories.user();
  assert.equal(rider.user.area_location_id ?? null, null);
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const ride = await t.m.Ride.findById(created.body.data.ride._id).lean();
  assert.equal(String(ride.area_location_id), String(indore._id), 'the nearest city to the pickup');
  assert.equal(String((await t.m.User.findById(rider.user._id).lean()).area_location_id), String(indore._id));
});

test('dashboard totals follow the scope: the state admin counts only their state, the super admin everything', async () => {
  const mine = (await get('/v1/admin/dashboard/data', mpAdmin)).body.data;
  const all = (await get('/v1/admin/dashboard/data', superAdmin)).body.data;
  const onlyMh = (await get('/v1/admin/dashboard/data', superAdmin, { 'x-admin-state': String(mh._id) })).body.data;
  assert.equal(mine.totalUsers, await t.m.User.countDocuments({ area_location_id: indore._id }), 'mine users');
  assert.equal(onlyMh.totalUsers, await t.m.User.countDocuments({ area_location_id: pune._id }), 'mh users');
  assert.ok(all.totalUsers > mine.totalUsers, 'the super admin total is the sum over all states');
  assert.equal(mine.totalDrivers.total, await t.m.Driver.countDocuments({ area_location_id: indore._id }), 'mine drivers');
});

test('a state-limited admin can open the owners list: the default-owner seeding runs outside their scope', async () => {
  const Owner = t.mongoose.model('TaxiOwner');
  await Owner.collection.insertMany([
    { name: 'Indore Vendor', mobile: '9210000001', email: 'iv@example.com', service_location_id: indore._id, approve: true, active: true, status: 'approved', createdAt: new Date(), updatedAt: new Date() },
    { name: 'Pune Vendor', mobile: '9210000002', email: 'pv@example.com', service_location_id: pune._id, approve: true, active: true, status: 'approved', createdAt: new Date(), updatedAt: new Date() },
  ]);
  // before the fix this answered 409 (duplicate key): the seeding routine saw the filtered database and tried to create the default city again
  const mine = await get('/v1/admin/owner-management/manage-owners', mpAdmin);
  assert.equal(mine.status, 200, mine.text);
  const names = (mine.body.data.results || []).map((o) => o.name);
  assert.ok(names.includes('Indore Vendor'), JSON.stringify(names));
  assert.ok(!names.includes('Pune Vendor'), 'a Maharashtra vendor is not visible');

  const all = await get('/v1/admin/owner-management/manage-owners', superAdmin);
  const allNames = (all.body.data.results || []).map((o) => o.name);
  assert.ok(allNames.includes('Indore Vendor') && allNames.includes('Pune Vendor'));
  const puneOwner = await Owner.findOne({ name: 'Pune Vendor' }).lean();
  assert.equal((await get(`/v1/admin/owner-management/manage-owners/${puneOwner._id}`, mpAdmin)).status, 404, 'by id too');
});

test('the browser preflight allows the x-admin-state header (otherwise the state selector breaks every admin request)', async () => {
  const res = await fetch(`${t.baseUrl}/api/v1/admin/users`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://www.rentol.in', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-admin-state' },
  });
  assert.equal(res.status, 204);
  const allowed = String(res.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(allowed.includes('x-admin-state') && allowed.includes('authorization'), allowed);
});
