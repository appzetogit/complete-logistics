// Shared vocabulary of the referral module. The reward rules themselves (types, amounts, ride counts) are
// configured by the admin in AdminBusinessSetting.referral.{user|driver}; nothing here changes them.

export const REFERRER_TYPES = ['user', 'driver'];

// Reward programs the engine understands. Anything else is rejected when the admin saves the settings.
export const SUPPORTED_REFERRAL_TYPES = [
  'instant_referrer',
  'instant_referrer_new',
  'conditional_referrer',
  'conditional_referrer_new',
];

export const ATTRIBUTION_STATUS = {
  CLICKED: 'CLICKED', // /r/<code> was opened and a token was issued
  PENDING: 'PENDING', // the app claimed the token (POST /referrals/attribute)
  ATTRIBUTED: 'ATTRIBUTED', // bound to a driver onboarding session that has not finished yet
  CONVERTED: 'CONVERTED', // an account was created from it
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED',
};

// States from which a token can still be turned into an account.
export const OPEN_ATTRIBUTION_STATUSES = [
  ATTRIBUTION_STATUS.CLICKED,
  ATTRIBUTION_STATUS.PENDING,
  ATTRIBUTION_STATUS.ATTRIBUTED,
];

export const REWARD_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  CREDITED: 'CREDITED',
  FAILED: 'FAILED',
};

// Machine-readable reason codes returned in `details.code` (and as `reason` when a signup goes ahead without the referral).
export const REFERRAL_ERROR = {
  INVALID_REFERRAL: 'invalid_referral',
  INVALID_ATTRIBUTION: 'invalid_attribution',
  EXPIRED_ATTRIBUTION: 'attribution_expired',
  ALREADY_ATTRIBUTED: 'already_attributed',
  SELF_REFERRAL: 'self_referral',
  REFERRER_NOT_FOUND: 'referrer_not_found',
  REFERRAL_DISABLED: 'referral_disabled',
  TYPE_MISMATCH: 'referral_type_mismatch',
  CODE_MISMATCH: 'referral_mismatch',
};

// HTTP status for each reason when it is raised as an error.
export const REFERRAL_ERROR_STATUS = {
  [REFERRAL_ERROR.INVALID_REFERRAL]: 404,
  [REFERRAL_ERROR.INVALID_ATTRIBUTION]: 404,
  [REFERRAL_ERROR.EXPIRED_ATTRIBUTION]: 410,
  [REFERRAL_ERROR.ALREADY_ATTRIBUTED]: 409,
  [REFERRAL_ERROR.SELF_REFERRAL]: 400,
  [REFERRAL_ERROR.REFERRER_NOT_FOUND]: 404,
  [REFERRAL_ERROR.REFERRAL_DISABLED]: 403,
  [REFERRAL_ERROR.TYPE_MISMATCH]: 400,
  [REFERRAL_ERROR.CODE_MISMATCH]: 400,
};

export const REFERRAL_ERROR_MESSAGE = {
  [REFERRAL_ERROR.INVALID_REFERRAL]: 'Invalid referral code',
  [REFERRAL_ERROR.INVALID_ATTRIBUTION]: 'Invalid referral attribution',
  [REFERRAL_ERROR.EXPIRED_ATTRIBUTION]: 'Referral attribution has expired',
  [REFERRAL_ERROR.ALREADY_ATTRIBUTED]: 'Referral attribution was already used',
  [REFERRAL_ERROR.SELF_REFERRAL]: 'You cannot refer yourself',
  [REFERRAL_ERROR.REFERRER_NOT_FOUND]: 'Referrer not found',
  [REFERRAL_ERROR.REFERRAL_DISABLED]: 'Referral program is disabled',
  [REFERRAL_ERROR.TYPE_MISMATCH]: 'This referral link is for a different kind of account',
  [REFERRAL_ERROR.CODE_MISMATCH]: 'Referral code does not match the attribution',
};

// Structured, secret-free event log: only ids and codes, never OTPs, passwords or tokens.
export const logReferral = (event, fields = {}) => {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || /token$/i.test(key) && key !== 'attributionId') continue;
    safe[key] = value instanceof Date ? value.toISOString() : typeof value === 'object' ? String(value) : value;
  }
  console.log(JSON.stringify({ event, at: new Date().toISOString(), ...safe }));
};
