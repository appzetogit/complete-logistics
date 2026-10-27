import assert from 'node:assert/strict';
import test from 'node:test';

// env.js reads process.env when it is first imported, so set everything before the import
Object.assign(process.env, {
  NODE_ENV: 'test',
  USE_DEFAULT_OTP: 'false',
  SMS_INDIA_HUB_API_KEY: 'test-api-key',
  SMS_INDIA_HUB_API_KEY_OVERRIDE: '',
  SMS_INDIA_HUB_USERNAME: '',
  SMS_INDIA_HUB_PASSWORD: '',
  SMS_INDIA_HUB_SENDER_ID: 'BGADPL',
  SMS_INDIA_HUB_DLT_TEMPLATE_ID: '',
  SMS_INDIA_HUB_PE_ID: '1001164203633432409',
  SMS_INDIA_HUB_ROUTE: '',
  SMS_INDIA_HUB_POWERED_BY: '',
});

const { renderOtpMessage, buildSmsPayload } = await import('./smsService.js');

const REGISTERED_TEMPLATE =
  'Welcome to ##var##, powered by ##var##. Your OTP for registration ##var##. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL';

test('the OTP message is the registered DLT template with only the three variables filled in', () => {
  const text = renderOtpMessage({ appName: 'Rentol', poweredBy: 'Rentol Logistics', otp: '482913' });
  assert.equal(
    text,
    'Welcome to Rentol, powered by Rentol Logistics. Your OTP for registration 482913. This OTP is valid for 10 minutes. Please do not share it with anyone.BGADPL',
  );

  // everything except the variables is identical to the registered template
  let rest = text;
  for (const part of REGISTERED_TEMPLATE.split('##var##')) {
    const at = rest.indexOf(part);
    assert.notEqual(at, -1, 'missing fixed text: ' + part);
    rest = rest.slice(at + part.length);
  }
});

test('variables longer than 30 characters are cut (DLT limit) and an empty app name falls back to Rentol', () => {
  const long = renderOtpMessage({ appName: 'A'.repeat(50), poweredBy: 'B'.repeat(50), otp: '1234' });
  assert.ok(long.startsWith('Welcome to ' + 'A'.repeat(30) + ', powered by ' + 'B'.repeat(30) + '.'));
  assert.ok(renderOtpMessage({ appName: '   ', otp: '1234' }).startsWith('Welcome to Rentol, powered by Rentol Logistics.'));
});

test('the request carries the sender id, template id, PE id and API key', () => {
  const payload = buildSmsPayload({ phone: '9876543210', otp: '482913', appName: 'Rentol' });
  assert.equal(payload.get('senderid'), 'BGADPL');
  assert.equal(payload.get('TemplateId'), '1077104580057767222');
  assert.equal(payload.get('DLTTemplateId'), '1077104580057767222');
  assert.equal(payload.get('PEId'), '1001164203633432409');
  assert.equal(payload.get('APIKey'), 'test-api-key');
  assert.equal(payload.get('number'), '919876543210');
  assert.equal(payload.get('channel'), 'Trans');
  assert.equal(payload.get('route'), null, 'no route unless one is configured');
  assert.match(payload.get('text'), /Your OTP for registration 482913\./);
});

test('an invalid phone number is refused before anything is sent', () => {
  assert.throws(() => buildSmsPayload({ phone: '12345', otp: '1', appName: 'Rentol' }), /valid Indian mobile number/);
});
