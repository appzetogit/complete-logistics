// Real-database tests: automatic referral attribution (share link -> token -> signup) on top of the existing
// reward engine, plus the race-safe payout ledger.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import mongoose from 'mongoose';
import { bootstrap } from './harness.js';

let t;
let attribution; // services, imported after the app has booted (they read env at import time)
let rewards;
let Attribution;
let Reward;

const BASE = 'https://refer.example.com';
const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.example.app';
const LANDING = 'https://app.example.com/get';

before(async () => {
  t = await bootstrap({
    env: {
      REFERRAL_BASE_URL: BASE,
      REFERRAL_LANDING_URL: LANDING,
      REFERRAL_ANDROID_STORE_URL: ANDROID_STORE,
      REFERRAL_ATTRIBUTION_TTL_HOURS: '1',
    },
  });
  attribution = await import('../../src/modules/taxi/referral/services/referralAttributionService.js');
  rewards = await import('../../src/modules/taxi/referral/services/referralRewardService.js');
  Attribution = (await import('../../src/modules/taxi/referral/models/ReferralAttribution.js')).ReferralAttribution;
  Reward = (await import('../../src/modules/taxi/referral/models/ReferralReward.js')).ReferralReward;
  await t.setSettings('free_rides', { enabled: '0' });
});
after(async () => { await t.stop(); });

// ---- helpers ------------------------------------------------------------------------------------------------------

let counter = 0;
const newPhone = () => String(8300000000 + (Date.now() % 100000) * 10 + (counter += 1)).slice(0, 10);

const setProgram = (program, values) =>
  t.m.AdminBusinessSetting.updateOne(
    { scope: 'default' },
    { $set: { [`referral.${program}`]: { enabled: true, type: 'instant_referrer_new', amount: 50, ride_count: 1, ...values } } },
    { upsert: true },
  );

const asJson = (path, headers = {}) =>
  fetch(`${t.baseUrl}${path}`, { headers: { Accept: 'application/json', ...headers } }).then(async (res) => ({
    status: res.status,
    body: await res.json().catch(() => null),
  }));

// a referrer who already has a code
const makeUser = async (overrides = {}) => {
  const created = await t.factories.user(overrides);
  const code = `USR${String(created.user._id).slice(-8).toUpperCase()}`;
  await t.m.User.updateOne({ _id: created.user._id }, { $set: { referralCode: code } });
  return { ...created, code };
};
const makeDriver = async (overrides = {}) => {
  const created = await t.factories.driver(overrides);
  const code = `DRV${String(created.driver._id).slice(-8).toUpperCase()}`;
  await t.m.Driver.updateOne({ _id: created.driver._id }, { $set: { referralCode: code } });
  return { ...created, code };
};

const openLink = async (code) => {
  const res = await asJson(`/r/${code}?format=json`);
  return { ...res, token: res.body?.data?.attributionToken };
};

const signup = async ({ phone = newPhone(), token, code, name = 'New Rider' } = {}) => {
  assert.equal((await t.api('POST', '/users/auth/send-otp', { body: { phone } })).status, 201);
  const verify = await t.api('POST', '/users/auth/verify-otp', { body: { phone, otp: '1234' } });
  assert.equal(verify.status, 200, verify.text);
  const body = { name, phone, email: `r${phone}@example.com`, gender: 'male' };
  if (token) body.attributionToken = token;
  if (code) body.referralCode = code;
  const res = await t.api('POST', '/users/signup', { body });
  return { phone, ...res };
};

// a cash ride from booking to "completed" by some other driver, for this rider
const completeRideAsRider = async (riderId) => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const riderToken = t.tokenFor(riderId, 'user');
  return runRide({ riderToken, vehicle, driverId: driver.driver._id, driverToken: driver.token });
};

// a cash ride completed by this driver, for some other rider
const completeRideAsDriver = async (driverId) => {
  const vehicle = await t.factories.vehicle();
  await t.m.Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        approve: true,
        status: 'approved',
        isOnline: true,
        isOnRide: false,
        vehicleTypeId: vehicle._id,
        location: { type: 'Point', coordinates: t.locations.pickup },
        'wallet.cashLimit': 500,
        'wallet.isBlocked': false,
      },
      $max: { 'wallet.balance': 2000 },
    },
  );
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 0);
  return runRide({ riderToken: rider.token, vehicle, driverId, driverToken: t.tokenFor(driverId, 'driver') });
};

const runRide = async ({ riderToken, vehicle, driverId, driverToken }) => {
  const book = await t.api('POST', '/rides', {
    token: riderToken,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(book.status, 201, book.text);
  const rideId = book.body.data.ride._id;
  await t.acceptRide(rideId, driverId);
  for (const status of ['arriving', 'started', 'arrived']) {
    const step = await t.patchRideStatus(rideId, { token: driverToken, body: { status } });
    assert.equal(step.status, 200, step.text);
  }
  const done = await t.patchRideStatus(rideId, { token: driverToken, body: { status: 'completed', paymentMethod: 'cash', cashReceived: true } });
  assert.equal(done.status, 200, done.text);
  return rideId;
};

const walletOf = async (userId) => (await t.m.UserWallet.findOne({ userId }).lean())?.balance ?? 0;
const hashed = (token) => attribution.hashAttributionToken(token);

// ---- referral info and link -------------------------------------------------------------------------------------------

test('GET /users/referrals/me returns the code and a link built from REFERRAL_BASE_URL', async () => {
  const rider = await t.factories.user();
  const res = await t.api('GET', '/users/referrals/me', { token: rider.token });
  assert.equal(res.status, 200, res.text);
  const { referralCode, referralLink } = res.body.data;
  assert.match(referralCode, /^USR/);
  assert.equal(referralLink, `${BASE}/r/${referralCode}`);

  const again = await t.api('GET', '/users/referrals/me', { token: rider.token });
  assert.equal(again.body.data.referralCode, referralCode, 'the code is stable');
});

test('GET /drivers/referrals/me returns a DRV code and link', async () => {
  const driver = await t.factories.driver();
  const res = await t.api('GET', '/drivers/referrals/me', { token: driver.token });
  assert.equal(res.status, 200, res.text);
  assert.match(res.body.data.referralCode, /^DRV/);
  assert.equal(res.body.data.referralLink, `${BASE}/r/${res.body.data.referralCode}`);
});

test('referral endpoints need the right login', async () => {
  assert.equal((await t.api('GET', '/users/referrals/me')).status, 401);
  const driver = await t.factories.driver();
  assert.equal((await t.api('GET', '/users/referrals/me', { token: driver.token })).status, 403);
});

// ---- attribution: opening the link ----------------------------------------------------------------------------------

test('valid user link: a token is issued, only its hash is stored, and no money moves', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  await t.factories.wallet(referrer.user._id, 10);

  const opened = await openLink(referrer.code);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.data.referralType, 'user');
  assert.ok(opened.token && opened.token.length >= 32);

  const row = await Attribution.findOne({ tokenHash: hashed(opened.token) }).lean();
  assert.ok(row, 'stored by hash');
  assert.equal(row.status, 'CLICKED');
  assert.equal(String(row.referrerId), String(referrer.user._id));
  assert.ok(!JSON.stringify(row).includes(opened.token), 'the raw token is not stored');
  assert.equal(await walletOf(referrer.user._id), 10, 'a click pays nothing');
  assert.equal(await Reward.countDocuments({}), await Reward.countDocuments({ status: 'CREDITED' }));
});

test('valid driver link', async () => {
  await setProgram('driver', {});
  const referrer = await makeDriver();
  const opened = await openLink(referrer.code);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.data.referralType, 'driver');
});

test('invalid referral code: 404 invalid_referral', async () => {
  const res = await asJson('/r/USRDOESNOTEXIST?format=json');
  assert.equal(res.status, 404);
  assert.equal(res.body.details.code, 'invalid_referral');
});

test('referrer that is deleted: referrer_not_found', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  await t.m.User.updateOne({ _id: referrer.user._id }, { $set: { deletedAt: new Date() } });
  const res = await asJson(`/r/${referrer.code}?format=json`);
  assert.equal(res.status, 404);
  assert.equal(res.body.details.code, 'referrer_not_found');
});

test('program switched off: referral_disabled and no attribution is created', async () => {
  await setProgram('user', { enabled: false });
  const referrer = await makeUser();
  const before = await Attribution.countDocuments({ referrerId: referrer.user._id });
  const res = await asJson(`/r/${referrer.code}?format=json`);
  assert.equal(res.status, 403);
  assert.equal(res.body.details.code, 'referral_disabled');
  assert.equal(await Attribution.countDocuments({ referrerId: referrer.user._id }), before);
  await setProgram('user', {});
});

test('a browser is redirected: Play Store gets referrer=, other pages get attribution_token=', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();

  const android = await fetch(`${t.baseUrl}/r/${referrer.code}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/120', Accept: 'text/html' },
  });
  assert.equal(android.status, 302);
  const androidTarget = new URL(android.headers.get('location'));
  assert.equal(androidTarget.hostname, 'play.google.com');
  const referrerParam = androidTarget.searchParams.get('referrer');
  assert.match(referrerParam, /^attribution_token=/);
  const token = referrerParam.replace('attribution_token=', '');
  assert.ok(await Attribution.exists({ tokenHash: hashed(token) }));

  const desktop = await fetch(`${t.baseUrl}/r/${referrer.code}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', Accept: 'text/html' },
  });
  assert.equal(desktop.status, 302);
  const desktopTarget = new URL(desktop.headers.get('location'));
  assert.equal(desktopTarget.origin + desktopTarget.pathname, LANDING);
  assert.ok(desktopTarget.searchParams.get('attribution_token'));
});

test('link-preview bots are sent on without creating an attribution', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  const res = await fetch(`${t.baseUrl}/r/${referrer.code}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'WhatsApp/2.23.20 A', Accept: 'text/html' },
  });
  assert.equal(res.status, 302);
  assert.equal(new URL(res.headers.get('location')).searchParams.get('attribution_token'), null);
  assert.equal(await Attribution.countDocuments({ referrerId: referrer.user._id }), 0);
});

test('a bad link still lands the visitor on the app page, without a token', async () => {
  const res = await fetch(`${t.baseUrl}/r/NOSUCHCODE1`, { redirect: 'manual', headers: { Accept: 'text/html' } });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), LANDING);
});

// ---- attribution: the app claims the token ----------------------------------------------------------------------------

test('POST /referrals/attribute: valid token becomes pending, is idempotent, and shows no private details', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);

  const first = await t.api('POST', '/referrals/attribute', { body: { attributionToken: token } });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.data.status, 'pending');
  assert.equal(first.body.data.referralType, 'user');
  assert.equal(first.body.data.referrerId, String(referrer.user._id));
  assert.ok(!('name' in first.body.data) && !('phone' in first.body.data));

  const second = await t.api('POST', '/referrals/attribute', { body: { attributionToken: token } });
  assert.equal(second.status, 200);
  assert.equal(second.body.data.status, 'pending');
});

test('POST /referrals/attribute: unknown token 404, expired token 410 and marked EXPIRED', async () => {
  const unknown = await t.api('POST', '/referrals/attribute', { body: { attributionToken: 'nope' } });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.details.code, 'invalid_attribution');

  await setProgram('user', {});
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  await Attribution.updateOne({ tokenHash: hashed(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  const expired = await t.api('POST', '/referrals/attribute', { body: { attributionToken: token } });
  assert.equal(expired.status, 410);
  assert.equal(expired.body.details.code, 'attribution_expired');
  assert.equal((await Attribution.findOne({ tokenHash: hashed(token) }).lean()).status, 'EXPIRED');
});

// ---- signup with a token -------------------------------------------------------------------------------------------------

test('signup with a token: referredBy is set automatically, the click is CONVERTED, and nothing is paid at signup', async () => {
  await setProgram('user', { type: 'instant_referrer_new', amount: 50 });
  const referrer = await makeUser();
  const startBalance = await walletOf(referrer.user._id);
  const { token } = await openLink(referrer.code);

  const res = await signup({ token });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body.data.referral, { applied: true, reason: '' });

  const created = await t.m.User.findOne({ phone: res.phone }).lean();
  assert.equal(String(created.referredBy), String(referrer.user._id));
  assert.equal((await t.m.User.findById(referrer.user._id).lean()).referralCount, 1);

  const row = await Attribution.findOne({ tokenHash: hashed(token) }).lean();
  assert.equal(row.status, 'CONVERTED');
  assert.equal(String(row.referredUserId), String(created._id));

  assert.equal(await walletOf(referrer.user._id), startBalance, 'no reward at signup');
  assert.equal(await walletOf(created._id), 0);
  assert.equal(await Reward.countDocuments({ referrerId: referrer.user._id }), 0);

  // the first completed ride pays both (instant_referrer_new)
  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), startBalance + 50);
  assert.equal(await walletOf(created._id), 50);
  assert.equal(await Reward.countDocuments({ referrerId: referrer.user._id, status: 'CREDITED' }), 2);

  // a second ride pays nothing more
  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), startBalance + 50);
  assert.equal(await walletOf(created._id), 50);
});

test('instant_referrer pays only the referrer, on the first completed ride', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 30 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  const res = await signup({ token });
  const created = await t.m.User.findOne({ phone: res.phone }).lean();
  assert.equal(await walletOf(referrer.user._id), 0, 'nothing at signup');
  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), 30);
  assert.equal(await walletOf(created._id), 0);
});

test('every program type pays nothing at signup', async () => {
  await setProgram('user', { type: 'conditional_referrer_new', amount: 40, ride_count: 1 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  const res = await signup({ token });
  assert.equal(res.status, 201, res.text);
  assert.equal(await walletOf(referrer.user._id), 0);
  assert.equal(await Reward.countDocuments({ referrerId: referrer.user._id }), 0);
});

test('legacy referralCode still works', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 20 });
  const referrer = await makeUser();
  const res = await signup({ code: referrer.code });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.data.referral.applied, true);
  const created = await t.m.User.findOne({ phone: res.phone }).lean();
  assert.equal(String(created.referredBy), String(referrer.user._id));
  assert.equal(await walletOf(referrer.user._id), 0, 'nothing at signup');
  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), 20);
});

test('legacy: an unknown code is still a 400', async () => {
  const res = await signup({ code: 'USRNOPE0000' });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'Invalid referral code');
});

test('token and a matching code together are fine; a mismatching code is rejected and the token stays usable', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 10 });
  const referrer = await makeUser();
  const other = await makeUser();

  const { token } = await openLink(referrer.code);
  const mismatch = await signup({ token, code: other.code });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.details.code, 'referral_mismatch');
  assert.equal((await Attribution.findOne({ tokenHash: hashed(token) }).lean()).status, 'CLICKED');
  assert.equal(await t.m.User.countDocuments({ phone: mismatch.phone }), 0, 'no account was created');

  const match = await signup({ token, code: referrer.code });
  assert.equal(match.status, 201, match.text);
  assert.equal(match.body.data.referral.applied, true);
});

test('an invalid token does not block the signup; the app is told why', async () => {
  const res = await signup({ token: 'not-a-real-token' });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body.data.referral, { applied: false, reason: 'invalid_attribution' });
  const created = await t.m.User.findOne({ phone: res.phone }).lean();
  assert.equal(created.referredBy, null);
});

test('an expired token does not block the signup and gives no referral', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  await Attribution.updateOne({ tokenHash: hashed(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

  const res = await signup({ token });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body.data.referral, { applied: false, reason: 'attribution_expired' });
  assert.equal((await t.m.User.findById(referrer.user._id).lean()).referralCount ?? 0, 0);
  assert.equal(await walletOf(referrer.user._id), 0);
});

test('a token can become only one account (second signup is told already_attributed)', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 25 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);

  const first = await signup({ token });
  const second = await signup({ token });
  assert.equal(first.body.data.referral.applied, true);
  assert.equal(second.status, 201);
  assert.deepEqual(second.body.data.referral, { applied: false, reason: 'already_attributed' });
  assert.equal((await t.m.User.findById(referrer.user._id).lean()).referralCount, 1);
  const created = await t.m.User.findOne({ phone: first.phone }).lean();
  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), 25, 'paid once');
});

test('ten signups racing for one token: exactly one wins', async () => {
  const referrer = await makeUser();
  await setProgram('user', {});
  const { token } = await openLink(referrer.code);
  const row = await Attribution.findOne({ tokenHash: hashed(token) });

  const results = await Promise.all(
    Array.from({ length: 10 }, () => attribution.claimAttributionForConversion(row, { referredPhone: newPhone() })),
  );
  assert.equal(results.filter(Boolean).length, 1);
});

test('an existing user cannot sign up again or be attributed', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  const existing = await t.factories.user({ phone: newPhone() });
  const { token } = await openLink(referrer.code);

  assert.equal((await t.api('POST', '/users/auth/send-otp', { body: { phone: existing.user.phone } })).status, 201);
  await t.api('POST', '/users/auth/verify-otp', { body: { phone: existing.user.phone, otp: '1234' } });
  const res = await t.api('POST', '/users/signup', {
    body: { name: 'Again', phone: existing.user.phone, email: 'again@example.com', attributionToken: token },
  });
  // an existing account logs in at the OTP step, so its signup session is gone: it can never reach attribution
  assert.ok([404, 409].includes(res.status), res.text);
  assert.equal((await t.m.User.findById(existing.user._id).lean()).referredBy ?? null, null);
  assert.equal((await Attribution.findOne({ tokenHash: hashed(token) }).lean()).status, 'CLICKED');
});

test('a restored account that already had a referrer keeps it', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 15 });
  const first = await makeUser();
  const second = await makeUser();
  const phone = newPhone();
  const old = await t.factories.user({ phone, referredBy: first.user._id, deletedAt: new Date() });

  const { token } = await openLink(second.code);
  const res = await signup({ phone, token });
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body.data.referral, { applied: false, reason: 'already_attributed' });
  assert.equal(String((await t.m.User.findById(old.user._id).lean()).referredBy), String(first.user._id));
  assert.equal(await walletOf(second.user._id), 0);
});

test('self-referral is blocked (same phone as the referrer)', async () => {
  await setProgram('user', {});
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);

  const viaToken = await attribution.resolveReferralForSignup({
    attributionToken: token,
    flow: 'user',
    referredPhone: referrer.user.phone,
  });
  assert.deepEqual([viaToken.applied, viaToken.reason], [false, 'self_referral']);

  await assert.rejects(
    attribution.resolveReferralForSignup({ referralCode: referrer.code, flow: 'user', referredAccountId: referrer.user._id }),
    (error) => error.details?.code === 'self_referral',
  );
});

test('a driver link cannot be used for a rider signup', async () => {
  await setProgram('driver', {});
  const referrer = await makeDriver();
  const { token } = await openLink(referrer.code);
  const res = await signup({ token });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.data.referral, { applied: false, reason: 'referral_type_mismatch' });
});

test('referral history shows the referred person with a masked phone and the reward', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 12 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  const res = await signup({ token, name: 'Asha Verma' });

  const history = await t.api('GET', '/users/referrals/history', { token: referrer.token });
  assert.equal(history.status, 200, history.text);
  assert.equal(history.body.data.total, 1);
  const item = history.body.data.items[0];
  assert.equal(item.name, 'Asha');
  assert.equal(item.phone, `XXXXXX${res.phone.slice(-4)}`);
  assert.equal(item.reward.status, 'pending', 'waiting for the first ride');

  await completeRideAsRider((await t.m.User.findOne({ phone: res.phone }).lean())._id);
  const after = (await t.api('GET', '/users/referrals/history', { token: referrer.token })).body.data.items[0];
  assert.equal(after.reward.status, 'credited');
  assert.equal(after.reward.amount, 12);
});

test('a referral already paid at signup (before this rule) is not paid again on the first ride', async () => {
  await setProgram('user', { type: 'instant_referrer', amount: 18 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  const res = await signup({ token });
  const created = await t.m.User.findOne({ phone: res.phone }).lean();

  // what the old signup reward left behind
  await t.m.UserWallet.collection.updateOne(
    { userId: referrer.user._id },
    {
      $set: { balance: 18, refundWallet: 0, heldBalance: 0 },
      $push: { transactions: { kind: 'credit', amount: 18, title: 'old', referenceKey: `user-referral:signup:${created._id}:referrer` } },
    },
    { upsert: true },
  );

  await completeRideAsRider(created._id);
  assert.equal(await walletOf(referrer.user._id), 18, 'no second payment');
  assert.ok((await t.m.User.findById(created._id).lean()).referralRewardGrantedAt, 'marked as done');
});

// ---- the reward ledger (idempotency, concurrency, retry) -----------------------------------------------------------------

test('ten concurrent payout requests for one key: one credit, nine "existing"', async () => {
  const payee = await t.factories.user();
  await t.factories.wallet(payee.user._id, 0);
  const referenceKey = `user-referral:completed:${new mongoose.Types.ObjectId()}:1:referrer`;

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      rewards.creditReferralReward({ payeeType: 'user', payeeId: payee.user._id, amount: 40, title: 'Race', referenceKey }),
    ),
  );

  assert.equal(results.filter((r) => r === 'credited').length, 1, JSON.stringify(results));
  assert.equal(results.filter((r) => r === 'existing').length, 9, JSON.stringify(results));
  assert.equal(await walletOf(payee.user._id), 40);
  assert.equal(await Reward.countDocuments({ referenceKey }), 1);
  const wallet = await t.m.UserWallet.findOne({ userId: payee.user._id }).lean();
  assert.equal(wallet.transactions.filter((tx) => tx.referenceKey === referenceKey).length, 1);
});

test('the same concurrency for a driver wallet: one credit and one ledger row', async () => {
  const payee = await t.factories.driver();
  const before = (await t.m.Driver.findById(payee.driver._id).lean()).wallet.balance;
  const referenceKey = `driver-referral:completed:${new mongoose.Types.ObjectId()}:1:referrer`;

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      rewards.creditReferralReward({ payeeType: 'driver', payeeId: payee.driver._id, amount: 75, title: 'Race', referenceKey }),
    ),
  );

  assert.equal(results.filter((r) => r === 'credited').length, 1, JSON.stringify(results));
  assert.equal((await t.m.Driver.findById(payee.driver._id).lean()).wallet.balance, before + 75);
  assert.equal(await t.m.WalletTransaction.countDocuments({ driverId: payee.driver._id, 'metadata.referenceKey': referenceKey }), 1);
  assert.equal(await Reward.countDocuments({ referenceKey }), 1);
});

test('repeating a finished payout (duplicate ride-completion event) pays nothing', async () => {
  const payee = await t.factories.user();
  const referenceKey = `user-referral:completed:${new mongoose.Types.ObjectId()}:1:referrer`;
  const args = { payeeType: 'user', payeeId: payee.user._id, amount: 20, title: 'Once', referenceKey };

  assert.equal(await rewards.creditReferralReward(args), 'credited');
  assert.equal(await rewards.creditReferralReward(args), 'existing');
  assert.equal(await rewards.creditReferralReward(args), 'existing');
  assert.equal(await walletOf(payee.user._id), 20);
});

test('a payout made before the ledger existed is recognised, not paid again', async () => {
  const payee = await t.factories.user();
  const referenceKey = `user-referral:signup:${new mongoose.Types.ObjectId()}:referrer`;
  await t.m.UserWallet.collection.updateOne(
    { userId: payee.user._id },
    { $set: { balance: 60, refundWallet: 0, heldBalance: 0, transactions: [{ kind: 'credit', amount: 60, title: 'old', referenceKey }] } },
    { upsert: true },
  );

  assert.equal(await rewards.creditReferralReward({ payeeType: 'user', payeeId: payee.user._id, amount: 60, referenceKey }), 'existing');
  assert.equal(await walletOf(payee.user._id), 60);
  const row = await Reward.findOne({ referenceKey }).lean();
  assert.equal(row.status, 'CREDITED');
  assert.equal(row.legacy, true);
});

test('a failed payout is kept, reported as failed, and paid exactly once by the retry', async () => {
  const driverId = new mongoose.Types.ObjectId();
  const referenceKey = `driver-referral:signup:${new mongoose.Types.ObjectId()}:referrer`;

  // the driver does not exist yet, so the wallet credit fails
  const failed = await rewards.creditReferralReward({ payeeType: 'driver', payeeId: driverId, amount: 90, title: 'Retry', referenceKey });
  assert.equal(failed, 'failed');
  const row = await Reward.findOne({ referenceKey }).lean();
  assert.equal(row.status, 'FAILED');
  assert.match(row.lastError, /not found/i);

  await t.factories.driver({ _id: driverId, wallet: { balance: 100, cashLimit: 500, isBlocked: false } });

  const summary = await rewards.retryPendingReferralRewards();
  assert.ok(summary.credited >= 1, JSON.stringify(summary));
  assert.equal((await t.m.Driver.findById(driverId).lean()).wallet.balance, 190);
  assert.equal((await Reward.findOne({ referenceKey }).lean()).status, 'CREDITED');

  await rewards.retryPendingReferralRewards();
  assert.equal((await t.m.Driver.findById(driverId).lean()).wallet.balance, 190, 'retrying again pays nothing more');
});

test('a payout stuck in PROCESSING by a crashed request is taken over once, not paid twice', async () => {
  const payee = await t.factories.user();
  const referenceKey = `user-referral:signup:${new mongoose.Types.ObjectId()}:new-user`;
  await Reward.create({
    referenceKey,
    payeeType: 'user',
    payeeId: payee.user._id,
    amount: 33,
    status: 'PROCESSING',
    lockedAt: new Date(Date.now() - 10 * 60 * 1000),
  });

  const summary = await rewards.retryPendingReferralRewards();
  assert.ok(summary.credited >= 1, JSON.stringify(summary));
  assert.equal(await walletOf(payee.user._id), 33);
  await rewards.retryPendingReferralRewards();
  assert.equal(await walletOf(payee.user._id), 33);
});

test('a payout another request is still working on is left alone', async () => {
  const payee = await t.factories.user();
  const referenceKey = `user-referral:signup:${new mongoose.Types.ObjectId()}:referrer`;
  await Reward.create({
    referenceKey,
    payeeType: 'user',
    payeeId: payee.user._id,
    amount: 44,
    status: 'PROCESSING',
    lockedAt: new Date(),
  });
  assert.equal(await rewards.creditReferralReward({ payeeType: 'user', payeeId: payee.user._id, amount: 44, referenceKey }), 'existing');
  assert.equal(await walletOf(payee.user._id), 0);
});

// ---- conditional reward through a real ride -------------------------------------------------------------------------------

test('conditional_referrer_new: the reward is paid when the referred rider completes the required rides, and only once', async () => {
  await setProgram('user', { type: 'conditional_referrer_new', amount: 60, ride_count: 1 });
  const referrer = await makeUser();
  const { token } = await openLink(referrer.code);
  const signedUp = await signup({ token });
  assert.equal(signedUp.status, 201, signedUp.text);

  const rider = await t.m.User.findOne({ phone: signedUp.phone }).lean();
  assert.equal(await walletOf(referrer.user._id), 0, 'nothing before the ride');

  await completeRideAsRider(rider._id);

  assert.equal(await walletOf(referrer.user._id), 60);
  assert.equal(await walletOf(rider._id), 60);
  assert.ok((await t.m.User.findById(rider._id).lean()).referralRewardGrantedAt, 'marked as rewarded');
  assert.equal(await Reward.countDocuments({ referrerId: referrer.user._id, status: 'CREDITED' }), 2);
});

// ---- uniqueness ------------------------------------------------------------------------------------------------------------

test('two users cannot share a referral code (unique index), empty codes are fine', async () => {
  const code = `USRUNIQ${Date.now()}`;
  await t.factories.user({ phone: newPhone(), referralCode: code });
  await assert.rejects(t.factories.user({ phone: newPhone(), referralCode: code }), (error) => error.code === 11000);
  await t.factories.user({ phone: newPhone() });
  await t.factories.user({ phone: newPhone() });
});

test('two drivers cannot share a referral code (unique index)', async () => {
  const code = `DRVUNIQ${Date.now()}`;
  await t.factories.driver({ referralCode: code });
  await assert.rejects(t.factories.driver({ referralCode: code }), (error) => error.code === 11000);
});

test('ensureReferralCode avoids a code that is already taken', async () => {
  const taken = `USRTAKEN${Date.now()}`;
  await t.factories.user({ phone: newPhone(), referralCode: taken });
  const fresh = await t.factories.user({ phone: newPhone() });

  const code = await attribution.ensureReferralCode('user', fresh.user, taken);
  assert.notEqual(code, taken);
  assert.ok(code.startsWith(taken));
  assert.equal((await t.m.User.findById(fresh.user._id).lean()).referralCode, code);
});

// ---- admin settings and the public settings ----------------------------------------------------------------------------------

test('admin settings: unsupported reward types and program names are rejected, supported ones saved', async () => {
  const admin = await t.factories.admin();
  const bad = await t.api('PATCH', '/admin/referrals/settings/user', {
    token: admin.token,
    body: { enabled: true, type: 'whatever', amount: 10 },
  });
  assert.equal(bad.status, 400, bad.text);

  const badProgram = await t.api('PATCH', '/admin/referrals/settings/owner', {
    token: admin.token,
    body: { enabled: true, type: 'instant_referrer', amount: 10 },
  });
  assert.equal(badProgram.status, 400, badProgram.text);

  for (const type of ['instant_referrer', 'instant_referrer_new', 'conditional_referrer', 'conditional_referrer_new']) {
    const ok = await t.api('PATCH', '/admin/referrals/settings/user', {
      token: admin.token,
      body: { enabled: true, type, amount: 10, ride_count: 2 },
    });
    assert.equal(ok.status, 200, `${type}: ${ok.text}`);
  }
});

test('public referral settings hide the driver milestone and reward-feature setup', async () => {
  const admin = await t.factories.admin();
  const saved = await t.api('PATCH', '/admin/referrals/settings/driver', {
    token: admin.token,
    body: {
      enabled: true,
      type: 'instant_referrer',
      amount: 70,
      milestone_program_enabled: true,
      milestone_programs: [{ name: 'Secret bonus', payout_amount: 999, required_weeks: 2 }],
      reward_features: [{ label: 'Peak hours', reward_amount: 111, enabled: true }],
    },
  });
  assert.equal(saved.status, 200, saved.text);

  const pub = await asJson('/api/v1/common/referrals/settings?type=driver');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.amount, 70);
  assert.equal(pub.body.data.enabled, true);
  assert.ok(!('milestone_programs' in pub.body.data));
  assert.ok(!('reward_features' in pub.body.data));

  const both = await asJson('/api/v1/common/referrals/settings');
  assert.ok(both.body.data.user && both.body.data.driver);

  // the admin still sees everything
  const adminView = await t.api('GET', '/admin/referrals/settings/driver', { token: admin.token });
  assert.equal(adminView.body.data.milestone_programs.length, 1);
});

// ---- drivers ---------------------------------------------------------------------------------------------------------------------

const seedRegistration = async ({ name = 'Dev Driver' } = {}) => {
  const vehicle = await t.factories.vehicle();
  const location = await t.mongoose.model('TaxiServiceLocation').create({
    name: 'Indore',
    service_location_name: 'Indore',
    latitude: 22.7196,
    longitude: 75.8577,
    location: { type: 'Point', coordinates: [75.8577, 22.7196] },
  });
  const phone = newPhone();
  const registrationId = `reg-${phone}`;
  await t.mongoose.model('TaxiDriverRegistrationSession').create({
    registrationId,
    phone,
    role: 'driver',
    otpHash: 'x',
    otpExpiresAt: new Date(Date.now() + 3600e3),
    expiresAt: new Date(Date.now() + 3600e3),
    otpVerifiedAt: new Date(),
    personal: { fullName: name, email: `d${phone}@example.com`, gender: 'male', passwordHash: 'hashed-password' },
    vehicle: {
      locationName: 'Indore',
      locationId: String(location._id),
      vehicleTypeId: String(vehicle._id),
      registerFor: 'taxi',
      number: `MP09AB${String(1000 + counter)}`,
    },
    documents: {},
  });
  return { phone, registrationId };
};

test('driver onboarding with a link: bound at the referral step, converted at completion, rewarded on the first ride', async () => {
  await setProgram('driver', { type: 'instant_referrer_new', amount: 80 });
  const referrer = await makeDriver();
  const { token } = await openLink(referrer.code);
  const { phone, registrationId } = await seedRegistration();

  const saved = await t.api('PATCH', '/drivers/onboarding/referral', { body: { registrationId, phone, attributionToken: token } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.data.referralCode, referrer.code);
  assert.equal((await Attribution.findOne({ tokenHash: hashed(token) }).lean()).status, 'ATTRIBUTED');

  const before = (await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance;
  const done = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.equal(done.status, 201, done.text);

  const created = await t.m.Driver.findOne({ phone }).lean();
  assert.equal(String(created.referredBy), String(referrer.driver._id));
  assert.match(created.referralCode, /^DRV/);
  const refreshed = await t.m.Driver.findById(referrer.driver._id).lean();
  assert.equal(refreshed.referralCount, 1);
  assert.equal(refreshed.wallet.balance, before, 'no reward at signup');
  assert.equal(created.wallet.balance ?? 0, 0);

  const row = await Attribution.findOne({ tokenHash: hashed(token) }).lean();
  assert.equal(row.status, 'CONVERTED');
  assert.equal(String(row.referredDriverId), String(created._id));

  await completeRideAsDriver(created._id);
  assert.equal((await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance, before + 80);
  assert.equal(
    await t.m.WalletTransaction.countDocuments({ driverId: created._id, 'metadata.source': 'driver_referral' }),
    1,
    'the new driver gets their share too (instant_referrer_new)',
  );
});

test('driver onboarding: a token already used, expired, invalid or for riders is refused at the referral step', async () => {
  await setProgram('driver', {});
  const referrer = await makeDriver();
  const first = await seedRegistration();
  const { token } = await openLink(referrer.code);
  assert.equal(
    (await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...first, attributionToken: token } })).status,
    200,
  );
  assert.equal((await t.api('POST', '/drivers/onboarding/complete', { body: first })).status, 201);

  const second = await seedRegistration();
  const used = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...second, attributionToken: token } });
  assert.equal(used.status, 409);
  assert.equal(used.body.details.code, 'already_attributed');

  const invalid = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...second, attributionToken: 'bogus' } });
  assert.equal(invalid.status, 404);

  const expiredToken = (await openLink(referrer.code)).token;
  await Attribution.updateOne({ tokenHash: hashed(expiredToken) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...second, attributionToken: expiredToken } });
  assert.equal(expired.status, 410);

  await setProgram('user', {});
  const riderReferrer = await makeUser();
  const riderToken = (await openLink(riderReferrer.code)).token;
  const wrongType = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...second, attributionToken: riderToken } });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.details.code, 'referral_type_mismatch');
});

test('driver onboarding: the legacy typed code still works, and an unknown one is a 400', async () => {
  await setProgram('driver', { type: 'instant_referrer', amount: 35 });
  const referrer = await makeDriver();
  const reg = await seedRegistration();

  const bad = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...reg, referralCode: 'DRVNOPE' } });
  assert.equal(bad.status, 400);

  const good = await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...reg, referralCode: referrer.code } });
  assert.equal(good.status, 200, good.text);
  const before = (await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance;
  assert.equal((await t.api('POST', '/drivers/onboarding/complete', { body: reg })).status, 201);
  const created = await t.m.Driver.findOne({ phone: reg.phone }).lean();
  assert.equal(String(created.referredBy), String(referrer.driver._id));
  assert.equal((await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance, before, 'nothing at signup');
  await completeRideAsDriver(created._id);
  assert.equal((await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance, before + 35);
});

test('driver onboarding: switching to another link frees the first one', async () => {
  await setProgram('driver', {});
  const a = await makeDriver();
  const b = await makeDriver();
  const reg = await seedRegistration();
  const tokenA = (await openLink(a.code)).token;
  const tokenB = (await openLink(b.code)).token;

  await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...reg, attributionToken: tokenA } });
  await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...reg, attributionToken: tokenB } });

  assert.equal((await Attribution.findOne({ tokenHash: hashed(tokenA) }).lean()).status, 'PENDING');
  assert.equal((await Attribution.findOne({ tokenHash: hashed(tokenB) }).lean()).status, 'ATTRIBUTED');

  assert.equal((await t.api('POST', '/drivers/onboarding/complete', { body: reg })).status, 201);
  assert.equal(String((await t.m.Driver.findOne({ phone: reg.phone }).lean()).referredBy), String(b.driver._id));
});

test('driver conditional reward: paid to the referring driver after the required completed rides, once', async () => {
  await setProgram('driver', { type: 'conditional_referrer', amount: 55, ride_count: 1 });
  const referrer = await makeDriver();
  const { token } = await openLink(referrer.code);
  const reg = await seedRegistration();
  await t.api('PATCH', '/drivers/onboarding/referral', { body: { ...reg, attributionToken: token } });
  assert.equal((await t.api('POST', '/drivers/onboarding/complete', { body: reg })).status, 201);

  const before = (await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance;
  assert.equal(before, 2000, 'conditional: nothing at signup');

  // the new driver is approved and completes a ride
  const newDriver = await t.m.Driver.findOne({ phone: reg.phone });
  const vehicle = await t.factories.vehicle();
  await t.m.Driver.updateOne(
    { _id: newDriver._id },
    {
      $set: {
        approve: true,
        status: 'approved',
        isOnline: true,
        isOnRide: false,
        vehicleTypeId: vehicle._id,
        location: { type: 'Point', coordinates: t.locations.pickup },
        'wallet.balance': 2000,
        'wallet.cashLimit': 500,
        'wallet.isBlocked': false,
      },
    },
  );
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 0);
  const book = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(book.status, 201, book.text);
  const rideId = book.body.data.ride._id;
  await t.acceptRide(rideId, newDriver._id);
  const driverToken = t.tokenFor(newDriver._id, 'driver');
  for (const status of ['arriving', 'started', 'arrived']) {
    assert.equal((await t.patchRideStatus(rideId, { token: driverToken, body: { status } })).status, 200);
  }
  const done = await t.patchRideStatus(rideId, { token: driverToken, body: { status: 'completed', paymentMethod: 'cash', cashReceived: true } });
  assert.equal(done.status, 200, done.text);

  assert.equal((await t.m.Driver.findById(referrer.driver._id).lean()).wallet.balance, before + 55);
  assert.equal(await Reward.countDocuments({ referrerId: referrer.driver._id, status: 'CREDITED' }), 1);
});
