import crypto from 'node:crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { env } from '../../../../config/env.js';
import { UserAuthSession } from '../models/UserAuthSession.js';
import { User } from '../models/User.js';
import { signAccessToken } from './authService.js';
import { sendOtpSms } from '../../services/smsService.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_SESSION_TTL_MS = 10 * 60 * 1000;

export const normalizeUserPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

export const validateUserPhone = (phone) => {
  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'A valid 10-digit phone number is required');
  }
};

const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const getVisibleOtp = (otp) => (process.env.NODE_ENV !== 'production' ? String(otp) : null);
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const TEST_LOGIN_OTP_PHONE = '7610416911';
const TEST_LOGIN_OTP_CODE = '0000';
const getStaticUserOtpConfig = () => ({
  phone: normalizeUserPhone(env.sms?.staticOtpPhone || TEST_LOGIN_OTP_PHONE),
  otp: String(env.sms?.staticOtpCode || TEST_LOGIN_OTP_CODE).trim(),
});
const resolveUserOtpForPhone = (phone) => {
  const normalizedPhone = normalizeUserPhone(phone);
  const staticOtpConfig = getStaticUserOtpConfig();
  const defaultOtpEnabled = isTruthy(env.sms?.useDefaultOtp);

  if (defaultOtpEnabled && staticOtpConfig.otp) {
    return {
      otp: staticOtpConfig.otp,
      isStatic: true,
    };
  }

  if (staticOtpConfig.phone && staticOtpConfig.otp && normalizedPhone === staticOtpConfig.phone) {
    return {
      otp: staticOtpConfig.otp,
      isStatic: true,
    };
  }

  return {
    otp: generateOtp(),
    isStatic: false,
  };
};

const ensureUserCanLogin = (user) => {
  if (user?.deletedAt || user?.isActive === false || user?.active === false) {
    throw new ApiError(403, 'User account is not active');
  }
};

const isReusableSignupUser = (user) => Boolean(user?.deletedAt);

const toUserPayload = (user) => ({
  id: user._id,
  name: user.name || '',
  phone: user.phone || '',
  email: user.email || '',
  gender: user.gender || '',
  currentRideId: user.currentRideId || null,
});

const createUserSession = (user) => ({
  token: signAccessToken({ sub: String(user._id), role: 'user' }),
  user: toUserPayload(user),
});

const getOtpSession = async (phone) => {
  const normalizedPhone = normalizeUserPhone(phone);
  const session = await UserAuthSession.findOne({ phone: normalizedPhone }).select('+otpHash');

  if (!session) {
    throw new ApiError(404, 'OTP session not found');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await UserAuthSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'OTP session expired');
  }

  return session;
};

const publicOtpSession = (session, debugOtp = null) => ({
  phone: session.phone,
  status: session.otpVerifiedAt ? 'otp_verified' : 'otp_sent',
  debugOtp,
});

export const startUserOtp = async ({ phone }) => {
  const normalizedPhone = normalizeUserPhone(phone);
  validateUserPhone(normalizedPhone);

  const user = await User.findOne({ phone: normalizedPhone }).lean();

  if (user && !isReusableSignupUser(user)) {
    ensureUserCanLogin(user);
  }

  const { otp, isStatic } = resolveUserOtpForPhone(normalizedPhone);
  const now = Date.now();

  const session = await UserAuthSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      otpVerifiedAt: null,
      expiresAt: new Date(now + OTP_TTL_MS),
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  );

  const smsDispatch = isStatic
    ? {
        mode: 'static',
        message: 'Static OTP enabled',
      }
    : await sendOtpSms({
        phone: normalizedPhone,
        otp,
        purpose: 'user OTP',
      });
  const debugOtp = getVisibleOtp(otp);

  if (debugOtp) {
    console.log(`[userOtpService] OTP for ${normalizedPhone} = ${debugOtp} (${smsDispatch.mode})`);
  }

  return {
    message: smsDispatch.mode === 'live' ? 'OTP sent successfully' : 'OTP generated successfully',
    exists: Boolean(user && !isReusableSignupUser(user)),
    session: publicOtpSession(session, debugOtp),
  };
};

export const verifyUserOtp = async ({ phone, otp }) => {
  const session = await getOtpSession(phone);
  const normalizedOtp = String(otp || '').trim();

  if (!/^\d{4}$/.test(normalizedOtp)) {
    throw new ApiError(400, 'A valid 4-digit OTP is required');
  }

  if (!session.otpExpiresAt || new Date(session.otpExpiresAt).getTime() < Date.now()) {
    await UserAuthSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'OTP has expired');
  }

  if (session.otpHash !== hashOtp(normalizedOtp)) {
    throw new ApiError(401, 'Invalid OTP');
  }

  const user = await User.findOne({ phone: session.phone });

  if (user) {
    if (isReusableSignupUser(user)) {
      session.otpVerifiedAt = new Date();
      session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
      await session.save();

      return {
        exists: false,
        phone: session.phone,
        session: publicOtpSession(session),
      };
    }

    ensureUserCanLogin(user);
    await UserAuthSession.deleteOne({ _id: session._id });
    return {
      exists: true,
      ...createUserSession(user),
    };
  }

  session.otpVerifiedAt = new Date();
  session.expiresAt = new Date(Date.now() + VERIFIED_SESSION_TTL_MS);
  await session.save();

  return {
    exists: false,
    phone: session.phone,
    session: publicOtpSession(session),
  };
};

export const requireVerifiedUserSignupSession = async (phone) => {
  const session = await getOtpSession(phone);

  if (!session.otpVerifiedAt) {
    throw new ApiError(400, 'Verify OTP before signup');
  }

  return session;
};

export const consumeUserSignupSession = (session) => UserAuthSession.deleteOne({ _id: session._id });
