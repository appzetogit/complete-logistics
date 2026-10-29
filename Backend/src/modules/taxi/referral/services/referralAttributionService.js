import crypto from 'node:crypto';
import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';
import {
  ATTRIBUTION_STATUS,
  OPEN_ATTRIBUTION_STATUSES,
  REFERRAL_ERROR,
  REFERRAL_ERROR_MESSAGE,
  REFERRAL_ERROR_STATUS,
  logReferral,
} from '../constants.js';
import { ReferralAttribution } from '../models/ReferralAttribution.js';
import { getReferralProgramSettings } from './referralRewardService.js';

/*
 * Attribution policy (first conversion wins):
 *  - every opened link issues its own token; the app should keep the latest valid one it received;
 *  - a token can be turned into exactly one account, and an account's `referredBy` is never overwritten;
 *  - opening a link never pays anything: rewards follow the admin's referral settings once the account exists.
 */

const BOT_USER_AGENT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|twitter|pinterest|curl|wget|python-requests|okhttp\/.*(link)/i;

export const isLinkPreviewBot = (userAgent = '') => BOT_USER_AGENT.test(String(userAgent || ''));

export const normalizeReferralCodeInput = (value) => String(value || '').trim().toUpperCase();

export const tenDigitPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const hashAttributionToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');

// status a token had before it was claimed for an account, so a failed signup can put it back
const previousStatuses = new WeakMap();

const generateAttributionToken = () => crypto.randomBytes(32).toString('base64url');

const referralError = (reason, extra = {}) =>
  new ApiError(REFERRAL_ERROR_STATUS[reason] || 400, REFERRAL_ERROR_MESSAGE[reason] || 'Referral error', {
    code: reason,
    ...extra,
  });

const modelFor = (type) => (type === 'driver' ? Driver : User);

/** USR... belongs to users, DRV... to drivers; anything else (older codes) is looked up in both. */
export const findReferrerByCode = async (code, preferredType = null) => {
  const normalized = normalizeReferralCodeInput(code);

  if (!normalized) {
    return null;
  }

  const order = preferredType
    ? [preferredType]
    : normalized.startsWith('DRV')
      ? ['driver', 'user']
      : ['user', 'driver'];

  for (const type of order) {
    const doc = await modelFor(type).findOne({ referralCode: normalized });
    if (doc) {
      return { type, doc };
    }
  }

  return null;
};

export const isReferrerEligible = (type, doc) => {
  if (!doc || doc.deletedAt) {
    return false;
  }

  if (type === 'driver') {
    return !['blocked', 'rejected', 'suspended'].includes(String(doc.status || '').toLowerCase());
  }

  return doc.isActive !== false && doc.active !== false;
};

const isSelfReferral = ({ referrerType, referrer, flow, referredPhone, referredAccountId }) => {
  if (referredAccountId && referrerType === flow && String(referrer._id) === String(referredAccountId)) {
    return true;
  }

  const phone = tenDigitPhone(referredPhone);
  return Boolean(phone) && phone === tenDigitPhone(referrer.phone);
};

const expireIfNeeded = async (attribution) => {
  if (
    attribution.status !== ATTRIBUTION_STATUS.ATTRIBUTED &&
    OPEN_ATTRIBUTION_STATUSES.includes(attribution.status) &&
    new Date(attribution.expiresAt).getTime() <= Date.now()
  ) {
    await ReferralAttribution.updateOne(
      { _id: attribution._id, status: { $in: OPEN_ATTRIBUTION_STATUSES } },
      { $set: { status: ATTRIBUTION_STATUS.EXPIRED } },
    );
    attribution.status = ATTRIBUTION_STATUS.EXPIRED;
    logReferral('REFERRAL_ATTRIBUTION_EXPIRED', { attributionId: String(attribution._id) });
  }
};

// ---- 1. opening the link ----------------------------------------------------------------------------------------

export const createAttributionFromLink = async ({ code, ip = '', userAgent = '', source = 'link' }) => {
  const normalized = normalizeReferralCodeInput(code);
  const found = normalized ? await findReferrerByCode(normalized) : null;

  logReferral('REFERRAL_LINK_CLICKED', { referralCode: normalized, found: Boolean(found) });

  if (!found) {
    throw referralError(REFERRAL_ERROR.INVALID_REFERRAL);
  }

  if (!isReferrerEligible(found.type, found.doc)) {
    throw referralError(REFERRAL_ERROR.REFERRER_NOT_FOUND);
  }

  const settings = await getReferralProgramSettings(found.type);
  if (!settings.enabled) {
    throw referralError(REFERRAL_ERROR.REFERRAL_DISABLED);
  }

  const token = generateAttributionToken();
  const attribution = await ReferralAttribution.create({
    referralCode: normalized,
    referrerType: found.type,
    referrerId: found.doc._id,
    tokenHash: hashAttributionToken(token),
    expiresAt: new Date(Date.now() + env.referral.attributionTtlHours * 60 * 60 * 1000),
    metadata: {
      source,
      // a hash, not the address itself
      ipHash: ip ? crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32) : '',
      userAgent: String(userAgent || '').slice(0, 200),
    },
  });

  logReferral('REFERRAL_ATTRIBUTION_CREATED', {
    attributionId: String(attribution._id),
    referralCode: normalized,
    referrerId: String(found.doc._id),
    referrerType: found.type,
  });

  return { attribution, token };
};

// ---- 2. the app claims the token ---------------------------------------------------------------------------------

const loadAttributionByToken = async (attributionToken) => {
  const token = String(attributionToken || '').trim();
  if (!token || token.length > 200) {
    return null;
  }
  return ReferralAttribution.findOne({ tokenHash: hashAttributionToken(token) });
};

/** Explains why an attribution cannot be used, or returns null when it can. */
const attributionProblem = async (attribution) => {
  await expireIfNeeded(attribution);

  switch (attribution.status) {
    case ATTRIBUTION_STATUS.EXPIRED:
      return REFERRAL_ERROR.EXPIRED_ATTRIBUTION;
    case ATTRIBUTION_STATUS.CONVERTED:
      return REFERRAL_ERROR.ALREADY_ATTRIBUTED;
    case ATTRIBUTION_STATUS.REJECTED:
      return REFERRAL_ERROR.INVALID_ATTRIBUTION;
    default:
      return null;
  }
};

export const claimAttributionToken = async ({ attributionToken }) => {
  const attribution = await loadAttributionByToken(attributionToken);

  if (!attribution) {
    throw referralError(REFERRAL_ERROR.INVALID_ATTRIBUTION);
  }

  const problem = await attributionProblem(attribution);
  if (problem) {
    throw referralError(problem);
  }

  const referrer = await modelFor(attribution.referrerType).findById(attribution.referrerId).select('deletedAt isActive active status phone');
  if (!isReferrerEligible(attribution.referrerType, referrer)) {
    await ReferralAttribution.updateOne(
      { _id: attribution._id },
      { $set: { status: ATTRIBUTION_STATUS.REJECTED, failureReason: REFERRAL_ERROR.REFERRER_NOT_FOUND } },
    );
    throw referralError(REFERRAL_ERROR.REFERRER_NOT_FOUND);
  }

  if (attribution.status === ATTRIBUTION_STATUS.CLICKED) {
    attribution.status = ATTRIBUTION_STATUS.PENDING;
    attribution.claimedAt = new Date();
    await ReferralAttribution.updateOne(
      { _id: attribution._id, status: ATTRIBUTION_STATUS.CLICKED },
      { $set: { status: ATTRIBUTION_STATUS.PENDING, claimedAt: attribution.claimedAt } },
    );
  }

  logReferral('REFERRAL_ATTRIBUTION_RESOLVED', {
    attributionId: String(attribution._id),
    referrerId: String(attribution.referrerId),
    status: attribution.status,
  });

  return {
    referralType: attribution.referrerType,
    referrerId: String(attribution.referrerId),
    status: String(attribution.status).toLowerCase(),
    expiresAt: attribution.expiresAt,
  };
};

// ---- 3. signup / onboarding ---------------------------------------------------------------------------------------

/**
 * Works out who referred a new account. Does not change anything.
 *
 *  - attribution token first; a legacy `referralCode` sent with it must belong to the same referrer, else 400;
 *  - a token that is stale, used, self-referral and so on does NOT block the signup: it returns { applied: false, reason };
 *  - a legacy code alone keeps the old rules (unknown code: 400).
 *
 * Returns { applied, referrer, referrerType, attribution, reason }.
 */
export const resolveReferralForSignup = async ({
  attributionToken = '',
  referralCode = '',
  flow,
  referredPhone = '',
  referredAccountId = null,
}) => {
  const code = normalizeReferralCodeInput(referralCode);
  const token = String(attributionToken || '').trim();

  if (token) {
    const attribution = await loadAttributionByToken(token);
    const stop = (reason) => ({ applied: false, referrer: null, referrerType: null, attribution: null, reason });

    if (!attribution) {
      return stop(REFERRAL_ERROR.INVALID_ATTRIBUTION);
    }

    if (code && code !== attribution.referralCode) {
      throw referralError(REFERRAL_ERROR.CODE_MISMATCH);
    }

    const problem = await attributionProblem(attribution);
    if (problem) {
      return stop(problem);
    }

    if (attribution.referrerType !== flow) {
      return stop(REFERRAL_ERROR.TYPE_MISMATCH);
    }

    const referrer = await modelFor(flow).findById(attribution.referrerId);
    if (!isReferrerEligible(flow, referrer)) {
      return stop(REFERRAL_ERROR.REFERRER_NOT_FOUND);
    }

    if (isSelfReferral({ referrerType: flow, referrer, flow, referredPhone, referredAccountId })) {
      logReferral('REFERRAL_SELF_REFERRAL_BLOCKED', { attributionId: String(attribution._id), referrerId: String(referrer._id) });
      return stop(REFERRAL_ERROR.SELF_REFERRAL);
    }

    return { applied: true, referrer, referrerType: flow, attribution, reason: '' };
  }

  if (code) {
    const found = await findReferrerByCode(code, flow);

    if (!found || !isReferrerEligible(flow, found.doc)) {
      // legacy clients typed this code themselves, so it keeps its 400
      throw new ApiError(400, REFERRAL_ERROR_MESSAGE[REFERRAL_ERROR.INVALID_REFERRAL], { code: REFERRAL_ERROR.INVALID_REFERRAL });
    }

    if (isSelfReferral({ referrerType: flow, referrer: found.doc, flow, referredPhone, referredAccountId })) {
      logReferral('REFERRAL_SELF_REFERRAL_BLOCKED', { referralCode: code, referrerId: String(found.doc._id) });
      throw referralError(REFERRAL_ERROR.SELF_REFERRAL);
    }

    return { applied: true, referrer: found.doc, referrerType: flow, attribution: null, reason: '' };
  }

  return { applied: false, referrer: null, referrerType: null, attribution: null, reason: '' };
};

/**
 * Takes a token for one account. Only one caller can: returns false when someone else already converted it,
 * so two signups cannot share a click. Call releaseAttribution() if the account then fails to be created.
 */
export const claimAttributionForConversion = async (attribution, { referredPhone = '', registrationId = '' } = {}) => {
  if (!attribution) {
    return true;
  }

  const claimed = await ReferralAttribution.findOneAndUpdate(
    {
      _id: attribution._id,
      status: { $in: OPEN_ATTRIBUTION_STATUSES },
      ...(registrationId ? { $or: [{ registrationId }, { registrationId: '' }] } : {}),
    },
    {
      $set: {
        status: ATTRIBUTION_STATUS.CONVERTED,
        convertedAt: new Date(),
        referredPhone: tenDigitPhone(referredPhone),
        ...(registrationId ? { registrationId } : {}),
      },
    },
    { returnDocument: 'before' },
  );

  if (!claimed) {
    return false;
  }

  // remembered for a rollback
  previousStatuses.set(attribution, claimed.status);
  return true;
};

export const releaseAttribution = async (attribution) => {
  if (!attribution?._id) {
    return;
  }

  await ReferralAttribution.updateOne(
    { _id: attribution._id, status: ATTRIBUTION_STATUS.CONVERTED, referredUserId: null, referredDriverId: null },
    {
      $set: {
        status: previousStatuses.get(attribution) || ATTRIBUTION_STATUS.PENDING,
        convertedAt: null,
        referredPhone: '',
      },
    },
  );
};

export const recordConversion = async ({ attribution, referredType, referredId, referrerId }) => {
  if (attribution?._id) {
    await ReferralAttribution.updateOne(
      { _id: attribution._id },
      { $set: referredType === 'driver' ? { referredDriverId: referredId } : { referredUserId: referredId } },
    );
  }

  logReferral('REFERRAL_SIGNUP_CONVERTED', {
    attributionId: attribution?._id ? String(attribution._id) : '',
    referrerId: String(referrerId),
    referredType,
    referredId: String(referredId),
    via: attribution ? 'attribution' : 'legacy_code',
  });
};

// ---- driver onboarding: bind now, convert when the account is created -----------------------------------------

/** Used by PATCH /drivers/onboarding/referral. Throws a coded error when the token cannot be used. */
export const bindAttributionToRegistration = async ({ attributionToken, referralCode = '', phone, registrationId }) => {
  const result = await resolveReferralForSignup({
    attributionToken,
    referralCode,
    flow: 'driver',
    referredPhone: phone,
  });

  if (!result.applied) {
    throw referralError(result.reason || REFERRAL_ERROR.INVALID_ATTRIBUTION);
  }

  const bound = await ReferralAttribution.findOneAndUpdate(
    {
      _id: result.attribution._id,
      status: { $in: OPEN_ATTRIBUTION_STATUSES },
      $or: [{ registrationId }, { registrationId: '' }],
    },
    {
      $set: {
        status: ATTRIBUTION_STATUS.ATTRIBUTED,
        attributedAt: new Date(),
        registrationId,
        referredPhone: tenDigitPhone(phone),
      },
    },
    { returnDocument: 'after' },
  );

  if (!bound) {
    throw referralError(REFERRAL_ERROR.ALREADY_ATTRIBUTED);
  }

  return bound;
};

/** Frees a token bound to a registration that picked another referral (or none). */
export const unbindAttributionFromRegistration = async (attributionId, registrationId) => {
  if (!attributionId) {
    return;
  }

  await ReferralAttribution.updateOne(
    { _id: attributionId, status: ATTRIBUTION_STATUS.ATTRIBUTED, registrationId },
    { $set: { status: ATTRIBUTION_STATUS.PENDING, registrationId: '', referredPhone: '' } },
  );
};

/** At account creation: the attribution bound to this onboarding session, if it is still good. */
export const resolveBoundAttribution = async ({ attributionId, registrationId, phone }) => {
  if (!attributionId) {
    return { applied: false, referrer: null, attribution: null, reason: '' };
  }

  const attribution = await ReferralAttribution.findById(attributionId);

  if (
    !attribution ||
    attribution.status !== ATTRIBUTION_STATUS.ATTRIBUTED ||
    attribution.registrationId !== registrationId ||
    attribution.referrerType !== 'driver'
  ) {
    return { applied: false, referrer: null, attribution: null, reason: REFERRAL_ERROR.INVALID_ATTRIBUTION };
  }

  const referrer = await Driver.findById(attribution.referrerId);
  if (!isReferrerEligible('driver', referrer)) {
    return { applied: false, referrer: null, attribution: null, reason: REFERRAL_ERROR.REFERRER_NOT_FOUND };
  }

  if (isSelfReferral({ referrerType: 'driver', referrer, flow: 'driver', referredPhone: phone })) {
    logReferral('REFERRAL_SELF_REFERRAL_BLOCKED', { attributionId: String(attribution._id), referrerId: String(referrer._id) });
    return { applied: false, referrer: null, attribution: null, reason: REFERRAL_ERROR.SELF_REFERRAL };
  }

  return { applied: true, referrer, attribution, reason: '' };
};

// ---- own code and link -----------------------------------------------------------------------------------------------

const randomSuffix = () => crypto.randomBytes(2).toString('hex').toUpperCase();

/** Gives the account a unique referral code if it has none. Safe under races and collisions. */
export const ensureReferralCode = async (type, account, baseCode) => {
  if (String(account.referralCode || '').trim()) {
    return account.referralCode;
  }

  const Model = modelFor(type);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 ? baseCode : `${baseCode}${randomSuffix()}`;

    try {
      const updated = await Model.findOneAndUpdate(
        { _id: account._id, $or: [{ referralCode: '' }, { referralCode: { $exists: false } }, { referralCode: null }] },
        { $set: { referralCode: candidate } },
        { returnDocument: 'after' },
      ).select('referralCode');

      const code = updated?.referralCode || (await Model.findById(account._id).select('referralCode'))?.referralCode || candidate;
      account.referralCode = code;
      return code;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  throw new ApiError(500, 'Could not create a referral code');
};

export const buildReferralLink = (code, req = null) => {
  const base =
    env.referral.baseUrl ||
    (req ? `${req.protocol}://${req.get('host')}` : '');

  return base && code ? `${base}/r/${encodeURIComponent(code)}` : null;
};
