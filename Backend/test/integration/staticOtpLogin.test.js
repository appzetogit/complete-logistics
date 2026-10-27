// Real-app tests: the fixed-OTP test logins. The customer app's test number (1111111111) and the driver app's
// (2222222222) log in with 123456 (or its first four digits, since the apps have four boxes) and no SMS is sent
// for them. Every other number gets a random 4-digit OTP by SMS, exactly as before.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

const realFetch = globalThis.fetch;
const sentSms = [];

// stand-in for SMS India Hub: records what would be sent and reports success
globalThis.fetch = async (input, init) => {
  const url = String(typeof input === 'string' ? input : input?.url || input);
  if (!url.includes('smsindiahub.in')) return realFetch(input, init);
  const params = new URLSearchParams(String(init?.body || '') || url.split('?')[1] || '');
  sentSms.push({ number: params.get('number') || '', text: params.get('text') || '' });
  return new Response(JSON.stringify({ ErrorCode: '000', ErrorMessage: 'Done', JobId: '1', MessageData: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

let t;
before(async () => {
  t = await bootstrap({
    env: {
      USE_DEFAULT_OTP: 'false',
      STATIC_OTP_CODE: '123456',
      STATIC_OTP_PHONE: '',
      STATIC_OTP_USER_PHONE: '1111111111',
      STATIC_OTP_DRIVER_PHONE: '2222222222',
      SMS_INDIA_HUB_API_KEY: 'test-key',
      SMS_INDIA_HUB_SENDER_ID: 'BGADEC',
    },
  });
});
after(async () => {
  globalThis.fetch = realFetch;
  await t.stop();
});

// the in-memory limiter keys by the client IP: every request gets its own "network"
let ipCounter = 0;
const post = (path, body) => realFetch(`${t.baseUrl}/api/v1${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${(ipCounter += 1)}` },
  body: JSON.stringify(body),
}).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));

const ok = (res) => res.status === 200 || res.status === 201;
const smsTo = (phone) => sentSms.filter((sms) => sms.number.endsWith(phone));
const otpInSms = (phone) => {
  const sms = smsTo(phone).at(-1);
  const match = /registration is (\d{4})\./.exec(sms?.text || '');
  assert.ok(match, `an OTP message was sent to ${phone}: ${JSON.stringify(sms)}`);
  return match[1];
};
const hasToken = (res) => /token/i.test(JSON.stringify(res.body || {}));

test('customer app: 1111111111 logs in with 123456 and with 1234, and no SMS is sent', async () => {
  for (const code of ['123456', '1234']) {
    assert.ok(ok(await post('/users/auth/send-otp', { phone: '1111111111' })));
    const verified = await post('/users/auth/verify-otp', { phone: '1111111111', otp: code });
    assert.ok(ok(verified), `${code}: ${verified.status} ${JSON.stringify(verified.body)}`);
  }
  assert.equal(smsTo('1111111111').length, 0, 'the test number costs no SMS');
});

test('customer app: a wrong code for the test number is refused', async () => {
  assert.ok(ok(await post('/users/auth/send-otp', { phone: '1111111111' })));
  assert.equal((await post('/users/auth/verify-otp', { phone: '1111111111', otp: '123457' })).status, 400);
  assert.equal((await post('/users/auth/verify-otp', { phone: '1111111111', otp: '9999' })).status, 401);
});

test('customer app: any other number gets a real SMS OTP, and 123456 does not work for it', async () => {
  assert.ok(ok(await post('/users/auth/send-otp', { phone: '9876543211' })));
  const otp = otpInSms('9876543211');
  assert.equal((await post('/users/auth/verify-otp', { phone: '9876543211', otp: '123456' })).status, 400);
  const verified = await post('/users/auth/verify-otp', { phone: '9876543211', otp });
  assert.ok(ok(verified), `${verified.status} ${JSON.stringify(verified.body)}`);
});

test('customer app: the driver test number is an ordinary number here', async () => {
  assert.ok(ok(await post('/users/auth/send-otp', { phone: '2222222222' })));
  assert.equal(smsTo('2222222222').length, 1, 'a real SMS goes out');
  assert.equal((await post('/users/auth/verify-otp', { phone: '2222222222', otp: '123456' })).status, 400);
});

test('driver app: 2222222222 logs in with 123456 and with 1234, and no SMS is sent', async () => {
  const before = smsTo('2222222222').length;
  await t.factories.driver({ phone: '2222222222' });
  for (const code of ['123456', '1234']) {
    const sent = await post('/drivers/auth/send-otp', { phone: '2222222222', role: 'driver' });
    assert.ok(ok(sent), JSON.stringify(sent.body));
    const verified = await post('/drivers/auth/verify-otp', { phone: '2222222222', otp: code, role: 'driver' });
    assert.ok(ok(verified), `${code}: ${verified.status} ${JSON.stringify(verified.body)}`);
    assert.ok(hasToken(verified), 'a login token is issued');
  }
  assert.equal(smsTo('2222222222').length, before, 'the driver test number costs no SMS');
});

test('driver app: the customer test number and other numbers cannot use 123456', async () => {
  for (const phone of ['1111111111', '9876543212']) {
    await t.factories.driver({ phone }); // the driver app only sends a login OTP to an existing driver
    const sent = await post('/drivers/auth/send-otp', { phone, role: 'driver' });
    assert.ok(ok(sent), `${phone}: ${JSON.stringify(sent.body)}`);
    assert.equal((await post('/drivers/auth/verify-otp', { phone, otp: '123456', role: 'driver' })).status, 400, phone);
  }
});

test('the old hard-coded test logins (7610416911 and 6268423925 with 0000) no longer work', async () => {
  assert.ok(ok(await post('/users/auth/send-otp', { phone: '7610416911' })));
  assert.equal((await post('/users/auth/verify-otp', { phone: '7610416911', otp: '0000' })).status, 401);
  await t.factories.driver({ phone: '6268423925' });
  assert.ok(ok(await post('/drivers/auth/send-otp', { phone: '6268423925', role: 'driver' })));
  assert.equal((await post('/drivers/auth/verify-otp', { phone: '6268423925', otp: '0000', role: 'driver' })).status, 401);
});
