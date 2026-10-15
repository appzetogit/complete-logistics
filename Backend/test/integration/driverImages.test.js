// Real-database tests: driver images (profile photo, documents, daily selfie, vehicle photo) are stored as files
// under /uploads and only their absolute URL is kept and returned; older base64 rows are converted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-images-'));
process.env.UPLOAD_DIR = uploadDir;

const { bootstrap } = await import('./harness.js');

let t;
let images;
before(async () => {
  t = await bootstrap();
  images = await import('../../src/modules/taxi/driver/services/driverImageService.js');
});
after(async () => {
  await t.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const asDataUrl = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const JPEG = asDataUrl('image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]));
const UPLOAD_URL = /^http:\/\/127\.0\.0\.1:0\/uploads\/drivers\/[a-z]+\/[0-9a-f]{40}\.(png|jpg|webp)$/;

const fileFor = (url) => path.join(uploadDir, url.replace('http://127.0.0.1:0/uploads/', ''));
const me = async (driver) => (await t.api('GET', '/drivers/me', { token: driver.token })).body.data;
const patchMe = (driver, body) => t.api('PATCH', '/drivers/me', { token: driver.token, body });

test('profile photo: a data URL becomes a file; /drivers/me returns its absolute URL', async () => {
  const driver = await t.factories.driver();
  const res = await patchMe(driver, { profileImage: PNG });
  assert.equal(res.status, 200, res.text);
  const url = res.body.data.profileImage;
  assert.match(url, UPLOAD_URL);
  assert.ok(url.includes('/drivers/profile/'));
  assert.ok(fs.existsSync(fileFor(url)), 'the file is on disk');

  const profile = await me(driver);
  assert.equal(profile.profileImage, url);
  assert.ok(!JSON.stringify(profile).includes('data:image'), 'no base64 anywhere in /drivers/me');
  assert.equal((await t.m.Driver.findById(driver.driver._id).lean()).profileImage, url);
});

test('profile photo: "" clears it, a URL is kept as it is', async () => {
  const driver = await t.factories.driver();
  assert.equal((await patchMe(driver, { profileImage: PNG })).status, 200);
  const cleared = await patchMe(driver, { profileImage: '' });
  assert.equal(cleared.body.data.profileImage, '');
  const kept = await patchMe(driver, { profileImage: 'https://cdn.example.com/a.jpg' });
  assert.equal(kept.body.data.profileImage, 'https://cdn.example.com/a.jpg');
});

test('profile photo: only real JPEG / PNG / WebP up to 2 MB; anything else is a 400', async () => {
  const driver = await t.factories.driver();
  const cases = [
    ['svg', asDataUrl('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), /JPEG, PNG or WebP/],
    ['html said to be png', asDataUrl('image/png', '<html><script>alert(1)</script></html>'), /JPEG, PNG or WebP/],
    ['gif', asDataUrl('image/gif', 'GIF89a....'), /JPEG, PNG or WebP/],
    ['too large', asDataUrl('image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2.2 * 1024 * 1024)])), /too large/],
    ['not base64 image', 'data:image/png,hello', /not a valid image/],
  ];
  for (const [name, value, message] of cases) {
    const res = await patchMe(driver, { profileImage: value });
    assert.equal(res.status, 400, `${name}: ${res.text}`);
    assert.match(res.body.message, message, name);
    assert.equal(res.body.code, 'INVALID_IMAGE', name);
  }
  assert.equal((await t.m.Driver.findById(driver.driver._id).lean()).profileImage || '', '', 'nothing stored');
});

test('documents: every image field gets the same file URL (one file), nothing in base64', async () => {
  const driver = await t.factories.driver();
  const res = await t.api('PATCH', '/drivers/documents/aadhaar', {
    token: driver.token,
    body: { document: { fileName: 'aadhaar.jpg', previewUrl: JPEG, secureUrl: JPEG, url: JPEG, images: [JPEG], identifyNumber: '1234' } },
  });
  assert.equal(res.status, 200, res.text);
  const stored = (await t.m.Driver.findById(driver.driver._id).lean()).documents.aadhaar;
  assert.ok(!JSON.stringify(stored).includes('data:'), JSON.stringify(stored).slice(0, 200));
  assert.match(stored.previewUrl, UPLOAD_URL);
  assert.ok(stored.previewUrl.includes('/drivers/documents/'));
  for (const field of ['secureUrl', 'url', 'imageUrl']) assert.equal(stored[field], stored.previewUrl, field);
  assert.deepEqual(stored.images, [stored.previewUrl]);
  assert.equal(fs.readdirSync(path.join(uploadDir, 'drivers/documents')).length >= 1, true);

  const bad = await t.api('PATCH', '/drivers/documents/pan', {
    token: driver.token,
    body: { document: { previewUrl: asDataUrl('image/svg+xml', '<svg/>') } },
  });
  assert.equal(bad.status, 400);
});

test('older rows: base64 photo, documents, selfie and vehicle photo are converted when /drivers/me is read', async () => {
  const driver = await t.factories.driver();
  await t.m.Driver.collection.updateOne(
    { _id: driver.driver._id },
    {
      $set: {
        profileImage: PNG,
        vehicleImage: JPEG,
        onlineSelfie: { imageUrl: PNG, forDate: '2026-10-01', capturedAt: new Date() },
        documents: { license: { previewUrl: JPEG, secureUrl: JPEG, images: [JPEG], back: { image: PNG } } },
      },
    },
  );

  const profile = await me(driver);
  assert.ok(!JSON.stringify(profile).includes('data:image'), 'the response carries URLs only');
  const stored = await t.m.Driver.findById(driver.driver._id).lean();
  assert.match(stored.profileImage, UPLOAD_URL);
  assert.match(stored.vehicleImage, UPLOAD_URL);
  assert.match(stored.onlineSelfie.imageUrl, UPLOAD_URL);
  assert.equal(stored.onlineSelfie.forDate, '2026-10-01', 'other selfie fields untouched');
  assert.match(stored.documents.license.previewUrl, UPLOAD_URL);
  assert.match(stored.documents.license.back.image, UPLOAD_URL);
  assert.equal(images.driverHasInlineImages(stored), false);
});

test('backfill helper: dry run changes nothing; a picture it cannot convert is kept (never lost)', async () => {
  const driver = await t.factories.driver();
  const svg = asDataUrl('image/svg+xml', '<svg/>');
  await t.m.Driver.collection.updateOne(
    { _id: driver.driver._id },
    { $set: { profileImage: PNG, documents: { odd: { previewUrl: svg } } } },
  );
  const lean = () => t.m.Driver.findById(driver.driver._id).lean();

  const dry = await images.healDriverInlineImages(await lean(), { apply: false });
  assert.ok(dry.bytesAfter < dry.bytesBefore);
  assert.equal((await lean()).profileImage, PNG, 'dry run: database untouched');

  const applied = await images.healDriverInlineImages(await lean(), { apply: true });
  assert.equal(applied.failures.length, 1, applied.failures.join());
  const stored = await lean();
  assert.match(stored.profileImage, UPLOAD_URL);
  assert.equal(stored.documents.odd.previewUrl, svg, 'not converted, not dropped');
});

test('admin: creating / editing a driver stores the photo and document pictures as files too', async () => {
  const admin = await t.factories.admin();
  const phone = String(8000000000 + Math.floor(Math.random() * 999999999)).slice(0, 10);
  const created = await t.api('POST', '/admin/drivers', {
    token: admin.token,
    body: {
      name: 'Admin Made', phone, password: 'secret12', password_confirmation: 'secret12',
      profile_picture: PNG,
      documents: { license: { previewUrl: JPEG, images: [JPEG] } },
    },
  });
  assert.ok([200, 201].includes(created.status), created.text);
  const stored = await t.m.Driver.findOne({ phone }).lean();
  assert.match(stored.profileImage, UPLOAD_URL);
  assert.equal(stored.profile_picture, stored.profileImage);
  assert.match(stored.documents.license.previewUrl, UPLOAD_URL);
  assert.ok(!JSON.stringify(stored).includes('data:image'));

  const edited = await t.api('PATCH', `/admin/drivers/${stored._id}`, {
    token: admin.token,
    body: { documents: { pan: { previewUrl: PNG } } },
  });
  assert.equal(edited.status, 200, edited.text);
  assert.match((await t.m.Driver.findById(stored._id).lean()).documents.pan.previewUrl, UPLOAD_URL);

  const bad = await t.api('POST', '/admin/drivers', {
    token: admin.token,
    body: { name: 'Bad Photo', phone: `9${phone.slice(1)}`, password: 'secret12', password_confirmation: 'secret12', profile_picture: asDataUrl('image/svg+xml', '<svg/>') },
  });
  assert.equal(bad.status, 400, bad.text);
});

test('older rows: the admin copy of the photo (profile_picture) is converted as well', async () => {
  const driver = await t.factories.driver();
  await t.m.Driver.collection.updateOne({ _id: driver.driver._id }, { $set: { profile_picture: PNG } });
  assert.equal(images.driverHasInlineImages(await t.m.Driver.findById(driver.driver._id).lean()), true);
  await me(driver);
  assert.match((await t.m.Driver.findById(driver.driver._id).lean()).profile_picture, UPLOAD_URL);
});
