// node --test src/utils/cloudinaryUpload.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// env.js reads process.env once on import, so set up first.
const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'uploads-'));
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret';
process.env.PUBLIC_BACKEND_URL = 'https://example.test';
process.env.UPLOAD_DIR = uploadDir;

const { uploadDataUrlToCloudinary } = await import('./cloudinaryUpload.js');

const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const toDataUrl = (type, text) => `data:${type};base64,${Buffer.from(text).toString('base64')}`;

test('a picture or a PDF is stored, with an absolute URL', async () => {
  const png = await uploadDataUrlToCloudinary({ dataUrl: PIXEL_PNG, folder: 'docs' });
  assert.match(png.secureUrl, /^https:\/\/example\.test\/uploads\/docs\/.+\.png$/);
  const pdf = await uploadDataUrlToCloudinary({ dataUrl: toDataUrl('application/pdf', '%PDF-1.4'), folder: 'docs' });
  assert.match(pdf.secureUrl, /\.pdf$/);
});

test('HTML, SVG, XML and script uploads are refused (they would run on the admin domain)', async () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/xml', 'text/javascript', 'application/x-sh']) {
    await assert.rejects(
      uploadDataUrlToCloudinary({ dataUrl: toDataUrl(type, '<script>alert(1)</script>'), folder: 'docs' }),
      (error) => error.statusCode === 400,
      type,
    );
  }
  const written = await readdir(path.join(uploadDir, 'docs'));
  assert.ok(written.every((name) => /\.(png|pdf)$/.test(name)), written.join(', '));
});
