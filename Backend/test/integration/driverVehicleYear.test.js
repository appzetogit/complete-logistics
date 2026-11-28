// The vehicle year a driver gives at signup (or the admin types) must land in the Driver's own `vehicleYear`, where the
// profile API and the app's Vehicle Details screen read it, no matter which spelling the client used.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
let counter = 0;
const thisYear = new Date().getFullYear();
const newPhone = () => String(8100000000 + (Date.now() % 100000) * 10 + (counter += 1)).slice(0, 10);

before(async () => {
  t = await bootstrap();
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });

const seedRegistration = async ({ year }) => {
  const vehicle = await t.factories.vehicle();
  const location = await t.mongoose.model('TaxiServiceLocation').create({
    name: 'Indore', service_location_name: 'Indore', latitude: 22.7196, longitude: 75.8577,
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
    personal: { fullName: 'Year Driver', email: `y${phone}@example.com`, gender: 'male', passwordHash: 'hashed-password' },
    vehicle: {
      locationName: 'Indore',
      locationId: String(location._id),
      vehicleTypeId: String(vehicle._id),
      registerFor: 'taxi',
      number: `MP09YR${String(1000 + counter)}`,
      make: 'Maruti',
      model: 'Dzire',
      color: 'White',
      year,
    },
    documents: {},
  });
  return { phone, registrationId };
};

test('app signup: the year from the onboarding session is stored on the driver and returned by the profile API', async () => {
  const { phone, registrationId } = await seedRegistration({ year: '2021' });
  const done = await t.api('POST', '/drivers/onboarding/complete', { body: { registrationId, phone } });
  assert.equal(done.status, 201, done.text);

  const saved = await t.m.Driver.findOne({ phone }).lean();
  assert.equal(saved.vehicleYear, '2021');
  assert.equal(saved.vehicleMake, 'Maruti');

  const token = t.tokenFor(saved._id, 'driver');
  await t.m.Driver.updateOne({ _id: saved._id }, { $set: { approve: true, status: 'approved' } });
  const profile = await t.api('GET', '/drivers/me', { token });
  assert.equal(profile.status, 200, profile.text);
  const body = profile.body.data?.driver || profile.body.data;
  assert.equal(body.vehicleYear, '2021', 'Vehicle Details can show it without retyping');
});

test('admin create: the year is stored whichever way the panel sends it', async () => {
  const create = (extra) => t.api('POST', '/v1/admin/drivers', {
    token: admin.token,
    body: { name: 'Admin Made', phone: newPhone(), password: 'secret1', password_confirmation: 'secret1', transport_type: 'taxi', ...extra },
  });

  const plain = await create({ vehicle_year: '2019' });
  assert.equal(plain.status, 200, plain.text);
  assert.equal((await t.m.Driver.findById(plain.body.data._id || plain.body.data.id).lean()).vehicleYear, '2019');

  const viaOnboarding = await create({ onboarding: { vehicleYear: '2020' } });
  assert.equal((await t.m.Driver.findById(viaOnboarding.body.data._id || viaOnboarding.body.data.id).lean()).vehicleYear, '2020');

  const viaNested = await create({ onboarding: { vehicle: { year: '2022' } } });
  assert.equal((await t.m.Driver.findById(viaNested.body.data._id || viaNested.body.data.id).lean()).vehicleYear, '2022');

  const none = await create({});
  assert.equal(none.status, 200, none.text);
  assert.equal((await t.m.Driver.findById(none.body.data._id || none.body.data.id).lean()).vehicleYear || '', '', 'no year is fine');

  const tooOld = await create({ vehicle_year: '1975' });
  assert.equal(tooOld.status, 400, tooOld.text);
  const future = await create({ vehicle_year: String(thisYear + 1) });
  assert.equal(future.status, 400);
  const letters = await create({ vehicle_year: '20ab' });
  assert.equal(letters.status, 400);
});

test('admin edit: car_year and onboarding.vehicle.year reach vehicleYear; an empty year clears it; a bad one is refused', async () => {
  const made = await t.api('POST', '/v1/admin/drivers', {
    token: admin.token,
    body: { name: 'Edit Me', phone: newPhone(), password: 'secret1', password_confirmation: 'secret1', transport_type: 'taxi' },
  });
  const id = made.body.data._id || made.body.data.id;
  const patch = (body) => t.api('PATCH', `/v1/admin/drivers/${id}`, { token: admin.token, body });
  const stored = async () => (await t.m.Driver.findById(id).lean()).vehicleYear || '';

  assert.equal((await patch({ car_year: '2018' })).status, 200);
  assert.equal(await stored(), '2018');

  assert.equal((await patch({ onboarding: { vehicle: { year: '2023' } } })).status, 200);
  assert.equal(await stored(), '2023');

  // editing something else leaves the year alone
  assert.equal((await patch({ name: 'Edit Me Too' })).status, 200);
  assert.equal(await stored(), '2023');

  assert.equal((await patch({ car_year: '1900' })).status, 400);
  assert.equal(await stored(), '2023', 'a refused value changes nothing');

  assert.equal((await patch({ car_year: '' })).status, 200);
  assert.equal(await stored(), '');

  // the admin API shows it too
  assert.equal((await patch({ vehicle_year: '2017' })).status, 200);
  const detail = await t.api('GET', `/v1/admin/drivers/${id}`, { token: admin.token });
  assert.equal(detail.status, 200, detail.text);
  assert.equal(detail.body.data.vehicle_year, '2017');
  const full = await t.api('GET', `/v1/admin/drivers/${id}/profile`, { token: admin.token });
  assert.equal(full.status, 200, full.text);
  assert.equal(full.body.data.vehicle?.year, '2017', 'the detail page shows it from the canonical field');
});
