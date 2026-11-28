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
  SMS_INDIA_HUB_SENDER_ID: 'RENGPL',
  SMS_INDIA_HUB_DLT_TEMPLATE_ID: '',
  SMS_INDIA_HUB_TEMPLATE_TEXT: '',
  SMS_INDIA_HUB_PE_ID: '1001164203633432409',
  SMS_INDIA_HUB_ROUTE: '',
  SMS_INDIA_HUB_POWERED_BY: '',
});

const { renderOtpMessage, buildSmsPayload } = await import('./smsService.js');

const REGISTERED_TEMPLATE = 'Dear Customer, your Rentol login OTP is ##var##. Valid for 5 minutes. Do not share it with anyone Rentol global';

test('the OTP message is the registered DLT template with only the OTP filled in', () => {
  const text = renderOtpMessage({ appName: 'Rentol', otp: '482913', senderId: 'RENGPL' });
  assert.equal(text, 'Dear Customer, your Rentol login OTP is 482913. Valid for 5 minutes. Do not share it with anyone Rentol global');

  // everything except the variables is identical to the registered template
  let rest = text;
  for (const part of REGISTERED_TEMPLATE.split('##var##')) {
    const at = rest.indexOf(part);
    assert.notEqual(at, -1, 'missing fixed text: ' + part);
    rest = rest.slice(at + part.length);
  }
});

test('variables longer than 30 characters are cut (DLT limit) and the app name does not change the registered text', () => {
  const template = 'Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.';
  const long = renderOtpMessage({ appName: 'A'.repeat(50), otp: '1234', templateText: template });
  assert.ok(long.startsWith('Welcome to the ' + 'A'.repeat(30) + ' powered by Appzeto.'));
  assert.ok(renderOtpMessage({ appName: '   ', otp: '1234', templateText: template }).startsWith('Welcome to the Rentol powered by Appzeto.'));
  // the built-in template has one slot, so a long or empty app name cannot change the registered text
  assert.equal(renderOtpMessage({ appName: 'A'.repeat(50), otp: '1234' }), renderOtpMessage({ appName: '', otp: '1234' }));
});

test('the request carries the sender id, template id, PE id and API key', () => {
  const payload = buildSmsPayload({ phone: '9876543210', otp: '482913', appName: 'Rentol' });
  assert.equal(payload.get('senderid'), 'RENGPL');
  assert.equal(payload.get('TemplateId'), '1077213090085325073');
  assert.equal(payload.get('DLTTemplateId'), '1077213090085325073');
  assert.match(payload.get('text'), /^Dear Customer, your Rentol login OTP is 482913\. Valid for 5 minutes\./);
  assert.equal(payload.get('PEId'), '1001164203633432409');
  assert.equal(payload.get('APIKey'), 'test-api-key');
  assert.equal(payload.get('number'), '919876543210');
  assert.equal(payload.get('channel'), 'Trans');
  assert.equal(payload.get('route'), null, 'no route unless one is configured');
  assert.match(payload.get('text'), /Do not share it with anyone Rentol global$/);
});

test('a registered template text from the settings replaces the built-in one', () => {
  const custom = renderOtpMessage({
    appName: 'Rentol',
    poweredBy: 'Rentol Logistics',
    otp: '482913',
    senderId: 'BGADEC',
    templateText: 'Your ##var## login code is ##var## ##var## -##sender##',
  });
  assert.equal(custom, 'Your Rentol login code is Rentol Logistics 482913 -BGADEC');
});

test('an invalid phone number is refused before anything is sent', () => {
  assert.throws(() => buildSmsPayload({ phone: '12345', otp: '1', appName: 'Rentol' }), /valid Indian mobile number/);
});
