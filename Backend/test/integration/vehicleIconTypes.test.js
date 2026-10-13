// Real-database test: every icon type the admin Vehicle Type form offers can be saved.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
before(async () => {
  t = await bootstrap();
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });

// The keys of `iconMap` in frontend/src/modules/admin/pages/price-management/VehicleType.jsx
const FORM_ICON_TYPES = ['car', 'bike', 'auto', 'truck', 'ehcb', 'HCV', 'LCV', 'MCV', 'Luxary', 'premium', 'suv',
  'scooty', 'car_5_seater', 'car_7_seater', 'bus', 'mini_bus', 'motor_bike'];

test('every icon type from the admin form saves (e.g. a 35-seat "bus")', async () => {
  for (const icon of FORM_ICON_TYPES) {
    const res = await t.api('POST', '/admin/types/vehicle-types', {
      token: admin.token,
      body: {
        name: `Rentol ${icon}`, short_description: 'x', description: 'x', transport_type: 'taxi', is_taxi: 'taxi',
        icon_types: icon, capacity: 35, size: '35', status: 1, active: true, dispatch_type: 'normal',
        price_per_km: 150, taxi_eta_minutes: 5,
      },
    });
    assert.equal(res.status, 200, `${icon}: ${res.text}`);
    assert.equal(res.body.data.icon_types, icon);
  }
});

test('an unknown icon type is still refused', async () => {
  const res = await t.api('POST', '/admin/types/vehicle-types', {
    token: admin.token,
    body: { name: 'Rentol Spaceship', transport_type: 'taxi', icon_types: 'spaceship', status: 1 },
  });
  assert.equal(res.status, 400);
});

test('a new vehicle type with a base64 image is stored as a file, not inline', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const res = await t.api('POST', '/admin/types/vehicle-types', {
    token: admin.token,
    body: { name: 'Rentol Bus', transport_type: 'taxi', icon_types: 'bus', status: 1, image: png, icon: '', map_icon: '' },
  });
  assert.equal(res.status, 200, res.text);
  const stored = await t.m.Vehicle.collection.findOne({ name: 'Rentol Bus' });
  assert.match(stored.image, /\/uploads\/vehicles\/[0-9a-f]{40}\.png$/);
  assert.ok(!JSON.stringify(stored).includes('data:image'));
});
