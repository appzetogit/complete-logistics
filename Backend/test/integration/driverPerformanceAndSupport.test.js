// Real-database tests: driver performance numbers and the support contact settings.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });

const IST = 5.5 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
// A time on the IST day `daysAgo` days before today: noon, or for today a moment already past
// (early in the morning today's noon is still in the future).
const istNoon = (daysAgo) => {
  const shifted = new Date(Date.now() + IST);
  shifted.setUTCHours(0, 0, 0, 0);
  const dayStart = shifted.getTime() - IST - daysAgo * DAY;
  if (daysAgo === 0) {
    return new Date(dayStart + Math.floor((Date.now() - dayStart) / 2));
  }
  return new Date(dayStart + 12 * 60 * 60 * 1000);
};
// IST day index (0 = Monday) of a date.
const istWeekday = (date) => (new Date(date.getTime() + IST).getUTCDay() + 6) % 7;

// A completed ride for this driver at the given time.
const completedRide = async ({ vehicle, driver, at, status = 'completed' }) => {
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;
  await t.m.Ride.updateOne(
    { _id: rideId },
    { $set: { driverId: driver.driver._id, status, liveStatus: status, completedAt: status === 'completed' ? at : null } },
  );
  await t.m.User.updateOne({ _id: rider.user._id }, { $set: { currentRideId: null } });
  return rideId;
};

test('GET /drivers/performance: streak, today/yesterday, this/last week (completed rides only, IST)', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const other = await t.factories.driver({ vehicleTypeId: vehicle._id });

  const plan = [0, 0, 1, 2, 4, 9]; // days ago: 2 today, 1 yesterday, 1 two days ago, gap, 1 four days ago, 1 nine days ago
  for (const daysAgo of plan) {
    await completedRide({ vehicle, driver, at: istNoon(daysAgo) });
  }
  await completedRide({ vehicle, driver, at: istNoon(0), status: 'cancelled' }); // never counted
  await completedRide({ vehicle, driver: other, at: istNoon(0) }); // someone else's

  const res = await t.api('GET', '/drivers/performance', { token: driver.token });
  assert.equal(res.status, 200, res.text);
  const perf = res.body.data;

  // expected week numbers, computed independently from the same ride dates
  const todayIndex = istWeekday(istNoon(0));
  const inThisWeek = plan.filter((daysAgo) => daysAgo <= todayIndex).length;
  const inLastWeek = plan.filter((daysAgo) => daysAgo > todayIndex && daysAgo <= todayIndex + 7).length;

  assert.deepEqual(perf, {
    dayStreak: 3,
    ridesToday: 2,
    ridesYesterday: 1,
    tripsThisWeek: inThisWeek,
    tripsLastWeek: inLastWeek,
  });

  const anonymous = await t.api('GET', '/drivers/performance');
  assert.equal(anonymous.status, 401);
  const rider = await t.factories.user();
  assert.ok([401, 403].includes((await t.api('GET', '/drivers/performance', { token: rider.token })).status));
});

test('a new driver gets zeros', async () => {
  const driver = await t.factories.driver();
  const res = await t.api('GET', '/drivers/performance', { token: driver.token });
  assert.deepEqual(res.body.data, { dayStreak: 0, ridesToday: 0, ridesYesterday: 0, tripsThisWeek: 0, tripsLastWeek: 0 });
});

// ------------------------------------------------------------------ support contact
const publicSupport = () => fetch(`${t.baseUrl}/api/v1/app-settings/support`).then(async (res) => ({ status: res.status, body: await res.json() }));
const saveSupport = (settings, token = admin.token) => t.api('PATCH', '/admin/general-settings/support', { token, body: { settings } });

test('support contact: empty until set, admin-editable, validated, public without login', async () => {
  const empty = await publicSupport();
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data, { support_phone: '', support_email: '', support_whatsapp: '' });

  const saved = await saveSupport({ support_phone: ' +91 98765 43210 ', support_email: 'help@rentol.in', unknown_key: 'ignored' });
  assert.equal(saved.status, 200, saved.text);

  const after = await publicSupport();
  assert.deepEqual(after.body.data, { support_phone: '+91 98765 43210', support_email: 'help@rentol.in', support_whatsapp: '' }, 'visible right away, no stale cache');

  const sibling = await t.api('GET', '/rides/app-settings/support');
  assert.equal(sibling.status, 200);
  assert.deepEqual(sibling.body.data, after.body.data, 'same answer next to /rides/app-settings/tip');

  assert.equal((await saveSupport({ support_email: 'not-an-email' })).status, 400);
  assert.equal((await saveSupport({ support_phone: 'call us' })).status, 400);
  assert.equal((await saveSupport({ support_whatsapp: '12' })).status, 400);
  assert.deepEqual((await publicSupport()).body.data, after.body.data, 'a rejected save changes nothing');

  await saveSupport({ support_whatsapp: '+919876543210' });
  assert.equal((await publicSupport()).body.data.support_whatsapp, '+919876543210');
  await saveSupport({ support_whatsapp: '' });
  assert.equal((await publicSupport()).body.data.support_whatsapp, '', 'can be cleared');

  const rider = await t.factories.user();
  assert.ok([401, 403].includes((await saveSupport({ support_phone: '+910000000000' }, rider.token)).status), 'only admins edit it');
});
