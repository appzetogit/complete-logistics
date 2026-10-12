// Real-database tests: the driver ride-request push goes out data-only; every other push keeps its notification.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
let sent;
let setMessaging;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  ({ setFirebaseMessagingForTests: setMessaging } = await import('../../src/config/firebase.js'));
  sent = [];
  setMessaging({
    sendEachForMulticast: async (message) => {
      sent.push(message);
      return { responses: message.tokens.map(() => ({ success: true })) };
    },
  });
});
after(async () => {
  setMessaging(null);
  await t.stop();
});

const ofType = (type) => sent.filter((message) => message.data?.type === type);

test('ride request to the driver: data-only, high priority, 60 s ttl, collapse key per ride, iOS alert kept', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'driver-token-'.padEnd(40, 'x') });
  const rider = await t.factories.user({ fcmTokenMobile: 'rider-token-'.padEnd(40, 'y') });

  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, pickupAddress: 'MG Road', fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = created.body.data.ride._id;

  const [push] = await waitFor(() => {
    const found = ofType('ride_request').filter((message) => message.data.rideId === String(rideId));
    return found.length ? found : null;
  }, { message: 'ride_request push' });

  assert.deepEqual(push.tokens, [driver.driver.fcmTokenMobile]);
  assert.equal(push.notification, undefined, 'no notification block: Android must not draw its own tray alert');
  assert.equal(push.android.notification, undefined);
  assert.equal(push.android.priority, 'high');
  assert.equal(push.android.ttl, 60_000);
  assert.equal(push.android.collapseKey, `ride_${rideId}`);
  assert.equal(push.data.title, 'New ride request');
  assert.equal(push.data.body, 'Pickup: MG Road');
  assert.equal(push.data.serviceType, 'ride');
  assert.equal(push.data.userId, String(rider.user._id));
  assert.ok(Object.values(push.data).every((value) => typeof value === 'string'));
  assert.equal(push.apns.headers['apns-push-type'], 'alert');
  assert.deepEqual(push.apns.payload.aps.alert, { title: 'New ride request', body: 'Pickup: MG Road' });

  // the user's "ride accepted" push is unchanged: it keeps its notification block
  await t.acceptRide(rideId, driver.driver._id);
  const [accepted] = await waitFor(() => {
    const found = ofType('ride_accepted').filter((message) => message.data.rideId === String(rideId));
    return found.length ? found : null;
  }, { message: 'ride_accepted push' });
  assert.equal(accepted.notification.title, 'Ride accepted');
  assert.equal(accepted.apns, undefined);
  assert.deepEqual(accepted.tokens, [rider.user.fcmTokenMobile]);
});

test('a goods delivery request is also data-only with the delivery title', async () => {
  const vehicle = await t.factories.vehicle();
  await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'driver2-token-'.padEnd(40, 'z') });
  const rider = await t.factories.user();
  await t.factories.wallet(rider.user._id, 2000);
  const booked = await t.api('POST', '/deliveries', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash', parcel: { category: 'Documents', senderName: 'S', receiverName: 'R' } },
  });
  const rideId = booked.body.data.rideId;
  assert.equal(ofType('ride_request').some((message) => message.data.rideId === rideId), false, 'no push before the advance is paid');
  await t.api('POST', '/deliveries/advance/wallet', { token: rider.token, body: { rideId } });

  const [push] = await waitFor(() => {
    const found = ofType('ride_request').filter((message) => message.data.rideId === rideId);
    return found.length ? found : null;
  }, { message: 'delivery ride_request push' });
  assert.equal(push.notification, undefined);
  assert.equal(push.data.title, 'New delivery request');
  assert.equal(push.data.serviceType, 'parcel');
});

test('admin switch ride_request_push_data_only=0 brings the normal notification block back', async () => {
  await t.setSettings('transport_ride', { ride_request_push_data_only: '0' });
  try {
    const vehicle = await t.factories.vehicle();
    await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'driver3-token-'.padEnd(40, 'w') });
    const rider = await t.factories.user();
    const created = await t.api('POST', '/rides', {
      token: rider.token,
      body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
    });
    const rideId = created.body.data.ride._id;
    const [push] = await waitFor(() => {
      const found = ofType('ride_request').filter((message) => message.data.rideId === String(rideId));
      return found.length ? found : null;
    }, { message: 'ride_request push with the switch off' });
    assert.equal(push.notification.title, 'New ride request');
    assert.equal(push.apns, undefined);
  } finally {
    await t.setSettings('transport_ride', { ride_request_push_data_only: '1' });
  }
});

test('ride request push carries what the native card shows (all strings, existing keys unchanged)', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Card Sedan' });
  await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'card-driver-token-'.padEnd(40, 'c') });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: {
      pickup: t.locations.pickup, drop: t.locations.drop, pickupAddress: 'MG Road', dropAddress: 'Vijay Nagar',
      fare: 187.5, estimatedDistanceMeters: 4321, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash',
    },
  });
  assert.equal(created.status, 201, created.text);
  const rideId = String(created.body.data.ride._id);
  const [push] = await waitFor(() => {
    const found = ofType('ride_request').filter((message) => message.data.rideId === rideId);
    return found.length ? found : null;
  }, { message: 'ride_request push' });

  const d = push.data;
  assert.equal(d.type, 'ride_request');
  assert.equal(d.userId, String(rider.user._id));
  assert.equal(d.serviceType, 'ride');
  assert.equal(d.pickupAddress, 'MG Road');
  assert.equal(d.dropAddress, 'Vijay Nagar');
  assert.equal(d.pickupLat, String(t.locations.pickup[1]));
  assert.equal(d.pickupLng, String(t.locations.pickup[0]));
  assert.equal(d.dropLat, String(t.locations.drop[1]));
  assert.equal(d.dropLng, String(t.locations.drop[0]));
  assert.equal(d.fare, String(created.body.data.ride.fare));
  assert.equal(d.paymentMethod, created.body.data.ride.paymentMethod);
  assert.equal(d.distanceKm, '4.3');
  assert.equal(d.vehicleTypeName, 'Card Sedan');
  assert.ok(!Number.isNaN(Date.parse(d.acceptanceDeadlineAt)), 'ISO deadline');
  assert.ok(Date.parse(d.acceptanceDeadlineAt) > Date.now());
  assert.ok(Number(d.acceptTimeoutSeconds) > 0);
  assert.ok(Object.values(d).every((value) => typeof value === 'string'), 'every value is a string');
});

test('missing ride values become empty strings in the push', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Blank Sedan' });
  await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'blank-driver-token-'.padEnd(40, 'b') });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  const rideId = String(created.body.data.ride._id);
  const [push] = await waitFor(() => {
    const found = ofType('ride_request').filter((message) => message.data.rideId === rideId);
    return found.length ? found : null;
  }, { message: 'ride_request push' });
  assert.equal(push.data.pickupAddress, '');
  assert.equal(push.data.dropAddress, '');
});

test('offer withdrawn: the other drivers get a silent ride_request_closed push, the accepting driver does not', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Close Sedan' });
  const a = await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'close-a-token-'.padEnd(40, 'a') });
  const b = await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'close-b-token-'.padEnd(40, 'b') });
  await t.setSettings('transport_ride', { trip_dispatch_type: '2' }); // broadcast: both drivers get the offer
  try {
    const rider = await t.factories.user();
    const created = await t.api('POST', '/rides', {
      token: rider.token,
      body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
    });
    const rideId = String(created.body.data.ride._id);
    await waitFor(async () => (await t.m.Ride.findById(rideId).lean()).dispatchTracking.notifiedDriverIds.length >= 2, { message: 'both drivers offered' });

    await t.acceptRide(rideId, a.driver._id);
    const [closed] = await waitFor(() => {
      const found = ofType('ride_request_closed').filter((message) => message.data.rideId === rideId);
      return found.length ? found : null;
    }, { message: 'ride_request_closed push' });

    assert.deepEqual(closed.tokens, [b.driver.fcmTokenMobile], 'only the driver who lost the offer');
    assert.equal(closed.notification, undefined);
    assert.equal(closed.android.notification, undefined);
    assert.equal(closed.android.priority, 'high');
    assert.equal(closed.android.collapseKey, `ride_${rideId}`, 'replaces the offer push');
    assert.equal(closed.android.ttl, 60_000);
    assert.equal(closed.webpush, undefined);
    assert.equal(closed.apns.headers['apns-push-type'], 'background');
    assert.equal(closed.data.reason, 'accepted-by-another-driver');
    assert.equal(closed.data.title, undefined, 'nothing to show');
  } finally {
    await t.setSettings('transport_ride', { trip_dispatch_type: '1' });
  }
});

test('offer withdrawn because the rider cancelled: every offered driver gets the close push', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Cancel Sedan' });
  const a = await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'cancel-a-token-'.padEnd(40, 'a') });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  const rideId = String(created.body.data.ride._id);
  await waitFor(async () => (await t.m.Ride.findById(rideId).lean()).dispatchTracking.notifiedDriverIds.length >= 1, { message: 'driver offered' });

  const cancel = await t.api('PATCH', `/rides/${rideId}/cancel`, { token: rider.token });
  assert.equal(cancel.status, 200, cancel.text);
  const [closed] = await waitFor(() => {
    const found = ofType('ride_request_closed').filter((message) => message.data.rideId === rideId);
    return found.length ? found : null;
  }, { message: 'close push after rider cancel' });
  assert.deepEqual(closed.tokens, [a.driver.fcmTokenMobile]);
  assert.equal(closed.data.reason, 'user-cancelled');
});

test('admin deletes a ride that is still searching: the offered driver gets the close push', async () => {
  const vehicle = await t.factories.vehicle({ name: 'Admin Del Sedan' });
  const a = await t.factories.driver({ vehicleTypeId: vehicle._id, fcmTokenMobile: 'admindel-a-token-'.padEnd(40, 'a') });
  const admin = await t.factories.admin();
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 150, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  const rideId = String(created.body.data.ride._id);
  await waitFor(async () => (await t.m.Ride.findById(rideId).lean()).dispatchTracking.notifiedDriverIds.length >= 1, { message: 'driver offered' });

  const deleted = await t.api('DELETE', `/admin/ongoing-rides/${rideId}`, { token: admin.token });
  assert.equal(deleted.status, 200, deleted.text);
  const [closed] = await waitFor(() => {
    const found = ofType('ride_request_closed').filter((message) => message.data.rideId === rideId);
    return found.length ? found : null;
  }, { message: 'close push after admin delete' });
  assert.deepEqual(closed.tokens, [a.driver.fcmTokenMobile]);
  assert.equal(closed.data.reason, 'deleted-by-admin');
});
