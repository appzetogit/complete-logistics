// node --test src/modules/taxi/services/acceptSelfieVisibility.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret-for-selfie-visibility';

const { RIDE_AUDIENCE, audienceForRole, serializeRideRealtime, withoutAcceptSelfie } = await import('./rideService.js');
const { serializeDeliveryRealtime } = await import('../user/services/deliveryService.js');

const SELFIE_URL = 'https://cdn.example.com/selfies/accept-1.jpg';

const makeRide = (overrides = {}) => ({
  _id: 'ride1',
  serviceType: 'ride',
  status: 'accepted',
  liveStatus: 'accepted',
  fare: 100,
  acceptSelfie: { imageUrl: SELFIE_URL, capturedAt: new Date('2026-01-01T00:00:00Z') },
  driverId: {
    _id: 'driver1',
    name: 'Asha',
    profileImage: 'https://cdn.example.com/profiles/asha.jpg',
    vehicleNumber: 'MP09AB1234',
    vehicleModel: 'Dzire',
    rating: 4.8,
  },
  userId: { _id: 'user1', name: 'Rider', phone: '9999999999' },
  ...overrides,
});

test('user payload (and the default / shared room payload) never contains acceptSelfie', () => {
  const ride = makeRide();

  for (const payload of [
    serializeRideRealtime(ride),
    serializeRideRealtime(ride, { audience: RIDE_AUDIENCE.USER }),
  ]) {
    assert.equal('acceptSelfie' in payload, false);
    assert.ok(!JSON.stringify(payload).includes(SELFIE_URL));
  }
});

test('driver and admin payloads still carry the selfie', () => {
  const ride = makeRide();

  for (const audience of [RIDE_AUDIENCE.DRIVER, RIDE_AUDIENCE.ADMIN]) {
    const payload = serializeRideRealtime(ride, { audience });
    assert.equal(payload.acceptSelfie.imageUrl, SELFIE_URL);
  }

  assert.equal(
    serializeRideRealtime(makeRide({ acceptSelfie: undefined }), { audience: RIDE_AUDIENCE.DRIVER }).acceptSelfie,
    null,
  );
});

test('the user still gets the driver identity: name, photo, vehicle, number, rating', () => {
  const { driver } = serializeRideRealtime(makeRide());
  assert.equal(driver.name, 'Asha');
  assert.equal(driver.profileImage, 'https://cdn.example.com/profiles/asha.jpg');
  assert.equal(driver.vehicleNumber, 'MP09AB1234');
  assert.equal(driver.vehicleModel, 'Dzire');
  assert.equal(driver.rating, 4.8);
});

test('audienceForRole: only drivers get the driver view', () => {
  assert.equal(audienceForRole('driver'), RIDE_AUDIENCE.DRIVER);
  assert.equal(audienceForRole('user'), RIDE_AUDIENCE.USER);
  assert.equal(audienceForRole(undefined), RIDE_AUDIENCE.USER);
});

test('withoutAcceptSelfie strips plain objects and mongoose-style documents without mutating them', () => {
  const plain = makeRide();
  const stripped = withoutAcceptSelfie(plain);
  assert.equal('acceptSelfie' in stripped, false);
  assert.equal(plain.acceptSelfie.imageUrl, SELFIE_URL);

  const doc = { ...makeRide(), toObject() { return { ...makeRide() }; } };
  assert.equal('acceptSelfie' in withoutAcceptSelfie(doc), false);
});

test('delivery payloads follow the same audience rule', () => {
  const ride = makeRide({ serviceType: 'parcel' });
  assert.equal('acceptSelfie' in serializeDeliveryRealtime(ride), false);
  assert.equal('acceptSelfie' in serializeDeliveryRealtime(ride, { audience: RIDE_AUDIENCE.USER }), false);
  assert.equal(serializeDeliveryRealtime(ride, { audience: RIDE_AUDIENCE.DRIVER }).acceptSelfie.imageUrl, SELFIE_URL);
});
