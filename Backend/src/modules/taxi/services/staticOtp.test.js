import assert from 'node:assert/strict';
import test from 'node:test';

// env.js reads process.env when it is first imported, so set everything before the import
Object.assign(process.env, {
  NODE_ENV: 'test',
  USE_DEFAULT_OTP: 'false',
  STATIC_OTP_CODE: '123456',
  STATIC_OTP_USER_PHONE: '1111111111',
  STATIC_OTP_DRIVER_PHONE: '2222222222, 3333333333',
  STATIC_OTP_PHONE: '',
});

const { getStaticOtpCode, normalizeOtpInput, staticOtpFor } = await import('./staticOtp.js');

test('each app has its own fixed-OTP numbers', () => {
  assert.equal(staticOtpFor('user', '1111111111'), '123456');
  assert.equal(staticOtpFor('driver', '2222222222'), '123456');
  assert.equal(staticOtpFor('driver', '3333333333'), '123456', 'a list of numbers is allowed');
  assert.equal(staticOtpFor('driver', '1111111111'), '', 'the customer test number is not a driver test number');
  assert.equal(staticOtpFor('user', '2222222222'), '', 'the driver test number is not a customer test number');
});

test('numbers are matched with or without +91', () => {
  assert.equal(staticOtpFor('user', '+91 11111 11111'), '123456');
  assert.equal(staticOtpFor('driver', '912222222222'), '123456');
});

test('every other number gets a normal OTP (no fixed code)', () => {
  for (const phone of ['9876543210', '7610416911', '6268423925', '', undefined]) {
    assert.equal(staticOtpFor('user', phone), '', String(phone));
    assert.equal(staticOtpFor('driver', phone), '', String(phone));
  }
  // the old hard-coded test logins (OTP 0000) are gone
  assert.equal(normalizeOtpInput('user', '7610416911', '0000').otp, '0000');
});

test('a fixed-OTP number may type the full code or its first four digits', () => {
  assert.deepEqual(normalizeOtpInput('user', '1111111111', '123456'), { otp: '123456', valid: true });
  assert.deepEqual(normalizeOtpInput('user', '1111111111', ' 1234 '), { otp: '123456', valid: true });
  assert.equal(normalizeOtpInput('user', '1111111111', '123457').valid, false);
  assert.equal(normalizeOtpInput('user', '1111111111', '12345').valid, false);
  assert.equal(normalizeOtpInput('user', '1111111111', '4321').valid, true, 'a 4-digit code is well formed (checked against the hash later)');
  assert.notEqual(normalizeOtpInput('user', '1111111111', '4321').otp, '123456');
});

test('normal numbers still need exactly four digits and never get the shortcut', () => {
  assert.equal(normalizeOtpInput('user', '9876543210', '1234').otp, '1234');
  assert.equal(normalizeOtpInput('user', '9876543210', '123456').valid, false);
  assert.equal(normalizeOtpInput('user', '9876543210', 'abcd').valid, false);
  assert.equal(normalizeOtpInput('driver', '1111111111', '1234').otp, '1234', 'the customer test number gets no shortcut in the driver app');
});

test('the fixed code must be 4 to 6 digits', () => {
  assert.equal(getStaticOtpCode(), '123456');
});
