import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Env, StandardCheckoutClient, StandardCheckoutPayRequest, PrefillUserLoginDetails } from '@phonepe-pg/pg-sdk-node';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { User } from '../models/User.js';
import { UserWallet } from '../models/UserWallet.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { Notification } from '../../admin/promotions/models/Notification.js';
import { BusService } from '../../admin/models/BusService.js';
import { Driver } from '../../driver/models/Driver.js';
import { comparePassword, hashPassword, signAccessToken } from '../services/authService.js';
import { env } from '../../../../config/env.js';
import { uploadDataUrlToCloudinary } from '../../../../utils/cloudinaryUpload.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';
import {
  consumeUserSignupSession,
  requireVerifiedUserSignupSession,
  startUserOtp,
  verifyUserOtp,
} from '../services/userOtpService.js';
import { assignPushTokenToEntity } from '../../services/pushTokenService.js';
import { BusSeatHold } from '../models/BusSeatHold.js';
import { BusBooking } from '../models/BusBooking.js';
import { RentalBookingRequest } from '../../admin/models/RentalBookingRequest.js';
import { RentalQuoteRequest } from '../../admin/models/RentalQuoteRequest.js';
import { RentalVehicleType } from '../../admin/models/RentalVehicleType.js';
import { ServiceStore } from '../../admin/models/ServiceStore.js';
import { SetPrice } from '../../admin/models/SetPrice.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { emitToDriver } from '../../services/dispatchService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';
import { buildRentalTrackingSnapshot, updateUserRentalTracking } from '../../services/rentalTrackingService.js';
import { listDriverServiceLocations } from '../../driver/services/serviceLocationService.js';
import { listServiceStores, listSetPrices, listZones } from '../../admin/services/adminService.js';
import {
  findActiveEmployeeByCode,
  normalizeEmployeeCode,
} from '../../admin/services/employeeAttributionService.js';
import {
  getUserSubscriptionSummary,
  listCustomerSubscriptionPlans,
  purchaseUserSubscription,
} from '../services/subscriptionService.js';
import {
  buildPaymentRequestContext,
  logPaymentDiagnostic,
  summarizeCheckoutUrl,
  summarizePhonePeCredentialMeta,
  summarizePhonePePayload,
  summarizePhonePeRequestBody,
} from '../../services/paymentDiagnostics.js';

const VALID_GENDERS = new Set(['male', 'female', 'other', 'prefer-not-to-say', '']);

const toCleanString = (value) => String(value || '').trim();

const normalizePhone = (value) => {
  const digits = toCleanString(value).replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const normalizeEmail = (value) => toCleanString(value).toLowerCase();
const normalizeReferralCode = (value) => toCleanString(value).toUpperCase();

const normalizeGender = (value) => {
  const gender = toCleanString(value).toLowerCase();
  return VALID_GENDERS.has(gender) ? gender : 'prefer-not-to-say';
};

const validatePhone = (phone) => {
  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'A valid 10-digit phone number is required');
  }
};

const validateName = (name) => {
  if (!name || name.length < 2 || name.length > 80) {
    throw new ApiError(400, 'name must be between 2 and 80 characters');
  }
};

const validateEmail = (email) => {
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, 'A valid email address is required');
  }
};

const normalizeMoneyAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'amount must be a positive number');
  }
  return Math.round(amount * 100) / 100;
};

const ensureUserWallet = async (userId) => {
  if (!userId) return;
  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true },
  );
};

const serializeUserWalletTransaction = (entry = {}) => ({
  id: entry._id,
  kind: entry.kind,
  amount: Number(entry.amount || 0),
  title: entry.title || '',
  counterpartyPhone: entry.counterpartyPhone || '',
  createdAt: entry.createdAt || null,
});

const buildUserWalletPayload = (wallet) => {
  const transactions = Array.isArray(wallet?.transactions) ? wallet.transactions : [];

  return {
    balance: Number(wallet?.balance || 0),
    refundWallet: Number(wallet?.refundWallet || 0),
    currency: 'INR',
    recentTransactions: transactions
      .slice()
      .reverse()
      .map(serializeUserWalletTransaction),
  };
};

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials('razor_pay');
};

const resolvePhonePeCredentials = async () => {
  return resolveConfiguredGatewayCredentials('phone_pay');
};

const isActiveEntity = (item = {}) =>
  item?.active !== false && String(item?.status || 'active').toLowerCase() === 'active';

export const listPublicServiceLocations = async (_req, res) => {
  const results = await listDriverServiceLocations();

  res.json({
    success: true,
    data: {
      results,
    },
  });
};

export const listPublicServiceStores = async (_req, res) => {
  const results = (await listServiceStores())
    .filter(isActiveEntity)
    .map((store) => {
      const resolvedServiceLocationId =
        store.service_location_id ||
        store.zone_id?.service_location_id ||
        null;

      return {
        _id: store._id,
        id: store.id || store._id,
        name: store.name || '',
        address: store.address || '',
        owner_name: store.owner_name || '',
        owner_phone: store.owner_phone || '',
        service_location_id: resolvedServiceLocationId,
        zone_id: store.zone_id,
        latitude: Number(store.latitude ?? null),
        longitude: Number(store.longitude ?? null),
        status: store.status || 'active',
        active: store.active !== false,
      };
    });

  res.json({
    success: true,
    data: {
      results,
    },
  });
};

const normalizeOriginCandidate = (value = '') => {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue || trimmedValue === '*') {
    return '';
  }

  try {
    return new URL(trimmedValue).origin.replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const isPublicWebOrigin = (value = '') => {
  const origin = normalizeOriginCandidate(value);
  if (!origin) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(origin);
    if (!['http:', 'https:'].includes(protocol)) {
      return false;
    }

    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

const getFrontendBaseUrl = (req) => {
  const configuredOrigins = [
    env.phonePeRedirectBaseUrl,
    env.publicFrontendUrl,
    ...String(env.corsOrigin || '')
      .split(',')
      .map((value) => value.trim()),
  ]
    .map(normalizeOriginCandidate)
    .filter(Boolean);

  const requestCandidates = [
    normalizeOriginCandidate(req?.get?.('origin')),
    normalizeOriginCandidate(req?.get?.('referer')),
    (() => {
      const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').trim();
      const forwardedHost = String(req?.get?.('x-forwarded-host') || '').trim();
      if (!forwardedProto || !forwardedHost) {
        return '';
      }
      return normalizeOriginCandidate(`${forwardedProto}://${forwardedHost}`);
    })(),
    (() => {
      const host = String(req?.get?.('host') || '').trim();
      const proto =
        String(req?.protocol || '').trim() ||
        String(req?.get?.('x-forwarded-proto') || '').trim() ||
        'http';
      if (!host) {
        return '';
      }
      return normalizeOriginCandidate(`${proto}://${host}`);
    })(),
  ].filter(Boolean);

  const preferredPublicOrigin =
    configuredOrigins.find(isPublicWebOrigin) ||
    requestCandidates.find(isPublicWebOrigin);

  if (preferredPublicOrigin) {
    return preferredPublicOrigin;
  }

  return (
    configuredOrigins[0] ||
    requestCandidates[0] ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');
};

const getPhonePeApiBaseUrl = (environment = 'test') => (
  String(environment).trim().toLowerCase() === 'production'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox'
);

const getPhonePeAuthUrl = (environment = 'test') => (
  String(environment).trim().toLowerCase() === 'production'
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token'
);

const phonePeAccessTokenCache = new Map();
const phonePeClientCache = new Map();

const getPhonePeCheckoutClient = ({
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const normalizedEnvironment = String(environment || 'test').trim().toLowerCase();
  const normalizedVersion = Number.parseInt(String(clientVersion || '1'), 10) || 1;
  const cacheKey = `${normalizedEnvironment}::${clientId}::${normalizedVersion}`;

  if (phonePeClientCache.has(cacheKey)) {
    return phonePeClientCache.get(cacheKey);
  }

  const client = StandardCheckoutClient.getInstance(
    clientId,
    clientSecret,
    normalizedVersion,
    normalizedEnvironment === 'production' ? Env.PRODUCTION : Env.SANDBOX,
  );

  phonePeClientCache.set(cacheKey, client);
  return client;
};

const getPhonePeAccessToken = async ({
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const cacheKey = `${String(environment).trim().toLowerCase()}::${clientId}::${clientVersion}`;
  const cachedToken = phonePeAccessTokenCache.get(cacheKey);
  const nowEpochSeconds = Math.floor(Date.now() / 1000);

  if (cachedToken?.accessToken && Number(cachedToken.expiresAt || 0) - 60 > nowEpochSeconds) {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user',
      stage: 'auth-cache-hit',
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
    });
    return cachedToken.accessToken;
  }

  const requestBody = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user',
    stage: 'auth-request',
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
  });

  const response = await fetch(getPhonePeAuthUrl(environment), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: requestBody.toString(),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user',
      stage: 'auth-failed',
      level: 'error',
      statusCode: response.status || 502,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
    });
    throw new ApiError(
      response.status || 502,
      payload?.message || payload?.error_description || payload?.error || 'PhonePe authorization failed',
    );
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user',
    stage: 'auth-success',
    statusCode: response.status || 200,
    expiresAt: Number(payload.expires_at || nowEpochSeconds + 300),
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
  });

  phonePeAccessTokenCache.set(cacheKey, {
    accessToken: String(payload.access_token),
    expiresAt: Number(payload.expires_at || nowEpochSeconds + 300),
  });

  return String(payload.access_token);
};

const phonePeRequest = async ({
  method,
  path,
  body,
  clientId,
  clientSecret,
  clientVersion,
  environment,
}) => {
  const normalizedMethod = String(method || 'GET').trim().toUpperCase();
  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user',
    stage: 'api-request',
    method: normalizedMethod,
    path,
    ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
    request: summarizePhonePeRequestBody(body || {}),
  });
  const client = getPhonePeCheckoutClient({
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  try {
    let payload = null;

    if (normalizedMethod === 'POST' && path === '/checkout/v2/pay') {
      const merchantOrderId = String(body?.merchantOrderId || '').trim();
      const amount = Number(body?.amount || 0);
      const redirectUrl = String(body?.paymentFlow?.merchantUrls?.redirectUrl || '').trim();

      if (!merchantOrderId || !amount || !redirectUrl) {
        throw new ApiError(400, 'PhonePe merchant order id, amount, and redirect URL are required');
      }

      const builder = StandardCheckoutPayRequest.builder()
        .merchantOrderId(merchantOrderId)
        .amount(amount)
        .redirectUrl(redirectUrl);

      if (body?.paymentFlow?.message) {
        builder.message(String(body.paymentFlow.message));
      }
      if (body?.expireAfter) {
        builder.expireAfter(Number(body.expireAfter));
      }
      if (body?.prefillUserLoginDetails?.phoneNumber) {
        const prefill = PrefillUserLoginDetails.builder()
          .phoneNumber(String(body.prefillUserLoginDetails.phoneNumber))
          .build();
        builder.prefillUserLoginDetails(prefill);
      }
      if (body?.metaInfo) {
        builder.metaInfo(body.metaInfo);
      }

      const request = builder.build();
      payload = await client.pay(request);
    } else if (normalizedMethod === 'GET' && path.includes('/checkout/v2/order/')) {
      const orderMatch = path.match(/\/checkout\/v2\/order\/([^/]+)\/status/i);
      const merchantOrderId = decodeURIComponent(orderMatch?.[1] || '').trim();

      if (!merchantOrderId) {
        throw new ApiError(400, 'PhonePe merchant order id is required');
      }

      payload = await client.getOrderStatus(merchantOrderId);
    } else {
      throw new ApiError(400, `Unsupported PhonePe operation: ${normalizedMethod} ${path}`);
    }

    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user',
      stage: 'api-success',
      method: normalizedMethod,
      path,
      statusCode: 200,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
    });

    return payload;
  } catch (error) {
    const payload = error?.response || error?.payload || error?.data || null;
    const statusCode = Number(error?.statusCode || error?.status || 502);

    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user',
      stage: 'api-failed',
      level: 'error',
      method: normalizedMethod,
      path,
      statusCode,
      ...summarizePhonePeCredentialMeta({ clientId, clientVersion, environment }),
      response: summarizePhonePePayload(payload || {}),
      providerMessage:
        error?.message ||
        payload?.message ||
        payload?.responseCodeDescription ||
        payload?.detailedErrorCode ||
        '',
    });
    throw new ApiError(
      statusCode,
      error?.message || payload?.message || payload?.code || 'PhonePe request failed',
    );
  }
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

const BUS_HOLD_MINUTES = 10;
const BUS_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const normalizeBusTravelDate = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const leadingDateMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (leadingDateMatch) {
    return leadingDateMatch[1];
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

const tryNormalizeBusTravelDate = (...values) => {
  for (const value of values) {
    const rawValue = toCleanString(value);
    if (!rawValue) {
      continue;
    }

    try {
      return normalizeBusTravelDate(rawValue);
    } catch {
      continue;
    }
  }

  return '';
};

const getBusTravelDayLabel = (travelDate) => {
  const parsed = new Date(`${travelDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Invalid travelDate');
  }

  return BUS_DAY_LABELS[parsed.getUTCDay()];
};

const normalizeBusCity = (value) => toCleanString(value).toLowerCase();

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildBusCityRegex = (value) => new RegExp(`^${escapeRegex(toCleanString(value))}$`, 'i');

const flattenBusBlueprintSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id);

const resolveBusSeatPrice = (busService = {}, seat = {}) => {
  const variantPricing = busService?.variantPricing || {};
  const defaultPrice = Number(busService?.seatPrice || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

const findBusSchedule = (busService, scheduleId) =>
  (Array.isArray(busService?.schedules) ? busService.schedules : []).find(
    (item) => String(item?.id || '') === String(scheduleId || ''),
  );

const isScheduleAvailableOnDate = (schedule, travelDate) => {
  if (!schedule || String(schedule.status || 'active') !== 'active') {
    return false;
  }

  const activeDays = Array.isArray(schedule.activeDays) ? schedule.activeDays : [];
  if (activeDays.length === 0) {
    return true;
  }

  return activeDays.includes(getBusTravelDayLabel(travelDate));
};

const parseBusDateTime = (travelDate, timeValue) => {
  const date = tryNormalizeBusTravelDate(travelDate);
  const rawTime = toCleanString(timeValue);

  if (!date || !rawTime) {
    return null;
  }

  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const createIstDate = (hours, minutes) => {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthIndex) ||
      !Number.isInteger(day) ||
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes)
    ) {
      return null;
    }

    const utcMillis = Date.UTC(year, monthIndex, day, hours, minutes) - ((5 * 60) + 30) * 60 * 1000;
    const parsed = new Date(utcMillis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const time24Match = rawTime.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = Number(time24Match[1]);
    const minutes = Number(time24Match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return createIstDate(hours, minutes);
    }
  }

  const time12Match = rawTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (time12Match) {
    let hours = Number(time12Match[1]);
    const minutes = Number(time12Match[2]);
    const meridiem = time12Match[3].toUpperCase();

    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return createIstDate(hours, minutes);
    }
  }

  return null;
};

const normalizeBusCancellationRules = (rules = []) =>
  (Array.isArray(rules) ? rules : [])
    .map((rule, index) => ({
      id: toCleanString(rule?.id) || `rule-${index + 1}`,
      label: toCleanString(rule?.label) || `Rule ${index + 1}`,
      hoursBeforeDeparture: Math.max(0, Number(rule?.hoursBeforeDeparture || 0)),
      refundType: ['percentage', 'fixed', 'none'].includes(String(rule?.refundType || '').toLowerCase())
        ? String(rule.refundType).toLowerCase()
        : 'none',
      refundValue: Math.max(0, Number(rule?.refundValue || 0)),
      notes: toCleanString(rule?.notes),
    }))
    .sort((a, b) => b.hoursBeforeDeparture - a.hoursBeforeDeparture);

const computeBusCancellationQuote = ({ booking, busService, now = new Date(), travelDateOverride = '' }) => {
  const schedule = findBusSchedule(busService, booking?.scheduleId);
  const departureTime = schedule?.departureTime || booking?.routeSnapshot?.departureTime || '';
  const resolvedTravelDate = tryNormalizeBusTravelDate(
    travelDateOverride,
    booking?.travelDate,
  );
  const departureDateTime = parseBusDateTime(resolvedTravelDate, departureTime);
  const rules = normalizeBusCancellationRules(busService?.cancellationRules);
  const amount = Math.max(0, Number(booking?.amount || 0));

  if (!departureDateTime || Number.isNaN(departureDateTime.getTime())) {
    return {
      allowed: false,
      reason: 'Departure time is unavailable',
      departureDateTime: null,
      hoursBeforeDeparture: null,
      appliedRuleId: '',
      appliedRuleLabel: '',
      refundType: 'none',
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: amount,
      notes: '',
    };
  }

  const hoursBeforeDeparture = Math.round((((departureDateTime.getTime() - now.getTime()) / 3600000) + Number.EPSILON) * 100) / 100;
  if (hoursBeforeDeparture <= 0) {
    return {
      allowed: false,
      reason: 'Bus departure time has passed',
      departureDateTime,
      hoursBeforeDeparture,
      appliedRuleId: '',
      appliedRuleLabel: '',
      refundType: 'none',
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: amount,
      notes: '',
    };
  }

  const matchedRule = rules.find((rule) => hoursBeforeDeparture >= rule.hoursBeforeDeparture) || null;
  let refundAmount = 0;

  if (matchedRule) {
    if (matchedRule.refundType === 'percentage') {
      refundAmount = Math.round(amount * Math.min(100, matchedRule.refundValue) / 100 * 100) / 100;
    } else if (matchedRule.refundType === 'fixed') {
      refundAmount = Math.min(amount, Math.round(matchedRule.refundValue * 100) / 100);
    }
  }

  const chargeAmount = Math.max(0, Math.round((amount - refundAmount) * 100) / 100);

  return {
    allowed: true,
    reason: '',
    departureDateTime,
    hoursBeforeDeparture,
    appliedRuleId: matchedRule?.id || '',
    appliedRuleLabel: matchedRule?.label || '',
    refundType: matchedRule?.refundType || 'none',
    refundValue: matchedRule?.refundValue || 0,
    refundAmount,
    chargeAmount,
    notes: matchedRule?.notes || '',
  };
};

const buildBusPartialCancellationQuote = ({
  booking,
  busService,
  seatIds = [],
  now = new Date(),
  travelDateOverride = '',
}) => {
  const bookingSnapshot =
    booking && typeof booking.toObject === 'function'
      ? booking.toObject()
      : booking;
  const selectedSeatIds = [...new Set((Array.isArray(seatIds) ? seatIds : []).map((item) => toCleanString(item)).filter(Boolean))];
  const totalSeatIds = Array.isArray(bookingSnapshot?.seatIds)
    ? bookingSnapshot.seatIds.map((item) => toCleanString(item)).filter(Boolean)
    : [];
  const seatCount = totalSeatIds.length;
  const selectedCount = selectedSeatIds.length;

  if (seatCount === 0 || selectedCount === 0) {
    return {
      allowed: false,
      reason: 'No seats selected for cancellation',
      departureDateTime: null,
      hoursBeforeDeparture: null,
      appliedRuleId: '',
      appliedRuleLabel: '',
      refundType: 'none',
      refundValue: 0,
      refundAmount: 0,
      chargeAmount: 0,
      notes: '',
    };
  }

  const perSeatAmount = Math.round((Number(bookingSnapshot?.amount || 0) / seatCount) * 100) / 100;
  const partialAmount = Math.round(perSeatAmount * selectedCount * 100) / 100;

  return computeBusCancellationQuote({
    booking: {
      ...bookingSnapshot,
      amount: partialAmount,
    },
    busService,
    now,
    travelDateOverride,
  });
};

const ensureBusServiceEnabled = async () => {
  const transportSettings = await getTransportRideSettings();
  if (String(transportSettings.enable_bus_service || '0') !== '1') {
    throw new ApiError(403, 'Bus service is currently disabled');
  }
};

let lastBusSeatHoldCleanupAt = 0;
const BUS_HOLD_CLEANUP_COOLDOWN_MS = 30_000;
let busSeatHoldCleanupPromise = null;

const cleanupExpiredBusSeatHolds = async () => {
  const nowMs = Date.now();
  if (nowMs - lastBusSeatHoldCleanupAt < BUS_HOLD_CLEANUP_COOLDOWN_MS) {
    return;
  }

  if (busSeatHoldCleanupPromise) {
    return busSeatHoldCleanupPromise;
  }

  busSeatHoldCleanupPromise = (async () => {
    const now = new Date();

    const expiredBookings = await BusBooking.find({
      status: 'pending',
      expiresAt: { $lte: now },
    })
      .select('_id')
      .lean();

    if (expiredBookings.length > 0) {
      const bookingIds = expiredBookings.map((item) => item._id);
      await BusBooking.updateMany(
        { _id: { $in: bookingIds } },
        { $set: { status: 'expired' } },
      );
      await BusSeatHold.deleteMany({
        bookingId: { $in: bookingIds },
        status: 'held',
        expiresAt: { $lte: now },
      });
    }

    await BusSeatHold.deleteMany({
      status: 'held',
      expiresAt: { $lte: now },
    });

    lastBusSeatHoldCleanupAt = Date.now();
  })()
    .finally(() => {
      busSeatHoldCleanupPromise = null;
    });

  return busSeatHoldCleanupPromise;
};

const createBusBookingCode = () =>
  `BUS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const serializeBusSearchResult = ({ busService, schedule, availableSeats, travelDate }) => ({
  id: `${String(busService._id)}:${String(schedule.id)}:${travelDate}`,
  busServiceId: String(busService._id),
  scheduleId: String(schedule.id || ''),
  operator: busService.operatorName || '',
  operatorName: busService.operatorName || '',
  busName: busService.busName || '',
  type: busService.coachType || busService.busCategory || 'Bus',
  coachType: busService.coachType || '',
  busCategory: busService.busCategory || '',
  departure: schedule.departureTime || '',
  arrival: schedule.arrivalTime || '',
  duration: busService.route?.durationHours || '',
  routeName: busService.route?.routeName || '',
  fromCity: busService.route?.originCity || '',
  toCity: busService.route?.destinationCity || '',
  seats: Math.max(0, Number(availableSeats || 0)),
  availableSeats: Math.max(0, Number(availableSeats || 0)),
  price: Number(busService.seatPrice || 0),
  variantPricing: busService.variantPricing || null,
  serviceTaxPercentage: Math.max(0, Number(busService.serviceTaxPercentage || 0)),
  fareCurrency: busService.fareCurrency || 'INR',
  rating: Number(busService.rating || 0),
  ratingCount: Number(busService.ratingCount || 0),
  amenities: Array.isArray(busService.amenities) ? busService.amenities : [],
  boardingPolicy: busService.boardingPolicy || '',
  cancellationPolicy: busService.cancellationPolicy || '',
  cancellationRules: normalizeBusCancellationRules(busService.cancellationRules),
  registrationNumber: busService.registrationNumber || '',
  busColor: busService.busColor || '#1f2937',
  image: busService.image || busService.coverImage || '',
  coverImage: busService.coverImage || busService.image || '',
  galleryImages: Array.isArray(busService.galleryImages) ? busService.galleryImages.filter(Boolean) : [],
  luggagePolicy: busService.luggagePolicy || '',
  driverName: busService.driverName || '',
  driverPhone: busService.driverPhone || '',
  route: {
    routeName: busService.route?.routeName || '',
    originCity: busService.route?.originCity || '',
    destinationCity: busService.route?.destinationCity || '',
    stops: Array.isArray(busService.route?.stops) ? busService.route.stops : [],
  },
});

export const getIntercityPackageCatalog = async (_req, res) => {
  const items = await SetPrice.find({
    pricing_scope: 'package',
    active: 1,
    status: 'active',
    package_availability: 'available',
  })
    .populate('service_location_id', 'name service_location_name')
    .populate('package_type_id', 'name')
    .populate('package_vehicle_prices.vehicle_type', 'name capacity icon map_icon image icon_types dispatch_type')
    .sort({ package_destination: 1, createdAt: -1 })
    .lean();

  const results = items.map((item) => {
    const serviceLocation = item.service_location_id || {};
    const packageType = item.package_type_id || {};

    return {
      id: String(item._id),
      serviceLocationId: serviceLocation._id ? String(serviceLocation._id) : '',
      serviceLocationName: serviceLocation.name || serviceLocation.service_location_name || '',
      packageTypeId: packageType._id ? String(packageType._id) : '',
      packageTypeName: packageType.name || '',
      destination: String(item.package_destination || '').trim(),
      availability: String(item.package_availability || 'available').trim().toLowerCase(),
      vehicles: Array.isArray(item.package_vehicle_prices)
        ? item.package_vehicle_prices
            .filter((row) => row?.vehicle_type)
            .map((row, index) => ({
              id: `${String(item._id)}:${String(row.vehicle_type?._id || index)}`,
              vehicleTypeId: row.vehicle_type?._id ? String(row.vehicle_type._id) : '',
              vehicleName: row.vehicle_type?.name || 'Vehicle',
              capacity: Number(row.vehicle_type?.capacity || 0),
              icon: row.vehicle_type?.map_icon || row.vehicle_type?.icon || row.vehicle_type?.image || '',
              iconType: row.vehicle_type?.icon_types || row.vehicle_type?.name || '',
              dispatchType: String(row.vehicle_type?.dispatch_type || 'normal').trim().toLowerCase(),
              basePrice: Number(row.base_price ?? 0),
              freeDistance: Number(row.free_distance ?? 0),
              distancePrice: Number(row.distance_price ?? 0),
              freeTime: Number(row.free_time ?? 0),
              timePrice: Number(row.time_price ?? 0),
              adminCommisionType: Number(row.admin_commision_type ?? 1),
              adminCommision: Number(row.admin_commision ?? 0),
              adminCommissionTypeFromDriver: Number(row.admin_commission_type_from_driver ?? 1),
              adminCommissionFromDriver: Number(row.admin_commission_from_driver ?? 0),
              adminCommissionTypeForOwner: Number(row.admin_commission_type_for_owner ?? 1),
              adminCommissionForOwner: Number(row.admin_commission_for_owner ?? 0),
              serviceTax: Number(row.service_tax ?? 0),
              cancellationFee: Number(row.cancellation_fee ?? 0),
            }))
        : [],
    };
  });

  res.json({
    success: true,
    results,
  });
};

const serializeBusRouteSuggestion = (busService) => ({
  id: String(busService._id),
  fromCity: busService.route?.originCity || '',
  toCity: busService.route?.destinationCity || '',
  routeName: busService.route?.routeName || '',
  duration: busService.route?.durationHours || '',
  startingPrice: Number(busService.seatPrice || 0),
  variantPricing: busService.variantPricing || null,
  operator: busService.operatorName || '',
});

const getPrimaryBusStop = (busService, stopType = 'pickup') => {
  const stops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const normalizedType = String(stopType || 'pickup').trim().toLowerCase();

  return stops.find((stop) => {
    const currentType = String(stop?.stopType || 'pickup').trim().toLowerCase();
    if (normalizedType === 'pickup') {
      return currentType === 'pickup' || currentType === 'both';
    }
    return currentType === 'drop' || currentType === 'both';
  }) || null;
};

const formatBusStopLabel = (stop = null, fallback = '') => {
  if (!stop) {
    return fallback;
  }

  return [
    toCleanString(stop.pointName),
    toCleanString(stop.city),
  ].filter(Boolean).join(', ') || fallback;
};

const serializeBusBooking = (booking, busService = null) => {
  const quote = busService ? computeBusCancellationQuote({ booking, busService }) : null;
  const schedule = busService ? findBusSchedule(busService, booking?.scheduleId) : null;
  const arrivalTime = schedule?.arrivalTime || booking?.routeSnapshot?.arrivalTime || '';
  const arrivalDateTime = parseBusDateTime(booking?.travelDate, arrivalTime);
  const tripCompleted = Boolean(arrivalDateTime && arrivalDateTime.getTime() < Date.now());
  const persistedCancellation = booking.cancellation || {};
  const cancelledSeats = Array.isArray(booking.cancelledSeats) ? booking.cancelledSeats : [];
  const cancelledSeatIdSet = new Set(
    cancelledSeats.map((item) => toCleanString(item?.seatId)).filter(Boolean),
  );
  const originalSeatIds = Array.isArray(booking.seatIds) ? booking.seatIds : [];
  const originalSeatLabels = Array.isArray(booking.seatLabels) ? booking.seatLabels : [];
  const activeSeats = originalSeatIds
    .map((seatId, index) => ({
      seatId,
      seatLabel: originalSeatLabels[index] || seatId,
    }))
    .filter((item) => !cancelledSeatIdSet.has(toCleanString(item.seatId)));
  const totalRefundedAmount = cancelledSeats.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.refundAmount || 0)),
    0,
  );
  const totalChargedAmount = cancelledSeats.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.chargeAmount || 0)),
    0,
  );
  const totalSeatCount = originalSeatIds.length;
  const activeSeatCount = activeSeats.length;
  const perSeatAmount = totalSeatCount > 0
    ? Math.round((Number(booking.amount || 0) / totalSeatCount) * 100) / 100
    : 0;
  const reviewEntry = Array.isArray(busService?.reviews)
    ? busService.reviews.find((item) => String(item?.bookingId || '') === String(booking?._id || ''))
    : null;
  const primaryPickupStop = busService ? getPrimaryBusStop(busService, 'pickup') : null;
  const primaryDropStop = busService ? getPrimaryBusStop(busService, 'drop') : null;

  return {
  id: String(booking._id),
  bookingCode: booking.bookingCode || '',
  status: booking.status || 'pending',
  bookingSource: booking.bookingSource || 'user',
  reservedByDriverId: booking.reservedByDriverId ? String(booking.reservedByDriverId) : '',
  travelDate: booking.travelDate || '',
  scheduleId: booking.scheduleId || '',
  seatIds: Array.isArray(booking.seatIds) ? booking.seatIds : [],
  seatLabels: Array.isArray(booking.seatLabels) ? booking.seatLabels : [],
  amount: Number(booking.amount || 0),
  currency: booking.currency || 'INR',
  passenger: booking.passenger || {},
  notes: booking.notes || '',
  payment: {
    provider: booking.payment?.provider || 'razorpay',
    orderId: booking.payment?.orderId || '',
    paymentId: booking.payment?.paymentId || '',
    status: booking.payment?.status || 'pending',
    paidAt: booking.payment?.paidAt || null,
  },
  cancelledAt: booking.cancelledAt || null,
  cancellation: {
    allowed: quote ? quote.allowed && String(booking.status || '') === 'confirmed' : Boolean(persistedCancellation.allowed),
    reason: quote?.reason || '',
    appliedRuleId: persistedCancellation.appliedRuleId || quote?.appliedRuleId || '',
    appliedRuleLabel: persistedCancellation.appliedRuleLabel || quote?.appliedRuleLabel || '',
    refundType: persistedCancellation.refundType || quote?.refundType || 'none',
    refundValue: Number(persistedCancellation.refundValue ?? quote?.refundValue ?? 0),
    hoursBeforeDeparture: Number(
      persistedCancellation.hoursBeforeDeparture ?? quote?.hoursBeforeDeparture ?? 0,
    ),
    refundAmount: Number(persistedCancellation.refundAmount ?? quote?.refundAmount ?? 0),
    chargeAmount: Number(persistedCancellation.chargeAmount ?? quote?.chargeAmount ?? 0),
    notes: persistedCancellation.notes || quote?.notes || '',
    departureDateTime: quote?.departureDateTime || null,
  },
  cancellationPolicy: {
    text: busService?.cancellationPolicy || '',
    rules: normalizeBusCancellationRules(busService?.cancellationRules),
  },
  review: {
    canRate: tripCompleted,
    tripCompleted,
    completedAt: arrivalDateTime || null,
    averageRating: Number(busService?.rating || 0),
    ratingCount: Number(busService?.ratingCount || 0),
    userRating: reviewEntry ? Number(reviewEntry.rating || 0) : 0,
    userComment: reviewEntry?.comment || '',
    reviewedAt: reviewEntry?.reviewedAt || null,
  },
  seatSummary: {
    total: totalSeatCount,
    active: activeSeatCount,
    cancelled: cancelledSeats.length,
  },
  activeSeatIds: activeSeats.map((item) => item.seatId),
  activeSeatLabels: activeSeats.map((item) => item.seatLabel),
  cancelledSeats: cancelledSeats.map((item) => ({
    seatId: item.seatId || '',
    seatLabel: item.seatLabel || item.seatId || '',
    cancelledAt: item.cancelledAt || null,
    refundAmount: Number(item.refundAmount || 0),
    chargeAmount: Number(item.chargeAmount || 0),
    refundStatus: item.refundStatus || '',
    refundId: item.refundId || '',
    refundProcessedAt: item.refundProcessedAt || null,
    notes: item.notes || '',
  })),
  totalRefundedAmount: Math.round(totalRefundedAmount * 100) / 100,
  totalChargedAmount: Math.round(totalChargedAmount * 100) / 100,
  perSeatAmount,
  hasPartialCancellation: cancelledSeats.length > 0 && activeSeatCount > 0,
  bus: {
    operator: booking.routeSnapshot?.operatorName || '',
    busName: booking.routeSnapshot?.busName || '',
    type: booking.routeSnapshot?.coachType || booking.routeSnapshot?.busCategory || 'Bus',
    departure: booking.routeSnapshot?.departureTime || '',
    arrival: booking.routeSnapshot?.arrivalTime || '',
    duration: booking.routeSnapshot?.durationHours || '',
    fromCity: booking.routeSnapshot?.originCity || '',
    toCity: booking.routeSnapshot?.destinationCity || '',
    registrationNumber: booking.routeSnapshot?.registrationNumber || busService?.registrationNumber || '',
    driverName: booking.routeSnapshot?.driverName || busService?.driverName || '',
    driverPhone: booking.routeSnapshot?.driverPhone || busService?.driverPhone || '',
    pickupLocation: formatBusStopLabel(primaryPickupStop, booking.routeSnapshot?.originCity || ''),
    dropLocation: formatBusStopLabel(primaryDropStop, booking.routeSnapshot?.destinationCity || ''),
    routeStops: Array.isArray(busService?.route?.stops) ? busService.route.stops : [],
  },
  createdAt: booking.createdAt || null,
  };
};

const serializeRentalQuoteRequest = (item = {}) => ({
  id: String(item._id || item.id || ''),
  vehicleTypeId: item.vehicleTypeId ? String(item.vehicleTypeId) : '',
  vehicleName: item.vehicleName || '',
  contactName: item.contactName || '',
  contactPhone: item.contactPhone || '',
  contactEmail: item.contactEmail || '',
  requestedHours: Number(item.requestedHours || 0),
  pickupDateTime: item.pickupDateTime || null,
  returnDateTime: item.returnDateTime || null,
  seatsNeeded: Number(item.seatsNeeded || 1),
  luggageNeeded: Number(item.luggageNeeded || 0),
  pickupLocation: item.pickupLocation || '',
  dropLocation: item.dropLocation || '',
  specialRequirements: item.specialRequirements || '',
  status: item.status || 'pending',
  adminQuotedAmount: Number(item.adminQuotedAmount || 0),
  adminNote: item.adminNote || '',
  createdAt: item.createdAt || null,
});

const serializeRentalBookingRequest = (item = {}) => ({
  id: String(item._id || item.id || ''),
  bookingReference: item.bookingReference || '',
  userId: item.userId ? String(item.userId) : '',
  vehicleTypeId: item.vehicleTypeId ? String(item.vehicleTypeId) : '',
  vehicleName: item.vehicleName || '',
  vehicleCategory: item.vehicleCategory || '',
  vehicleImage: item.vehicleImage || '',
  selectedPackage: {
    packageId: item.selectedPackage?.packageId || '',
    label: item.selectedPackage?.label || '',
    durationHours: Number(item.selectedPackage?.durationHours || 0),
    price: Number(item.selectedPackage?.price || 0),
    extraHourPrice: Number(item.selectedPackage?.extraHourPrice || 0),
  },
  serviceLocation: {
    locationId: item.serviceLocation?.locationId || '',
    name: item.serviceLocation?.name || '',
    address: item.serviceLocation?.address || '',
    city: item.serviceLocation?.city || '',
    latitude: item.serviceLocation?.latitude ?? null,
    longitude: item.serviceLocation?.longitude ?? null,
    distanceKm: item.serviceLocation?.distanceKm ?? null,
  },
  pickupDateTime: item.pickupDateTime || null,
  returnDateTime: item.returnDateTime || null,
  requestedHours: Number(item.requestedHours || 0),
  totalCost: Number(item.totalCost || 0),
  payableNow: Number(item.payableNow || 0),
  advancePaymentLabel: item.advancePaymentLabel || '',
  paymentStatus: item.paymentStatus || 'pending',
  paymentMethod: item.paymentMethod || '',
  paymentMethodLabel: item.paymentMethodLabel || '',
  payment: {
    provider: item.payment?.provider || '',
    status: item.payment?.status || '',
    amount: Number(item.payment?.amount || 0),
    currency: item.payment?.currency || 'INR',
    orderId: item.payment?.orderId || '',
    paymentId: item.payment?.paymentId || '',
    signature: item.payment?.signature || '',
  },
  contactName: item.contactName || '',
  contactPhone: item.contactPhone || '',
  contactEmail: item.contactEmail || '',
  kycCompleted: Boolean(item.kycCompleted),
  kycDocuments: {
    drivingLicense: {
      imageUrl: item.kycDocuments?.drivingLicense?.imageUrl || '',
      fileName: item.kycDocuments?.drivingLicense?.fileName || '',
      uploadedAt: item.kycDocuments?.drivingLicense?.uploadedAt || null,
    },
    aadhaarCard: {
      imageUrl: item.kycDocuments?.aadhaarCard?.imageUrl || '',
      fileName: item.kycDocuments?.aadhaarCard?.fileName || '',
      uploadedAt: item.kycDocuments?.aadhaarCard?.uploadedAt || null,
    },
  },
  assignedVehicle: {
    vehicleId: item.assignedVehicle?.vehicleId ? String(item.assignedVehicle.vehicleId) : '',
    name: item.assignedVehicle?.name || '',
    vehicleCategory: item.assignedVehicle?.vehicleCategory || '',
    image: item.assignedVehicle?.image || '',
  },
  commissionSnapshot: {
    serviceStoreId: item.commissionSnapshot?.serviceStoreId
      ? String(item.commissionSnapshot.serviceStoreId)
      : '',
    serviceStoreName: item.commissionSnapshot?.serviceStoreName || '',
    ownerName: item.commissionSnapshot?.ownerName || '',
    serviceStoreCommissionType:
      item.commissionSnapshot?.serviceStoreCommissionType === 'fixed' ? 'fixed' : 'percentage',
    serviceStoreCommissionValue: Number(item.commissionSnapshot?.serviceStoreCommissionValue || 0),
    ownerCommissionType:
      item.commissionSnapshot?.ownerCommissionType === 'fixed' ? 'fixed' : 'percentage',
    ownerCommissionValue: Number(item.commissionSnapshot?.ownerCommissionValue || 0),
    serviceTaxPercentage: Math.max(0, Number(item.commissionSnapshot?.serviceTaxPercentage || 0)),
  },
  status: item.status || 'pending',
  adminNote: item.adminNote || '',
  assignedAt: item.assignedAt || null,
  completionRequestedAt: item.completionRequestedAt || null,
  completedAt: item.completedAt || null,
  finalCharge: Number(item.finalCharge || 0),
  finalElapsedMinutes: Number(item.finalElapsedMinutes || 0),
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
  rentalTracking: buildRentalTrackingSnapshot(item),
});

const computeRentalCommissionBreakdown = (snapshot = {}, grossAmount = 0) => {
  const baseAmount = Math.max(0, Number(grossAmount || 0));
  const serviceStoreType =
    snapshot?.serviceStoreCommissionType === 'fixed' ? 'fixed' : 'percentage';
  const ownerType = snapshot?.ownerCommissionType === 'fixed' ? 'fixed' : 'percentage';
  const serviceStoreValue = Math.max(0, Number(snapshot?.serviceStoreCommissionValue || 0));
  const ownerValue = Math.max(0, Number(snapshot?.ownerCommissionValue || 0));
  const calculateAmount = (amount, type, value) =>
    type === 'fixed'
      ? Math.min(amount, value)
      : Math.min(amount, Math.max(0, (amount * value) / 100));
  const serviceStoreAmountRaw = calculateAmount(baseAmount, serviceStoreType, serviceStoreValue);
  const ownerAmountRaw = calculateAmount(
    Math.max(0, baseAmount - serviceStoreAmountRaw),
    ownerType,
    ownerValue,
  );
  const adminAmountRaw = Math.max(0, baseAmount - serviceStoreAmountRaw - ownerAmountRaw);
  const serviceTaxPercentage = Math.max(0, Number(snapshot?.serviceTaxPercentage || 0));
  const serviceTaxAmountRaw = (baseAmount * serviceTaxPercentage) / 100;
  const round = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  return {
    grossAmount: round(baseAmount),
    grossAmountWithTax: round(baseAmount + serviceTaxAmountRaw),
    serviceTax: {
      percentage: round(serviceTaxPercentage),
      amount: round(serviceTaxAmountRaw),
    },
    serviceStore: {
      id: snapshot?.serviceStoreId ? String(snapshot.serviceStoreId) : '',
      name: snapshot?.serviceStoreName || '',
      type: serviceStoreType,
      value: round(serviceStoreValue),
      amount: round(serviceStoreAmountRaw),
    },
    owner: {
      name: snapshot?.ownerName || '',
      type: ownerType,
      value: round(ownerValue),
      amount: round(ownerAmountRaw),
    },
    admin: {
      amount: round(adminAmountRaw),
    },
  };
};

const resolveRentalSelectedPackagePricing = (item = {}) => {
  const selectedPackage = item.selectedPackage || {};
  const normalizedPackageId = String(selectedPackage.packageId || '').trim();
  const vehiclePricing = Array.isArray(item.vehicleTypeId?.pricing) ? item.vehicleTypeId.pricing : [];
  const matchedPackage = vehiclePricing.find((entry) => String(entry?.id || entry?.packageId || '').trim() === normalizedPackageId);

  const includedHours = Math.max(
    Number(selectedPackage.durationHours || 0),
    Number(matchedPackage?.durationHours || 0),
    1,
  );
  const basePrice = Math.max(
    Number(selectedPackage.price || 0),
    Number(matchedPackage?.price || 0),
    0,
  );
  const extraHourPrice = Math.max(
    Number(selectedPackage.extraHourPrice || 0),
    Number(matchedPackage?.extraHourPrice || 0),
    0,
  );

  return {
    includedHours,
    basePrice,
    extraHourPrice,
  };
};

const computeRentalRideMetrics = (item = {}, endedAt = null) => {
  const startDate = item.assignedAt || item.pickupDateTime || item.createdAt;
  const startMs = startDate ? new Date(startDate).getTime() : NaN;
  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();
  const { includedHours, basePrice, extraHourPrice } = resolveRentalSelectedPackagePricing(item);
  const hourlyRate = includedHours > 0 ? basePrice / includedHours : 0;

  if (!Number.isFinite(startMs)) {
    return {
      hourlyRate: Math.max(0, hourlyRate),
      includedHours,
      basePrice,
      extraHourRate: extraHourPrice,
      elapsedMinutes: 0,
      elapsedHours: 0,
      currentCharge: Math.max(basePrice, Number(item.payableNow || 0)),
      remainingDue: Math.max(0, Math.max(basePrice, Number(item.payableNow || 0)) - Number(item.payableNow || 0)),
    };
  }

  const elapsedMs = Math.max(0, endMs - startMs);
  const elapsedMinutes = Math.max(0, Math.ceil(elapsedMs / 60000));
  const elapsedHours = elapsedMs / 3600000;
  const elapsedChargeWithinPackage = elapsedHours <= includedHours
    ? basePrice
    : basePrice + Math.ceil(Math.max(0, elapsedHours - includedHours)) * extraHourPrice;
  const uncappedCharge = Math.max(Number(item.payableNow || 0), elapsedChargeWithinPackage);
  const currentCharge = Math.round((uncappedCharge + Number.EPSILON) * 100) / 100;
  const remainingDue = Math.max(0, Math.round((currentCharge - Number(item.payableNow || 0) + Number.EPSILON) * 100) / 100);

  return {
    hourlyRate: Math.max(0, Math.round((hourlyRate + Number.EPSILON) * 100) / 100),
    includedHours,
    basePrice: Math.round((basePrice + Number.EPSILON) * 100) / 100,
    extraHourRate: Math.round((extraHourPrice + Number.EPSILON) * 100) / 100,
    elapsedMinutes,
    elapsedHours: Math.round((elapsedHours + Number.EPSILON) * 100) / 100,
    currentCharge,
    remainingDue,
  };
};

const resolveAuthenticatedUserObjectId = (req) => {
  const userId = String(req.auth?.sub || '').trim();
  return mongoose.Types.ObjectId.isValid(userId) ? userId : '';
};

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildPagination = ({ page = 1, limit = 10, total = 0 }) => {
  const safeLimit = Math.max(1, Number(limit) || 10);
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  return {
    page: safePage,
    limit: safeLimit,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
  };
};

const toUserPayload = (user, options = {}) => ({
  id: user._id,
  name: user.name || '',
  phone: user.phone || '',
  email: user.email || '',
  gender: user.gender || '',
  profileImage: user.profileImage || '',
  governmentIdProof: user.governmentIdProof || {
    type: '',
    imageUrl: '',
    backImageUrl: '',
    fileName: '',
    backFileName: '',
    uploadedAt: null,
    backUploadedAt: null,
  },
  referralCode: user.referralCode || '',
  referralCount: Number(user.referralCount || 0),
  deletionRequestStatus: user.deletionRequest?.status || 'none',
  referralCode: user.referralCode || '',
  referralCount: Number(user.referralCount || 0),
  currentRideId: user.currentRideId || null,
  subscriptionSummary: options.subscriptionSummary || {
    activeCount: 0,
    hasUnlimitedPlan: false,
    availableRideCredits: 0,
    activePlans: [],
  },
});

const ensureUserCanLogin = (user) => {
  if (user.deletedAt || user.isActive === false || user.active === false) {
    throw new ApiError(403, 'User account is not active');
  }
};

const canRestoreUserForSignup = (user) => Boolean(user?.deletedAt);

const VALID_GOVERNMENT_ID_TYPES = new Set(['aadhaar', 'voter_id', 'passport', 'driving_license', 'other']);

const normalizeGovernmentIdProof = (input = {}, { required = false } = {}) => {
  const type = toCleanString(input.type).toLowerCase();
  const imageUrl = toCleanString(input.imageUrl || input.url || input.secureUrl);
  const backImageUrl = toCleanString(input.backImageUrl || input.backUrl || input.backSecureUrl);
  const fileName = toCleanString(input.fileName || input.name || 'government-id');
  const backFileName = toCleanString(input.backFileName || input.backName || 'government-id-back');

  if (!imageUrl && !backImageUrl && !required) {
    return {
      type: '',
      imageUrl: '',
      backImageUrl: '',
      fileName: '',
      backFileName: '',
      uploadedAt: null,
      backUploadedAt: null,
    };
  }

  if (!VALID_GOVERNMENT_ID_TYPES.has(type)) {
    throw new ApiError(400, 'A valid government ID type is required');
  }

  if (required && !imageUrl) {
    throw new ApiError(400, 'Government ID front image is required');
  }

  if (required && !backImageUrl) {
    throw new ApiError(400, 'Government ID back image is required');
  }

  return {
    type,
    imageUrl,
    backImageUrl,
    fileName: fileName || `${type}-proof`,
    backFileName: backFileName || `${type}-proof-back`,
    uploadedAt: input.uploadedAt ? new Date(input.uploadedAt) : new Date(),
    backUploadedAt: backImageUrl
      ? input.backUploadedAt
        ? new Date(input.backUploadedAt)
        : new Date()
      : null,
  };
};

const buildRentalBookingResponse = (item = {}, endedAt = null) => {
  const rideMetrics = computeRentalRideMetrics(item, endedAt);

  return {
    ...serializeRentalBookingRequest(item),
    rideMetrics,
    commissionBreakdown: {
      estimated: computeRentalCommissionBreakdown(item.commissionSnapshot, Number(item.totalCost || 0)),
      live: computeRentalCommissionBreakdown(
        item.commissionSnapshot,
        Number(item.finalCharge || rideMetrics.currentCharge || item.totalCost || 0),
      ),
    },
  };
};

const buildReactivatedUserPayload = async ({
  req,
  name,
  phone,
  email,
  countryCode,
  gender,
  profileImage,
  governmentIdProof,
  referrer,
  employee,
}) => ({
  name,
  phone,
  countryCode,
  email,
  gender,
  profileImage,
  governmentIdProof,
  password: await hashPassword(String(req.body.password || '').trim() || crypto.randomBytes(24).toString('hex')),
  isVerified: true,
  referredBy: referrer?._id || null,
  acquiredByEmployeeId: employee?._id || null,
  acquiredByEmployeeCode: employee?.employeeCode || '',
  deletedAt: null,
  deletion_reason: '',
  active: true,
  isActive: true,
  deletionRequest: {
    status: 'none',
    reason: '',
    requestedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    adminNote: '',
  },
});

const createUserSession = (user) => ({
  token: signAccessToken({ sub: String(user._id), role: 'user' }),
  user: toUserPayload(user),
});

const generateUserReferralCode = (user) => {
  const idPart = String(user?._id || '').slice(-6).toUpperCase();
  const phonePart = String(user?.phone || '').slice(-4);
  return `USR${phonePart}${idPart}`.replace(/\W/g, '');
};

const getUserReferralProgramSettings = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const userReferral = setting?.referral?.user || {};

  return {
    enabled: Boolean(userReferral.enabled),
    type: String(userReferral.type || 'instant_referrer').trim().toLowerCase(),
    amount: Math.max(0, Number(userReferral.amount || 0) || 0),
    rideCount: Math.max(0, Number(userReferral.ride_count || 0) || 0),
  };
};

const findUserByReferralCode = async (referralCode) => {
  const normalizedCode = normalizeReferralCode(referralCode);

  if (!normalizedCode) {
    return null;
  }

  return User.findOne({ referralCode: normalizedCode });
};

const creditUserWalletByReference = async ({ userId, amount, title, referenceKey }) => {
  const normalizedAmount = Math.max(0, Number(amount || 0) || 0);
  const normalizedReferenceKey = toCleanString(referenceKey);

  if (!userId || normalizedAmount <= 0 || !normalizedReferenceKey) {
    return 'skipped';
  }

  await ensureUserWallet(userId);

  const existingTransaction = await UserWallet.findOne({
    userId,
    'transactions.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .lean();

  if (existingTransaction) {
    return 'existing';
  }

  await UserWallet.updateOne(
    { userId },
    {
      $inc: { balance: normalizedAmount },
      $push: {
        transactions: {
          $each: [
            {
              kind: 'credit',
              amount: normalizedAmount,
              title: toCleanString(title) || 'Referral Reward',
              referenceKey: normalizedReferenceKey,
            },
          ],
          $slice: -50,
        },
      },
    },
  );

  return 'credited';
};

const processSignupReferralRewards = async ({ user, referrer }) => {
  if (!user?._id || !referrer?._id) {
    return;
  }

  const settings = await getUserReferralProgramSettings();
  if (!settings.enabled || settings.amount <= 0) {
    return;
  }

  const referralType = settings.type;
  const rewardBaseKey = `user-referral:signup:${String(user._id)}`;

  if (referralType === 'instant_referrer' || referralType === 'instant_referrer_new') {
    await creditUserWalletByReference({
      userId: referrer._id,
      amount: settings.amount,
      title: `Referral reward for inviting ${user.phone}`,
      referenceKey: `${rewardBaseKey}:referrer`,
    });
  }

  if (referralType === 'instant_referrer_new') {
    await creditUserWalletByReference({
      userId: user._id,
      amount: settings.amount,
      title: 'Welcome referral reward',
      referenceKey: `${rewardBaseKey}:new-user`,
    });
    user.referralRewardGrantedAt = user.referralRewardGrantedAt || new Date();
    await user.save();
  }
};

export const registerUser = async (req, res) => {
  const name = toCleanString(req.body.name);
  const phone = normalizePhone(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const countryCode = toCleanString(req.body.countryCode) || '+91';
  const gender = normalizeGender(req.body.gender);
  const profileImage = toCleanString(req.body.profileImage);
  const governmentIdProof = normalizeGovernmentIdProof(req.body.governmentIdProof || {}, { required: false });
  const referralCode = normalizeReferralCode(req.body.referralCode);
  const employeeCode = normalizeEmployeeCode(req.body.employeeCode);

  validateName(name);
  validatePhone(phone);
  validateEmail(email);

  const existingUser = await User.findOne({ phone });

  const referrer = referralCode ? await findUserByReferralCode(referralCode) : null;
  const employee = employeeCode ? await findActiveEmployeeByCode(employeeCode) : null;

  if (referralCode && !referrer) {
    throw new ApiError(400, 'Invalid referral code');
  }

  if (employeeCode && !employee) {
    throw new ApiError(400, 'Invalid employee code');
  }

  if (existingUser && !canRestoreUserForSignup(existingUser)) {
    throw new ApiError(409, 'Phone number is already registered');
  }

  const userPayload = await buildReactivatedUserPayload({
    req,
    name,
    phone,
    email,
    countryCode,
    gender,
    profileImage,
    governmentIdProof,
    referrer,
    employee,
  });

  const user = existingUser
    ? await User.findByIdAndUpdate(existingUser._id, { $set: userPayload }, { new: true, runValidators: true })
    : await User.create(userPayload);

  if (!String(user.referralCode || '').trim()) {
    user.referralCode = generateUserReferralCode(user);
    await user.save();
  }

  if (referrer?._id) {
    await User.updateOne({ _id: referrer._id }, { $inc: { referralCount: 1 } });
    await processSignupReferralRewards({ user, referrer });
  }

  res.status(201).json({
    success: true,
    data: createUserSession(user),
  });
};

const serializeUserNotification = (item = {}) => ({
  id: String(item._id || ''),
  title: String(item.push_title || '').trim(),
  body: String(item.message || '').trim(),
  image: item.image || '',
  sentAt: item.sent_at || item.createdAt || null,
  serviceLocationId: item.service_location_id || null,
});

export const getUserNotifications = async (req, res) => {
  const user = await User.findById(req.auth.sub).lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Users don't typically have a service_location_id in their profile like drivers do in this schema,
  // but if they did, we would use it. For now, we fetch all user-targeted notifications.
  const query = {
    status: 'sent',
    send_to: { $in: ['all', 'users'] },
  };

  const notifications = await Notification.find(query)
    .sort({ sent_at: -1, createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    success: true,
    data: {
      results: notifications.map(serializeUserNotification),
    },
  });
};

export const deleteUserNotification = async (req, res) => {
  // In a real multi-tenant app, you'd mark it as read/deleted for THIS user in a pivot table.
  // However, the current driver implementation seems to imply a simpler model or global clear for the demo.
  // For consistency with the user's request for "single clear", we'll just return success 
  // as the frontend is already filtering its local state.
  // If we wanted to persist this per user, we'd need a UserNotification model.
  res.json({
    success: true,
    message: 'Notification removed',
  });
};

export const clearAllUserNotifications = async (req, res) => {
  res.json({
    success: true,
    message: 'All notifications cleared',
  });
};

export const signupUser = async (req, res) => {
  const name = toCleanString(req.body.name);
  const phone = normalizePhone(req.body.phone);
  const email = normalizeEmail(req.body.email);
  const countryCode = toCleanString(req.body.countryCode) || '+91';
  const gender = normalizeGender(req.body.gender);
  const profileImage = toCleanString(req.body.profileImage);
  const governmentIdProof = normalizeGovernmentIdProof(req.body.governmentIdProof || {}, { required: false });
  const referralCode = normalizeReferralCode(req.body.referralCode);
  const employeeCode = normalizeEmployeeCode(req.body.employeeCode);

  validateName(name);
  validatePhone(phone);
  validateEmail(email);

  const signupSession = await requireVerifiedUserSignupSession(phone);

  const existingUser = await User.findOne({ phone });

  const referrer = referralCode ? await findUserByReferralCode(referralCode) : null;
  const employee = employeeCode ? await findActiveEmployeeByCode(employeeCode) : null;

  if (referralCode && !referrer) {
    throw new ApiError(400, 'Invalid referral code');
  }

  if (employeeCode && !employee) {
    throw new ApiError(400, 'Invalid employee code');
  }

  if (existingUser && !canRestoreUserForSignup(existingUser)) {
    throw new ApiError(409, 'Phone number is already registered');
  }

  const userPayload = await buildReactivatedUserPayload({
    req,
    name,
    phone,
    email,
    countryCode,
    gender,
    profileImage,
    governmentIdProof,
    referrer,
    employee,
  });

  const user = existingUser
    ? await User.findByIdAndUpdate(existingUser._id, { $set: userPayload }, { new: true, runValidators: true })
    : await User.create(userPayload);

  if (!String(user.referralCode || '').trim()) {
    user.referralCode = generateUserReferralCode(user);
    await user.save();
  }

  if (referrer?._id) {
    await User.updateOne({ _id: referrer._id }, { $inc: { referralCount: 1 } });
    await processSignupReferralRewards({ user, referrer });
  }

  await consumeUserSignupSession(signupSession);

  res.status(201).json({
    success: true,
    data: createUserSession(user),
  });
};

export const startUserOtpRequest = async (req, res) => {
  const result = await startUserOtp(req.body);
  res.status(201).json({ success: true, data: result });
};

export const verifyUserOtpRequest = async (req, res) => {
  const result = await verifyUserOtp(req.body);
  res.json({ success: true, data: result });
};

export const loginUser = async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');

  validatePhone(phone);

  if (!password) {
    throw new ApiError(400, 'password is required');
  }

  const user = await User.findOne({ phone }).select('+password');

  if (!user || !user.password || !(await comparePassword(password, user.password))) {
    throw new ApiError(401, 'Invalid phone or password');
  }

  ensureUserCanLogin(user);

  res.json({
    success: true,
    data: createUserSession(user),
  });
};

export const verifyUserPhoneForOtpLogin = async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  validatePhone(phone);

  const user = await User.findOne({ phone }).lean();

  if (!user || user.deletedAt) {
    res.json({
      success: true,
      data: {
        exists: false,
        user: null,
      },
    });
    return;
  }

  ensureUserCanLogin(user);

  res.json({
    success: true,
    data: {
      exists: true,
      ...createUserSession(user),
    },
  });
};

export const saveUserFcmToken = async (req, res) => {
  const user = await User.findById(req.auth?.sub);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  ensureUserCanLogin(user);

  const saved = assignPushTokenToEntity(user, {
    token: req.body?.token,
    platform: req.body?.platform,
  });

  await user.save();

  res.json({
    success: true,
    data: {
      message: 'FCM token saved successfully',
      platform: saved.platform,
      field: saved.fieldName,
    },
  });
};

export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.auth?.sub);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (!String(user.referralCode || '').trim()) {
    user.referralCode = generateUserReferralCode(user);
    await user.save();
  }

  const subscriptionSummary = await getUserSubscriptionSummary(user._id);

  res.json({
    success: true,
    data: {
      user: {
        ...toUserPayload(user, { subscriptionSummary }),
        createdAt: user.createdAt || null,
      },
    },
  });
};

export const uploadUserProfileImage = async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');

  if (!dataUrl) {
    throw new ApiError(400, 'dataUrl is required');
  }

  if (dataUrl.length > 12_000_000) {
    throw new ApiError(413, 'Image is too large');
  }

  const uploadResult = await uploadDataUrlToCloudinary({
    dataUrl,
    folder: `${env.cloudinary.folder}/user-profile`,
    publicIdPrefix: 'user-profile',
  });

  res.status(201).json({
    success: true,
    data: {
      secureUrl: uploadResult.secureUrl,
      publicId: uploadResult.publicId,
    },
  });
};

export const updateCurrentUser = async (req, res) => {
  const userId = req.auth?.sub;

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    const name = toCleanString(req.body.name);
    validateName(name);
    user.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
    const email = normalizeEmail(req.body.email);
    validateEmail(email);
    user.email = email;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profileImage')) {
    user.profileImage = toCleanString(req.body.profileImage);
  }

  await user.save();

  res.json({
    success: true,
    data: {
      user: toUserPayload(user),
    },
  });
};

export const getAvailableSubscriptionPlans = async (_req, res) => {
  const plans = await listCustomerSubscriptionPlans();

  res.json({
    success: true,
    data: {
      results: plans,
    },
  });
};

export const getMySubscriptions = async (req, res) => {
  const summary = await getUserSubscriptionSummary(req.auth?.sub);

  res.json({
    success: true,
    data: summary,
  });
};

export const buySubscription = async (req, res) => {
  const result = await purchaseUserSubscription({
    userId: req.auth?.sub,
    planId: req.body?.planId,
    paymentSource: 'wallet',
  });

  res.status(201).json({
    success: true,
    data: result,
    message: 'Subscription purchased successfully',
  });
};

export const requestAccountDeletion = async (req, res) => {
  const userId = req.auth?.sub;
  const reason = toCleanString(req.body?.reason);

  if (!reason) {
    throw new ApiError(400, 'Deletion reason is required');
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.deletedAt || user.isActive === false || user.active === false) {
    throw new ApiError(400, 'Account is already inactive');
  }

  if (user.deletionRequest?.status === 'pending') {
    res.json({
      success: true,
      data: {
        deletionRequestStatus: 'pending',
        requestedAt: user.deletionRequest.requestedAt || null,
      },
      message: 'Deletion request is already pending admin review',
    });
    return;
  }

  user.deletionRequest = {
    status: 'pending',
    reason: reason.slice(0, 300),
    requestedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    adminNote: '',
  };

  await user.save();

  res.status(201).json({
    success: true,
    data: {
      deletionRequestStatus: user.deletionRequest.status,
      requestedAt: user.deletionRequest.requestedAt,
    },
  });
};

export const getUserWallet = async (req, res) => {
  const userId = req.auth?.sub;
  const user = await User.findById(userId).select('_id').lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await ensureUserWallet(userId);
  const wallet = await UserWallet.findOne({ userId }).select('balance refundWallet transactions').slice('transactions', -10).lean();
  const transactions = Array.isArray(wallet?.transactions) ? wallet.transactions : [];

  res.json({
    success: true,
    data: buildUserWalletPayload({ ...wallet, transactions }),
  });
};

export const topupUserWallet = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const userId = req.auth?.sub;
  const user = await User.findById(userId).select('_id').lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const tx = {
    kind: 'credit',
    amount,
    title: 'Wallet Refilled',
    provider: 'manual',
  };

  await ensureUserWallet(userId);

  await UserWallet.updateOne(
    { userId },
    {
      $inc: { balance: amount },
      $push: { transactions: { $each: [tx], $slice: -50 } },
    },
  );

  const updatedWallet = await UserWallet.findOne({ userId }).select('balance transactions').slice('transactions', -10).lean();
  const updatedWalletWithRefund = updatedWallet
    ? { ...updatedWallet, refundWallet: Number(updatedWallet.refundWallet || 0) }
    : updatedWallet;
  const transactions = Array.isArray(updatedWallet?.transactions) ? updatedWallet.transactions : [];

  res.status(201).json({
    success: true,
    data: buildUserWalletPayload({ ...updatedWalletWithRefund, transactions }),
  });
};

export const transferUserWallet = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const recipientPhone = normalizePhone(req.body?.phone);
  validatePhone(recipientPhone);

  const senderId = req.auth?.sub;

  const sender = await User.findById(senderId).select({ phone: 1 }).lean();
  if (!sender) {
    throw new ApiError(404, 'User not found');
  }

  if (sender.phone === recipientPhone) {
    throw new ApiError(400, 'Cannot transfer to same phone number');
  }

  const recipient = await User.findOne({ phone: recipientPhone }).select({ _id: 1 }).lean();
  if (!recipient) {
    throw new ApiError(404, 'Recipient not found');
  }

  await ensureUserWallet(senderId);
  await ensureUserWallet(recipient._id);

  const transferId = crypto.randomUUID();

  const debitTx = {
    kind: 'debit',
    amount,
    title: 'Wallet Transfer',
    counterpartyPhone: recipientPhone,
    provider: 'internal',
    providerPaymentId: transferId,
  };

  const creditTx = {
    kind: 'credit',
    amount,
    title: 'Wallet Received',
    counterpartyPhone: sender.phone || '',
    provider: 'internal',
    providerPaymentId: transferId,
  };

  const senderUpdate = await UserWallet.updateOne(
    { userId: senderId, balance: { $gte: amount } },
    { $inc: { balance: -amount }, $push: { transactions: { $each: [debitTx], $slice: -50 } } },
  );

  if (!senderUpdate?.modifiedCount) {
    throw new ApiError(400, 'Insufficient wallet balance');
  }

  const recipientUpdate = await UserWallet.updateOne(
    { userId: recipient._id },
    { $inc: { balance: amount }, $push: { transactions: { $each: [creditTx], $slice: -50 } } },
  );

  if (!recipientUpdate?.modifiedCount) {
    await UserWallet.updateOne(
      { userId: senderId },
      { $inc: { balance: amount }, $pull: { transactions: { providerPaymentId: transferId } } },
    );
    throw new ApiError(500, 'Transfer failed');
  }

  const wallet = await UserWallet.findOne({ userId: senderId }).select('balance refundWallet transactions').slice('transactions', -10).lean();

  const transactions = Array.isArray(wallet?.transactions) ? wallet.transactions : [];

  res.status(201).json({
    success: true,
    data: buildUserWalletPayload({ ...wallet, transactions }),
  });
};

export const transferUserWalletToDriver = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const driverPhone = normalizePhone(req.body?.phone);
  validatePhone(driverPhone);

  const senderId = req.auth?.sub;
  const sender = await User.findById(senderId).select({ phone: 1, firstName: 1, lastName: 1, name: 1 }).lean();

  if (!sender) {
    throw new ApiError(404, 'User not found');
  }

  if (sender.phone === driverPhone) {
    throw new ApiError(400, 'Cannot transfer to same phone number');
  }

  const recipientDriver = await Driver.findOne({ phone: driverPhone })
    .select({ _id: 1, phone: 1, firstName: 1, lastName: 1, name: 1 })
    .lean();

  if (!recipientDriver) {
    throw new ApiError(404, 'Driver not found');
  }

  await ensureUserWallet(senderId);
  const transferId = crypto.randomUUID();
  const senderDisplayName = String(
    sender.name || [sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Rider',
  ).trim();
  const driverDisplayName = String(
    recipientDriver.name || [recipientDriver.firstName, recipientDriver.lastName].filter(Boolean).join(' ') || 'Driver',
  ).trim();

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const senderWallet = await UserWallet.findOne({ userId: senderId }).session(session);
    if (!senderWallet) {
      throw new ApiError(404, 'User wallet not found');
    }

    if (Number(senderWallet.balance || 0) < amount) {
      throw new ApiError(400, 'Insufficient wallet balance');
    }

    senderWallet.balance = Math.round((Number(senderWallet.balance || 0) - amount) * 100) / 100;
    senderWallet.transactions.push({
      kind: 'debit',
      amount,
      title: `Sent to driver ${driverDisplayName}`,
      counterpartyPhone: driverPhone,
      provider: 'internal_driver_wallet_transfer',
      providerPaymentId: transferId,
    });
    senderWallet.transactions = senderWallet.transactions.slice(-50);
    await senderWallet.save({ session });

    const walletUpdate = await applyDriverWalletAdjustment({
      driverId: recipientDriver._id,
      amount,
      type: 'adjustment',
      description: `Received from rider wallet (${senderDisplayName})`,
      metadata: {
        source: 'user_wallet_transfer',
        transferId,
        senderUserId: senderId,
        senderPhone: sender.phone || '',
        senderName: senderDisplayName,
      },
      session,
    });

    await session.commitTransaction();

    emitToDriver(recipientDriver._id, 'driver:wallet:updated', {
      wallet: walletUpdate.wallet,
      transaction: walletUpdate.transaction,
      notification: {
        title: 'Wallet credited',
        body: `Rs ${amount.toFixed(2)} received from rider wallet`,
      },
    });

    sendPushNotificationToEntities({
      driverIds: [recipientDriver._id],
      title: 'Wallet credited',
      body: `Rs ${amount.toFixed(2)} received from rider wallet`,
      data: {
        type: 'driver_wallet_credit',
        amount: String(amount),
        transferId,
      },
    }).catch(() => {});

    const refreshedWallet = await UserWallet.findOne({ userId: senderId })
      .select('balance refundWallet transactions')
      .slice('transactions', -10)
      .lean();

    res.status(201).json({
      success: true,
      data: {
        ...buildUserWalletPayload(refreshedWallet),
        transfer: {
          id: transferId,
          amount,
          driverPhone,
          driverName: driverDisplayName,
        },
      },
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const createRazorpayWalletTopupOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const { keyId, keySecret } = await resolveRazorpayCredentials();

  const amountPaise = Math.round(amount * 100);
  const userId = String(req.auth?.sub || '');
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `uwal_${compactUserId}_${Date.now().toString(36)}`;
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
  const backendOrigin = `${proto}://${host}`;
  const callbackUrl = `${backendOrigin}/api/v1/users/wallet/razorpay/callback`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: { userId },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      callbackUrl,
    },
  });
};

const verifyAndApplyUserRazorpayWalletTopup = async ({
  orderId,
  paymentId,
  signature,
  userId: requestedUserId = '',
} = {}) => {
  const normalizedOrderId = String(orderId || '').trim();
  const normalizedPaymentId = String(paymentId || '').trim();
  const normalizedSignature = String(signature || '').trim();

  if (!normalizedOrderId || !normalizedPaymentId || !normalizedSignature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${normalizedOrderId}|${normalizedPaymentId}`)
    .digest('hex');

  if (expectedSignature !== normalizedSignature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await razorpayRequest({
    method: 'GET',
    path: `/orders/${encodeURIComponent(normalizedOrderId)}`,
    keyId,
    keySecret,
  });

  const amountPaise = Number(order?.amount);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  const orderUserId = String(order?.notes?.userId || '').trim();
  const effectiveUserId = String(requestedUserId || orderUserId).trim();

  if (!effectiveUserId) {
    throw new ApiError(400, 'User reference is missing from this Razorpay order');
  }

  if (requestedUserId && orderUserId && requestedUserId !== orderUserId) {
    throw new ApiError(403, 'This Razorpay order does not belong to the authenticated user');
  }

  const amount = Math.round(amountPaise) / 100;

  await ensureUserWallet(effectiveUserId);

  const alreadyCredited = await UserWallet.findOne({
    userId: effectiveUserId,
    'transactions.providerPaymentId': normalizedPaymentId,
  })
    .select('_id')
    .lean();

  if (!alreadyCredited) {
    const tx = {
      kind: 'credit',
      amount,
      title: 'Wallet Refilled',
      provider: 'razorpay',
      providerOrderId: normalizedOrderId,
      providerPaymentId: normalizedPaymentId,
    };

    await UserWallet.updateOne(
      { userId: effectiveUserId },
      {
        $inc: { balance: amount },
        $push: { transactions: { $each: [tx], $slice: -50 } },
      },
    );
  }

  const wallet = await UserWallet.findOne({ userId: effectiveUserId })
    .select('balance refundWallet transactions')
    .slice('transactions', -10)
    .lean();

  if (!wallet) {
    throw new ApiError(404, 'User not found');
  }

  return buildUserWalletPayload(wallet);
};

export const createRentalAdvancePaymentOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const vehicleId = String(req.body?.vehicleId || '').trim();
  const vehicleName = String(req.body?.vehicleName || 'Rental booking').trim();
  const pickup = String(req.body?.pickup || '').trim();
  const returnTime = String(req.body?.returnTime || '').trim();
  const { keyId, keySecret } = await resolveRazorpayCredentials();

  const amountPaise = Math.round(amount * 100);
  const userId = String(req.auth?.sub || '');
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'guest';
  const receipt = `rentadv_${compactUserId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        userId,
        vehicleId,
        vehicleName,
        pickup,
        returnTime,
        purpose: 'rental_advance_payment',
      },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      bookingReference: `RNT-${Date.now().toString(36).slice(-6).toUpperCase()}`,
    },
  });
};

export const createPhonePeRentalAdvancePaymentOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const vehicleId = String(req.body?.vehicleId || '').trim();
  const vehicleName = String(req.body?.vehicleName || 'Rental booking').trim();
  const pickup = String(req.body?.pickup || '').trim();
  const returnTime = String(req.body?.returnTime || '').trim();
  const bookingReference =
    toCleanString(req.body?.bookingReference) || `RNT-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const userId = String(req.auth?.sub || '');
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const merchantTransactionId = `URNT${Date.now()}${compactUserId}`.slice(0, 34);
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const redirectUrl = `${frontendBaseUrl}/phonepe/status?flow=user-rental&phonepe_txn=${encodeURIComponent(merchantTransactionId)}`;
  const user = userId ? await User.findById(userId).select('phone').lean() : null;
  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-rental',
    stage: 'create-order-start',
    merchantTransactionId,
    bookingReference,
    amountRupees: amount,
    request: buildPaymentRequestContext(req),
    metadata: {
      vehicleId,
      vehicleName,
      pickup,
      returnTime,
      redirectUrl: summarizeCheckoutUrl(redirectUrl),
    },
  });
  const payload = await phonePeRequest({
    method: 'POST',
    path: '/checkout/v2/pay',
    body: {
      merchantOrderId: merchantTransactionId,
      amount: Math.round(amount * 100),
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl,
        },
        message: 'Rental advance payment',
      },
      metaInfo: {
        udf1: vehicleId || 'rental',
        udf2: vehicleName.slice(0, 120) || 'Rental booking',
        udf3: bookingReference,
      },
      prefillUserLoginDetails: normalizePhone(user?.phone || '')
        ? { phoneNumber: normalizePhone(user?.phone || '') }
        : undefined,
    },
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const checkoutUrl = payload?.redirectUrl || '';
  if (!checkoutUrl) {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-rental',
      stage: 'create-order-missing-checkout-url',
      level: 'error',
      merchantTransactionId,
      bookingReference,
      response: summarizePhonePePayload(payload || {}),
    });
    throw new ApiError(502, 'PhonePe payment URL was not returned');
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-rental',
    stage: 'create-order-success',
    merchantTransactionId,
    bookingReference,
    amountPaise: Math.round(amount * 100),
    checkoutUrl: summarizeCheckoutUrl(checkoutUrl),
    response: summarizePhonePePayload(payload || {}),
  });

  res.status(201).json({
    success: true,
    data: {
      gateway: 'phonepe',
      merchantTransactionId,
      bookingReference,
      amount: Math.round(amount * 100),
      currency: 'INR',
      checkoutUrl,
      metadata: {
        vehicleId,
        vehicleName,
        pickup,
        returnTime,
      },
    },
  });
};

export const createPhonePeWalletTopupOrder = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const userId = String(req.auth?.sub || '');
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const merchantTransactionId = `UWAL${Date.now()}${compactUserId}`.slice(0, 34);
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const redirectUrl = `${frontendBaseUrl}/phonepe/status?flow=user-wallet&phonepe_txn=${encodeURIComponent(merchantTransactionId)}`;
  const user = userId ? await User.findById(userId).select('phone').lean() : null;
  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-wallet',
    stage: 'create-order-start',
    merchantTransactionId,
    amountRupees: amount,
    request: buildPaymentRequestContext(req),
    metadata: {
      redirectUrl: summarizeCheckoutUrl(redirectUrl),
    },
  });
  const payload = await phonePeRequest({
    method: 'POST',
    path: '/checkout/v2/pay',
    body: {
      merchantOrderId: merchantTransactionId,
      amount: Math.round(amount * 100),
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl,
        },
        message: 'Wallet top-up',
      },
      prefillUserLoginDetails: normalizePhone(user?.phone || '')
        ? { phoneNumber: normalizePhone(user?.phone || '') }
        : undefined,
    },
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const checkoutUrl = payload?.redirectUrl || '';
  if (!checkoutUrl) {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-wallet',
      stage: 'create-order-missing-checkout-url',
      level: 'error',
      merchantTransactionId,
      response: summarizePhonePePayload(payload || {}),
    });
    throw new ApiError(502, 'PhonePe payment URL was not returned');
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-wallet',
    stage: 'create-order-success',
    merchantTransactionId,
    amountPaise: Math.round(amount * 100),
    checkoutUrl: summarizeCheckoutUrl(checkoutUrl),
    response: summarizePhonePePayload(payload || {}),
  });

  res.status(201).json({
    success: true,
    data: {
      gateway: 'phonepe',
      merchantTransactionId,
      amount: Math.round(amount * 100),
      currency: 'INR',
      checkoutUrl,
      method: payload?.data?.instrumentResponse?.redirectInfo?.method || 'GET',
    },
  });
};

export const payRentalAdvanceWithWallet = async (req, res) => {
  const amount = normalizeMoneyAmount(req.body?.amount);
  const bookingReference =
    toCleanString(req.body?.bookingReference) || `RNT-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const userId = req.auth?.sub;

  await ensureUserWallet(userId);

  const wallet = await UserWallet.findOne({ userId });
  if (!wallet) {
    throw new ApiError(404, 'User wallet not found');
  }

  const referenceKey = `rental_advance_${bookingReference}`;
  const existingTransaction = Array.isArray(wallet.transactions)
    ? wallet.transactions.find(
        (item) => item?.kind === 'debit' && String(item.referenceKey || '') === referenceKey,
      )
    : null;

  if (!existingTransaction) {
    if (Number(wallet.balance || 0) < amount) {
      throw new ApiError(400, 'Insufficient wallet balance');
    }

    wallet.balance = Math.round((Number(wallet.balance || 0) - amount) * 100) / 100;
    wallet.transactions.push({
      kind: 'debit',
      amount,
      title: 'Rental Advance Payment',
      provider: 'wallet',
      providerPaymentId: bookingReference,
      referenceKey,
    });

    if (wallet.transactions.length > 50) {
      wallet.transactions = wallet.transactions.slice(-50);
    }

    await wallet.save();
  }

  res.status(201).json({
    success: true,
    data: {
      provider: 'wallet',
      status: 'paid',
      amount,
      currency: 'INR',
      orderId: '',
      paymentId: bookingReference,
      signature: '',
      referenceKey,
      bookingReference,
      balance: Number(wallet.balance || 0),
    },
    message: 'Rental advance payment collected from wallet successfully',
  });
};

export const verifyRazorpayWalletTopup = async (req, res) => {
  const wallet = await verifyAndApplyUserRazorpayWalletTopup({
    orderId: req.body?.razorpay_order_id,
    paymentId: req.body?.razorpay_payment_id,
    signature: req.body?.razorpay_signature,
    userId: req.auth?.sub,
  });

  res.status(201).json({
    success: true,
    data: wallet,
  });
};

export const handleUserRazorpayWalletTopupCallback = async (req, res) => {
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const redirectUrl = new URL(`${frontendBaseUrl}/razorpay/status`);
  redirectUrl.searchParams.set('flow', 'user-wallet');

  try {
    const errorCode = String(
      req.body?.error?.code || req.body?.error?.reason || req.query?.error_code || '',
    ).trim();
    const errorDescription = String(
      req.body?.error?.description || req.query?.error_description || '',
    ).trim();

    if (errorCode || errorDescription) {
      redirectUrl.searchParams.set('status', 'failure');
      if (errorCode) {
        redirectUrl.searchParams.set('error_code', errorCode);
      }
      if (errorDescription) {
        redirectUrl.searchParams.set('error_description', errorDescription);
      }
      res.redirect(302, redirectUrl.toString());
      return;
    }

    await verifyAndApplyUserRazorpayWalletTopup({
      orderId: req.body?.razorpay_order_id || req.query?.razorpay_order_id,
      paymentId: req.body?.razorpay_payment_id || req.query?.razorpay_payment_id,
      signature: req.body?.razorpay_signature || req.query?.razorpay_signature,
    });

    redirectUrl.searchParams.set('status', 'success');
  } catch (error) {
    redirectUrl.searchParams.set('status', 'failure');
    redirectUrl.searchParams.set(
      'error_description',
      String(error?.message || 'Payment verification failed.'),
    );
  }

  res.redirect(302, redirectUrl.toString());
};

export const verifyPhonePeWalletTopup = async (req, res) => {
  const merchantTransactionId = toCleanString(
    req.params?.merchantTransactionId || req.query?.merchantTransactionId || req.query?.transactionId,
  );

  if (!merchantTransactionId) {
    throw new ApiError(400, 'merchantTransactionId is required');
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-wallet',
    stage: 'verify-start',
    merchantTransactionId,
    request: buildPaymentRequestContext(req),
  });

  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const payload = await phonePeRequest({
    method: 'GET',
    path: `/checkout/v2/order/${encodeURIComponent(merchantTransactionId)}/status?details=false`,
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const paymentDetails = Array.isArray(payload?.paymentDetails) ? payload.paymentDetails : [];
  const latestPayment = paymentDetails[0] || {};
  const paymentState = String(payload?.state || latestPayment?.state || '').trim().toUpperCase();
  const paymentId = toCleanString(latestPayment?.transactionId || latestPayment?.paymentTransactionId || merchantTransactionId);
  const amount = Math.round(Number(payload?.amount || latestPayment?.amount || 0)) / 100;
  const userId = req.auth?.sub;

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-wallet',
    stage: 'verify-response',
    merchantTransactionId,
    userId,
    paymentState,
    paymentId,
    amountRupees: amount,
    response: summarizePhonePePayload(payload || {}),
  });

  if (paymentState === 'COMPLETED') {
    await ensureUserWallet(userId);

    const alreadyCredited = await UserWallet.findOne({
      userId,
      $or: [
        { 'transactions.providerPaymentId': paymentId },
        { 'transactions.providerOrderId': merchantTransactionId },
      ],
    })
      .select('_id')
      .lean();

    if (!alreadyCredited) {
      const tx = {
        kind: 'credit',
        amount,
        title: 'Wallet Refilled',
        provider: 'phonepe',
        providerOrderId: merchantTransactionId,
        providerPaymentId: paymentId,
      };

      await UserWallet.updateOne(
        { userId },
        {
          $inc: { balance: amount },
          $push: { transactions: { $each: [tx], $slice: -50 } },
        },
      );
    }

    const wallet = await UserWallet.findOne({ userId })
      .select('balance refundWallet transactions')
      .slice('transactions', -10)
      .lean();

    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-wallet',
      stage: 'verify-paid',
      merchantTransactionId,
      userId,
      paymentId,
      amountRupees: amount,
      alreadyCredited: Boolean(alreadyCredited),
      walletBalance: Number(wallet?.balance || 0),
    });

    res.json({
      success: true,
      data: {
        status: 'paid',
        gateway: 'phonepe',
        merchantTransactionId,
        transactionId: paymentId,
        wallet: buildUserWalletPayload(wallet),
      },
    });
    return;
  }

  if (paymentState === 'PENDING') {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-wallet',
      stage: 'verify-pending',
      merchantTransactionId,
      userId,
      paymentId,
      amountRupees: amount,
    });
    res.json({
      success: true,
      data: {
        status: 'pending',
        gateway: 'phonepe',
        merchantTransactionId,
        transactionId: paymentId,
      },
      message: payload?.message || 'PhonePe payment is still pending',
    });
    return;
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-wallet',
    stage: 'verify-failed',
    level: 'warn',
    merchantTransactionId,
    userId,
    paymentId,
    paymentState,
    amountRupees: amount,
    code: payload?.code || latestPayment?.responseCode || '',
    providerMessage:
      payload?.message ||
      latestPayment?.responseCodeDescription ||
      latestPayment?.detailedErrorCode ||
      '',
    response: summarizePhonePePayload(payload || {}),
  });
  const providerCode = payload?.code || latestPayment?.responseCode || '';
  const providerMessage =
    payload?.message ||
    latestPayment?.responseCodeDescription ||
    latestPayment?.detailedErrorCode ||
    'PhonePe payment was not completed';
  res.json({
    success: true,
    data: {
      status: 'failed',
      gateway: 'phonepe',
      merchantTransactionId,
      transactionId: paymentId,
      code: providerCode,
      state: paymentState,
      providerMessage,
    },
    message: providerMessage,
  });
};

export const verifyRentalAdvancePayment = async (req, res) => {
  const orderId = String(req.body?.razorpay_order_id || '').trim();
  const paymentId = String(req.body?.razorpay_payment_id || '').trim();
  const signature = String(req.body?.razorpay_signature || '').trim();

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await razorpayRequest({
    method: 'GET',
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId,
    keySecret,
  });

  const amountPaise = Number(order?.amount);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  res.status(201).json({
    success: true,
    data: {
      provider: 'razorpay',
      status: 'paid',
      amount: Math.round(amountPaise) / 100,
      currency: order.currency || 'INR',
      orderId,
      paymentId,
      signature,
      notes: order?.notes || {},
    },
    message: 'Rental advance payment verified successfully',
  });
};

export const verifyPhonePeRentalAdvancePayment = async (req, res) => {
  const merchantTransactionId = toCleanString(
    req.params?.merchantTransactionId || req.query?.merchantTransactionId || req.query?.transactionId,
  );

  if (!merchantTransactionId) {
    throw new ApiError(400, 'merchantTransactionId is required');
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-rental',
    stage: 'verify-start',
    merchantTransactionId,
    request: buildPaymentRequestContext(req),
  });

  const { clientId, clientSecret, clientVersion, environment } = await resolvePhonePeCredentials();
  const payload = await phonePeRequest({
    method: 'GET',
    path: `/checkout/v2/order/${encodeURIComponent(merchantTransactionId)}/status?details=false`,
    clientId,
    clientSecret,
    clientVersion,
    environment,
  });

  const paymentDetails = Array.isArray(payload?.paymentDetails) ? payload.paymentDetails : [];
  const latestPayment = paymentDetails[0] || {};
  const paymentState = String(payload?.state || latestPayment?.state || '').trim().toUpperCase();
  const paymentId = toCleanString(latestPayment?.transactionId || latestPayment?.paymentTransactionId || merchantTransactionId);
  const amount = Math.round(Number(payload?.amount || latestPayment?.amount || 0)) / 100;
  const bookingReference = toCleanString(payload?.metaInfo?.udf3 || latestPayment?.metaInfo?.udf3);

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-rental',
    stage: 'verify-response',
    merchantTransactionId,
    bookingReference,
    paymentState,
    paymentId,
    amountRupees: amount,
    response: summarizePhonePePayload(payload || {}),
  });

  if (paymentState === 'COMPLETED') {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-rental',
      stage: 'verify-paid',
      merchantTransactionId,
      bookingReference,
      paymentId,
      amountRupees: amount,
    });
    res.json({
      success: true,
      data: {
        provider: 'phonepe',
        gateway: 'phonepe',
        status: 'paid',
        amount,
        currency: payload?.currency || 'INR',
        merchantTransactionId,
        transactionId: paymentId,
        bookingReference,
      },
      message: 'Rental advance payment verified successfully',
    });
    return;
  }

  if (paymentState === 'PENDING') {
    logPaymentDiagnostic({
      provider: 'phonepe',
      scope: 'user-rental',
      stage: 'verify-pending',
      merchantTransactionId,
      bookingReference,
      paymentId,
      amountRupees: amount,
    });
    res.json({
      success: true,
      data: {
        provider: 'phonepe',
        gateway: 'phonepe',
        status: 'pending',
        merchantTransactionId,
        transactionId: paymentId,
        bookingReference,
      },
      message: payload?.message || 'PhonePe payment is still pending',
    });
    return;
  }

  logPaymentDiagnostic({
    provider: 'phonepe',
    scope: 'user-rental',
    stage: 'verify-failed',
    level: 'warn',
    merchantTransactionId,
    bookingReference,
    paymentId,
    paymentState,
    amountRupees: amount,
    code: payload?.code || latestPayment?.responseCode || '',
    providerMessage:
      payload?.message ||
      latestPayment?.responseCodeDescription ||
      latestPayment?.detailedErrorCode ||
      '',
    response: summarizePhonePePayload(payload || {}),
  });
  const rentalProviderCode = payload?.code || latestPayment?.responseCode || '';
  const rentalProviderMessage =
    payload?.message ||
    latestPayment?.responseCodeDescription ||
    latestPayment?.detailedErrorCode ||
    'PhonePe payment was not completed';
  res.json({
    success: true,
    data: {
      provider: 'phonepe',
      gateway: 'phonepe',
      status: 'failed',
      merchantTransactionId,
      transactionId: paymentId,
      bookingReference,
      code: rentalProviderCode,
      state: paymentState,
      providerMessage: rentalProviderMessage,
    },
    message: rentalProviderMessage,
  });
};

export const searchBuses = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const fromCity = toCleanString(req.query?.fromCity);
  const toCity = toCleanString(req.query?.toCity);
  const travelDate = normalizeBusTravelDate(req.query?.date || req.query?.travelDate);

  if (!fromCity || !toCity) {
    throw new ApiError(400, 'fromCity and toCity are required');
  }

  const items = await BusService.find({
    status: 'active',
    'route.originCity': buildBusCityRegex(fromCity),
    'route.destinationCity': buildBusCityRegex(toCity),
  }).lean();

  if (items.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        travelDate,
        results: [],
      },
    });
  }

  const busIds = items.map((item) => item._id);
  const holds = await BusSeatHold.find({
    busServiceId: { $in: busIds },
    travelDate,
    status: { $in: ['held', 'booked'] },
  })
    .select('busServiceId scheduleId seatId')
    .lean();

  const reservedCountMap = new Map();
  holds.forEach((hold) => {
    const key = `${String(hold.busServiceId)}:${String(hold.scheduleId)}`;
    reservedCountMap.set(key, (reservedCountMap.get(key) || 0) + 1);
  });

  const results = items.flatMap((busService) => {
    const schedules = Array.isArray(busService.schedules) ? busService.schedules : [];
    const totalSeats = flattenBusBlueprintSeats(busService.blueprint).filter(
      (seat) => String(seat.status || 'available') !== 'blocked',
    ).length;

    return schedules
      .filter((schedule) => isScheduleAvailableOnDate(schedule, travelDate))
      .map((schedule) => {
        const reservedSeats = reservedCountMap.get(`${String(busService._id)}:${String(schedule.id)}`) || 0;
        return serializeBusSearchResult({
          busService,
          schedule,
          travelDate,
          availableSeats: totalSeats - reservedSeats,
        });
      });
  });

  res.status(200).json({
    success: true,
    data: {
      travelDate,
      results,
    },
  });
};

export const getBusRouteSuggestions = async (_req, res) => {
  await ensureBusServiceEnabled();

  const items = await BusService.find({ status: 'active' })
    .select('route operatorName seatPrice createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const seenRoutes = new Set();
  const results = [];

  items.forEach((busService) => {
    const fromCity = toCleanString(busService.route?.originCity);
    const toCity = toCleanString(busService.route?.destinationCity);

    if (!fromCity || !toCity) {
      return;
    }

    const key = `${normalizeBusCity(fromCity)}::${normalizeBusCity(toCity)}`;
    if (seenRoutes.has(key)) {
      return;
    }

    seenRoutes.add(key);
    results.push(serializeBusRouteSuggestion(busService));
  });

  res.status(200).json({
    success: true,
    data: {
      results,
    },
  });
};

export const getBusSeatLayout = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const busServiceId = String(req.params?.id || '');
  const scheduleId = toCleanString(req.query?.scheduleId);
  const travelDate = normalizeBusTravelDate(req.query?.date || req.query?.travelDate);

  if (!scheduleId) {
    throw new ApiError(400, 'scheduleId is required');
  }

  const busService = await BusService.findById(busServiceId).lean();
  if (!busService || String(busService.status || '') !== 'active') {
    throw new ApiError(404, 'Bus service not found');
  }

  const schedule = findBusSchedule(busService, scheduleId);
  if (!isScheduleAvailableOnDate(schedule, travelDate)) {
    throw new ApiError(404, 'Bus schedule not found for the selected date');
  }

  const holds = await BusSeatHold.find({
    busServiceId,
    scheduleId,
    travelDate,
    status: { $in: ['held', 'booked'] },
  })
    .select('seatId')
    .lean();

  const reservedSeatIds = new Set(holds.map((item) => String(item.seatId)));
  const normalizeDeck = (deckRows = []) =>
    deckRows.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => {
        if (!cell || cell.kind !== 'seat') {
          return cell;
        }

        const seatId = String(cell.id || '');
        const isBlocked = String(cell.status || 'available') === 'blocked';
        const isReserved = reservedSeatIds.has(seatId);

        return {
          ...cell,
          status: isBlocked || isReserved ? 'booked' : 'available',
        };
      }),
    );

  const blueprint = {
    templateKey: busService.blueprint?.templateKey || 'seater_2_2',
    lowerDeck: normalizeDeck(busService.blueprint?.lowerDeck || []),
    upperDeck: normalizeDeck(busService.blueprint?.upperDeck || []),
  };

  const availableSeats = flattenBusBlueprintSeats(blueprint).filter(
    (seat) => String(seat.status || 'available') === 'available',
  ).length;

  res.status(200).json({
    success: true,
    data: {
      busServiceId: String(busService._id),
      scheduleId,
      travelDate,
      availableSeats,
      bus: serializeBusSearchResult({
        busService,
        schedule,
        travelDate,
        availableSeats,
      }),
      blueprint,
    },
  });
};

export const createBusBookingOrder = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const userId = req.auth?.sub;
  const busServiceId = String(req.body?.busServiceId || '');
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeBusTravelDate(req.body?.travelDate || req.body?.date);
  const passenger = {
    name: toCleanString(req.body?.passenger?.name),
    age: Number(req.body?.passenger?.age || 0),
    gender: toCleanString(req.body?.passenger?.gender),
    phone: normalizePhone(req.body?.passenger?.phone),
    email: normalizeEmail(req.body?.passenger?.email),
  };
  const seatIds = Array.isArray(req.body?.seatIds)
    ? [...new Set(req.body.seatIds.map((item) => toCleanString(item)).filter(Boolean))]
    : [];

  if (!busServiceId || !scheduleId || seatIds.length === 0) {
    throw new ApiError(400, 'busServiceId, scheduleId and seatIds are required');
  }

  validateName(passenger.name);
  validatePhone(passenger.phone);
  validateEmail(passenger.email);

  if (!Number.isFinite(passenger.age) || passenger.age < 1 || passenger.age > 120) {
    throw new ApiError(400, 'Passenger age must be valid');
  }

  const busService = await BusService.findById(busServiceId).lean();
  if (!busService || String(busService.status || '') !== 'active') {
    throw new ApiError(404, 'Bus service not found');
  }

  const schedule = findBusSchedule(busService, scheduleId);
  if (!isScheduleAvailableOnDate(schedule, travelDate)) {
    throw new ApiError(404, 'Bus schedule not found for the selected date');
  }

  const availableSeatCells = flattenBusBlueprintSeats(busService.blueprint).filter(
    (seat) => String(seat.status || 'available') !== 'blocked',
  );
  const seatCellMap = new Map(availableSeatCells.map((seat) => [String(seat.id), seat]));
  const invalidSeat = seatIds.find((seatId) => !seatCellMap.has(seatId));
  if (invalidSeat) {
    throw new ApiError(400, `Seat ${invalidSeat} is not available for booking`);
  }

  const baseAmount = Math.round(
    seatIds.reduce((sum, seatId) => sum + resolveBusSeatPrice(busService, seatCellMap.get(seatId)), 0) * 100,
  ) / 100;
  if (baseAmount <= 0) {
    throw new ApiError(400, 'Bus fare is not configured');
  }

  const serviceTaxPercentage = Math.max(0, Number(busService.serviceTaxPercentage || 0));
  const serviceTaxAmount = Math.round(((baseAmount * serviceTaxPercentage) / 100) * 100) / 100;
  const amount = Math.round((baseAmount + serviceTaxAmount) * 100) / 100;

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const amountPaise = Math.round(amount * 100);
  const compactUserId = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `ubus_${compactUserId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: amountPaise,
      currency: busService.fareCurrency || 'INR',
      receipt,
      notes: {
        userId: String(userId || ''),
        busServiceId,
        scheduleId,
        travelDate,
        seats: seatIds.join(','),
      },
    },
    keyId,
    keySecret,
  });

  const expiresAt = new Date(Date.now() + BUS_HOLD_MINUTES * 60 * 1000);
  const booking = await BusBooking.create({
    userId,
    busServiceId,
    bookingCode: createBusBookingCode(),
    scheduleId,
    travelDate,
    seatIds,
    seatLabels: seatIds.map((seatId) => seatCellMap.get(seatId)?.label || seatId),
    passenger,
    amount,
    currency: busService.fareCurrency || 'INR',
    status: 'pending',
    expiresAt,
    routeSnapshot: {
      originCity: busService.route?.originCity || '',
      destinationCity: busService.route?.destinationCity || '',
      departureTime: schedule.departureTime || '',
      arrivalTime: schedule.arrivalTime || '',
      durationHours: busService.route?.durationHours || '',
      busName: busService.busName || '',
      operatorName: busService.operatorName || '',
      coachType: busService.coachType || '',
      busCategory: busService.busCategory || '',
      registrationNumber: busService.registrationNumber || '',
      driverName: busService.driverName || '',
      driverPhone: busService.driverPhone || '',
      serviceTaxPercentage,
      baseAmount,
      serviceTaxAmount,
      totalAmount: amount,
    },
    payment: {
      provider: 'razorpay',
      orderId: order.id,
      status: 'created',
    },
  });

  try {
    await BusSeatHold.insertMany(
      seatIds.map((seatId) => ({
        busServiceId,
        bookingId: booking._id,
        userId,
        scheduleId,
        travelDate,
        seatId,
        holdToken: booking.bookingCode,
        status: 'held',
        expiresAt,
      })),
      { ordered: true },
    );
  } catch (error) {
    await BusBooking.deleteOne({ _id: booking._id });
    if (error?.code === 11000) {
      throw new ApiError(409, 'One or more selected seats were just booked by someone else');
    }
    throw error;
  }

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || busService.fareCurrency || 'INR',
      expiresAt,
      booking: serializeBusBooking(booking, busService),
    },
  });
};

export const verifyBusBookingPayment = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const { keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const booking = await BusBooking.findOne({
    userId: req.auth?.sub,
    'payment.orderId': orderId,
  });

  if (!booking) {
    throw new ApiError(404, 'Bus booking not found');
  }

  const busService = booking.busServiceId
    ? await BusService.findById(booking.busServiceId)
        .select('registrationNumber driverName driverPhone cancellationPolicy cancellationRules schedules route rating ratingCount reviews')
        .lean()
    : null;

  if (String(booking.status) === 'confirmed') {
    return res.status(200).json({
      success: true,
      data: serializeBusBooking(booking, busService),
    });
  }

  if (String(booking.status) !== 'pending') {
    throw new ApiError(409, 'Bus booking is no longer payable');
  }

  if (booking.expiresAt && booking.expiresAt <= new Date()) {
    booking.status = 'expired';
    booking.payment.status = 'expired';
    await booking.save();
    await BusSeatHold.deleteMany({ bookingId: booking._id, status: 'held' });
    throw new ApiError(409, 'Seat hold expired before payment verification');
  }

  const holds = await BusSeatHold.find({
    bookingId: booking._id,
    status: 'held',
    expiresAt: { $gt: new Date() },
  }).lean();

  if (holds.length !== booking.seatIds.length) {
    booking.status = 'failed';
    booking.payment.status = 'seat_conflict';
    await booking.save();
    await BusSeatHold.deleteMany({ bookingId: booking._id, status: 'held' });
    throw new ApiError(409, 'Some selected seats are no longer reserved for this payment');
  }

  booking.status = 'confirmed';
  booking.payment.paymentId = paymentId;
  booking.payment.signature = signature;
  booking.payment.status = 'paid';
  booking.payment.paidAt = new Date();
  await booking.save();

  await BusSeatHold.updateMany(
    { bookingId: booking._id, status: 'held' },
    {
      $set: {
        status: 'booked',
        expiresAt: null,
      },
    },
  );

  res.status(201).json({
    success: true,
    data: serializeBusBooking(booking, busService),
  });
};

export const getMyBusBookingById = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const bookingId = String(req.params?.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, 'Valid bus booking id is required');
  }

  const booking = await BusBooking.findOne({
    _id: bookingId,
    userId: req.auth?.sub,
  }).lean();

  if (!booking) {
    throw new ApiError(404, 'Bus booking not found');
  }

  const busService = booking.busServiceId
    ? await BusService.findById(booking.busServiceId)
        .select('registrationNumber driverName driverPhone cancellationPolicy cancellationRules schedules route rating ratingCount reviews')
        .lean()
    : null;

  res.status(200).json({
    success: true,
    data: serializeBusBooking(booking, busService),
  });
};

export const submitMyBusBookingReview = async (req, res) => {
  await ensureBusServiceEnabled();

  const bookingId = String(req.params?.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, 'Valid bus booking id is required');
  }

  const rating = Number(req.body?.rating || 0);
  const comment = toCleanString(req.body?.comment);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be an integer between 1 and 5');
  }

  const booking = await BusBooking.findOne({
    _id: bookingId,
    userId: req.auth?.sub,
  }).lean();

  if (!booking) {
    throw new ApiError(404, 'Bus booking not found');
  }

  const busService = booking.busServiceId
    ? await BusService.findById(booking.busServiceId)
    : null;

  if (!busService) {
    throw new ApiError(404, 'Bus service not found');
  }

  const schedule = findBusSchedule(busService, booking.scheduleId);
  const arrivalTime = schedule?.arrivalTime || booking?.routeSnapshot?.arrivalTime || '';
  const arrivalDateTime = parseBusDateTime(booking.travelDate, arrivalTime);

  if (!arrivalDateTime || Number.isNaN(arrivalDateTime.getTime())) {
    throw new ApiError(409, 'Bus arrival time is unavailable, so rating is not open yet');
  }

  if (arrivalDateTime.getTime() > Date.now()) {
    throw new ApiError(409, 'You can rate this bus after the trip is completed');
  }

  const existingReviewIndex = Array.isArray(busService.reviews)
    ? busService.reviews.findIndex((item) => String(item?.bookingId || '') === bookingId)
    : -1;

  if (existingReviewIndex >= 0) {
    const existingReview = busService.reviews[existingReviewIndex];
    busService.totalRatingScore = Math.max(0, Number(busService.totalRatingScore || 0) - Number(existingReview.rating || 0) + rating);
    busService.reviews[existingReviewIndex].rating = rating;
    busService.reviews[existingReviewIndex].comment = comment;
    busService.reviews[existingReviewIndex].reviewedAt = new Date();
  } else {
    busService.reviews.push({
      userId: req.auth?.sub,
      bookingId,
      rating,
      comment,
      reviewedAt: new Date(),
    });
    busService.ratingCount = Number(busService.ratingCount || 0) + 1;
    busService.totalRatingScore = Number(busService.totalRatingScore || 0) + rating;
  }

  busService.rating = Number((Number(busService.totalRatingScore || 0) / Math.max(1, Number(busService.ratingCount || 0))).toFixed(1));
  await busService.save();

  res.status(200).json({
    success: true,
    message: 'Bus rating saved successfully',
    data: serializeBusBooking(booking, busService.toObject()),
  });
};

export const cancelMyBusBooking = async (req, res) => {
  await ensureBusServiceEnabled();
  await cleanupExpiredBusSeatHolds();

  const bookingId = String(req.params?.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, 'Valid bus booking id is required');
  }

  const booking = await BusBooking.findOne({
    _id: bookingId,
    userId: req.auth?.sub,
  });

  if (!booking) {
    throw new ApiError(404, 'Bus booking not found');
  }

  if (String(booking.status || '') === 'cancelled') {
    return res.status(200).json({
      success: true,
      data: serializeBusBooking(booking),
      message: 'Bus booking was already cancelled',
    });
  }

  if (String(booking.status || '') !== 'confirmed') {
    throw new ApiError(409, 'Only confirmed bus bookings can be cancelled');
  }

  const busService = await BusService.findById(booking.busServiceId).lean();
  if (!busService) {
    throw new ApiError(404, 'Bus service not found for this booking');
  }

  const selectedSeatIds = Array.isArray(req.body?.seatIds) && req.body.seatIds.length > 0
    ? [...new Set(req.body.seatIds.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const originalSeatIds = Array.isArray(booking.seatIds) ? booking.seatIds : [];
  const originalSeatLabels = Array.isArray(booking.seatLabels) ? booking.seatLabels : [];
  const cancelledSeats = Array.isArray(booking.cancelledSeats) ? booking.cancelledSeats : [];
  const cancelledSeatIds = new Set(
    cancelledSeats.map((item) => toCleanString(item?.seatId)).filter(Boolean),
  );
  const activeSeats = originalSeatIds
    .map((seatId, index) => ({
      seatId: toCleanString(seatId),
      seatLabel: originalSeatLabels[index] || seatId,
    }))
    .filter((item) => item.seatId && !cancelledSeatIds.has(item.seatId));
  const seatsToCancel = selectedSeatIds.length > 0
    ? activeSeats.filter((item) => selectedSeatIds.includes(item.seatId))
    : activeSeats;

  if (seatsToCancel.length === 0) {
    throw new ApiError(400, 'Select at least one active seat to cancel');
  }

  if (selectedSeatIds.length > 0 && seatsToCancel.length !== selectedSeatIds.length) {
    throw new ApiError(409, 'Some selected seats are already cancelled or not part of this booking');
  }

  const cancellationQuote = buildBusPartialCancellationQuote({
    booking,
    busService,
    seatIds: seatsToCancel.map((item) => item.seatId),
    travelDateOverride: req.body?.travelDate || req.body?.date,
  });
  if (!cancellationQuote.allowed) {
    throw new ApiError(409, cancellationQuote.reason || 'This booking can no longer be cancelled');
  }

  const cancelledAt = new Date();
  let refundPayload = null;

  if (cancellationQuote.refundAmount > 0) {
    const paymentId = toCleanString(booking.payment?.paymentId);
    if (!paymentId) {
      throw new ApiError(409, 'This booking cannot be refunded because the payment reference is missing');
    }

    const { keyId, keySecret } = await resolveRazorpayCredentials();
    refundPayload = await razorpayRequest({
      method: 'POST',
      path: `/payments/${paymentId}/refund`,
      body: {
        amount: Math.round(cancellationQuote.refundAmount * 100),
        notes: {
          bookingId: String(booking._id),
          bookingCode: booking.bookingCode || '',
          cancelledSeats: seatsToCancel.map((item) => item.seatLabel || item.seatId).join(', '),
        },
      },
      keyId,
      keySecret,
    });
  }

  const perSeatRefundAmount = seatsToCancel.length > 0
    ? Math.round((cancellationQuote.refundAmount / seatsToCancel.length) * 100) / 100
    : 0;
  const perSeatChargeAmount = seatsToCancel.length > 0
    ? Math.round((cancellationQuote.chargeAmount / seatsToCancel.length) * 100) / 100
    : 0;

  booking.cancelledSeats = [
    ...cancelledSeats,
    ...seatsToCancel.map((item, index) => ({
      seatId: item.seatId,
      seatLabel: item.seatLabel,
      cancelledAt,
      refundAmount: index === seatsToCancel.length - 1
        ? Math.max(0, Math.round((cancellationQuote.refundAmount - (perSeatRefundAmount * (seatsToCancel.length - 1))) * 100) / 100)
        : perSeatRefundAmount,
      chargeAmount: index === seatsToCancel.length - 1
        ? Math.max(0, Math.round((cancellationQuote.chargeAmount - (perSeatChargeAmount * (seatsToCancel.length - 1))) * 100) / 100)
        : perSeatChargeAmount,
      refundStatus: refundPayload ? (refundPayload.status || 'processed') : 'not_applicable',
      refundId: refundPayload?.id || '',
      refundProcessedAt: refundPayload?.created_at ? new Date(Number(refundPayload.created_at) * 1000) : cancelledAt,
      notes: cancellationQuote.notes || '',
    })),
  ];

  const remainingActiveSeatCount = activeSeats.length - seatsToCancel.length;
  booking.status = remainingActiveSeatCount <= 0 ? 'cancelled' : 'confirmed';
  booking.cancelledAt = remainingActiveSeatCount <= 0 ? cancelledAt : null;
  booking.cancellation = {
    allowed: remainingActiveSeatCount > 0,
    appliedRuleId: cancellationQuote.appliedRuleId,
    appliedRuleLabel: cancellationQuote.appliedRuleLabel,
    refundType: cancellationQuote.refundType,
    refundValue: cancellationQuote.refundValue,
    hoursBeforeDeparture: cancellationQuote.hoursBeforeDeparture,
    refundAmount: cancellationQuote.refundAmount,
    chargeAmount: cancellationQuote.chargeAmount,
    notes: cancellationQuote.notes,
  };
  booking.payment.status = refundPayload
    ? (remainingActiveSeatCount <= 0 ? 'refunded' : 'partially_refunded')
    : (remainingActiveSeatCount <= 0 ? 'cancelled' : booking.payment.status || 'paid');
  await booking.save();

  await BusSeatHold.deleteMany({
    bookingId: booking._id,
    status: { $in: ['held', 'booked'] },
    seatId: { $in: seatsToCancel.map((item) => item.seatId) },
  });

  res.status(200).json({
    success: true,
    data: serializeBusBooking(booking, busService),
    message:
      cancellationQuote.refundAmount > 0
        ? (remainingActiveSeatCount <= 0
          ? 'Bus booking cancelled successfully and Razorpay refund was initiated.'
          : 'Selected seats cancelled successfully and Razorpay refund was initiated.')
        : (remainingActiveSeatCount <= 0
          ? 'Bus booking cancelled successfully.'
          : 'Selected seats cancelled successfully.'),
  });
};

export const createRentalQuoteRequest = async (req, res) => {
  const payload = req.body || {};
  const vehicleTypeId = String(payload.vehicleTypeId || '').trim();
  const contactName = toCleanString(payload.contactName);
  const contactPhone = normalizePhone(payload.contactPhone);
  const contactEmail = normalizeEmail(payload.contactEmail);
  const specialRequirements = toCleanString(payload.specialRequirements);
  const pickupLocation = toCleanString(payload.pickupLocation);
  const dropLocation = toCleanString(payload.dropLocation);
  const requestedHours = Math.max(0, Number(payload.requestedHours || 0));
  const seatsNeeded = Math.max(1, Number(payload.seatsNeeded || 1));
  const luggageNeeded = Math.max(0, Number(payload.luggageNeeded || 0));

  if (!mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
    throw new ApiError(400, 'Valid rental vehicle is required');
  }

  if (!contactName || contactName.length < 2) {
    throw new ApiError(400, 'Contact name is required');
  }

  validatePhone(contactPhone);
  validateEmail(contactEmail);

  const vehicle = await RentalVehicleType.findById(vehicleTypeId).lean();
  if (!vehicle || vehicle.active === false || vehicle.status !== 'active') {
    throw new ApiError(404, 'Rental vehicle not found');
  }

  const pickupDateTime = payload.pickupDateTime ? new Date(payload.pickupDateTime) : null;
  const returnDateTime = payload.returnDateTime ? new Date(payload.returnDateTime) : null;

  const request = await RentalQuoteRequest.create({
    userId: req.auth?.sub && mongoose.Types.ObjectId.isValid(req.auth.sub) ? req.auth.sub : null,
    vehicleTypeId,
    vehicleName: vehicle.name || '',
    vehicleCategory: vehicle.vehicleCategory || '',
    contactName,
    contactPhone,
    contactEmail,
    requestedHours,
    pickupDateTime: pickupDateTime && !Number.isNaN(pickupDateTime.getTime()) ? pickupDateTime : null,
    returnDateTime: returnDateTime && !Number.isNaN(returnDateTime.getTime()) ? returnDateTime : null,
    seatsNeeded,
    luggageNeeded,
    pickupLocation,
    dropLocation,
    specialRequirements,
    status: 'pending',
  });

  return res.status(201).json({
    success: true,
    data: serializeRentalQuoteRequest(request.toObject()),
    message: 'Rental quote request submitted successfully',
  });
};

export const createRentalBookingRequest = async (req, res) => {
  const payload = req.body || {};
  const vehicleTypeId = String(payload.vehicleTypeId || payload.vehicleId || '').trim();
  const bookingReference = toCleanString(payload.bookingReference) || `RNT-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const paymentStatus = toCleanString(payload.paymentStatus).toLowerCase() || 'pending';
  const paymentMethod = toCleanString(payload.paymentMethod).toLowerCase();
  const paymentMethodLabel = toCleanString(payload.paymentMethodLabel);
  const kycCompleted = Boolean(payload.kycCompleted);

  if (!mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
    throw new ApiError(400, 'Valid rental vehicle is required');
  }

  if (!['pending', 'paid', 'not_required', 'failed'].includes(paymentStatus)) {
    throw new ApiError(400, 'Invalid rental payment status');
  }

  const pickupDateTime = payload.pickupDateTime ? new Date(payload.pickupDateTime) : null;
  const returnDateTime = payload.returnDateTime ? new Date(payload.returnDateTime) : null;

  if (!pickupDateTime || Number.isNaN(pickupDateTime.getTime())) {
    throw new ApiError(400, 'Valid pickup date and time is required');
  }

  if (!returnDateTime || Number.isNaN(returnDateTime.getTime())) {
    throw new ApiError(400, 'Valid return date and time is required');
  }

  if (returnDateTime <= pickupDateTime) {
    throw new ApiError(400, 'Return date and time must be after pickup');
  }

  const [vehicle, user] = await Promise.all([
    RentalVehicleType.findById(vehicleTypeId).lean(),
    User.findById(req.auth?.sub).lean(),
  ]);

  if (!vehicle || vehicle.active === false || vehicle.status !== 'active') {
    throw new ApiError(404, 'Rental vehicle not found');
  }

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const requestedHours = Math.max(
    0,
    Math.round((((returnDateTime.getTime() - pickupDateTime.getTime()) / 3600000) + Number.EPSILON) * 100) / 100,
  );

  const selectedPackage = payload.selectedPackage || {};
  const serviceLocation = payload.serviceLocation || {};
  const paymentPayload = payload.payment || {};
  const kycDocumentsPayload = payload.kycDocuments || {};
  const matchedPackage = Array.isArray(vehicle.pricing)
    ? vehicle.pricing.find(
        (item) => String(item?.id || item?.packageId || '').trim() ===
          String(selectedPackage.id || selectedPackage.packageId || '').trim(),
      ) || null
    : null;

  if (!matchedPackage) {
    throw new ApiError(400, 'Selected rental package is invalid');
  }

  const totalCost = Math.max(0, Number(matchedPackage.price || 0));
  const advancePaymentConfig = vehicle.advancePayment || {};
  const advancePaymentMode = String(advancePaymentConfig.paymentMode || '').trim().toLowerCase();
  const advancePaymentLabel =
    toCleanString(advancePaymentConfig.label) ||
    toCleanString(payload.advancePaymentLabel) ||
    'Advance booking payment';
  const advanceAmountRaw = advancePaymentConfig.enabled
    ? advancePaymentMode === 'full'
      ? totalCost
      : advancePaymentMode === 'percentage'
        ? (totalCost * Math.max(0, Number(advancePaymentConfig.amount || 0))) / 100
        : Math.max(0, Number(advancePaymentConfig.amount || 0))
    : 0;
  const payableNow = Math.min(
    totalCost,
    Math.round((Math.max(0, advanceAmountRaw) + Number.EPSILON) * 100) / 100,
  );
  const normalizedPaymentStatus = payableNow > 0
    ? paymentStatus === 'paid'
      ? 'paid'
      : paymentStatus === 'failed'
        ? 'failed'
        : 'pending'
    : 'not_required';

  const normalizedDrivingLicenseUrl = toCleanString(
    kycDocumentsPayload.drivingLicense?.imageUrl ||
      kycDocumentsPayload.drivingLicense?.secureUrl ||
      kycDocumentsPayload.drivingLicense?.url ||
      '',
  );
  const normalizedAadhaarUrl = toCleanString(
    kycDocumentsPayload.aadhaarCard?.imageUrl ||
      kycDocumentsPayload.aadhaarCard?.secureUrl ||
      kycDocumentsPayload.aadhaarCard?.url ||
      '',
  );
  const requestedLocationId = toCleanString(serviceLocation.id || serviceLocation._id || serviceLocation.locationId || '');
  const allowedServiceStoreIds = Array.isArray(vehicle.serviceStoreIds)
    ? vehicle.serviceStoreIds.filter((item) => mongoose.Types.ObjectId.isValid(item))
    : [];
  const matchingServiceCenters = allowedServiceStoreIds.length
    ? await ServiceStore.find({
        _id: { $in: allowedServiceStoreIds },
        ...(requestedLocationId ? { service_location_id: requestedLocationId } : {}),
      })
        .select('_id name owner_name rentalCommission')
        .sort({ name: 1, _id: 1 })
        .lean()
    : [];

  if (matchingServiceCenters.length === 0) {
    throw new ApiError(
      400,
      requestedLocationId
        ? 'No rental service store is configured for this vehicle in the selected service location'
        : 'No rental service store is configured for this vehicle',
    );
  }

  const primaryServiceCenter = matchingServiceCenters[0] || null;

  const update = {
    userId: user._id,
    bookingReference,
    vehicleTypeId,
    vehicleName: vehicle.name || '',
    vehicleCategory: vehicle.vehicleCategory || '',
    vehicleImage: vehicle.image || '',
    serviceCenterIds: matchingServiceCenters.map((item) => item._id),
    commissionSnapshot: {
      serviceStoreId: primaryServiceCenter?._id || null,
      serviceStoreName: toCleanString(primaryServiceCenter?.name),
      ownerName: toCleanString(primaryServiceCenter?.owner_name),
      serviceStoreCommissionType:
        primaryServiceCenter?.rentalCommission?.serviceStore?.type === 'fixed'
          ? 'fixed'
          : 'percentage',
      serviceStoreCommissionValue: Math.max(
        0,
        Number(primaryServiceCenter?.rentalCommission?.serviceStore?.value || 0),
      ),
      ownerCommissionType:
        primaryServiceCenter?.rentalCommission?.owner?.type === 'fixed'
          ? 'fixed'
          : 'percentage',
      ownerCommissionValue: Math.max(
        0,
        Number(primaryServiceCenter?.rentalCommission?.owner?.value || 0),
      ),
      serviceTaxPercentage: Math.max(
        0,
        Number(primaryServiceCenter?.rentalCommission?.serviceTaxPercentage || 0),
      ),
    },
    selectedPackage: {
      packageId: toCleanString(selectedPackage.id || selectedPackage.packageId || ''),
      label: toCleanString(matchedPackage.label || selectedPackage.label),
      durationHours: Math.max(0, Number(matchedPackage.durationHours || selectedPackage.durationHours || 0)),
      price: totalCost,
      extraHourPrice: Math.max(0, Number(matchedPackage.extraHourPrice || selectedPackage.extraHourPrice || 0)),
    },
    serviceLocation: {
      locationId: toCleanString(serviceLocation.id || serviceLocation._id || serviceLocation.locationId || ''),
      name: toCleanString(serviceLocation.name),
      address: toCleanString(serviceLocation.address),
      city: toCleanString(serviceLocation.city || serviceLocation.country),
      latitude: Number.isFinite(Number(serviceLocation.latitude)) ? Number(serviceLocation.latitude) : null,
      longitude: Number.isFinite(Number(serviceLocation.longitude)) ? Number(serviceLocation.longitude) : null,
      distanceKm: Number.isFinite(Number(serviceLocation.distanceKm)) ? Number(serviceLocation.distanceKm) : null,
    },
    pickupDateTime,
    returnDateTime,
    requestedHours,
    totalCost,
    payableNow,
    advancePaymentLabel,
    paymentStatus: normalizedPaymentStatus,
    paymentMethod,
    paymentMethodLabel,
    payment: {
      provider: toCleanString(paymentPayload.provider),
      status: toCleanString(paymentPayload.status) || normalizedPaymentStatus,
      amount: normalizedPaymentStatus === 'not_required'
        ? 0
        : Math.max(0, Number(paymentPayload.amount || payableNow || 0)),
      currency: toCleanString(paymentPayload.currency) || 'INR',
      orderId: toCleanString(paymentPayload.orderId || paymentPayload.razorpay_order_id),
      paymentId: toCleanString(paymentPayload.paymentId || paymentPayload.razorpay_payment_id),
      signature: toCleanString(paymentPayload.signature || paymentPayload.razorpay_signature),
    },
    contactName: toCleanString(user.name),
    contactPhone: toCleanString(user.phone),
    contactEmail: toCleanString(user.email),
    kycCompleted,
    kycDocuments: {
      drivingLicense: {
        imageUrl: normalizedDrivingLicenseUrl,
        fileName: toCleanString(
          kycDocumentsPayload.drivingLicense?.fileName || 'driving-license',
        ),
        uploadedAt:
          normalizedDrivingLicenseUrl &&
          kycDocumentsPayload.drivingLicense?.uploadedAt
            ? new Date(kycDocumentsPayload.drivingLicense.uploadedAt)
            : normalizedDrivingLicenseUrl
              ? new Date()
              : null,
      },
      aadhaarCard: {
        imageUrl: normalizedAadhaarUrl,
        fileName: toCleanString(
          kycDocumentsPayload.aadhaarCard?.fileName || 'aadhaar-card',
        ),
        uploadedAt:
          normalizedAadhaarUrl &&
          kycDocumentsPayload.aadhaarCard?.uploadedAt
            ? new Date(kycDocumentsPayload.aadhaarCard.uploadedAt)
            : normalizedAadhaarUrl
              ? new Date()
              : null,
      },
    },
  };

  const request = await RentalBookingRequest.findOneAndUpdate(
    { bookingReference, userId: user._id },
    {
      $set: update,
      $setOnInsert: {
        status: 'pending',
        adminNote: '',
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return res.status(201).json({
    success: true,
    data: buildRentalBookingResponse(request),
    message: 'Rental booking request submitted successfully',
  });
};

export const getMyActiveRentalBooking = async (req, res) => {
  const userId = resolveAuthenticatedUserObjectId(req);

  if (!userId) {
    return res.status(200).json({
      success: true,
      data: null,
    });
  }

  const item = await RentalBookingRequest.findOne({
    userId,
    status: { $in: ['assigned', 'confirmed', 'end_requested'] },
  })
    .populate('vehicleTypeId', 'pricing')
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  if (!item) {
    return res.status(200).json({
      success: true,
      data: null,
    });
  }

  const metrics = computeRentalRideMetrics(item);
  const effectiveMetrics = ['end_requested', 'completed'].includes(String(item.status || ''))
    ? computeRentalRideMetrics(item, item.completionRequestedAt || item.completedAt || new Date())
    : metrics;

  return res.status(200).json({
    success: true,
    data: {
      ...buildRentalBookingResponse(item, item.completionRequestedAt || item.completedAt || null),
      rideMetrics: effectiveMetrics,
    },
  });
};

export const listMyRentalBookings = async (req, res) => {
  const page = toPositiveInteger(req.query?.page, 1);
  const limit = Math.min(20, toPositiveInteger(req.query?.limit, 10));
  const userId = resolveAuthenticatedUserObjectId(req);

  if (!userId) {
    return res.status(200).json({
      success: true,
      data: {
        results: [],
        pagination: buildPagination({ page, limit, total: 0 }),
      },
    });
  }

  const query = {
    userId,
  };

  const [items, total] = await Promise.all([
    RentalBookingRequest.find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RentalBookingRequest.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      results: items.map((item) => buildRentalBookingResponse(item)),
      pagination: buildPagination({ page, limit, total }),
    },
  });
};

export const endMyActiveRentalRide = async (req, res) => {
  const bookingId = String(req.params?.id || '').trim();
  const userId = resolveAuthenticatedUserObjectId(req);

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, 'Valid rental booking id is required');
  }

  if (!userId) {
    throw new ApiError(401, 'Authenticated user id is invalid');
  }

  const item = await RentalBookingRequest.findOne({
    _id: bookingId,
    userId,
  });

  if (!item) {
    throw new ApiError(404, 'Rental booking not found');
  }

  if (!['assigned', 'confirmed'].includes(String(item.status || ''))) {
    throw new ApiError(409, 'This rental ride cannot be ended right now');
  }

  const completionRequestedAt = new Date();
  const metrics = computeRentalRideMetrics(item, completionRequestedAt);

  const transportSettings = await getTransportRideSettings();
  const requireApproval = String(transportSettings.require_admin_approval_to_end_rental || '0') === '1';

  if (requireApproval) {
    item.status = 'end_requested';
    item.completionRequestedAt = completionRequestedAt;
    item.completedAt = null;
  } else {
    item.status = 'completed';
    item.completionRequestedAt = null;
    item.completedAt = completionRequestedAt;
  }

  item.finalCharge = metrics.currentCharge;
  item.finalElapsedMinutes = metrics.elapsedMinutes;

  await item.save();

  return res.status(200).json({
    success: true,
    data: {
      ...buildRentalBookingResponse(item.toObject(), requireApproval ? completionRequestedAt : null),
      rideMetrics: {
        ...metrics,
        currentCharge: item.finalCharge,
      },
    },
    message: requireApproval 
      ? 'Rental ride end request sent for admin review'
      : 'Rental ride ended successfully',
  });
};

export const updateMyActiveRentalLocation = async (req, res) => {
  const userId = resolveAuthenticatedUserObjectId(req);

  if (!userId) {
    throw new ApiError(401, 'Authenticated user id is invalid');
  }

  const payload = await updateUserRentalTracking({
    bookingId: String(req.params?.id || '').trim(),
    userId,
    status: req.body?.status,
    coordinates: req.body?.coordinates,
    heading: req.body?.heading,
    speed: req.body?.speed,
    accuracyMeters: req.body?.accuracyMeters,
    capturedAt: req.body?.capturedAt,
  });

  return res.status(200).json({
    success: true,
    data: payload,
    message: 'Rental tracking updated successfully',
  });
};

export const listMyBusBookings = async (req, res) => {
  const transportSettings = await getTransportRideSettings();
  if (String(transportSettings.enable_bus_service || '0') !== '1') {
    return res.status(200).json({ success: true, results: [], total: 0, message: 'Bus service disabled' });
  }

  await cleanupExpiredBusSeatHolds();

  const page = toPositiveInteger(req.query?.page, 1);
  const limit = Math.min(20, toPositiveInteger(req.query?.limit, 10));
  const normalizedStatus = toCleanString(req.query?.status).toLowerCase();
  const normalizedTripState = toCleanString(req.query?.tripState).toLowerCase();
  const allowedStatuses = new Set(['pending', 'confirmed', 'failed', 'expired', 'cancelled']);
  const query = {
    userId: req.auth?.sub,
    ...(allowedStatuses.has(normalizedStatus) ? { status: normalizedStatus } : {}),
  };

  const items = await BusBooking.find(query)
    .sort({ createdAt: -1 })
    .lean();

  const busServiceIds = [...new Set(items.map((item) => String(item.busServiceId || '')).filter(Boolean))];
  const busServices = busServiceIds.length > 0
    ? await BusService.find({ _id: { $in: busServiceIds } })
        .select('registrationNumber driverName driverPhone cancellationRules schedules route')
        .lean()
    : [];
  const busServiceMap = new Map(busServices.map((item) => [String(item._id), item]));

  const serializedItems = items.map((item) =>
    serializeBusBooking(item, busServiceMap.get(String(item.busServiceId || '')) || null));
  const filteredItems = serializedItems.filter((item) => {
    if (normalizedTripState === 'completed') {
      return Boolean(item?.review?.tripCompleted);
    }

    if (normalizedTripState === 'upcoming') {
      return !item?.review?.tripCompleted && !['cancelled', 'failed', 'expired'].includes(String(item?.status || '').toLowerCase());
    }

    if (normalizedTripState === 'cancelled') {
      return String(item?.status || '').toLowerCase() === 'cancelled';
    }

    return true;
  });

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * limit;
  const pageItems = filteredItems.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    data: {
      results: pageItems,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
    },
  });
};

export const getSetPrices = asyncHandler(async (req, res) => {
  const data = await listSetPrices(req.query || {}, null);
  res.status(200).json({ success: true, ...data });
});

export const getZones = asyncHandler(async (req, res) => {
  const results = await listZones(null);
  res.status(200).json({ success: true, results });
});

