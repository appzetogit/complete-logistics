import crypto from 'node:crypto';
import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { sendOtpSms } from '../../services/smsService.js';
import { signAccessToken } from './authService.js';
import { PoolingDriverOnboardingSession } from '../models/PoolingDriverOnboardingSession.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const TEST_LOGIN_OTP_PHONE = '6268423925';
const TEST_LOGIN_OTP_CODE = '0000';

const VEHICLE_TYPES = new Set(['bike', 'hatchback', 'sedan', 'suv', 'van', 'luxury']);

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').trim();
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const buildPhoneCandidates = (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const candidates = new Set();

  if (normalizedPhone) {
    candidates.add(normalizedPhone);
    candidates.add(`91${normalizedPhone}`);
    candidates.add(`+91${normalizedPhone}`);
  }

  return [...candidates];
};

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const getVisibleOtp = (otp) => (process.env.NODE_ENV !== 'production' ? String(otp) : null);
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const getStaticDriverOtpConfig = () => ({
  phone: normalizePhone(env.sms?.staticOtpPhone || TEST_LOGIN_OTP_PHONE),
  otp: String(env.sms?.staticOtpCode || TEST_LOGIN_OTP_CODE).trim(),
});

const resolveDriverLoginOtpForPhone = (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const staticOtpConfig = getStaticDriverOtpConfig();
  const defaultOtpEnabled = isTruthy(env.sms?.useDefaultOtp);

  if (defaultOtpEnabled && staticOtpConfig.otp) {
    return { otp: staticOtpConfig.otp, isStatic: true };
  }

  if (staticOtpConfig.phone && staticOtpConfig.otp && normalizedPhone === staticOtpConfig.phone) {
    return { otp: staticOtpConfig.otp, isStatic: true };
  }

  return { otp: generateOtp(), isStatic: false };
};

const generateRegistrationId = () => `pool-${crypto.randomBytes(8).toString('hex')}`;

const normalizeVehicleNumber = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const sanitizeVehicleDraft = (draft = {}) => ({
  name: String(draft.name || '').trim(),
  vehicleModel: String(draft.vehicleModel || '').trim(),
  vehicleNumber: normalizeVehicleNumber(draft.vehicleNumber),
  driverName: String(draft.driverName || '').trim(),
  color: String(draft.color || '').trim(),
  capacity: Math.max(1, Number(draft.capacity || 1)),
  vehicleType: VEHICLE_TYPES.has(String(draft.vehicleType || '').trim().toLowerCase())
    ? String(draft.vehicleType).trim().toLowerCase()
    : 'sedan',
  images: Array.isArray(draft.images)
    ? draft.images.map((item) => String(item || '').trim()).filter(Boolean)
    : [],
  blueprint:
    draft.blueprint && typeof draft.blueprint === 'object' && !Array.isArray(draft.blueprint)
      ? draft.blueprint
      : {},
});

const publicSessionPayload = (session, debugOtp = null) => ({
  registrationId: session.registrationId,
  phone: session.phone,
  role: session.role || 'pooling_driver',
  status: session.status,
  otpVerified: Boolean(session.verifiedAt),
  debugOtp,
});

const publicOnboardingPayload = (session, debugOtp = null) => ({
  session: publicSessionPayload(session, debugOtp),
  personal: {
    fullName: session.driverName || '',
  },
  vehicle: sanitizeVehicleDraft({
    driverName: session.driverName || '',
    ...(session.vehicleDraft || {}),
  }),
});

const publicPoolingDriverPayload = (vehicle) => ({
  id: vehicle._id,
  name: vehicle.driverName || 'Pooling Driver',
  phone: vehicle.driverPhone || '',
  approve: vehicle.approve !== false,
  active: vehicle.poolingEnabled !== false,
  status: vehicle.status || 'active',
  vehicleId: vehicle._id,
  vehicleName: vehicle.name || '',
  vehicleNumber: vehicle.vehicleNumber || '',
  vehicleModel: vehicle.vehicleModel || '',
  vehicleType: vehicle.vehicleType || 'sedan',
  vehicleColor: vehicle.color || '',
});

const getSession = async ({ registrationId, phone, withOtp = false }) => {
  const normalizedPhone = normalizePhone(phone);
  const query = {
    registrationId: String(registrationId || '').trim(),
    phone: normalizedPhone,
  };
  const request = PoolingDriverOnboardingSession.findOne(query);
  if (withOtp) {
    request.select('+otpHash');
  }

  const session = await request;

  if (!session) {
    throw new ApiError(404, 'Pooling onboarding session not found');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await PoolingDriverOnboardingSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'Pooling onboarding session expired');
  }

  return session;
};

const ensurePhoneAvailable = async (phone) => {
  const phoneCandidates = buildPhoneCandidates(phone);
  const existingVehicle = await PoolingVehicle.findOne({
    driverPhone: { $in: phoneCandidates },
  }).lean();

  if (existingVehicle) {
    throw new ApiError(409, 'Pooling driver account already registered');
  }
};

const ensureVehicleNumberAvailable = async (vehicleNumber, excludeVehicleId = null) => {
  if (!vehicleNumber) {
    throw new ApiError(400, 'Vehicle number is required');
  }

  const existingVehicle = await PoolingVehicle.findOne({
    vehicleNumber,
    ...(excludeVehicleId ? { _id: { $ne: excludeVehicleId } } : {}),
  }).lean();

  if (existingVehicle) {
    throw new ApiError(409, 'Vehicle number is already registered');
  }
};

const sendOtpForSession = async (phone, otp, isStatic = false) => {
  const normalizedPhone = normalizePhone(phone);

  if (isStatic) {
    return {
      mode: 'static',
      message: 'Static OTP enabled',
    };
  }

  return sendOtpSms({
    phone: normalizedPhone,
    otp,
    purpose: 'pooling onboarding OTP',
  });
};

export const startPoolingDriverOnboarding = async ({ phone }) => {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone || normalizedPhone.length !== 10) {
    throw new ApiError(400, 'A valid 10-digit mobile number is required');
  }

  await ensurePhoneAvailable(normalizedPhone);

  const existingSession = await PoolingDriverOnboardingSession.findOne({ phone: normalizedPhone });
  const registrationId = existingSession?.registrationId || generateRegistrationId();
  const { otp, isStatic } = resolveDriverLoginOtpForPhone(normalizedPhone);
  const now = Date.now();

  const session = await PoolingDriverOnboardingSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      registrationId,
      phone: normalizedPhone,
      role: 'pooling_driver',
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      expiresAt: new Date(now + SESSION_TTL_MS),
      verifiedAt: null,
      status: 'otp_sent',
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    },
  );

  const smsDispatch = await sendOtpForSession(normalizedPhone, otp, isStatic);
  const debugOtp = getVisibleOtp(otp);

  if (debugOtp) {
    console.log(`[poolingOnboardingService] OTP for ${normalizedPhone} = ${debugOtp} (${smsDispatch.mode})`);
  }

  return {
    message: smsDispatch.mode === 'live' ? 'OTP sent successfully' : 'OTP generated successfully',
    session: publicSessionPayload(session, debugOtp),
  };
};

export const verifyPoolingDriverOnboardingOtp = async ({ registrationId, phone, otp }) => {
  const session = await getSession({ registrationId, phone, withOtp: true });

  if (!otp || String(otp).trim().length !== 4) {
    throw new ApiError(400, 'A valid 4-digit OTP is required');
  }

  if (!session.otpExpiresAt || new Date(session.otpExpiresAt).getTime() < Date.now()) {
    throw new ApiError(410, 'OTP has expired');
  }

  if (session.otpHash !== hashOtp(otp)) {
    throw new ApiError(401, 'Invalid OTP');
  }

  session.verifiedAt = new Date();
  session.status = 'otp_verified';
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await session.save();

  return {
    message: 'OTP verified successfully',
    session: publicSessionPayload(session),
  };
};

export const getPoolingDriverOnboardingSession = async ({ registrationId, phone }) => {
  const session = await getSession({ registrationId, phone });
  return publicOnboardingPayload(session);
};

export const savePoolingDriverOnboardingDetails = async ({ registrationId, phone, driverName, ...vehicleDraft }) => {
  const session = await getSession({ registrationId, phone });

  if (!session.verifiedAt) {
    throw new ApiError(403, 'Verify OTP before continuing');
  }

  const normalizedDriverName = String(driverName || '').trim();
  if (!normalizedDriverName) {
    throw new ApiError(400, 'Driver name is required');
  }

  const normalizedDraft = sanitizeVehicleDraft({
    driverName: normalizedDriverName,
    ...vehicleDraft,
  });

  if (!normalizedDraft.name) {
    throw new ApiError(400, 'Vehicle name is required');
  }

  if (!normalizedDraft.vehicleModel) {
    throw new ApiError(400, 'Vehicle model is required');
  }

  if (!normalizedDraft.vehicleNumber) {
    throw new ApiError(400, 'Vehicle number is required');
  }

  await ensureVehicleNumberAvailable(normalizedDraft.vehicleNumber);

  session.driverName = normalizedDriverName;
  session.vehicleDraft = normalizedDraft;
  session.status = 'details_saved';
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await session.save();

  return {
    message: 'Pooling onboarding details saved successfully',
    ...publicOnboardingPayload(session),
  };
};

export const completePoolingDriverOnboarding = async ({ registrationId, phone }) => {
  const session = await getSession({ registrationId, phone });

  if (!session.verifiedAt) {
    throw new ApiError(403, 'Verify OTP before submitting');
  }

  await ensurePhoneAvailable(session.phone);

  const vehicleDraft = sanitizeVehicleDraft({
    driverName: session.driverName,
    ...(session.vehicleDraft || {}),
  });

  if (!session.driverName || !vehicleDraft.name || !vehicleDraft.vehicleModel || !vehicleDraft.vehicleNumber) {
    throw new ApiError(400, 'Complete vehicle details before submitting');
  }

  await ensureVehicleNumberAvailable(vehicleDraft.vehicleNumber);

  const vehicle = await PoolingVehicle.create({
    ...vehicleDraft,
    driverName: session.driverName,
    driverPhone: session.phone,
    adminCommissionPercentage: 0,
    serviceTaxPercentage: 0,
    approve: false,
    status: 'pending',
    poolingEnabled: true,
  });

  session.status = 'submitted';
  await session.save();
  await PoolingDriverOnboardingSession.deleteOne({ _id: session._id });

  return {
    message: 'Pooling onboarding submitted successfully',
    token: signAccessToken({ sub: String(vehicle._id), role: 'pooling_driver' }),
    driver: publicPoolingDriverPayload(vehicle),
  };
};
