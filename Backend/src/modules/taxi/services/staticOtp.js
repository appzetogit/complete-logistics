import { env } from '../../../config/env.js';

/**
 * Fixed-OTP test accounts (for app-store review, demos and QA). Nothing is hard-coded: the numbers and the
 * code come from the environment, so a server without these settings has no test logins at all.
 *
 *   STATIC_OTP_CODE=123456            the fixed code (4 to 6 digits)
 *   STATIC_OTP_USER_PHONE=1111111111  customer-app numbers that use it (comma-separated list allowed)
 *   STATIC_OTP_DRIVER_PHONE=2222222222  driver-app numbers that use it
 *   STATIC_OTP_PHONE=...              older single setting, still honoured for both apps
 *
 * Only the listed numbers get the fixed code. Everyone else gets a random OTP by SMS as usual.
 * The apps only have four OTP boxes, so for these numbers the first four digits of a longer code
 * (1234 for 123456) are accepted as well.
 */

const tenDigits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const phoneSet = (...values) =>
  new Set(
    values
      .flatMap((value) => String(value || '').split(/[\s,;]+/))
      .map(tenDigits)
      .filter(Boolean),
  );

/** The fixed code, or '' when it is missing or not 4 to 6 digits. */
export const getStaticOtpCode = () => {
  const code = String(env.sms?.staticOtpCode || '').trim();
  return /^\d{4,6}$/.test(code) ? code : '';
};

const phonesFor = (flow) =>
  flow === 'user'
    ? phoneSet(env.sms?.staticOtpUserPhones, env.sms?.staticOtpPhone)
    : phoneSet(env.sms?.staticOtpDriverPhones, env.sms?.staticOtpPhone);

/** The fixed OTP for this number in this app ('user' or 'driver'), or '' when it is a normal number. */
export const staticOtpFor = (flow, phone) => {
  const code = getStaticOtpCode();
  return code && phonesFor(flow).has(tenDigits(phone)) ? code : '';
};

/**
 * What the person typed, cleaned up: { otp, valid }. A normal OTP is exactly 4 digits. A fixed-OTP number
 * may type the full code or its first four digits; both come back as the full code.
 */
export const normalizeOtpInput = (flow, phone, entered) => {
  const typed = String(entered ?? '').trim();
  const code = staticOtpFor(flow, phone);

  if (code && (typed === code || typed === code.slice(0, 4))) {
    return { otp: code, valid: true };
  }

  return { otp: typed, valid: /^\d{4}$/.test(typed) };
};
