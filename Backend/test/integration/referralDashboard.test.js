// The admin Referral Dashboard shows real numbers (it used to return fixed zeros): referral sign-ups, this year's months,
// active referrals and credited rewards; and a state-limited admin only counts their own area.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let superAdmin;
let mpAdmin;

before(async () => {
  t = await bootstrap();
  const State = (await import('../../src/modules/taxi/admin/models/State.js')).State;
  const ServiceLocation = (await import('../../src/modules/taxi/admin/models/ServiceLocation.js')).ServiceLocation;
  const ReferralReward = (await import('../../src/modules/taxi/referral/models/ReferralReward.js')).ReferralReward;

  const mp = await State.create({ name: 'Madhya Pradesh', code: 'MP' });
  const mh = await State.create({ name: 'Maharashtra', code: 'MH' });
  const indore = await ServiceLocation.create({ name: 'Indore', service_location_name: 'Indore', state_id: mp._id, location: { type: 'Point', coordinates: [75.8577, 22.7196] } });
  const pune = await ServiceLocation.create({ name: 'Pune', service_location_name: 'Pune', state_id: mh._id, location: { type: 'Point', coordinates: [73.8567, 18.5204] } });

  const referrer = (await t.factories.user({ area_location_id: indore._id })).user;
  const referredIndore = (await t.factories.user({ area_location_id: indore._id, referredBy: referrer._id, referredRideCompletionCount: 1 })).user;
  const referredPune = (await t.factories.user({ area_location_id: pune._id, referredBy: referrer._id })).user;
  await t.factories.driver({ service_location_id: indore._id, referredBy: referrer._id, referralRewardGrantedAt: new Date() });
  await t.factories.driver({ service_location_id: indore._id });

  const reward = (key, payee, amount, status) => ReferralReward.create({ referenceKey: key, payeeType: 'user', payeeId: payee._id, amount, status, creditedAt: status === 'CREDITED' ? new Date() : null });
  await reward('r1', referrer, 50, 'CREDITED');
  await reward('r2', referredPune, 30, 'CREDITED');
  await reward('r3', referredIndore, 99, 'PENDING');

  superAdmin = await t.factories.admin();
  const sub = await t.m.Admin.create({
    name: 'MP Admin', email: `mp${Date.now()}@example.com`, password: 'x'.repeat(10), admin_type: 'subadmin', role: 'subadmin', permissions: ['*'], state_ids: [mp._id],
  });
  mpAdmin = { token: t.tokenFor(sub._id, 'admin') };
});
after(async () => { await t.stop(); });

const dashboard = async (admin) => {
  const res = await t.api('GET', '/v1/admin/referral/dashboard', { token: admin.token });
  assert.equal(res.status, 200, res.text);
  return res.body.data;
};
const currentMonthIndex = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', month: 'numeric' })) - 1;

test('the super admin sees every referral sign-up, the active ones and the credited rewards', async () => {
  const data = await dashboard(superAdmin);
  assert.equal(data.total_users, 3);
  assert.equal(data.total_drivers, 2);
  assert.equal(data.user_referrals.referral_user, 2);
  assert.equal(data.user_referrals.normal_user, 1);
  assert.equal(data.driver_referrals.referral_driver, 1);
  assert.equal(data.driver_referrals.normal_driver, 1);
  assert.equal(data.active_referrals, 2, 'a referred rider who took a ride + a referred driver who earned the referrer a reward');
  assert.equal(data.referral_earning, 80, 'only CREDITED rewards count (50 + 30)');
  assert.equal(data.user_referrals.monthly.length, 12);
  assert.equal(data.user_referrals.monthly[currentMonthIndex()], 2, 'this month, India time');
  assert.equal(data.user_referrals.monthly.reduce((a, b) => a + b, 0), 2);
  assert.equal(data.driver_referrals.monthly[currentMonthIndex()], 1);
});

test('a state-limited admin only counts their own area, including the rewards paid there', async () => {
  const data = await dashboard(mpAdmin);
  assert.equal(data.total_users, 2, 'the Indore rider and the referred Indore rider');
  assert.equal(data.total_drivers, 2);
  assert.equal(data.user_referrals.referral_user, 1);
  assert.equal(data.referral_earning, 50, 'the reward paid to a Pune rider is not counted');
  assert.equal(data.active_referrals, 2);
});
