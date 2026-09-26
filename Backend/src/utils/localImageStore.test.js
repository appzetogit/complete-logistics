// node --test src/utils/localImageStore.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// env.js validates on import and reads process.env once, so set up first.
const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'uploads-'));
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret';
process.env.PUBLIC_BACKEND_URL = 'https://example.test';
process.env.UPLOAD_DIR = uploadDir;

const { storeDataUrlImage, isDataUrl } = await import('./localImageStore.js');

const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('recognises data URLs and leaves everything else alone', () => {
  assert.equal(isDataUrl(PIXEL_PNG), true);
  assert.equal(isDataUrl('https://example.test/uploads/a.png'), false);
  assert.equal(isDataUrl(null), false);
});

test('an existing URL passes through untouched, so re-running is safe', async () => {
  const url = 'https://example.test/uploads/vehicles/abc.png';
  assert.equal(await storeDataUrlImage(url, 'vehicles'), url);
});

test('a data URL becomes a file on disk plus a public URL', async () => {
  const url = await storeDataUrlImage(PIXEL_PNG, 'vehicles');

  assert.match(url, /^https:\/\/example\.test\/uploads\/vehicles\/[0-9a-f]{40}\.png$/);

  const written = await readFile(path.join(uploadDir, url.split('/uploads/')[1]));
  assert.deepEqual(written, Buffer.from(PIXEL_PNG.split(',')[1], 'base64'));
});

test('identical content collapses to one file instead of duplicating', async () => {
  await storeDataUrlImage(PIXEL_PNG, 'dedup');
  await storeDataUrlImage(PIXEL_PNG, 'dedup');

  assert.equal((await readdir(path.join(uploadDir, 'dedup'))).length, 1);
});

test('malformed input yields an empty reference rather than a stored blob', async () => {
  assert.equal(await storeDataUrlImage('data:image/png;base64,', 'bad'), '');
  assert.equal(await storeDataUrlImage('data:text/plain;base64,aGk=', 'bad'), '');
});
