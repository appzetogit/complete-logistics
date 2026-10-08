// Real-database tests: "push notification is not coming" must be diagnosable in one call.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
let env;
before(async () => {
  t = await bootstrap();
  admin = await t.factories.admin();
  ({ env } = await import('../../src/config/env.js'));
});
after(async () => {
  env.firebase.serviceAccountJson = '';
  await t.stop();
});

const status = () => t.api('GET', '/admin/push/status', { token: admin.token });

test('status: with no Firebase key the server says exactly what to set, and how many devices are reachable', async () => {
  env.firebase.serviceAccountJson = '';
  const vehicle = await t.factories.vehicle();
  await t.factories.user({ fcmTokenMobile: 'u'.repeat(40) });
  await t.factories.user();
  await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'd'.repeat(40) });
  await t.factories.driver({ vehicleTypeId: vehicle._id }); // online but no device token

  const res = await status();
  assert.equal(res.status, 200, res.text);
  const data = res.body.data;
  assert.equal(data.firebase.configured, false);
  assert.match(data.firebase.reason, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.ok(data.tokens.users.total >= 2 && data.tokens.users.withToken >= 1);
  assert.ok(data.tokens.drivers.total >= 2 && data.tokens.drivers.withToken >= 1);
  assert.ok(data.tokens.onlineDrivers.total > data.tokens.onlineDrivers.withToken);
  assert.ok(data.hints.some((hint) => /FIREBASE_SERVICE_ACCOUNT_JSON/.test(hint)));
  assert.equal(JSON.stringify(data).includes('private_key'), false, 'no secret is ever returned');
});

test('status: only admins can read it', async () => {
  const rider = await t.factories.user();
  assert.equal((await t.api('GET', '/admin/push/status')).status, 401);
  assert.ok([401, 403].includes((await t.api('GET', '/admin/push/status', { token: rider.token })).status));
  assert.ok([401, 403].includes((await t.api('POST', '/admin/push/test', { token: rider.token, body: { userId: String(rider.user._id) } })).status));
});

test('test push without Firebase: reports "not sent" and why, instead of silently doing nothing', async () => {
  env.firebase.serviceAccountJson = '';
  const rider = await t.factories.user({ fcmTokenMobile: 'x'.repeat(40) });
  const res = await t.api('POST', '/admin/push/test', { token: admin.token, body: { userId: String(rider.user._id) } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.attempted, false);
  assert.match(res.body.data.reason, /FIREBASE_SERVICE_ACCOUNT_JSON/);

  const missing = await t.api('POST', '/admin/push/test', { token: admin.token, body: {} });
  assert.equal(missing.status, 400);
});

test('a key that is present but unusable is reported as such (not as "configured")', async () => {
  env.firebase.serviceAccountJson = JSON.stringify({
    project_id: 'demo-project',
    client_email: 'firebase-adminsdk@demo-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n',
  });
  const res = await status();
  assert.equal(res.body.data.firebase.configured, false);
  assert.match(res.body.data.firebase.reason, /could not start|service account/i);
  assert.equal(res.body.data.firebase.projectId, 'demo-project');
});

test('with a well-formed key Firebase is "configured"; a recipient with no device token is told so', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  env.firebase.serviceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: 'demo-project-ok',
    client_email: 'firebase-adminsdk@demo-project-ok.iam.gserviceaccount.com',
    private_key: privateKey,
  });

  const res = await status();
  assert.equal(res.body.data.firebase.configured, true, JSON.stringify(res.body.data.firebase));
  assert.equal(res.body.data.firebase.projectId, 'demo-project-ok');
  assert.equal(res.body.data.firebase.reason, '');

  const vehicle = await t.factories.vehicle();
  const noToken = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const test = await t.api('POST', '/admin/push/test', { token: admin.token, body: { driverId: String(noToken.driver._id) } });
  assert.equal(test.status, 200, test.text);
  assert.equal(test.body.data.attempted, true);
  assert.equal(test.body.data.targetCount, 0);
  assert.match(test.body.data.reason, /No saved FCM tokens/);
  assert.ok((await status()).body.data.hints.some((hint) => /device token/i.test(hint)));
});
