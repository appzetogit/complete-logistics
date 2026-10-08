// node --test src/modules/taxi/services/pushNotificationService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

// env.js validates on import, so set the minimum first.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret';

const { buildMulticastMessage } = await import('./pushNotificationService.js');

test('normal push: notification block + data, high priority', () => {
  const message = buildMulticastMessage({
    tokens: ['t1'],
    title: 'Ride accepted',
    body: 'Asha accepted your request.',
    data: { type: 'ride_accepted', rideId: 'r1' },
  });

  assert.deepEqual(message.notification, { title: 'Ride accepted', body: 'Asha accepted your request.' });
  assert.equal(message.android.priority, 'high');
  assert.equal(message.android.notification, undefined);
  assert.equal(message.apns, undefined);
  assert.equal(message.data.type, 'ride_accepted');
  assert.equal(message.data.click_action, 'FLUTTER_NOTIFICATION_CLICK');
  assert.equal(message.data.title, undefined, 'text is not duplicated into data for normal pushes');
});

test('data-only ride request: no notification anywhere on Android, text in data, ttl + collapse key, iOS alert via apns', () => {
  const message = buildMulticastMessage({
    tokens: ['t1', 't2'],
    title: 'New ride request',
    body: 'Pickup: MG Road',
    dataOnly: true,
    collapseKey: 'ride_abc',
    ttlMs: 60_000,
    data: { type: 'ride_request', rideId: 'abc', serviceType: 'ride', userId: 'u1', attempt: 2 },
  });

  assert.equal(message.notification, undefined, 'no top-level notification block');
  assert.equal(message.android.notification, undefined, 'no android.notification either');
  assert.equal(message.android.priority, 'high');
  assert.equal(message.android.ttl, 60_000);
  assert.equal(message.android.collapseKey, 'ride_abc');

  assert.equal(message.data.type, 'ride_request');
  assert.equal(message.data.title, 'New ride request');
  assert.equal(message.data.body, 'Pickup: MG Road');
  for (const value of Object.values(message.data)) {
    assert.equal(typeof value, 'string', 'every data value is a string');
  }

  assert.equal(message.apns.headers['apns-priority'], '10');
  assert.equal(message.apns.headers['apns-push-type'], 'alert');
  assert.equal(message.apns.headers['apns-collapse-id'], 'ride_abc');
  assert.ok(Number(message.apns.headers['apns-expiration']) > Date.now() / 1000);
  assert.deepEqual(message.apns.payload.aps.alert, { title: 'New ride request', body: 'Pickup: MG Road' });
  assert.equal(message.apns.payload.aps.sound, 'default');
  assert.deepEqual(message.tokens, ['t1', 't2']);
});

test('data-only ignores an image for Android (an image would need a notification block)', () => {
  const message = buildMulticastMessage({ title: 'x', body: 'y', image: 'https://e.com/a.png', dataOnly: true });
  assert.equal(message.android.notification, undefined);
  assert.equal(message.notification, undefined);
});
