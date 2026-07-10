import crypto from 'node:crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { env } from '../../../../config/env.js';
import { normalizePoint, toPoint } from '../../../../utils/geo.js';
import { uploadDataUrlToCloudinary } from '../../../../utils/cloudinaryUpload.js';
import { Driver } from '../models/Driver.js';
import { DriverRegistrationSession } from '../models/DriverRegistrationSession.js';
import { Owner } from '../../admin/models/Owner.js';
import { ServiceStore } from '../../admin/models/ServiceStore.js';
import { ServiceCenterStaff } from '../../admin/models/ServiceCenterStaff.js';
import { ServiceLocation } from '../../admin/models/ServiceLocation.js';
import { BusService } from '../../admin/models/BusService.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import {
  createBusService,
  listDriverDocumentUploadFields,
  listDriverNeededDocuments,
  listDriverVehicleFieldTemplates,
  listOwnerDocumentUploadFields,
  listOwnerNeededDocuments,
} from '../../admin/services/adminService.js';
import {
  findActiveEmployeeByCode,
  normalizeEmployeeCode,
} from '../../admin/services/employeeAttributionService.js';
import { hashPassword, signAccessToken } from './authService.js';
import {
  findPreferredDriverPortalAccountByPhone,
  startDriverLoginOtp,
} from './loginOtpService.js';
import { findZoneByPickup } from './locationService.js';
import { sendOtpSms } from '../../services/smsService.js';
import {
  verifyDrivingLicenseWithRecharge,
  verifyRcWithRecharge,
} from '../../services/rechargeVerificationService.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { BusDriver } from '../models/BusDriver.js';
import { applyDriverWalletAdjustment } from './walletService.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRIVER_NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VEHICLE_NUMBER_PATTERNS = [
  /^[A-Z]{2}\d{1,2}[A-Z]{1,5}\d{4}$/,
];
const ALLOWED_SERVICE_CATEGORIES = ['taxi', 'outstation', 'delivery', 'pooling'];

const VEHICLE_TYPE_MAP = {
  v1: 'bike',
  v2: 'car',
  v3: 'auto',
  bike: 'bike',
  cab: 'car',
  car: 'car',
  auto: 'auto',
  taxi: 'car',
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').trim();
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const SPECIAL_SIGNUP_ROLES = ['bus_driver', 'service_center', 'service_center_staff'];
const normalizeRole = (role) => {
  const normalized = String(role || 'driver').trim().toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (normalized === 'bus_driver' || normalized === 'bus-driver' || normalized === 'busdriver') return 'bus_driver';
  if (normalized === 'service_center' || normalized === 'service-center' || normalized === 'servicecenter') return 'service_center';
  if (
    normalized === 'service_center_staff' ||
    normalized === 'service-center-staff' ||
    normalized === 'servicecenterstaff' ||
    normalized === 'center_staff'
  ) {
    return 'service_center_staff';
  }
  return 'driver';
};
const hasExplicitSignupRole = (role) =>
  Boolean(role) &&
  ['driver', 'owner', 'bus_driver', 'service_center', 'service_center_staff'].includes(
    normalizeRole(role),
  );
const normalizeServiceCategories = (value, fallback = 'taxi') => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = [...new Set(
    rawValues
      .map((item) => String(item || '').trim().toLowerCase())
      .flatMap((item) => {
        if (item === 'both') return ['taxi', 'outstation'];
        return item ? [item] : [];
      })
      .filter((item) => ALLOWED_SERVICE_CATEGORIES.includes(item)),
  )];

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackValue = String(fallback || 'taxi').trim().toLowerCase();
  if (fallbackValue === 'both') {
    return ['taxi', 'outstation'];
  }

  return ALLOWED_SERVICE_CATEGORIES.includes(fallbackValue) ? [fallbackValue] : ['taxi'];
};

const getPrimaryRegisterFor = (serviceCategories = [], fallback = 'taxi') => {
  const normalized = normalizeServiceCategories(serviceCategories, fallback);

  if (normalized.includes('taxi') && normalized.includes('outstation')) {
    return 'both';
  }

  if (normalized.includes('taxi')) return 'taxi';
  if (normalized.includes('outstation')) return 'outstation';
  if (normalized.includes('delivery')) return 'delivery';
  if (normalized.includes('pooling')) return 'pooling';

  return String(fallback || 'taxi').trim().toLowerCase() || 'taxi';
};
const normalizeReferralCode = (value = '') => String(value || '').trim().toUpperCase();
const buildOnboardingRcVerificationRequestId = (session) =>
  `RC-${String(session?.registrationId || '').replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'ONBOARD'}-${Date.now()}`;
const buildOnboardingLicenseVerificationRequestId = (session) =>
  `DL-${String(session?.registrationId || '').replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'ONBOARD'}-${Date.now()}`;

const resolveRechargeVerificationState = (providerResponse = {}, fallbackMessage = '') => {
  const normalizedStatus = String(providerResponse?.status ?? '').trim().toLowerCase();
  const message = String(
    providerResponse?.cardData?.response?.message ||
    providerResponse?.cardData?.message ||
    providerResponse?.msg ||
    providerResponse?.message ||
    fallbackMessage ||
    '',
  ).trim();
  const lowerMessage = message.toLowerCase();
  const explicitPending =
    ['pending', 'processing', 'queued', 'in_progress', 'in progress'].includes(normalizedStatus) ||
    lowerMessage.includes('pending') ||
    lowerMessage.includes('processing') ||
    lowerMessage.includes('try after sometime') ||
    lowerMessage.includes('please try after sometime');
  const succeeded = normalizedStatus === '1' || normalizedStatus === 'success' || normalizedStatus === 'verified' || Number(providerResponse?.status || 0) === 1;

  return {
    succeeded,
    status: succeeded ? 'verified' : explicitPending ? 'pending' : 'failed',
    message,
  };
};

const parseRcManufacturingYear = (value = '') => {
  const normalized = String(value || '').trim();
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? yearMatch[0] : '';
};

const normalizeRcVerificationResult = (result = {}, rcNumber = '') => ({
  make: String(result?.vehicle_manufacturer_name || '').trim(),
  model: String(result?.model || '').trim(),
  year: parseRcManufacturingYear(result?.vehicle_manufacturing_month_year),
  number: String(result?.reg_no || rcNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
  color: String(result?.vehicle_colour || '').trim(),
  fuelType: String(result?.type || '').trim(),
  seatCapacity: String(result?.vehicle_seat_capacity || '').trim(),
  ownerName: String(result?.owner_name || '').trim(),
  status: String(result?.status || '').trim(),
  registrationDate: String(result?.reg_date || '').trim(),
  insuranceUpto: String(result?.vehicle_insurance_upto || '').trim(),
  fitnessUpto: String(result?.fitness_upto || result?.vehicle_fitness_upto || '').trim(),
  permitNumber: String(result?.permit_no || result?.permit_number || '').trim(),
  permitValidUpto: String(result?.permit_valid_upto || result?.permit_upto || '').trim(),
  pucNumber: String(
    result?.vehicle_pucc_number ||
    result?.pucc_number ||
    result?.pucc_no ||
    result?.puc_number ||
    result?.puc_no ||
    '',
  ).trim(),
  pucValidUpto: String(
    result?.vehicle_pucc_upto ||
    result?.pucc_upto ||
    result?.puc_valid_upto ||
    result?.puc_upto ||
    '',
  ).trim(),
  financer: String(result?.financer || result?.financer_name || '').trim(),
  engineNumber: String(result?.engine_no || '').trim(),
  chassisNumber: String(result?.chasi_no || result?.chassis_no || '').trim(),
  manufacturingMonthYear: String(result?.vehicle_manufacturing_month_year || '').trim(),
});

const generateDriverReferralCode = (driver) => {
  const idPart = String(driver?._id || '')
    .slice(-6)
    .toUpperCase();
  const phonePart = String(driver?.phone || '').slice(-4);
  return `DRV${phonePart}${idPart}`.replace(/\W/g, '');
};

const getDriverReferralProgramSettings = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const driverReferral = setting?.referral?.driver || {};

  return {
    enabled: Boolean(driverReferral.enabled),
    type: String(driverReferral.type || 'instant_referrer').trim().toLowerCase(),
    amount: Math.max(0, Number(driverReferral.amount || 0) || 0),
    rideCount: Math.max(0, Number(driverReferral.ride_count || 0) || 0),
  };
};

const findDriverByReferralCode = async (referralCode) => {
  const normalizedCode = normalizeReferralCode(referralCode);

  if (!normalizedCode) {
    return null;
  }

  return Driver.findOne({ referralCode: normalizedCode });
};

const creditDriverWalletByReference = async ({ driverId, amount, title, referenceKey, metadata = {} }) => {
  const normalizedAmount = Math.max(0, Number(amount || 0) || 0);
  const normalizedReferenceKey = String(referenceKey || '').trim();

  if (!driverId || normalizedAmount <= 0 || !normalizedReferenceKey) {
    return 'skipped';
  }

  const existingTransaction = await WalletTransaction.findOne({
    driverId,
    'metadata.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .lean();

  if (existingTransaction) {
    return 'existing';
  }

  await applyDriverWalletAdjustment({
    driverId,
    amount: normalizedAmount,
    type: 'adjustment',
    description: String(title || 'Referral Reward').trim(),
    metadata: {
      ...metadata,
      referenceKey: normalizedReferenceKey,
      source: 'driver_referral',
    },
  });

  return 'credited';
};

const processDriverSignupReferralRewards = async ({ driver, referrer }) => {
  if (!driver?._id || !referrer?._id) {
    return;
  }

  const settings = await getDriverReferralProgramSettings();
  if (!settings.enabled || settings.amount <= 0) {
    return;
  }

  const referralType = settings.type;
  const rewardBaseKey = `driver-referral:signup:${String(driver._id)}`;

  if (referralType === 'instant_referrer' || referralType === 'instant_referrer_new') {
    await creditDriverWalletByReference({
      driverId: referrer._id,
      amount: settings.amount,
      title: `Referral reward for inviting driver ${driver.phone || ''}`.trim(),
      referenceKey: `${rewardBaseKey}:referrer`,
      metadata: {
        invitedDriverId: String(driver._id),
      },
    });
  }

  if (referralType === 'instant_referrer_new') {
    await creditDriverWalletByReference({
      driverId: driver._id,
      amount: settings.amount,
      title: 'Welcome referral reward',
      referenceKey: `${rewardBaseKey}:new-driver`,
      metadata: {
        referrerDriverId: String(referrer._id),
      },
    });

    driver.referralRewardGrantedAt = driver.referralRewardGrantedAt || new Date();
    await driver.save();
  }
};

const matchesDocumentRole = (accountType, role) => {
  const normalizedAccountType = String(accountType || 'individual').trim().toLowerCase();
  const normalizedRole = normalizeRole(role);

  if (normalizedAccountType === 'both') {
    return true;
  }

  if (normalizedRole === 'owner') {
    return normalizedAccountType === 'fleet_drivers';
  }

  return normalizedAccountType === 'individual';
};

const matchesVehicleFieldRole = (accountType, role) => {
  const rawAccountType = String(accountType || '').trim().toLowerCase();
  const normalizedAccountType = rawAccountType || 'individual';
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === 'owner') {
    if (!rawAccountType) {
      return false;
    }

    return [
      'fleet_drivers',
      'fleet drivers',
      'owner',
      'owners',
      'fleet_owner',
      'fleet_owners',
      'fleet owner',
      'fleet owners',
    ].includes(normalizedAccountType);
  }

  if (normalizedAccountType === 'both') {
    return true;
  }

  return normalizedAccountType === 'individual';
};

const getRequiredVehicleFieldMap = async (role) => {
  const configs = await listDriverVehicleFieldTemplates({ activeOnly: true });

  return configs
    .filter((item) => item.active !== false && matchesVehicleFieldRole(item.account_type, role))
    .reduce((acc, item) => {
      acc[String(item.field_key || '').trim()] = item;
      return acc;
    }, {});
};

const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const getStaticDriverOtpConfig = () => ({
  phone: normalizePhone(env.sms?.staticOtpPhone || ''),
  otp: String(env.sms?.staticOtpCode || '').trim(),
});
const resolveDriverOnboardingOtpForPhone = (phone) => {
  const normalizedPhone = normalizePhone(phone);
  const staticOtpConfig = getStaticDriverOtpConfig();
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

const getVehicleType = (vehicleTypeId, registerFor = '') => {
  const type = VEHICLE_TYPE_MAP[String(vehicleTypeId || registerFor || '').trim().toLowerCase()];
  return type || 'car';
};

const getGenericVehicleTypeFromCatalog = (vehicle = {}) => {
  const value = String(vehicle.icon_types || vehicle.name || '').trim().toLowerCase();

  if (value.includes('bike')) {
    return 'bike';
  }

  if (value.includes('auto')) {
    return 'auto';
  }

  return 'car';
};

const getServiceLocationName = (serviceLocation = {}) =>
  String(serviceLocation.service_location_name || serviceLocation.name || '').trim();

const getServiceLocationCoordinates = (serviceLocation = {}) => {
  if (Array.isArray(serviceLocation?.location?.coordinates) && serviceLocation.location.coordinates.length === 2) {
    return serviceLocation.location.coordinates;
  }

  if (
    typeof serviceLocation?.longitude === 'number' &&
    typeof serviceLocation?.latitude === 'number'
  ) {
    return [serviceLocation.longitude, serviceLocation.latitude];
  }

  if (Array.isArray(serviceLocation?.coordinates) && serviceLocation.coordinates.length === 2) {
    return serviceLocation.coordinates;
  }

  return null;
};

const getValidatedServiceLocationCoordinates = (serviceLocation = {}) => {
  const coordinates = getServiceLocationCoordinates(serviceLocation);

  if (!coordinates) {
    return null;
  }

  try {
    return normalizePoint(coordinates, 'location');
  } catch {
    return null;
  }
};

const isSpecialSignupRole = (role = '') => SPECIAL_SIGNUP_ROLES.includes(normalizeRole(role));

const serializeSignupBusServiceOption = (busService = {}) => ({
  id: busService._id,
  operatorName: busService.operatorName || '',
  busName: busService.busName || '',
  serviceNumber: busService.serviceNumber || '',
  routeName: busService.route?.routeName || '',
  originCity: busService.route?.originCity || '',
  destinationCity: busService.route?.destinationCity || '',
  status: busService.status || 'draft',
});

const serializeSignupServiceCenterOption = (center = {}) => ({
  id: center._id,
  name: center.name || '',
  address: center.address || '',
  ownerName: center.owner_name || '',
  ownerPhone: center.owner_phone || '',
  serviceLocationId: center.service_location_id?._id || center.service_location_id || null,
  serviceLocationName:
    center.service_location_id?.service_location_name ||
    center.service_location_id?.name ||
    '',
});

const normalizeStoredDocument = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return {
      secureUrl: value,
      previewUrl: value,
      uploaded: true,
      identifyNumber: '',
      identify_number: '',
      expiryDate: '',
      expiry_date: '',
    };
  }

  const identifyNumber = String(
    value.identifyNumber ||
    value.identify_number ||
    value.documentNumber ||
    value.document_number ||
    '',
  ).trim();
  const expiryDate = String(
    value.expiryDate ||
    value.expiry_date ||
    value.expiry ||
    value.expiresAt ||
    '',
  ).trim();

  return {
    ...value,
    previewUrl: value.previewUrl || value.secureUrl || '',
    uploaded: value.uploaded ?? Boolean(value.secureUrl || value.previewUrl),
    identifyNumber,
    identify_number: identifyNumber,
    documentNumber: identifyNumber,
    document_number: identifyNumber,
    expiryDate,
    expiry_date: expiryDate,
  };
};

const publicSessionPayload = (session, debugOtp = null) => ({
  registrationId: session.registrationId,
  phone: session.phone,
  role: session.role,
  roleConfirmed: session.roleConfirmed !== false,
  status: session.status,
  otpVerified: Boolean(session.otpVerifiedAt),
  documentsUploaded: Object.keys(session.documents || {}).filter((key) => Boolean(session.documents?.[key])),
  employeeCode: session.employeeCode || '',
  debugOtp,
});

const publicDriverPayload = (driver) => {
  if (!driver) {
    return null;
  }

  return {
    id: driver._id,
    name: driver.name,
    phone: driver.phone,
    email: driver.email,
    gender: driver.gender,
    vehicleType: driver.vehicleType,
    registerFor: driver.registerFor,
    serviceCategories: Array.isArray(driver.serviceCategories) ? driver.serviceCategories : [],
    vehicleNumber: driver.vehicleNumber,
    vehicleColor: driver.vehicleColor,
    city: driver.city,
    approve: driver.approve,
    status: driver.status,
    rating: driver.rating,
  };
};

const getSession = async (registrationId, phone = '') => {
  const query = registrationId
    ? { registrationId: String(registrationId) }
    : { phone: normalizePhone(phone) };

  const session = await DriverRegistrationSession.findOne(query).select('+otpHash +personal.passwordHash');

  if (!session) {
    throw new ApiError(404, 'Registration session not found');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await DriverRegistrationSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'Registration session expired');
  }

  return session;
};

const uploadRegistrationDocument = async (documentKey, value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && value.secureUrl) {
    return normalizeStoredDocument(value);
  }

  const dataUrl = typeof value === 'string' ? value : value.dataUrl;
  const originalFilename = typeof value === 'object'
    ? value.fileName || value.originalFilename || documentKey
    : documentKey;
  const identifyNumber = typeof value === 'object'
    ? String(
      value.identifyNumber ||
      value.identify_number ||
      value.documentNumber ||
      value.document_number ||
      '',
    ).trim()
    : '';
  const expiryDate = typeof value === 'object'
    ? String(value.expiryDate || value.expiry_date || value.expiry || value.expiresAt || '').trim()
    : '';
  const birthDate = typeof value === 'object'
    ? String(value.birthDate || value.birth_date || '').trim()
    : '';
  const requestNumber = typeof value === 'object'
    ? String(value.requestNumber || value.request_no || '').trim()
    : '';
  const ifsc = typeof value === 'object'
    ? String(value.ifsc || value.ifscCode || value.ifsc_code || '').trim().toUpperCase()
    : '';
  const accountHolderName = typeof value === 'object'
    ? String(
      value.accountHolderName ||
      value.account_holder_name ||
      value.beneficiaryName ||
      value.benificiary_name ||
      '',
    ).trim()
    : '';

  if (!dataUrl) {
    throw new ApiError(400, `${documentKey} must contain an image data URL`);
  }

  const safeSuffix = String(originalFilename)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '');

  const uploaded = await uploadDataUrlToCloudinary({
    dataUrl,
    folder: `${documentKey}/driver-documents`,
    publicIdPrefix: `driver-${documentKey}`,
    publicIdSuffix: safeSuffix,
  });

  return {
    key: documentKey,
    fileName: originalFilename,
    uploaded: true,
    uploadedAt: new Date().toISOString(),
    previewUrl: uploaded.secureUrl,
    secureUrl: uploaded.secureUrl,
    publicId: uploaded.publicId,
    resourceType: uploaded.resourceType,
    format: uploaded.format,
    bytes: uploaded.bytes,
    width: uploaded.width,
    height: uploaded.height,
    identifyNumber,
    identify_number: identifyNumber,
    documentNumber: identifyNumber,
    document_number: identifyNumber,
    expiryDate,
    expiry_date: expiryDate,
    birthDate,
    birth_date: birthDate,
    requestNumber,
    request_no: requestNumber,
    ifsc,
    ifscCode: ifsc,
    ifsc_code: ifsc,
    accountHolderName,
    account_holder_name: accountHolderName,
    beneficiaryName: accountHolderName,
    benificiary_name: accountHolderName,
    cloudinary: uploaded,
  };
};

export const startDriverOnboarding = async ({ phone, role }) => {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone || normalizedPhone.length !== 10) {
    throw new ApiError(400, 'A valid 10-digit mobile number is required');
  }

  const roleProvided = hasExplicitSignupRole(role);
  const normalizedRole = normalizeRole(role);
  const preferredExistingAccount = roleProvided
    ? null
    : await findPreferredDriverPortalAccountByPhone(normalizedPhone);
  let roleSpecificExistingAccount = null;

  if (roleProvided) {
    if (normalizedRole === 'owner') {
      roleSpecificExistingAccount = await Owner.findOne({
        $or: [{ mobile: normalizedPhone }, { phone: normalizedPhone }],
      }).lean();
    } else if (normalizedRole === 'bus_driver') {
      roleSpecificExistingAccount = await BusDriver.findOne({ phone: normalizedPhone }).lean();
    } else if (normalizedRole === 'service_center') {
      roleSpecificExistingAccount = await ServiceStore.findOne({ owner_phone: normalizedPhone }).lean();
    } else if (normalizedRole === 'service_center_staff') {
      roleSpecificExistingAccount = await ServiceCenterStaff.findOne({ phone: normalizedPhone }).lean();
    } else {
      roleSpecificExistingAccount = await Driver.findOne({ phone: normalizedPhone }).lean();
    }
  }

  const hasExistingAccount = roleProvided
    ? Boolean(roleSpecificExistingAccount)
    : Boolean(preferredExistingAccount);

  if (hasExistingAccount) {
    const loginResult = await startDriverLoginOtp({
      phone: normalizedPhone,
      role: preferredExistingAccount?.role || normalizedRole,
    });

    return {
      ...loginResult,
      loginMode: true,
      existingAccount: true,
      detectedRole: preferredExistingAccount?.role || normalizedRole,
      session: {
        ...(loginResult.session || {}),
        role: preferredExistingAccount?.role || normalizedRole,
        loginMode: true,
        existingAccount: true,
        availableRoles: loginResult.availableRoles || [],
      },
    };
  }

  const { otp, isStatic } = resolveDriverOnboardingOtpForPhone(normalizedPhone);
  const now = Date.now();
  const registrationId = crypto.randomUUID();

  const session = await DriverRegistrationSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      registrationId,
      phone: normalizedPhone,
      role: normalizedRole,
      roleConfirmed: roleProvided,
      status: 'otp_sent',
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now + OTP_TTL_MS),
      otpVerifiedAt: null,
      expiresAt: new Date(now + SESSION_TTL_MS),
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
        purpose: 'driver onboarding OTP',
      });
  const debugOtp = process.env.NODE_ENV !== 'production' ? otp : null;

  if (debugOtp) {
    console.log(`[onboardingService] OTP for ${normalizedPhone} = ${debugOtp} (${smsDispatch.mode})`);
  }

  return {
    message: smsDispatch.mode === 'live' ? 'OTP sent successfully' : 'OTP generated successfully',
    session: publicSessionPayload(session, debugOtp),
  };
};

export const verifyDriverOtp = async ({ registrationId, phone, otp }) => {
  const session = await getSession(registrationId, phone);

  if (!otp || String(otp).trim().length !== 4) {
    throw new ApiError(400, 'A valid 4-digit OTP is required');
  }

  if (!session.otpExpiresAt || new Date(session.otpExpiresAt).getTime() < Date.now()) {
    throw new ApiError(410, 'OTP has expired');
  }

  if (session.otpHash !== hashOtp(otp)) {
    throw new ApiError(401, 'Invalid OTP');
  }

  session.status = 'otp_verified';
  session.otpVerifiedAt = new Date();
  await session.save();

  return {
    message: 'OTP verified successfully',
    session: publicSessionPayload(session),
  };
};

export const setDriverOnboardingRole = async ({ registrationId, phone, role }) => {
  const session = await getSession(registrationId, phone);

  if (!session.otpVerifiedAt) {
    throw new ApiError(400, 'Verify OTP before selecting a role');
  }

  const normalizedRole = normalizeRole(role);
  session.role = normalizedRole;
  session.roleConfirmed = true;
  await session.save();

  return {
    message: 'Signup role selected successfully',
    session: publicSessionPayload(session),
  };
};

export const getDriverOnboardingSignupOptions = async () => {
  const [serviceLocations, serviceCenters, busServices] = await Promise.all([
    ServiceLocation.find({ active: { $ne: false } })
      .select('name service_location_name address country latitude longitude location')
      .sort({ service_location_name: 1, name: 1 })
      .lean(),
    ServiceStore.find({
      active: { $ne: false },
      approve: true,
    })
      .populate('service_location_id', 'name service_location_name')
      .sort({ name: 1 })
      .lean(),
    BusService.find({
      status: { $in: ['active', 'paused'] },
    })
      .select('operatorName busName serviceNumber route status')
      .sort({ operatorName: 1, busName: 1 })
      .lean(),
  ]);

  return {
    serviceLocations: (Array.isArray(serviceLocations) ? serviceLocations : []).map((item) => ({
      _id: item._id,
      id: item._id,
      name: item.service_location_name || item.name || '',
      service_location_name: item.service_location_name || item.name || '',
      address: item.address || '',
      country: item.country || '',
      latitude: item.latitude ?? item.location?.coordinates?.[1] ?? null,
      longitude: item.longitude ?? item.location?.coordinates?.[0] ?? null,
      location: item.location || null,
    })),
    serviceCenters: (Array.isArray(serviceCenters) ? serviceCenters : []).map(serializeSignupServiceCenterOption),
    busServices: (Array.isArray(busServices) ? busServices : []).map(serializeSignupBusServiceOption),
  };
};

export const saveDriverRoleDetails = async ({ registrationId, phone, roleDetails = {} }) => {
  const session = await getSession(registrationId, phone);
  const normalizedRole = normalizeRole(session.role);

  if (!session.personal?.fullName) {
    throw new ApiError(400, 'Save personal details before continuing');
  }

  if (!isSpecialSignupRole(normalizedRole)) {
    throw new ApiError(400, 'This role does not use the self-signup details form');
  }

  if (normalizedRole === 'service_center') {
    const centerName = String(roleDetails.centerName || roleDetails.name || '').trim();
    const address = String(roleDetails.address || '').trim();
    const serviceLocationId = String(roleDetails.serviceLocationId || '').trim();

    if (!centerName) {
      throw new ApiError(400, 'Service center name is required');
    }

    if (!address) {
      throw new ApiError(400, 'Service center address is required');
    }

    if (!serviceLocationId || !/^[a-f\d]{24}$/i.test(serviceLocationId)) {
      throw new ApiError(400, 'Select a valid service location');
    }

    const serviceLocation = await ServiceLocation.findById(serviceLocationId).lean();
    if (!serviceLocation) {
      throw new ApiError(404, 'Service location not found');
    }

    session.roleDetails = {
      centerName,
      address,
      serviceLocationId,
      serviceLocationName: serviceLocation.service_location_name || serviceLocation.name || '',
    };
  }

  if (normalizedRole === 'service_center_staff') {
    const serviceCenterId = String(roleDetails.serviceCenterId || '').trim();
    if (!serviceCenterId || !/^[a-f\d]{24}$/i.test(serviceCenterId)) {
      throw new ApiError(400, 'Select a valid service center');
    }

    const serviceCenter = await ServiceStore.findOne({
      _id: serviceCenterId,
      active: { $ne: false },
      approve: true,
    }).lean();

    if (!serviceCenter) {
      throw new ApiError(404, 'Service center not found');
    }

    session.roleDetails = {
      serviceCenterId,
      serviceCenterName: serviceCenter.name || '',
      serviceCenterAddress: serviceCenter.address || '',
    };
  }

  if (normalizedRole === 'bus_driver') {
    const busServiceId = String(roleDetails.busServiceId || '').trim();
    const requestNote = String(roleDetails.requestNote || '').trim().slice(0, 300);
    const createNewBus = roleDetails.createNewBus === true;
    const busDraft = roleDetails.busDraft && typeof roleDetails.busDraft === 'object' ? roleDetails.busDraft : null;
    const draftBusDetails = {
      operatorName: String(busDraft?.operatorName || roleDetails.operatorName || '').trim(),
      busName: String(busDraft?.busName || roleDetails.busName || '').trim(),
      serviceNumber: String(busDraft?.serviceNumber || roleDetails.serviceNumber || '').trim(),
      originCity: String(busDraft?.route?.originCity || roleDetails.originCity || '').trim(),
      destinationCity: String(busDraft?.route?.destinationCity || roleDetails.destinationCity || '').trim(),
    };

    if (createNewBus) {
      if (!draftBusDetails.operatorName) {
        throw new ApiError(400, 'Operator name is required');
      }
      if (!draftBusDetails.busName) {
        throw new ApiError(400, 'Bus name is required');
      }
      if (!draftBusDetails.originCity) {
        throw new ApiError(400, 'Origin city is required');
      }
      if (!draftBusDetails.destinationCity) {
        throw new ApiError(400, 'Destination city is required');
      }

      session.roleDetails = {
        createNewBus: true,
        requestNote,
        busDraft,
        ...draftBusDetails,
        busServiceSnapshot: {
          operatorName: draftBusDetails.operatorName,
          busName: draftBusDetails.busName,
          serviceNumber: draftBusDetails.serviceNumber,
          originCity: draftBusDetails.originCity,
          destinationCity: draftBusDetails.destinationCity,
          routeName: `${draftBusDetails.originCity} to ${draftBusDetails.destinationCity}`,
        },
      };
    } else {
      if (!busServiceId || !/^[a-f\d]{24}$/i.test(busServiceId)) {
        throw new ApiError(400, 'Select a valid bus service');
      }

      const busService = await BusService.findById(busServiceId).lean();
      if (!busService) {
        throw new ApiError(404, 'Bus service not found');
      }

      session.roleDetails = {
        createNewBus: false,
        busServiceId,
        requestNote,
        busServiceSnapshot: serializeSignupBusServiceOption(busService),
      };
    }
  }

  session.status = 'role_details_saved';
  await session.save();

  return {
    message: 'Signup details saved successfully',
    roleDetails: session.roleDetails,
    session: publicSessionPayload(session),
  };
};

export const saveDriverPersonalDetails = async ({ registrationId, phone, fullName, email, gender, password }) => {
  const session = await getSession(registrationId, phone);
  const isOwner = String(session.role || '').toLowerCase() === 'owner';

  if (!session.otpVerifiedAt) {
    throw new ApiError(400, 'Verify OTP before continuing');
  }

  if (session.roleConfirmed === false) {
    throw new ApiError(400, 'Select your signup role before continuing');
  }

  if (!fullName || !email || !gender) {
    throw new ApiError(400, 'fullName, email and gender are required');
  }

  const normalizedName = String(fullName).trim();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!DRIVER_NAME_REGEX.test(normalizedName)) {
    throw new ApiError(400, `${isOwner ? 'Owner' : 'Driver'} name should contain alphabets only`);
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new ApiError(400, 'A valid email address is required');
  }

  session.personal = {
    fullName: normalizedName,
    email: normalizedEmail,
    gender: String(gender).trim(),
    passwordHash: await hashPassword(
      !isOwner && String(password || '').trim()
        ? String(password)
        : crypto.randomBytes(24).toString('hex'),
    ),
  };
  session.status = 'personal_saved';
  await session.save();

  return {
    message: 'Personal details saved',
    personal: {
      fullName: session.personal.fullName,
      email: session.personal.email,
      gender: session.personal.gender,
    },
    session: publicSessionPayload(session),
  };
};

export const saveDriverReferral = async ({ registrationId, phone, referralCode = '', employeeCode = '' }) => {
  const session = await getSession(registrationId, phone);

  const normalizedReferralCode = normalizeReferralCode(referralCode);
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);

  if (normalizedReferralCode) {
    const referrer = await findDriverByReferralCode(normalizedReferralCode);
    if (!referrer?._id) {
      throw new ApiError(400, 'Invalid referral code');
    }
  }

  if (normalizedEmployeeCode) {
    const employee = await findActiveEmployeeByCode(normalizedEmployeeCode);
    if (!employee?._id) {
      throw new ApiError(400, 'Invalid employee code');
    }
  }

  session.referralCode = normalizedReferralCode;
  session.employeeCode = normalizedEmployeeCode;
  await session.save();

  return {
    message: 'Referral code saved',
    referralCode: session.referralCode,
    employeeCode: session.employeeCode,
    session: publicSessionPayload(session),
  };
};

export const saveDriverVehicle = async ({
  registrationId,
  phone,
  registerFor,
  serviceCategories,
  locationId,
  locationName,
  serviceLocation,
  vehicleTypeId,
  rcNumber,
  make,
  model,
  year,
  number,
  color,
  companyName,
  companyAddress,
  city,
  postalCode,
  taxNumber,
  customFields = {},
}) => {
  const session = await getSession(registrationId, phone);

  if (!session.personal?.fullName) {
    throw new ApiError(400, 'Save personal details before vehicle details');
  }

  const selectedServiceLocation = serviceLocation || (locationId ? await ServiceLocation.findById(locationId).lean() : null);
  const selectedLocation = getServiceLocationName(selectedServiceLocation) || String(locationName || city || '').trim();
  const normalizedServiceCategories = normalizeServiceCategories(serviceCategories, registerFor || session.role || 'taxi');
  const normalizedRegisterFor = getPrimaryRegisterFor(normalizedServiceCategories, registerFor || session.role || 'taxi');

  if (!selectedLocation) {
    throw new ApiError(400, 'A valid service location is required');
  }

  const isOwner = String(session.role || '').toLowerCase() === 'owner';
  const requiredFieldMap = await getRequiredVehicleFieldMap(session.role);
  const normalizedYear = String(year || '').trim();
  const normalizedRcNumber = String(rcNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const normalizedNumber = String(number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const normalizedPostalCode = String(postalCode || '').replace(/\D/g, '');
  const normalizedCustomFields = Object.entries(customFields || {}).reduce((acc, [key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return acc;
    }

    if (Array.isArray(value)) {
      acc[normalizedKey] = value.map((item) => String(item || '').trim()).filter(Boolean);
      return acc;
    }

    acc[normalizedKey] = String(value || '').trim();
    return acc;
  }, {});
  const hasValue = (value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(String(value || '').trim());
  const requireField = (fieldKey, value, fallbackMessage) => {
    const config = requiredFieldMap[fieldKey];
    if (config?.is_required && !hasValue(value)) {
      throw new ApiError(400, `${config.name || fallbackMessage} is required`);
    }
  };

  requireField('locationId', locationId, 'Operating city');

  if (isOwner) {
    requireField('companyName', companyName, 'Company name');
    requireField('companyAddress', companyAddress, 'Company address');
    requireField('city', city, 'City');
    requireField('postalCode', normalizedPostalCode, 'Postal code');
    requireField('taxNumber', taxNumber, 'Tax number');

    if (normalizedPostalCode && !/^\d{6}$/.test(normalizedPostalCode)) {
      throw new ApiError(400, 'Postal code must be a 6 digit number');
    }
  } else {
    const vehicleYear = Number(normalizedYear);
    const currentYear = new Date().getFullYear();

    requireField('serviceCategories', normalizedServiceCategories, 'Service category');
    requireField('vehicleTypeId', vehicleTypeId, 'Vehicle type');
    if (!normalizedRcNumber) {
      throw new ApiError(400, 'RC number is required');
    }
    requireField('make', make, 'Brand / Make');
    requireField('model', model, 'Model');
    requireField('year', normalizedYear, 'Year');
    requireField('number', normalizedNumber, 'Plate number');
    requireField('color', color, 'Exterior color');

    if (normalizedYear && (!/^\d{4}$/.test(normalizedYear) || vehicleYear < 1980 || vehicleYear > currentYear)) {
      throw new ApiError(400, `Vehicle year must be between 1980 and ${currentYear}`);
    }

    if (normalizedNumber && !VEHICLE_NUMBER_PATTERNS.some((pattern) => pattern.test(normalizedNumber))) {
      throw new ApiError(400, 'Vehicle number must be in a valid format, for example DL1AB2345, DL1ABCD1234, or MH12AB1234');
    }
  }

  Object.values(requiredFieldMap)
    .filter((config) => {
      const key = String(config.field_key || '').trim();
      return key && ![
        'locationId',
        'serviceCategories',
        'vehicleTypeId',
        'make',
        'model',
        'year',
        'number',
        'color',
        'companyName',
        'companyAddress',
        'city',
        'postalCode',
        'taxNumber',
      ].includes(key);
    })
    .forEach((config) => {
      if (config.is_required && !hasValue(normalizedCustomFields[config.field_key])) {
        throw new ApiError(400, `${config.name || config.field_key} is required`);
      }
    });

  session.vehicle = {
    registerFor: normalizedRegisterFor,
    serviceCategories: normalizedServiceCategories,
    locationId: String(locationId || '').trim(),
    locationName: selectedLocation,
    serviceLocation: selectedServiceLocation
      ? {
          _id: selectedServiceLocation._id || locationId || '',
          name: selectedServiceLocation.name || selectedServiceLocation.service_location_name || selectedLocation,
          service_location_name:
            selectedServiceLocation.service_location_name || selectedServiceLocation.name || selectedLocation,
          address: selectedServiceLocation.address || '',
          country: selectedServiceLocation.country || '',
          currency_name: selectedServiceLocation.currency_name || '',
          currency_symbol: selectedServiceLocation.currency_symbol || '',
          currency_code: selectedServiceLocation.currency_code || '',
          timezone: selectedServiceLocation.timezone || '',
          unit: selectedServiceLocation.unit || 'km',
          latitude: selectedServiceLocation.latitude ?? null,
          longitude: selectedServiceLocation.longitude ?? null,
          location: selectedServiceLocation.location || null,
          coordinates: getServiceLocationCoordinates(selectedServiceLocation),
        }
      : null,
    vehicleTypeId: String(vehicleTypeId || '').trim(),
    rcNumber: normalizedRcNumber,
    make: String(make || '').trim(),
    model: String(model || '').trim(),
    year: normalizedYear,
    number: normalizedNumber,
    color: String(color || '').trim(),
    companyName: String(companyName || '').trim(),
    companyAddress: String(companyAddress || '').trim(),
    city: String(city || selectedLocation).trim(),
    postalCode: normalizedPostalCode,
    taxNumber: String(taxNumber || '').trim().toUpperCase(),
    customFields: normalizedCustomFields,
  };
  session.status = 'vehicle_saved';
  await session.save();

  return {
    message: 'Vehicle details saved',
    vehicle: session.vehicle,
    session: publicSessionPayload(session),
  };
};

export const saveDriverDocuments = async ({ registrationId, phone, documents = {} }) => {
  const session = await getSession(registrationId, phone);

  const updatedDocuments = {};
  const uploadedDocumentKeys = [];

  for (const [documentKey, value] of Object.entries(documents || {})) {
    const uploadedDocument = await uploadRegistrationDocument(documentKey, value);

    if (uploadedDocument) {
      const existingDocument = session.documents?.[documentKey];
      updatedDocuments[documentKey] = normalizeStoredDocument({
        ...(typeof existingDocument === 'object' && existingDocument ? existingDocument : {}),
        ...uploadedDocument,
        key: documentKey,
      });
      uploadedDocumentKeys.push(documentKey);
    }
  }

  session.documents = {
    ...(session.documents || {}),
    ...updatedDocuments,
  };
  session.status = 'documents_saved';
  await session.save();

  return {
    message: 'Documents uploaded successfully',
    uploadedDocumentKeys,
    documents: session.documents,
    session: publicSessionPayload(session),
  };
};

export const completeDriverOnboarding = async ({ registrationId, phone, documents = {} }) => {
  const session = await getSession(registrationId, phone);

  if (session.finalDriverId) {
    const existingDriver = await Driver.findById(session.finalDriverId);
    await DriverRegistrationSession.deleteOne({ _id: session._id });
    return {
      message: 'Registration already completed',
      driver: publicDriverPayload(existingDriver),
      documents: session.documents,
      session: publicSessionPayload(session),
    };
  }

  if (!session.otpVerifiedAt) {
    throw new ApiError(400, 'Verify OTP before submission');
  }

  if (!session.personal?.fullName || !session.personal?.passwordHash) {
    throw new ApiError(400, 'Personal details are incomplete');
  }

  const normalizedRole = normalizeRole(session.role);
  const submittedAt = new Date();

  if (isSpecialSignupRole(normalizedRole)) {
    if (!session.roleDetails || Object.keys(session.roleDetails || {}).length === 0) {
      throw new ApiError(400, 'Signup details are incomplete');
    }

    if (normalizedRole === 'service_center') {
      const serviceLocation = await ServiceLocation.findById(session.roleDetails.serviceLocationId).lean();
      if (!serviceLocation) {
        throw new ApiError(404, 'Service location not found');
      }

      const coordinates = getValidatedServiceLocationCoordinates(serviceLocation);
      if (!coordinates) {
        throw new ApiError(400, 'Service location coordinates are not configured');
      }

      const existingCenter = await ServiceStore.findOne({ owner_phone: session.phone }).lean();
      if (existingCenter) {
        throw new ApiError(409, 'Service center already exists with this phone number');
      }

      const zone = await findZoneByPickup(coordinates);
      if (!zone?._id) {
        throw new ApiError(400, 'No service zone is configured for the selected location');
      }

      const center = await ServiceStore.create({
        name: session.roleDetails.centerName,
        zone_id: zone._id,
        service_location_id: serviceLocation._id,
        address: session.roleDetails.address,
        owner_name: session.personal.fullName,
        owner_phone: session.phone,
        latitude: coordinates[1],
        longitude: coordinates[0],
        location: toPoint(coordinates, 'location'),
        status: 'active',
        active: true,
        approve: false,
        signupSource: 'self_signup',
        onboarding: {
          registrationId: session.registrationId,
          role: normalizedRole,
          verifiedAt: session.otpVerifiedAt,
          submittedAt,
          personal: {
            fullName: session.personal.fullName,
            email: session.personal.email,
            gender: session.personal.gender,
          },
          roleDetails: session.roleDetails,
        },
      });

      session.finalEntityId = center._id;
      session.finalEntityRole = normalizedRole;
      session.status = 'completed';
      session.completedAt = submittedAt;
      await session.save();
      await DriverRegistrationSession.deleteOne({ _id: session._id });

      return {
        message: 'Service center signup submitted successfully',
        serviceCenter: {
          id: center._id,
          name: center.name || '',
          phone: center.owner_phone || '',
          approve: center.approve,
          status: center.status,
        },
        token: signAccessToken({ sub: String(center._id), role: 'service_center' }),
        session: publicSessionPayload(session),
      };
    }

    if (normalizedRole === 'service_center_staff') {
      const existingStaff = await ServiceCenterStaff.findOne({ phone: session.phone }).lean();
      if (existingStaff) {
        throw new ApiError(409, 'Service staff already exists with this phone number');
      }

      const serviceCenter = await ServiceStore.findOne({
        _id: session.roleDetails.serviceCenterId,
        active: { $ne: false },
        approve: true,
      }).lean();

      if (!serviceCenter) {
        throw new ApiError(404, 'Selected service center is not available');
      }

      const staff = await ServiceCenterStaff.create({
        serviceCenterId: serviceCenter._id,
        name: session.personal.fullName,
        phone: session.phone,
        active: true,
        status: 'active',
        approve: false,
        signupSource: 'self_signup',
        onboarding: {
          registrationId: session.registrationId,
          role: normalizedRole,
          verifiedAt: session.otpVerifiedAt,
          submittedAt,
          personal: {
            fullName: session.personal.fullName,
            email: session.personal.email,
            gender: session.personal.gender,
          },
          roleDetails: session.roleDetails,
        },
      });

      session.finalEntityId = staff._id;
      session.finalEntityRole = normalizedRole;
      session.status = 'completed';
      session.completedAt = submittedAt;
      await session.save();
      await DriverRegistrationSession.deleteOne({ _id: session._id });

      return {
        message: 'Service staff signup submitted successfully',
        serviceStaff: {
          id: staff._id,
          name: staff.name || '',
          phone: staff.phone || '',
          approve: staff.approve,
          status: staff.status,
        },
        token: signAccessToken({ sub: String(staff._id), role: 'service_center_staff' }),
        session: publicSessionPayload(session),
      };
    }

    if (normalizedRole === 'bus_driver') {
      const existingBusDriver = await BusDriver.findOne({ phone: session.phone }).lean();
      if (existingBusDriver) {
        throw new ApiError(409, 'Bus driver already exists with this phone number');
      }

      let busService = null;
      if (session.roleDetails?.createNewBus === true) {
        const signupBusDraft =
          session.roleDetails?.busDraft && typeof session.roleDetails.busDraft === 'object'
            ? session.roleDetails.busDraft
            : {
                operatorName: session.roleDetails.operatorName,
                busName: session.roleDetails.busName,
                serviceNumber: session.roleDetails.serviceNumber,
                status: 'draft',
                route: {
                  routeName:
                    `${String(session.roleDetails.originCity || '').trim()} to ${String(session.roleDetails.destinationCity || '').trim()}`,
                  originCity: session.roleDetails.originCity,
                  destinationCity: session.roleDetails.destinationCity,
                  stops: [],
                },
              };

        busService = await createBusService({
          ...signupBusDraft,
          status: signupBusDraft.status || 'draft',
        });
      } else {
        busService = await BusService.findById(session.roleDetails.busServiceId).lean();
      }

      if (!busService) {
        throw new ApiError(404, 'Selected bus service is no longer available');
      }

      const busDriver = await BusDriver.create({
        name: session.personal.fullName,
        phone: session.phone,
        email: session.personal.email,
        approve: false,
        active: true,
        status: 'pending',
        assignedBusServiceId: busService._id,
        operatorName: busService.operatorName || '',
        busName: busService.busName || '',
        serviceNumber: busService.serviceNumber || '',
        registrationNumber: busService.registrationNumber || '',
        routeName: busService.route?.routeName || '',
        originCity: busService.route?.originCity || '',
        destinationCity: busService.route?.destinationCity || '',
        signupSource: 'self_signup',
        onboarding: {
          registrationId: session.registrationId,
          role: normalizedRole,
          verifiedAt: session.otpVerifiedAt,
          submittedAt,
          personal: {
            fullName: session.personal.fullName,
            email: session.personal.email,
            gender: session.personal.gender,
          },
          roleDetails: session.roleDetails,
        },
      });

      session.finalEntityId = busDriver._id;
      session.finalEntityRole = normalizedRole;
      session.status = 'completed';
      session.completedAt = submittedAt;
      await session.save();
      await DriverRegistrationSession.deleteOne({ _id: session._id });

      return {
        message: 'Bus driver signup submitted successfully',
        busDriver: {
          id: busDriver._id,
          name: busDriver.name || '',
          phone: busDriver.phone || '',
          approve: busDriver.approve,
          status: busDriver.status,
        },
        token: signAccessToken({ sub: String(busDriver._id), role: 'bus_driver' }),
        session: publicSessionPayload(session),
      };
    }
  }

  if (!session.vehicle?.locationName) {
    throw new ApiError(400, 'Vehicle details are incomplete');
  }

  const finalDocuments = Object.keys(documents || {}).length > 0 ? documents : session.documents || {};
  const normalizedDocuments = {};
  for (const [documentKey, value] of Object.entries(finalDocuments)) {
    normalizedDocuments[documentKey] = normalizeStoredDocument(value);
  }

  const configuredUploadFields =
    String(session.role || '').toLowerCase() === 'owner'
      ? await listOwnerDocumentUploadFields({ activeOnly: true })
      : await listDriverDocumentUploadFields({ activeOnly: true });
  const configuredTemplates =
    String(session.role || '').toLowerCase() === 'owner'
      ? (await listOwnerNeededDocuments()).filter((item) => item.active !== false)
      : await listDriverNeededDocuments({ activeOnly: true, includeFields: true });
  const requiredDocuments = configuredUploadFields
    .filter((field) => Boolean(field.required) && matchesDocumentRole(field.account_type, session.role))
    .map((field) => field.key);
  const missingDocuments = requiredDocuments.filter((key) => !normalizedDocuments?.[key]);
  const missingDocumentDetails = [];

  for (const template of configuredTemplates) {
    if (!matchesDocumentRole(template.account_type, session.role) || !template.is_required) {
      continue;
    }

    const templateFields = Array.isArray(template.fields) ? template.fields : [];
    const templateDocuments = templateFields
      .map((field) => normalizedDocuments?.[field.key])
      .filter(Boolean);

    if (templateDocuments.length === 0) {
      continue;
    }

    const templateName = String(template.name || 'Document').trim();
    const identifyNumber = templateDocuments.find((item) => String(item?.identifyNumber || '').trim())?.identifyNumber || '';
    const expiryDate = templateDocuments.find((item) => String(item?.expiryDate || '').trim())?.expiryDate || '';

    if (template.has_identify_number && !identifyNumber) {
      missingDocumentDetails.push(`${templateName} ID number`);
    }

    if (template.has_expiry_date && !expiryDate) {
      missingDocumentDetails.push(`${templateName} expiry date`);
    }
  }

  if (missingDocuments.length > 0) {
    throw new ApiError(400, `Missing required documents: ${missingDocuments.join(', ')}`);
  }

  if (missingDocumentDetails.length > 0) {
    throw new ApiError(400, `Missing required document details: ${missingDocumentDetails.join(', ')}`);
  }

  let resolvedServiceLocation = session.vehicle.serviceLocation || null;

  if (!resolvedServiceLocation && session.vehicle.locationId) {
    resolvedServiceLocation = await ServiceLocation.findById(session.vehicle.locationId).lean();
  }

  const serviceLocationCoordinates = getValidatedServiceLocationCoordinates(resolvedServiceLocation || {});
  const isOwnerRegistration = String(session.role || '').toLowerCase() === 'owner';

  if (!serviceLocationCoordinates && !isOwnerRegistration) {
    throw new ApiError(400, `Unsupported service location: ${session.vehicle.locationName}`);
  }

  const zone = serviceLocationCoordinates ? await findZoneByPickup(serviceLocationCoordinates) : null;
  const selectedVehicle =
    session.vehicle.vehicleTypeId && /^[a-f\d]{24}$/i.test(String(session.vehicle.vehicleTypeId))
      ? await Vehicle.findById(session.vehicle.vehicleTypeId).lean()
      : null;
  const vehicleType = selectedVehicle
    ? getGenericVehicleTypeFromCatalog(selectedVehicle)
    : getVehicleType(session.vehicle.vehicleTypeId, session.vehicle.registerFor);
  if (isOwnerRegistration) {
    const normalizedEmail = String(session.personal.email || '').trim().toLowerCase();
    const normalizedMobile = String(session.phone || '').trim();
    const serviceLocationId =
      session.vehicle.locationId && /^[a-f\d]{24}$/i.test(String(session.vehicle.locationId))
        ? session.vehicle.locationId
        : null;

    const duplicateOwner = await Owner.findOne({
      $or: [
        { email: normalizedEmail },
        { mobile: normalizedMobile },
      ],
    }).lean();

    if (duplicateOwner) {
      throw new ApiError(409, 'Owner already exists with this phone or email');
    }

    const owner = await Owner.create({
      company_name: String(session.vehicle.companyName || session.personal.fullName || '').trim(),
      owner_name: String(session.personal.fullName || '').trim() || null,
      name: String(session.personal.fullName || '').trim(),
      mobile: normalizedMobile,
      email: normalizedEmail,
      password: session.personal.passwordHash,
      service_location_id: serviceLocationId || null,
      legacy_service_location_id: serviceLocationId ? '' : String(session.vehicle.locationId || '').trim(),
      transport_type: String(session.vehicle.registerFor || 'taxi').trim().toLowerCase(),
      phone: normalizedMobile,
      address: String(session.vehicle.companyAddress || '').trim() || null,
      postal_code: String(session.vehicle.postalCode || '').trim() || null,
      city: String(session.vehicle.city || session.vehicle.locationName || '').trim() || null,
      tax_number: String(session.vehicle.taxNumber || '').trim() || null,
      active: true,
      approve: false,
      status: 'pending',
      user_snapshot: {
        source: 'owner_onboarding',
        registrationId: session.registrationId,
        verifiedAt: session.otpVerifiedAt,
        submittedAt,
        location: serviceLocationCoordinates ? toPoint(serviceLocationCoordinates, 'location') : null,
        zoneId: zone?._id || null,
        documents: normalizedDocuments,
        onboardingVehicle: {
          ...session.vehicle,
        },
      },
      area_snapshot: resolvedServiceLocation || null,
    });

    session.status = 'completed';
    session.completedAt = submittedAt;
    await session.save();
    await DriverRegistrationSession.deleteOne({ _id: session._id });

    return {
      message: 'Owner registration completed successfully',
      owner: {
        id: owner._id,
        name: owner.owner_name || owner.name || owner.company_name || '',
        company_name: owner.company_name || '',
        phone: owner.mobile || owner.phone || '',
        email: owner.email || '',
        approve: owner.approve,
        status: owner.status,
      },
      documents: normalizedDocuments,
      token: signAccessToken({ sub: String(owner._id), role: 'owner' }),
      session: publicSessionPayload(session),
    };
  }

  const normalizedReferralCode = normalizeReferralCode(session.referralCode);
  const normalizedEmployeeCode = normalizeEmployeeCode(session.employeeCode);
  const referrer = normalizedReferralCode
    ? await findDriverByReferralCode(normalizedReferralCode)
    : null;
  const employee = normalizedEmployeeCode
    ? await findActiveEmployeeByCode(normalizedEmployeeCode)
    : null;

  if (normalizedReferralCode && !referrer?._id) {
    throw new ApiError(400, 'Invalid referral code');
  }

  if (normalizedEmployeeCode && !employee?._id) {
    throw new ApiError(400, 'Invalid employee code');
  }

  const driver = await Driver.create({
    name: session.personal.fullName,
    phone: session.phone,
    email: session.personal.email,
    gender: session.personal.gender,
    password: session.personal.passwordHash,
    service_location_id:
      session.vehicle.locationId && /^[a-f\d]{24}$/i.test(String(session.vehicle.locationId))
        ? session.vehicle.locationId
        : null,
    vehicleType,
    vehicleTypeId: selectedVehicle?._id || null,
    vehicleIconType: selectedVehicle?.icon_types || vehicleType,
    registerFor: session.vehicle.registerFor,
    serviceCategories: Array.isArray(session.vehicle.serviceCategories) ? session.vehicle.serviceCategories : [],
    vehicleMake: session.vehicle.make,
    vehicleModel: session.vehicle.model,
    vehicleNumber: session.vehicle.number,
    vehicleColor: session.vehicle.color,
    city: session.vehicle.city || session.vehicle.locationName,
    referredBy: referrer?._id || null,
    acquiredByEmployeeId: employee?._id || null,
    acquiredByEmployeeCode: employee?.employeeCode || '',
    approve: false,
    status: 'pending',
    zoneId: zone?._id || null,
    location: toPoint(serviceLocationCoordinates, 'location'),
    documents: normalizedDocuments,
    onboarding: {
      registrationId: session.registrationId,
      role: session.role,
      verifiedAt: session.otpVerifiedAt,
      submittedAt,
      personal: {
        fullName: session.personal.fullName,
        email: session.personal.email,
        gender: session.personal.gender,
      },
      vehicle: {
        registerFor: session.vehicle.registerFor,
        serviceCategories: Array.isArray(session.vehicle.serviceCategories) ? session.vehicle.serviceCategories : [],
        locationId: session.vehicle.locationId,
        locationName: session.vehicle.locationName,
        vehicleTypeId: session.vehicle.vehicleTypeId,
        rcNumber: session.vehicle.rcNumber,
        make: session.vehicle.make,
        model: session.vehicle.model,
        year: session.vehicle.year,
        number: session.vehicle.number,
        color: session.vehicle.color,
        city: session.vehicle.city,
        customFields: session.vehicle.customFields || {},
      },
    },
  });

  if (!String(driver.referralCode || '').trim()) {
    driver.referralCode = generateDriverReferralCode(driver);
    await driver.save();
  }

  if (referrer?._id) {
    await Driver.updateOne({ _id: referrer._id }, { $inc: { referralCount: 1 } });
    await processDriverSignupReferralRewards({ driver, referrer });
  }

  session.finalDriverId = driver._id;
  session.status = 'completed';
  session.completedAt = submittedAt;
  await session.save();
  await DriverRegistrationSession.deleteOne({ _id: session._id });

  return {
    message: 'Driver registration completed successfully',
    driver: publicDriverPayload(driver),
    documents: normalizedDocuments,
    token: signAccessToken({ sub: String(driver._id), role: 'driver' }),
    session: publicSessionPayload(session),
  };
};

export const getDriverOnboardingSession = async ({ registrationId, phone }) => {
  const session = await getSession(registrationId, phone);
  return {
    session: publicSessionPayload(session),
    personal: session.personal,
    referralCode: session.referralCode,
    employeeCode: session.employeeCode || '',
    vehicle: session.vehicle,
    documents: session.documents,
    roleDetails: session.roleDetails,
    completedAt: session.completedAt,
  };
};

export const verifyDriverVehicleRc = async ({
  registrationId,
  phone,
  rcNumber,
}) => {
  const session = await getSession(registrationId, phone);

  if (!session.personal?.fullName) {
    throw new ApiError(400, 'Save personal details before RC verification');
  }

  const normalizedRcNumber = String(rcNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  if (!normalizedRcNumber) {
    throw new ApiError(400, 'RC number is required');
  }

  if (!VEHICLE_NUMBER_PATTERNS.some((pattern) => pattern.test(normalizedRcNumber))) {
    throw new ApiError(400, 'RC number must be in a valid format, for example DL1AB2345 or MH12AB1234');
  }

  const providerResponse = await verifyRcWithRecharge({
    rcNumber: normalizedRcNumber,
    partnerRequestId: buildOnboardingRcVerificationRequestId(session),
  });

  const cardData = providerResponse?.cardData || {};
  const result = cardData?.result || providerResponse?.result || providerResponse?.data || {};
  const verificationSucceeded =
    Number(providerResponse?.status || 0) === 1
    || String(providerResponse?.status || '').trim() === '1';

  if (!verificationSucceeded) {
    throw new ApiError(
      400,
      String(providerResponse?.msg || providerResponse?.message || 'RC verification failed'),
    );
  }

  const vehicle = normalizeRcVerificationResult(result, normalizedRcNumber);

  return {
    message: String(providerResponse?.msg || 'RC verified successfully').trim(),
    rcNumber: normalizedRcNumber,
    vehicle,
    verification: providerResponse,
  };
};

export const verifyDriverOnboardingLicenseDocument = async ({
  registrationId,
  phone,
  documentKey,
  licenseNumber,
  birthDate,
  requestNumber,
}) => {
  const session = await getSession(registrationId, phone);

  if (!session.personal?.fullName) {
    throw new ApiError(400, 'Save personal details before DL verification');
  }

  const normalizedDocumentKey = String(documentKey || '').trim();
  if (!normalizedDocumentKey) {
    throw new ApiError(400, 'Document key is required');
  }

  const existingDocument = session.documents?.[normalizedDocumentKey] || {};
  const normalizedLicenseNumber = String(
    licenseNumber ||
    existingDocument.identifyNumber ||
    existingDocument.identify_number ||
    existingDocument.documentNumber ||
    existingDocument.document_number ||
    '',
  ).trim().toUpperCase();
  const normalizedBirthDate = String(
    birthDate ||
    existingDocument.birthDate ||
    existingDocument.birth_date ||
    '',
  ).trim();

  if (!normalizedLicenseNumber) {
    throw new ApiError(400, 'Driving license number is required before verification');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate) && !/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedBirthDate)) {
    throw new ApiError(400, 'Birth date must use YYYY-MM-DD or DD/MM/YYYY format before verification');
  }

  const providerResponse = await verifyDrivingLicenseWithRecharge({
    licenseNumber: normalizedLicenseNumber,
    birthDate: normalizedBirthDate,
    partnerRequestId: buildOnboardingLicenseVerificationRequestId(session),
    requestNumber: String(
      requestNumber ||
      existingDocument.requestNumber ||
      existingDocument.request_no ||
      '',
    ).trim(),
  });

  const result = providerResponse?.cardData?.result || {};
  const licenseDetails = result?.details_of_driving_licence || {};
  const nonTransportValidity = result?.dl_validity?.non_transport || {};
  const badgeDetails = Array.isArray(result?.badge_details) ? result.badge_details : [];
  const firstBadge = badgeDetails[0] || {};
  const verification = resolveRechargeVerificationState(
    providerResponse,
    String(licenseDetails?.status || '').trim(),
  );
  const verificationMessage = verification.message;

  const updatedDocument = {
    ...(typeof existingDocument === 'object' ? existingDocument : {}),
    key: normalizedDocumentKey,
    identifyNumber: normalizedLicenseNumber,
    identify_number: normalizedLicenseNumber,
    documentNumber: normalizedLicenseNumber,
    document_number: normalizedLicenseNumber,
    birthDate: normalizedBirthDate,
    birth_date: normalizedBirthDate,
    requestNumber: String(
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.orderid ||
      requestNumber ||
      existingDocument.requestNumber ||
      existingDocument.request_no ||
      '',
    ).trim(),
    request_no: String(
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      providerResponse?.orderid ||
      requestNumber ||
      existingDocument.requestNumber ||
      existingDocument.request_no ||
      '',
    ).trim(),
    verificationStatus: verification.status,
    verifiedAt: verification.succeeded ? new Date().toISOString() : existingDocument.verifiedAt || null,
    verificationMessage,
    verificationReferenceId: String(
      providerResponse?.orderid ||
      providerResponse?.partnerreqid ||
      providerResponse?.cardData?.request_id ||
      '',
    ).trim(),
    verifiedName: String(licenseDetails?.name || '').trim(),
    verifiedDob: String(result?.dob || normalizedBirthDate).trim(),
    dlStatus: String(licenseDetails?.status || '').trim(),
    issuingRtoName: '',
    relativeName: String(licenseDetails?.father_or_husband_name || '').trim(),
    dlNumber: String(result?.dl_number || normalizedLicenseNumber).trim(),
    nonTransportValidFrom: String(nonTransportValidity?.from || '').trim(),
    nonTransportValidTo: String(nonTransportValidity?.to || '').trim(),
    transportValidFrom: String(result?.dl_validity?.transport?.from || '').trim(),
    transportValidTo: String(result?.dl_validity?.transport?.to || '').trim(),
    badgeNumber: String(firstBadge?.badge_no || '').trim(),
    badgeIssueDate: String(firstBadge?.badge_issue_date || '').trim(),
    classOfVehicle: Array.isArray(firstBadge?.class_of_vehicle) ? firstBadge.class_of_vehicle : [],
    verificationResponse: providerResponse,
  };

  session.documents = {
    ...(session.documents || {}),
    [normalizedDocumentKey]: updatedDocument,
  };

  session.markModified('documents');
  await session.save();

  return {
    message: verificationMessage || 'Driving license verified successfully',
    document: updatedDocument,
    documents: session.documents || {},
    verification: providerResponse,
  };
};
