// Real-database tests: About / Privacy / Terms / Refund ... written in the admin panel, read by the apps.
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let admin;
before(async () => {
  t = await bootstrap();
  admin = await t.factories.admin();
});
after(async () => { await t.stop(); });
beforeEach(() => t.mongoose.models.TaxiLegalDocument.deleteMany({}));

const save = (type, body, token = admin.token) => t.api('PUT', `/admin/legal/${type}`, { token, body });
const publish = (id, token = admin.token) => t.api('POST', `/admin/legal/${id}/publish`, { token });
const read = (type, query = '') => t.api('GET', `/common/legal/${type}${query}`);

const saveAndPublish = async (type, fields) => {
  const saved = await save(type, { audience: 'all', language_code: 'en', title: type, body: `${type} text`, ...fields });
  assert.equal(saved.status, 200, saved.text);
  const published = await publish(saved.body.data.id);
  assert.equal(published.status, 200, published.text);
  return published.body.data;
};

test('public: a published document is returned without any login', async () => {
  await saveAndPublish('terms', { title: 'Terms & Conditions', body: 'A. GENERAL\n\nThese terms apply.' });

  const res = await read('terms');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.data.type, 'terms');
  assert.equal(res.body.data.title, 'Terms & Conditions');
  assert.equal(res.body.data.body, 'A. GENERAL\n\nThese terms apply.');
  assert.equal(res.body.data.version, 1);
  assert.equal(res.body.data.language, 'en');
  const raw = await fetch(`${t.baseUrl}/api/common/legal/terms`);
  assert.match(raw.headers.get('cache-control') || '', /public, max-age=300/);

  const list = await t.api('GET', '/common/legal');
  assert.equal(list.status, 200, list.text);
  assert.equal(list.body.data.results.length, 1);
  assert.equal(list.body.data.results[0].body, undefined, 'the list never carries the text');
});

test('public: a draft is never returned, unknown or unpublished types are 404', async () => {
  const saved = await save('privacy', { audience: 'all', language_code: 'en', title: 'Privacy', body: 'secret draft' });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.body.data.status, 'draft');

  assert.equal((await read('privacy')).status, 404, 'a draft is not public');
  assert.equal((await read('about')).status, 404, 'nothing published');
  assert.equal((await read('nonsense')).status, 400);
  assert.equal((await t.api('GET', '/common/legal')).body.data.results.length, 0);
});

test('public: language falls back to English, audience falls back to all', async () => {
  await saveAndPublish('terms', { audience: 'all', language_code: 'en', title: 'All EN', body: 'all en' });
  await saveAndPublish('terms', { audience: 'driver', language_code: 'en', title: 'Driver EN', body: 'driver en' });
  await saveAndPublish('terms', { audience: 'all', language_code: 'hi', title: 'All HI', body: 'all hi' });

  const hindi = await read('terms', '?audience=user&lang=hi');
  assert.equal(hindi.body.data.language, 'hi');
  assert.equal(hindi.body.data.title, 'All HI');

  const tamil = await read('terms', '?audience=user&lang=ta');
  assert.equal(tamil.body.data.language, 'en', 'ta is not written, English is used');
  assert.equal(tamil.body.data.requestedLanguage, 'ta');
  assert.equal(tamil.body.data.title, 'All EN');

  const driver = await read('terms', '?audience=driver&lang=en');
  assert.equal(driver.body.data.title, 'Driver EN', 'the exact audience wins');

  const user = await read('terms', '?audience=user&lang=en');
  assert.equal(user.body.data.title, 'All EN', 'no user document, so the "all" one');
});

test('admin: needs an admin token and the legal.manage permission', async () => {
  assert.equal((await t.api('GET', '/admin/legal')).status, 401);

  const rider = await t.factories.user();
  assert.ok([401, 403].includes((await t.api('GET', '/admin/legal', { token: rider.token })).status));

  const sub = await t.m.Admin.create({
    name: 'Sub', email: 'sub-legal@example.com', password: 'not-a-real-hash',
    admin_type: 'subadmin', role: 'subadmin', permissions: ['users.view'], active: true, status: 'active',
  });
  const subToken = t.tokenFor(sub._id, 'admin');
  assert.equal((await t.api('GET', '/admin/legal', { token: subToken })).status, 403);
  assert.equal((await save('terms', { audience: 'all', language_code: 'en', title: 'x', body: 'y' }, subToken)).status, 403);

  await t.m.Admin.updateOne({ _id: sub._id }, { $set: { permissions: ['legal.manage'] } });
  assert.equal((await t.api('GET', '/admin/legal', { token: subToken })).status, 200);
  assert.equal((await save('terms', { audience: 'all', language_code: 'en', title: 'x', body: 'y' }, subToken)).status, 200);
});

test('admin: save upserts, publish bumps the version, edits stay a draft until published', async () => {
  const first = await save('about', { audience: 'all', language_code: 'en', title: 'About', body: 'v1 text' });
  assert.equal(first.status, 200, first.text);
  const again = await save('about', { audience: 'all', language_code: 'en', title: 'About', body: 'v1 text edited' });
  assert.equal(again.body.data.id, first.body.data.id, 'the same row is updated');

  const live1 = await publish(first.body.data.id);
  assert.equal(live1.body.data.version, 1);
  assert.equal(live1.body.data.status, 'published');
  assert.ok(live1.body.data.published_at);
  assert.equal((await read('about')).body.data.body, 'v1 text edited');

  // editing a published document does not change what the apps see
  const edit = await save('about', { audience: 'all', language_code: 'en', title: 'About', body: 'v2 text' });
  assert.equal(edit.body.data.has_draft, true);
  assert.equal(edit.body.data.body, 'v2 text', 'the admin sees the draft');
  assert.equal(edit.body.data.live_body, 'v1 text edited');
  assert.equal((await read('about')).body.data.body, 'v1 text edited', 'the apps still see v1');

  const live2 = await publish(first.body.data.id);
  assert.equal(live2.body.data.version, 2);
  assert.equal((await read('about')).body.data.body, 'v2 text');

  // publishing again with nothing new changes nothing
  assert.equal((await publish(first.body.data.id)).body.data.version, 2);
});

test('admin: unpublish hides it (the text is kept), delete removes it', async () => {
  const doc = await saveAndPublish('refund', { title: 'Refund', body: 'refund text' });
  assert.equal((await read('refund')).status, 200);

  const hidden = await t.api('POST', `/admin/legal/${doc.id}/unpublish`, { token: admin.token });
  assert.equal(hidden.status, 200, hidden.text);
  assert.equal(hidden.body.data.status, 'draft');
  assert.equal(hidden.body.data.body, 'refund text', 'kept as a draft');
  assert.equal((await read('refund')).status, 404);

  assert.equal((await publish(doc.id)).body.data.version, 2, 'it can be published again');

  const gone = await t.api('DELETE', `/admin/legal/${doc.id}`, { token: admin.token });
  assert.equal(gone.status, 200, gone.text);
  assert.equal((await read('refund')).status, 404);
  assert.equal((await t.api('GET', `/admin/legal/${doc.id}`, { token: admin.token })).status, 404);
});

test('admin: list filters by type, audience, language and status', async () => {
  await saveAndPublish('terms', { audience: 'user', language_code: 'en' });
  await save('terms', { audience: 'driver', language_code: 'en', title: 'd', body: 'd' });
  await saveAndPublish('privacy', { audience: 'all', language_code: 'hi' });

  const all = await t.api('GET', '/admin/legal', { token: admin.token });
  assert.equal(all.body.data.results.length, 3);
  assert.equal(all.body.data.results[0].body, undefined);

  const q = async (query) => (await t.api('GET', `/admin/legal?${query}`, { token: admin.token })).body.data.results.length;
  assert.equal(await q('type=terms'), 2);
  assert.equal(await q('audience=driver'), 1);
  assert.equal(await q('language_code=hi'), 1);
  assert.equal(await q('status=draft'), 1);
  assert.equal(await q('status=published'), 2);
});

test('admin: validation (plain text only, size limits, type, language, empty publish)', async () => {
  const ok = { audience: 'all', language_code: 'en', title: 'T', body: 'B' };

  assert.equal((await save('terms', { ...ok, body: '<script>alert(1)</script>' })).status, 400, 'HTML in the body');
  assert.equal((await save('terms', { ...ok, title: '<b>Bold</b>' })).status, 400, 'HTML in the title');
  assert.equal((await save('terms', { ...ok, body: 'Fine: age < 18 and 5 > 3' })).status, 200, 'a < or > is not HTML');
  assert.equal((await save('terms', { ...ok, title: 'x'.repeat(151) })).status, 400, 'title too long');
  assert.equal((await save('terms', { ...ok, body: 'x'.repeat(500 * 1024 + 1) })).status, 400, 'body over 500 KB');
  assert.equal((await save('terms', { ...ok, body: 'x'.repeat(100 * 1024) })).status, 200, '100 KB is fine');
  assert.equal((await save('bogus', ok)).status, 400, 'unknown type');
  assert.equal((await save('terms', { ...ok, audience: 'robots' })).status, 400, 'unknown audience');
  assert.equal((await save('terms', { ...ok, language_code: 'english-us' })).status, 400, 'bad language code');

  const empty = await save('cancellation', { ...ok, body: '   ' });
  assert.equal(empty.status, 200);
  assert.equal((await publish(empty.body.data.id)).status, 400, 'an empty document cannot be published');
  assert.equal((await publish('not-an-id')).status, 404);
});
