// Real-app tests: OTP limits are tight per phone number but not a lock-out for everyone on one network.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
before(async () => { t = await bootstrap(); });
after(async () => { await t.stop(); });

// The in-memory limiter keys by the client IP; give every test its own "network" via X-Forwarded-For.
const sendOtp = (phone, ip) => fetch(`${t.baseUrl}/api/v1/users/auth/send-otp`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
  body: JSON.stringify({ phone }),
}).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

const phoneFrom = (base, i) => String(base + i);

test('one network can request OTPs for many different numbers (the old shared-IP lock-out)', async () => {
  const ip = '203.0.113.10';
  for (let i = 0; i < 8; i += 1) {
    const res = await sendOtp(phoneFrom(9100000000, i), ip);
    assert.notEqual(res.status, 429, `number ${i + 1} was blocked: ${JSON.stringify(res.body)}`);
  }
});

test('the same number is still limited to 5 per 10 minutes, and the 429 says when to retry', async () => {
  const ip = '203.0.113.20';
  const phone = '9200000001';
  for (let i = 0; i < 5; i += 1) {
    assert.notEqual((await sendOtp(phone, ip)).status, 429, `try ${i + 1}`);
  }
  const blocked = await sendOtp(phone, ip);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limitedBy, 'phone');
  assert.ok(blocked.body.retryAfterSeconds > 0 && blocked.body.retryAfterSeconds <= 600);

  // a different number from the same network still works
  assert.notEqual((await sendOtp('9200000002', ip)).status, 429);
});

test('a single network is still capped (30 per 10 minutes), reported as a network limit', async () => {
  const ip = '203.0.113.30';
  for (let i = 0; i < 30; i += 1) {
    assert.notEqual((await sendOtp(phoneFrom(9300000000, i), ip)).status, 429, `request ${i + 1}`);
  }
  const blocked = await sendOtp('9399999999', ip);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.limitedBy, 'network');

  // another network is unaffected
  assert.notEqual((await sendOtp('9399999999', '203.0.113.31')).status, 429);
});

test('a forged X-Forwarded-For prefix cannot dodge the limit (the proxy-added last entry counts)', async () => {
  const realIp = '203.0.113.40';
  const phone = '9400000001';
  for (let i = 0; i < 5; i += 1) {
    // client sends a fake first hop each time; nginx appends the real address at the end
    await sendOtp(phone, `10.9.${i}.1, ${realIp}`);
  }
  const forged = await sendOtp('9400000002', `10.9.99.1, ${realIp}`);
  assert.notEqual(forged.status, 429, 'different number, same real network: still fine');
  for (let i = 0; i < 24; i += 1) {
    await sendOtp(phoneFrom(9410000000, i), `198.51.100.${i}, ${realIp}`);
  }
  const capped = await sendOtp('9499999999', `198.51.100.250, ${realIp}`);
  assert.equal(capped.status, 429, 'all 30 requests counted against the real IP despite the fake prefixes');
  assert.equal(capped.body.limitedBy, 'network');
});
