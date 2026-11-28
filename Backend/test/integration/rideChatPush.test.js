// Ride chat push: the participant who did NOT send the message gets a normal (not data-only) notification with
// data.type = ride_message and the rideId; the sender never does; chat keeps working when the push cannot be sent.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, waitFor } from './harness.js';

let t;
let notifyRideMessageRecipient;
before(async () => {
  t = await bootstrap();
  await t.setSettings('free_rides', { enabled: '0' });
  ({ notifyRideMessageRecipient } = await import('../../src/modules/taxi/services/rideChatPushService.js'));
});
after(async () => { await t.stop(); });

const collect = () => {
  const sent = [];
  return { sent, send: async (payload) => { sent.push(payload); return { ok: true }; } };
};
const message = (overrides = {}) => ({ rideId: 'r1', senderRole: 'user', senderId: 'u1', message: 'hello', ...overrides });
const participants = (overrides = {}) => ({ userId: 'u1', driverId: 'd1', status: 'accepted', ...overrides });

test('rider -> driver: the push goes to the driver only, as a normal notification with the ride id', async () => {
  const { sent, send } = collect();
  const { user } = await t.factories.user({ name: 'Asha' });
  await notifyRideMessageRecipient({ savedMessage: message({ senderId: String(user._id) }), participants: participants({ userId: String(user._id) }), send });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].driverIds, ['d1']);
  assert.equal(sent[0].userIds, undefined);
  assert.equal(sent[0].title, 'Asha');
  assert.equal(sent[0].body, 'hello');
  assert.deepEqual(sent[0].data, { type: 'ride_message', rideId: 'r1' });
  assert.notEqual(sent[0].dataOnly, true, 'must not be data-only: nothing would show');
});

test('driver -> rider: the push goes to the rider only; the sender is never notified', async () => {
  const { sent, send } = collect();
  const { driver } = await t.factories.driver({ name: 'Ravi' });
  await notifyRideMessageRecipient({
    savedMessage: message({ senderRole: 'driver', senderId: String(driver._id) }),
    participants: participants({ driverId: String(driver._id) }),
    send,
  });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].userIds, ['u1']);
  assert.equal(sent[0].driverIds, undefined);
  assert.equal(sent[0].title, 'Ravi');
});

test('no push: no driver yet, ride finished, same account on both sides', async () => {
  for (const [saved, parts] of [
    [message(), participants({ driverId: '' })],
    [message(), participants({ status: 'completed' })],
    [message(), participants({ status: 'cancelled' })],
    [message({ senderId: 'd1' }), participants({ driverId: 'd1' })],
    [message({ senderRole: 'admin' }), participants()],
  ]) {
    const { sent, send } = collect();
    assert.equal(await notifyRideMessageRecipient({ savedMessage: saved, participants: parts, send }), null);
    assert.equal(sent.length, 0);
  }
});

test('long messages are trimmed; a missing name falls back to Rider / Driver', async () => {
  const { sent, send } = collect();
  await notifyRideMessageRecipient({ savedMessage: message({ message: `${'x'.repeat(300)}`, senderId: '64b000000000000000000001' }), participants: participants(), send });
  assert.ok(sent[0].body.length <= 120);
  assert.equal(sent[0].title, 'Rider');
});

test('over the real socket: both sides get the message and the chat works even though no push can be sent', async () => {
  const vehicle = await t.factories.vehicle();
  const driver = await t.factories.driver({ vehicleTypeId: vehicle._id });
  const rider = await t.factories.user();
  const created = await t.api('POST', '/rides', {
    token: rider.token,
    body: { pickup: t.locations.pickup, drop: t.locations.drop, fare: 200, vehicleTypeId: String(vehicle._id), paymentMethod: 'cash' },
  });
  const rideId = created.body.data.ride._id;
  await t.acceptRide(rideId, driver.driver._id);

  const riderSocket = await t.connectSocket(rider.token);
  const driverSocket = await t.connectSocket(driver.token);
  riderSocket.socket.emit('ride:join', { rideId });
  driverSocket.socket.emit('ride:join', { rideId });
  await waitFor(() => riderSocket.of('ride:joined')[0] && driverSocket.of('ride:joined')[0], { message: 'both joined' });

  riderSocket.socket.emit('ride:message:send', { rideId, message: 'I am at the gate' });
  await waitFor(() => driverSocket.of('ride:message:new')[0], { message: 'driver got the message' });
  const received = driverSocket.of('ride:message:new')[0].payload;
  assert.equal(received.message, 'I am at the gate');
  assert.equal(received.participants, undefined, 'participant ids are not leaked to clients');
  assert.ok(riderSocket.of('ride:message:new')[0], 'the sender also gets the event (existing behaviour)');

  driverSocket.socket.emit('ride:message:send', { rideId, message: 'coming' });
  await waitFor(() => riderSocket.of('ride:message:new').length >= 2, { message: 'rider got the reply' });
  assert.equal((await t.m.Ride.findById(rideId).lean()).messages.length, 2);
});
