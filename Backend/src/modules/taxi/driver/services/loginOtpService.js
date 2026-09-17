import crypto from 'node:crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { env } from '../../../../config/env.js';
import { Owner } from '../../admin/models/Owner.js';
import { ServiceStore } from '../../admin/models/ServiceStore.js';
import { ServiceCenterStaff } from '../../admin/models/ServiceCenterStaff.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { Driver } from '../models/Driver.js';
import { BusDriver } from '../models/BusDriver.js';
import { DriverLoginSession } from '../models/DriverLoginSession.js';
import { signAccessToken } from './authService.js';
import { sendOtpSms } from '../../services/smsService.js';

const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;

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

const generateOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const normalizeRole = (role) => {
  const normalized = String(role || 'driver').toLowerCase();
  if (normalized === 'owner') return 'owner';
  if (
    normalized === 'service_center' ||
    normalized === 'service-center' ||
    normalized === 'servicecenter'
  ) {
    return 'service_center';
  }
  if (
    normalized === 'service_center_staff' ||
    normalized === 'service-center-staff' ||
    normalized === 'servicecenterstaff' ||
    normalized === 'center_staff'
  ) {
    return 'service_center_staff';
  }
  if (normalized === 'bus_driver' || normalized === 'bus-driver' || normalized === 'busdriver') {
    return 'bus_driver';
  }
  if (normalized === 'pooling_driver' || normalized === 'pooling-driver' || normalized === 'poolingdriver' || normalized === 'pooling') {
    return 'pooling_driver';
  }
  return 'driver';
};

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const getVisibleOtp = (otp) => (process.env.NODE_ENV !== 'production' ? String(otp) : null);
const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const TEST_LOGIN_OTP_PHONE = '6268423925';
const TEST_LOGIN_OTP_CODE = '0000';
const getStaticDriverOtpConfig = () => ({
  phone: normalizePhone(env.sms?.staticOtpPhone || TEST_LOGIN_OTP_PHONE),
  otp: String(env.sms?.staticOtpCode || TEST_LOGIN_OTP_CODE).trim(),
});
const resolveDriverLoginOtpForPhone = (phone) => {
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

const getSession = async (phone) => {
  const session = await DriverLoginSession.findOne({ phone: normalizePhone(phone) }).select('+otpHash');

  if (!session) {
    throw new ApiError(404, 'Login session not found');
  }

  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    await DriverLoginSession.deleteOne({ _id: session._id });
    throw new ApiError(410, 'Login session expired');
  }

  return session;
};

const publicSessionPayload = (session, debugOtp = null) => ({
  phone: session.phone,
  status: 'otp_sent',
  debugOtp,
});

const publicDriverPayload = (driver) => ({
  id: driver._id,
  name: driver.name,
  phone: driver.phone,
  email: driver.email,
  gender: driver.gender,
  vehicleType: driver.vehicleType,
  registerFor: driver.registerFor,
  vehicleNumber: driver.vehicleNumber,
  vehicleColor: driver.vehicleColor,
  city: driver.city,
  approve: driver.approve,
  status: driver.status,
  rating: driver.rating,
  isOnline: driver.isOnline,
  isOnRide: driver.isOnRide,
});

const publicOwnerPayload = (owner) => ({
  id: owner._id,
  name: owner.name || owner.company_name || '',
  company_name: owner.company_name || '',
  phone: owner.mobile || owner.phone || '',
  email: owner.email || '',
  city: owner.city || '',
  approve: owner.approve,
  status: owner.status,
});

const publicServiceCenterPayload = (center) => ({
  id: center._id,
  name: center.name || '',
  owner_name: center.owner_name || '',
  phone: center.owner_phone || '',
  address: center.address || '',
  status: center.status || 'active',
});

const publicServiceCenterStaffPayload = (staff) => ({
  id: staff._id,
  name: staff.name || '',
  phone: staff.phone || '',
  status: staff.status || 'active',
  serviceCenterId: staff.serviceCenterId ? String(staff.serviceCenterId) : '',
});

const publicBusDriverPayload = (driver) => ({
  id: driver._id,
  name: driver.name || '',
  phone: driver.phone || '',
  email: driver.email || '',
  approve: driver.approve,
  active: driver.active,
  status: driver.status || 'approved',
  assignedBusServiceId: driver.assignedBusServiceId ? String(driver.assignedBusServiceId) : '',
  operatorName: driver.operatorName || '',
  busName: driver.busName || '',
  serviceNumber: driver.serviceNumber || '',
  routeName: driver.routeName || '',
  originCity: driver.originCity || '',
  destinationCity: driver.destinationCity || '',
});

const publicPoolingDriverPayload = (vehicle) => ({
  id: vehicle._id,
  name: vehicle.driverName || 'Pooling Driver',
  phone: vehicle.driverPhone || '',
  approve: vehicle.approve !== false,
  active: vehicle.poolingEnabled !== false,
  status: vehicle.status || (vehicle.approve === false ? 'pending' : 'active'),
  vehicleId: vehicle._id,
  vehicleName: vehicle.name || '',
  vehicleNumber: vehicle.vehicleNumber || '',
  vehicleModel: vehicle.vehicleModel || '',
  vehicleType: vehicle.vehicleType || 'sedan',
  vehicleColor: vehicle.color || '',
});

const LOGIN_ROLE_PRIORITY = [
  'owner',
  'service_center',
  'service_center_staff',
  'bus_driver',
  'pooling_driver',
  'driver',
];

const isApprovedDriver = (driver) =>
  Boolean(driver) &&
  driver.approve !== false &&
  String(driver.status || '').toLowerCase() !== 'pending';

const isApprovedOwner = (owner) =>
  Boolean(owner) &&
  owner.active !== false &&
  (owner.approve === true || String(owner.status || '').toLowerCase() === 'approved');

const isApprovedBusDriver = (driver) =>
  Boolean(driver) &&
  driver.active !== false &&
  driver.approve !== false &&
  !['pending', 'blocked'].includes(String(driver.status || '').toLowerCase());

const isApprovedServiceCenter = (center) =>
  Boolean(center) &&
  center.active !== false &&
  String(center.status || '').toLowerCase() !== 'inactive';

const isApprovedServiceCenterStaff = (staff) =>
  Boolean(staff) &&
  staff.active !== false &&
  String(staff.status || '').toLowerCase() !== 'inactive';

export const findDriverPortalAccountByPhone = async ({ phone, role } = {}) => {
  const normalizedRole = normalizeRole(role);
  const phoneCandidates = buildPhoneCandidates(phone);

  if (!phoneCandidates.length) {
    return null;
  }

  const account =
    normalizedRole === 'owner'
      ? await Owner.findOne({
          $or: [{ mobile: { $in: phoneCandidates } }, { phone: { $in: phoneCandidates } }],
        })
      : normalizedRole === 'service_center'
        ? await ServiceStore.findOne({ owner_phone: { $in: phoneCandidates } })
      : normalizedRole === 'service_center_staff'
        ? await ServiceCenterStaff.findOne({ phone: { $in: phoneCandidates } })
      : normalizedRole === 'bus_driver'
        ? await BusDriver.findOne({ phone: { $in: phoneCandidates } })
      : normalizedRole === 'pooling_driver'
        ? await PoolingVehicle.findOne({ driverPhone: { $in: phoneCandidates } })
        : await Driver.findOne({ phone: { $in: phoneCandidates } });

  return account ? { role: normalizedRole, account } : null;
};

const buildDriverPortalExistenceQuery = (role, phoneCandidates) => {
  if (role === 'owner') {
    return Owner.findOne({
      $or: [{ mobile: { $in: phoneCandidates } }, { phone: { $in: phoneCandidates } }],
    }).select('_id').lean();
  }

  if (role === 'service_center') {
    return ServiceStore.findOne({ owner_phone: { $in: phoneCandidates } }).select('_id').lean();
  }

  if (role === 'service_center_staff') {
    return ServiceCenterStaff.findOne({ phone: { $in: phoneCandidates } }).select('_id').lean();
  }

  if (role === 'bus_driver') {
    return BusDriver.findOne({ phone: { $in: phoneCandidates } }).select('_id').lean();
  }

  if (role === 'pooling_driver') {
    return PoolingVehicle.findOne({ driverPhone: { $in: phoneCandidates } }).select('_id').lean();
  }

  return Driver.findOne({ phone: { $in: phoneCandidates } }).select('_id').lean();
};

export const findPreferredDriverPortalAccountByPhone = async (phone) => {
  const phoneCandidates = buildPhoneCandidates(phone);

  if (!phoneCandidates.length) {
    return null;
  }

  const results = await Promise.all(
    LOGIN_ROLE_PRIORITY.map(async (role) => {
      const account = await buildDriverPortalExistenceQuery(role, phoneCandidates);
      return account ? { role, account } : null;
    }),
  );

  for (const role of LOGIN_ROLE_PRIORITY) {
    const match = results.find((item) => item?.role === role);
    if (match) return match;
  }

  return null;
};

export const findAllDriverPortalAccountsByPhone = async (phone) => {
  const phoneCandidates = buildPhoneCandidates(phone);

  if (!phoneCandidates.length) {
    return [];
  }

  const results = await Promise.all(
    LOGIN_ROLE_PRIORITY.map(async (role) => {
      const account = await buildDriverPortalExistenceQuery(role, phoneCandidates);
      return account ? { role, id: account._id } : null;
    }),
  );

  return results.filter(Boolean);
};

export const startDriverLoginOtp = async ({ phone, role = 'driver' }) => {
  const normalizedPhone = normalizePhone(phone);
  const normalizedRole = normalizeRole(role);

  if (!normalizedPhone || normalizedPhone.length !== 10) {
    throw new ApiError(400, 'A valid 10-digit mobile number is required');
  }

  const match = await findDriverPortalAccountByPhone({ phone: normalizedPhone, role: normalizedRole });
  const account = match?.account;

  if (!account) {
    throw new ApiError(
      404,
      `${
        normalizedRole === 'owner'
          ? 'Owner'
          : normalizedRole === 'service_center'
            ? 'Service center'
          : normalizedRole === 'service_center_staff'
            ? 'Service center staff'
          : normalizedRole === 'bus_driver'
            ? 'Bus driver'
          : normalizedRole === 'pooling_driver'
            ? 'Pooling driver'
            : 'Driver'
      } account not found`,
    );
  }

  // Allow login even if account is pending approval to show registration status
  // if (
  //   (normalizedRole === 'owner' && !isApprovedOwner(account)) ||
  //   (normalizedRole === 'service_center' && !isApprovedServiceCenter(account)) ||
  //   (normalizedRole === 'service_center_staff' && !isApprovedServiceCenterStaff(account)) ||
  //   (normalizedRole === 'driver' && !isApprovedDriver(account)) ||
  //   (normalizedRole === 'bus_driver' && !isApprovedBusDriver(account))
  // ) {
  //   throw new ApiError(
  //     403,
  //     `${
  //       normalizedRole === 'owner'
  //         ? 'Owner'
  //         : normalizedRole === 'service_center'
  //           ? 'Service center'
  //         : normalizedRole === 'service_center_staff'
  //           ? 'Service center staff'
  //         : normalizedRole === 'bus_driver'
  //           ? 'Bus driver'
  //           : 'Driver'
  //     } account is pending approval`,
  //   );
  // }

  const { otp, isStatic } = resolveDriverLoginOtpForPhone(normalizedPhone);
  const now = Date.now();

  const session = await DriverLoginSession.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      phone: normalizedPhone,
      driverId: account._id,
      accountRole: normalizedRole,
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now + LOGIN_OTP_TTL_MS),
      verifiedAt: null,
      expiresAt: new Date(now + LOGIN_OTP_TTL_MS),
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
        purpose: 'driver login OTP',
      });
  const debugOtp = getVisibleOtp(otp);

  if (debugOtp) {
    console.log(`[loginOtpService] OTP for ${normalizedPhone} = ${debugOtp} (${smsDispatch.mode})`);
  }

  const allRoles = await findAllDriverPortalAccountsByPhone(normalizedPhone);
  const rolesList = allRoles.map((item) => item.role);

  return {
    message: smsDispatch.mode === 'live' ? 'OTP sent successfully' : 'OTP generated successfully',
    session: publicSessionPayload(session, debugOtp),
    availableRoles: rolesList,
  };
};

export const verifyDriverLoginOtp = async ({ phone, otp, role }) => {
  const session = await getSession(phone);

  if (!otp || String(otp).trim().length !== 4) {
    throw new ApiError(400, 'A valid 4-digit OTP is required');
  }

  if (!session.otpExpiresAt || new Date(session.otpExpiresAt).getTime() < Date.now()) {
    throw new ApiError(410, 'OTP has expired');
  }

  if (session.otpHash !== hashOtp(otp)) {
    throw new ApiError(401, 'Invalid OTP');
  }

  // If no role is requested, check if there are multiple roles
  if (!role) {
    const allRoles = await findAllDriverPortalAccountsByPhone(phone);
    const rolesList = allRoles.map((item) => item.role);

    if (rolesList.length > 1) {
      session.verifiedAt = new Date();
      await session.save();

      return {
        message: 'OTP verified successfully. Multiple roles detected.',
        needsRoleSelection: true,
        availableRoles: rolesList,
      };
    }
  }

  const normalizedRole = role ? normalizeRole(role) : normalizeRole(session.accountRole);
  let account = null;

  if (role) {
    const match = await findDriverPortalAccountByPhone({ phone, role: normalizedRole });
    if (match) {
      account = match.account;
    }
  } else {
    account =
      normalizedRole === 'owner'
        ? await Owner.findById(session.driverId)
        : normalizedRole === 'service_center'
          ? await ServiceStore.findById(session.driverId)
        : normalizedRole === 'service_center_staff'
          ? await ServiceCenterStaff.findById(session.driverId)
        : normalizedRole === 'bus_driver'
          ? await BusDriver.findById(session.driverId)
        : normalizedRole === 'pooling_driver'
          ? await PoolingVehicle.findById(session.driverId)
          : await Driver.findById(session.driverId);
  }

  if (!account) {
    throw new ApiError(
      404,
      `${
        normalizedRole === 'owner'
          ? 'Owner'
          : normalizedRole === 'service_center'
            ? 'Service center'
          : normalizedRole === 'service_center_staff'
            ? 'Service center staff'
          : normalizedRole === 'bus_driver'
            ? 'Bus driver'
          : normalizedRole === 'pooling_driver'
            ? 'Pooling driver'
            : 'Driver'
      } account not found`,
    );
  }

  // Allow verification even if account is pending approval
  // if (
  //   (normalizedRole === 'owner' && !isApprovedOwner(account)) ||
  //   (normalizedRole === 'service_center' && !isApprovedServiceCenter(account)) ||
  //   (normalizedRole === 'service_center_staff' && !isApprovedServiceCenterStaff(account)) ||
  //   (normalizedRole === 'driver' && !isApprovedDriver(account)) ||
  //   (normalizedRole === 'bus_driver' && !isApprovedBusDriver(account))
  // ) {
  //   throw new ApiError(
  //     403,
  //     `${
  //       normalizedRole === 'owner'
  //         ? 'Owner'
  //         : normalizedRole === 'service_center'
  //           ? 'Service center'
  //         : normalizedRole === 'service_center_staff'
  //           ? 'Service center staff'
  //         : normalizedRole === 'bus_driver'
  //           ? 'Bus driver'
  //           : 'Driver'
  //       } account is pending approval`,
  //     );
  //   }

  if (normalizedRole === 'bus_driver') {
    account.lastLoginAt = new Date();
    await account.save();
  }

  session.verifiedAt = new Date();
  session.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await session.save();
  await DriverLoginSession.deleteOne({ _id: session._id });

  return {
    message: 'OTP verified successfully',
    token: signAccessToken({ sub: String(account._id), role: normalizedRole }),
    role: normalizedRole,
    driver:
      normalizedRole === 'owner'
        ? publicOwnerPayload(account)
        : normalizedRole === 'service_center'
          ? publicServiceCenterPayload(account)
        : normalizedRole === 'service_center_staff'
            ? publicServiceCenterStaffPayload(account)
        : normalizedRole === 'bus_driver'
          ? publicBusDriverPayload(account)
        : normalizedRole === 'pooling_driver'
          ? publicPoolingDriverPayload(account)
          : publicDriverPayload(account),
  };
};
