// Real-database tests: welcome + T&C email on user signup and driver onboarding.
// Mail goes to a local fake SMTP server, never a real provider.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap, sleep, startFakeSmtp, waitFor } from './harness.js';

let t;
let smtp;
before(async () => {
  smtp = await startFakeSmtp();
  t = await bootstrap({ smtpPort: smtp.port });
});
after(async () => {
  await t.stop();
  await smtp.close();
});

let counter = 0;
const newPhone = () => String(8100000000 + Date.now() % 100000 + (counter += 1));

const signupUser = async ({ phone, email, name = 'New Rider' }) => {
  assert.equal((await t.api('POST', '/users/auth/send-otp', { body: { phone } })).status, 201);
  const verify = await t.api('POST', '/users/auth/verify-otp', { body: { phone, otp: '1234' } });
  assert.equal(verify.status, 200, verify.text);
  return t.api('POST', '/users/signup', { body: { name, phone, email, gender: 'male' } });
};

test('flag off (default): signup succeeds and nothing is sent', async () => {
  delete process.env.EMAIL_WELCOME_ENABLED;
  const before = smtp.messages.length;
  const res = await signupUser({ phone: newPhone(), email: 'off@example.com' });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.body.data.token);
  await sleep(800);
  assert.equal(smtp.messages.length, before, 'no email when the flag is off');
});

test('flag on: signup sends the welcome email with the USER terms to the new user', async () => {
  process.env.EMAIL_WELCOME_ENABLED = 'true';
  const before = smtp.messages.length;
  const res = await signupUser({ phone: newPhone(), email: 'rider-welcome@example.com', name: 'Priya Rider' });
  assert.equal(res.status, 201, res.text);

  const message = await waitFor(() => smtp.messages[before], { message: 'welcome email at the SMTP sink' });
  assert.deepEqual(message.to, ['rider-welcome@example.com']);
  assert.match(message.raw, /Subject: Welcome to/i);
  assert.match(message.raw, /Priya Rider/);
  assert.match(message.raw, /User Terms/);
  assert.doesNotMatch(message.raw, /Driver Terms/);
});

test('flag on, empty email: signup works and nothing is sent', async () => {
  process.env.EMAIL_WELCOME_ENABLED = 'true';
  const before = smtp.messages.length;
  const phone = newPhone();
  assert.equal((await t.api('POST', '/users/auth/send-otp', { body: { phone } })).status, 201);
  await t.api('POST', '/users/auth/verify-otp', { body: { phone, otp: '1234' } });
  const res = await t.api('POST', '/users/signup', { body: { name: 'No Email', phone, gender: 'male' } });
  // the API may require an email; either way no mail goes out and the result is not a server error
  assert.ok(res.status < 500, res.text);
  await sleep(600);
  assert.equal(smtp.messages.length, before);
});

// A registration that is ready to be submitted (OTP verified, personal + vehicle saved).
const seedRegistration = async ({ email = 'newdriver@example.com', name = 'Dev Driver' } = {}) => {
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
    personal: { fullName: name, email, gender: 'male', passwordHash: 'hashed-password' },
    vehicle: {
      locationName: 'Indore',
      locationId: String(location._id),
      vehicleTypeId: String(vehicle._id),
      registerFor: 'taxi',
      number: 'MP09AB1234',
    },
    documents: {},
  });
  return { phone, registrationId };
};

test('driver onboarding, flag off: completes and sends nothing', async () => {
  delete process.env.EMAIL_WELCOME_ENABLED;
  const before = smtp.messages.length;
  const { phone, registrationId } = await seedRegistration();
  const res = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.equal(res.status, 201, res.text);
  assert.ok(res.body.data.token);
  assert.equal(res.body.data.driver.approve ?? false, false, 'still pending admin approval');
  await sleep(800);
  assert.equal(smtp.messages.length, before);
});

test('driver onboarding, flag on: sends the welcome email with the DRIVER terms, exactly once', async () => {
  process.env.EMAIL_WELCOME_ENABLED = 'true';
  const before = smtp.messages.length;
  const { phone, registrationId } = await seedRegistration({ email: 'driver-welcome@example.com', name: 'Dev Driver' });

  const res = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.equal(res.status, 201, res.text);

  const message = await waitFor(() => smtp.messages[before], { message: 'driver welcome email' });
  assert.deepEqual(message.to, ['driver-welcome@example.com']);
  assert.match(message.raw, /Dev Driver/);
  assert.match(message.raw, /Driver Terms/);
  assert.doesNotMatch(message.raw, /User Terms/);

  // submitting again does not create another account or another email
  const again = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.ok(again.status >= 400 || again.body?.data?.message === 'Registration already completed');
  await sleep(800);
  assert.equal(smtp.messages.length, before + 1, 'one email only');
});

test('driver onboarding, flag on, empty email: skipped silently', async () => {
  process.env.EMAIL_WELCOME_ENABLED = 'true';
  const before = smtp.messages.length;
  const { phone, registrationId } = await seedRegistration({ email: '' });
  const res = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.ok(res.status < 500, res.text);
  await sleep(600);
  assert.equal(smtp.messages.length, before);
});

test('flag on but the mail server is down: user signup AND driver onboarding still succeed', async () => {
  process.env.EMAIL_WELCOME_ENABLED = 'true';
  await smtp.close(); // the mail server disappears

  const userRes = await signupUser({ phone: newPhone(), email: 'nobody-home@example.com' });
  assert.equal(userRes.status, 201, userRes.text);
  assert.ok(userRes.body.data.token, 'registration unaffected by the mail failure');

  const { phone, registrationId } = await seedRegistration({ email: 'driver-nobody-home@example.com' });
  const driverRes = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.equal(driverRes.status, 201, driverRes.text);
  assert.ok(driverRes.body.data.token);

  await sleep(1200); // fire-and-forget failures are only logged; the server stays healthy
  assert.equal((await fetch(`${t.baseUrl}/health`)).status, 200);
});
