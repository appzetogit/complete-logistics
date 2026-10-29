import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { Driver } from '../../driver/models/Driver.js';
import { User } from '../../user/models/User.js';
import { ReferralReward } from '../models/ReferralReward.js';
import {
  buildReferralLink,
  claimAttributionToken,
  createAttributionFromLink,
  ensureReferralCode,
  isLinkPreviewBot,
} from '../services/referralAttributionService.js';
import { getReferralProgramSettings } from '../services/referralRewardService.js';

const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

// ---- GET /r/:referralCode (public) -------------------------------------------------------------------------------

const pickDestination = (userAgent = '') => {
  const { landingUrl, androidStoreUrl, iosStoreUrl } = env.referral;

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return iosStoreUrl || landingUrl || androidStoreUrl;
  }
  if (/android/i.test(userAgent)) {
    return androidStoreUrl || landingUrl || iosStoreUrl;
  }
  return landingUrl || androidStoreUrl || iosStoreUrl;
};

// Play Store passes `referrer` to the installed app (Install Referrer API); other pages get a plain query value.
const withToken = (destination, token) => {
  const url = new URL(destination);
  if (token) {
    if (/(^|\.)play\.google\.com$/i.test(url.hostname)) {
      url.searchParams.set('referrer', `attribution_token=${token}`);
    } else {
      url.searchParams.set('attribution_token', token);
    }
  }
  return url.toString();
};

const wantsJson = (req) =>
  String(req.query?.format || '').toLowerCase() === 'json' || req.accepts(['html', 'json']) === 'json';

/**
 * Opening a shared link only records a click. It never pays anything: rewards follow the admin's referral
 * settings once the visitor has an account.
 */
export const openReferralLink = async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const userAgent = String(req.headers['user-agent'] || '');
  const destination = pickDestination(userAgent);

  try {
    // chat apps fetch links to build a preview: that is not a person opening it
    if (isLinkPreviewBot(userAgent)) {
      if (destination && !wantsJson(req)) {
        return res.redirect(302, destination);
      }
      return res.json({ success: true, data: { attributed: false } });
    }

    const { attribution, token } = await createAttributionFromLink({
      code: req.params.referralCode,
      ip: clientIp(req),
      userAgent,
      source: 'link',
    });

    if (wantsJson(req) || !destination) {
      return res.json({
        success: true,
        data: {
          attributionToken: token,
          referralType: attribution.referrerType,
          referralCode: attribution.referralCode,
          expiresAt: attribution.expiresAt,
        },
      });
    }

    return res.redirect(302, withToken(destination, token));
  } catch (error) {
    if (!(error instanceof ApiError) || wantsJson(req) || !destination) {
      return next(error);
    }
    // a bad or disabled link still sends the visitor to the app, just without a referral
    return res.redirect(302, destination);
  }
};

// ---- POST /referrals/attribute (public, called by the app) ---------------------------------------------------------

export const claimReferralAttribution = async (req, res) => {
  const result = await claimAttributionToken({ attributionToken: req.body?.attributionToken });
  res.json({ success: true, data: result });
};

// ---- GET /users|drivers/referrals/me and /history (signed in) --------------------------------------------------------

const baseCode = (type, account) => {
  const idPart = String(account._id).slice(-6).toUpperCase();
  const phonePart = String(account.phone || '').slice(-4);
  return `${type === 'driver' ? 'DRV' : 'USR'}${phonePart}${idPart}`.replace(/\W/g, '');
};

const modelFor = (type) => (type === 'driver' ? Driver : User);

export const getMyReferral = (type) => async (req, res) => {
  const account = await modelFor(type).findById(req.auth.sub);

  if (!account) {
    throw new ApiError(404, `${type === 'driver' ? 'Driver' : 'User'} not found`);
  }

  const referralCode = await ensureReferralCode(type, account, baseCode(type, account));
  const settings = await getReferralProgramSettings(type);

  res.json({
    success: true,
    data: {
      referralCode,
      referralLink: buildReferralLink(referralCode, req),
      referralCount: Number(account.referralCount || 0),
      program: {
        enabled: settings.enabled,
        type: settings.type,
        amount: settings.amount,
        rideCount: settings.rideCount,
      },
    },
  });
};

const maskPhone = (phone = '') => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 4 ? `${'X'.repeat(digits.length - 4)}${digits.slice(-4)}` : '';
};

const firstName = (name = '') => String(name || '').trim().split(/\s+/)[0] || '';

export const getMyReferralHistory = (type) => async (req, res) => {
  const meId = req.auth.sub;
  const Model = modelFor(type);
  const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 20));

  const [referred, total, settings] = await Promise.all([
    Model.find({ referredBy: meId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('name phone createdAt referralRewardGrantedAt referredRideCompletionCount')
      .lean(),
    Model.countDocuments({ referredBy: meId }),
    getReferralProgramSettings(type),
  ]);

  const rewards = referred.length
    ? await ReferralReward.find({
        payeeType: type,
        payeeId: meId,
        referredId: { $in: referred.map((item) => item._id) },
      })
        .select('referredId amount status creditedAt')
        .lean()
    : [];
  const rewardByReferred = new Map(rewards.map((reward) => [String(reward.referredId), reward]));
  const conditional = ['conditional_referrer', 'conditional_referrer_new'].includes(settings.type);

  res.json({
    success: true,
    data: {
      items: referred.map((item) => {
        const reward = rewardByReferred.get(String(item._id));
        const paid = reward?.status === 'CREDITED' || Boolean(item.referralRewardGrantedAt);
        const rideCount = Number(item.referredRideCompletionCount || 0);

        return {
          id: String(item._id),
          name: firstName(item.name),
          phone: maskPhone(item.phone),
          joinedAt: item.createdAt,
          qualification: {
            required: conditional ? Math.max(1, settings.rideCount || 1) : 0,
            completed: conditional ? rideCount : 0,
            qualified: !conditional || paid || rideCount >= Math.max(1, settings.rideCount || 1),
          },
          reward: {
            status: reward ? String(reward.status).toLowerCase() : paid ? 'credited' : 'pending',
            amount: reward ? reward.amount : null,
            creditedAt: reward?.creditedAt || null,
          },
        };
      }),
      page,
      limit,
      total,
    },
  });
};
