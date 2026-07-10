import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../../../../utils/ApiError.js';
import { env } from '../../../../config/env.js';
import { createDefaultAdminState } from '../data/defaultAdminState.js';
import { Admin } from '../models/Admin.js';
import { User } from '../../user/models/User.js';
import { UserWallet } from '../../user/models/UserWallet.js';
import { WalletTransaction } from '../../driver/models/WalletTransaction.js';
import { AdminBusinessSetting } from '../models/AdminBusinessSetting.js';
import { AdminAppSetting } from '../models/AdminAppSetting.js';
// AppModule import removed
import { createDefaultBusinessSettings } from '../data/defaultBusinessSettings.js';
import { createDefaultAppSettings } from '../data/defaultAppSettings.js';
import { Airport } from '../models/Airport.js';
import { Employee } from '../models/Employee.js';
import { BusService } from '../models/BusService.js';
import { DriverNeededDocument } from '../models/DriverNeededDocument.js';
import { GoodsType } from '../models/GoodsType.js';
import { OwnerNeededDocument } from '../models/OwnerNeededDocument.js';
import { OwnerBooking } from '../models/OwnerBooking.js';
import { Owner } from '../models/Owner.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { ReferralTranslation } from '../models/ReferralTranslation.js';
import { AdminThirdPartySetting } from '../models/AdminThirdPartySetting.js';
import { createDefaultThirdPartySettings } from '../data/defaultThirdPartySettings.js';
import { RentalPackageType } from '../models/RentalPackageType.js';
import { RentalBookingRequest } from '../models/RentalBookingRequest.js';
import { PoolingRoute } from '../models/PoolingRoute.js';
import { RentalVehicleType } from '../models/RentalVehicleType.js';
import { RentalQuoteRequest } from '../models/RentalQuoteRequest.js';
import { SetPrice } from '../models/SetPrice.js';
import { ServiceLocation } from '../models/ServiceLocation.js';
import { ServiceCenterStaff } from '../models/ServiceCenterStaff.js';
import { ServiceStore } from '../models/ServiceStore.js';
import { Vehicle } from '../models/Vehicle.js';
import { Driver } from '../../driver/models/Driver.js';
import { BusDriver } from '../../driver/models/BusDriver.js';
import { Zone } from '../../driver/models/Zone.js';
import { Ride } from '../../user/models/Ride.js';
import { UserSubscription } from '../../user/models/UserSubscription.js';
import { AppLanguage } from '../models/AppLanguage.js';
import { RideModule } from '../models/RideModule.js';
import { SubscriptionPlan } from '../models/SubscriptionPlan.js';
import { TaxiAppModule } from '../models/TaxiAppModule.js';
import { NotificationChannel } from '../models/NotificationChannel.js';
import { UserPreference } from '../models/UserPreference.js';
import { AdminRole } from '../models/AdminRole.js';
import { PaymentGateway } from '../models/PaymentGateway.js';
import { PaymentMethod } from '../models/PaymentMethod.js';
import { OnboardingScreen } from '../models/OnboardingScreen.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { SupportTicket } from '../../support/models/SupportTicket.js';
import TaxiTransportType from '../models/TaxiTransportType.js';
import { comparePassword, hashPassword } from '../../driver/services/authService.js';
import {
  applyDriverWalletAdjustment,
  serializeDriverWallet,
} from '../../driver/services/walletService.js';
import { RIDE_LIVE_STATUS, RIDE_STATUS, VEHICLE_TYPES } from '../../constants/index.js';
import {
  cancelRideByAdmin,
  emitToDriver,
  notifyUserAccountDeleted,
} from '../../services/dispatchService.js';
import { buildRentalTrackingSnapshot, listActiveRentalTrackingBookings } from '../../services/rentalTrackingService.js';
import { sendEmail } from '../../services/mailService.js';
import { getActivePaymentGateway, normalizePaymentSettingsPayload } from '../../services/paymentGatewayService.js';
import { signAccessToken } from '../../services/tokenService.js';
import {
  ADMIN_PERMISSIONS,
  SUPERADMIN_PERMISSION,
  hasAdminPermission,
  normalizeAdminPermissions,
  normalizeAdminType,
} from './adminAccessService.js';

const PUBLIC_VEHICLE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let publicVehicleCatalogCache = {
  expiresAt: 0,
  value: null,
};
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
let dashboardCache = {
  expiresAt: 0,
  value: null,
};

const deepMerge = (target, source) => {
  const result = { ...target };
  for (const key in source) {
    if (source[key] instanceof Object && key in result && result[key] instanceof Object) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const normalizeIpAddressList = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(/\r?\n|,/)
      .map((entry) => entry.trim());

  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || '').trim())
        .filter(Boolean),
    ),
  );
};

const buildRechargeApiCallbackUrl = () => {
  const baseOrigin =
    trimTrailingSlash(env.publicBackendUrl) ||
    `http://localhost:${env.port}`;

  return `${baseOrigin}/api/v1/common/recharge-api/callback`;
};

const normalizeRechargeApiSettings = (settings = {}) => {
  const merged = {
    enabled: '0',
    provider_name: 'RechargeKit Verify',
    base_url: 'https://verify.rechargkit.biz',
    auth_header_name: 'Authorization',
    auth_header_prefix: 'Bearer',
    api_token: '',
    token_generated_at: null,
    callback_mode: 'auto',
    callback_url: '',
    callback_secret: '',
    allowed_ip_addresses: [],
    notes: '',
    endpoints: {
      bank_verify_penny_less: '/validation/verifyBankRequest',
      bank_verify_penny_drop: '/validation/penny-drop',
      bank_verify_v3: '/validation/v3/pennyDropVerify',
      card_bin: '/validation/cardValidate',
      upi_basic: '/validation/upiBasic',
      pan_verify: '/validation/verifyPANRequest',
      dl_request: '/validation/verifyDL',
      dl_verify: '/validation/verifyDL',
      gstin_verify: '/validation/verifyGSTIN',
      rc_verify: '/validation/rcAdvanceVerify',
      upi_advance: '/validation/upiAdvanceVerify',
    },
    ...settings,
  };

  return {
    ...merged,
    enabled: String(merged.enabled) === '1' ? '1' : '0',
    provider_name: String(merged.provider_name || 'RechargeKit Verify').trim() || 'RechargeKit Verify',
    base_url: trimTrailingSlash(String(merged.base_url || 'https://verify.rechargkit.biz').trim()) || 'https://verify.rechargkit.biz',
    auth_header_name: String(merged.auth_header_name || 'Authorization').trim() || 'Authorization',
    auth_header_prefix: String(merged.auth_header_prefix || 'Bearer').trim(),
    callback_mode: String(merged.callback_mode || 'auto').trim().toLowerCase() === 'manual' ? 'manual' : 'auto',
    callback_url: String(merged.callback_url || '').trim(),
    callback_secret: String(merged.callback_secret || '').trim(),
    api_token: String(merged.api_token || '').trim(),
    notes: String(merged.notes || '').trim(),
    allowed_ip_addresses: normalizeIpAddressList(merged.allowed_ip_addresses),
    token_generated_at: merged.token_generated_at || null,
    endpoints: {
      bank_verify_penny_less: String(merged?.endpoints?.bank_verify_penny_less || '/validation/verifyBankRequest').trim() || '/validation/verifyBankRequest',
      bank_verify_penny_drop: String(merged?.endpoints?.bank_verify_penny_drop || '/validation/penny-drop').trim() || '/validation/penny-drop',
      bank_verify_v3: String(merged?.endpoints?.bank_verify_v3 || '/validation/v3/pennyDropVerify').trim() || '/validation/v3/pennyDropVerify',
      card_bin: String(merged?.endpoints?.card_bin || '/validation/cardValidate').trim() || '/validation/cardValidate',
      upi_basic: String(merged?.endpoints?.upi_basic || '/validation/upiBasic').trim() || '/validation/upiBasic',
      pan_verify: String(merged?.endpoints?.pan_verify || '/validation/verifyPANRequest').trim() || '/validation/verifyPANRequest',
      dl_request: String(merged?.endpoints?.dl_request || '/validation/verifyDL').trim() || '/validation/verifyDL',
      dl_verify: String(merged?.endpoints?.dl_verify || '/validation/verifyDL').trim() || '/validation/verifyDL',
      gstin_verify: String(merged?.endpoints?.gstin_verify || '/validation/verifyGSTIN').trim() || '/validation/verifyGSTIN',
      rc_verify: String(merged?.endpoints?.rc_verify || '/validation/rcAdvanceVerify').trim() || '/validation/rcAdvanceVerify',
      upi_advance: String(merged?.endpoints?.upi_advance || '/validation/upiAdvanceVerify').trim() || '/validation/upiAdvanceVerify',
    },
  };
};

const buildRechargeApiResponse = (settings = {}) => {
  const normalized = normalizeRechargeApiSettings(settings);
  const resolvedCallbackUrl =
    normalized.callback_mode === 'manual' && normalized.callback_url
      ? normalized.callback_url
      : buildRechargeApiCallbackUrl();

  return {
    settings: {
      ...normalized,
      resolved_callback_url: resolvedCallbackUrl,
    },
    metadata: {
      callback_url: resolvedCallbackUrl,
      callback_method: 'POST',
      token_header: 'x-api-token',
      provider_name: normalized.provider_name,
      base_url: normalized.base_url,
      auth_header_name: normalized.auth_header_name,
      auth_header_prefix: normalized.auth_header_prefix,
      doc_sections: [
        'Setup API Token',
        'Setup Callback URL',
        'Setup IP Address',
        'API Testing',
        'API Documentation',
      ],
      sample_endpoints: {
        callback: resolvedCallbackUrl,
        healthcheck: `${trimTrailingSlash(env.publicBackendUrl) || `http://localhost:${env.port}`}/api/v1/common/recharge-api/callback`,
      },
      provider_endpoints: normalized.endpoints,
    },
  };
};

const buildPaginator = (items, page = 1, limit = 50) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;
  const results = items.slice(start, start + safeLimit);

  return {
    results,
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total: items.length,
      last_page: Math.max(1, Math.ceil(items.length / safeLimit)),
    },
  };
};

const nextId = () => new mongoose.Types.ObjectId().toString();
const toObjectId = (value) => {
  if (value === null || value === undefined) return null;

  const normalized =
    typeof value === 'string'
      ? value.trim()
      : String(value).trim();

  if (!normalized || !mongoose.isValidObjectId(normalized)) {
    return null;
  }

  return new mongoose.Types.ObjectId(normalized);
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  return false;
};

const normalizeObjectIdList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))]
    .map(toObjectId)
    .filter(Boolean);

const getAdminScope = (admin = {}) => ({
  adminType: normalizeAdminType(admin.admin_type || admin.role),
  serviceLocationIds: normalizeObjectIdList(admin.service_location_ids),
  zoneIds: normalizeObjectIdList(admin.zone_ids),
});

const isSuperAdmin = (admin = {}) => getAdminScope(admin).adminType === 'superadmin';

const buildNoAccessQuery = (field) => ({ [field]: { $in: [] } });

const getScopedZoneIds = async (admin = {}) => {
  const { adminType, zoneIds, serviceLocationIds } = getAdminScope(admin);

  if (adminType === 'superadmin') {
    return [];
  }

  if (zoneIds.length > 0) {
    return zoneIds;
  }

  if (serviceLocationIds.length === 0) {
    return [];
  }

  const zoneIdsFromLocations = await Zone.find({
    service_location_id: { $in: serviceLocationIds },
  }).distinct('_id');

  return zoneIdsFromLocations.map((value) => toObjectId(value)).filter(Boolean);
};

const buildServiceLocationScopeQuery = (admin = {}, field = 'service_location_id') => {
  const { adminType, serviceLocationIds } = getAdminScope(admin);

  if (adminType === 'superadmin') {
    return {};
  }

  if (serviceLocationIds.length === 0) {
    return buildNoAccessQuery(field);
  }

  return { [field]: { $in: serviceLocationIds } };
};

const buildZoneScopeQuery = async (admin = {}, field = 'zone_id') => {
  const { adminType } = getAdminScope(admin);

  if (adminType === 'superadmin') {
    return {};
  }

  const scopedZoneIds = await getScopedZoneIds(admin);

  if (scopedZoneIds.length === 0) {
    return buildNoAccessQuery(field);
  }

  return { [field]: { $in: scopedZoneIds } };
};

const assertAdminPermission = (admin, permission, label = 'resource') => {
  if (!hasAdminPermission(admin, permission)) {
    throw new ApiError(403, `You do not have permission to access ${label}`);
  }
};

const assertServiceLocationAccess = (admin = {}, serviceLocationId) => {
  if (isSuperAdmin(admin)) {
    return;
  }

  const normalizedId = String(serviceLocationId || '').trim();
  const { serviceLocationIds } = getAdminScope(admin);

  if (!normalizedId || !serviceLocationIds.some((item) => String(item) === normalizedId)) {
    throw new ApiError(403, 'Service location is outside your assigned scope');
  }
};

const assertZoneAccess = async (admin = {}, zoneId) => {
  if (isSuperAdmin(admin)) {
    return;
  }

  const normalizedId = String(zoneId || '').trim();
  if (!normalizedId) {
    throw new ApiError(403, 'Zone is outside your assigned scope');
  }

  const { zoneIds, serviceLocationIds } = getAdminScope(admin);

  if (zoneIds.length > 0) {
    if (!zoneIds.some((item) => String(item) === normalizedId)) {
      throw new ApiError(403, 'Zone is outside your assigned scope');
    }
    return;
  }

  const zone = await Zone.findById(normalizedId).select('service_location_id').lean();
  if (!zone || !serviceLocationIds.some((item) => String(item) === String(zone.service_location_id || ''))) {
    throw new ApiError(403, 'Zone is outside your assigned scope');
  }
};

const serializeAdminSummary = (admin, serviceLocationMap = new Map(), zoneMap = new Map()) => {
  const serviceLocationIds = normalizeObjectIdList(admin.service_location_ids).map(String);
  const zoneIds = normalizeObjectIdList(admin.zone_ids).map(String);

  return {
    _id: admin._id,
    id: admin._id,
    name: admin.name || '',
    email: admin.email || '',
    phone: admin.phone || '',
    role: admin.role || '',
    admin_type: normalizeAdminType(admin.admin_type || admin.role),
    permissions: normalizeAdminPermissions(admin.permissions || []),
    service_location_ids: serviceLocationIds,
    zone_ids: zoneIds,
    service_locations: serviceLocationIds
      .map((id) => serviceLocationMap.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: String(item._id || item.id || ''),
        name: item.service_location_name || item.name || '',
        country: item.country || '',
      })),
    zones: zoneIds
      .map((id) => zoneMap.get(id))
      .filter(Boolean)
      .map((item) => ({
        id: String(item._id || item.id || ''),
        name: item.name || '',
        service_location_id: String(item.service_location_id || ''),
      })),
    active: admin.active !== false,
    status: admin.status || (admin.active === false ? 'inactive' : 'active'),
    createdAt: admin.createdAt || null,
    updatedAt: admin.updatedAt || null,
  };
};

const enrichAdminSummaries = async (admins = []) => {
  const serviceLocationIds = [
    ...new Set(
      admins.flatMap((admin) => normalizeObjectIdList(admin.service_location_ids).map(String)),
    ),
  ];
  const zoneIds = [
    ...new Set(
      admins.flatMap((admin) => normalizeObjectIdList(admin.zone_ids).map(String)),
    ),
  ];

  const [serviceLocations, zones] = await Promise.all([
    serviceLocationIds.length > 0
      ? ServiceLocation.find({ _id: { $in: serviceLocationIds } })
        .select('_id name service_location_name country')
        .lean()
      : [],
    zoneIds.length > 0
      ? Zone.find({ _id: { $in: zoneIds } })
        .select('_id name service_location_id')
        .lean()
      : [],
  ]);

  const serviceLocationMap = new Map(serviceLocations.map((item) => [String(item._id), item]));
  const zoneMap = new Map(zones.map((item) => [String(item._id), item]));

  return admins.map((admin) => serializeAdminSummary(admin, serviceLocationMap, zoneMap));
};

const normalizeDriverAccountType = (value) => {
  const normalized = String(value || 'individual').trim().toLowerCase();

  if (normalized === 'fleet drivers' || normalized === 'fleet_drivers' || normalized === 'fleetdrivers') {
    return 'fleet_drivers';
  }

  if (normalized === 'both') {
    return 'both';
  }

  return 'individual';
};

const normalizeDriverTemplateType = (value) => {
  const normalized = String(value || 'document').trim().toLowerCase();
  return normalized === 'vehicle_field' ? 'vehicle_field' : 'document';
};

const normalizeDriverVehicleFieldType = (value) => {
  const normalized = String(value || 'text').trim().toLowerCase();
  return ['text', 'number', 'textarea', 'select', 'multi_select', 'location_select', 'vehicle_type_select'].includes(normalized)
    ? normalized
    : 'text';
};

const DRIVER_VEHICLE_FIELD_DEFINITIONS = {
  locationId: { label: 'Operating City', field_type: 'location_select', field_group: 'common', account_type: 'both', sort_order: 10 },
  serviceCategories: { label: 'Service Category', field_type: 'multi_select', field_group: 'driver', account_type: 'individual', sort_order: 20, options: ['taxi', 'outstation', 'delivery', 'pooling'] },
  vehicleTypeId: { label: 'Vehicle Type', field_type: 'vehicle_type_select', field_group: 'driver', account_type: 'individual', sort_order: 30 },
  make: { label: 'Brand / Make', field_type: 'text', field_group: 'driver', account_type: 'individual', sort_order: 40, placeholder: 'e.g. Maruti Suzuki' },
  model: { label: 'Model', field_type: 'text', field_group: 'driver', account_type: 'individual', sort_order: 50, placeholder: 'Swift, Bolt' },
  year: { label: 'Year', field_type: 'number', field_group: 'driver', account_type: 'individual', sort_order: 60, placeholder: String(new Date().getFullYear()) },
  number: { label: 'Plate Number', field_type: 'text', field_group: 'driver', account_type: 'individual', sort_order: 70, placeholder: 'DL1RT1234' },
  color: { label: 'Exterior Color', field_type: 'text', field_group: 'driver', account_type: 'individual', sort_order: 80, placeholder: 'e.g. White, Black' },
  companyName: { label: 'Company Name', field_type: 'text', field_group: 'owner', account_type: 'fleet_drivers', sort_order: 30, placeholder: 'Legal Company Name' },
  companyAddress: { label: 'Company Address', field_type: 'text', field_group: 'owner', account_type: 'fleet_drivers', sort_order: 40, placeholder: 'Business Address' },
  city: { label: 'City', field_type: 'text', field_group: 'owner', account_type: 'fleet_drivers', sort_order: 50, placeholder: 'City' },
  postalCode: { label: 'Postal Code', field_type: 'number', field_group: 'owner', account_type: 'fleet_drivers', sort_order: 60, placeholder: 'Pincode' },
  taxNumber: { label: 'Tax Number (GST/VAT)', field_type: 'text', field_group: 'owner', account_type: 'fleet_drivers', sort_order: 70, placeholder: 'Tax Identification' },
};

const slugify = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `document-${Date.now()}`;

const buildDefaultDriverVehicleFieldConfigs = () =>
  Object.entries(DRIVER_VEHICLE_FIELD_DEFINITIONS).map(([field_key, meta]) => ({
    template_type: 'vehicle_field',
    field_key,
    name: meta.label,
    slug: `vehicle-field-${slugify(field_key)}`,
    account_type: meta.account_type || 'individual',
    field_type: meta.field_type || 'text',
    field_group: meta.field_group || '',
    placeholder: meta.placeholder || '',
    help_text: '',
    sort_order: Number(meta.sort_order || 0) / 10 || 0,
    options: Array.isArray(meta.options) ? meta.options : [],
    is_editable: true,
    is_required: true,
    active: true,
  }));

const toDocumentKey = (value = '') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();

  if (!normalized) {
    return `document${Date.now()}`;
  }

  return normalized
    .split(/\s+/)
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join('');
};

const normalizeVehicleTransportType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'delivery') return 'delivery';
  if (normalized === 'pooling') return 'pooling';
  if (normalized === 'both' || normalized === 'all') return 'both';
  return 'taxi';
};

const normalizeDriverRegisterFor = (value = '', fallback = 'taxi') => {
  const normalized = String(value || fallback || 'taxi').trim().toLowerCase();
  if (normalized === 'all') return 'both';
  if (normalized === 'both') return 'both';
  if (normalized === 'delivery') return 'delivery';
  if (normalized === 'outstation') return 'outstation';
  if (normalized === 'pooling') return 'pooling';
  if (normalized === 'bike') return 'bike';
  if (normalized === 'auto') return 'auto';
  if (normalized === 'car') return 'car';
  return 'taxi';
};

const normalizeDriverServiceCategories = (value, fallback = 'taxi') => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalized = [...new Set(
    rawValues
      .map((item) => String(item || '').trim().toLowerCase())
      .flatMap((item) => item === 'both' ? ['taxi', 'outstation'] : item ? [item] : [])
      .filter((item) => ['taxi', 'outstation', 'delivery', 'pooling'].includes(item)),
  )];

  if (normalized.length > 0) {
    return normalized;
  }

  const registerFor = normalizeDriverRegisterFor(fallback);
  if (registerFor === 'both') {
    return ['taxi', 'outstation'];
  }

  return ['taxi', 'outstation', 'delivery', 'pooling'].includes(registerFor)
    ? [registerFor]
    : ['taxi'];
};

const normalizeDeliveryCategory = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'trucks') return 'trucks';
  if (normalized === '2wheeler' || normalized === '2_wheeler' || normalized === 'two_wheeler') return '2wheeler';
  if (normalized === 'movers' || normalized === 'packers_movers' || normalized === 'packers-and-movers') return 'movers';
  return '';
};

const normalizeDeliveryDistancePricing = (value = {}, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = fallback && typeof fallback === 'object' ? fallback : {};

  return {
    enabled: Boolean(source.enabled ?? defaults.enabled ?? false),
    base_price: Number(source.base_price ?? defaults.base_price ?? 0),
    free_distance: Number(source.free_distance ?? defaults.free_distance ?? 0),
    distance_price: Number(source.distance_price ?? defaults.distance_price ?? 0),
    free_time: Number(source.free_time ?? defaults.free_time ?? 0),
    time_price: Number(source.time_price ?? defaults.time_price ?? 0),
  };
};

const BUS_DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const sanitizeBusText = (value = '', fallback = '') =>
  String(value ?? fallback).trim();

const sanitizeBusSeatPrice = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBusVariantPricing = (value = {}, fallback = 0) => {
  const source = value && typeof value === 'object' ? value : {};
  const seatFallback = sanitizeBusSeatPrice(source.seat, fallback);

  return {
    seat: seatFallback,
    window: sanitizeBusSeatPrice(source.window, seatFallback),
    aisle: sanitizeBusSeatPrice(source.aisle, seatFallback),
    sleeper: sanitizeBusSeatPrice(source.sleeper, seatFallback),
  };
};

const sanitizeBusPhone = (value = '') =>
  String(value || '')
    .replace(/\D/g, '')
    .trim()
    .slice(-10);

const sanitizeBusCoords = (value = null) => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return null;
};

const normalizeBusDeckLayoutConfig = (value = {}, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};

  return {
    enabled: Boolean(source.enabled ?? base.enabled ?? false),
    rows: Math.max(0, sanitizeBusSeatPrice(source.rows, base.rows ?? 0)),
    leftSeats: Math.max(0, Math.min(3, sanitizeBusSeatPrice(source.leftSeats, base.leftSeats ?? 0))),
    rightSeats: Math.max(0, Math.min(3, sanitizeBusSeatPrice(source.rightSeats, base.rightSeats ?? 0))),
    seatType: source.seatType === 'sleeper' || base.seatType === 'sleeper' ? 'sleeper' : 'seat',
  };
};

const normalizeBusLayoutConfig = (value = {}, fallback = {}) => ({
  lower: normalizeBusDeckLayoutConfig(value?.lower, fallback?.lower),
  upper: normalizeBusDeckLayoutConfig(value?.upper, fallback?.upper),
});

const normalizeBusSeatCell = (cell = {}) => {
  if (cell?.kind !== 'seat') {
    return {
      kind: 'aisle',
      id: '',
      label: '',
      variant: 'seat',
      status: 'available',
    };
  }

  return {
    kind: 'seat',
    id: sanitizeBusText(cell.id),
    label: sanitizeBusText(cell.label),
    variant: sanitizeBusText(cell.variant, 'seat') || 'seat',
    status: cell.status === 'blocked' ? 'blocked' : 'available',
  };
};

const normalizeBusDeck = (deckRows = []) =>
  Array.isArray(deckRows)
    ? deckRows.map((row) =>
      Array.isArray(row) ? row.map((cell) => normalizeBusSeatCell(cell)) : [],
    )
    : [];

const countSeatsInBlueprintDeck = (deckRows = []) =>
  normalizeBusDeck(deckRows).flat().filter((cell) => cell.kind === 'seat').length;

const normalizeBusStop = (stop = {}, index = 0) => ({
  id: sanitizeBusText(stop.id, `stop-${Date.now()}-${index}`),
  city: sanitizeBusText(stop.city),
  pointName: sanitizeBusText(stop.pointName),
  stopType: ['pickup', 'drop', 'both'].includes(stop.stopType) ? stop.stopType : 'pickup',
  arrivalTime: sanitizeBusText(stop.arrivalTime),
  departureTime: sanitizeBusText(stop.departureTime),
});

const normalizeBusSchedule = (schedule = {}, index = 0) => ({
  id: sanitizeBusText(schedule.id, `schedule-${Date.now()}-${index}`),
  label: sanitizeBusText(schedule.label),
  departureTime: sanitizeBusText(schedule.departureTime),
  arrivalTime: sanitizeBusText(schedule.arrivalTime),
  activeDays: Array.isArray(schedule.activeDays)
    ? schedule.activeDays.filter((day) => BUS_DAY_OPTIONS.includes(day))
    : [],
  status: ['active', 'paused', 'draft'].includes(schedule.status) ? schedule.status : 'active',
});

const normalizeBusCancellationRule = (rule = {}, index = 0) => ({
  id: sanitizeBusText(rule.id, `cancel-${Date.now()}-${index}`),
  label: sanitizeBusText(
    rule.label,
    `${sanitizeBusSeatPrice(rule.hoursBeforeDeparture, 0)}h before departure`,
  ),
  hoursBeforeDeparture: Math.max(0, sanitizeBusSeatPrice(rule.hoursBeforeDeparture, 0)),
  refundType: ['percentage', 'fixed', 'none'].includes(rule.refundType)
    ? rule.refundType
    : 'percentage',
  refundValue: Math.max(0, sanitizeBusSeatPrice(rule.refundValue, 0)),
  notes: sanitizeBusText(rule.notes),
});

const normalizeBusServicePayload = (payload = {}, existing = {}) => {
  const blueprint = {
    templateKey: sanitizeBusText(
      payload.blueprint?.templateKey,
      existing.blueprint?.templateKey || 'seater_2_2',
    ),
    layoutConfig: normalizeBusLayoutConfig(
      payload.blueprint?.layoutConfig,
      existing.blueprint?.layoutConfig,
    ),
    lowerDeck: normalizeBusDeck(payload.blueprint?.lowerDeck ?? existing.blueprint?.lowerDeck ?? []),
    upperDeck: normalizeBusDeck(payload.blueprint?.upperDeck ?? existing.blueprint?.upperDeck ?? []),
  };

  const route = {
    routeName: sanitizeBusText(payload.route?.routeName, existing.route?.routeName || ''),
    originCity: sanitizeBusText(payload.route?.originCity, existing.route?.originCity || ''),
    destinationCity: sanitizeBusText(payload.route?.destinationCity, existing.route?.destinationCity || ''),
    originCoords: sanitizeBusCoords(payload.route?.originCoords ?? existing.route?.originCoords),
    destinationCoords: sanitizeBusCoords(payload.route?.destinationCoords ?? existing.route?.destinationCoords),
    distanceKm: sanitizeBusText(payload.route?.distanceKm, existing.route?.distanceKm || ''),
    durationHours: sanitizeBusText(payload.route?.durationHours, existing.route?.durationHours || ''),
    stops: Array.isArray(payload.route?.stops)
      ? payload.route.stops.map((stop, index) => normalizeBusStop(stop, index))
      : Array.isArray(existing.route?.stops)
        ? existing.route.stops.map((stop, index) => normalizeBusStop(stop, index))
        : [],
  };

  const returnRoute = {
    routeName: sanitizeBusText(payload.returnRoute?.routeName, existing.returnRoute?.routeName || ''),
    originCity: sanitizeBusText(payload.returnRoute?.originCity, existing.returnRoute?.originCity || ''),
    destinationCity: sanitizeBusText(payload.returnRoute?.destinationCity, existing.returnRoute?.destinationCity || ''),
    originCoords: sanitizeBusCoords(payload.returnRoute?.originCoords ?? existing.returnRoute?.originCoords),
    destinationCoords: sanitizeBusCoords(payload.returnRoute?.destinationCoords ?? existing.returnRoute?.destinationCoords),
    distanceKm: sanitizeBusText(payload.returnRoute?.distanceKm, existing.returnRoute?.distanceKm || ''),
    durationHours: sanitizeBusText(payload.returnRoute?.durationHours, existing.returnRoute?.durationHours || ''),
    stops: Array.isArray(payload.returnRoute?.stops)
      ? payload.returnRoute.stops.map((stop, index) => normalizeBusStop(stop, index))
      : Array.isArray(existing.returnRoute?.stops)
        ? existing.returnRoute.stops.map((stop, index) => normalizeBusStop(stop, index))
        : [],
  };

  const schedules = Array.isArray(payload.schedules)
    ? payload.schedules.map((schedule, index) => normalizeBusSchedule(schedule, index))
    : Array.isArray(existing.schedules)
      ? existing.schedules.map((schedule, index) => normalizeBusSchedule(schedule, index))
      : [];

  const cancellationRules = Array.isArray(payload.cancellationRules)
    ? payload.cancellationRules.map((rule, index) => normalizeBusCancellationRule(rule, index))
    : Array.isArray(existing.cancellationRules)
      ? existing.cancellationRules.map((rule, index) => normalizeBusCancellationRule(rule, index))
      : [];

  const capacity =
    payload.capacity !== undefined
      ? sanitizeBusSeatPrice(payload.capacity, 0)
      : countSeatsInBlueprintDeck(blueprint.lowerDeck) + countSeatsInBlueprintDeck(blueprint.upperDeck);

  return {
    operatorName: sanitizeBusText(payload.operatorName, existing.operatorName || ''),
    busName: sanitizeBusText(payload.busName, existing.busName || ''),
    serviceNumber: sanitizeBusText(payload.serviceNumber, existing.serviceNumber || ''),
    driverName: sanitizeBusText(payload.driverName, existing.driverName || ''),
    driverPhone: sanitizeBusPhone(payload.driverPhone ?? existing.driverPhone ?? ''),
    busDriverId:
      toObjectId(payload.busDriverId) ||
      toObjectId(existing.busDriverId) ||
      null,
    ownerDriverId:
      toObjectId(payload.ownerDriverId) ||
      toObjectId(existing.ownerDriverId) ||
      null,
    coachType: sanitizeBusText(payload.coachType, existing.coachType || 'AC Sleeper'),
    busCategory: sanitizeBusText(payload.busCategory, existing.busCategory || 'Sleeper'),
    registrationNumber: sanitizeBusText(payload.registrationNumber, existing.registrationNumber || ''),
    busColor: sanitizeBusText(payload.busColor, existing.busColor || '#1f2937'),
    seatPrice: sanitizeBusSeatPrice(payload.seatPrice, existing.seatPrice || 0),
    adminCommissionPercentage: Math.min(
      100,
      Math.max(0, sanitizeBusSeatPrice(payload.adminCommissionPercentage, existing.adminCommissionPercentage || 0)),
    ),
    serviceTaxPercentage: Math.min(
      100,
      Math.max(0, sanitizeBusSeatPrice(payload.serviceTaxPercentage, existing.serviceTaxPercentage || 0)),
    ),
    variantPricing: normalizeBusVariantPricing(
      payload.variantPricing ?? existing.variantPricing ?? {},
      sanitizeBusSeatPrice(payload.seatPrice, existing.seatPrice || 0),
    ),
    fareCurrency:
      sanitizeBusText(payload.fareCurrency, existing.fareCurrency || 'INR').toUpperCase() || 'INR',
    boardingPolicy: sanitizeBusText(payload.boardingPolicy, existing.boardingPolicy || ''),
    cancellationPolicy: sanitizeBusText(payload.cancellationPolicy, existing.cancellationPolicy || ''),
    cancellationRules,
    luggagePolicy: sanitizeBusText(payload.luggagePolicy, existing.luggagePolicy || ''),
    amenities: Array.isArray(payload.amenities)
      ? payload.amenities.map((item) => sanitizeBusText(item)).filter(Boolean)
      : Array.isArray(existing.amenities)
        ? existing.amenities
        : [],
    image: sanitizeBusText(payload.image, existing.image || ''),
    coverImage: sanitizeBusText(
      payload.coverImage,
      payload.image || existing.coverImage || existing.image || '',
    ),
    galleryImages: Array.isArray(payload.galleryImages)
      ? payload.galleryImages.map((item) => sanitizeBusText(item)).filter(Boolean)
      : Array.isArray(existing.galleryImages)
        ? existing.galleryImages.map((item) => sanitizeBusText(item)).filter(Boolean)
        : [],
    blueprint,
    route,
    returnRouteEnabled: Boolean(payload.returnRouteEnabled ?? existing.returnRouteEnabled ?? false),
    returnRoute,
    schedules,
    capacity,
    status: ['draft', 'active', 'paused'].includes(payload.status) ? payload.status : existing.status || 'draft',
  };
};

const serializeBusService = (item = {}) => ({
  id: String(item._id || item.id || ''),
  _id: item._id,
  ownerId: item.ownerId ? String(item.ownerId) : '',
  ownerDriverId: item.ownerDriverId ? String(item.ownerDriverId) : '',
  operatorName: item.operatorName || '',
  busName: item.busName || '',
  serviceNumber: item.serviceNumber || '',
  driverName: item.driverName || '',
  driverPhone: item.driverPhone || '',
  busDriverId: item.busDriverId ? String(item.busDriverId) : '',
  coachType: item.coachType || 'AC Sleeper',
  busCategory: item.busCategory || 'Sleeper',
  registrationNumber: item.registrationNumber || '',
  busColor: item.busColor || '#1f2937',
  seatPrice: item.seatPrice !== undefined && item.seatPrice !== null ? String(item.seatPrice) : '0',
  adminCommissionPercentage:
    item.adminCommissionPercentage !== undefined && item.adminCommissionPercentage !== null
      ? String(item.adminCommissionPercentage)
      : '0',
  serviceTaxPercentage:
    item.serviceTaxPercentage !== undefined && item.serviceTaxPercentage !== null
      ? String(item.serviceTaxPercentage)
      : '0',
  variantPricing: normalizeBusVariantPricing(item.variantPricing || {}, item.seatPrice ?? 0),
  fareCurrency: item.fareCurrency || 'INR',
  boardingPolicy: item.boardingPolicy || '',
  cancellationPolicy: item.cancellationPolicy || '',
  cancellationRules: Array.isArray(item.cancellationRules)
    ? item.cancellationRules.map((rule, index) => normalizeBusCancellationRule(rule, index))
    : [],
  luggagePolicy: item.luggagePolicy || '',
  amenities: Array.isArray(item.amenities) ? item.amenities : [],
  image: item.image || item.coverImage || '',
  coverImage: item.coverImage || item.image || '',
  galleryImages: Array.isArray(item.galleryImages) ? item.galleryImages.filter(Boolean) : [],
  blueprint: {
    templateKey: item.blueprint?.templateKey || 'seater_2_2',
    layoutConfig: normalizeBusLayoutConfig(item.blueprint?.layoutConfig || {}),
    lowerDeck: normalizeBusDeck(item.blueprint?.lowerDeck || []),
    upperDeck: normalizeBusDeck(item.blueprint?.upperDeck || []),
  },
  route: {
    routeName: item.route?.routeName || '',
    originCity: item.route?.originCity || '',
    destinationCity: item.route?.destinationCity || '',
    originCoords: sanitizeBusCoords(item.route?.originCoords),
    destinationCoords: sanitizeBusCoords(item.route?.destinationCoords),
    distanceKm: item.route?.distanceKm || '',
    durationHours: item.route?.durationHours || '',
    stops: Array.isArray(item.route?.stops)
      ? item.route.stops.map((stop, index) => normalizeBusStop(stop, index))
      : [],
  },
  returnRouteEnabled: Boolean(item.returnRouteEnabled),
  returnRoute: {
    routeName: item.returnRoute?.routeName || '',
    originCity: item.returnRoute?.originCity || '',
    destinationCity: item.returnRoute?.destinationCity || '',
    originCoords: sanitizeBusCoords(item.returnRoute?.originCoords),
    destinationCoords: sanitizeBusCoords(item.returnRoute?.destinationCoords),
    distanceKm: item.returnRoute?.distanceKm || '',
    durationHours: item.returnRoute?.durationHours || '',
    stops: Array.isArray(item.returnRoute?.stops)
      ? item.returnRoute.stops.map((stop, index) => normalizeBusStop(stop, index))
      : [],
  },
  schedules: Array.isArray(item.schedules)
    ? item.schedules.map((schedule, index) => normalizeBusSchedule(schedule, index))
    : [],
  capacity:
    item.capacity ||
    countSeatsInBlueprintDeck(item.blueprint?.lowerDeck || []) +
    countSeatsInBlueprintDeck(item.blueprint?.upperDeck || []),
  status: item.status || 'draft',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const syncBusDriverForBusService = async (busService, normalizedPayload = {}) => {
  const driverName = sanitizeBusText(normalizedPayload.driverName, busService.driverName || '');
  const driverPhone = sanitizeBusPhone(normalizedPayload.driverPhone || busService.driverPhone || '');
  const existingDriverId = toObjectId(busService.busDriverId);

  if (!driverName && !driverPhone) {
    if (existingDriverId) {
      await BusDriver.findByIdAndDelete(existingDriverId);
    }

    busService.driverName = '';
    busService.driverPhone = '';
    busService.busDriverId = null;
    return;
  }

  if (!driverName || !driverPhone) {
    throw new ApiError(400, 'Bus driver name and phone are both required');
  }

  const existingDriver =
    (existingDriverId && await BusDriver.findById(existingDriverId)) ||
    (await BusDriver.findOne({ phone: driverPhone }));

  const driver = existingDriver || new BusDriver();

  driver.name = driverName;
  driver.phone = driverPhone;
  driver.approve = true;
  driver.active = true;
  driver.status = 'approved';
  driver.assignedBusServiceId = busService._id;
  driver.operatorName = busService.operatorName || '';
  driver.busName = busService.busName || '';
  driver.serviceNumber = busService.serviceNumber || '';
  driver.registrationNumber = busService.registrationNumber || '';
  driver.routeName = busService.route?.routeName || '';
  driver.originCity = busService.route?.originCity || '';
  driver.destinationCity = busService.route?.destinationCity || '';
  await driver.save();

  busService.driverName = driver.name;
  busService.driverPhone = driver.phone;
  busService.busDriverId = driver._id;
};

const createRentalSeatCell = (rowNumber, seatCode, variant = 'seat') => ({
  kind: 'seat',
  id: `R${rowNumber}${seatCode}`,
  label: `${rowNumber}${seatCode}`,
  variant,
  status: 'available',
});

const createRentalAisleCell = () => ({
  kind: 'aisle',
  id: '',
  label: '',
  variant: 'seat',
  status: 'available',
});

const createRentalRowFromPattern = (rowNumber, pattern = []) =>
  pattern.map((cell) => {
    if (!cell || cell === 'aisle') {
      return createRentalAisleCell();
    }

    if (typeof cell === 'string') {
      return createRentalSeatCell(rowNumber, cell, 'seat');
    }

    return createRentalSeatCell(rowNumber, cell.code, cell.variant || 'seat');
  });

const buildRentalBlueprintTemplate = (templateKey = 'compact_4') => {
  switch (templateKey) {
    case 'bike_1':
      return {
        templateKey,
        lowerDeck: [createRentalRowFromPattern(1, ['A'])],
        upperDeck: [],
      };
    case 'auto_3':
      return {
        templateKey,
        lowerDeck: [
          createRentalRowFromPattern(1, ['A']),
          createRentalRowFromPattern(2, ['B', 'aisle', 'C']),
        ],
        upperDeck: [],
      };
    case 'suv_6':
      return {
        templateKey,
        lowerDeck: [
          createRentalRowFromPattern(1, ['A', 'aisle', 'B']),
          createRentalRowFromPattern(2, ['C', 'aisle', 'D']),
          createRentalRowFromPattern(3, ['E', 'aisle', 'F']),
        ],
        upperDeck: [],
      };
    case 'suv_7':
      return {
        templateKey,
        lowerDeck: [
          createRentalRowFromPattern(1, ['A', 'aisle', 'B']),
          createRentalRowFromPattern(2, ['C', 'D', 'E']),
          createRentalRowFromPattern(3, ['F', 'aisle', 'G']),
        ],
        upperDeck: [],
      };
    case 'van_8':
      return {
        templateKey,
        lowerDeck: [
          createRentalRowFromPattern(1, ['A', 'aisle', 'B']),
          createRentalRowFromPattern(2, ['C', 'D', 'E']),
          createRentalRowFromPattern(3, ['F', 'G', 'H']),
        ],
        upperDeck: [],
      };
    case 'compact_4':
    default:
      return {
        templateKey: 'compact_4',
        lowerDeck: [
          createRentalRowFromPattern(1, ['A', 'aisle', 'B']),
          createRentalRowFromPattern(2, ['C', 'aisle', 'D']),
        ],
        upperDeck: [],
      };
  }
};

const DEFAULT_RENTAL_PRICING = [
  { id: 'pkg-6h', label: '6 Hours', durationHours: 6, price: 799, includedKm: 60, extraHourPrice: 120, extraKmPrice: 12, active: true },
  { id: 'pkg-12h', label: '12 Hours', durationHours: 12, price: 1299, includedKm: 120, extraHourPrice: 110, extraKmPrice: 11, active: true },
  { id: 'pkg-24h', label: '24 Hours', durationHours: 24, price: 1999, includedKm: 240, extraHourPrice: 95, extraKmPrice: 10, active: true },
];

const normalizeRentalPricingItem = (item = {}, index = 0) => ({
  id: sanitizeBusText(item.id, `pkg-${index + 1}`),
  label: sanitizeBusText(item.label, `${Number(item.durationHours || 0) || index + 1} Hours`),
  durationHours: Math.max(1, sanitizeBusSeatPrice(item.durationHours, index + 1)),
  price: Math.max(0, sanitizeBusSeatPrice(item.price, 0)),
  includedKm: Math.max(0, sanitizeBusSeatPrice(item.includedKm, 0)),
  extraHourPrice: Math.max(0, sanitizeBusSeatPrice(item.extraHourPrice, 0)),
  extraKmPrice: Math.max(0, sanitizeBusSeatPrice(item.extraKmPrice, 0)),
  active: item.active === undefined ? true : normalizeBoolean(item.active),
});

const normalizeRentalAdvancePayment = (value = {}, existing = {}) => {
  const paymentMode = ['full', 'percentage', 'fixed'].includes(value?.paymentMode)
    ? value.paymentMode
    : ['full', 'percentage', 'fixed'].includes(existing?.paymentMode)
      ? existing.paymentMode
      : 'percentage';

  return {
    enabled: normalizeBoolean(value?.enabled ?? existing?.enabled ?? false),
    paymentMode,
    amount: Math.max(
      0,
      sanitizeBusSeatPrice(
        value?.amount,
        existing?.amount ?? (paymentMode === 'full' ? 100 : 20),
      ),
    ),
    label: sanitizeBusText(
      value?.label,
      existing?.label || 'Advance booking payment',
    ),
    notes: sanitizeBusText(value?.notes, existing?.notes || ''),
  };
};

const normalizeRentalVehiclePayload = (payload = {}, existing = {}) => {
  const fallbackBlueprint = existing.blueprint?.lowerDeck?.length
    ? {
      templateKey: existing.blueprint?.templateKey || 'compact_4',
      lowerDeck: normalizeBusDeck(existing.blueprint?.lowerDeck || []),
      upperDeck: normalizeBusDeck(existing.blueprint?.upperDeck || []),
    }
    : buildRentalBlueprintTemplate(payload.blueprint?.templateKey || existing.blueprint?.templateKey || 'compact_4');

  const blueprint = payload.blueprint
    ? {
      templateKey: sanitizeBusText(payload.blueprint?.templateKey, fallbackBlueprint.templateKey || 'compact_4'),
      lowerDeck: normalizeBusDeck(payload.blueprint?.lowerDeck ?? fallbackBlueprint.lowerDeck ?? []),
      upperDeck: normalizeBusDeck(payload.blueprint?.upperDeck ?? fallbackBlueprint.upperDeck ?? []),
    }
    : fallbackBlueprint;

  const capacityFromBlueprint =
    countSeatsInBlueprintDeck(blueprint.lowerDeck) + countSeatsInBlueprintDeck(blueprint.upperDeck);

  return {
    transport_type: sanitizeBusText(payload.transport_type, existing.transport_type || 'rental') || 'rental',
    name: sanitizeBusText(payload.name, existing.name || ''),
    short_description: sanitizeBusText(payload.short_description, existing.short_description || ''),
    description: sanitizeBusText(payload.description, existing.description || ''),
    vehicleCategory: sanitizeBusText(payload.vehicleCategory, existing.vehicleCategory || 'Car'),
    image: sanitizeBusText(payload.image, existing.image || ''),
    coverImage: sanitizeBusText(
      payload.coverImage,
      payload.image || existing.coverImage || existing.image || '',
    ),
    galleryImages: Array.isArray(payload.galleryImages)
      ? payload.galleryImages.map((item) => sanitizeBusText(item)).filter(Boolean)
      : Array.isArray(existing.galleryImages)
        ? existing.galleryImages.map((item) => sanitizeBusText(item)).filter(Boolean)
        : [],
    map_icon: sanitizeBusText(payload.map_icon, existing.map_icon || ''),
    capacity:
      payload.capacity !== undefined
        ? Math.max(1, sanitizeBusSeatPrice(payload.capacity, capacityFromBlueprint || 1))
        : Math.max(1, capacityFromBlueprint || sanitizeBusSeatPrice(existing.capacity, 4)),
    luggageCapacity: Math.max(0, sanitizeBusSeatPrice(payload.luggageCapacity, existing.luggageCapacity || 0)),
    amenities: Array.isArray(payload.amenities)
      ? payload.amenities.map((item) => sanitizeBusText(item)).filter(Boolean)
      : Array.isArray(existing.amenities)
        ? existing.amenities
        : [],
    serviceStoreIds: Array.isArray(payload.serviceStoreIds)
      ? payload.serviceStoreIds.map((item) => String(item || '').trim()).filter(Boolean)
      : Array.isArray(existing.serviceStoreIds)
        ? existing.serviceStoreIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    poolingEnabled: normalizeBoolean(payload.poolingEnabled ?? existing.poolingEnabled ?? false),
    blueprint,
    pricing: Array.isArray(payload.pricing) && payload.pricing.length
      ? payload.pricing.map((item, index) => normalizeRentalPricingItem(item, index))
      : Array.isArray(existing.pricing) && existing.pricing.length
        ? existing.pricing.map((item, index) => normalizeRentalPricingItem(item, index))
        : DEFAULT_RENTAL_PRICING.map((item, index) => normalizeRentalPricingItem(item, index)),
    advancePayment: normalizeRentalAdvancePayment(
      payload.advancePayment,
      existing.advancePayment,
    ),
    status: payload.status
      ? (payload.status === 'inactive' ? 'inactive' : 'active')
      : normalizeBoolean(payload.active ?? existing.active ?? true)
        ? 'active'
        : 'inactive',
    active: normalizeBoolean(payload.active ?? existing.active ?? true),
  };
};

const sanitizePoolingText = (value = '', fallback = '') =>
  String(value ?? fallback).trim();

const sanitizePoolingNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePoolingStop = (stop = {}, index = 0, defaultType = 'stop') => ({
  id: sanitizePoolingText(stop.id, `pool-stop-${Date.now()}-${index}`),
  name: sanitizePoolingText(stop.name),
  address: sanitizePoolingText(stop.address),
  landmark: sanitizePoolingText(stop.landmark),
  stopType: ['pickup', 'drop', 'both', 'stop'].includes(stop.stopType)
    ? stop.stopType
    : defaultType,
  sequence: Math.max(1, sanitizePoolingNumber(stop.sequence, index + 1)),
  etaMinutes: Math.max(0, sanitizePoolingNumber(stop.etaMinutes, 0)),
  latitude:
    stop.latitude === '' || stop.latitude === null || stop.latitude === undefined
      ? null
      : sanitizePoolingNumber(stop.latitude, null),
  longitude:
    stop.longitude === '' || stop.longitude === null || stop.longitude === undefined
      ? null
      : sanitizePoolingNumber(stop.longitude, null),
});

const normalizePoolingSchedule = (schedule = {}, index = 0) => ({
  id: sanitizePoolingText(schedule.id, `pool-schedule-${Date.now()}-${index}`),
  label: sanitizePoolingText(schedule.label, `Trip ${index + 1}`),
  departureTime: sanitizePoolingText(schedule.departureTime),
  arrivalTime: sanitizePoolingText(schedule.arrivalTime),
  activeDays: Array.isArray(schedule.activeDays)
    ? schedule.activeDays.filter((day) => BUS_DAY_OPTIONS.includes(day))
    : [],
  status: ['active', 'paused', 'draft'].includes(schedule.status)
    ? schedule.status
    : 'active',
});

const normalizePoolingPayload = (payload = {}, existing = {}) => ({
  routeName: sanitizePoolingText(payload.routeName, existing.routeName || ''),
  routeCode: sanitizePoolingText(payload.routeCode, existing.routeCode || ''),
  originLabel: sanitizePoolingText(payload.originLabel, existing.originLabel || ''),
  destinationLabel: sanitizePoolingText(payload.destinationLabel, existing.destinationLabel || ''),
  description: sanitizePoolingText(payload.description, existing.description || ''),
  assignedVehicleTypeIds: Array.isArray(payload.assignedVehicleTypeIds)
    ? payload.assignedVehicleTypeIds
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    : Array.isArray(existing.assignedVehicleTypeIds)
      ? existing.assignedVehicleTypeIds.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  pickupPoints: Array.isArray(payload.pickupPoints)
    ? payload.pickupPoints.map((item, index) => normalizePoolingStop(item, index, 'pickup'))
    : Array.isArray(existing.pickupPoints)
      ? existing.pickupPoints.map((item, index) => normalizePoolingStop(item, index, 'pickup'))
      : [],
  dropPoints: Array.isArray(payload.dropPoints)
    ? payload.dropPoints.map((item, index) => normalizePoolingStop(item, index, 'drop'))
    : Array.isArray(existing.dropPoints)
      ? existing.dropPoints.map((item, index) => normalizePoolingStop(item, index, 'drop'))
      : [],
  stops: Array.isArray(payload.stops)
    ? payload.stops.map((item, index) => normalizePoolingStop(item, index, 'stop'))
    : Array.isArray(existing.stops)
      ? existing.stops.map((item, index) => normalizePoolingStop(item, index, 'stop'))
      : [],
  schedules: Array.isArray(payload.schedules)
    ? payload.schedules.map((item, index) => normalizePoolingSchedule(item, index))
    : Array.isArray(existing.schedules)
      ? existing.schedules.map((item, index) => normalizePoolingSchedule(item, index))
      : [],
  farePerSeat: Math.max(0, sanitizePoolingNumber(payload.farePerSeat, existing.farePerSeat || 0)),
  maxSeatsPerBooking: Math.max(
    1,
    sanitizePoolingNumber(payload.maxSeatsPerBooking, existing.maxSeatsPerBooking || 1),
  ),
  maxAdvanceBookingHours: Math.max(
    0,
    sanitizePoolingNumber(
      payload.maxAdvanceBookingHours,
      existing.maxAdvanceBookingHours || 24,
    ),
  ),
  boardingBufferMinutes: Math.max(
    0,
    sanitizePoolingNumber(
      payload.boardingBufferMinutes,
      existing.boardingBufferMinutes || 15,
    ),
  ),
  poolingRules: {
    allowInstantBooking: normalizeBoolean(
      payload.poolingRules?.allowInstantBooking ??
      existing.poolingRules?.allowInstantBooking ??
      true,
    ),
    allowLuggage: normalizeBoolean(
      payload.poolingRules?.allowLuggage ?? existing.poolingRules?.allowLuggage ?? true,
    ),
    womenOnly: normalizeBoolean(
      payload.poolingRules?.womenOnly ?? existing.poolingRules?.womenOnly ?? false,
    ),
    autoAssignNearestPickup: normalizeBoolean(
      payload.poolingRules?.autoAssignNearestPickup ??
      existing.poolingRules?.autoAssignNearestPickup ??
      true,
    ),
    maxDetourKm: Math.max(
      0,
      sanitizePoolingNumber(
        payload.poolingRules?.maxDetourKm,
        existing.poolingRules?.maxDetourKm || 5,
      ),
    ),
  },
  status: ['draft', 'active', 'paused'].includes(payload.status)
    ? payload.status
    : existing.status || 'draft',
  active: normalizeBoolean(
    payload.active ?? existing.active ?? (payload.status ? payload.status !== 'draft' : true),
  ),
});

const serializeRentalVehicleType = (item = {}) => ({
  id: String(item._id || item.id || ''),
  _id: item._id,
  transport_type: item.transport_type || 'rental',
  name: item.name || '',
  short_description: item.short_description || '',
  description: item.description || '',
  vehicleCategory: item.vehicleCategory || 'Car',
  image: item.image || '',
  coverImage: item.coverImage || item.image || '',
  galleryImages: Array.isArray(item.galleryImages) ? item.galleryImages.filter(Boolean) : [],
  map_icon: item.map_icon || '',
  capacity: Math.max(
    1,
    item.capacity ||
    countSeatsInBlueprintDeck(item.blueprint?.lowerDeck || []) +
    countSeatsInBlueprintDeck(item.blueprint?.upperDeck || []),
  ),
  luggageCapacity: sanitizeBusSeatPrice(item.luggageCapacity, 0),
  amenities: Array.isArray(item.amenities) ? item.amenities : [],
  serviceStoreIds: Array.isArray(item.serviceStoreIds)
    ? item.serviceStoreIds.map((storeId) => String(storeId))
    : [],
  poolingEnabled: Boolean(item.poolingEnabled),
  advancePayment: normalizeRentalAdvancePayment(item.advancePayment),
  blueprint: {
    templateKey: item.blueprint?.templateKey || 'compact_4',
    lowerDeck: normalizeBusDeck(item.blueprint?.lowerDeck || []),
    upperDeck: normalizeBusDeck(item.blueprint?.upperDeck || []),
  },
  pricing: Array.isArray(item.pricing)
    ? item.pricing.map((price, index) => normalizeRentalPricingItem(price, index))
    : DEFAULT_RENTAL_PRICING.map((price, index) => normalizeRentalPricingItem(price, index)),
  status: item.status || 'active',
  active: item.active !== false && item.status !== 'inactive',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializePoolingRoute = (item = {}, vehicleMap = new Map()) => {
  const assignedVehicleIds = Array.isArray(item.assignedVehicleTypeIds)
    ? item.assignedVehicleTypeIds.map((value) => String(value))
    : [];

  const assignedVehicles = assignedVehicleIds
    .map((id) => vehicleMap.get(id))
    .filter(Boolean)
    .map((vehicle) => ({
      id: String(vehicle._id || vehicle.id || ''),
      name: vehicle.name || '',
      vehicleCategory: vehicle.vehicleCategory || 'Car',
      capacity: Number(vehicle.capacity || 0),
      luggageCapacity: Number(vehicle.luggageCapacity || 0),
      image: vehicle.image || '',
      poolingEnabled: Boolean(vehicle.poolingEnabled),
      blueprint: {
        templateKey: vehicle.blueprint?.templateKey || 'compact_4',
        lowerDeck: normalizeBusDeck(vehicle.blueprint?.lowerDeck || []),
        upperDeck: normalizeBusDeck(vehicle.blueprint?.upperDeck || []),
      },
    }));

  return {
    id: String(item._id || item.id || ''),
    _id: item._id,
    routeName: item.routeName || '',
    routeCode: item.routeCode || '',
    originLabel: item.originLabel || '',
    destinationLabel: item.destinationLabel || '',
    description: item.description || '',
    assignedVehicleTypeIds: assignedVehicleIds,
    assignedVehicles,
    pickupPoints: Array.isArray(item.pickupPoints)
      ? item.pickupPoints.map((stop, index) => normalizePoolingStop(stop, index, 'pickup'))
      : [],
    dropPoints: Array.isArray(item.dropPoints)
      ? item.dropPoints.map((stop, index) => normalizePoolingStop(stop, index, 'drop'))
      : [],
    stops: Array.isArray(item.stops)
      ? item.stops.map((stop, index) => normalizePoolingStop(stop, index, 'stop'))
      : [],
    schedules: Array.isArray(item.schedules)
      ? item.schedules.map((schedule, index) => normalizePoolingSchedule(schedule, index))
      : [],
    farePerSeat: Number(item.farePerSeat || 0),
    maxSeatsPerBooking: Number(item.maxSeatsPerBooking || 1),
    maxAdvanceBookingHours: Number(item.maxAdvanceBookingHours || 24),
    boardingBufferMinutes: Number(item.boardingBufferMinutes || 15),
    poolingRules: {
      allowInstantBooking: Boolean(item.poolingRules?.allowInstantBooking),
      allowLuggage: Boolean(item.poolingRules?.allowLuggage),
      womenOnly: Boolean(item.poolingRules?.womenOnly),
      autoAssignNearestPickup: Boolean(item.poolingRules?.autoAssignNearestPickup),
      maxDetourKm: Number(item.poolingRules?.maxDetourKm || 0),
    },
    activeVehicleCount: assignedVehicles.length,
    status: item.status || 'draft',
    active: item.active !== false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const serializeRentalQuoteRequest = (item = {}) => ({
  id: String(item._id || item.id || ''),
  _id: item._id,
  userId: item.userId
    ? {
      id: String(item.userId?._id || item.userId),
      name: item.userId?.name || '',
      phone: item.userId?.phone || '',
      email: item.userId?.email || '',
    }
    : null,
  vehicleTypeId: item.vehicleTypeId
    ? {
      id: String(item.vehicleTypeId?._id || item.vehicleTypeId),
      name: item.vehicleTypeId?.name || item.vehicleName || '',
      vehicleCategory: item.vehicleTypeId?.vehicleCategory || item.vehicleCategory || '',
      image: item.vehicleTypeId?.image || '',
    }
    : null,
  vehicleName: item.vehicleName || item.vehicleTypeId?.name || '',
  vehicleCategory: item.vehicleCategory || item.vehicleTypeId?.vehicleCategory || '',
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
  reviewedAt: item.reviewedAt || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
  rentalTracking: buildRentalTrackingSnapshot(item),
});

const serializeRentalBookingRequest = (item = {}) => ({
  id: String(item._id || item.id || ''),
  _id: item._id,
  bookingReference: item.bookingReference || '',
  userId: item.userId
    ? {
      id: String(item.userId?._id || item.userId),
      name: item.userId?.name || item.contactName || '',
      phone: item.userId?.phone || item.contactPhone || '',
      email: item.userId?.email || item.contactEmail || '',
    }
    : null,
  vehicleTypeId: item.vehicleTypeId
    ? {
      id: String(item.vehicleTypeId?._id || item.vehicleTypeId),
      name: item.vehicleTypeId?.name || item.vehicleName || '',
      vehicleCategory: item.vehicleTypeId?.vehicleCategory || item.vehicleCategory || '',
      image: item.vehicleTypeId?.image || item.vehicleImage || '',
    }
    : null,
  vehicleName: item.vehicleName || item.vehicleTypeId?.name || '',
  vehicleCategory: item.vehicleCategory || item.vehicleTypeId?.vehicleCategory || '',
  vehicleImage: item.vehicleImage || item.vehicleTypeId?.image || '',
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
  assignedVehicle: {
    vehicleId: item.assignedVehicle?.vehicleId ? String(item.assignedVehicle.vehicleId) : '',
    name: item.assignedVehicle?.name || '',
    vehicleCategory: item.assignedVehicle?.vehicleCategory || '',
    image: item.assignedVehicle?.image || '',
  },
  serviceCenterIds: Array.isArray(item.serviceCenterIds)
    ? item.serviceCenterIds.map((centerId) => String(centerId))
    : [],
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
  assignedStaff: {
    id: item.assignedStaffId ? String(item.assignedStaffId) : '',
    name: item.assignedStaffName || '',
    phone: item.assignedStaffPhone || '',
  },
  serviceCenterNote: item.serviceCenterNote || '',
  status: item.status || 'pending',
  assignedAt: item.assignedAt || null,
  completionRequestedAt: item.completionRequestedAt || null,
  completedAt: item.completedAt || null,
  finalCharge: Number(item.finalCharge || 0),
  finalElapsedMinutes: Number(item.finalElapsedMinutes || 0),
  cancelledAt: item.cancelledAt || null,
  cancelReason: item.cancelReason || '',
  adminNote: item.adminNote || '',
  reviewedAt: item.reviewedAt || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
});

const normalizeRentalCommissionRule = (rule = {}, fallbackType = 'percentage') => ({
  type: rule?.type === 'fixed' ? 'fixed' : fallbackType,
  value: Math.max(0, Number(rule?.value || 0)),
});

const computeRentalCommissionBreakdown = (snapshot = {}, grossAmount = 0) => {
  const baseAmount = Math.max(0, Number(grossAmount || 0));
  const serviceStoreRule = normalizeRentalCommissionRule(
    {
      type: snapshot?.serviceStoreCommissionType,
      value: snapshot?.serviceStoreCommissionValue,
    },
    'percentage',
  );
  const ownerRule = normalizeRentalCommissionRule(
    {
      type: snapshot?.ownerCommissionType,
      value: snapshot?.ownerCommissionValue,
    },
    'percentage',
  );

  const calculateAmount = (amount, rule) => {
    if (rule.type === 'fixed') {
      return Math.min(amount, Math.max(0, Number(rule.value || 0)));
    }

    return Math.min(amount, Math.max(0, (amount * Number(rule.value || 0)) / 100));
  };

  const serviceStoreAmountRaw = calculateAmount(baseAmount, serviceStoreRule);
  const remainingAfterStore = Math.max(0, baseAmount - serviceStoreAmountRaw);
  const ownerAmountRaw = calculateAmount(remainingAfterStore, ownerRule);
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
      type: serviceStoreRule.type,
      value: round(serviceStoreRule.value),
      amount: round(serviceStoreAmountRaw),
    },
    owner: {
      name: snapshot?.ownerName || '',
      type: ownerRule.type,
      value: round(ownerRule.value),
      amount: round(ownerAmountRaw),
    },
    admin: {
      amount: round(adminAmountRaw),
    },
  };
};

const normalizeEmployeePhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '').trim();
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const normalizeEmployeeCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase();

const serializeEmployee = (employee, stats = {}) => {
  const totalUsers = Number(stats.totalUsers || 0);
  const totalDrivers = Number(stats.totalDrivers || 0);

  return {
    _id: employee._id,
    id: employee._id,
    name: employee.name || '',
    phone: employee.phone || '',
    employeeCode: employee.employeeCode || '',
    active: employee.active !== false,
    notes: employee.notes || '',
    totalUsersAcquired: totalUsers,
    totalDriversAcquired: totalDrivers,
    totalAcquired: totalUsers + totalDrivers,
    createdAt: employee.createdAt || null,
    updatedAt: employee.updatedAt || null,
  };
};

const normalizeDeliveryServiceTax = (value, fallback = 0) =>
  Math.max(0, Number(value ?? fallback ?? 0));

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_USER_GENDERS = new Set(['male', 'female', 'other', 'prefer-not-to-say']);


const findById = (items, id) => items.find((item) => String(item._id) === String(id));

const removeById = (items, id) => items.filter((item) => String(item._id) !== String(id));

const moveItemById = (items, id) => {
  const index = items.findIndex((item) => String(item._id) === String(id));

  if (index === -1) {
    return { item: null, rest: items };
  }

  return {
    item: items[index],
    rest: [...items.slice(0, index), ...items.slice(index + 1)],
  };
};

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const remainingDue = Math.max(
    0,
    Math.round((currentCharge - Number(item.payableNow || 0) + Number.EPSILON) * 100) / 100,
  );

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

const normalizeZoneCoordinates = (coordinates = []) => {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    throw new ApiError(400, 'Zone polygon requires at least 3 points');
  }

  const ring = coordinates
    .map((point) => {
      const lat = Number(point?.lat);
      const lng = Number(point?.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ApiError(400, 'Zone polygon contains invalid coordinates');
      }

      return [lng, lat];
    });

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];

  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring.push([firstLng, firstLat]);
  }

  return ring;
};

const normalizeZoneCircleCenter = (payload = {}) => {
  const lat = Number(payload?.lat);
  const lng = Number(payload?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(400, 'Zone circle center contains invalid coordinates');
  }

  return { lat, lng };
};

const normalizeZoneCircleRadius = (radius) => {
  const parsed = Number(radius);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, 'Zone circle radius must be greater than 0');
  }

  return parsed;
};

const buildCirclePolygonRing = (center, radiusMeters, segments = 36) => {
  const earthRadiusMeters = 6378137;
  const latRadians = (Number(center.lat) * Math.PI) / 180;
  const lngRadians = (Number(center.lng) * Math.PI) / 180;
  const angularDistance = Number(radiusMeters) / earthRadiusMeters;
  const ring = [];

  for (let index = 0; index < segments; index += 1) {
    const bearing = (2 * Math.PI * index) / segments;
    const sinLat = Math.sin(latRadians);
    const cosLat = Math.cos(latRadians);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);
    const sinBearing = Math.sin(bearing);
    const cosBearing = Math.cos(bearing);

    const pointLat = Math.asin(
      sinLat * cosAngular + cosLat * sinAngular * cosBearing,
    );
    const pointLng =
      lngRadians +
      Math.atan2(
        sinBearing * sinAngular * cosLat,
        cosAngular - sinLat * Math.sin(pointLat),
      );

    ring.push([
      Number((((pointLng * 180) / Math.PI + 540) % 360) - 180),
      Number((pointLat * 180) / Math.PI),
    ]);
  }

  if (ring.length > 0) {
    ring.push([...ring[0]]);
  }

  return ring;
};

const normalizeZoneGeometryPayload = (payload = {}, existing = {}) => {
  const boundaryMode = String(
    payload.boundary_mode || existing.boundary_mode || 'polygon',
  ).toLowerCase() === 'circle'
    ? 'circle'
    : 'polygon';

  if (boundaryMode === 'circle') {
    const center = normalizeZoneCircleCenter(payload.circle_center || existing.circle_center || {});
    const radiusMeters = normalizeZoneCircleRadius(
      payload.circle_radius_meters ?? existing.circle_radius_meters,
    );

    return {
      boundary_mode: 'circle',
      circle_center: center,
      circle_radius_meters: radiusMeters,
      geometry: {
        type: 'Polygon',
        coordinates: [buildCirclePolygonRing(center, radiusMeters)],
      },
    };
  }

  return {
    boundary_mode: 'polygon',
    circle_center: {
      lat: null,
      lng: null,
    },
    circle_radius_meters: null,
    geometry: {
      type: 'Polygon',
      coordinates: [normalizeZoneCoordinates(payload.coordinates)],
    },
  };
};

const normalizeAirportBoundary = (coordinates = []) => normalizeZoneCoordinates(coordinates);

const normalizePointLocationPayload = (payload = {}, fallback = {}) => {
  const latitude = Number(payload.latitude ?? payload.lat ?? fallback.latitude);
  const longitude = Number(payload.longitude ?? payload.lng ?? fallback.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError(400, 'A valid store location pin is required');
  }

  return {
    latitude,
    longitude,
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
  };
};

const serializeZone = (zone) => ({
  _id: zone._id,
  id: zone._id,
  name: zone.name || '',
  service_location_id: zone.service_location_id?._id || zone.service_location_id || '',
  unit: zone.unit || 'km',
  peak_zone_ride_count: zone.peak_zone_ride_count,
  peak_zone_radius: zone.peak_zone_radius,
  peak_zone_selection_duration: zone.peak_zone_selection_duration,
  peak_zone_duration: zone.peak_zone_duration,
  peak_zone_surge_percentage: zone.peak_zone_surge_percentage,
  maximum_distance_for_regular_rides: zone.maximum_distance_for_regular_rides,
  maximum_distance_for_outstation_rides: zone.maximum_distance_for_outstation_rides,
  active: zone.active !== false,
  status: zone.status || (zone.active === false ? 'inactive' : 'active'),
  boundary_mode: zone.boundary_mode || 'polygon',
  circle_center:
    Number.isFinite(Number(zone.circle_center?.lat)) && Number.isFinite(Number(zone.circle_center?.lng))
      ? {
        lat: Number(zone.circle_center.lat),
        lng: Number(zone.circle_center.lng),
      }
      : null,
  circle_radius_meters: Number.isFinite(Number(zone.circle_radius_meters))
    ? Number(zone.circle_radius_meters)
    : null,
  coordinates: Array.isArray(zone.geometry?.coordinates?.[0])
    ? zone.geometry.coordinates[0].map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    : [],
  createdAt: zone.createdAt,
  updatedAt: zone.updatedAt,
});

const serializeServiceStore = (store) => ({
  _id: store._id,
  id: store._id,
  name: store.name || '',
  address: store.address || '',
  owner_name: store.owner_name || '',
  owner_phone: store.owner_phone || '',
  zone_id: store.zone_id
    ? {
      _id: store.zone_id._id || store.zone_id,
      name: store.zone_id.name || '',
      service_location_id:
        store.zone_id.service_location_id?._id || store.zone_id.service_location_id || '',
    }
    : null,
  service_location_id: store.service_location_id
    ? {
      _id: store.service_location_id._id || store.service_location_id,
      name: store.service_location_id.service_location_name || store.service_location_id.name || '',
      country: store.service_location_id.country || '',
    }
    : null,
  latitude:
    Number(store.latitude ?? store.location?.coordinates?.[1] ?? null),
  longitude:
    Number(store.longitude ?? store.location?.coordinates?.[0] ?? null),
  rentalCommission: {
    serviceStore: {
      type: store.rentalCommission?.serviceStore?.type === 'fixed' ? 'fixed' : 'percentage',
      value: Number(store.rentalCommission?.serviceStore?.value || 0),
    },
    owner: {
      type: store.rentalCommission?.owner?.type === 'fixed' ? 'fixed' : 'percentage',
      value: Number(store.rentalCommission?.owner?.value || 0),
    },
    serviceTaxPercentage: Math.max(0, Number(store.rentalCommission?.serviceTaxPercentage || 0)),
  },
  approve: store.approve !== false,
  rejectionReason: store.rejectionReason || '',
  signupSource: store.signupSource || 'admin',
  onboarding: store.onboarding || null,
  status: store.status || (store.active === false ? 'inactive' : 'active'),
  active: store.active !== false,
  staff: Array.isArray(store.staff)
    ? store.staff.map((member) => ({
      _id: member._id,
      id: member._id,
      name: member.name || '',
      phone: member.phone || '',
      active: member.active !== false,
      approve: member.approve !== false,
      rejectionReason: member.rejectionReason || '',
      signupSource: member.signupSource || 'admin',
      onboarding: member.onboarding || null,
      status: member.status || (member.active === false ? 'inactive' : 'active'),
      createdAt: member.createdAt || null,
      updatedAt: member.updatedAt || null,
    }))
    : [],
  createdAt: store.createdAt,
  updatedAt: store.updatedAt,
});

const normalizeServiceStoreRentalCommission = (value = {}, existing = {}) => ({
  serviceStore: {
    type: value?.serviceStore?.type === 'fixed'
      ? 'fixed'
      : existing?.serviceStore?.type === 'fixed'
        ? 'fixed'
        : 'percentage',
    value: Math.max(
      0,
      Number(
        value?.serviceStore?.value ??
        existing?.serviceStore?.value ??
        0,
      ),
    ),
  },
  owner: {
    type: value?.owner?.type === 'fixed'
      ? 'fixed'
      : existing?.owner?.type === 'fixed'
        ? 'fixed'
        : 'percentage',
    value: Math.max(
      0,
      Number(
        value?.owner?.value ??
        existing?.owner?.value ??
        0,
      ),
    ),
  },
  serviceTaxPercentage: Math.max(
    0,
    Number(
      value?.serviceTaxPercentage ??
      existing?.serviceTaxPercentage ??
      0,
    ),
  ),
});

const serializeSetPrice = (item) => ({
  _id: item._id,
  id: item._id,
  zone_id: item.zone_id
    ? {
      _id: item.zone_id._id || item.zone_id,
      name: item.zone_id.name || '',
    }
    : null,
  service_location_id: item.service_location_id
    ? {
      _id: item.service_location_id._id || item.service_location_id,
      name: item.service_location_id.service_location_name || item.service_location_id.name || '',
    }
    : null,
  transport_type: item.transport_type || '',
  vehicle_type: item.vehicle_type
    ? {
      _id: item.vehicle_type._id || item.vehicle_type,
      name: item.vehicle_type.name || '',
      icon: item.vehicle_type.icon || '',
    }
    : null,
  vehicle_name: item.vehicle_type?.name || '',
  icon: item.vehicle_type?.icon || item.icon || '',
  app_modules: item.app_modules ?? '',
  vehicle_preference: item.vehicle_preference ?? '',
  payment_type: Array.isArray(item.payment_type) ? item.payment_type : (typeof item.payment_type === 'string' ? item.payment_type.split(',') : []),

  // Commissions
  customer_commission_type: item.customer_commission_type || 'percentage',
  customer_commission: item.customer_commission,
  admin_commision_type: item.admin_commision_type ?? (item.customer_commission_type === 'percentage' ? 1 : 0),
  admin_commision: item.admin_commision ?? item.customer_commission,

  driver_commission_type: item.driver_commission_type || 'percentage',
  driver_commission: item.driver_commission,
  admin_commission_type_from_driver: item.admin_commission_type_from_driver ?? (item.driver_commission_type === 'percentage' ? 1 : 0),
  admin_commission_from_driver: item.admin_commission_from_driver ?? item.driver_commission,

  owner_commission_type: item.owner_commission_type || 'percentage',
  owner_commission: item.owner_commission,
  admin_commission_type_for_owner: item.admin_commission_type_for_owner ?? (item.owner_commission_type === 'percentage' ? 1 : 0),
  admin_commission_for_owner: item.admin_commission_for_owner ?? item.owner_commission,

  service_tax: item.service_tax,
  eta_sequence: item.eta_sequence,
  order_number: item.order_number ?? item.eta_sequence ?? 1,

  // Core Pricing
  base_price: item.base_price,
  base_distance: item.base_distance,
  price_per_distance: item.price_per_distance,
  time_price: item.time_price,
  waiting_charge: item.waiting_charge,
  outstation_base_price: item.outstation_base_price ?? 0,
  outstation_base_distance: item.outstation_base_distance ?? 0,
  outstation_price_per_distance: item.outstation_price_per_distance ?? 0,
  outstation_time_price: item.outstation_time_price ?? 0,
  free_waiting_before: item.free_waiting_before,
  free_waiting_after: item.free_waiting_after,

  // Settings
  enable_airport_ride: Boolean(item.enable_airport_ride),
  enable_outstation_ride: Boolean(item.enable_outstation_ride),
  support_airport_fee: item.support_airport_fee ?? (item.enable_airport_ride ? 1 : 0),
  support_outstation: item.support_outstation ?? (item.enable_outstation_ride ? 1 : 0),

  // Cancellation
  user_cancellation_fee_type: item.user_cancellation_fee_type || 'percentage',
  user_cancellation_fee: item.user_cancellation_fee,
  driver_cancellation_fee_type: item.driver_cancellation_fee_type || 'percentage',
  driver_cancellation_fee: item.driver_cancellation_fee,
  cancellation_fee_goes_to: item.cancellation_fee_goes_to || 'admin',

  // Ride Sharing
  enable_ride_sharing: Boolean(item.enable_ride_sharing),
  enable_shared_ride: item.enable_shared_ride ?? (item.enable_ride_sharing ? 1 : 0),
  price_per_seat: item.price_per_seat,
  shared_price_per_distance: item.shared_price_per_distance,
  shared_cancel_fee: item.shared_cancel_fee,

  status: item.status || (item.active === false ? 'inactive' : 'active'),
  active: item.active !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeGoodsType = (item) => ({
  _id: item._id,
  id: item.external_id || item.id || 1,
  name: item.goods_type_name || item.name || '',
  goods_type_name: item.goods_type_name || item.name || '',
  translation_dataset: item.translation_dataset || '',
  goods_types_for: item.goods_types_for || 'both',
  company_key: item.company_key || null,
  active: item.active !== undefined ? Number(item.active) : 1,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
  goods_type_translation_words: item.goods_type_translation_words || [],
});

const serializeRentalPackageType = (item) => ({
  _id: item._id,
  id: item._id,
  transport_type: item.transport_type || 'taxi',
  name: item.name || '',
  short_description: item.short_description || '',
  description: item.description || '',
  status: item.status || (item.active === false ? 'inactive' : 'active'),
  active: item.active !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const normalizePackageVehiclePriceItem = (item = {}) => ({
  vehicle_type: toObjectId(item.vehicle_type?._id || item.vehicle_type?.id || item.vehicle_type || item.type_id),
  base_price: Number(item.base_price ?? 0),
  free_distance: Number(item.free_distance ?? item.base_distance ?? 0),
  distance_price: Number(item.distance_price ?? item.price_per_distance ?? 0),
  free_time: Number(item.free_time ?? 0),
  time_price: Number(item.time_price ?? 0),
  admin_commision_type: Number(item.admin_commision_type ?? 1),
  admin_commision: Number(item.admin_commision ?? 0),
  admin_commission_type_from_driver: Number(item.admin_commission_type_from_driver ?? 1),
  admin_commission_from_driver: Number(item.admin_commission_from_driver ?? 0),
  admin_commission_type_for_owner: Number(item.admin_commission_type_for_owner ?? 1),
  admin_commission_for_owner: Number(item.admin_commission_for_owner ?? 0),
  service_tax: Number(item.service_tax ?? 0),
  cancellation_fee: Number(item.cancellation_fee ?? item.user_cancellation_fee ?? 0),
  active: Number(item.active ?? 1),
});

const serializeOwnerNeededDocument = (item) => ({
  _id: item._id,
  id: item._id,
  name: item.name || '',
  image_type: item.image_type || 'front_back',
  has_expiry_date: Boolean(item.has_expiry_date),
  has_identify_number: Boolean(item.has_identify_number),
  is_editable: Boolean(item.is_editable),
  is_required: Boolean(item.is_required),
  active: item.active !== false,
  status: item.active === false ? 'inactive' : 'active',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const slugifyOwnerDocumentName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'owner_document';

const buildOwnerDocumentFields = (item) => {
  const baseKey = `${slugifyOwnerDocumentName(item.name)}_${String(item._id || '').replace(/[^a-zA-Z0-9]/g, '')}`;

  if (item.image_type === 'front_back') {
    return [
      {
        key: `${baseKey}_front`,
        label: `${item.name} Front`,
        side: 'front',
        required: item.is_required !== false,
      },
      {
        key: `${baseKey}_back`,
        label: `${item.name} Back`,
        side: 'back',
        required: item.is_required !== false,
      },
    ];
  }

  return [
    {
      key: baseKey,
      label:
        item.image_type === 'front'
          ? `${item.name} Front`
          : item.image_type === 'back'
            ? `${item.name} Back`
            : item.name,
      side: item.image_type === 'front' ? 'front' : item.image_type === 'back' ? 'back' : 'single',
      required: item.is_required !== false,
    },
  ];
};

const serializeOwnerNeededDocumentTemplate = (item) => ({
  ...serializeOwnerNeededDocument(item),
  fields: buildOwnerDocumentFields(item),
});

const buildDriverDocumentFields = (item) => {
  if (item.image_type === 'front_back') {
    return [
      {
        key: item.front_key,
        label: `${item.name} Front`,
        side: 'front',
        required: item.is_required !== false,
      },
      {
        key: item.back_key,
        label: `${item.name} Back`,
        side: 'back',
        required: item.is_required !== false,
      },
    ].filter((field) => Boolean(field.key));
  }

  return [
    {
      key: item.key,
      label:
        item.image_type === 'front'
          ? `${item.name} Front`
          : item.image_type === 'back'
            ? `${item.name} Back`
            : item.name,
      side: item.image_type === 'front' ? 'front' : item.image_type === 'back' ? 'back' : 'single',
      required: item.is_required !== false,
    },
  ].filter((field) => Boolean(field.key));
};

const serializeDriverVehicleField = (item) => {
  const definition = DRIVER_VEHICLE_FIELD_DEFINITIONS[item.field_key] || {};
  const isBuiltin = Boolean(DRIVER_VEHICLE_FIELD_DEFINITIONS[item.field_key]);

  return {
    _id: item._id,
    id: item._id,
    template_type: 'vehicle_field',
    name: item.name || definition.label || '',
    account_type: item.account_type || definition.account_type || 'individual',
    field_key: item.field_key || '',
    field_type: item.field_type || definition.field_type || 'text',
    field_group: item.field_group || definition.field_group || '',
    is_builtin: isBuiltin,
    placeholder: item.placeholder || definition.placeholder || '',
    help_text: item.help_text || '',
    sort_order: Number(item.sort_order || definition.sort_order || 0),
    options: Array.isArray(item.options) ? item.options : Array.isArray(definition.options) ? definition.options : [],
    is_editable: Boolean(item.is_editable),
    is_required: Boolean(item.is_required),
    active: item.active !== false,
    status: item.active === false ? 'inactive' : 'active',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const serializeDriverNeededDocument = (item) => ({
  _id: item._id,
  id: item._id,
  template_type: normalizeDriverTemplateType(item.template_type),
  name: item.name || '',
  account_type: item.account_type || 'individual',
  image_type: item.image_type || 'front_back',
  has_expiry_date: Boolean(item.has_expiry_date),
  has_identify_number: Boolean(item.has_identify_number),
  identify_number_key: item.identify_number_key || '',
  verification_type: item.verification_type || 'none',
  is_editable: Boolean(item.is_editable),
  is_required: Boolean(item.is_required),
  active: item.active !== false,
  status: item.active === false ? 'inactive' : 'active',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeDriverNeededDocumentTemplate = (item) => ({
  ...serializeDriverNeededDocument(item),
  fields: buildDriverDocumentFields(item),
});

const LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES = [
  { slug: 'aadhar-card', front_key: 'aadharFront', back_key: 'aadharBack', key: '' },
  { slug: 'driving-license', key: 'drivingLicense', front_key: '', back_key: '' },
  { slug: 'vehicle-rc', key: 'vehicleRC', front_key: '', back_key: '' },
];

const normalizeDriverDocumentVerificationType = (value) => {
  const normalized = String(value || 'none').trim().toLowerCase();
  if (['driving_license', 'pan', 'gstin', 'rc', 'bank_account', 'none'].includes(normalized)) {
    return normalized;
  }
  return 'none';
};

const getDriverDocumentPresetConfig = (verificationType = 'none') => {
  switch (normalizeDriverDocumentVerificationType(verificationType)) {
    case 'driving_license':
      return {
        name: 'Driving License',
        image_type: 'image',
        has_expiry_date: true,
        has_identify_number: true,
        identify_number_key: 'license_no',
        key: 'drivingLicense',
      };
    case 'pan':
      return {
        name: 'PAN Card',
        image_type: 'image',
        has_expiry_date: false,
        has_identify_number: true,
        identify_number_key: 'pan_no',
        key: 'panCard',
      };
    case 'gstin':
      return {
        name: 'GST Certificate',
        image_type: 'image',
        has_expiry_date: false,
        has_identify_number: true,
        identify_number_key: 'gstin',
        key: 'gstCertificate',
      };
    case 'rc':
      return {
        name: 'Vehicle RC',
        image_type: 'image',
        has_expiry_date: false,
        has_identify_number: true,
        identify_number_key: 'rc_no',
        key: 'vehicleRC',
      };
    case 'bank_account':
      return {
        name: 'Bank Proof',
        image_type: 'image',
        has_expiry_date: false,
        has_identify_number: true,
        identify_number_key: 'bank_account',
        key: 'bankProof',
      };
    default:
      return null;
  }
};

const cleanupLegacySeededDriverNeededDocuments = async () => {
  const items = await DriverNeededDocument.find().lean();

  if (items.length !== LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.length) {
    return;
  }

  const isLegacySeedSet = items.every((item) =>
    LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.some(
      (seed) =>
        seed.slug === item.slug &&
        String(seed.key || '') === String(item.key || '') &&
        String(seed.front_key || '') === String(item.front_key || '') &&
        String(seed.back_key || '') === String(item.back_key || ''),
    ),
  );

  if (!isLegacySeedSet) {
    return;
  }

  await DriverNeededDocument.deleteMany({
    slug: { $in: LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.map((item) => item.slug) },
  });
};

const REFERRAL_TRANSLATION_DEFAULTS = {
  instant_referrer_user: '',
  instant_referrer_user_and_new_user: '',
  conditional_referrer_user_ride_count: '',
  conditional_referrer_user_earnings: '',
  dual_conditional_referrer_user_and_new_user_ride_count: '',
  dual_conditional_referrer_user_and_new_user_earnings: '',
  banner_text: '',
};

const normalizeReferralTranslationSection = (payload = {}) => ({
  instant_referrer_user: String(payload.instant_referrer_user || ''),
  instant_referrer_user_and_new_user: String(payload.instant_referrer_user_and_new_user || ''),
  conditional_referrer_user_ride_count: String(payload.conditional_referrer_user_ride_count || ''),
  conditional_referrer_user_earnings: String(payload.conditional_referrer_user_earnings || ''),
  dual_conditional_referrer_user_and_new_user_ride_count: String(
    payload.dual_conditional_referrer_user_and_new_user_ride_count || '',
  ),
  dual_conditional_referrer_user_and_new_user_earnings: String(
    payload.dual_conditional_referrer_user_and_new_user_earnings || '',
  ),
  banner_text: String(payload.banner_text || ''),
});

const serializeReferralTranslation = ({ language, translation }) => ({
  _id: translation?._id || null,
  language_code: String(language?.code || translation?.language_code || '').toLowerCase(),
  language_name: language?.name || translation?.language_name || '',
  active: Number(language?.active ?? 1) === 1,
  default_status: Number(language?.default_status ?? 0) === 1,
  user_referral: {
    ...REFERRAL_TRANSLATION_DEFAULTS,
    ...normalizeReferralTranslationSection(translation?.user_referral),
  },
  driver_referral: {
    ...REFERRAL_TRANSLATION_DEFAULTS,
    ...normalizeReferralTranslationSection(translation?.driver_referral),
  },
  createdAt: translation?.createdAt || null,
  updatedAt: translation?.updatedAt || null,
});

const resolveReferralTranslationLanguage = async (languageCode = '') => {
  const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
  const languages = await AppLanguage.find().sort({ default_status: -1, code: 1 }).lean();

  const preferredLanguage =
    languages.find((item) => String(item.code || '').toLowerCase() === normalizedLanguageCode) ||
    languages.find((item) => Number(item.default_status) === 1) ||
    languages[0] ||
    null;

  return {
    languages,
    preferredLanguage,
    normalizedLanguageCode,
  };
};

const cleanupLegacySeededDriverNeededDocumentsFinal = async () => {
  const items = await DriverNeededDocument.find().lean();

  if (items.length !== LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.length) {
    return;
  }

  const isLegacySeedSet = items.every((item) =>
    LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.some(
      (seed) =>
        seed.slug === item.slug &&
        String(seed.key || '') === String(item.key || '') &&
        String(seed.front_key || '') === String(item.front_key || '') &&
        String(seed.back_key || '') === String(item.back_key || ''),
    ),
  );

  if (!isLegacySeedSet) {
    return;
  }

  await DriverNeededDocument.deleteMany({
    slug: { $in: LEGACY_DRIVER_DOCUMENT_SEED_SIGNATURES.map((item) => item.slug) },
  });
};

const serializeAirport = (item) => ({
  _id: item._id,
  id: item._id,
  name: item.name || '',
  code: item.code || '',
  service_location_id: item.service_location_id
    ? {
      _id: item.service_location_id._id || item.service_location_id,
      name: item.service_location_id.service_location_name || item.service_location_id.name || '',
      country: item.service_location_id.country || '',
    }
    : null,
  zone_id: item.zone_id
    ? {
      _id: item.zone_id._id || item.zone_id,
      name: item.zone_id.name || '',
    }
    : null,
  terminal: item.terminal || '',
  address: item.address || '',
  contact_number: item.contact_number || '',
  latitude: item.latitude,
  longitude: item.longitude,
  boundary_coordinates: Array.isArray(item.boundary?.coordinates?.[0])
    ? item.boundary.coordinates[0].map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    : [],
  airport_surge: Number(item.airport_surge ?? 0),
  support_airport_fee: Number(item.support_airport_fee ?? 0),
  status: item.status || (item.active === false ? 'inactive' : 'active'),
  active: item.active !== false,
  pickup_availability: item.pickup_availability !== false,
  drop_availability: item.drop_availability !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const toIsoString = (value) => (value instanceof Date ? value.toISOString() : value || null);

const serializeServiceLocationSnapshot = (serviceLocation, fallback = null) => {
  if (!serviceLocation && !fallback) return null;

  const source = serviceLocation || fallback;
  return {
    id: source.legacy_id || source.id || source._id || '',
    company_key: source.company_key ?? null,
    name: source.name || source.service_location_name || '',
    translation_dataset: source.translation_dataset || '',
    currency_name: source.currency_name || 'Indian rupee',
    currency_code: source.currency_code || 'INR',
    currency_symbol: source.currency_symbol || '₹',
    currency_pointer: source.currency_pointer || 'ltr',
    timezone: source.timezone || 'Asia/Kolkata',
    country: source.country ?? 102,
    active: source.active === false ? 0 : 1,
    created_at: toIsoString(source.createdAt || source.created_at),
    updated_at: toIsoString(source.updatedAt || source.updated_at),
    deleted_at: source.deleted_at || null,
  };
};

const serializeOwner = (owner) => {
  const area = serializeServiceLocationSnapshot(owner.service_location_id, owner.area_snapshot);
  const mobile = owner.mobile || '';
  const mobileNumber = mobile ? (mobile.startsWith('+') ? mobile : `+91${mobile}`) : '';

  return {
    _id: owner._id,
    id: owner.legacy_id || owner._id,
    user_id: owner.user_id ?? null,
    transport_type: owner.transport_type || '',
    service_location_id:
      owner.legacy_service_location_id ||
      owner.service_location_id?.legacy_id ||
      owner.service_location_id?._id ||
      owner.service_location_id ||
      '',
    company_name: owner.company_name || '',
    owner_name: owner.owner_name ?? null,
    name: owner.name || '',
    surname: owner.surname ?? null,
    email: owner.email || '',
    mobile,
    phone: owner.phone ?? null,
    address: owner.address ?? null,
    postal_code: owner.postal_code ?? null,
    city: owner.city ?? null,
    expiry_date: owner.expiry_date ?? null,
    no_of_vehicles: Number(owner.no_of_vehicles || 0),
    tax_number: owner.tax_number ?? null,
    bank_name: owner.bank_name ?? null,
    ifsc: owner.ifsc ?? null,
    account_no: owner.account_no ?? null,
    iban: owner.iban ?? null,
    bic: owner.bic ?? null,
    active: owner.active === false ? 0 : 1,
    approve: owner.approve ? 1 : 0,
    status: owner.status || (owner.approve ? 'approved' : 'pending'),
    created_at: toIsoString(owner.createdAt),
    updated_at: toIsoString(owner.updatedAt),
    deleted_at: null,
    area_name: area?.name || '',
    mobile_number: mobileNumber,
    converted_deleted_at: null,
    area,
    user: owner.user_snapshot || null,
    createdAt: owner.createdAt,
    updatedAt: owner.updatedAt,
  };
};

const serializeOwnerBooking = (item) => ({
  _id: item._id,
  id: item._id,
  owner_id: item.owner_id
    ? {
      _id: item.owner_id._id || item.owner_id,
      name: item.owner_id.full_name || item.owner_id.name || '',
      email: item.owner_id.email || '',
      mobile: item.owner_id.mobile || '',
    }
    : null,
  booking_reference: item.booking_reference || '',
  customer_name: item.customer_name || '',
  customer_phone: item.customer_phone || '',
  pickup_location: item.pickup_location || '',
  dropoff_location: item.dropoff_location || '',
  trip_type: item.trip_type || 'city',
  vehicle_type: item.vehicle_type || '',
  trip_date: item.trip_date,
  fare_amount: Number(item.fare_amount || 0),
  payment_status: item.payment_status || 'pending',
  booking_status: item.booking_status || 'pending',
  notes: item.notes || '',
  active: item.active !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeFleetVehicle = (item) => ({
  _id: item._id,
  id: item._id,
  owner_id: item.owner_id || null,
  service_location_id: item.service_location_id || null,
  transport_type: item.transport_type || 'taxi',
  vehicle_type_id: item.vehicle_type_id || null,
  car_brand: item.car_brand || '',
  car_model: item.car_model || '',
  license_plate_number: item.license_plate_number || '',
  car_color: item.car_color || '',
  documents: item.documents || {},
  status: item.status || 'pending',
  reason: item.reason || '',
  active: item.active !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeDriver = (driver) => ({
  _id: driver._id,
  name: driver.name || '',
  phone: driver.phone || '',
  mobile: driver.phone || '',
  email: driver.email || '',
  driver_code: driver.referralCode || (driver.phone ? `DRV${String(driver.phone).slice(-4)}${String(driver._id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : ''),
  referralCode: driver.referralCode || '',
  acquiredByEmployeeId: driver.acquiredByEmployeeId || null,
  acquiredByEmployeeCode: driver.acquiredByEmployeeCode || '',
  owner_id: driver.owner_id || null,
  service_location_id: driver.service_location_id || null,
  zoneId: driver.zoneId?._id || driver.zoneId || null,
  zone_name: driver.zoneId?.name || driver.zone_name || '',
  country: driver.country || null,
  profile_picture: driver.profile_picture || '',
  city: driver.city || '',
  service_location_name: driver.city || '',
  transport_type: driver.registerFor || driver.vehicleType || '',
  register_for: driver.registerFor || '',
  service_categories: Array.isArray(driver.serviceCategories) ? driver.serviceCategories : [],
  vehicle_type: driver.vehicleType || '',
  vehicle_type_id: driver.vehicleTypeId || null,
  vehicleIconType: driver.vehicleIconType || driver.vehicleType || '',
  vehicleImage: driver.vehicleImage || '',
  vehicle_make: driver.vehicleMake || '',
  vehicle_model: driver.vehicleModel || '',
  vehicle_number: driver.vehicleNumber || '',
  vehicle_color: driver.vehicleColor || '',
  rating:
    Number(driver.ratingCount || 0) > 0
      ? Number(driver.rating || 0)
      : 0,
  rating_count: Number(driver.ratingCount || 0),
  approve: Boolean(driver.approve),
  status: driver.status || (driver.approve ? 'approved' : 'pending'),
  active: driver.approve !== false && String(driver.status || '').toLowerCase() !== 'inactive',
  deletedAt: driver.deletedAt || null,
  deletionRequest: driver.deletionRequest || { status: 'none' },
  documents: driver.documents || {},
  onboarding: driver.onboarding || {},
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const DRIVER_LIST_SELECT = [
  '_id',
  'name',
  'phone',
  'email',
  'referralCode',
  'acquiredByEmployeeId',
  'acquiredByEmployeeCode',
  'owner_id',
  'service_location_id',
  'zoneId',
  'city',
  'registerFor',
  'vehicleType',
  'vehicleTypeId',
  'vehicleIconType',
  'vehicleNumber',
  'vehicleColor',
  'rating',
  'ratingCount',
  'isOnline',
  'isOnRide',
  'onlineSelfie',
  'location',
  'approve',
  'status',
  'createdAt',
  'updatedAt',
].join(' ');

const serializeDriverListItem = (driver) => ({
  _id: driver._id,
  id: driver._id,
  name: driver.name || '',
  phone: driver.phone || '',
  mobile: driver.phone || '',
  email: driver.email || '',
  driver_code: driver.referralCode || (driver.phone ? `DRV${String(driver.phone).slice(-4)}${String(driver._id || '').slice(-6).toUpperCase()}`.replace(/\W/g, '') : ''),
  referralCode: driver.referralCode || '',
  acquiredByEmployeeId: driver.acquiredByEmployeeId || null,
  acquiredByEmployeeCode: driver.acquiredByEmployeeCode || '',
  owner_id: driver.owner_id || null,
  service_location_id: driver.service_location_id || null,
  city: driver.city || '',
  service_location_name:
    driver.service_location_id?.service_location_name ||
    driver.service_location_id?.name ||
    driver.city ||
    '',
  zone_id: driver.zoneId?._id || driver.zoneId || null,
  zone_name: driver.zoneId?.name || '',
  transport_type: driver.registerFor || driver.vehicleType || '',
  register_for: driver.registerFor || '',
  vehicle_type: driver.vehicleType || '',
  vehicle_type_id: driver.vehicleTypeId || null,
  vehicle_icon_type: driver.vehicleIconType || driver.vehicleType || '',
  vehicle_number: driver.vehicleNumber || '',
  vehicle_color: driver.vehicleColor || '',
  rating:
    Number(driver.ratingCount || 0) > 0
      ? Number(driver.rating || 0)
      : 0,
  rating_count: Number(driver.ratingCount || 0),
  isOnline: Boolean(driver.isOnline),
  isOnRide: Boolean(driver.isOnRide),
  online_selfie_image: driver.onlineSelfie?.imageUrl || '',
  online_selfie_captured_at: driver.onlineSelfie?.capturedAt || null,
  online_selfie_for_date: driver.onlineSelfie?.forDate || '',
  location: driver.location || null,
  latitude: Number(driver.location?.coordinates?.[1] ?? null),
  longitude: Number(driver.location?.coordinates?.[0] ?? null),
  approve: Boolean(driver.approve),
  status: driver.status || (driver.approve ? 'approved' : 'pending'),
  active: driver.approve !== false && String(driver.status || '').toLowerCase() !== 'inactive',
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const serializeUser = (user) => ({
  _id: user._id,
  id: user._id,
  name: user.name || '',
  email: user.email || '',
  gender: user.gender || '',
  profileImage: user.profileImage || '',
  governmentIdProof: user.governmentIdProof || {
    type: '',
    imageUrl: '',
    fileName: '',
    uploadedAt: null,
  },
  mobile: user.phone || user.mobile || '',
  phone: user.phone || user.mobile || '',
  acquiredByEmployeeId: user.acquiredByEmployeeId || null,
  acquiredByEmployeeCode: user.acquiredByEmployeeCode || '',
  wallet_balance: Number(user.wallet_balance || 0),
  active: user.active !== false && user.isActive !== false && !user.deletedAt,
  deletedAt: user.deletedAt || null,
  deletion_reason: user.deletion_reason || '',
  deletionRequest: user.deletionRequest || { status: 'none' },
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const USER_LIST_SELECT = [
  '_id',
  'name',
  'email',
  'gender',
  'profileImage',
  'governmentIdProof',
  'phone',
  'mobile',
  'acquiredByEmployeeId',
  'acquiredByEmployeeCode',
  'wallet_balance',
  'active',
  'isActive',
  'deletedAt',
  'deletion_reason',
  'deletionRequest',
  'createdAt',
  'updatedAt',
].join(' ');

const serializeUserListItem = (user, employee = null) => ({
  _id: user._id,
  id: user._id,
  name: user.name || '',
  email: user.email || '',
  gender: user.gender || '',
  profileImage: user.profileImage || '',
  governmentIdProof: user.governmentIdProof || {
    type: '',
    imageUrl: '',
    fileName: '',
    uploadedAt: null,
  },
  mobile: user.phone || user.mobile || '',
  phone: user.phone || user.mobile || '',
  acquiredByEmployeeId: user.acquiredByEmployeeId || null,
  acquiredByEmployeeCode: user.acquiredByEmployeeCode || '',
  acquiredByEmployeeName: employee?.name || '',
  wallet_balance: Number(user.wallet_balance || 0),
  active:
    (user.active ?? user.isActive) !== false &&
    !user.deletedAt,
  deletedAt: user.deletedAt || null,
  deletion_reason: user.deletion_reason || '',
  deletionRequest: user.deletionRequest || { status: 'none' },
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const DEFAULT_SERVICE_LOCATION_CENTER = { lat: 22.7196, lng: 75.8577 };

const normalizeServiceLocationPayload = (payload = {}, fallback = {}) => {
  const latitude = Number(payload.latitude ?? fallback.latitude ?? DEFAULT_SERVICE_LOCATION_CENTER.lat);
  const longitude = Number(payload.longitude ?? fallback.longitude ?? DEFAULT_SERVICE_LOCATION_CENTER.lng);
  const name = payload.name?.trim() || fallback.name || fallback.service_location_name;
  const currencyCode = String(payload.currency_code ?? fallback.currency_code ?? 'INR').toUpperCase();
  const status = payload.status ?? fallback.status ?? 'active';

  return {
    name,
    service_location_name: name,
    address: payload.address ?? fallback.address ?? '',
    country: payload.country ?? fallback.country ?? 'India',
    currency_name: payload.currency_name ?? fallback.currency_name ?? currencyCode,
    currency_symbol: payload.currency_symbol ?? fallback.currency_symbol ?? '₹',
    currency_code: currencyCode,
    currency_symbol: payload.currency_symbol ?? fallback.currency_symbol ?? '₹',
    timezone: payload.timezone ?? fallback.timezone ?? 'Asia/Kolkata',
    unit: payload.unit ?? fallback.unit ?? 'km',
    latitude,
    longitude,
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
    status,
    active: status === 'active',
  };
};

const escapeRegex = (value = '') =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveServiceLocationForImport = async (value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return null;

  if (mongoose.isValidObjectId(candidate)) {
    const byId = await ServiceLocation.findById(candidate).lean();
    if (byId) return byId;
  }

  return ServiceLocation.findOne({
    $or: [
      { name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
      { service_location_name: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
    ],
  }).lean();
};

const resolveVehicleForImport = async (vehicleLabel, transportType) => {
  const candidate = String(vehicleLabel || '').trim();
  if (!candidate) return null;

  if (mongoose.isValidObjectId(candidate)) {
    const byId = await Vehicle.findById(candidate).lean();
    if (byId) return byId;
  }

  return Vehicle.findOne({
    name: new RegExp(`^${escapeRegex(candidate)}$`, 'i'),
    ...(transportType
      ? { transport_type: { $in: [normalizeVehicleTransportType(transportType), 'both'] } }
      : {}),
  }).lean();
};

const normalizeImportTransportType = (value = '') =>
  String(value || '').trim().toLowerCase() === 'delivery' ? 'delivery' : 'taxi';

const normalizeImportVehicleType = (value = '', vehicleRecord = null) => {
  const vehicleText = String(
    vehicleRecord?.icon_types || vehicleRecord?.name || value || '',
  )
    .trim()
    .toLowerCase();

  if (vehicleText.includes('bike') || vehicleText.includes('scooter')) return 'bike';
  if (vehicleText.includes('auto') || vehicleText.includes('rickshaw')) return 'auto';
  return 'car';
};

export const csvFromRows = (headers, rows) => {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
};

const syncSettingRows = (rows, payload) =>
  rows.map((row) => {
    if (!(row.key in payload)) return row;
    const nextValue = String(payload[row.key]);
    return {
      ...row,
      value: nextValue,
      is_active: row.key.startsWith('enable_') ? nextValue === '1' : row.is_active,
    };
  });

const DEFAULT_ADMIN_EMAIL = 'admin@gmail.com';
const DEFAULT_ADMIN_PASSWORD = '12345';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

const syncDefaultAdminRecord = async () => {
  const now = new Date();
  const existingAdmin = await Admin.findOne({ email: DEFAULT_ADMIN_EMAIL }).select('+password');
  const nextPassword =
    !existingAdmin || !BCRYPT_HASH_PATTERN.test(existingAdmin.password || '')
      ? await hashPassword(DEFAULT_ADMIN_PASSWORD)
      : undefined;

  await Admin.collection.updateOne(
    { email: DEFAULT_ADMIN_EMAIL },
    {
      $set: {
        name: 'Super Admin',
        email: DEFAULT_ADMIN_EMAIL,
        phone: '9999999999',
        role: 'superadmin',
        admin_type: 'superadmin',
        permissions: ['*'],
        active: true,
        status: 'active',
        ...(nextPassword ? { password: nextPassword } : {}),
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
};

const LEGACY_OWNER_SERVICE_LOCATION = {
  legacy_id: '53027f5a-dad1-47fa-8417-b958dd520821',
  company_key: null,
  name: 'India',
  service_location_name: 'India',
  translation_dataset: '{"en":{"locale":"en","name":"India"}}',
  currency_name: 'Indian rupee',
  currency_code: 'INR',
  currency_symbol: '₹',
  currency_pointer: 'ltr',
  timezone: 'Asia/Kolkata',
  country: 102,
  active: true,
  status: 'active',
  createdAt: new Date('2026-02-02T11:57:30.000Z'),
  updatedAt: new Date('2026-02-02T11:57:30.000Z'),
};

const LEGACY_OWNER_ROLE = {
  id: 3,
  slug: 'owner',
  name: 'Normal Owner',
  description: 'Normal Owner with standard access',
  all: 0,
  locked: 1,
  created_by: 1,
  created_at: '2026-02-02T11:36:54.000000Z',
  updated_at: '2026-02-07T15:55:24.000000Z',
};

const buildLegacyOwnerSeeds = (serviceLocationId) => [
  {
    legacy_id: '08e4823f-33df-480b-8419-91e8f49aa204',
    user_id: 55,
    transport_type: 'taxi',
    service_location_id: serviceLocationId,
    legacy_service_location_id: LEGACY_OWNER_SERVICE_LOCATION.legacy_id,
    company_name: 'Taxi',
    owner_name: null,
    name: 'Demo owner',
    surname: null,
    email: 'owner@gmail.com',
    password: '$2y$10$5P1q/uu.og/yMK1y5fHstuHPW1u7rD5x0CoGGvDoSW6Okjv1v/B0m',
    mobile: '7470311227',
    phone: null,
    address: null,
    postal_code: null,
    city: null,
    expiry_date: null,
    no_of_vehicles: 0,
    tax_number: null,
    bank_name: null,
    ifsc: null,
    account_no: null,
    iban: null,
    bic: null,
    active: true,
    approve: true,
    status: 'approved',
    createdAt: new Date('2026-03-20T07:42:58.000Z'),
    updatedAt: new Date('2026-04-09T07:47:17.000Z'),
    area_snapshot: LEGACY_OWNER_SERVICE_LOCATION,
    user_snapshot: {
      id: 55,
      name: 'Demo owner',
      company_key: null,
      username: null,
      map_type: null,
      email: 'owner@gmail.com',
      mobile: '7470311227',
      ride_otp: null,
      gender: null,
      profile_picture: 'https://zyder.co.in/assets/images/Male_default_image.png',
      stripe_customer_id: null,
      is_deleted_at: null,
      country: 102,
      timezone: null,
      active: 1,
      email_confirmed: 0,
      mobile_confirmed: 0,
      fcm_token: null,
      apn_token: null,
      refferal_code: null,
      referred_by: null,
      rating: 0,
      lang: null,
      zone_id: null,
      current_lat: null,
      current_lng: null,
      rating_total: 0,
      no_of_ratings: 0,
      login_by: null,
      last_known_ip: null,
      last_login_at: null,
      social_provider: null,
      is_bid_app: 0,
      social_nickname: null,
      social_id: null,
      social_token: null,
      social_token_secret: null,
      social_refresh_token: null,
      social_expires_in: null,
      social_avatar: null,
      social_avatar_original: null,
      created_at: '2026-03-20T07:42:58.000000Z',
      updated_at: '2026-04-09T07:47:17.000000Z',
      authorization_code: null,
      deleted_at: null,
      service_location_id: null,
      country_name: 'India',
      mobile_number: '+917470311227',
      role_name: 'owner',
      converted_deleted_at: null,
      country_detail: {
        id: 102,
        name: 'India',
        dial_code: '+91',
        dial_min_length: 7,
        dial_max_length: 14,
        code: 'IN',
        currency_name: 'Indian rupee',
        currency_code: 'INR',
        currency_symbol: '₹',
        flag: 'https://zyder.co.in/image/country/flags/IN.png',
        active: 1,
        created_at: null,
        updated_at: null,
      },
      roles: [{ ...LEGACY_OWNER_ROLE, pivot: { user_id: 55, role_id: 3 } }],
    },
  },
  {
    legacy_id: '941bb56f-2775-4685-818e-8326b44ead94',
    user_id: 39,
    transport_type: 'Both',
    service_location_id: serviceLocationId,
    legacy_service_location_id: LEGACY_OWNER_SERVICE_LOCATION.legacy_id,
    company_name: 'itc',
    owner_name: 'princess',
    name: 'princess',
    surname: null,
    email: 'indra@gmail.com',
    password: null,
    mobile: '8072694803',
    phone: null,
    address: 'hgxbnmkchcufjbjbivjnvjv',
    postal_code: '908899',
    city: 'd6hf hmm kb',
    expiry_date: null,
    no_of_vehicles: 0,
    tax_number: '578999bcv8988',
    bank_name: null,
    ifsc: null,
    account_no: null,
    iban: null,
    bic: null,
    active: true,
    approve: true,
    status: 'approved',
    createdAt: new Date('2026-02-28T12:34:16.000Z'),
    updatedAt: new Date('2026-02-28T13:36:28.000Z'),
    area_snapshot: LEGACY_OWNER_SERVICE_LOCATION,
    user_snapshot: {
      id: 39,
      name: 'princess',
      company_key: null,
      username: null,
      map_type: null,
      email: 'indra@gmail.com',
      mobile: '8072694803',
      ride_otp: null,
      gender: 'female',
      profile_picture: 'https://zyder.co.in/assets/images/Female_default_image.png',
      stripe_customer_id: null,
      is_deleted_at: null,
      country: 102,
      timezone: 'Asia/Kolkata',
      active: 1,
      email_confirmed: 0,
      mobile_confirmed: 1,
      fcm_token: 'dqw_CwtrSXa0l9p5oMxCLl:APA91bH1ZbjCzaE-crPxlDOfbU8LBDXg1gerLnzsrWB5Ky6hy9gRvT7LPZb2OSdK9AHh1w2RBSyj-fnuNIofm9FF6GfkdcfusbSMy2lmmjBQ2omVAXlgJQE',
      apn_token: null,
      refferal_code: 'v7CmOw',
      referred_by: null,
      rating: 0,
      lang: 'en',
      zone_id: '8d426929-591a-4bb7-bc60-256abb196363',
      current_lat: 11.9190793,
      current_lng: 79.8034286,
      rating_total: 0,
      no_of_ratings: 0,
      login_by: 'android',
      last_known_ip: null,
      last_login_at: null,
      social_provider: null,
      is_bid_app: 0,
      social_nickname: null,
      social_id: null,
      social_token: null,
      social_token_secret: null,
      social_refresh_token: null,
      social_expires_in: null,
      social_avatar: null,
      social_avatar_original: null,
      created_at: '2026-02-28T12:34:16.000000Z',
      updated_at: '2026-02-28T13:10:44.000000Z',
      authorization_code: null,
      deleted_at: null,
      service_location_id: LEGACY_OWNER_SERVICE_LOCATION.legacy_id,
      country_name: 'India',
      mobile_number: '+918072694803',
      role_name: 'owner',
      converted_deleted_at: null,
      country_detail: {
        id: 102,
        name: 'India',
        dial_code: '+91',
        dial_min_length: 7,
        dial_max_length: 14,
        code: 'IN',
        currency_name: 'Indian rupee',
        currency_code: 'INR',
        currency_symbol: '₹',
        flag: 'https://zyder.co.in/image/country/flags/IN.png',
        active: 1,
        created_at: null,
        updated_at: null,
      },
      roles: [{ ...LEGACY_OWNER_ROLE, pivot: { user_id: 39, role_id: 3 } }],
    },
  },
];

const seedInitialData = async () => {
  const defaults = createDefaultAdminState();

  // Seed Users
  if (await User.countDocuments() === 0) {
    await User.insertMany(defaults.users.map(u => ({ ...u, phone: u.mobile, password: 'password123' })));
  }

  // Seed Service Locations
  if (await ServiceLocation.countDocuments() === 0) {
    await ServiceLocation.insertMany(defaults.serviceLocations);
  }

  // Seed Drivers
  if (await Driver.countDocuments() === 0) {
    await Driver.insertMany(defaults.drivers.map(d => ({ ...d, phone: d.mobile })));
  }

  // Seed Languages
  if (await AppLanguage.countDocuments() === 0) {
    await AppLanguage.insertMany(defaults.languages);
  }

  // Seed Ride Modules
  if (await RideModule.countDocuments() === 0) {
    await RideModule.insertMany(defaults.rideModules);
  }

  // Seed App Modules removed (Migrated to AdminAppSetting)

  // Seed Notification Channels
  if (await NotificationChannel.countDocuments() === 0) {
    await NotificationChannel.insertMany(defaults.notificationChannels);
  }

  // Seed Subscription Plans
  if (await SubscriptionPlan.countDocuments() === 0) {
    await SubscriptionPlan.insertMany(defaults.subscriptionPlans);
  }

  // Seed Preferences
  if (await UserPreference.countDocuments() === 0) {
    await UserPreference.insertMany(defaults.preferences);
  }

  // Seed Admin Roles
  if (await AdminRole.countDocuments() === 0) {
    await AdminRole.insertMany(defaults.roles);
  }

  // Seed Payment Gateways
  if (await PaymentGateway.countDocuments() === 0) {
    await PaymentGateway.insertMany(defaults.paymentGateways);
  }

  // Seed Onboarding Screens
  if (await OnboardingScreen.countDocuments() === 0) {
    await OnboardingScreen.insertMany(defaults.onboardingScreens);
  }

  await ensureFleetOwnersSeeded();
};

export const ensureServiceLocationsSeeded = async () => {
  if (await ServiceLocation.countDocuments() === 0) {
    const defaults = createDefaultAdminState();
    await ServiceLocation.insertMany(defaults.serviceLocations);
  }
};

export const ensureFleetOwnersSeeded = async () => {
  const now = new Date();

  const serviceLocation = await ServiceLocation.findOneAndUpdate(
    {
      $or: [
        { legacy_id: LEGACY_OWNER_SERVICE_LOCATION.legacy_id },
        { name: LEGACY_OWNER_SERVICE_LOCATION.name },
      ],
    },
    {
      $set: {
        ...LEGACY_OWNER_SERVICE_LOCATION,
        updatedAt: LEGACY_OWNER_SERVICE_LOCATION.updatedAt || now,
      },
      $setOnInsert: {
        createdAt: LEGACY_OWNER_SERVICE_LOCATION.createdAt || now,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  const ownerSeeds = buildLegacyOwnerSeeds(serviceLocation._id);

  for (const seed of ownerSeeds) {
    const existingOwner = await Owner.findOne({
      $or: [
        { legacy_id: seed.legacy_id },
        { email: seed.email },
        { mobile: seed.mobile },
      ],
    }).lean();

    if (existingOwner) {
      await Owner.updateOne(
        { _id: existingOwner._id },
        {
          $set: {
            ...seed,
            updatedAt: seed.updatedAt || now,
          },
          $setOnInsert: {
            createdAt: seed.createdAt || now,
          },
        },
      );
      continue;
    }

    await Owner.create(seed);
  }
};

export const ensureAdminState = async () => {
  await syncDefaultAdminRecord();
  await seedInitialData();
  return { ready: true };
};

export const getAdminModuleInfo = async () => {
  const [
    userCount,
    deletedUserCount,
    driverCount,
    ownerCount,
    zoneCount
  ] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    User.countDocuments({ deletedAt: { $ne: null } }),
    Driver.countDocuments(),
    Owner.countDocuments(),
    Zone.countDocuments(),
  ]);
  return {
    module: 'admin',
    ready: true,
    message: 'Admin module is wired with independent collections',
    snapshot: {
      users: userCount,
      deleted_users: deletedUserCount,
      drivers: driverCount,
      owners: ownerCount,
      zones: zoneCount,
    },
  };
};

export const loginAdmin = async ({ email, password }) => {
  const admin = await Admin.findOne({ email: email?.trim().toLowerCase() }).select('+password');

  if (!admin) {
    throw new ApiError(401, 'Invalid admin credentials');
  }

  const passwordMatches = BCRYPT_HASH_PATTERN.test(admin.password || '')
    ? await comparePassword(password, admin.password)
    : admin.password === password;

  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid admin credentials');
  }

  if (admin.active === false || String(admin.status || '').toLowerCase() === 'inactive') {
    throw new ApiError(403, 'Admin account is inactive');
  }

  const [serializedAdmin] = await enrichAdminSummaries([admin]);

  return {
    token: signAccessToken({ sub: String(admin._id), role: 'admin' }),
    admin: serializedAdmin,
  };
};

export const listAdminPermissions = async () =>
  ADMIN_PERMISSIONS.map((key) => ({ key, label: key }));

export const listAdmins = async (currentAdmin) => {
  assertAdminPermission(currentAdmin, 'subadmins.manage', 'subadmins');

  const admins = await Admin.find()
    .select('-resetPasswordOtp -resetPasswordExpires')
    .sort({ createdAt: -1 })
    .lean();

  return enrichAdminSummaries(admins);
};

const validateSubadminPayload = async (payload = {}, existingAdminId = null) => {
  const adminType = normalizeAdminType(payload.admin_type || payload.role);
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').trim();
  const role = String(payload.role || (adminType === 'superadmin' ? 'superadmin' : 'subadmin')).trim();
  const permissions = normalizeAdminPermissions(
    adminType === 'superadmin' ? [SUPERADMIN_PERMISSION] : payload.permissions || [],
  );
  const serviceLocationIds = normalizeObjectIdList(payload.service_location_ids);
  const zoneIds = normalizeObjectIdList(payload.zone_ids);
  const active = payload.active === undefined ? true : normalizeBoolean(payload.active);
  const status = String(payload.status || (active ? 'active' : 'inactive')).trim().toLowerCase() === 'inactive'
    ? 'inactive'
    : 'active';

  if (!name) {
    throw new ApiError(400, 'Admin name is required');
  }

  if (!email) {
    throw new ApiError(400, 'Admin email is required');
  }

  const duplicate = await Admin.findOne({
    email,
    ...(existingAdminId ? { _id: { $ne: existingAdminId } } : {}),
  }).lean();

  if (duplicate) {
    throw new ApiError(409, 'Admin email already exists');
  }

  if (adminType === 'subadmin' && permissions.length === 0) {
    throw new ApiError(400, 'Select at least one permission for the subadmin');
  }

  if (adminType === 'subadmin' && serviceLocationIds.length === 0) {
    throw new ApiError(400, 'Assign at least one service location to the subadmin');
  }

  if (serviceLocationIds.length > 0) {
    const count = await ServiceLocation.countDocuments({ _id: { $in: serviceLocationIds } });
    if (count !== serviceLocationIds.length) {
      throw new ApiError(400, 'One or more selected service locations are invalid');
    }
  }

  if (zoneIds.length > 0) {
    const zones = await Zone.find({ _id: { $in: zoneIds } }).select('_id service_location_id').lean();
    if (zones.length !== zoneIds.length) {
      throw new ApiError(400, 'One or more selected zones are invalid');
    }

    if (
      adminType === 'subadmin' &&
      zones.some((zone) => !serviceLocationIds.some((id) => String(id) === String(zone.service_location_id || '')))
    ) {
      throw new ApiError(400, 'Assigned zones must belong to the selected service locations');
    }
  }

  return {
    admin_type: adminType,
    name,
    email,
    phone,
    role,
    permissions,
    service_location_ids: adminType === 'superadmin' ? [] : serviceLocationIds,
    zone_ids: adminType === 'superadmin' ? [] : zoneIds,
    active,
    status,
  };
};

export const createAdminAccount = async (currentAdmin, payload = {}) => {
  assertAdminPermission(currentAdmin, 'subadmins.manage', 'subadmins');

  const password = String(payload.password || '').trim();
  const passwordConfirmation = String(payload.password_confirmation || payload.passwordConfirmation || '').trim();

  if (!password || password.length < 5) {
    throw new ApiError(400, 'Password must be at least 5 characters');
  }

  if (!passwordConfirmation || password !== passwordConfirmation) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const validated = await validateSubadminPayload(payload);
  const created = await Admin.create({
    ...validated,
    password: await hashPassword(password),
  });

  const [serializedAdmin] = await enrichAdminSummaries([created]);
  return serializedAdmin;
};

export const updateAdminAccount = async (currentAdmin, id, payload = {}) => {
  assertAdminPermission(currentAdmin, 'subadmins.manage', 'subadmins');

  const admin = await Admin.findById(id).select('+password');
  if (!admin) {
    throw new ApiError(404, 'Admin account not found');
  }

  if (String(admin._id) === String(currentAdmin?.id || '')) {
    throw new ApiError(400, 'Use your profile flow to update your own admin account');
  }

  const validated = await validateSubadminPayload(payload, admin._id);
  Object.assign(admin, validated);

  if (payload.password) {
    const password = String(payload.password || '').trim();
    const passwordConfirmation = String(payload.password_confirmation || payload.passwordConfirmation || '').trim();
    if (password.length < 5) {
      throw new ApiError(400, 'Password must be at least 5 characters');
    }
    if (password !== passwordConfirmation) {
      throw new ApiError(400, 'Passwords do not match');
    }
    admin.password = await hashPassword(password);
  }

  await admin.save();
  const [serializedAdmin] = await enrichAdminSummaries([admin]);
  return serializedAdmin;
};

export const deleteAdminAccount = async (currentAdmin, id) => {
  assertAdminPermission(currentAdmin, 'subadmins.manage', 'subadmins');

  const admin = await Admin.findById(id).lean();
  if (!admin) {
    throw new ApiError(404, 'Admin account not found');
  }

  if (String(admin._id) === String(currentAdmin?.id || '')) {
    throw new ApiError(400, 'You cannot delete your own admin account');
  }

  await Admin.deleteOne({ _id: admin._id });
  return { deleted: true };
};

export const forgotPassword = async (email) => {
  const admin = await Admin.findOne({ email: email?.trim().toLowerCase() });
  if (!admin) {
    throw new ApiError(404, 'Admin with this email not found');
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  admin.resetPasswordOtp = otp;
  admin.resetPasswordExpires = otpExpires;
  await admin.save();

  // Send real email
  await sendEmail({
    to: email,
    subject: `Password Reset OTP for ${process.env.APP_NAME || 'Appzeto 24'}`,
    text: `Your OTP for password reset is: ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #f97316;">Password Reset</h2>
        <p>Hello,</p>
        <p>You requested a password reset for your admin account. Use the following OTP to continue:</p>
        <div style="font-size: 32px; font-weight: bold; padding: 10px; background: #fff7ed; color: #f97316; text-align: center; border-radius: 8px; margin: 20px 0;">
          ${otp}
        </div>
        <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">Regards,<br>Team ${process.env.APP_NAME || 'Appzeto 24'}</p>
      </div>
    `,
  });

  console.log(`[ADMIN FORGOT PASSWORD] OTP for ${email}: ${otp}`);

  return { message: 'OTP sent to your email' };
};

export const verifyResetOtp = async ({ email, otp }) => {
  const admin = await Admin.findOne({
    email: email?.trim().toLowerCase()
  }).select('+resetPasswordOtp +resetPasswordExpires');

  if (!admin || admin.resetPasswordOtp !== otp || new Date() > admin.resetPasswordExpires) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  return { success: true, message: 'OTP verified successfully' };
};

export const resetPassword = async ({ email, otp, password }) => {
  const admin = await Admin.findOne({
    email: email?.trim().toLowerCase()
  }).select('+resetPasswordOtp +resetPasswordExpires');

  if (!admin || admin.resetPasswordOtp !== otp || new Date() > admin.resetPasswordExpires) {
    throw new ApiError(400, 'Invalid or expired OTP');
  }

  admin.password = await hashPassword(password);
  admin.resetPasswordOtp = undefined;
  admin.resetPasswordExpires = undefined;
  await admin.save();

  return { success: true, message: 'Password reset successful' };
};

export const listUsers = async ({
  page = 1,
  limit = 50,
  search = '',
  employeeId = '',
  referralSource = 'all',
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const start = (safePage - 1) * safeLimit;
  const query = { deletedAt: null };
  const normalizedSearch = String(search || '').trim();
  const normalizedEmployeeId = String(employeeId || '').trim();
  const normalizedReferralSource = String(referralSource || 'all').trim().toLowerCase();

  if (normalizedSearch) {
    const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const digits = normalizedSearch.replace(/\D/g, '');
    const regex = new RegExp(escapedSearch, 'i');
    query.$or = [{ name: regex }, { email: regex }];

    if (digits) {
      query.$or.push({ phone: new RegExp(`^${digits}`) });
    } else {
      query.$or.push({ phone: regex });
    }
  }

  if (normalizedEmployeeId) {
    query.acquiredByEmployeeId = normalizedEmployeeId;
  }

  if (normalizedReferralSource === 'employee') {
    query.acquiredByEmployeeId = normalizedEmployeeId
      ? normalizedEmployeeId
      : { $ne: null };
  } else if (normalizedReferralSource === 'organic') {
    query.acquiredByEmployeeId = null;
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select(USER_LIST_SELECT)
      .sort({ createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    User.countDocuments(query),
  ]);

  const employeeIds = [
    ...new Set(
      users
        .map((user) => String(user.acquiredByEmployeeId || '').trim())
        .filter(Boolean),
    ),
  ];

  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds } })
      .select('_id name employeeCode')
      .lean()
    : [];

  const employeeMap = new Map(
    employees.map((employee) => [String(employee._id), employee]),
  );

  return {
    results: users.map((user) =>
      serializeUserListItem(
        user,
        employeeMap.get(String(user.acquiredByEmployeeId || '')) || null,
      ),
    ),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const bulkImportUsers = async (payload = {}) => {
  const incomingUsers = Array.isArray(payload.users) ? payload.users : [];

  if (!incomingUsers.length) {
    throw new ApiError(400, 'users array is required');
  }

  if (incomingUsers.length > 2000) {
    throw new ApiError(400, 'Too many users in one import (max 2000)');
  }

  const errors = [];
  const created = [];
  const skipped = [];

  for (let index = 0; index < incomingUsers.length; index += 1) {
    const raw = incomingUsers[index] || {};
    const name = String(raw.name || '').trim();
    const phone = String(raw.phone || raw.mobile || '').replace(/\D/g, '');
    const email = String(raw.email || '').trim().toLowerCase();
    const gender = String(raw.gender || '').trim().toLowerCase();
    const countryCode = String(raw.countryCode || raw.country_code || raw.country || '').trim();

    if (!name) {
      errors.push({ index, field: 'name', message: 'Name is required' });
      continue;
    }

    if (!/^\d{10}$/.test(phone)) {
      errors.push({ index, field: 'phone', message: 'A valid 10-digit phone number is required' });
      continue;
    }

    if (email && !EMAIL_REGEX.test(email)) {
      errors.push({ index, field: 'email', message: 'A valid email address is required' });
      continue;
    }

    const normalizedGender = VALID_USER_GENDERS.has(gender) ? gender : '';
    const normalizedCountryCode = countryCode && countryCode.startsWith('+') ? countryCode : '+91';

    const existingUser = await User.findOne({ phone }).lean();
    if (existingUser) {
      skipped.push({ index, phone, id: String(existingUser._id) });
      continue;
    }

    try {
      const user = await User.create({
        name,
        phone,
        email,
        gender: normalizedGender,
        countryCode: normalizedCountryCode,
        isVerified: true,
        active: raw.active ?? true,
      });
      created.push(serializeUser(user.toObject()));
    } catch (error) {
      const message = error?.message || 'Failed to create user';
      errors.push({ index, message });
    }
  }

  return {
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    created,
    skipped: skipped.slice(0, 200),
    errors: errors.slice(0, 200),
  };
};

export const bulkImportDrivers = async (payload = {}) => {
  const incomingDrivers = Array.isArray(payload.drivers) ? payload.drivers : [];

  if (!incomingDrivers.length) {
    throw new ApiError(400, 'drivers array is required');
  }

  if (incomingDrivers.length > 2000) {
    throw new ApiError(400, 'Too many drivers in one import (max 2000)');
  }

  const errors = [];
  const created = [];
  const skipped = [];

  for (let index = 0; index < incomingDrivers.length; index += 1) {
    const raw = incomingDrivers[index] || {};
    const name = String(raw.name || '').trim();
    const phone = String(raw.phone || raw.mobile || '').replace(/\D/g, '');
    const email = String(raw.email || '').trim().toLowerCase();
    const gender = String(raw.gender || '').trim().toLowerCase();
    const serviceLocationInput = String(
      raw.service_location || raw.serviceLocation || '',
    ).trim();
    const transportType = normalizeImportTransportType(
      raw.transport_type || raw.transportType,
    );
    const vehicleInput = String(raw.vehicle_type || raw.vehicleType || '').trim();

    if (!name) {
      errors.push({ index, field: 'name', message: 'Name is required' });
      continue;
    }

    if (!/^\d{10}$/.test(phone)) {
      errors.push({
        index,
        field: 'phone',
        message: 'A valid 10-digit phone number is required',
      });
      continue;
    }

    if (email && !EMAIL_REGEX.test(email)) {
      errors.push({ index, field: 'email', message: 'A valid email address is required' });
      continue;
    }

    if (!serviceLocationInput) {
      errors.push({
        index,
        field: 'service_location',
        message: 'Service location is required',
      });
      continue;
    }

    const existingDriver = await Driver.findOne({ phone }).lean();
    if (existingDriver) {
      skipped.push({ index, phone, id: String(existingDriver._id) });
      continue;
    }

    const serviceLocation = await resolveServiceLocationForImport(serviceLocationInput);
    const normalizedVehicleInput = vehicleInput || transportType || 'car';
    const vehicleRecord = await resolveVehicleForImport(
      normalizedVehicleInput,
      transportType,
    );
    const vehicleType = normalizeImportVehicleType(
      normalizedVehicleInput,
      vehicleRecord,
    );

    try {
      const driver = await Driver.create({
        name,
        phone,
        email,
        gender,
        password: await hashPassword(phone),
        vehicleType,
        vehicleTypeId: vehicleRecord?._id || null,
        vehicleMake: String(raw.vehicle_make || raw.vehicleMake || '').trim(),
        vehicleModel: String(raw.vehicle_model || raw.vehicleModel || '').trim(),
        vehicleColor: String(raw.vehicle_color || raw.vehicleColor || '').trim(),
        vehicleNumber: String(raw.vehicle_number || raw.vehicleNumber || '').trim(),
        registerFor: transportType,
        city:
          serviceLocation?.service_location_name ||
          serviceLocation?.name ||
          serviceLocationInput ||
          String(raw.country || '').trim(),
        approve: raw.approve !== undefined ? Boolean(raw.approve) : true,
        status: raw.status || (raw.approve === false ? 'pending' : 'approved'),
        onboarding: {
          importCountry: String(raw.country || '').trim(),
          importServiceLocation: serviceLocationInput,
          importedByAdmin: true,
        },
      });

      created.push(serializeDriver(driver.toObject()));
    } catch (error) {
      errors.push({ index, message: error?.message || 'Failed to create driver' });
    }
  }

  return {
    created_count: created.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    created,
    skipped: skipped.slice(0, 200),
    errors: errors.slice(0, 200),
  };
};

export const createUser = async (payload) => {
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || payload.mobile || '').replace(/\D/g, '');
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const passwordConfirmation = String(payload.password_confirmation ?? payload.confirmPassword ?? '');
  const gender = String(payload.gender || '').trim().toLowerCase();
  const profileImage = String(payload.profileImage || '').trim();

  if (!name) throw new ApiError(400, 'User name is required');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'A valid 10-digit phone number is required');
  if (!email) throw new ApiError(400, 'Email is required');
  if (!EMAIL_REGEX.test(email)) throw new ApiError(400, 'A valid email address is required');
  if (!gender || !VALID_USER_GENDERS.has(gender)) throw new ApiError(400, 'A valid gender is required');
  if (!password.trim()) throw new ApiError(400, 'Password is required');
  if (password.length < 5) throw new ApiError(400, 'Password must be at least 5 characters');
  if (!passwordConfirmation) throw new ApiError(400, 'Confirm password is required');
  if (password !== passwordConfirmation) throw new ApiError(400, 'Passwords do not match');

  const existingUser = await User.findOne({ phone });
  if (existingUser) {
    throw new ApiError(409, 'Phone number already exists');
  }

  const user = await User.create({
    name,
    phone,
    email,
    gender,
    profileImage,
    password: await hashPassword(password),
    wallet_balance: Number(payload.wallet_balance || 0),
    active: payload.active ?? true,
    isActive: payload.active ?? true,
  });

  return serializeUser(user.toObject());
};

export const getOwnerDashboardData = async () => {
  const [
    totalOwners,
    approvedOwners,
    totalDrivers,
    approvedDrivers,
    todayRides,
  ] = await Promise.all([
    Owner.countDocuments(),
    Owner.countDocuments({ approve: true }),
    Driver.countDocuments(),
    Driver.countDocuments({ approve: true }),
    Ride.countDocuments({
      createdAt: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999)),
      },
    }),
  ]);

  return {
    total_owners: totalOwners,
    approved_owners: approvedOwners,
    pending_owners: totalOwners - approvedOwners,
    total_drivers: totalDrivers,
    approved_drivers: approvedDrivers,
    pending_drivers: totalDrivers - approvedDrivers,
    total_fleets: 0, // Placeholder
    approved_fleets: 0,
    pending_fleets: 0,
    today_earnings: 0,
    today_cash: 0,
    today_wallet: 0,
    today_online: 0,
    admin_commission: 0,
    driver_earnings: 0,
    overall_earnings: 0,
    overall_cash: 0,
    overall_wallet: 0,
    overall_online: 0,
    overall_admin_comm: 0,
    overall_owner_earnings: 0,
  };
};

export const updateUser = async (id, payload) => {
  const update = {};

  if (payload.name !== undefined) update.name = String(payload.name || '').trim();
  if (payload.phone !== undefined || payload.mobile !== undefined) {
    update.phone = String(payload.phone || payload.mobile || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(update.phone)) {
      throw new ApiError(400, 'A valid 10-digit phone number is required');
    }
  }
  if (payload.email !== undefined) {
    update.email = String(payload.email || '').trim().toLowerCase();
    if (update.email && !EMAIL_REGEX.test(update.email)) {
      throw new ApiError(400, 'A valid email address is required');
    }
  }
  if (payload.gender !== undefined) {
    update.gender = String(payload.gender || '').trim().toLowerCase();
    if (update.gender && !VALID_USER_GENDERS.has(update.gender)) {
      throw new ApiError(400, 'A valid gender is required');
    }
  }
  if (payload.profileImage !== undefined) update.profileImage = String(payload.profileImage || '').trim();
  if (payload.wallet_balance !== undefined) update.wallet_balance = Number(payload.wallet_balance || 0);
  if (payload.active !== undefined) {
    update.active = Boolean(payload.active);
    update.isActive = Boolean(payload.active);
  }
  if (payload.password) {
    update.password = await hashPassword(String(payload.password));
  }

  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  );

  if (!user) throw new ApiError(404, 'User not found');
  return serializeUser(user.toObject());
};

export const deleteUser = async (id) => {
  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: null },
    {
      $set: {
        deletedAt: new Date(),
        deletion_reason: 'admin_delete',
        active: false,
        isActive: false,
      },
    },
    { returnDocument: 'after' },
  );

  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return true;
};

export const listDeletedUsers = async ({ page = 1, limit = 50 }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;

  const [users, total] = await Promise.all([
    User.find({ deletedAt: { $ne: null } })
      .sort({ deletedAt: -1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    User.countDocuments({ deletedAt: { $ne: null } }),
  ]);

  return {
    results: users.map(serializeUser),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const restoreDeletedUser = async (id) => {
  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: { $ne: null } },
    {
      $set: {
        deletedAt: null,
        deletion_reason: '',
        active: true,
      },
    },
    { returnDocument: 'after', runValidators: true },
  );

  if (!user) {
    throw new ApiError(404, 'Deleted user not found');
  }

  return serializeUser(user.toObject());
};

export const permanentlyDeleteDeletedUser = async (id) => {
  const deleted = await User.findOneAndDelete({ _id: id, deletedAt: { $ne: null } });

  if (!deleted) {
    throw new ApiError(404, 'Deleted user not found');
  }
  return true;
};

export const listUserDeletionRequests = async ({ page = 1, limit = 50, status = 'pending' } = {}) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const requestedStatus = String(status || 'pending').toLowerCase();
  const start = (safePage - 1) * safeLimit;
  const statusQuery =
    requestedStatus === 'all'
      ? { $in: ['pending', 'approved', 'rejected'] }
      : requestedStatus;
  const query = {
    'deletionRequest.status': statusQuery,
    deletedAt: null,
  };

  const [users, total] = await Promise.all([
    User.find(query)
      .sort({ 'deletionRequest.requestedAt': -1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    User.countDocuments(query),
  ]);

  return {
    results: users.map(serializeUser),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const approveUserDeletionRequest = async (id, adminId) => {
  const now = new Date();
  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: null, 'deletionRequest.status': 'pending' },
    {
      $set: {
        deletedAt: now,
        active: false,
        isActive: false,
        deletion_reason: 'user_delete_request',
        'deletionRequest.status': 'approved',
        'deletionRequest.reviewedAt': now,
        'deletionRequest.reviewedBy': adminId || null,
        'deletionRequest.adminNote': '',
      },
    },
    { returnDocument: 'after', runValidators: true },
  );

  if (!user) throw new ApiError(404, 'Pending user deletion request not found');
  notifyUserAccountDeleted(user._id);
  return serializeUser(user.toObject());
};

export const rejectUserDeletionRequest = async (id, payload = {}, adminId) => {
  const now = new Date();
  const adminNote = String(payload.adminNote || payload.note || '').trim();
  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: null, 'deletionRequest.status': 'pending' },
    {
      $set: {
        active: true,
        isActive: true,
        'deletionRequest.status': 'rejected',
        'deletionRequest.reviewedAt': now,
        'deletionRequest.reviewedBy': adminId || null,
        'deletionRequest.adminNote': adminNote,
      },
    },
    { returnDocument: 'after', runValidators: true },
  );

  if (!user) throw new ApiError(404, 'Pending user deletion request not found');
  return serializeUser(user.toObject());
};

export const getUserById = async (id) => {
  const user = await User.findById(id).lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const subscriptions = await UserSubscription.find({ userId: id })
    .sort({ active: -1, expiresAt: 1, createdAt: -1 })
    .populate('planId', 'name')
    .populate('vehicle_type_id', 'name')
    .lean();

  const activeSubscriptions = subscriptions.filter((item) => item.active !== false && String(item.status || '') === 'active');

  const rides = await Ride.find({
    userId: id,
    'feedback.rating': { $gte: 1 },
  })
    .sort({ completedAt: -1, createdAt: -1 })
    .populate('driverId', 'name')
    .lean();

  return {
    ...serializeUser(user),
    subscriptionSummary: {
      activeCount: activeSubscriptions.length,
      activePlans: activeSubscriptions.map((item) => ({
        id: String(item._id),
        planId: item.planId?._id ? String(item.planId._id) : String(item.planId || ''),
        name: item.name || item.planId?.name || '',
        status: item.status || 'active',
        benefit_type: item.benefit_type || 'limited',
        ride_limit: Number(item.ride_limit || 0),
        rides_used: Number(item.rides_used || 0),
        rides_remaining: String(item.benefit_type || '') === 'unlimited'
          ? null
          : Math.max(0, Number(item.ride_limit || 0) - Number(item.rides_used || 0)),
        vehicle_type: item.vehicle_type_id?._id
          ? {
            id: String(item.vehicle_type_id._id),
            name: item.vehicle_type_id.name || '',
          }
          : null,
        expiresAt: item.expiresAt || null,
      })),
    },
    reviews: rides.map((ride) => ({
      _id: ride._id,
      request_id: String(ride._id),
      rating: Number(ride.feedback?.rating || 0),
      comment: String(ride.feedback?.comment || '').trim(),
      createdAt: ride.feedback?.submittedAt || ride.completedAt || ride.createdAt || null,
      driver_id: ride.driverId
        ? {
          _id: ride.driverId._id || ride.driverId,
          name: ride.driverId.name || 'Unknown',
        }
        : null,
    })),
  };
};

const ensureDefaultDriverVehicleFields = async () => {
  const count = await DriverNeededDocument.countDocuments({ template_type: 'vehicle_field' });
  if (count > 0) {
    return;
  }

  await DriverNeededDocument.insertMany(buildDefaultDriverVehicleFieldConfigs(), { ordered: false });
};

export const listUserRequests = async (id) => {
  const user = await User.findById(id).lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const rides = await Ride.find({ userId: id }).sort({ createdAt: -1 }).populate('driverId', 'name').lean();

  return {
    results: rides.map((ride) => ({
      request_id: String(ride._id),
      trip_start_time: ride.createdAt,
      user_id: {
        _id: String(id),
        name: user.name || '',
      },
      driver_id: ride.driverId
        ? {
          _id: ride.driverId._id || ride.driverId,
          name: ride.driverId.name || 'Pending',
        }
        : null,
      is_completed: String(ride.status).toLowerCase() === 'completed',
      is_cancelled: String(ride.status).toLowerCase() === 'cancelled',
      is_paid: String(ride.status).toLowerCase() === 'completed',
      payment_type: 'cash',
      status: ride.status,
    })),
  };
};

export const listUserWalletHistory = async (id) => {
  const user = await User.findById(id).lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const wallet = await UserWallet.findOne({ userId: id }).lean();

  return {
    balance: wallet?.balance || 0,
    refundWallet: wallet?.refundWallet || 0,
    results: (wallet?.transactions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(t => ({
      _id: String(t._id),
      amount: t.amount,
      type: t.kind,
      description: t.title,
      createdAt: t.createdAt,
    })),
  };
};

export const adjustUserWallet = async (id, payload = {}) => {
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0');
  }

  const operation = String(payload.operation || 'credit').toLowerCase();
  if (!['credit', 'debit'].includes(operation)) {
    throw new ApiError(400, 'Operation must be credit or debit');
  }

  const user = await User.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  let wallet = await UserWallet.findOne({ userId: id });
  if (!wallet) {
    wallet = new UserWallet({ userId: id, balance: 0, refundWallet: 0, transactions: [] });
  }

  const currentBalance = wallet.balance || 0;
  const nextBalance = operation === 'credit' ? currentBalance + amount : currentBalance - amount;

  wallet.balance = nextBalance;
  wallet.transactions.push({
    kind: operation,
    amount,
    title: payload.description || `Admin adjustment (${operation})`,
  });

  await wallet.save();
  return { balance: Number(nextBalance.toFixed(2)) };
};

export const listDrivers = async ({ page = 1, limit = 50, status, search, approve, isOnline } = {}, currentAdmin = null) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;

  const query = { deletedAt: null };
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'drivers.view', 'drivers');
    Object.assign(query, buildServiceLocationScopeQuery(currentAdmin));
  }

  if (status) {
    query.status = status;
  }

  if (approve !== undefined) {
    query.approve = approve === 'true' || approve === true || approve === 1;
  }

  if (isOnline !== undefined) {
    query.isOnline = isOnline === 'true' || isOnline === true || isOnline === 1;
  }

  if (search) {
    const regex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { name: regex },
      { phone: regex },
      { email: regex },
      { vehicleNumber: regex }
    ];
  }

  const total = await Driver.countDocuments(query);

  const drivers = await Driver.find(query)
    .select(DRIVER_LIST_SELECT)
    .sort({ createdAt: -1 })
    .skip(start)
    .limit(safeLimit)
    .lean();

  const ownerIds = [
    ...new Set(
      drivers
        .map((driver) => String(driver.owner_id || ''))
        .filter(Boolean),
    ),
  ];
  const serviceLocationIds = [
    ...new Set(
      drivers
        .map((driver) => String(driver.service_location_id || ''))
        .filter(Boolean),
    ),
  ];

  const [owners, serviceLocations] = await Promise.all([
    ownerIds.length
      ? Owner.find({ _id: { $in: ownerIds } })
        .select('_id company_name owner_name name email mobile')
        .lean()
      : [],
    serviceLocationIds.length
      ? ServiceLocation.find({ _id: { $in: serviceLocationIds } })
        .select('_id service_location_name name country')
        .lean()
      : [],
  ]);

  const ownerMap = new Map(
    owners.map((owner) => [String(owner._id), owner]),
  );
  const serviceLocationMap = new Map(
    serviceLocations.map((location) => [String(location._id), location]),
  );

  const hydratedDrivers = drivers.map((driver) => ({
    ...driver,
    owner_id: driver.owner_id ? ownerMap.get(String(driver.owner_id)) || driver.owner_id : null,
    service_location_id: driver.service_location_id
      ? serviceLocationMap.get(String(driver.service_location_id)) || driver.service_location_id
      : null,
  }));

  return {
    results: hydratedDrivers.map(serializeDriverListItem),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const listDriverRatings = async ({ page = 1, limit = 50, search = '' }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;
  const term = String(search || '').trim();

  const query = { deletedAt: null };
  if (term) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: regex }, { phone: regex }, { email: regex }];
  }

  const [drivers, total] = await Promise.all([
    Driver.find(query).sort({ rating: -1, createdAt: -1 }).skip(start).limit(safeLimit).lean(),
    Driver.countDocuments(query),
  ]);

  return {
    results: drivers.map((driver) => ({
      _id: driver._id,
      name: driver.name || '',
      mobile: driver.phone || '',
      phone: driver.phone || '',
      email: driver.email || '',
      rating: Number(driver.ratingCount || 0) > 0 ? Number(driver.rating || 0) : 0,
      rating_count: Number(driver.ratingCount || 0),
      transport_type: driver.registerFor || driver.vehicleType || '',
    })),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const getDriverRatingDetail = async (id) => {
  const driver = await Driver.findById(id).lean();
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const rides = await Ride.find({ driverId: driver._id }).sort({ createdAt: -1 }).lean();

  return {
    driver: {
      _id: driver._id,
      name: driver.name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      rating: Number(driver.ratingCount || 0) > 0 ? Number(driver.rating || 0) : 0,
      rating_count: Number(driver.ratingCount || 0),
      transport_type: driver.registerFor || driver.vehicleType || '',
      vehicle_make: driver.vehicleMake || '',
      vehicle_model: driver.vehicleModel || '',
      vehicle_number: driver.vehicleNumber || '',
      image: driver.profile_image || driver.avatar || '',
      vehicle_image: 'https://img.freepik.com/free-vector/yellow-passenger-transport-taxi-car_1017-4886.jpg',
    },
    reviews: rides.map((ride) => ({
      _id: ride._id,
      request_id: String(ride._id),
      date: ride.createdAt,
      pickup_location: ride.pickupLocation?.coordinates
        ? `${ride.pickupLocation.coordinates[1]}, ${ride.pickupLocation.coordinates[0]}`
        : 'N/A',
      rating: Number(driver.ratingCount || 0) > 0 ? Number(driver.rating || 0) : 0,
    })),
  };
};

export const listNegativeBalanceDrivers = async ({ page = 1, limit = 50, search = '' }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;
  const term = String(search || '').trim();

  const query = { deletedAt: null, 'wallet.balance': { $lt: 0 } };
  if (term) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: regex }, { phone: regex }, { email: regex }];
  }

  const [drivers, total, totals] = await Promise.all([
    Driver.find(query)
      .sort({ 'wallet.balance': 1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    Driver.countDocuments(query),
    Driver.aggregate([
      { $match: query },
      { $group: { _id: null, total_outstanding: { $sum: { $abs: '$wallet.balance' } } } },
    ]),
  ]);

  const totalOutstanding = Number(totals?.[0]?.total_outstanding || 0);

  return {
    results: drivers.map((driver) => ({
      _id: driver._id,
      name: driver.name || '',
      service_location_name: driver.city || '',
      email: driver.email || '',
      mobile: driver.phone || '',
      transport_type: driver.registerFor || driver.vehicleType || '',
      approve: Boolean(driver.approve),
      status: driver.status || (driver.approve ? 'approved' : 'pending'),
      balance: Number(driver.wallet?.balance || 0),
    })),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
    summary: {
      total_outstanding: totalOutstanding,
    },
  };
};

export const listDriverWithdrawalSummaries = async ({ page = 1, limit = 50, search = '' }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;
  const term = String(search || '').trim();

  const match = { status: 'pending' };
  let matchedDriverIds = null;

  if (term) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const drivers = await Driver.find({ deletedAt: null, $or: [{ name: regex }, { phone: regex }, { email: regex }] })
      .select('_id')
      .lean();
    matchedDriverIds = drivers.map((d) => d._id);
    if (matchedDriverIds.length === 0) {
      return {
        results: [],
        paginator: { current_page: safePage, per_page: safeLimit, total: 0, last_page: 1 },
      };
    }
    match.driver_id = { $in: matchedDriverIds };
  }

  const groupPipeline = [
    { $match: match },
    {
      $group: {
        _id: '$driver_id',
        pending_count: { $sum: 1 },
        pending_amount: { $sum: '$amount' },
        last_request_at: { $max: '$createdAt' },
      },
    },
  ];

  const [groups, countRows] = await Promise.all([
    WithdrawalRequest.aggregate([
      ...groupPipeline,
      { $sort: { last_request_at: -1 } },
      { $skip: start },
      { $limit: safeLimit },
    ]),
    WithdrawalRequest.aggregate([...groupPipeline, { $count: 'total' }]),
  ]);

  const total = Number(countRows?.[0]?.total || 0);
  const driverIds = groups.map((g) => g._id).filter(Boolean);
  const drivers = await Driver.find({ _id: { $in: driverIds } }).lean();
  const latestRequests = driverIds.length
    ? await WithdrawalRequest.find({
      driver_id: { $in: driverIds },
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .lean()
    : [];
  const byId = new Map(drivers.map((d) => [String(d._id), d]));
  const latestRequestByDriverId = new Map();

  latestRequests.forEach((request) => {
    const key = String(request.driver_id || '');
    if (key && !latestRequestByDriverId.has(key)) {
      latestRequestByDriverId.set(key, request);
    }
  });

  return {
    results: groups.map((row) => {
      const driver = byId.get(String(row._id));
      const latestRequest = latestRequestByDriverId.get(String(row._id));
      return {
        driver_id: row._id,
        latest_request_id: latestRequest?._id || null,
        last_request_at: row.last_request_at,
        pending_count: Number(row.pending_count || 0),
        pending_amount: Number(row.pending_amount || 0),
        driver: driver
          ? {
            _id: driver._id,
            name: driver.name || '',
            mobile: driver.phone || '',
            email: driver.email || '',
            bankDetails: {
              accountHolderName:
                latestRequest?.bank_details_snapshot?.accountHolderName || driver.bankDetails?.accountHolderName || '',
              upiId: latestRequest?.bank_details_snapshot?.upiId || driver.bankDetails?.upiId || '',
              qrCodeImage: latestRequest?.bank_details_snapshot?.qrCodeImage || driver.bankDetails?.qrCodeImage || '',
              accountNumber:
                latestRequest?.bank_details_snapshot?.accountNumber || driver.bankDetails?.accountNumber || '',
              ifsc: latestRequest?.bank_details_snapshot?.ifsc || driver.bankDetails?.ifsc || '',
              branchName: latestRequest?.bank_details_snapshot?.branchName || driver.bankDetails?.branchName || '',
              updatedAt:
                latestRequest?.bank_details_snapshot?.updatedAt || driver.bankDetails?.updatedAt || null,
            },
          }
          : null,
      };
    }),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const listDriverWithdrawals = async ({ driverId, page = 1, limit = 50 }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;

  const driver = await Driver.findById(driverId).lean();
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const [items, total] = await Promise.all([
    WithdrawalRequest.find({ driver_id: driver._id }).sort({ createdAt: -1 }).skip(start).limit(safeLimit).lean(),
    WithdrawalRequest.countDocuments({ driver_id: driver._id }),
  ]);

  return {
    driver: {
      _id: driver._id,
      name: driver.name || '',
      mobile: driver.phone || '',
      email: driver.email || '',
      city: driver.city || '',
      vehicle_number: driver.vehicleNumber || '',
      vehicle_type: driver.vehicleType || '',
      register_for: driver.registerFor || '',
      wallet: await serializeDriverWallet(driver),
      bankDetails: {
        accountHolderName: driver.bankDetails?.accountHolderName || '',
        upiId: driver.bankDetails?.upiId || '',
        qrCodeImage: driver.bankDetails?.qrCodeImage || '',
        accountNumber: driver.bankDetails?.accountNumber || '',
        ifsc: driver.bankDetails?.ifsc || '',
        branchName: driver.bankDetails?.branchName || '',
        updatedAt: driver.bankDetails?.updatedAt || null,
      },
    },
    results: items.map((item) => ({
      _id: item._id,
      amount: Number(item.amount || 0),
      requested_currency: 'INR',
      status: item.status || 'pending',
      payment_method: item.payment_method || '',
      bank_details_snapshot: {
        accountHolderName: item.bank_details_snapshot?.accountHolderName || '',
        upiId: item.bank_details_snapshot?.upiId || '',
        qrCodeImage: item.bank_details_snapshot?.qrCodeImage || '',
        accountNumber: item.bank_details_snapshot?.accountNumber || '',
        ifsc: item.bank_details_snapshot?.ifsc || '',
        branchName: item.bank_details_snapshot?.branchName || '',
        updatedAt: item.bank_details_snapshot?.updatedAt || null,
      },
      createdAt: item.createdAt,
    })),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const getDriverWithdrawalContextByRequestId = async ({ requestId, page = 1, limit = 50 }) => {
  const request = await WithdrawalRequest.findById(requestId).lean();

  if (!request || !request.driver_id) {
    throw new ApiError(404, 'Withdrawal request not found');
  }

  return listDriverWithdrawals({
    driverId: request.driver_id,
    page,
    limit,
  });
};

export const approveDriverWithdrawalRequest = async (requestId, adminId = null) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const request = await WithdrawalRequest.findById(requestId).session(session);
    if (!request || !request.driver_id) {
      throw new ApiError(404, 'Withdrawal request not found');
    }

    if (request.status !== 'pending') {
      throw new ApiError(400, 'Only pending withdrawal requests can be approved');
    }

    const driver = await Driver.findById(request.driver_id).session(session);
    if (!driver) {
      throw new ApiError(404, 'Driver not found');
    }

    const requestAmount = Math.round(Number(request.amount || 0) * 100) / 100;
    const currentBalance = Math.round(Number(driver.wallet?.balance || 0) * 100) / 100;

    if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
      throw new ApiError(400, 'Withdrawal request amount is invalid');
    }

    if (currentBalance < requestAmount) {
      throw new ApiError(400, 'Driver wallet balance is not enough for this withdrawal');
    }

    const walletResult = await applyDriverWalletAdjustment({
      driverId: driver._id,
      amount: -requestAmount,
      type: 'adjustment',
      description: 'Driver withdrawal approved by admin',
      metadata: {
        withdrawalRequestId: String(request._id),
        approvedBy: adminId ? String(adminId) : null,
        paymentMethod: request.payment_method || 'bank_transfer',
      },
      session,
    });

    request.status = 'completed';
    await request.save({ session });

    await session.commitTransaction();

    emitToDriver(driver._id, 'driver:wallet:updated', {
      wallet: walletResult.wallet,
      transaction: walletResult.transaction,
    });

    return {
      request: {
        _id: request._id,
        driver_id: request.driver_id,
        amount: requestAmount,
        payment_method: request.payment_method || '',
        status: request.status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
      wallet: walletResult.wallet,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const rejectDriverWithdrawalRequest = async (requestId) => {
  const request = await WithdrawalRequest.findById(requestId);
  if (!request || !request.driver_id) {
    throw new ApiError(404, 'Withdrawal request not found');
  }

  if (request.status !== 'pending') {
    throw new ApiError(400, 'Only pending withdrawal requests can be rejected');
  }

  request.status = 'cancelled';
  await request.save();

  return {
    request: {
      _id: request._id,
      driver_id: request.driver_id,
      amount: Number(request.amount || 0),
      payment_method: request.payment_method || '',
      status: request.status,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    },
  };
};

export const adjustDriverWallet = async (id, payload = {}) => {
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0');
  }

  const operation = String(payload.operation || 'credit').toLowerCase();
  if (!['credit', 'debit'].includes(operation)) {
    throw new ApiError(400, 'Operation must be credit or debit');
  }

  const normalizedAmount = Math.round(amount * 100) / 100;
  const signedAmount = operation === 'credit' ? normalizedAmount : -normalizedAmount;
  const description = payload.description || `Admin adjustment (${operation})`;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const driver = await Driver.findById(id).session(session);
    if (!driver) {
      throw new ApiError(404, 'Driver not found');
    }

    const currentBalance = Number(driver.wallet?.balance || 0);
    const cashLimit = Number(driver.wallet?.cashLimit ?? 500);
    const nextBalance = Math.round((currentBalance + signedAmount) * 100) / 100;
    const isBlockedAfter = nextBalance < -cashLimit;

    driver.wallet = driver.wallet || {};
    driver.wallet.balance = nextBalance;
    driver.wallet.cashLimit = cashLimit;
    driver.wallet.isBlocked = isBlockedAfter;
    driver.markModified('wallet');
    await driver.save({ session });

    await WalletTransaction.create(
      [
        {
          driverId: id,
          type: 'adjustment',
          amount: signedAmount,
          balanceBefore: currentBalance,
          balanceAfter: nextBalance,
          cashLimit,
          isBlockedAfter,
          description,
          metadata: {
            source: 'admin',
            operation,
            rawAmount: normalizedAmount,
          },
        },
      ],
      { session },
    );

    await session.commitTransaction();
    return { balance: Number(nextBalance.toFixed(2)) };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const listDriverWalletHistory = async (id) => {
  const driver = await Driver.findById(id).lean();

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const transactions = await WalletTransaction.find({ driverId: id })
    .sort({ createdAt: -1 })
    .lean();

  return {
    balance: Number(driver.wallet?.balance || 0),
    results: transactions.map(t => ({
      _id: String(t._id),
      amount: t.amount,
      type: t.metadata?.operation || t.kind || (t.amount < 0 ? 'debit' : 'credit'),
      description: t.description || t.title || '',
      createdAt: t.createdAt,
    })),
  };
};

export const adjustOwnerWallet = async (id, payload = {}) => {
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Amount must be greater than 0');
  }

  const operation = String(payload.operation || 'credit').toLowerCase();
  if (!['credit', 'debit'].includes(operation)) {
    throw new ApiError(400, 'Operation must be credit or debit');
  }

  const owner = await Owner.findById(id);
  if (!owner) {
    throw new ApiError(404, 'Owner not found');
  }

  const currentBalance = Number(owner.wallet?.balance || 0);
  const nextBalance = operation === 'credit' ? currentBalance + amount : currentBalance - amount;

  owner.wallet = owner.wallet || {};
  owner.wallet.balance = nextBalance;
  owner.markModified('wallet');
  await owner.save();

  await OwnerWalletTransaction.create({
    ownerId: id,
    amount,
    kind: operation,
    title: payload.description || `Admin adjustment (${operation})`,
    balance: nextBalance
  });

  return { balance: Number(nextBalance.toFixed(2)) };
};

export const listOwnerWalletHistory = async (id) => {
  const owner = await Owner.findById(id).lean();

  if (!owner) {
    throw new ApiError(404, 'Owner not found');
  }

  const transactions = await OwnerWalletTransaction.find({ ownerId: id })
    .sort({ createdAt: -1 })
    .lean();

  return {
    balance: Number(owner.wallet?.balance || 0),
    results: transactions.map(t => ({
      _id: String(t._id),
      amount: t.amount,
      type: t.kind,
      description: t.title,
      createdAt: t.createdAt,
    })),
  };
};

export const listDeletedDrivers = async ({ page = 1, limit = 50 }) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const start = (safePage - 1) * safeLimit;

  const [drivers, total] = await Promise.all([
    Driver.find({ deletedAt: { $ne: null } })
      .select(DRIVER_LIST_SELECT)
      .sort({ deletedAt: -1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    Driver.countDocuments({ deletedAt: { $ne: null } }),
  ]);

  return {
    results: drivers.map(serializeDriverListItem),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const listDriverDeletionRequests = async ({ page = 1, limit = 50, status = 'pending' } = {}) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const requestedStatus = String(status || 'pending').toLowerCase();
  const start = (safePage - 1) * safeLimit;
  const statusQuery =
    requestedStatus === 'all'
      ? { $in: ['pending', 'approved', 'rejected'] }
      : requestedStatus;

  const query = {
    'deletionRequest.status': statusQuery,
    deletedAt: null,
  };

  const [drivers, total] = await Promise.all([
    Driver.find(query)
      .select(DRIVER_LIST_SELECT)
      .sort({ 'deletionRequest.requestedAt': -1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    Driver.countDocuments(query),
  ]);

  return {
    results: drivers.map(serializeDriverListItem),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const approveDriverDeletionRequest = async (id, adminId) => {
  const now = new Date();
  const driver = await Driver.findOneAndDelete(
    { _id: id, deletedAt: null, 'deletionRequest.status': 'pending' },
  );

  if (!driver) throw new ApiError(404, 'Pending driver deletion request not found');

  const removedDriver = driver.toObject ? driver.toObject() : driver;

  return serializeDriver({
    ...removedDriver,
    deletedAt: now,
    approve: false,
    status: 'inactive',
    deletion_reason: 'driver_delete_request',
    deletionRequest: {
      ...(removedDriver.deletionRequest || {}),
      status: 'approved',
      reviewedAt: now,
      reviewedBy: adminId || null,
      adminNote: '',
    },
  });
};

export const rejectDriverDeletionRequest = async (id, payload = {}, adminId) => {
  const now = new Date();
  const adminNote = String(payload.adminNote || payload.note || '').trim();
  const driver = await Driver.findOneAndUpdate(
    { _id: id, deletedAt: null, 'deletionRequest.status': 'pending' },
    {
      $set: {
        approve: true,
        status: 'approved',
        'deletionRequest.status': 'rejected',
        'deletionRequest.reviewedAt': now,
        'deletionRequest.reviewedBy': adminId || null,
        'deletionRequest.adminNote': adminNote,
      },
    },
    { returnDocument: 'after', runValidators: true },
  );

  if (!driver) throw new ApiError(404, 'Pending driver deletion request not found');
  return serializeDriver(driver.toObject());
};

export const restoreDeletedDriver = async (id) => {
  const driver = await Driver.findOneAndUpdate(
    { _id: id, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } },
    { returnDocument: 'after' },
  );

  if (!driver) {
    throw new ApiError(404, 'Deleted driver not found');
  }

  return serializeDriver(driver.toObject ? driver.toObject() : driver);
};

export const permanentlyDeleteDeletedDriver = async (id) => {
  const deleted = await Driver.findOneAndDelete({ _id: id, deletedAt: { $ne: null } });
  if (!deleted) {
    throw new ApiError(404, 'Deleted driver not found');
  }
  return true;
};

export const createDriver = async (payload = {}, currentAdmin = null) => {
  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || payload.mobile || '').replace(/\D/g, '');
  const password = String(payload.password || '').trim();
  const passwordConfirmation = String(
    payload.password_confirmation || payload.passwordConfirmation || '',
  ).trim();
  const email = String(payload.email || '').trim();

  if (!name) throw new ApiError(400, 'Driver name is required');
  if (!phone) throw new ApiError(400, 'Driver phone is required');
  if (!password || password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }
  if (passwordConfirmation && password !== passwordConfirmation) {
    throw new ApiError(400, 'Password confirmation does not match');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'drivers.view', 'drivers');
  }

  const existing = await Driver.findOne({ phone }).lean();
  if (existing) throw new ApiError(409, 'Driver phone already exists');

  const registerFor = normalizeDriverRegisterFor(
    payload.transport_type || payload.transportType || payload.register_for || payload.registerFor || 'taxi',
  );

  let city = String(payload.city || '').trim();
  const serviceLocationId = payload.service_location_id || payload.area || payload.service_location;
  if (currentAdmin && serviceLocationId) {
    assertServiceLocationAccess(currentAdmin, serviceLocationId);
  }
  if (serviceLocationId) {
    const location = await ServiceLocation.findById(serviceLocationId).lean();
    if (location) {
      city = location.service_location_name || location.name || city;
    }
  }

  const vehicleTypeId =
    payload.vehicle_type_id || payload.vehicleTypeId || payload.vehicleType?._id || payload.vehicleType?.id || null;
  const vehicleRecord =
    vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId)
      ? await Vehicle.findById(vehicleTypeId).lean()
      : null;
  const normalizedVehicleInput = String(
    vehicleRecord?.name ||
    payload.vehicle_type ||
    payload.vehicleType?.name ||
    payload.vehicleType ||
    payload.car_type ||
    registerFor ||
    'car',
  ).trim();
  const vehicleType = normalizeImportVehicleType(
    normalizedVehicleInput,
    vehicleRecord,
  );
  const vehicleIconType = vehicleType;
  const profilePicture = String(payload.profile_picture || payload.profilePicture || '').trim();
  const status = String(
    payload.status || (payload.approve === false ? 'pending' : 'approved'),
  )
    .trim()
    .toLowerCase();
  const approve =
    payload.approve !== undefined
      ? Boolean(payload.approve)
      : !['pending', 'disapproved', 'inactive', 'rejected'].includes(status);
  const serviceCategories = normalizeDriverServiceCategories(
    payload.serviceCategories ?? payload.service_categories,
    registerFor,
  );
  const onboardingPayload =
    payload.onboarding && typeof payload.onboarding === 'object' && !Array.isArray(payload.onboarding)
      ? payload.onboarding
      : {};
  const documents =
    payload.documents && typeof payload.documents === 'object' && !Array.isArray(payload.documents)
      ? payload.documents
      : {};

  const driver = await Driver.create({
    name,
    phone,
    email,
    owner_id: payload.owner_id && mongoose.isValidObjectId(payload.owner_id) ? toObjectId(payload.owner_id) : null,
    service_location_id:
      serviceLocationId && mongoose.isValidObjectId(serviceLocationId) ? toObjectId(serviceLocationId) : null,
    country: payload.country || null,
    profile_picture: profilePicture,
    profileImage: profilePicture,
    gender: String(payload.gender || '').trim(),
    password: await hashPassword(password),
    vehicleType,
    vehicleIconType,
    vehicleTypeId: vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId) ? toObjectId(vehicleTypeId) : null,
    vehicleMake: String(payload.vehicle_make || payload.vehicleMake || payload.car_make || '').trim(),
    vehicleModel: String(payload.vehicle_model || payload.vehicleModel || payload.car_model || '').trim(),
    vehicleColor: String(payload.vehicle_color || payload.vehicleColor || payload.car_color || '').trim(),
    vehicleNumber: String(payload.vehicle_number || payload.vehicleNumber || payload.car_number || '').trim(),
    registerFor,
    serviceCategories,
    city,
    approve,
    status,
    documents,
    onboarding: {
      ...onboardingPayload,
      role: 'driver',
      createdByAdmin: true,
    },
  });

  return serializeDriver(driver.toObject());
};

export const updateDriver = async (id, payload, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'drivers.view', 'drivers');
    const existingDriver = await Driver.findById(id).select('service_location_id').lean();
    if (!existingDriver) {
      throw new ApiError(404, 'Driver not found');
    }
    assertServiceLocationAccess(currentAdmin, existingDriver.service_location_id);
  }

  const update = {};

  if (payload.name !== undefined) {
    update.name = String(payload.name || '').trim();
  }

  const phoneValue = payload.phone ?? payload.mobile;
  if (phoneValue !== undefined) {
    update.phone = String(phoneValue || '').trim();
  }

  if (payload.email !== undefined) {
    update.email = String(payload.email || '').trim();
  }

  if (payload.gender !== undefined) {
    update.gender = String(payload.gender || '').trim();
  }

  const transportTypeValue =
    payload.transport_type ?? payload.transportType ?? payload.register_for ?? payload.registerFor;
  if (transportTypeValue !== undefined) {
    update.registerFor = normalizeDriverRegisterFor(transportTypeValue);
  }

  const vehicleTypeValue = payload.vehicle_type ?? payload.vehicleType ?? payload.car_type;
  if (vehicleTypeValue !== undefined) {
    update.vehicleType = String(vehicleTypeValue || '').trim().toLowerCase() || 'car';
  }

  const vehicleTypeId =
    payload.vehicle_type_id ?? payload.vehicleTypeId ?? payload.vehicleType?._id ?? payload.vehicleType?.id;
  if (vehicleTypeId !== undefined) {
    update.vehicleTypeId =
      vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId) ? toObjectId(vehicleTypeId) : null;
  }

  if (payload.vehicle_make !== undefined || payload.vehicleMake !== undefined || payload.car_make !== undefined) {
    update.vehicleMake = String(payload.vehicle_make ?? payload.vehicleMake ?? payload.car_make ?? '').trim();
  }

  if (payload.vehicle_model !== undefined || payload.vehicleModel !== undefined || payload.car_model !== undefined) {
    update.vehicleModel = String(payload.vehicle_model ?? payload.vehicleModel ?? payload.car_model ?? '').trim();
  }

  if (payload.vehicle_color !== undefined || payload.vehicleColor !== undefined || payload.car_color !== undefined) {
    update.vehicleColor = String(payload.vehicle_color ?? payload.vehicleColor ?? payload.car_color ?? '').trim();
  }

  if (payload.vehicle_number !== undefined || payload.vehicleNumber !== undefined || payload.car_number !== undefined) {
    update.vehicleNumber = String(payload.vehicle_number ?? payload.vehicleNumber ?? payload.car_number ?? '').trim();
  }

  const serviceLocationValue = payload.service_location_id ?? payload.area ?? payload.service_location;
  if (serviceLocationValue !== undefined) {
    if (currentAdmin && serviceLocationValue) {
      assertServiceLocationAccess(currentAdmin, serviceLocationValue);
    }
    update.service_location_id =
      serviceLocationValue && mongoose.isValidObjectId(serviceLocationValue)
        ? toObjectId(serviceLocationValue)
        : null;
  }

  const zoneValue = payload.zone_id ?? payload.zoneId ?? payload.zone;
  if (zoneValue !== undefined) {
    if (currentAdmin && zoneValue) {
      await assertZoneAccess(currentAdmin, zoneValue);
    }

    if (zoneValue && mongoose.isValidObjectId(zoneValue)) {
      const zone = await Zone.findById(zoneValue).select('_id service_location_id').lean();
      if (!zone) {
        throw new ApiError(404, 'Zone not found');
      }
      update.zoneId = toObjectId(zone._id);
      update.service_location_id = zone.service_location_id ? toObjectId(zone.service_location_id) : null;
    } else {
      update.zoneId = null;
    }
  }

  if (payload.country !== undefined) {
    update.country = payload.country || null;
  }

  if ('approve' in payload) {
    update.approve = Boolean(payload.approve);
  }

  if (payload.status !== undefined) {
    update.status = String(payload.status);
  } else if ('approve' in payload) {
    update.status = update.approve ? 'approved' : 'pending';
  }

  if (payload.documents !== undefined) {
    update.documents = payload.documents;
  }

  if (payload.onboarding !== undefined) {
    update.onboarding = payload.onboarding;
  }

  const driver = await Driver.findByIdAndUpdate(id, update, { returnDocument: 'after' });
  if (!driver) throw new ApiError(404, 'Driver not found');
  return serializeDriver(driver);
};

export const updateDriverPassword = async (id, password) => {
  if (!password || String(password).length < 4) {
    throw new ApiError(400, 'Password must be at least 4 characters');
  }
  const driver = await Driver.findByIdAndUpdate(
    id,
    {
      password: await hashPassword(password),
      password_last_updated_at: new Date(),
    },
    { returnDocument: 'after' },
  );

  if (!driver) throw new ApiError(404, 'Driver not found');
  return serializeDriver(driver);
};

export const deleteDriver = async (id) => {
  const deleted = await Driver.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Driver not found');
  }
  return true;
};

export const getDriverById = async (id, currentAdmin = null) => {
  const driver = await Driver.findById(id)
    .populate('zoneId', 'name service_location_id')
    .lean();
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'drivers.view', 'drivers');
    assertServiceLocationAccess(currentAdmin, driver.service_location_id);
  }
  return serializeDriver(driver);
};

export const getDriverProfile = async (id) => {
  const driver = await Driver.findById(id).lean();
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const [rides, walletTransactions] = await Promise.all([
    Ride.find({ driverId: driver._id }).sort({ createdAt: -1 }).lean(),
    WalletTransaction.find({ driverId: driver._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const isCompleted = (ride) => String(ride.status || '').toLowerCase() === 'completed';
  const isCancelled = (ride) => String(ride.status || '').toLowerCase() === 'cancelled';
  const isOngoing = (ride) => !isCompleted(ride) && !isCancelled(ride);

  const completedRides = rides.filter(isCompleted);
  const cancelledRides = rides.filter(isCancelled);
  const ongoingRides = rides.filter(isOngoing);
  const todayRides = rides.filter((ride) => ride.createdAt && ride.createdAt >= startOfDay);
  const todayCompleted = completedRides.filter((ride) =>
    (ride.completedAt || ride.createdAt) >= startOfDay
  );
  const todayCancelled = cancelledRides.filter((ride) =>
    (ride.completedAt || ride.createdAt) >= startOfDay
  );

  const sum = (items, field) =>
    items.reduce((total, item) => total + Number(item?.[field] || 0), 0);

  const totalEarnings = sum(completedRides, 'fare');
  const todayEarnings = sum(todayCompleted, 'fare');
  const driverEarnings = completedRides.reduce((total, ride) => {
    const fare = Number(ride?.fare || 0);
    const commission = Number(ride?.commissionAmount || 0);
    const earning = Number(ride?.driverEarnings ?? Math.max(fare - commission, 0));
    return total + earning;
  }, 0);
  const adminCommission = completedRides.reduce((total, ride) => {
    const fare = Number(ride?.fare || 0);
    const explicitCommission = ride?.commissionAmount;
    const fallbackCommission = Math.max(fare - Number(ride?.driverEarnings || 0), 0);
    return total + Number(explicitCommission ?? fallbackCommission);
  }, 0);
  const byCash = sum(completedRides.filter((r) => r.paymentMethod === 'cash'), 'fare');
  const byCard = sum(completedRides.filter((r) => r.paymentMethod === 'online'), 'fare');
  const spendAmount = walletTransactions.reduce((total, item) => {
    const amount = Number(item?.amount || 0);
    return amount < 0 ? total + Math.abs(amount) : total;
  }, 0);
  const creditAmount = walletTransactions.reduce((total, item) => {
    const amount = Number(item?.amount || 0);
    return amount > 0 ? total + amount : total;
  }, 0);
  const balanceAmount = Number(driver?.wallet?.balance || 0);
  const cashLimit = Number(driver?.wallet?.cashLimit ?? 500);
  const isWalletBlocked = Boolean(driver?.wallet?.isBlocked);

  const driverLocation = driver.location?.coordinates || [];
  const lastRideLocation = rides.find((ride) => Array.isArray(ride.lastDriverLocation?.coordinates));
  const coordinates = driverLocation.length === 2 ? driverLocation : (lastRideLocation?.lastDriverLocation?.coordinates || []);

  const [lng, lat] = coordinates;
  const hasValidLocation = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

  return {
    ...serializeDriver(driver),
    joined_at: driver.createdAt ? new Date(driver.createdAt).toLocaleString('en-IN') : 'N/A',
    vehicle: {
      type: driver.vehicleType || driver.registerFor || '',
      make: driver.vehicleMake || '',
      model: driver.vehicleModel || '',
      color: driver.vehicleColor || '',
      number: driver.vehicleNumber || '',
    },
    image: driver.profile_image || driver.avatar || '',
    online_selfie: driver.onlineSelfie || {},
    vehicle_image: driver.vehicleImage || 'https://img.freepik.com/free-vector/yellow-passenger-transport-taxi-car_1017-4886.jpg',
    stats: {
      total_trips: rides.length,
      completed_trips: completedRides.length,
      cancelled_trips: cancelledRides.length,
      ongoing_trips: ongoingRides.length,
      today_trips: todayRides.length,
      today_cancelled: todayCancelled.length,
    },
    earnings: {
      today_earnings: Number(todayEarnings.toFixed(2)),
      total_earnings: Number(totalEarnings.toFixed(2)),
      driver_earnings: Number(driverEarnings.toFixed(2)),
      admin_commission: Number(adminCommission.toFixed(2)),
      by_cash: Number(byCash.toFixed(2)),
      by_wallet: 0,
      by_card: Number(byCard.toFixed(2)),
      spend_amount: Number(spendAmount.toFixed(2)),
      balance_amount: Number(balanceAmount.toFixed(2)),
    },
    wallet: {
      balance: Number(balanceAmount.toFixed(2)),
      cash_limit: Number(cashLimit.toFixed(2)),
      is_blocked: isWalletBlocked,
      total_credits: Number(creditAmount.toFixed(2)),
      total_debits: Number(spendAmount.toFixed(2)),
      transaction_count: walletTransactions.length,
    },
    location: hasValidLocation ? { lat, lng } : null,
  };
};

export const getSubscriptionSettings = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  return setting?.subscription || { mode: 'commissionOnly' };
};

export const updateSubscriptionSettings = async (payload) => {
  const { mode } = payload;
  if (!['commissionOnly', 'subscriptionOnly', 'both'].includes(mode)) {
    throw new ApiError(400, 'Invalid subscription mode');
  }

  const setting = await AdminBusinessSetting.findOneAndUpdate(
    { scope: 'default' },
    { $set: { 'subscription.mode': mode } },
    { returnDocument: 'after', upsert: true },
  );

  return setting.subscription;
};

export const getReferralSettings = async (type) => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const referral = setting?.referral || { driver: { enabled: false, type: 'instant_referrer', amount: 0 }, user: { enabled: false, type: 'instant_referrer', amount: 0 } };
  return type ? referral[type] : referral;
};

const sanitizeReferralMilestones = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: String(item?.id || `milestone_${index + 1}`).trim(),
      name: String(item?.name || `Milestone ${index + 1}`).trim(),
      enabled: Boolean(item?.enabled ?? true),
      active_hours_per_day: Math.max(0, Number(item?.active_hours_per_day ?? 0) || 0),
      required_weeks: Math.max(0, Number(item?.required_weeks ?? 0) || 0),
      min_trips_per_week: Math.max(0, Number(item?.min_trips_per_week ?? 0) || 0),
      payout_amount: Math.max(0, Number(item?.payout_amount ?? 0) || 0),
      notes: String(item?.notes || '').trim(),
    }))
    .filter((item) => item.name);

const sanitizeReferralRewardFeatures = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: String(item?.id || `feature_${index + 1}`).trim(),
      key: String(item?.key || `feature_${index + 1}`).trim(),
      label: String(item?.label || `Feature ${index + 1}`).trim(),
      enabled: Boolean(item?.enabled ?? false),
      reward_amount: Math.max(0, Number(item?.reward_amount ?? 0) || 0),
      target_value: Math.max(0, Number(item?.target_value ?? 0) || 0),
      unit: String(item?.unit || '').trim(),
      description: String(item?.description || '').trim(),
    }))
    .filter((item) => item.label);

export const updateReferralSettings = async (type, payload) => {
  const updateKey = `referral.${type}`;

  // Sanitize data
  const updateData = {
    ...payload,
    enabled: Boolean(payload.enabled),
    amount: Number(payload.amount || 0),
  };

  if (payload.ride_count !== undefined) {
    updateData.ride_count = Math.max(0, Number(payload.ride_count || 0) || 0);
  }

  if (type === 'driver') {
    updateData.milestone_program_enabled = Boolean(payload.milestone_program_enabled);
    updateData.milestone_programs = sanitizeReferralMilestones(payload.milestone_programs);
    updateData.reward_features = sanitizeReferralRewardFeatures(payload.reward_features);
  }

  const setting = await AdminBusinessSetting.findOneAndUpdate(
    { scope: 'default' },
    { $set: { [updateKey]: updateData } },
    { returnDocument: 'after', upsert: true },
  );

  return setting.referral[type];
};

export const getReferralDashboard = async () => {
  const [totalDrivers, totalUsers] = await Promise.all([
    Driver.countDocuments(),
    User.countDocuments(),
  ]);

  // Mocking some parts for the dashboard view
  return {
    total_drivers: totalDrivers,
    total_users: totalUsers,
    active_referrals: 0,
    referral_earning: 0,
    user_referrals: {
      normal_user: totalUsers,
      referral_user: 0,
      monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    driver_referrals: {
      normal_driver: totalDrivers,
      referral_driver: 0,
      monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
  };
};

export const listSubscriptionPlans = async () =>
  SubscriptionPlan.find({ audience: 'driver' }).sort({ createdAt: -1 }).populate('vehicle_type_id').lean();
export const createSubscriptionPlan = async (payload) => {
  if (!String(payload?.name || '').trim()) {
    throw new ApiError(400, 'Subscription name is required');
  }

  const plan = await SubscriptionPlan.create({
    ...payload,
    audience: 'driver',
    amount: Number(payload.amount || 0),
    duration: Number(payload.duration || 0),
    benefit_type: 'standard',
    ride_limit: 0,
    active: true,
  });
  return plan.toObject();
};

export const listCustomerSubscriptionPlans = async () =>
  SubscriptionPlan.find({ audience: 'user' }).sort({ createdAt: -1 }).populate('vehicle_type_id').lean();

export const createCustomerSubscriptionPlan = async (payload = {}) => {
  if (!String(payload?.name || '').trim()) {
    throw new ApiError(400, 'Subscription name is required');
  }
  if (!payload?.vehicle_type_id || !mongoose.Types.ObjectId.isValid(payload.vehicle_type_id)) {
    throw new ApiError(400, 'Valid vehicle type is required');
  }

  const benefitType = String(payload.benefit_type || '').trim().toLowerCase() === 'unlimited'
    ? 'unlimited'
    : 'limited';

  const plan = await SubscriptionPlan.create({
    ...payload,
    audience: 'user',
    amount: Number(payload.amount || 0),
    duration: Math.max(1, Number(payload.duration || 0)),
    benefit_type: benefitType,
    ride_limit: benefitType === 'unlimited' ? 0 : Math.max(1, Number(payload.ride_limit || 0)),
    active: payload.active !== undefined ? Boolean(payload.active) : true,
  });
  return plan.toObject();
};

export const listUserSubscriptionsByUserId = async (userId) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const items = await UserSubscription.find({ userId })
    .sort({ active: -1, expiresAt: 1, createdAt: -1 })
    .populate('planId', 'name description')
    .populate('vehicle_type_id', 'name')
    .lean();

  return {
    results: items.map((item) => ({
      id: String(item._id),
      planId: item.planId?._id ? String(item.planId._id) : String(item.planId || ''),
      name: item.name || item.planId?.name || '',
      description: item.description || item.planId?.description || '',
      amount: Number(item.amount || 0),
      durationDays: Number(item.durationDays || 0),
      transport_type: item.transport_type || 'taxi',
      benefit_type: item.benefit_type || 'limited',
      ride_limit: Number(item.ride_limit || 0),
      rides_used: Number(item.rides_used || 0),
      rides_remaining: String(item.benefit_type || '') === 'unlimited'
        ? null
        : Math.max(0, Number(item.ride_limit || 0) - Number(item.rides_used || 0)),
      status: item.status || 'active',
      active: item.active !== false,
      vehicle_type: item.vehicle_type_id?._id
        ? {
          id: String(item.vehicle_type_id._id),
          name: item.vehicle_type_id.name || '',
        }
        : null,
      purchasedAt: item.purchasedAt || null,
      expiresAt: item.expiresAt || null,
      createdAt: item.createdAt || null,
    })),
  };
};

export const listServiceLocations = async (currentAdmin = null) => {
  await ensureServiceLocationsSeeded();
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_locations.view', 'service locations');
  }
  const query = currentAdmin ? buildServiceLocationScopeQuery(currentAdmin) : {};
  return ServiceLocation.find(query).sort({ createdAt: -1 }).lean();
};

export const listCountries = async () => {
  const locations = await listServiceLocations();
  const countriesFromLocations = locations
    .map((item) => item.country)
    .filter(Boolean)
    .map((country) =>
      typeof country === 'object'
        ? country
        : {
          _id: nextId(),
          name: String(country),
          code: String(country).slice(0, 2).toUpperCase(),
        },
    );

  const merged = [
    { _id: nextId(), name: 'India', code: 'IN' },
    { _id: nextId(), name: 'United Arab Emirates', code: 'AE' },
    { _id: nextId(), name: 'United Kingdom', code: 'GB' },
    { _id: nextId(), name: 'United States', code: 'US' },
    ...countriesFromLocations,
  ];

  return merged.filter(
    (country, index, list) =>
      list.findIndex((item) => item.name?.toLowerCase() === country.name?.toLowerCase()) === index,
  );
};

export const createServiceLocation = async (payload, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_locations.view', 'service locations');
    if (!isSuperAdmin(currentAdmin)) {
      throw new ApiError(403, 'Only the superadmin can create service locations');
    }
  }

  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Service location name is required');
  }

  await ensureServiceLocationsSeeded();
  const persistedLocation = await ServiceLocation.create(normalizeServiceLocationPayload(payload));
  return persistedLocation.toObject();

  const location = {
    _id: nextId(),
    name: payload.name.trim(),
    service_location_name: payload.name.trim(),
    address: payload.address || '',
    country: payload.country || 'India',
    currency_name: payload.currency_name || 'Indian Rupee',
    currency_symbol: payload.currency_symbol || '₹',
    currency_code: payload.currency_code || 'INR',
    timezone: payload.timezone || 'Asia/Kolkata',
    unit: payload.unit || 'km',
    latitude: Number(payload.latitude || 22.7196),
    longitude: Number(payload.longitude || 75.8577),
    status: payload.status || 'active',
    active: payload.status ? payload.status === 'active' : true,
    createdAt: new Date(),
  };

  state.serviceLocations.unshift(location);
  await state.save();
  return location;
};

export const updateServiceLocation = async (id, payload, currentAdmin = null) => {
  await ensureServiceLocationsSeeded();
  const persistedLocation = await ServiceLocation.findById(id);
  if (!persistedLocation) {
    throw new ApiError(404, 'Service location not found');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_locations.view', 'service locations');
    assertServiceLocationAccess(currentAdmin, persistedLocation._id);
  }
  Object.assign(persistedLocation, normalizeServiceLocationPayload(payload, persistedLocation.toObject()));
  await persistedLocation.save();
  return persistedLocation.toObject();

  const state = await ensureAdminState();
  const location = findById(state.serviceLocations, id);

  if (!location) {
    throw new ApiError(404, 'Service location not found');
  }

  Object.assign(location, payload, {
    name: payload.name?.trim() || location.name,
    service_location_name: payload.name?.trim() || location.service_location_name,
    latitude: payload.latitude !== undefined ? Number(payload.latitude) : location.latitude,
    longitude: payload.longitude !== undefined ? Number(payload.longitude) : location.longitude,
    active: payload.status !== undefined ? payload.status === 'active' : location.active,
    status: payload.status || location.status,
  });

  await state.save();
  return location;
};

export const deleteServiceLocation = async (id, currentAdmin = null) => {
  await ensureServiceLocationsSeeded();
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_locations.view', 'service locations');
    assertServiceLocationAccess(currentAdmin, id);
  }
  const deleted = await ServiceLocation.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Service location not found');
  }
  return true;

  const state = await ensureAdminState();
  state.serviceLocations = removeById(state.serviceLocations, id);
  await state.save();
  return true;
};

export const listNearbyServiceLocations = async ({ latitude, longitude, maxDistance = 50000, limit = 20 }) => {
  await ensureServiceLocationsSeeded();

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new ApiError(400, 'Valid latitude and longitude are required');
  }

  return ServiceLocation.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        $maxDistance: Number(maxDistance),
      },
    },
  })
    .limit(Number(limit) || 20)
    .lean();
};

export const listRideModules = async () => RideModule.find().sort({ createdAt: -1 }).lean();

const formatRidePointLabel = (point, fallback = 'Unknown') => {
  const [lng, lat] = point?.coordinates || [];

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  return fallback;
};

const toAdminRideRow = (ride) => {
  const requestCode = `REQ_${String(ride._id).slice(-12).toUpperCase()}`;
  const status = String(ride.status || '').toLowerCase();
  const liveStatus = String(ride.liveStatus || '').toLowerCase();

  let tripStatus = 'UPCOMING';
  if (status === RIDE_STATUS.COMPLETED) {
    tripStatus = 'COMPLETED';
  } else if (status === RIDE_STATUS.CANCELLED) {
    tripStatus = 'CANCELLED';
  } else if (status === RIDE_STATUS.ONGOING || liveStatus === RIDE_LIVE_STATUS.STARTED) {
    tripStatus = 'ONGOING';
  } else if (status === RIDE_STATUS.ACCEPTED || liveStatus === RIDE_LIVE_STATUS.ACCEPTED || liveStatus === RIDE_LIVE_STATUS.ARRIVING) {
    tripStatus = 'ACCEPTED';
  }

  return {
    id: String(ride._id),
    requestId: requestCode,
    date: ride.createdAt,
    userName: ride.userId?.name || 'Unknown User',
    driverName: ride.driverId?.name || 'Unassigned',
    transportType: ride.driverId?.vehicleType || ride.vehicleIconType || 'Taxi',
    tripStatus,
    rideStatus: ride.status,
    liveStatus: ride.liveStatus,
    paymentOption: 'CASH',
    fare: Number(ride.fare || 0),
    pickupLabel: formatRidePointLabel(ride.pickupLocation, 'Pickup'),
    dropLabel: formatRidePointLabel(ride.dropLocation, 'Drop'),
    pickupLocation: ride.pickupLocation,
    dropLocation: ride.dropLocation,
    lastDriverLocation: ride.lastDriverLocation || null,
    user: ride.userId ? {
      id: String(ride.userId._id),
      name: ride.userId.name || '',
      phone: ride.userId.phone || '',
    } : null,
    driver: ride.driverId ? {
      id: String(ride.driverId._id),
      name: ride.driverId.name || '',
      phone: ride.driverId.phone || '',
      vehicleType: ride.driverId.vehicleType || '',
      vehicleNumber: ride.driverId.vehicleNumber || '',
    } : null,
  };
};

const toAdminDeliveryRow = (ride) => {
  const requestCode = `DEL_${String(ride._id).slice(-12).toUpperCase()}`;
  const status = String(ride.status || '').toLowerCase();
  const liveStatus = String(ride.liveStatus || '').toLowerCase();
  const parcel = ride.deliveryId?.parcel || {};

  let tripStatus = 'UPCOMING';
  if (status === RIDE_STATUS.COMPLETED) {
    tripStatus = 'COMPLETED';
  } else if (status === RIDE_STATUS.CANCELLED) {
    tripStatus = 'CANCELLED';
  } else if (
    status === RIDE_STATUS.ONGOING ||
    liveStatus === RIDE_LIVE_STATUS.STARTED ||
    liveStatus === RIDE_LIVE_STATUS.ARRIVED
  ) {
    tripStatus = 'ON_TRIP';
  }

  return {
    id: String(ride._id),
    requestId: requestCode,
    date: ride.createdAt,
    userName: ride.userId?.name || parcel.senderName || 'Unknown User',
    driverName: ride.driverId?.name || 'Unassigned',
    transportType: ride.driverId?.vehicleType || ride.vehicleIconType || 'Parcel',
    tripStatus,
    rideStatus: ride.status,
    liveStatus: ride.liveStatus,
    paymentOption: String(ride.paymentMethod || 'cash').toUpperCase(),
    fare: Number(ride.fare || 0),
    pickupLabel: ride.pickupAddress || formatRidePointLabel(ride.pickupLocation, 'Pickup'),
    dropLabel: ride.dropAddress || formatRidePointLabel(ride.dropLocation, 'Drop'),
    pickupLocation: ride.pickupLocation,
    dropLocation: ride.dropLocation,
    parcel: {
      category: parcel.category || '',
      senderName: parcel.senderName || '',
      receiverName: parcel.receiverName || '',
    },
  };
};

const toAdminIntercityTripRow = (ride) => {
  const requestCode = `INT_${String(ride._id).slice(-12).toUpperCase()}`;
  const status = String(ride.status || '').toLowerCase();
  const liveStatus = String(ride.liveStatus || '').toLowerCase();
  const intercity = ride.intercity || {};

  let tripStatus = 'UPCOMING';
  if (status === RIDE_STATUS.COMPLETED) {
    tripStatus = 'COMPLETED';
  } else if (status === RIDE_STATUS.CANCELLED) {
    tripStatus = 'CANCELLED';
  } else if (
    status === RIDE_STATUS.ONGOING ||
    liveStatus === RIDE_LIVE_STATUS.STARTED ||
    liveStatus === RIDE_LIVE_STATUS.ARRIVED
  ) {
    tripStatus = 'ON_TRIP';
  }

  const fromCity = String(intercity.fromCity || '').trim();
  const toCity = String(intercity.toCity || '').trim();

  return {
    id: String(ride._id),
    requestId: requestCode,
    date: ride.createdAt,
    userName: ride.userId?.name || 'Unknown User',
    driverName: ride.driverId?.name || 'Unassigned',
    transportType: intercity.vehicleName || ride.driverId?.vehicleType || ride.vehicleIconType || 'Intercity',
    tripStatus,
    rideStatus: ride.status,
    liveStatus: ride.liveStatus,
    paymentOption: String(ride.paymentMethod || 'cash').toUpperCase(),
    fare: Number(ride.fare || 0),
    pickupLabel: ride.pickupAddress || formatRidePointLabel(ride.pickupLocation, 'Pickup'),
    dropLabel: ride.dropAddress || formatRidePointLabel(ride.dropLocation, 'Drop'),
    routeLabel: [fromCity, toCity].filter(Boolean).join(' -> '),
    tripType: intercity.tripType || '',
    travelDate: intercity.travelDate || '',
  };
};

export const listEmployees = async ({ page = 1, limit = 50, search = '' } = {}, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'employees.view', 'employees');
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const start = (safePage - 1) * safeLimit;
  const normalizedSearch = String(search || '').trim();
  const query = {};

  if (normalizedSearch) {
    const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const digits = normalizedSearch.replace(/\D/g, '');
    const regex = new RegExp(escapedSearch, 'i');
    query.$or = [{ name: regex }, { employeeCode: regex }];

    if (digits) {
      query.$or.push({ phone: new RegExp(`^${digits}`) });
    } else {
      query.$or.push({ phone: regex });
    }
  }

  const [employees, total] = await Promise.all([
    Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    Employee.countDocuments(query),
  ]);

  const employeeIds = employees.map((employee) => employee._id);
  const [userCounts, driverCounts] = await Promise.all([
    employeeIds.length
      ? User.aggregate([
        { $match: { acquiredByEmployeeId: { $in: employeeIds } } },
        { $group: { _id: '$acquiredByEmployeeId', count: { $sum: 1 } } },
      ])
      : [],
    employeeIds.length
      ? Driver.aggregate([
        { $match: { acquiredByEmployeeId: { $in: employeeIds } } },
        { $group: { _id: '$acquiredByEmployeeId', count: { $sum: 1 } } },
      ])
      : [],
  ]);

  const userCountMap = new Map(userCounts.map((item) => [String(item._id), Number(item.count || 0)]));
  const driverCountMap = new Map(driverCounts.map((item) => [String(item._id), Number(item.count || 0)]));

  return {
    results: employees.map((employee) =>
      serializeEmployee(employee, {
        totalUsers: userCountMap.get(String(employee._id)) || 0,
        totalDrivers: driverCountMap.get(String(employee._id)) || 0,
      })),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const createEmployee = async (payload = {}, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'employees.view', 'employees');
  }

  const name = String(payload.name || '').trim();
  const phone = normalizeEmployeePhone(payload.phone);
  const employeeCode = normalizeEmployeeCode(payload.employeeCode);
  const active = payload.active === undefined ? true : normalizeBoolean(payload.active);
  const notes = String(payload.notes || '').trim();

  if (!name || name.length < 2 || name.length > 80) {
    throw new ApiError(400, 'Employee name must be between 2 and 80 characters');
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'Employee phone must be a valid 10-digit number');
  }

  if (!/^[A-Z0-9-]{3,40}$/.test(employeeCode)) {
    throw new ApiError(400, 'Employee code must be 3 to 40 characters using letters, numbers, or hyphens');
  }

  const existingPhone = await Employee.findOne({ phone }).select('_id').lean();
  if (existingPhone) {
    throw new ApiError(409, 'Employee phone is already in use');
  }

  const existingCode = await Employee.findOne({ employeeCode }).select('_id').lean();
  if (existingCode) {
    throw new ApiError(409, 'Employee code is already in use');
  }

  const employee = await Employee.create({
    name,
    phone,
    employeeCode,
    active,
    notes,
  });

  return serializeEmployee(employee.toObject());
};

export const updateEmployee = async (id, payload = {}, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'employees.view', 'employees');
  }

  const employee = await Employee.findById(id);
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name || name.length < 2 || name.length > 80) {
      throw new ApiError(400, 'Employee name must be between 2 and 80 characters');
    }
    employee.name = name;
  }

  if (payload.phone !== undefined) {
    const phone = normalizeEmployeePhone(payload.phone);
    if (!/^\d{10}$/.test(phone)) {
      throw new ApiError(400, 'Employee phone must be a valid 10-digit number');
    }
    const conflict = await Employee.findOne({ phone, _id: { $ne: employee._id } }).select('_id').lean();
    if (conflict) {
      throw new ApiError(409, 'Employee phone is already in use');
    }
    employee.phone = phone;
  }

  let employeeCodeChanged = false;

  if (payload.employeeCode !== undefined) {
    const employeeCode = normalizeEmployeeCode(payload.employeeCode);
    if (!/^[A-Z0-9-]{3,40}$/.test(employeeCode)) {
      throw new ApiError(400, 'Employee code must be 3 to 40 characters using letters, numbers, or hyphens');
    }
    const conflict = await Employee.findOne({ employeeCode, _id: { $ne: employee._id } }).select('_id').lean();
    if (conflict) {
      throw new ApiError(409, 'Employee code is already in use');
    }
    employeeCodeChanged = employee.employeeCode !== employeeCode;
    employee.employeeCode = employeeCode;
  }

  if (payload.active !== undefined) {
    employee.active = normalizeBoolean(payload.active);
  }

  if (payload.notes !== undefined) {
    employee.notes = String(payload.notes || '').trim();
  }

  await employee.save();

  if (employeeCodeChanged) {
    await Promise.all([
      User.updateMany(
        { acquiredByEmployeeId: employee._id },
        { $set: { acquiredByEmployeeCode: employee.employeeCode } },
      ),
      Driver.updateMany(
        { acquiredByEmployeeId: employee._id },
        { $set: { acquiredByEmployeeCode: employee.employeeCode } },
      ),
    ]);
  }

  return serializeEmployee(employee.toObject());
};

export const getEmployeeById = async (id, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'employees.view', 'employees');
  }

  const employee = await Employee.findById(id).lean();
  if (!employee) {
    throw new ApiError(404, 'Employee not found');
  }

  const [users, drivers, totalUsers, totalDrivers] = await Promise.all([
    User.find({ acquiredByEmployeeId: employee._id })
      .select('_id name phone email gender createdAt active isActive deletedAt acquiredByEmployeeCode')
      .sort({ createdAt: -1 })
      .lean(),
    Driver.find({ acquiredByEmployeeId: employee._id })
      .select('_id name phone email vehicleType registerFor status approve createdAt acquiredByEmployeeCode')
      .sort({ createdAt: -1 })
      .lean(),
    User.countDocuments({ acquiredByEmployeeId: employee._id }),
    Driver.countDocuments({ acquiredByEmployeeId: employee._id }),
  ]);

  return {
    employee: serializeEmployee(employee, { totalUsers, totalDrivers }),
    users: users.map((user) => ({
      _id: user._id,
      id: user._id,
      name: user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      gender: user.gender || '',
      active: (user.active ?? user.isActive) !== false && !user.deletedAt,
      employeeCode: user.acquiredByEmployeeCode || '',
      createdAt: user.createdAt || null,
    })),
    drivers: drivers.map((driver) => ({
      _id: driver._id,
      id: driver._id,
      name: driver.name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      vehicleType: driver.vehicleType || '',
      registerFor: driver.registerFor || '',
      status: driver.status || '',
      approve: Boolean(driver.approve),
      employeeCode: driver.acquiredByEmployeeCode || '',
      createdAt: driver.createdAt || null,
    })),
  };
};

const clampAdminRideListPageSize = (value, fallback = 10) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 100);
};

const buildRideStatusFilter = (tab = 'all', variant = 'ride_requests') => {
  const normalizedTab = String(tab || 'all').trim().toLowerCase();

  if (variant === 'ongoing_rides') {
    if (normalizedTab === 'accepted') {
      return {
        $or: [
          { status: RIDE_STATUS.ACCEPTED },
          { liveStatus: { $in: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING] } },
        ],
      };
    }

    if (normalizedTab === 'ongoing') {
      return {
        $or: [
          { status: RIDE_STATUS.ONGOING },
          { liveStatus: RIDE_LIVE_STATUS.STARTED },
        ],
      };
    }

    if (normalizedTab === 'upcoming') {
      return {
        status: RIDE_STATUS.SEARCHING,
      };
    }

    return {};
  }

  if (normalizedTab === 'completed') {
    return { status: RIDE_STATUS.COMPLETED };
  }

  if (normalizedTab === 'cancelled') {
    return { status: RIDE_STATUS.CANCELLED };
  }

  if (normalizedTab === 'upcoming') {
    return { status: RIDE_STATUS.SEARCHING };
  }

  if (normalizedTab === 'on trip' || normalizedTab === 'on_trip' || normalizedTab === 'ongoing') {
    return {
      $or: [
        { status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] } },
        { liveStatus: { $in: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.STARTED] } },
      ],
    };
  }

  return {};
};

const buildAdminRideSearchClauses = async (
  search = '',
  { includeParcel = false, includeIntercity = false } = {},
) => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) {
    return [];
  }

  const regex = new RegExp(escapeRegex(normalizedSearch), 'i');
  const [matchedUsers, matchedDrivers] = await Promise.all([
    User.find({
      $or: [{ name: regex }, { phone: regex }],
    })
      .select('_id')
      .limit(100)
      .lean(),
    Driver.find({
      $or: [{ name: regex }, { phone: regex }, { vehicleType: regex }, { vehicleNumber: regex }],
    })
      .select('_id')
      .limit(100)
      .lean(),
  ]);

  const clauses = [
    { pickupAddress: regex },
    { dropAddress: regex },
    { vehicleIconType: regex },
  ];

  if (/^[a-f0-9]{24}$/i.test(normalizedSearch)) {
    clauses.push({ _id: new mongoose.Types.ObjectId(normalizedSearch) });
  }

  if (matchedUsers.length > 0) {
    clauses.push({ userId: { $in: matchedUsers.map((item) => item._id) } });
  }

  if (matchedDrivers.length > 0) {
    clauses.push({ driverId: { $in: matchedDrivers.map((item) => item._id) } });
  }

  if (includeParcel) {
    clauses.push(
      { 'parcel.category': regex },
      { 'parcel.senderName': regex },
      { 'parcel.receiverName': regex },
    );
  }

  if (includeIntercity) {
    clauses.push(
      { 'intercity.fromCity': regex },
      { 'intercity.toCity': regex },
      { 'intercity.tripType': regex },
      { 'intercity.travelDate': regex },
    );
  }

  return clauses;
};

const listAdminRides = async ({
  query = {},
  baseFilter = {},
  variant = 'ride_requests',
  serializer,
  includeParcel = false,
  includeIntercity = false,
}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = clampAdminRideListPageSize(query.limit, 10);
  const tab = String(query.tab || 'all').toLowerCase();
  const search = String(query.search || '').trim();

  const mongoFilter = {
    ...baseFilter,
    ...buildRideStatusFilter(tab, variant),
  };

  const searchClauses = await buildAdminRideSearchClauses(search, {
    includeParcel,
    includeIntercity,
  });

  if (searchClauses.length > 0) {
    mongoFilter.$or = searchClauses;
  }

  const [total, rides] = await Promise.all([
    Ride.countDocuments(mongoFilter),
    (() => {
      let rideQuery = Ride.find(mongoFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name phone')
        .populate('driverId', 'name phone vehicleType vehicleNumber');

      if (includeParcel) {
        rideQuery = rideQuery.populate('deliveryId');
      }

      return rideQuery.lean();
    })(),
  ]);

  return buildDatabasePaginator(rides.map(serializer), page, limit, total);
};





export const listOngoingRides = async (query = {}) => {
  return listAdminRides({
    query,
    baseFilter: {
      status: { $in: [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
    },
    variant: 'ongoing_rides',
    serializer: toAdminRideRow,
  });
};

export const listRideRequests = async (query = {}) => {
  return listAdminRides({
    query,
    baseFilter: {
      serviceType: { $nin: ['parcel', 'intercity'] },
    },
    variant: 'ride_requests',
    serializer: toAdminRideRow,
  });
};

export const listDeliveries = async (query = {}) => {
  return listAdminRides({
    query,
    baseFilter: {
      serviceType: 'parcel',
    },
    variant: 'deliveries',
    serializer: toAdminDeliveryRow,
    includeParcel: true,
  });
};

export const listIntercityTrips = async (query = {}) => {
  return listAdminRides({
    query,
    baseFilter: {
      serviceType: 'intercity',
    },
    variant: 'intercity',
    serializer: toAdminIntercityTripRow,
    includeIntercity: true,
  });
};

export const deleteOngoingRide = async (rideId) => {
  if (!mongoose.Types.ObjectId.isValid(String(rideId))) {
    throw new ApiError(400, 'Invalid ride id');
  }

  const deletedRide = await cancelRideByAdmin(rideId);

  if (!deletedRide) {
    throw new ApiError(404, 'Ride not found');
  }

  return {
    id: String(deletedRide._id),
    deleted: true,
    status: deletedRide.status,
    liveStatus: deletedRide.liveStatus,
  };
};

export const listVehicleTypes = async (queryParams = {}) => {
  const query = {};
  if (queryParams.transport_type) {
    const normalizedTransportType = normalizeVehicleTransportType(queryParams.transport_type);
    query.transport_type = normalizedTransportType === 'both'
      ? 'both'
      : { $in: [normalizedTransportType, 'both'] };
  }
  const items = await Vehicle.find(query)
    .select('name short_description description transport_type dispatch_type icon_types category delivery_category delivery_distance_pricing service_tax admin_commission_type_from_driver admin_commission_from_driver admin_commission_type_for_owner admin_commission_for_owner capacity image icon map_icon status active createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();
  const results = items.map((item) => ({
    ...item,
    ...normalizeVehicleCommissionConfig(item),
    category: item.category || '',
    icon: item.map_icon || item.icon || item.image || '',
    map_icon: item.map_icon || item.icon || item.image || '',
    delivery_category: item.delivery_category || '',
    delivery_distance_pricing: normalizeDeliveryDistancePricing(item.delivery_distance_pricing),
    service_tax: normalizeDeliveryServiceTax(item.service_tax),
  }));

  return {
    results,
    paginator: {
      data: results,
      total: results.length,
      current_page: 1,
      last_page: 1,
      per_page: results.length,
      from: 1,
      to: results.length
    }
  };
};


export const listVehicleCatalog = async () => {
  const items = await Vehicle.find().sort({ createdAt: -1 }).lean();

  const results = items.map((item) => ({
    ...item,
    ...normalizeVehicleCommissionConfig(item),
    id: String(item._id),
    category: item.category || '',
    icon: item.map_icon || item.icon || item.image || '',
    map_icon: item.map_icon || item.icon || item.image || '',
    delivery_category: item.delivery_category || '',
    delivery_distance_pricing: normalizeDeliveryDistancePricing(item.delivery_distance_pricing),
    supported_vehicles: Array.isArray(item.supported_other_vehicle_types)
      ? item.supported_other_vehicle_types.map((v) => String(v)).join(',')
      : '',
    icon_types_for: item.icon_types,
    trip_dispatch_type: item.dispatch_type,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }));

  return {
    results,
    paginator: {
      data: results,
      total: results.length,
      current_page: 1,
      last_page: 1,
      per_page: 10,
      from: 1,
      to: results.length,
    }
  };
};

const buildDatabasePaginator = (results, page = 1, limit = 50, total = 0) => {
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const safeTotal = Number(total) || 0;

  return {
    results,
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total: safeTotal,
      last_page: Math.max(1, Math.ceil(safeTotal / safeLimit)),
    },
  };
};

const normalizeVehicleCommissionConfig = (item = {}) => ({
  admin_commission_type_from_driver: Number(item?.admin_commission_type_from_driver ?? 1),
  admin_commission_from_driver: Number(item?.admin_commission_from_driver ?? 0),
  admin_commission_type_for_owner: Number(item?.admin_commission_type_for_owner ?? 1),
  admin_commission_for_owner: Number(item?.admin_commission_for_owner ?? 0),
});


export const getVehicleTypeById = async (id) => {
  const item = await Vehicle.findById(id).lean();

  if (!item) {
    throw new ApiError(404, 'Vehicle type not found');
  }

  return {
    ...item,
    ...normalizeVehicleCommissionConfig(item),
    id: String(item._id),
    category: item.category || '',
    icon: item.map_icon || item.icon || item.image || '',
    map_icon: item.map_icon || item.icon || item.image || '',
    delivery_category: item.delivery_category || '',
    delivery_distance_pricing: normalizeDeliveryDistancePricing(item.delivery_distance_pricing),
    service_tax: normalizeDeliveryServiceTax(item.service_tax),
    supported_vehicles: Array.isArray(item.supported_other_vehicle_types)
      ? item.supported_other_vehicle_types.map((v) => String(v)).join(',')
      : '',
    icon_types_for: item.icon_types,
    trip_dispatch_type: item.dispatch_type,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
};

export const listPublicVehicleCatalog = async () => {
  if (publicVehicleCatalogCache.value && publicVehicleCatalogCache.expiresAt > Date.now()) {
    return publicVehicleCatalogCache.value;
  }

  const items = await Vehicle.find()
    .select('name short_description description transport_type dispatch_type icon_types category delivery_category delivery_distance_pricing service_tax admin_commission_type_from_driver admin_commission_from_driver admin_commission_type_for_owner admin_commission_for_owner capacity image icon map_icon status active')
    .sort({ createdAt: -1 })
    .lean();

  const results = items.map((item) => ({
    id: String(item._id),
    _id: item._id,
    name: item.name || '',
    short_description: item.short_description || '',
    description: item.description || '',
    transport_type: item.transport_type || 'taxi',
    dispatch_type: item.dispatch_type || 'normal',
    icon_types: item.icon_types || 'car',
    category: item.category || '',
    delivery_category: item.delivery_category || '',
    delivery_distance_pricing: normalizeDeliveryDistancePricing(item.delivery_distance_pricing),
    service_tax: normalizeDeliveryServiceTax(item.service_tax),
    ...normalizeVehicleCommissionConfig(item),
    capacity: Number(item.capacity || 0),
    image: item.image || '',
    map_icon: item.map_icon || item.icon || item.image || '',
    status: item.status ?? 1,
    active: item.active !== false && Number(item.status ?? 1) !== 0,
  }));

  const payload = {
    results,
    paginator: {
      data: results,
      total: results.length,
      current_page: 1,
      last_page: 1,
      per_page: results.length,
      from: results.length ? 1 : 0,
      to: results.length,
    },
  };

  publicVehicleCatalogCache = {
    value: payload,
    expiresAt: Date.now() + PUBLIC_VEHICLE_CATALOG_CACHE_TTL_MS,
  };

  return payload;
};

export const listPublicRentalVehicleCatalog = async () => {
  const items = await RentalVehicleType.find({
    active: true,
    status: 'active',
  })
    .sort({ createdAt: -1 })
    .lean();

  return items.map((item) => serializeRentalVehicleType(item));
};

export const listVehiclePreferences = async () => {
  return listPreferences();
};

export const createVehicleType = async (payload) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Vehicle name is required');
  }

  if (!payload.transport_type?.trim()) {
    throw new ApiError(400, 'Transport type is required');
  }

  const mapIcon = payload.map_icon ?? payload.mapIcon ?? payload.icon ?? payload.image ?? '';
  const transportType = normalizeVehicleTransportType(payload.transport_type);

  const vehicle = await Vehicle.create({
    name: payload.name.trim(),
    short_description: payload.short_description ?? '',
    description: payload.description ?? '',
    transport_type: transportType,
    dispatch_type: payload.dispatch_type || 'normal',
    icon_types: payload.icon_types || 'car',
    category: String(payload.category || '').trim().toLowerCase(),
    capacity: Number(payload.capacity || 0),
    size: payload.size ?? '',
    is_taxi: payload.is_taxi || transportType,
    is_accept_share_ride: Number(payload.is_accept_share_ride || 0) ? 1 : 0,
    delivery_category: ['delivery', 'both'].includes(transportType)
      ? normalizeDeliveryCategory(payload.delivery_category)
      : '',
    delivery_distance_pricing: ['delivery', 'both'].includes(transportType)
      ? normalizeDeliveryDistancePricing(payload.delivery_distance_pricing)
      : normalizeDeliveryDistancePricing(),
    service_tax: ['delivery', 'both'].includes(transportType)
      ? normalizeDeliveryServiceTax(payload.service_tax)
      : 0,
    admin_commission_type_from_driver: Number(payload.admin_commission_type_from_driver ?? 1),
    admin_commission_from_driver: Number(payload.admin_commission_from_driver ?? 0),
    admin_commission_type_for_owner: Number(payload.admin_commission_type_for_owner ?? 1),
    admin_commission_for_owner: Number(payload.admin_commission_for_owner ?? 0),
    image: payload.image ?? mapIcon,
    icon: mapIcon,
    map_icon: mapIcon,
    status: Number(payload.status ?? 1) ? 1 : 0,
    active: Number(payload.status ?? 1) === 1,
    supported_other_vehicle_types: Array.isArray(payload.supported_other_vehicle_types)
      ? payload.supported_other_vehicle_types.filter(Boolean).map(toObjectId)
      : [],
    vehicle_preference: Array.isArray(payload.vehicle_preference)
      ? payload.vehicle_preference.filter(Boolean).map(toObjectId)
      : [],
  });

  publicVehicleCatalogCache = { value: null, expiresAt: 0 };

  return vehicle.toObject();
};

export const updateVehicleType = async (id, payload) => {
  const vehicle = await Vehicle.findById(id);
  if (!vehicle) {
    throw new ApiError(404, 'Vehicle type not found');
  }

  if (payload.name !== undefined) {
    vehicle.name = String(payload.name).trim();
  }
  if (payload.short_description !== undefined) {
    vehicle.short_description = payload.short_description ?? '';
  }
  if (payload.description !== undefined) {
    vehicle.description = payload.description ?? '';
  }
  if (payload.transport_type !== undefined) {
    vehicle.transport_type = normalizeVehicleTransportType(payload.transport_type);
  }
  if (payload.dispatch_type !== undefined) {
    vehicle.dispatch_type = payload.dispatch_type || 'normal';
  }
  if (payload.icon_types !== undefined) {
    vehicle.icon_types = payload.icon_types || 'car';
  }
  if (payload.category !== undefined) {
    vehicle.category = String(payload.category || '').trim().toLowerCase();
  }
  if (payload.image !== undefined) {
    vehicle.image = payload.image ?? '';
  }
  if (payload.icon !== undefined || payload.map_icon !== undefined || payload.mapIcon !== undefined || payload.image !== undefined) {
    const mapIcon = payload.map_icon ?? payload.mapIcon ?? payload.icon ?? payload.image ?? '';
    vehicle.icon = mapIcon;
    vehicle.map_icon = mapIcon;
  }
  if (payload.capacity !== undefined) {
    vehicle.capacity = Number(payload.capacity || 0);
  }
  if (payload.size !== undefined) {
    vehicle.size = payload.size ?? '';
  }
  if (payload.is_taxi !== undefined) {
    vehicle.is_taxi = payload.is_taxi || vehicle.transport_type;
  }
  if (payload.is_accept_share_ride !== undefined) {
    vehicle.is_accept_share_ride = Number(payload.is_accept_share_ride || 0) ? 1 : 0;
  }
  if (payload.delivery_category !== undefined || payload.transport_type !== undefined) {
    vehicle.delivery_category = ['delivery', 'both'].includes(vehicle.transport_type)
      ? normalizeDeliveryCategory(payload.delivery_category ?? vehicle.delivery_category)
      : '';
  }
  if (payload.delivery_distance_pricing !== undefined || payload.transport_type !== undefined) {
    vehicle.delivery_distance_pricing = ['delivery', 'both'].includes(vehicle.transport_type)
      ? normalizeDeliveryDistancePricing(payload.delivery_distance_pricing, vehicle.delivery_distance_pricing)
      : normalizeDeliveryDistancePricing();
  }
  if (payload.service_tax !== undefined || payload.transport_type !== undefined) {
    vehicle.service_tax = ['delivery', 'both'].includes(vehicle.transport_type)
      ? normalizeDeliveryServiceTax(payload.service_tax, vehicle.service_tax)
      : 0;
  }
  if (payload.admin_commission_type_from_driver !== undefined) {
    vehicle.admin_commission_type_from_driver = Number(payload.admin_commission_type_from_driver ?? 1);
  }
  if (payload.admin_commission_from_driver !== undefined) {
    vehicle.admin_commission_from_driver = Number(payload.admin_commission_from_driver ?? 0);
  }
  if (payload.admin_commission_type_for_owner !== undefined) {
    vehicle.admin_commission_type_for_owner = Number(payload.admin_commission_type_for_owner ?? 1);
  }
  if (payload.admin_commission_for_owner !== undefined) {
    vehicle.admin_commission_for_owner = Number(payload.admin_commission_for_owner ?? 0);
  }
  if (payload.status !== undefined) {
    vehicle.status = Number(payload.status) ? 1 : 0;
    vehicle.active = vehicle.status === 1;
  }
  if (payload.supported_other_vehicle_types !== undefined) {
    vehicle.supported_other_vehicle_types = Array.isArray(payload.supported_other_vehicle_types)
      ? payload.supported_other_vehicle_types.filter(Boolean).map(toObjectId)
      : [];
  }
  if (payload.vehicle_preference !== undefined) {
    vehicle.vehicle_preference = Array.isArray(payload.vehicle_preference)
      ? payload.vehicle_preference.filter(Boolean).map(toObjectId)
      : [];
  }

  await vehicle.save();
  publicVehicleCatalogCache = { value: null, expiresAt: 0 };
  return vehicle.toObject();
};

export const deleteVehicleType = async (id) => {
  const deleted = await Vehicle.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Vehicle type not found');
  }
  publicVehicleCatalogCache = { value: null, expiresAt: 0 };
  return true;
};

export const listSetPrices = async (queryArgs = {}, currentAdmin = null) => {
  const scope = String(queryArgs.scope || '').trim();
  const query = scope ? { pricing_scope: scope } : {};
  const safePage = Math.max(1, Number(queryArgs.page || queryArgs.current_page || 1) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(queryArgs.limit || queryArgs.per_page || 10) || 10));
  const normalizedSearch = String(queryArgs.search || '').trim().toLowerCase();
  const normalizedTransportType = String(queryArgs.transport_type || '').trim().toLowerCase();
  const normalizedStatus = String(queryArgs.status || '').trim().toLowerCase();
  const normalizedZoneId = String(queryArgs.zone_id || '').trim();
  const normalizedVehicleTypeId = String(queryArgs.vehicle_type || '').trim();

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'set_prices.view', 'set prices');
    const scopedZoneIds = await getScopedZoneIds(currentAdmin);
    const { serviceLocationIds } = getAdminScope(currentAdmin);

    if (!isSuperAdmin(currentAdmin)) {
      query.$or = [];
      if (scopedZoneIds.length > 0) {
        query.$or.push({ zone_id: { $in: scopedZoneIds } });
      }
      if (serviceLocationIds.length > 0) {
        query.$or.push({ service_location_id: { $in: serviceLocationIds } });
      }
      if (query.$or.length === 0) {
        query._id = { $in: [] };
      }
    }
  }

  const items = await SetPrice.find(query)
    .select([
      'pricing_scope',
      'vehicle_type',
      'service_location_id',
      'package_type_id',
      'package_destination',
      'package_availability',
      'package_vehicle_prices',
      'payment_type',
      'transport_type',
      'zone_id',
      'status',
      'active',
      'capacity',
      'enable_shared_ride',
      'service_tax',
      'base_price',
      'base_distance',
      'price_per_distance',
      'time_price',
      'waiting_charge',
      'free_waiting_before',
      'free_waiting_after',
      'outstation_base_price',
      'outstation_base_distance',
      'outstation_price_per_distance',
      'outstation_time_price',
      'createdAt',
      'updatedAt',
    ].join(' '))
    .populate('vehicle_type', 'name icon capacity')
    .populate('service_location_id', 'name service_location_name currency_symbol')
    .populate('package_type_id', 'name')
    .populate('package_vehicle_prices.vehicle_type', 'name')
    .populate({
      path: 'zone_id',
      select: 'name unit service_location_id',
      populate: { path: 'service_location_id' }
    })
    .sort({ createdAt: -1 })
    .lean();

  const results = items.map((item) => {
    const vType = item.vehicle_type || {};
    const zone = item.zone_id || {};
    const sl = zone.service_location_id || {};
    const directServiceLocation = item.service_location_id || {};
    const effectiveServiceLocation = directServiceLocation._id ? directServiceLocation : sl;
    const packageType = item.package_type_id || {};

    return {
      id: String(item._id),
      pricing_scope: item.pricing_scope || 'ride',
      zone_id: zone._id ? String(zone._id) : null,
      service_location_id: effectiveServiceLocation._id ? String(effectiveServiceLocation._id) : null,
      type_id: vType._id ? String(vType._id) : null,
      name: vType.name || '',
      icon: vType.icon || '',
      capacity: vType.capacity || item.capacity || 0,
      is_accept_share_ride: item.enable_shared_ride || 0,
      active: item.active || 0,
      currency: effectiveServiceLocation.currency_symbol || '?',
      unit: Number(zone.unit || 1),
      unit_in_words: 'Km',
      zone_name: zone.name || '',
      service_location_name: effectiveServiceLocation.name || effectiveServiceLocation.service_location_name || '',
      vehicle_type_name: vType.name || '',
      drop_zone_name: null,
      transport_type: item.transport_type || 'both',
      package_type_id: packageType._id ? String(packageType._id) : null,
      package_type_name: packageType.name || '',
      package_destination: item.package_destination || '',
      package_availability: item.package_availability || 'available',
      package_vehicle_prices: Array.isArray(item.package_vehicle_prices)
        ? item.package_vehicle_prices.map((price) => ({
          vehicle_type: price.vehicle_type?._id ? String(price.vehicle_type._id) : null,
          vehicle_type_name: price.vehicle_type?.name || '',
          base_price: Number(price.base_price ?? 0),
          free_distance: Number(price.free_distance ?? 0),
          distance_price: Number(price.distance_price ?? 0),
          free_time: Number(price.free_time ?? 0),
          time_price: Number(price.time_price ?? 0),
          active: Number(price.active ?? 1),
        }))
        : [],
      payment_type: Array.isArray(item.payment_type)
        ? item.payment_type
        : (item.payment_type ? String(item.payment_type).split(',') : ['cash', 'online', 'wallet']),
      status: item.status || (item.active === false ? 'inactive' : 'active'),
      service_tax: Number(item.service_tax ?? 0),
      base_price: Number(item.base_price ?? 0),
      base_distance: Number(item.base_distance ?? 0),
      price_per_distance: Number(item.price_per_distance ?? 0),
      time_price: Number(item.time_price ?? 0),
      waiting_charge: Number(item.waiting_charge ?? 0),
      free_waiting_before: Number(item.free_waiting_before ?? 0),
      free_waiting_after: Number(item.free_waiting_after ?? 0),
      outstation_base_price: Number(item.outstation_base_price ?? 0),
      outstation_base_distance: Number(item.outstation_base_distance ?? 0),
      outstation_price_per_distance: Number(item.outstation_price_per_distance ?? 0),
      outstation_time_price: Number(item.outstation_time_price ?? 0),
      updatedAt: item.updatedAt,
    };
  });

  const paginatorData = items.map((item) => {
    const vType = item.vehicle_type || {};
    const zone = item.zone_id || {};
    const sl = zone.service_location_id || {};
    const directServiceLocation = item.service_location_id || {};
    const effectiveServiceLocation = directServiceLocation._id ? directServiceLocation : sl;
    const packageType = item.package_type_id || {};

    return {
      ...item,
      id: String(item._id),
      pricing_scope: item.pricing_scope || 'ride',
      vehicle_type_name: vType.name || '',
      icon: vType.icon || '',
      zone_name: zone.name || '',
      drop_zone_name: null,
      package_type_name: packageType.name || '',
      service_location_name: effectiveServiceLocation.name || effectiveServiceLocation.service_location_name || '',
      vehicle_type: vType
        ? {
          ...vType,
          id: String(vType._id),
          icon_types_for: vType.icon_types,
          trip_dispatch_type: vType.dispatch_type,
        }
        : null,
      service_location: effectiveServiceLocation
        ? {
          ...effectiveServiceLocation,
          id: String(effectiveServiceLocation._id || effectiveServiceLocation.id || ''),
        }
        : null,
      package_type: packageType
        ? {
          ...packageType,
          id: String(packageType._id || packageType.id || ''),
        }
        : null,
      package_vehicle_prices: Array.isArray(item.package_vehicle_prices)
        ? item.package_vehicle_prices.map((price, index) => ({
          ...price,
          id: String(price._id || index),
          vehicle_type: price.vehicle_type
            ? {
              ...price.vehicle_type,
              id: String(price.vehicle_type._id || price.vehicle_type.id || ''),
            }
            : null,
        }))
        : [],
      zone: zone
        ? {
          ...zone,
          id: String(zone._id),
          service_location: sl
            ? {
              ...sl,
              id: String(sl._id),
            }
            : null,
        }
        : null,
    };
  });

  const rows = results.map((result, index) => ({
    result,
    paginatorItem: paginatorData[index],
  })).filter((row) => {
    if (normalizedTransportType && String(row.result.transport_type || '').toLowerCase() !== normalizedTransportType) {
      return false;
    }

    if (normalizedStatus) {
      const rowStatus = String(row.result.status || (Number(row.result.active) === 1 ? 'active' : 'inactive')).toLowerCase();
      if (rowStatus !== normalizedStatus) {
        return false;
      }
    }

    if (normalizedZoneId) {
      const rowZoneId = String(
        row.paginatorItem?.zone?._id ||
        row.paginatorItem?.zone?.id ||
        row.paginatorItem?.zone_id?._id ||
        row.paginatorItem?.zone_id ||
        '',
      );
      if (rowZoneId !== normalizedZoneId) {
        return false;
      }
    }

    if (normalizedVehicleTypeId) {
      const rowVehicleTypeId = String(
        row.paginatorItem?.vehicle_type?._id ||
        row.paginatorItem?.vehicle_type?.id ||
        row.paginatorItem?.vehicle_type?._id ||
        row.result?.type_id ||
        '',
      );
      if (rowVehicleTypeId !== normalizedVehicleTypeId) {
        return false;
      }
    }

    if (normalizedSearch) {
      const haystack = [
        row.result.zone_name,
        row.result.vehicle_type_name,
        row.result.transport_type,
        row.result.service_location_name,
        row.result.package_type_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(normalizedSearch)) {
        return false;
      }
    }

    return true;
  });

  const paginated = buildPaginator(rows, safePage, safeLimit);
  const pagedRows = paginated.results;
  const total = paginated.paginator.total;
  const from = total === 0 ? 0 : (safePage - 1) * safeLimit + 1;
  const to = total === 0 ? 0 : Math.min((safePage - 1) * safeLimit + pagedRows.length, total);

  return {
    results: pagedRows.map((row) => row.result),
    paginator: {
      ...paginated.paginator,
      data: pagedRows.map((row) => row.paginatorItem),
      from,
      to,
    }
  };
};

export const getSetPriceById = async (id, currentAdmin = null) => {
  const item = await SetPrice.findById(id)
    .populate('vehicle_type')
    .populate('service_location_id')
    .populate('package_type_id')
    .populate('package_vehicle_prices.vehicle_type')
    .populate({
      path: 'zone_id',
      populate: { path: 'service_location_id' },
    })
    .lean();

  if (!item) {
    throw new ApiError(404, 'Set Price not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'set_prices.view', 'set prices');
    if (item.zone_id?._id || item.zone_id) {
      await assertZoneAccess(currentAdmin, item.zone_id?._id || item.zone_id);
    } else {
      assertServiceLocationAccess(currentAdmin, item.service_location_id?._id || item.service_location_id);
    }
  }

  return serializeSetPrice(item);
};

const resolveSetPriceVehicleAndTransportType = async ({
  vehicleTypeId = null,
  transportType = undefined,
  fallbackVehicleTypeId = null,
  fallbackTransportType = 'taxi',
}) => {
  const resolvedVehicleTypeId = toObjectId(vehicleTypeId || fallbackVehicleTypeId);

  if (!resolvedVehicleTypeId) {
    return {
      vehicleTypeId: null,
      transportType: transportType !== undefined
        ? normalizeVehicleTransportType(transportType)
        : normalizeVehicleTransportType(fallbackTransportType || 'taxi'),
    };
  }

  const vehicle = await Vehicle.findById(resolvedVehicleTypeId)
    .select('_id transport_type is_taxi')
    .lean();

  if (!vehicle) {
    throw new ApiError(404, 'Vehicle type not found');
  }

  const vehicleTransportType = normalizeVehicleTransportType(
    vehicle.transport_type || vehicle.is_taxi || 'taxi',
  );
  const requestedTransportType = transportType !== undefined
    ? normalizeVehicleTransportType(transportType)
    : normalizeVehicleTransportType(fallbackTransportType || vehicleTransportType);

  const isCompatible =
    vehicleTransportType === 'both'
      ? ['both', 'taxi', 'delivery', 'pooling'].includes(requestedTransportType)
      : requestedTransportType === vehicleTransportType;

  if (!isCompatible) {
    throw new ApiError(400, 'Selected vehicle type does not match the pricing transport type');
  }

  return {
    vehicleTypeId: resolvedVehicleTypeId,
    transportType:
      vehicleTransportType === 'both'
        ? requestedTransportType
        : vehicleTransportType,
  };
};

export const createSetPrice = async (payload, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'set_prices.view', 'set prices');
    if (payload.service_location_id) {
      assertServiceLocationAccess(currentAdmin, payload.service_location_id?._id || payload.service_location_id?.id || payload.service_location_id);
    }
    if (payload.zone_id) {
      await assertZoneAccess(currentAdmin, payload.zone_id?._id || payload.zone_id?.id || payload.zone_id);
    }
  }

  const payment_type = Array.isArray(payload.payment_type)
    ? payload.payment_type
    : typeof payload.payment_type === 'string'
      ? payload.payment_type.split(',').map(s => s.trim())
      : ['cash', 'online', 'wallet'];

  const zone_id = toObjectId(payload.zone_id?._id || payload.zone_id?.id || payload.zone_id);
  const requestedVehicleTypeId =
    payload.vehicle_type?._id || payload.vehicle_type?.id || payload.vehicle_type || payload.type_id;
  const payloadServiceLocationId =
    payload.service_location_id?._id
    || payload.service_location_id?.id
    || payload.service_location_id
    || payload.zone?.service_location?._id
    || payload.zone?.service_location?.id
    || payload.zone?.service_location_id;
  const zone = zone_id ? await Zone.findById(zone_id).select('_id service_location_id').lean() : null;
  const service_location_id = zone?.service_location_id
    ? toObjectId(zone.service_location_id)
    : toObjectId(payloadServiceLocationId);
  const { vehicleTypeId: vehicle_type, transportType: resolvedTransportType } =
    await resolveSetPriceVehicleAndTransportType({
      vehicleTypeId: requestedVehicleTypeId,
      transportType: payload.transport_type,
      fallbackTransportType: 'taxi',
    });

  const setPrice = await SetPrice.create({
    zone_id,
    vehicle_type,
    service_location_id,
    pricing_scope: payload.pricing_scope || 'ride',
    transport_type: resolvedTransportType,
    package_type_id: toObjectId(payload.package_type_id?._id || payload.package_type_id?.id || payload.package_type_id),
    package_destination: String(payload.package_destination || '').trim(),
    package_availability: payload.package_availability || 'available',
    package_vehicle_prices: Array.isArray(payload.package_vehicle_prices)
      ? payload.package_vehicle_prices.map((item) => normalizePackageVehiclePriceItem(item))
      : [],
    payment_type,
    active: Number(payload.active ?? 1),

    admin_commision_type: Number(payload.admin_commision_type ?? (payload.customer_commission_type === 'percentage' ? 1 : 0)),
    admin_commision: Number(payload.admin_commision ?? payload.customer_commission ?? 0),
    admin_commission_type_for_owner: Number(payload.admin_commission_type_for_owner ?? 1),
    admin_commission_for_owner: Number(payload.admin_commission_for_owner ?? 0),
    admin_commission_type_from_driver: Number(payload.admin_commission_type_from_driver ?? 1),
    admin_commission_from_driver: Number(payload.admin_commission_from_driver ?? 0),

    service_tax: Number(payload.service_tax ?? 0),
    airport_surge: Number(payload.airport_surge ?? 0),
    support_airport_fee: Number(payload.support_airport_fee ?? 0),
    support_outstation: Number(payload.support_outstation ?? 0),
    enable_airport_ride: payload.enable_airport_ride ?? !!payload.support_airport_fee,
    enable_outstation_ride: payload.enable_outstation_ride ?? !!payload.support_outstation,

    base_price: Number(payload.base_price ?? 0),
    base_distance: Number(payload.base_distance ?? 0),
    price_per_distance: Number(payload.price_per_distance ?? 0),
    time_price: Number(payload.time_price ?? 0),
    waiting_charge: Number(payload.waiting_charge ?? 0),
    outstation_base_price: Number(payload.outstation_base_price ?? 0),
    outstation_base_distance: Number(payload.outstation_base_distance ?? 0),
    outstation_price_per_distance: Number(payload.outstation_price_per_distance ?? 0),
    outstation_time_price: Number(payload.outstation_time_price ?? 0),
    free_waiting_before: Number(payload.free_waiting_before ?? 0),
    free_waiting_after: Number(payload.free_waiting_after ?? 0),

    enable_shared_ride: Number(payload.enable_shared_ride ?? (payload.enable_ride_sharing ? 1 : 0)),
    enable_ride_sharing: payload.enable_ride_sharing ?? !!payload.enable_shared_ride,
    price_per_seat: Number(payload.price_per_seat ?? 0),
    shared_price_per_distance: Number(payload.shared_price_per_distance ?? 0),
    shared_cancel_fee: Number(payload.shared_cancel_fee ?? 0),

    user_cancellation_fee: Number(payload.user_cancellation_fee ?? payload.cancellation_fee_for_user ?? 0),
    driver_cancellation_fee: Number(payload.driver_cancellation_fee ?? payload.cancellation_fee_for_driver ?? 0),
    cancellation_fee_goes_to: payload.cancellation_fee_goes_to ?? payload.fee_goes_to ?? 'admin',
    user_cancellation_fee_type: payload.user_cancellation_fee_type || 'percentage',
    driver_cancellation_fee_type: payload.driver_cancellation_fee_type || 'percentage',

    order_number: Number(payload.order_number ?? payload.eta_sequence ?? 1),
    bill_status: Number(payload.bill_status ?? 1),
    status: payload.status || 'active',
  });

  return setPrice.toObject();
};

export const updateSetPrice = async (id, payload, currentAdmin = null) => {
  const setPrice = await SetPrice.findById(id);
  if (!setPrice) throw new ApiError(404, 'Set Price not found');
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'set_prices.view', 'set prices');
    if (setPrice.zone_id) {
      await assertZoneAccess(currentAdmin, setPrice.zone_id);
    } else {
      assertServiceLocationAccess(currentAdmin, setPrice.service_location_id);
    }
  }

  const fields = [
    'zone_id', 'vehicle_type', 'service_location_id', 'transport_type',
    'pricing_scope', 'package_type_id', 'package_destination', 'package_availability',
    'payment_type', 'active', 'admin_commision_type', 'admin_commision',
    'admin_commission_type_for_owner', 'admin_commission_for_owner',
    'admin_commission_type_from_driver', 'admin_commission_from_driver',
    'service_tax', 'airport_surge', 'support_airport_fee', 'support_outstation',
    'enable_airport_ride', 'enable_outstation_ride',
    'base_price', 'base_distance', 'price_per_distance', 'time_price',
    'waiting_charge', 'outstation_base_price', 'outstation_base_distance',
    'outstation_price_per_distance', 'outstation_time_price',
    'free_waiting_before', 'free_waiting_after',
    'enable_shared_ride', 'enable_ride_sharing', 'price_per_seat',
    'shared_price_per_distance', 'shared_cancel_fee',
    'user_cancellation_fee', 'driver_cancellation_fee', 'cancellation_fee_goes_to',
    'user_cancellation_fee_type', 'driver_cancellation_fee_type',
    'order_number', 'bill_status', 'status'
  ];

  const nonNegativeFields = new Set([
    'admin_commision',
    'admin_commission_for_owner',
    'admin_commission_from_driver',
    'service_tax',
    'airport_surge',
    'support_airport_fee',
    'support_outstation',
    'base_price',
    'base_distance',
    'price_per_distance',
    'time_price',
    'waiting_charge',
    'outstation_base_price',
    'outstation_base_distance',
    'outstation_price_per_distance',
    'outstation_time_price',
    'free_waiting_before',
    'free_waiting_after',
    'price_per_seat',
    'shared_price_per_distance',
    'shared_cancel_fee',
    'user_cancellation_fee',
    'driver_cancellation_fee',
    'order_number',
  ]);

  const requestedVehicleTypeId =
    payload.vehicle_type?._id || payload.vehicle_type?.id || payload.vehicle_type || payload.type_id;
  const shouldReconcileVehicleTransport =
    payload.transport_type !== undefined || requestedVehicleTypeId !== undefined;

  let reconciledVehicleAndTransport = null;
  if (shouldReconcileVehicleTransport) {
    reconciledVehicleAndTransport = await resolveSetPriceVehicleAndTransportType({
      vehicleTypeId: requestedVehicleTypeId,
      transportType: payload.transport_type,
      fallbackVehicleTypeId: setPrice.vehicle_type,
      fallbackTransportType: setPrice.transport_type || 'taxi',
    });
  }

  for (const field of fields) {
    let value = payload[field];

    if (field === 'zone_id') value = payload.zone_id?._id || payload.zone_id?.id || payload.zone_id;
    if (field === 'vehicle_type' && reconciledVehicleAndTransport) value = reconciledVehicleAndTransport.vehicleTypeId;
    if (field === 'vehicle_type' && !reconciledVehicleAndTransport) value = payload.vehicle_type?._id || payload.vehicle_type?.id || payload.vehicle_type || payload.type_id;
    if (field === 'service_location_id') {
      const payloadServiceLocationId =
        payload.service_location_id?._id
        || payload.service_location_id?.id
        || payload.service_location_id
        || payload.zone?.service_location?._id
        || payload.zone?.service_location?.id
        || payload.zone?.service_location_id;
      const zoneValue = payload.zone_id?._id || payload.zone_id?.id || payload.zone_id || setPrice.zone_id;
      const zone = zoneValue ? await Zone.findById(zoneValue).select('_id service_location_id').lean() : null;
      value = zone?.service_location_id || payloadServiceLocationId;
    }
    if (field === 'package_type_id') value = payload.package_type_id?._id || payload.package_type_id?.id || payload.package_type_id;
    if (field === 'transport_type' && reconciledVehicleAndTransport) value = reconciledVehicleAndTransport.transportType;
    if (field === 'transport_type' && !reconciledVehicleAndTransport && value !== undefined) value = normalizeVehicleTransportType(value);

    if (currentAdmin && value !== undefined) {
      if (field === 'zone_id' && value) {
        assertZoneAccess(currentAdmin, value);
      }
      if (field === 'service_location_id' && value) {
        assertServiceLocationAccess(currentAdmin, value);
      }
    }

    if (value === undefined) {
      if (field === 'admin_commision') value = payload.customer_commission;
      if (field === 'admin_commision_type') value = payload.customer_commission_type === 'percentage' ? 1 : (payload.customer_commission_type === 'fixed' ? 0 : undefined);
      if (field === 'order_number') value = payload.eta_sequence;
      if (field === 'user_cancellation_fee') value = payload.cancellation_fee_for_user;
      if (field === 'driver_cancellation_fee') value = payload.cancellation_fee_for_driver;
      if (field === 'cancellation_fee_goes_to') value = payload.fee_goes_to;
      if (field === 'enable_ride_sharing') value = payload.enable_shared_ride !== undefined ? !!payload.enable_shared_ride : undefined;
    }

    if (value !== undefined) {
      if (field.includes('_id') || field === 'vehicle_type') {
        setPrice[field] = value ? toObjectId(value) : null;
      } else if (field === 'payment_type') {
        setPrice[field] = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',').map(s => s.trim()) : value);
      } else if (typeof setPrice[field] === 'number' || ['admin_commision', 'service_tax', 'base_price', 'base_distance', 'price_per_distance', 'time_price', 'order_number'].includes(field)) {
        const numericValue = Number(value);
        setPrice[field] = nonNegativeFields.has(field)
          ? Math.max(0, numericValue)
          : numericValue;
      } else {
        setPrice[field] = value;
      }
    }
  }

  if (payload.package_vehicle_prices !== undefined) {
    setPrice.package_vehicle_prices = Array.isArray(payload.package_vehicle_prices)
      ? payload.package_vehicle_prices.map((item) => normalizePackageVehiclePriceItem(item))
      : [];
  }

  await setPrice.save();
  return setPrice.toObject();
};

export const deleteSetPrice = async (id, currentAdmin = null) => {
  if (currentAdmin) {
    const setPrice = await SetPrice.findById(id).select('service_location_id zone_id').lean();
    if (!setPrice) throw new ApiError(404, 'Set Price not found');
    assertAdminPermission(currentAdmin, 'set_prices.view', 'set prices');
    if (setPrice.zone_id) {
      await assertZoneAccess(currentAdmin, setPrice.zone_id);
    } else {
      assertServiceLocationAccess(currentAdmin, setPrice.service_location_id);
    }
  }
  const deleted = await SetPrice.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Set Price not found');
  return true;
};

export const listOwners = async (queryArgs = {}, currentAdmin = null) => {
  await ensureFleetOwnersSeeded();
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'owners.view', 'owners');
  }
  const search = String(queryArgs.search || '').trim();

  const query = currentAdmin ? buildServiceLocationScopeQuery(currentAdmin) : {};
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: regex }, { mobile: regex }, { email: regex }, { company_name: regex }];
  }

  const owners = await Owner.find(query)
    .populate(
      'service_location_id',
      'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
    )
    .sort({ createdAt: -1 })
    .lean();

  return owners.map(serializeOwner);
};

export const approveOwnerSignupFromDriver = async (driverId) => {
  await ensureFleetOwnersSeeded();

  const id = String(driverId || '').trim();
  if (!id) {
    throw new ApiError(400, 'Driver id is required');
  }

  const driver = await Driver.findById(id).select('+password').lean();
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const onboardingRole = String(driver?.onboarding?.role || '').toLowerCase();
  if (onboardingRole !== 'owner') {
    throw new ApiError(400, 'Driver is not an owner signup');
  }

  const company = driver?.onboarding?.company || {};
  const companyName = String(company.name || '').trim();

  if (!companyName) {
    throw new ApiError(400, 'Owner company name is missing');
  }

  const email = String(driver.email || '').trim().toLowerCase();
  const mobile = String(driver.phone || driver.mobile || '').trim();

  if (!email) {
    throw new ApiError(400, 'Owner email is missing');
  }

  if (!mobile) {
    throw new ApiError(400, 'Owner mobile is missing');
  }

  const existingOwner =
    (await Owner.findOne({ legacy_id: String(driver._id) }).lean()) ||
    (await Owner.findOne({ $or: [{ email }, { mobile }] }).lean());

  if (existingOwner) {
    await Owner.updateOne(
      { _id: existingOwner._id },
      { $set: { approve: true, status: 'approved', active: true } },
    );

    await Driver.updateOne(
      { _id: driver._id },
      {
        $set: {
          approve: true,
          status: 'approved',
          'onboarding.convertedOwnerId': existingOwner._id,
        },
      },
    );

    const populatedOwner = await Owner.findById(existingOwner._id)
      .populate(
        'service_location_id',
        'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
      )
      .lean();

    return serializeOwner(populatedOwner);
  }

  const serviceLocationId =
    company.serviceLocationId && mongoose.isValidObjectId(company.serviceLocationId)
      ? toObjectId(company.serviceLocationId)
      : null;

  if (!driver.password) {
    throw new ApiError(400, 'Owner password is missing');
  }

  const owner = await Owner.create({
    company_name: companyName,
    name: String(driver.name || companyName).trim(),
    mobile,
    email,
    password: driver.password,
    service_location_id: serviceLocationId,
    legacy_service_location_id: serviceLocationId ? '' : String(company.serviceLocationId || '').trim(),
    transport_type: String(company.registerFor || driver.registerFor || 'taxi').trim().toLowerCase(),
    address: String(company.address || '').trim() || null,
    postal_code: String(company.postalCode || '').trim() || null,
    city: String(company.city || driver.city || company.serviceLocationName || '').trim() || null,
    tax_number: String(company.taxNumber || '').trim() || null,
    active: true,
    approve: true,
    status: 'approved',
    legacy_id: String(driver._id),
    user_snapshot: {
      driver_id: String(driver._id),
      source: 'driver_onboarding_owner',
    },
  });

  await Driver.updateOne(
    { _id: driver._id },
    { $set: { approve: true, status: 'approved', 'onboarding.convertedOwnerId': owner._id } },
  );

  const populatedOwner = await Owner.findById(owner._id)
    .populate(
      'service_location_id',
      'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
    )
    .lean();

  return serializeOwner(populatedOwner);
};

export const getOwnerById = async (id, currentAdmin = null) => {
  await ensureFleetOwnersSeeded();

  const ownerId = String(id || '').trim();
  if (!ownerId) throw new ApiError(400, 'Owner id is required');

  const owner = await Owner.findOne(
    mongoose.isValidObjectId(ownerId) ? { _id: ownerId } : { legacy_id: ownerId },
  )
    .populate(
      'service_location_id',
      'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
    )
    .lean();

  if (!owner) throw new ApiError(404, 'Owner not found');
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'owners.view', 'owners');
    assertServiceLocationAccess(currentAdmin, owner.service_location_id?._id || owner.service_location_id);
  }
  return serializeOwner(owner);
};

export const createOwner = async (payload) => {
  if (!payload.company_name?.trim()) {
    throw new ApiError(400, 'Company name is required');
  }
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Owner name is required');
  }
  if (!payload.mobile?.trim()) {
    throw new ApiError(400, 'Mobile number is required');
  }
  if (!payload.email?.trim()) {
    throw new ApiError(400, 'Email is required');
  }
  if (!payload.password || String(payload.password).length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters');
  }
  if (payload.password !== payload.password_confirmation) {
    throw new ApiError(400, 'Passwords do not match');
  }

  const normalizedEmail = String(payload.email).trim().toLowerCase();
  const normalizedMobile = String(payload.mobile).trim();
  const serviceLocationId =
    payload.service_location_id && mongoose.isValidObjectId(payload.service_location_id)
      ? toObjectId(payload.service_location_id)
      : null;

  const existingOwner = await Owner.findOne({
    $or: [{ email: normalizedEmail }, { mobile: normalizedMobile }],
  }).lean();

  if (existingOwner) {
    throw new ApiError(409, 'Owner with this email or mobile already exists');
  }

  const owner = await Owner.create({
    company_name: String(payload.company_name).trim(),
    owner_name: payload.owner_name ? String(payload.owner_name).trim() : null,
    name: String(payload.name).trim(),
    mobile: normalizedMobile,
    email: normalizedEmail,
    password: await hashPassword(String(payload.password)),
    service_location_id: serviceLocationId,
    legacy_service_location_id:
      payload.legacy_service_location_id || (serviceLocationId ? '' : payload.service_location_id || ''),
    transport_type: payload.transport_type || 'taxi',
    phone: payload.phone || null,
    address: payload.address || null,
    postal_code: payload.postal_code || null,
    city: payload.city || null,
    tax_number: payload.tax_number || null,
    active: normalizeBoolean(payload.active ?? true),
    approve: normalizeBoolean(payload.approve ?? false),
    status: normalizeBoolean(payload.approve ?? false) ? 'approved' : 'pending',
  });

  const populatedOwner = await Owner.findById(owner._id)
    .populate(
      'service_location_id',
      'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
    )
    .lean();

  return serializeOwner(populatedOwner);
};

export const updateOwner = async (id, payload) => {
  const owner = await Owner.findById(id);
  if (!owner) throw new ApiError(404, 'Owner not found');

  if (payload.company_name !== undefined) {
    owner.company_name = String(payload.company_name).trim();
  }
  if (payload.name !== undefined) {
    owner.name = String(payload.name).trim();
  }
  if (payload.mobile !== undefined) {
    const mobile = String(payload.mobile).trim();
    const duplicateMobile = await Owner.findOne({ _id: { $ne: id }, mobile }).lean();
    if (duplicateMobile) {
      throw new ApiError(409, 'Another owner already uses this mobile number');
    }
    owner.mobile = mobile;
  }
  if (payload.email !== undefined) {
    const email = String(payload.email).trim().toLowerCase();
    const duplicateEmail = await Owner.findOne({ _id: { $ne: id }, email }).lean();
    if (duplicateEmail) {
      throw new ApiError(409, 'Another owner already uses this email');
    }
    owner.email = email;
  }
  if (payload.service_location_id !== undefined) {
    if (payload.service_location_id && mongoose.isValidObjectId(payload.service_location_id)) {
      owner.service_location_id = toObjectId(payload.service_location_id);
      owner.legacy_service_location_id = '';
    } else {
      owner.service_location_id = null;
      owner.legacy_service_location_id = payload.service_location_id || '';
    }
  }
  if (payload.transport_type !== undefined) {
    owner.transport_type = payload.transport_type || 'taxi';
  }
  if (payload.active !== undefined) {
    owner.active = normalizeBoolean(payload.active);
  }
  if (payload.approve !== undefined) {
    owner.approve = normalizeBoolean(payload.approve);
    owner.status = owner.approve ? 'approved' : 'pending';
  }
  if (payload.status !== undefined) {
    const normalizedStatus = String(payload.status || 'pending').trim().toLowerCase();
    if (!['pending', 'approved', 'rejected'].includes(normalizedStatus)) {
      throw new ApiError(400, 'Invalid owner status');
    }
    owner.status = normalizedStatus;
    owner.approve = normalizedStatus === 'approved';
    if (payload.active === undefined) {
      owner.active = normalizedStatus !== 'rejected';
    }
  }
  if (payload.password) {
    if (String(payload.password).length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters');
    }
    if (payload.password !== payload.password_confirmation) {
      throw new ApiError(400, 'Passwords do not match');
    }
    owner.password = await hashPassword(String(payload.password));
  }

  if (payload.owner_name !== undefined) owner.owner_name = payload.owner_name || null;
  if (payload.phone !== undefined) owner.phone = payload.phone || null;
  if (payload.address !== undefined) owner.address = payload.address || null;
  if (payload.postal_code !== undefined) owner.postal_code = payload.postal_code || null;
  if (payload.city !== undefined) owner.city = payload.city || null;
  if (payload.tax_number !== undefined) owner.tax_number = payload.tax_number || null;
  if (payload.no_of_vehicles !== undefined) owner.no_of_vehicles = Number(payload.no_of_vehicles || 0);
  if (payload.documents !== undefined) {
    if (!owner.user_snapshot) {
      owner.user_snapshot = {};
    }
    owner.user_snapshot = {
      ...owner.user_snapshot,
      documents: payload.documents,
    };
    owner.markModified('user_snapshot');
  }

  await owner.save();

  const populatedOwner = await Owner.findById(owner._id)
    .populate(
      'service_location_id',
      'legacy_id company_key name service_location_name translation_dataset currency_name currency_code currency_symbol currency_pointer timezone country active createdAt updatedAt',
    )
    .lean();

  return serializeOwner(populatedOwner);
};

export const approveOwner = async (id, payload) =>
  updateOwner(id, { approve: normalizeBoolean(payload.approve), active: true });

export const listFleetVehicles = async () => {
  await ensureFleetOwnersSeeded();

  const items = await FleetVehicle.find()
    .populate('owner_id', 'company_name owner_name name email mobile')
    .populate('service_location_id', 'service_location_name name country')
    .populate('vehicle_type_id', 'name type_name transport_type icon_types')
    .sort({ createdAt: -1 })
    .lean();

  return { results: items.map(serializeFleetVehicle) };
};

export const createFleetVehicle = async (payload = {}) => {
  await ensureFleetOwnersSeeded();

  const ownerId = payload.owner_id || payload.ownerId;
  const serviceLocationId = payload.service_location_id || payload.serviceLocationId;
  const vehicleTypeId = payload.vehicle_type_id || payload.vehicleTypeId;

  if (!ownerId) throw new ApiError(400, 'Owner is required');
  if (!serviceLocationId) throw new ApiError(400, 'Service location is required');
  if (!mongoose.isValidObjectId(ownerId)) throw new ApiError(400, 'Invalid owner id');
  if (!mongoose.isValidObjectId(serviceLocationId)) throw new ApiError(400, 'Invalid service location id');
  if (!payload.car_brand?.trim()) throw new ApiError(400, 'Car brand is required');
  if (!payload.car_model?.trim()) throw new ApiError(400, 'Car model is required');
  if (!payload.license_plate_number?.trim()) throw new ApiError(400, 'License plate number is required');
  if (!payload.car_color?.trim()) throw new ApiError(400, 'Car color is required');

  const normalizedPlate = String(payload.license_plate_number).trim().toUpperCase();

  const existing = await FleetVehicle.findOne({
    owner_id: toObjectId(ownerId),
    license_plate_number: normalizedPlate,
  }).lean();

  if (existing) {
    throw new ApiError(409, 'Fleet vehicle with this license plate already exists for this owner');
  }

  const item = await FleetVehicle.create({
    owner_id: toObjectId(ownerId),
    service_location_id: toObjectId(serviceLocationId),
    transport_type: String(payload.transport_type || 'taxi').trim().toLowerCase(),
    vehicle_type_id: vehicleTypeId && mongoose.isValidObjectId(vehicleTypeId) ? toObjectId(vehicleTypeId) : null,
    car_brand: String(payload.car_brand).trim(),
    car_model: String(payload.car_model).trim(),
    license_plate_number: normalizedPlate,
    car_color: String(payload.car_color).trim(),
    status: String(payload.status || 'pending').trim().toLowerCase(),
    reason: String(payload.reason || '').trim(),
    active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
  });

  const populated = await FleetVehicle.findById(item._id)
    .populate('owner_id', 'company_name owner_name name email mobile')
    .populate('service_location_id', 'service_location_name name country')
    .populate('vehicle_type_id', 'name type_name transport_type icon_types')
    .lean();

  return serializeFleetVehicle(populated);
};

export const updateFleetVehicle = async (id, payload = {}) => {
  await ensureFleetOwnersSeeded();

  const item = await FleetVehicle.findById(id);
  if (!item) throw new ApiError(404, 'Fleet vehicle not found');

  if (payload.owner_id !== undefined) {
    if (payload.owner_id && !mongoose.isValidObjectId(payload.owner_id)) {
      throw new ApiError(400, 'Invalid owner id');
    }
    item.owner_id = payload.owner_id ? toObjectId(payload.owner_id) : item.owner_id;
  }
  if (payload.service_location_id !== undefined) {
    if (payload.service_location_id && !mongoose.isValidObjectId(payload.service_location_id)) {
      throw new ApiError(400, 'Invalid service location id');
    }
    item.service_location_id = payload.service_location_id ? toObjectId(payload.service_location_id) : item.service_location_id;
  }
  if (payload.transport_type !== undefined) item.transport_type = String(payload.transport_type || '').trim().toLowerCase();
  if (payload.vehicle_type_id !== undefined) {
    item.vehicle_type_id =
      payload.vehicle_type_id && mongoose.isValidObjectId(payload.vehicle_type_id) ? toObjectId(payload.vehicle_type_id) : null;
  }
  if (payload.car_brand !== undefined) item.car_brand = String(payload.car_brand || '').trim();
  if (payload.car_model !== undefined) item.car_model = String(payload.car_model || '').trim();
  if (payload.license_plate_number !== undefined) item.license_plate_number = String(payload.license_plate_number || '').trim().toUpperCase();
  if (payload.car_color !== undefined) item.car_color = String(payload.car_color || '').trim();
  if (payload.status !== undefined) item.status = String(payload.status || 'pending').trim().toLowerCase();
  if (payload.reason !== undefined) item.reason = String(payload.reason || '').trim();
  if (payload.active !== undefined) item.active = normalizeBoolean(payload.active);

  await item.save();

  const populated = await FleetVehicle.findById(item._id)
    .populate('owner_id', 'company_name owner_name name email mobile')
    .populate('service_location_id', 'service_location_name name country')
    .populate('vehicle_type_id', 'name type_name transport_type icon_types')
    .lean();

  return serializeFleetVehicle(populated);
};

export const deleteFleetVehicle = async (id) => {
  const deleted = await FleetVehicle.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Fleet vehicle not found');
  return true;
};

export const deleteOwner = async (id) => {
  const owner = await Owner.findByIdAndDelete(id);
  if (!owner) throw new ApiError(404, 'Owner not found');
  return true;
};

export const listOwnerBookings = async () => {
  const items = await OwnerBooking.find()
    .populate('owner_id', 'full_name name email mobile')
    .sort({ createdAt: -1 })
    .lean();

  return items.map(serializeOwnerBooking);
};

export const createOwnerBooking = async (payload) => {
  if (!payload.booking_reference?.trim()) {
    throw new ApiError(400, 'Booking reference is required');
  }

  if (!payload.customer_name?.trim()) {
    throw new ApiError(400, 'Customer name is required');
  }

  const item = await OwnerBooking.create({
    owner_id: payload.owner_id ? toObjectId(payload.owner_id) : null,
    booking_reference: String(payload.booking_reference).trim(),
    customer_name: String(payload.customer_name).trim(),
    customer_phone: String(payload.customer_phone || '').trim(),
    pickup_location: String(payload.pickup_location || '').trim(),
    dropoff_location: String(payload.dropoff_location || '').trim(),
    trip_type: payload.trip_type || 'city',
    vehicle_type: String(payload.vehicle_type || '').trim(),
    trip_date: payload.trip_date ? new Date(payload.trip_date) : null,
    fare_amount: toNullableNumber(payload.fare_amount) ?? 0,
    payment_status: payload.payment_status || 'pending',
    booking_status: payload.booking_status || 'pending',
    notes: String(payload.notes || '').trim(),
    active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
  });

  const populatedItem = await OwnerBooking.findById(item._id)
    .populate('owner_id', 'full_name name email mobile')
    .lean();

  return serializeOwnerBooking(populatedItem);
};

export const updateOwnerBooking = async (id, payload) => {
  const item = await OwnerBooking.findById(id);
  if (!item) throw new ApiError(404, 'Owner booking not found');

  if (payload.owner_id !== undefined) {
    item.owner_id = payload.owner_id ? toObjectId(payload.owner_id) : null;
  }
  if (payload.booking_reference !== undefined) {
    item.booking_reference = String(payload.booking_reference || '').trim();
  }
  if (payload.customer_name !== undefined) {
    item.customer_name = String(payload.customer_name || '').trim();
  }
  if (payload.customer_phone !== undefined) {
    item.customer_phone = String(payload.customer_phone || '').trim();
  }
  if (payload.pickup_location !== undefined) {
    item.pickup_location = String(payload.pickup_location || '').trim();
  }
  if (payload.dropoff_location !== undefined) {
    item.dropoff_location = String(payload.dropoff_location || '').trim();
  }
  if (payload.trip_type !== undefined) {
    item.trip_type = payload.trip_type || 'city';
  }
  if (payload.vehicle_type !== undefined) {
    item.vehicle_type = String(payload.vehicle_type || '').trim();
  }
  if (payload.trip_date !== undefined) {
    item.trip_date = payload.trip_date ? new Date(payload.trip_date) : null;
  }
  if (payload.fare_amount !== undefined) {
    item.fare_amount = toNullableNumber(payload.fare_amount) ?? 0;
  }
  if (payload.payment_status !== undefined) {
    item.payment_status = payload.payment_status || 'pending';
  }
  if (payload.booking_status !== undefined) {
    item.booking_status = payload.booking_status || 'pending';
  }
  if (payload.notes !== undefined) {
    item.notes = String(payload.notes || '').trim();
  }
  if (payload.active !== undefined) {
    item.active = normalizeBoolean(payload.active);
  }

  await item.save();

  const populatedItem = await OwnerBooking.findById(item._id)
    .populate('owner_id', 'full_name name email mobile')
    .lean();

  return serializeOwnerBooking(populatedItem);
};

export const deleteOwnerBooking = async (id) => {
  const deleted = await OwnerBooking.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Owner booking not found');
  return true;
};

const normalizeAdminEarningOption = (value) => String(value || '').trim();

const formatAdminEarningDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const getRideCompletedDate = (ride) => formatAdminEarningDate(ride.completedAt || ride.updatedAt || ride.createdAt);

const matchesAdminEarningDateRange = (ride, startDate, endDate) => {
  if (!startDate && !endDate) return true;

  const completedDate = getRideCompletedDate(ride);
  if (!completedDate) return false;

  if (startDate && completedDate < startDate) return false;
  if (endDate && completedDate > endDate) return false;
  return true;
};

const groupAdminEarnings = (rows, keyGetter, labelGetter) => {
  const map = new Map();

  rows.forEach((row) => {
    const key = keyGetter(row) || 'unknown';
    const label = labelGetter(row) || 'Unknown';
    const current = map.get(key) || {
      key,
      label,
      trips: 0,
      grossFare: 0,
      adminCommission: 0,
      driverEarnings: 0,
    };

    current.trips += 1;
    current.grossFare += row.grossFare;
    current.adminCommission += row.adminCommission;
    current.driverEarnings += row.driverEarnings;
    map.set(key, current);
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      grossFare: Number(item.grossFare.toFixed(2)),
      adminCommission: Number(item.adminCommission.toFixed(2)),
      driverEarnings: Number(item.driverEarnings.toFixed(2)),
    }))
    .sort((a, b) => b.adminCommission - a.adminCommission);
};

export const getAdminEarnings = async (query = {}) => {
  const {
    from,
    to,
    zone,
    vehicle,
    riderType,
    paymentMethod,
    search,
    page = 1,
    limit = 10,
  } = query;

  const startDate = from ? new Date(from) : null;
  const endDate = to ? new Date(to) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new ApiError(400, 'Invalid from date');
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new ApiError(400, 'Invalid to date');
  }

  if (endDate) {
    endDate.setHours(23, 59, 59, 999);
  }

  const rides = await Ride.find({ status: RIDE_STATUS.COMPLETED })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .populate('userId', 'name phone')
    .populate({
      path: 'driverId',
      select: 'name phone vehicleType vehicleNumber zoneId',
      populate: { path: 'zoneId', select: 'name' },
    })
    .populate('vehicleTypeId', 'name type_name transport_type icon_types')
    .lean();

  const zoneFilter = normalizeAdminEarningOption(zone);
  const vehicleFilter = normalizeAdminEarningOption(vehicle);
  const riderTypeFilter = normalizeAdminEarningOption(riderType).toLowerCase();
  const paymentFilter = normalizeAdminEarningOption(paymentMethod).toLowerCase();
  const searchFilter = normalizeAdminEarningOption(search).toLowerCase();

  let rows = rides
    .filter((ride) => matchesAdminEarningDateRange(ride, startDate, endDate))
    .map((ride) => {
      const vehicleDoc = ride.vehicleTypeId || {};
      const driver = ride.driverId || {};
      const zoneDoc = driver.zoneId || {};
      const requestId = `REQ_${String(ride._id).slice(-12).toUpperCase()}`;
      const grossFare = Number(ride.fare || 0);
      const adminCommission = Number(ride.commissionAmount || 0);
      const driverEarnings = Number(ride.driverEarnings || Math.max(grossFare - adminCommission, 0));
      const completedDate = getRideCompletedDate(ride);

      return {
        id: String(ride._id),
        requestId,
        completedAt: completedDate,
        userName: ride.userId?.name || 'Unknown Rider',
        userPhone: ride.userId?.phone || '',
        driverName: driver.name || 'Unassigned Driver',
        driverPhone: driver.phone || '',
        riderType: ride.serviceType || 'ride',
        paymentMethod: ride.paymentMethod || 'cash',
        zoneId: zoneDoc?._id ? String(zoneDoc._id) : '',
        zoneName: zoneDoc?.name || 'Unmapped Zone',
        vehicleId: vehicleDoc?._id ? String(vehicleDoc._id) : '',
        vehicleName: vehicleDoc?.name || vehicleDoc?.type_name || ride.vehicleIconType || driver.vehicleType || 'Vehicle',
        transportType: vehicleDoc?.transport_type || ride.transport_type || 'taxi',
        grossFare: Number(grossFare.toFixed(2)),
        adminCommission: Number(adminCommission.toFixed(2)),
        driverEarnings: Number(driverEarnings.toFixed(2)),
        commissionRate: Number(ride.pricingSnapshot?.admin_commission_from_driver || 0),
        commissionType: Number(ride.pricingSnapshot?.admin_commission_type_from_driver || 1) === 1 ? 'percentage' : 'fixed',
      };
    });

  if (zoneFilter) {
    rows = rows.filter((row) => row.zoneId === zoneFilter || row.zoneName.toLowerCase() === zoneFilter.toLowerCase());
  }

  if (vehicleFilter) {
    rows = rows.filter((row) => row.vehicleId === vehicleFilter || row.vehicleName.toLowerCase() === vehicleFilter.toLowerCase());
  }

  if (riderTypeFilter) {
    rows = rows.filter((row) => String(row.riderType || '').toLowerCase() === riderTypeFilter);
  }

  if (paymentFilter) {
    rows = rows.filter((row) => String(row.paymentMethod || '').toLowerCase() === paymentFilter);
  }

  if (searchFilter) {
    rows = rows.filter((row) =>
      [
        row.requestId,
        row.userName,
        row.userPhone,
        row.driverName,
        row.driverPhone,
        row.zoneName,
        row.vehicleName,
        row.riderType,
        row.paymentMethod,
      ].some((value) => String(value || '').toLowerCase().includes(searchFilter)),
    );
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalTrips += 1;
      acc.grossFare += row.grossFare;
      acc.adminCommission += row.adminCommission;
      acc.driverEarnings += row.driverEarnings;
      if (row.paymentMethod === 'cash') acc.byCash += row.adminCommission;
      if (row.paymentMethod === 'online') acc.byOnline += row.adminCommission;
      return acc;
    },
    { totalTrips: 0, grossFare: 0, adminCommission: 0, driverEarnings: 0, byCash: 0, byOnline: 0 },
  );

  const roundedTotals = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, typeof value === 'number' ? Number(value.toFixed(2)) : value]),
  );

  return {
    summary: {
      ...roundedTotals,
      averageCommission: rows.length ? Number((totals.adminCommission / rows.length).toFixed(2)) : 0,
    },
    breakdowns: {
      zones: groupAdminEarnings(rows, (row) => row.zoneId, (row) => row.zoneName),
      vehicles: groupAdminEarnings(rows, (row) => row.vehicleId, (row) => row.vehicleName),
      riderTypes: groupAdminEarnings(rows, (row) => row.riderType, (row) => row.riderType),
    },
    filters: {
      from: from || '',
      to: to || '',
      zone: zoneFilter,
      vehicle: vehicleFilter,
      riderType: riderTypeFilter,
      paymentMethod: paymentFilter,
      search: searchFilter,
    },
    ...buildPaginator(rows, Number(page) || 1, Number(limit) || 10),
  };
};

export const getDashboardData = async () => {
  if (dashboardCache.value && dashboardCache.expiresAt > Date.now()) {
    return dashboardCache.value;
  }

  const [totalUsers, totalDrivers, totalOwners, approvedDrivers, rides, supportTicketStats] = await Promise.all([
    User.countDocuments(),
    Driver.countDocuments(),
    Owner.countDocuments(),
    Driver.countDocuments({ approve: true }),
    Ride.find()
      .select('status liveStatus fare paymentMethod commissionAmount driverEarnings driverId createdAt updatedAt completedAt')
      .sort({ createdAt: -1 })
      .lean(),
    SupportTicket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const getRideEventDate = (ride) => {
    const status = String(ride?.status || '').toLowerCase();
    if (status === RIDE_STATUS.COMPLETED) {
      return ride?.completedAt || ride?.updatedAt || ride?.createdAt || null;
    }
    if (status === RIDE_STATUS.CANCELLED) {
      return ride?.updatedAt || ride?.createdAt || null;
    }
    return ride?.createdAt || ride?.updatedAt || null;
  };

  const isWithinRange = (date, rangeStart, rangeEnd) => {
    const value = date ? new Date(date) : null;
    if (!value || Number.isNaN(value.getTime())) return false;
    return value >= rangeStart && value <= rangeEnd;
  };

  const isCompletedRide = (ride) => String(ride?.status || '').toLowerCase() === RIDE_STATUS.COMPLETED;
  const isCancelledRide = (ride) => String(ride?.status || '').toLowerCase() === RIDE_STATUS.CANCELLED;
  const isScheduledRide = (ride) => !isCompletedRide(ride) && !isCancelledRide(ride);

  const completedRides = rides.filter(isCompletedRide);
  const cancelledRides = rides.filter(isCancelledRide);
  const scheduledRides = rides.filter(isScheduledRide);

  const todayCompletedRides = completedRides.filter((ride) => isWithinRange(getRideEventDate(ride), startOfToday, endOfToday));
  const todayCancelledRides = cancelledRides.filter((ride) => isWithinRange(getRideEventDate(ride), startOfToday, endOfToday));
  const todayScheduledRides = scheduledRides.filter((ride) => isWithinRange(getRideEventDate(ride), startOfToday, endOfToday));

  const sumFare = (items) =>
    items.reduce((total, ride) => total + Number(ride?.fare || 0), 0);
  const sumCommission = (items) =>
    items.reduce((total, ride) => {
      const fare = Number(ride?.fare || 0);
      const explicitCommission = Number(ride?.commissionAmount);
      const fallbackCommission = Math.max(fare - Number(ride?.driverEarnings || 0), 0);
      return total + (Number.isFinite(explicitCommission) ? explicitCommission : fallbackCommission);
    }, 0);
  const sumDriverEarnings = (items) =>
    items.reduce((total, ride) => {
      const fare = Number(ride?.fare || 0);
      const commission = Number(ride?.commissionAmount || 0);
      const earning = Number.isFinite(Number(ride?.driverEarnings))
        ? Number(ride?.driverEarnings)
        : Math.max(fare - commission, 0);
      return total + earning;
    }, 0);

  const totalOverallFare = sumFare(completedRides);
  const totalTodayFare = sumFare(todayCompletedRides);
  const totalOverallCommission = sumCommission(completedRides);
  const totalTodayCommission = sumCommission(todayCompletedRides);
  const totalOverallDriverEarnings = sumDriverEarnings(completedRides);
  const totalTodayDriverEarnings = sumDriverEarnings(todayCompletedRides);

  const overallByCash = sumFare(completedRides.filter((ride) => String(ride?.paymentMethod || 'cash').toLowerCase() === 'cash'));
  const overallByCard = sumFare(completedRides.filter((ride) => String(ride?.paymentMethod || '').toLowerCase() === 'online'));
  const todayByCash = sumFare(todayCompletedRides.filter((ride) => String(ride?.paymentMethod || 'cash').toLowerCase() === 'cash'));
  const todayByCard = sumFare(todayCompletedRides.filter((ride) => String(ride?.paymentMethod || '').toLowerCase() === 'online'));

  const buildRecentMonthKeys = (monthCount = 4) => {
    const months = [];
    for (let index = monthCount - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: date.toLocaleString('en-IN', { month: 'short' }),
      });
    }
    return months;
  };

  const recentMonths = buildRecentMonthKeys(4);
  const recentMonthMap = new Map(
    recentMonths.map((month) => [
      month.key,
      {
        ...month,
        amount: 0,
        total: 0,
        byUser: 0,
        byDriver: 0,
        noDriver: 0,
      },
    ]),
  );

  completedRides.forEach((ride) => {
    const eventDate = getRideEventDate(ride);
    if (!eventDate) return;
    const date = new Date(eventDate);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const month = recentMonthMap.get(key);
    if (!month) return;
    month.amount += Number(ride?.fare || 0);
  });

  cancelledRides.forEach((ride) => {
    const eventDate = getRideEventDate(ride);
    if (!eventDate) return;
    const date = new Date(eventDate);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const month = recentMonthMap.get(key);
    if (!month) return;
    month.total += 1;
    if (!ride?.driverId) {
      month.noDriver += 1;
    } else {
      month.byUser += 1;
    }
  });

  const overallChart = recentMonths.map((month) => {
    const entry = recentMonthMap.get(month.key);
    return {
      label: month.label,
      amount: Number((entry?.amount || 0).toFixed(2)),
    };
  });

  const cancelChartSeries = recentMonths.map((month) => {
    const entry = recentMonthMap.get(month.key);
    return {
      label: month.label,
      total: entry?.total || 0,
      byUser: entry?.byUser || 0,
      byDriver: entry?.byDriver || 0,
      noDriver: entry?.noDriver || 0,
    };
  });

  const supportTicketCounts = supportTicketStats.reduce(
    (acc, item) => {
      const key = String(item?._id || '').toLowerCase();
      acc[key] = Number(item?.count || 0);
      return acc;
    },
    { pending: 0, assigned: 0, closed: 0 },
  );

  const snapshot = {
    totalUsers,
    totalDrivers: {
      total: totalDrivers,
      approved: approvedDrivers,
      declined: totalDrivers - approvedDrivers
    },
    totalOwners,
    total_earnings: Number(totalOverallFare.toFixed(2)),
    payment_success_rate: 99.4,
    notifiedSos: {
      total: supportTicketCounts.pending + supportTicketCounts.assigned,
      pending: supportTicketCounts.pending,
      assigned: supportTicketCounts.assigned,
      closed: supportTicketCounts.closed,
    },
    todayTrips: {
      total: todayCompletedRides.length + todayCancelledRides.length + todayScheduledRides.length,
      completed: todayCompletedRides.length,
      cancelled: todayCancelledRides.length,
      scheduled: todayScheduledRides.length,
    },
    overallTrips: {
      total: rides.length,
      completed: completedRides.length,
      cancelled: cancelledRides.length,
      scheduled: scheduledRides.length,
    },
    todayEarnings: {
      total: Number(totalTodayFare.toFixed(2)),
      by_cash: Number(todayByCash.toFixed(2)),
      by_wallet: 0,
      by_card: Number(todayByCard.toFixed(2)),
      admin_commission: Number(totalTodayCommission.toFixed(2)),
      driver_earnings: Number(totalTodayDriverEarnings.toFixed(2)),
    },
    overallEarnings: {
      total: Number(totalOverallFare.toFixed(2)),
      by_cash: Number(overallByCash.toFixed(2)),
      by_wallet: 0,
      by_card: Number(overallByCard.toFixed(2)),
      admin_commission: Number(totalOverallCommission.toFixed(2)),
      driver_earnings: Number(totalOverallDriverEarnings.toFixed(2)),
      chart: overallChart,
    },
    cancelChart: {
      total: cancelledRides.length,
      byUser: cancelledRides.filter((ride) => ride?.driverId).length,
      byDriver: 0,
      noDriver: cancelledRides.filter((ride) => !ride?.driverId).length,
      chart: cancelChartSeries,
    },
    performance_index: rides.length
      ? Number((((completedRides.length || 0) / rides.length) * 100).toFixed(1))
      : 0,
  };

  dashboardCache = {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    value: snapshot,
  };

  return snapshot;
};

export const getOverallEarnings = async () => (await getDashboardData()).overallEarnings;
export const getTodayEarnings = async () => (await getDashboardData()).todayEarnings;
export const getCancelChart = async () => (await getDashboardData()).cancelChart;

export const listWithdrawals = async () => WithdrawalRequest.find().populate('driver_id owner_id').sort({ createdAt: -1 }).lean();

export const listZones = async (currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'zones.view', 'zones');
  }
  const query = currentAdmin ? buildServiceLocationScopeQuery(currentAdmin) : {};
  const zones = await Zone.find(query)
    .populate('service_location_id', 'name service_location_name country timezone')
    .sort({ createdAt: -1 })
    .lean();

  return zones.map(serializeZone);
};

export const listServiceStores = async (currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }
  const query = currentAdmin ? buildServiceLocationScopeQuery(currentAdmin) : {};
  const stores = await ServiceStore.find(query)
    .populate({
      path: 'zone_id',
      select: 'name service_location_id',
    })
    .populate('service_location_id', 'name service_location_name country')
    .sort({ createdAt: -1 })
    .lean();

  const storeIds = stores.map((store) => store._id).filter(Boolean);
  const staffItems = storeIds.length
    ? await ServiceCenterStaff.find({ serviceCenterId: { $in: storeIds } })
      .sort({ createdAt: -1 })
      .lean()
    : [];

  const staffByStoreId = new Map();
  staffItems.forEach((member) => {
    const storeId = String(member.serviceCenterId || '');
    if (!staffByStoreId.has(storeId)) {
      staffByStoreId.set(storeId, []);
    }
    staffByStoreId.get(storeId).push(member);
  });

  return stores.map((store) =>
    serializeServiceStore({
      ...store,
      staff: staffByStoreId.get(String(store._id)) || [],
    }),
  );
};

export const createServiceStore = async (payload, currentAdmin = null) => {
  const name = String(payload.name || '').trim();
  if (!name) {
    throw new ApiError(400, 'Service store name is required');
  }

  if (!payload.zone_id || !mongoose.isValidObjectId(payload.zone_id)) {
    throw new ApiError(400, 'A valid zone is required');
  }

  const zone = await Zone.findById(payload.zone_id).select('_id service_location_id').lean();
  if (!zone) {
    throw new ApiError(404, 'Zone not found');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
    await assertZoneAccess(currentAdmin, zone._id);
  }

  const point = normalizePointLocationPayload(payload);
  const status = payload.status || 'active';

  const store = await ServiceStore.create({
    name,
    zone_id: zone._id,
    service_location_id: zone.service_location_id || null,
    address: String(payload.address || '').trim(),
    owner_name: String(payload.owner_name || '').trim(),
    owner_phone: String(payload.owner_phone || '').trim(),
    rentalCommission: normalizeServiceStoreRentalCommission(payload.rentalCommission),
    ...point,
    status,
    active: status === 'active',
    approve: payload.approve !== false,
    rejectionReason: String(payload.rejectionReason || '').trim(),
    signupSource: payload.signupSource === 'self_signup' ? 'self_signup' : 'admin',
    onboarding: payload.onboarding || null,
  });

  const populatedStore = await ServiceStore.findById(store._id)
    .populate({
      path: 'zone_id',
      select: 'name service_location_id',
    })
    .populate('service_location_id', 'name service_location_name country')
    .lean();

  return serializeServiceStore({
    ...populatedStore,
    staff: [],
  });
};

export const updateServiceStore = async (id, payload, currentAdmin = null) => {
  const store = await ServiceStore.findById(id);
  if (!store) {
    throw new ApiError(404, 'Service store not found');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
    assertServiceLocationAccess(currentAdmin, store.service_location_id);
  }

  if (payload.name !== undefined) {
    const name = String(payload.name || '').trim();
    if (!name) {
      throw new ApiError(400, 'Service store name is required');
    }
    store.name = name;
  }

  if (payload.zone_id !== undefined) {
    if (!payload.zone_id || !mongoose.isValidObjectId(payload.zone_id)) {
      throw new ApiError(400, 'A valid zone is required');
    }

    const zone = await Zone.findById(payload.zone_id).select('_id service_location_id').lean();
    if (!zone) {
      throw new ApiError(404, 'Zone not found');
    }
    if (currentAdmin) {
      await assertZoneAccess(currentAdmin, zone._id);
    }

    store.zone_id = zone._id;
    store.service_location_id = zone.service_location_id || null;
  }

  if (payload.address !== undefined) {
    store.address = String(payload.address || '').trim();
  }

  if (payload.owner_name !== undefined) {
    store.owner_name = String(payload.owner_name || '').trim();
  }

  if (payload.owner_phone !== undefined) {
    store.owner_phone = String(payload.owner_phone || '').trim();
  }

  if (payload.rentalCommission !== undefined) {
    store.rentalCommission = normalizeServiceStoreRentalCommission(
      payload.rentalCommission,
      store.rentalCommission,
    );
  }

  if (payload.latitude !== undefined || payload.longitude !== undefined) {
    Object.assign(store, normalizePointLocationPayload(payload, store.toObject()));
  }

  if (payload.status !== undefined) {
    store.status = payload.status || 'active';
    store.active = store.status === 'active';
  }

  if (payload.approve !== undefined) {
    store.approve = payload.approve !== false;
    if (store.approve) {
      store.rejectionReason = '';
    }
  }

  if (payload.rejectionReason !== undefined) {
    store.rejectionReason = String(payload.rejectionReason || '').trim();
  }

  await store.save();

  const populatedStore = await ServiceStore.findById(store._id)
    .populate({
      path: 'zone_id',
      select: 'name service_location_id',
    })
    .populate('service_location_id', 'name service_location_name country')
    .lean();

  const staff = await ServiceCenterStaff.find({ serviceCenterId: store._id })
    .sort({ createdAt: -1 })
    .lean();

  return serializeServiceStore({
    ...populatedStore,
    staff,
  });
};

export const createServiceStoreStaff = async (storeId, payload, currentAdmin = null) => {
  const store = await ServiceStore.findById(storeId).select('_id service_location_id').lean();
  if (!store) {
    throw new ApiError(404, 'Service store not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
    assertServiceLocationAccess(currentAdmin, store.service_location_id);
  }

  const name = String(payload?.name || '').trim();
  const phone = String(payload?.phone || '').replace(/\D/g, '').slice(-10);

  if (!name) {
    throw new ApiError(400, 'Staff name is required');
  }

  if (!/^\d{10}$/.test(phone)) {
    throw new ApiError(400, 'Staff login number must be a valid 10-digit number');
  }

  const existing = await ServiceCenterStaff.findOne({ phone }).lean();
  if (existing) {
    throw new ApiError(409, 'A staff account already exists with this number');
  }

  const created = await ServiceCenterStaff.create({
    serviceCenterId: store._id,
    name,
    phone,
    active: true,
    status: 'active',
    approve: payload?.approve !== false,
    rejectionReason: String(payload?.rejectionReason || '').trim(),
    signupSource: payload?.signupSource === 'self_signup' ? 'self_signup' : 'admin',
    onboarding: payload?.onboarding || null,
  });

  return {
    _id: created._id,
    id: created._id,
    name: created.name || '',
    phone: created.phone || '',
    active: created.active !== false,
    approve: created.approve !== false,
    status: created.status || (created.active === false ? 'inactive' : 'active'),
    createdAt: created.createdAt || null,
    updatedAt: created.updatedAt || null,
  };
};

export const listPendingServiceStoreSignups = async (currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  const stores = await ServiceStore.find({
    signupSource: 'self_signup',
    approve: false,
  })
    .populate('service_location_id', 'name service_location_name country')
    .sort({ createdAt: -1 })
    .lean();

  return stores.map((item) => serializeServiceStore({ ...item, staff: [] }));
};

export const approveServiceStoreSignup = async (id, currentAdmin = null) => {
  const store = await ServiceStore.findById(id);
  if (!store) {
    throw new ApiError(404, 'Service center request not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  store.approve = true;
  store.rejectionReason = '';
  store.active = store.status !== 'inactive';
  await store.save();

  const populated = await ServiceStore.findById(store._id)
    .populate('service_location_id', 'name service_location_name country')
    .lean();

  return serializeServiceStore({ ...populated, staff: [] });
};

export const rejectServiceStoreSignup = async (id, payload = {}, currentAdmin = null) => {
  const store = await ServiceStore.findById(id);
  if (!store) {
    throw new ApiError(404, 'Service center request not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  store.approve = false;
  store.rejectionReason = String(payload?.rejectionReason || payload?.reason || 'Rejected by admin').trim();
  await store.save();

  const populated = await ServiceStore.findById(store._id)
    .populate('service_location_id', 'name service_location_name country')
    .lean();

  return serializeServiceStore({ ...populated, staff: [] });
};

export const listPendingServiceCenterStaffSignups = async (currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  const staff = await ServiceCenterStaff.find({
    signupSource: 'self_signup',
    approve: false,
  })
    .populate('serviceCenterId', 'name address owner_phone')
    .sort({ createdAt: -1 })
    .lean();

  return staff.map((item) => ({
    _id: item._id,
    id: item._id,
    name: item.name || '',
    phone: item.phone || '',
    approve: item.approve !== false,
    status: item.approve === false ? 'pending' : item.status,
    rejectionReason: item.rejectionReason || '',
    signupSource: item.signupSource || 'admin',
    serviceCenterId: item.serviceCenterId?._id || item.serviceCenterId || null,
    serviceCenterName: item.serviceCenterId?.name || item.onboarding?.roleDetails?.serviceCenterName || '',
    serviceCenterAddress: item.serviceCenterId?.address || item.onboarding?.roleDetails?.serviceCenterAddress || '',
    onboarding: item.onboarding || null,
    createdAt: item.createdAt || null,
  }));
};

export const approveServiceCenterStaffSignup = async (id, currentAdmin = null) => {
  const staff = await ServiceCenterStaff.findById(id);
  if (!staff) {
    throw new ApiError(404, 'Service staff request not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  staff.approve = true;
  staff.rejectionReason = '';
  staff.active = true;
  if (!staff.status) {
    staff.status = 'active';
  }
  await staff.save();

  return {
    _id: staff._id,
    id: staff._id,
    name: staff.name || '',
    phone: staff.phone || '',
    approve: staff.approve,
    status: staff.status,
  };
};

export const rejectServiceCenterStaffSignup = async (id, payload = {}, currentAdmin = null) => {
  const staff = await ServiceCenterStaff.findById(id);
  if (!staff) {
    throw new ApiError(404, 'Service staff request not found');
  }

  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
  }

  staff.approve = false;
  staff.rejectionReason = String(payload?.rejectionReason || payload?.reason || 'Rejected by admin').trim();
  await staff.save();

  return {
    _id: staff._id,
    id: staff._id,
    name: staff.name || '',
    phone: staff.phone || '',
    approve: staff.approve,
    status: staff.approve === false ? 'pending' : staff.status,
    rejectionReason: staff.rejectionReason || '',
  };
};

export const deleteServiceStore = async (id, currentAdmin = null) => {
  if (currentAdmin) {
    const existingStore = await ServiceStore.findById(id).select('service_location_id').lean();
    if (!existingStore) {
      throw new ApiError(404, 'Service store not found');
    }
    assertAdminPermission(currentAdmin, 'service_stores.view', 'service stores');
    assertServiceLocationAccess(currentAdmin, existingStore.service_location_id);
  }
  const deleted = await ServiceStore.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Service store not found');
  }

  return true;
};

export const createZone = async (payload, currentAdmin = null) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Zone name is required');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'zones.view', 'zones');
    assertServiceLocationAccess(currentAdmin, payload.service_location_id);
  }

  const normalizedGeometry = normalizeZoneGeometryPayload(payload);

  const zone = await Zone.create({
    name: String(payload.name).trim(),
    service_location_id: payload.service_location_id ? toObjectId(payload.service_location_id) : null,
    unit: payload.unit || 'km',
    peak_zone_ride_count: toNullableNumber(payload.peak_zone_ride_count),
    peak_zone_radius: toNullableNumber(payload.peak_zone_radius),
    peak_zone_selection_duration: toNullableNumber(payload.peak_zone_selection_duration),
    peak_zone_duration: toNullableNumber(payload.peak_zone_duration),
    peak_zone_surge_percentage: toNullableNumber(payload.peak_zone_surge_percentage),
    maximum_distance_for_regular_rides: toNullableNumber(payload.maximum_distance_for_regular_rides),
    maximum_distance_for_outstation_rides: toNullableNumber(payload.maximum_distance_for_outstation_rides),
    active: payload.status ? payload.status === 'active' : true,
    status: payload.status || 'active',
    boundary_mode: normalizedGeometry.boundary_mode,
    circle_center: normalizedGeometry.circle_center,
    circle_radius_meters: normalizedGeometry.circle_radius_meters,
    geometry: normalizedGeometry.geometry,
  });

  const populatedZone = await Zone.findById(zone._id)
    .populate('service_location_id', 'name service_location_name country timezone')
    .lean();

  return serializeZone(populatedZone);
};

export const updateZone = async (id, payload, currentAdmin = null) => {
  const zone = await Zone.findById(id);
  if (!zone) throw new ApiError(404, 'Zone not found');
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'zones.view', 'zones');
    await assertZoneAccess(currentAdmin, zone._id);
  }

  if (payload.name !== undefined) {
    zone.name = String(payload.name).trim();
  }
  if (payload.service_location_id !== undefined) {
    if (currentAdmin && payload.service_location_id) {
      assertServiceLocationAccess(currentAdmin, payload.service_location_id);
    }
    zone.service_location_id = payload.service_location_id ? toObjectId(payload.service_location_id) : null;
  }
  if (payload.unit !== undefined) {
    zone.unit = payload.unit || 'km';
  }
  if (payload.peak_zone_ride_count !== undefined) {
    zone.peak_zone_ride_count = toNullableNumber(payload.peak_zone_ride_count);
  }
  if (payload.peak_zone_radius !== undefined) {
    zone.peak_zone_radius = toNullableNumber(payload.peak_zone_radius);
  }
  if (payload.peak_zone_selection_duration !== undefined) {
    zone.peak_zone_selection_duration = toNullableNumber(payload.peak_zone_selection_duration);
  }
  if (payload.peak_zone_duration !== undefined) {
    zone.peak_zone_duration = toNullableNumber(payload.peak_zone_duration);
  }
  if (payload.peak_zone_surge_percentage !== undefined) {
    zone.peak_zone_surge_percentage = toNullableNumber(payload.peak_zone_surge_percentage);
  }
  if (payload.maximum_distance_for_regular_rides !== undefined) {
    zone.maximum_distance_for_regular_rides = toNullableNumber(payload.maximum_distance_for_regular_rides);
  }
  if (payload.maximum_distance_for_outstation_rides !== undefined) {
    zone.maximum_distance_for_outstation_rides = toNullableNumber(payload.maximum_distance_for_outstation_rides);
  }
  if (payload.status !== undefined) {
    zone.status = payload.status || 'active';
    zone.active = zone.status === 'active';
  }
  if (
    payload.coordinates !== undefined ||
    payload.boundary_mode !== undefined ||
    payload.circle_center !== undefined ||
    payload.circle_radius_meters !== undefined
  ) {
    const normalizedGeometry = normalizeZoneGeometryPayload(payload, zone);
    zone.boundary_mode = normalizedGeometry.boundary_mode;
    zone.circle_center = normalizedGeometry.circle_center;
    zone.circle_radius_meters = normalizedGeometry.circle_radius_meters;
    zone.geometry = normalizedGeometry.geometry;
  }

  await zone.save();

  const populatedZone = await Zone.findById(zone._id)
    .populate('service_location_id', 'name service_location_name country timezone')
    .lean();

  return serializeZone(populatedZone);
};

export const deleteZone = async (id, currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'zones.view', 'zones');
    await assertZoneAccess(currentAdmin, id);
  }
  const deleted = await Zone.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Zone not found');
  return true;
};

export const toggleZoneStatus = async (id, currentAdmin = null) => {
  const zone = await Zone.findById(id);
  if (!zone) throw new ApiError(404, 'Zone not found');
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'zones.view', 'zones');
    await assertZoneAccess(currentAdmin, zone._id);
  }
  zone.active = !zone.active;
  zone.status = zone.active ? 'active' : 'inactive';
  await zone.save();

  const populatedZone = await Zone.findById(zone._id)
    .populate('service_location_id', 'name service_location_name country timezone')
    .lean();

  return serializeZone(populatedZone);
};


export const listAirports = async (currentAdmin = null) => {
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'airports.view', 'airports');
  }
  const query = currentAdmin ? buildServiceLocationScopeQuery(currentAdmin) : {};
  const items = await Airport.find(query)
    .populate('service_location_id', 'name service_location_name country')
    .populate('zone_id', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return items.map(serializeAirport);
};

export const createAirport = async (payload, currentAdmin = null) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Airport name is required');
  }

  if (!payload.service_location_id) {
    throw new ApiError(400, 'Service location is required');
  }
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'airports.view', 'airports');
    assertServiceLocationAccess(currentAdmin, payload.service_location_id);
    if (payload.zone_id) {
      await assertZoneAccess(currentAdmin, payload.zone_id);
    }
  }

  const latitude = toNullableNumber(payload.latitude);
  const longitude = toNullableNumber(payload.longitude);
  const status = payload.status || (normalizeBoolean(payload.active ?? true) ? 'active' : 'inactive');

  const item = await Airport.create({
    name: String(payload.name).trim(),
    code: String(payload.code || '').trim().toUpperCase(),
    service_location_id: toObjectId(payload.service_location_id),
    zone_id: payload.zone_id ? toObjectId(payload.zone_id) : null,
    terminal: String(payload.terminal || '').trim(),
    address: String(payload.address || '').trim(),
    contact_number: String(payload.contact_number || '').trim(),
    latitude,
    longitude,
    location:
      latitude !== null && longitude !== null
        ? {
          type: 'Point',
          coordinates: [longitude, latitude],
        }
        : undefined,
    boundary:
      Array.isArray(payload.boundary_coordinates) && payload.boundary_coordinates.length >= 3
        ? {
          type: 'Polygon',
          coordinates: [normalizeAirportBoundary(payload.boundary_coordinates)],
        }
        : undefined,
    airport_surge: Math.max(0, Number(payload.airport_surge ?? 0) || 0),
    support_airport_fee: Math.max(0, Number(payload.support_airport_fee ?? 0) || 0),
    status,
    active: status === 'active',
    pickup_availability: payload.pickup_availability !== false,
    drop_availability: payload.drop_availability !== false,
  });

  const populatedItem = await Airport.findById(item._id)
    .populate('service_location_id', 'name service_location_name country')
    .populate('zone_id', 'name')
    .lean();

  return serializeAirport(populatedItem);
};

export const updateAirport = async (id, payload, currentAdmin = null) => {
  const item = await Airport.findById(id);
  if (!item) throw new ApiError(404, 'Airport not found');
  if (currentAdmin) {
    assertAdminPermission(currentAdmin, 'airports.view', 'airports');
    assertServiceLocationAccess(currentAdmin, item.service_location_id);
  }

  if (payload.name !== undefined) {
    item.name = String(payload.name || '').trim();
  }
  if (payload.code !== undefined) {
    item.code = String(payload.code || '').trim().toUpperCase();
  }
  if (payload.service_location_id !== undefined) {
    if (currentAdmin && payload.service_location_id) {
      assertServiceLocationAccess(currentAdmin, payload.service_location_id);
    }
    item.service_location_id = payload.service_location_id ? toObjectId(payload.service_location_id) : null;
  }
  if (payload.zone_id !== undefined) {
    if (currentAdmin && payload.zone_id) {
      await assertZoneAccess(currentAdmin, payload.zone_id);
    }
    item.zone_id = payload.zone_id ? toObjectId(payload.zone_id) : null;
  }
  if (payload.terminal !== undefined) {
    item.terminal = String(payload.terminal || '').trim();
  }
  if (payload.address !== undefined) {
    item.address = String(payload.address || '').trim();
  }
  if (payload.contact_number !== undefined) {
    item.contact_number = String(payload.contact_number || '').trim();
  }
  if (payload.latitude !== undefined) {
    item.latitude = toNullableNumber(payload.latitude);
  }
  if (payload.longitude !== undefined) {
    item.longitude = toNullableNumber(payload.longitude);
  }
  if (payload.status !== undefined || payload.active !== undefined) {
    item.status = payload.status || (normalizeBoolean(payload.active) ? 'active' : 'inactive');
    item.active = item.status === 'active';
  }
  if (payload.boundary_coordinates !== undefined) {
    item.boundary =
      Array.isArray(payload.boundary_coordinates) && payload.boundary_coordinates.length >= 3
        ? {
          type: 'Polygon',
          coordinates: [normalizeAirportBoundary(payload.boundary_coordinates)],
        }
        : undefined;
  }
  if (payload.airport_surge !== undefined) {
    item.airport_surge = Math.max(0, Number(payload.airport_surge ?? 0) || 0);
  }
  if (payload.support_airport_fee !== undefined) {
    item.support_airport_fee = Math.max(0, Number(payload.support_airport_fee ?? 0) || 0);
  }
  if (payload.pickup_availability !== undefined) {
    item.pickup_availability = payload.pickup_availability === true || payload.pickup_availability === 'true';
  }
  if (payload.drop_availability !== undefined) {
    item.drop_availability = payload.drop_availability === true || payload.drop_availability === 'true';
  }

  item.location =
    item.latitude !== null && item.longitude !== null
      ? {
        type: 'Point',
        coordinates: [item.longitude, item.latitude],
      }
      : undefined;

  await item.save();

  const populatedItem = await Airport.findById(item._id)
    .populate('service_location_id', 'name service_location_name country')
    .populate('zone_id', 'name')
    .lean();

  return serializeAirport(populatedItem);
};

export const deleteAirport = async (id, currentAdmin = null) => {
  if (currentAdmin) {
    const existingAirport = await Airport.findById(id).select('service_location_id').lean();
    if (!existingAirport) throw new ApiError(404, 'Airport not found');
    assertAdminPermission(currentAdmin, 'airports.view', 'airports');
    assertServiceLocationAccess(currentAdmin, existingAirport.service_location_id);
  }
  const item = await Airport.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Airport not found');
  return true;
};

export const listBusServices = async (options = {}) => {
  const filter = {};
  const scopedOwnerId = toObjectId(options.ownerId);

  if (scopedOwnerId) {
    filter.ownerId = scopedOwnerId;
  }

  const items = await BusService.find(filter).sort({ createdAt: -1 }).lean();
  return items.map((item) => serializeBusService(item));
};

export const createBusService = async (payload = {}, options = {}) => {
  const normalizedPayload = normalizeBusServicePayload(payload);
  const ownerId = toObjectId(options.ownerId) || toObjectId(payload.ownerId) || null;

  if (!normalizedPayload.operatorName) {
    throw new ApiError(400, 'Operator name is required');
  }

  if (!normalizedPayload.busName) {
    throw new ApiError(400, 'Bus name is required');
  }

  if (!normalizedPayload.route.originCity) {
    throw new ApiError(400, 'Origin city is required');
  }

  if (!normalizedPayload.route.destinationCity) {
    throw new ApiError(400, 'Destination city is required');
  }

  const item = await BusService.create({
    ...normalizedPayload,
    ownerId,
  });
  await syncBusDriverForBusService(item, normalizedPayload);
  await item.save();
  return serializeBusService(item.toObject());
};

export const updateBusService = async (id, payload = {}, options = {}) => {
  const scopedOwnerId = toObjectId(options.ownerId);
  const existingItem = scopedOwnerId
    ? await BusService.findOne({ _id: id, ownerId: scopedOwnerId })
    : await BusService.findById(id);

  if (!existingItem) {
    throw new ApiError(404, 'Bus service not found');
  }

  const normalizedPayload = normalizeBusServicePayload(payload, existingItem.toObject());

  if (!normalizedPayload.operatorName) {
    throw new ApiError(400, 'Operator name is required');
  }

  if (!normalizedPayload.busName) {
    throw new ApiError(400, 'Bus name is required');
  }

  if (!normalizedPayload.route.originCity) {
    throw new ApiError(400, 'Origin city is required');
  }

  if (!normalizedPayload.route.destinationCity) {
    throw new ApiError(400, 'Destination city is required');
  }

  Object.assign(existingItem, normalizedPayload);
  if (scopedOwnerId) {
    existingItem.ownerId = scopedOwnerId;
  }
  await syncBusDriverForBusService(existingItem, normalizedPayload);
  await existingItem.save();

  return serializeBusService(existingItem.toObject());
};

export const deleteBusService = async (id, options = {}) => {
  const scopedOwnerId = toObjectId(options.ownerId);
  const item = scopedOwnerId
    ? await BusService.findOneAndDelete({ _id: id, ownerId: scopedOwnerId })
    : await BusService.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Bus service not found');
  if (item.busDriverId) {
    await BusDriver.findByIdAndDelete(item.busDriverId);
  }
  return true;
};

export const listPendingBusDriverSignups = async () => {
  const items = await BusDriver.find({
    signupSource: 'self_signup',
    approve: false,
  })
    .sort({ createdAt: -1 })
    .lean();

  return items.map((item) => ({
    _id: item._id,
    id: item._id,
    name: item.name || '',
    phone: item.phone || '',
    email: item.email || '',
    approve: item.approve !== false,
    status: item.status || 'pending',
    rejectionReason: item.rejectionReason || '',
    operatorName: item.operatorName || '',
    busName: item.busName || '',
    serviceNumber: item.serviceNumber || '',
    routeName: item.routeName || '',
    originCity: item.originCity || '',
    destinationCity: item.destinationCity || '',
    assignedBusServiceId: item.assignedBusServiceId || null,
    onboarding: item.onboarding || null,
    createdAt: item.createdAt || null,
  }));
};

export const approveBusDriverSignup = async (id) => {
  const item = await BusDriver.findById(id);
  if (!item) {
    throw new ApiError(404, 'Bus driver request not found');
  }

  item.approve = true;
  item.status = 'approved';
  item.active = true;
  item.rejectionReason = '';
  await item.save();

  return {
    _id: item._id,
    id: item._id,
    name: item.name || '',
    phone: item.phone || '',
    approve: item.approve,
    status: item.status,
  };
};

export const rejectBusDriverSignup = async (id, payload = {}) => {
  const item = await BusDriver.findById(id);
  if (!item) {
    throw new ApiError(404, 'Bus driver request not found');
  }

  item.approve = false;
  item.status = 'pending';
  item.rejectionReason = String(payload?.rejectionReason || payload?.reason || 'Rejected by admin').trim();
  await item.save();

  return {
    _id: item._id,
    id: item._id,
    name: item.name || '',
    phone: item.phone || '',
    approve: item.approve,
    status: item.status,
    rejectionReason: item.rejectionReason || '',
  };
};

export const listRentalVehicleTypes = async () => {
  await RentalVehicleType.updateMany(
    { poolingEnabled: { $exists: false } },
    { $set: { poolingEnabled: false } },
  );

  const items = await RentalVehicleType.find().sort({ createdAt: -1 }).lean();
  return items.map((item) => serializeRentalVehicleType(item));
};

export const createRentalVehicleType = async (payload = {}) => {
  const normalizedPayload = normalizeRentalVehiclePayload(payload);

  if (!normalizedPayload.name) {
    throw new ApiError(400, 'Rental vehicle name is required');
  }

  const item = await RentalVehicleType.create({
    ...normalizedPayload,
    serviceStoreIds: normalizedPayload.serviceStoreIds.map((value) => toObjectId(value)),
    active: normalizedPayload.status === 'active',
  });

  return serializeRentalVehicleType(item.toObject());
};

export const updateRentalVehicleType = async (id, payload = {}) => {
  const existingItem = await RentalVehicleType.findById(id);

  if (!existingItem) {
    throw new ApiError(404, 'Rental vehicle type not found');
  }

  const normalizedPayload = normalizeRentalVehiclePayload(payload, existingItem.toObject());

  if (!normalizedPayload.name) {
    throw new ApiError(400, 'Rental vehicle name is required');
  }

  Object.assign(existingItem, {
    ...normalizedPayload,
    serviceStoreIds: normalizedPayload.serviceStoreIds.map((value) => toObjectId(value)),
    active: normalizedPayload.status === 'active',
  });
  await existingItem.save();

  return serializeRentalVehicleType(existingItem.toObject());
};

export const deleteRentalVehicleType = async (id) => {
  const item = await RentalVehicleType.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Rental vehicle type not found');
  return true;
};

export const listPoolingRoutes = async () => {
  const items = await PoolingRoute.find().sort({ createdAt: -1 }).lean();
  const vehicleIds = [
    ...new Set(
      items
        .flatMap((item) => (Array.isArray(item.assignedVehicleTypeIds) ? item.assignedVehicleTypeIds : []))
        .map((value) => String(value || ''))
        .filter(Boolean),
    ),
  ];

  const vehicles = vehicleIds.length
    ? await RentalVehicleType.find({ _id: { $in: vehicleIds } }).lean()
    : [];
  const vehicleMap = new Map(vehicles.map((item) => [String(item._id), item]));

  return items.map((item) => serializePoolingRoute(item, vehicleMap));
};

export const createPoolingRoute = async (payload = {}) => {
  const normalizedPayload = normalizePoolingPayload(payload);

  if (!normalizedPayload.routeName) {
    throw new ApiError(400, 'Pooling route name is required');
  }

  if (!normalizedPayload.originLabel) {
    throw new ApiError(400, 'Origin location is required');
  }

  if (!normalizedPayload.destinationLabel) {
    throw new ApiError(400, 'Destination location is required');
  }

  if (normalizedPayload.assignedVehicleTypeIds.length === 0) {
    throw new ApiError(400, 'Please assign at least one pooling-enabled vehicle');
  }

  const item = await PoolingRoute.create({
    ...normalizedPayload,
    assignedVehicleTypeIds: normalizedPayload.assignedVehicleTypeIds.map((value) =>
      toObjectId(value),
    ),
    active: normalizedPayload.status === 'active',
  });

  const vehicles = await RentalVehicleType.find({
    _id: { $in: item.assignedVehicleTypeIds || [] },
  }).lean();
  const vehicleMap = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle]));

  return serializePoolingRoute(item.toObject(), vehicleMap);
};

export const updatePoolingRoute = async (id, payload = {}) => {
  const existingItem = await PoolingRoute.findById(id);

  if (!existingItem) {
    throw new ApiError(404, 'Pooling route not found');
  }

  const normalizedPayload = normalizePoolingPayload(payload, existingItem.toObject());

  if (!normalizedPayload.routeName) {
    throw new ApiError(400, 'Pooling route name is required');
  }

  if (!normalizedPayload.originLabel) {
    throw new ApiError(400, 'Origin location is required');
  }

  if (!normalizedPayload.destinationLabel) {
    throw new ApiError(400, 'Destination location is required');
  }

  if (normalizedPayload.assignedVehicleTypeIds.length === 0) {
    throw new ApiError(400, 'Please assign at least one pooling-enabled vehicle');
  }

  Object.assign(existingItem, {
    ...normalizedPayload,
    assignedVehicleTypeIds: normalizedPayload.assignedVehicleTypeIds.map((value) =>
      toObjectId(value),
    ),
    active: normalizedPayload.status === 'active',
  });
  await existingItem.save();

  const vehicles = await RentalVehicleType.find({
    _id: { $in: existingItem.assignedVehicleTypeIds || [] },
  }).lean();
  const vehicleMap = new Map(vehicles.map((vehicle) => [String(vehicle._id), vehicle]));

  return serializePoolingRoute(existingItem.toObject(), vehicleMap);
};

export const deletePoolingRoute = async (id) => {
  const item = await PoolingRoute.findByIdAndDelete(id);
  if (!item) throw new ApiError(404, 'Pooling route not found');
  return true;
};

export const listRentalQuoteRequests = async () => {
  const items = await RentalQuoteRequest.find()
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image')
    .sort({ createdAt: -1 })
    .lean();

  return items.map((item) => serializeRentalQuoteRequest(item));
};

export const updateRentalQuoteRequest = async (id, payload = {}, adminId = null) => {
  const item = await RentalQuoteRequest.findById(id);
  if (!item) {
    throw new ApiError(404, 'Rental quote request not found');
  }

  if (payload.status !== undefined) {
    if (!['pending', 'reviewing', 'quoted', 'rejected'].includes(String(payload.status))) {
      throw new ApiError(400, 'Invalid rental quote request status');
    }
    item.status = String(payload.status);
  }

  if (payload.adminQuotedAmount !== undefined) {
    item.adminQuotedAmount = Math.max(0, Number(payload.adminQuotedAmount || 0));
  }

  if (payload.adminNote !== undefined) {
    item.adminNote = String(payload.adminNote || '').trim();
  }

  item.reviewedAt = new Date();
  item.reviewedBy = adminId || null;
  await item.save();

  const populated = await RentalQuoteRequest.findById(item._id)
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image')
    .lean();

  return serializeRentalQuoteRequest(populated);
};

export const listRentalBookingRequests = async () => {
  const items = await RentalBookingRequest.find()
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image pricing')
    .sort({ createdAt: -1 })
    .lean();

  return items.map((item) => {
    const rideMetrics = computeRentalRideMetrics(
      item,
      item.completedAt || item.completionRequestedAt || null,
    );

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
  });
};

export const getRentalBookingRequestById = async (id) => {
  const item = await RentalBookingRequest.findById(id)
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image pricing')
    .lean();

  if (!item) {
    throw new ApiError(404, 'Rental booking request not found');
  }

  const rideMetrics = computeRentalRideMetrics(
    item,
    item.completedAt || item.completionRequestedAt || null,
  );

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

export const getRentalTrackingDashboard = async () => {
  const results = await listActiveRentalTrackingBookings();
  const normalizeTrackingValue = (value = '') => String(value || '').trim().toLowerCase();
  const stats = results.reduce(
    (summary, item) => {
      summary.total += 1;

      const trackingStatus = normalizeTrackingValue(item?.rentalTracking?.trackingStatus);
      const zoneStatus = normalizeTrackingValue(item?.rentalTracking?.zoneStatus);
      const alertCount = Array.isArray(item?.rentalTracking?.alerts) ? item.rentalTracking.alerts.length : 0;

      if (trackingStatus === 'active') {
        summary.live += 1;
      }
      if (trackingStatus === 'location_off' || trackingStatus === 'tracking_stopped') {
        summary.locationOff += 1;
      }
      if (zoneStatus === 'outside') {
        summary.outsideZone += 1;
      }
      if (alertCount > 0) {
        summary.alerts += 1;
      }

      return summary;
    },
    {
      total: 0,
      live: 0,
      locationOff: 0,
      outsideZone: 0,
      alerts: 0,
    },
  );

  return {
    results,
    stats,
    refreshedAt: new Date().toISOString(),
  };
};

export const updateRentalBookingRequest = async (id, payload = {}, adminId = null) => {
  const item = await RentalBookingRequest.findById(id);
  if (!item) {
    throw new ApiError(404, 'Rental booking request not found');
  }

  if (payload.status !== undefined) {
    if (!['pending', 'confirmed', 'assigned', 'end_requested', 'completed', 'cancelled'].includes(String(payload.status))) {
      throw new ApiError(400, 'Invalid rental booking request status');
    }
    item.status = String(payload.status);
  }

  if (payload.assignedVehicleId !== undefined) {
    const assignedVehicleId = String(payload.assignedVehicleId || '').trim();

    if (!assignedVehicleId) {
      item.assignedVehicle = {
        vehicleId: null,
        name: '',
        vehicleCategory: '',
        image: '',
      };
      item.assignedAt = null;
    } else {
      const assignedVehicle = await RentalVehicleType.findById(assignedVehicleId)
        .select('name vehicleCategory image')
        .lean();

      if (!assignedVehicle) {
        throw new ApiError(404, 'Assigned rental vehicle not found');
      }

      item.assignedVehicle = {
        vehicleId: assignedVehicle._id,
        name: assignedVehicle.name || '',
        vehicleCategory: assignedVehicle.vehicleCategory || '',
        image: assignedVehicle.image || '',
      };
      item.assignedAt = new Date();
      item.completionRequestedAt = null;
      item.finalCharge = 0;
      item.finalElapsedMinutes = 0;

      if (
        !['end_requested', 'completed', 'cancelled'].includes(String(payload.status || item.status || ''))
      ) {
        item.status = 'assigned';
      }
    }
  }

  if (payload.cancelReason !== undefined) {
    item.cancelReason = String(payload.cancelReason || '').trim();
  }

  if (payload.adminNote !== undefined) {
    item.adminNote = String(payload.adminNote || '').trim();
  }

  if (item.status === 'cancelled') {
    item.cancelledAt = item.cancelledAt || new Date();
  } else if (payload.status !== undefined) {
    item.cancelledAt = null;
    if (payload.cancelReason === undefined) {
      item.cancelReason = item.cancelReason || '';
    }
  }

  if (item.status === 'end_requested') {
    item.completionRequestedAt = item.completionRequestedAt || new Date();
    const metrics = computeRentalRideMetrics(item, item.completionRequestedAt);
    item.finalCharge = Math.max(0, Number(item.finalCharge || metrics.currentCharge || 0));
    item.finalElapsedMinutes = Math.max(
      0,
      Number(item.finalElapsedMinutes || metrics.elapsedMinutes || 0),
    );
    item.completedAt = null;
  } else if (payload.status !== undefined) {
    item.completionRequestedAt = null;
    if (payload.status !== 'completed') {
      item.finalCharge = 0;
      item.finalElapsedMinutes = 0;
    }
  }

  if (item.status === 'completed') {
    item.completedAt = item.completedAt || new Date();
    if (!item.finalCharge || !item.finalElapsedMinutes) {
      const metrics = computeRentalRideMetrics(item, item.completedAt);
      item.finalCharge = Math.max(0, Number(item.finalCharge || metrics.currentCharge || 0));
      item.finalElapsedMinutes = Math.max(
        0,
        Number(item.finalElapsedMinutes || metrics.elapsedMinutes || 0),
      );
    }
  } else if (payload.status !== undefined && payload.status !== 'completed') {
    item.completedAt = null;
  }

  item.reviewedAt = new Date();
  item.reviewedBy = adminId || null;
  await item.save();

  const populated = await RentalBookingRequest.findById(item._id)
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image')
    .lean();

  const rideMetrics = computeRentalRideMetrics(
    populated,
    populated.completedAt || populated.completionRequestedAt || null,
  );

  return {
    ...serializeRentalBookingRequest(populated),
    rideMetrics,
    commissionBreakdown: {
      estimated: computeRentalCommissionBreakdown(populated.commissionSnapshot, Number(populated.totalCost || 0)),
      live: computeRentalCommissionBreakdown(
        populated.commissionSnapshot,
        Number(populated.finalCharge || rideMetrics.currentCharge || populated.totalCost || 0),
      ),
    },
  };
};


export const listGoodsTypes = async () => {
  const items = await GoodsType.find().sort({ createdAt: -1 }).lean();
  const results = items.map(serializeGoodsType);

  return {
    success: true,
    results,
    paginator: {
      current_page: 1,
      data: results,
      first_page_url: "http://localhost:5000/api/v1/admin/goods-types?page=1",
      from: 1,
      last_page: 1,
      last_page_url: "http://localhost:5000/api/v1/admin/goods-types?page=1",
      links: [
        { url: null, label: "&laquo; Previous", active: false },
        { url: "http://localhost:5000/api/v1/admin/goods-types?page=1", label: "1", active: true },
        { url: null, label: "Next &raquo;", active: false }
      ],
      next_page_url: null,
      path: "http://localhost:5000/api/v1/admin/goods-types",
      per_page: 50,
      prev_page_url: null,
      to: results.length,
      total: results.length
    }
  };
};

export const createGoodsType = async (payload) => {
  const name = payload.goods_type_name || payload.name || '';
  if (!name.trim()) {
    throw new ApiError(400, 'Goods type name is required');
  }

  const active = payload.active !== undefined ?
    (typeof payload.active === 'boolean' ? (payload.active ? 1 : 0) : Number(payload.active)) :
    1;

  const item = await GoodsType.create({
    goods_type_name: name.trim(),
    name: name.trim(),
    goods_types_for: payload.goods_types_for || payload.goods_type_for || 'both',
    status: payload.status || (active === 1 ? 'active' : 'inactive'),
    active: active,
    translation_dataset: payload.translation_dataset || '',
  });

  return serializeGoodsType(item.toObject());
};

export const updateGoodsType = async (id, payload) => {
  const item = await GoodsType.findById(id);
  if (!item) throw new ApiError(404, 'Goods type not found');

  const name = payload.goods_type_name || payload.name;
  if (name !== undefined) {
    item.goods_type_name = name.trim();
    item.name = name.trim();
  }

  if (payload.goods_types_for !== undefined || payload.goods_type_for !== undefined) {
    item.goods_types_for = payload.goods_types_for || payload.goods_type_for || 'both';
  }

  if (payload.active !== undefined) {
    item.active = typeof payload.active === 'boolean' ? (payload.active ? 1 : 0) : Number(payload.active);
  }

  if (payload.status !== undefined) {
    item.status = payload.status;
  } else if (payload.active !== undefined) {
    item.status = item.active === 1 ? 'active' : 'inactive';
  }

  if (payload.translation_dataset !== undefined) {
    item.translation_dataset = payload.translation_dataset;
  }

  await item.save();
  return serializeGoodsType(item.toObject());
};

export const deleteGoodsType = async (id) => {
  const deleted = await GoodsType.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Goods type not found');
  return true;
};

export const listRentalPackageTypes = async () => {
  const items = await RentalPackageType.find().sort({ createdAt: -1 }).lean();
  const results = items.map(serializeRentalPackageType);

  return {
    results,
    paginator: {
      current_page: 1,
      data: results,
      total: results.length,
      last_page: 1,
      per_page: 50,
      from: 1,
      to: results.length,
      links: [
        { url: null, label: "&laquo; Previous", active: false },
        { url: "http://localhost:5000/api/v1/admin/rental-package-types?page=1", label: "1", active: true },
        { url: null, label: "Next &raquo;", active: false }
      ],
      path: "http://localhost:5000/api/v1/admin/rental-package-types"
    }
  };
};

export const createRentalPackageType = async (payload) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Rental package type name is required');
  }

  if (!payload.transport_type?.trim()) {
    throw new ApiError(400, 'Transport type is required');
  }

  const status = payload.status || (normalizeBoolean(payload.active ?? true) ? 'active' : 'inactive');

  const item = await RentalPackageType.create({
    transport_type: String(payload.transport_type).trim().toLowerCase(),
    name: String(payload.name).trim(),
    short_description: String(payload.short_description || '').trim(),
    description: String(payload.description || '').trim(),
    status,
    active: status === 'active',
  });

  return serializeRentalPackageType(item.toObject());
};

export const updateRentalPackageType = async (id, payload) => {
  const item = await RentalPackageType.findById(id);
  if (!item) throw new ApiError(404, 'Rental package type not found');

  if (payload.transport_type !== undefined) {
    item.transport_type = String(payload.transport_type || 'taxi').trim().toLowerCase();
  }
  if (payload.name !== undefined) {
    item.name = String(payload.name || '').trim();
  }
  if (payload.short_description !== undefined) {
    item.short_description = String(payload.short_description || '').trim();
  }
  if (payload.description !== undefined) {
    item.description = String(payload.description || '').trim();
  }
  if (payload.status !== undefined) {
    item.status = payload.status || 'active';
    item.active = item.status === 'active';
  } else if (payload.active !== undefined) {
    item.active = normalizeBoolean(payload.active);
    item.status = item.active ? 'active' : 'inactive';
  }

  await item.save();
  return serializeRentalPackageType(item.toObject());
};

export const deleteRentalPackageType = async (id) => {
  const deleted = await RentalPackageType.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Rental package type not found');
  return true;
};

const buildDriverNeededDocumentKeys = (payload = {}, existing = null) => {
  const imageType = String(payload.image_type || existing?.image_type || 'front_back').trim();
  const verificationType = normalizeDriverDocumentVerificationType(
    payload.verification_type || existing?.verification_type,
  );
  const preset = getDriverDocumentPresetConfig(verificationType);
  const presetKey = String(preset?.key || '').trim();
  const baseKey = presetKey || toDocumentKey(payload.name || existing?.name || 'document');

  if (imageType === 'front_back') {
    return {
      key: '',
      front_key:
        existing?.front_key ||
        String(payload.front_key || '').trim() ||
        `${baseKey}Front`,
      back_key:
        existing?.back_key ||
        String(payload.back_key || '').trim() ||
        `${baseKey}Back`,
    };
  }

  const suffix = imageType === 'front' ? 'Front' : imageType === 'back' ? 'Back' : '';

  return {
    key:
      existing?.key ||
      String(payload.key || '').trim() ||
      `${baseKey}${suffix}`,
    front_key: '',
    back_key: '',
  };
};

export const listDriverNeededDocuments = async ({ activeOnly = false, includeFields = false, templateType = 'document' } = {}) => {
  await cleanupLegacySeededDriverNeededDocuments();
  await ensureDefaultDriverVehicleFields();

  const normalizedTemplateType = String(templateType || 'document').trim().toLowerCase();
  const query = {
    ...(activeOnly ? { active: true } : {}),
    ...(normalizedTemplateType === 'all'
      ? {}
      : normalizedTemplateType === 'vehicle_field'
        ? { template_type: 'vehicle_field' }
        : {
          $or: [
            { template_type: 'document' },
            { template_type: { $exists: false } },
            { template_type: null },
            { template_type: '' },
          ],
        }),
  };
  const items = await DriverNeededDocument.find(query).sort({ createdAt: -1 }).lean();
  return items.map((item) => {
    if (normalizeDriverTemplateType(item.template_type) === 'vehicle_field') {
      return serializeDriverVehicleField(item);
    }

    return includeFields ? serializeDriverNeededDocumentTemplate(item) : serializeDriverNeededDocument(item);
  });
};

export const getDriverNeededDocumentById = async (id) => {
  await cleanupLegacySeededDriverNeededDocuments();
  await ensureDefaultDriverVehicleFields();

  const item = await DriverNeededDocument.findById(id).lean();
  if (!item) {
    throw new ApiError(404, 'Driver needed document not found');
  }

  return normalizeDriverTemplateType(item.template_type) === 'vehicle_field'
    ? serializeDriverVehicleField(item)
    : serializeDriverNeededDocument(item);
};

export const listDriverVehicleFieldTemplates = async ({ activeOnly = true } = {}) =>
  listDriverNeededDocuments({ activeOnly, templateType: 'vehicle_field' });

export const listDriverDocumentUploadFields = async ({ activeOnly = true } = {}) => {
  const items = await listDriverNeededDocuments({ activeOnly, includeFields: true });
  return items.flatMap((item) =>
    item.fields.map((field) => ({
      ...field,
      template_id: item.id,
      template_name: item.name,
      account_type: item.account_type,
      image_type: item.image_type,
      has_expiry_date: item.has_expiry_date,
      has_identify_number: item.has_identify_number,
    })),
  );
};

export const listOwnerDocumentUploadFields = async ({ activeOnly = true } = {}) => {
  const items = await listOwnerNeededDocuments();
  const filteredItems = activeOnly ? items.filter((item) => item.active !== false) : items;

  return filteredItems.flatMap((item) =>
    buildOwnerDocumentFields(item).map((field) => ({
      ...field,
      template_id: item.id,
      template_name: item.name,
      image_type: item.image_type,
      has_expiry_date: item.has_expiry_date,
      has_identify_number: item.has_identify_number,
    })),
  );
};

export const createDriverNeededDocument = async (payload) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Document name is required');
  }

  await cleanupLegacySeededDriverNeededDocuments();
  await ensureDefaultDriverVehicleFields();

  const templateType = normalizeDriverTemplateType(payload.template_type);

  const name = String(payload.name).trim();
  const slug = slugify(payload.slug || (templateType === 'vehicle_field' ? `vehicle-field-${payload.field_key || name}` : name));
  const existing = await DriverNeededDocument.findOne({ slug });
  if (existing) {
    throw new ApiError(409, `A driver ${templateType === 'vehicle_field' ? 'field' : 'document'} with this name already exists`);
  }

  if (templateType === 'vehicle_field') {
    const fieldKey = String(payload.field_key || '').trim();
    const definition = DRIVER_VEHICLE_FIELD_DEFINITIONS[fieldKey];
    const normalizedFieldType = normalizeDriverVehicleFieldType(payload.field_type || definition?.field_type || 'text');
    const normalizedFieldKey = fieldKey || `custom_${slugify(name).replace(/-/g, '_')}`;

    if (!normalizedFieldKey) {
      throw new ApiError(400, 'A valid vehicle field key is required');
    }

    const duplicateField = await DriverNeededDocument.findOne({
      template_type: 'vehicle_field',
      field_key: normalizedFieldKey,
    }).lean();
    if (duplicateField) {
      throw new ApiError(409, 'A vehicle field with this key already exists');
    }

    const item = await DriverNeededDocument.create({
      template_type: 'vehicle_field',
      name,
      slug,
      account_type: normalizeDriverAccountType(payload.account_type || definition?.account_type),
      image_type: 'image',
      has_expiry_date: false,
      has_identify_number: false,
      identify_number_key: '',
      verification_type: 'none',
      is_editable: payload.is_editable !== undefined ? normalizeBoolean(payload.is_editable) : true,
      is_required: payload.is_required !== undefined ? normalizeBoolean(payload.is_required) : true,
      active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
      field_key: normalizedFieldKey,
      field_type: normalizedFieldType,
      field_group: String(payload.field_group || definition?.field_group || '').trim(),
      placeholder: String(payload.placeholder || definition?.placeholder || '').trim(),
      help_text: String(payload.help_text || '').trim(),
      sort_order: Number(payload.sort_order ?? definition?.sort_order ?? 0),
      options: Array.isArray(payload.options) ? payload.options.map((item) => String(item || '').trim()).filter(Boolean) : (definition?.options || []),
      key: '',
      front_key: '',
      back_key: '',
    });

    return serializeDriverVehicleField(item.toObject());
  }

  const keys = buildDriverNeededDocumentKeys(payload);
  const verificationType = normalizeDriverDocumentVerificationType(payload.verification_type);
  const item = await DriverNeededDocument.create({
    template_type: 'document',
    name,
    slug,
    account_type: normalizeDriverAccountType(payload.account_type),
    image_type: String(payload.image_type || 'front_back').trim(),
    has_expiry_date: normalizeBoolean(payload.has_expiry_date),
    has_identify_number: normalizeBoolean(payload.has_identify_number),
    identify_number_key: normalizeBoolean(payload.has_identify_number)
      ? String(payload.identify_number_key || '').trim()
      : '',
    verification_type: verificationType,
    is_editable: normalizeBoolean(payload.is_editable),
    is_required: normalizeBoolean(payload.is_required),
    active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
    ...keys,
  });

  return serializeDriverNeededDocument(item.toObject());
};

export const updateDriverNeededDocument = async (id, payload) => {
  const item = await DriverNeededDocument.findById(id);
  if (!item) {
    throw new ApiError(404, 'Driver needed document not found');
  }

  const templateType = normalizeDriverTemplateType(item.template_type || payload.template_type);

  if (templateType === 'vehicle_field') {
    if (payload.name !== undefined) {
      item.name = String(payload.name || '').trim();
    }
    if (payload.account_type !== undefined) {
      item.account_type = normalizeDriverAccountType(payload.account_type);
    }
    if (payload.field_key !== undefined) {
      const fieldKey = String(payload.field_key || '').trim();
      if (!fieldKey) {
        throw new ApiError(400, 'A valid vehicle field key is required');
      }
      item.field_key = fieldKey;
    }
    if (payload.field_type !== undefined) {
      item.field_type = normalizeDriverVehicleFieldType(payload.field_type);
    }
    if (payload.field_group !== undefined) {
      item.field_group = String(payload.field_group || '').trim();
    }
    if (payload.placeholder !== undefined) {
      item.placeholder = String(payload.placeholder || '').trim();
    }
    if (payload.help_text !== undefined) {
      item.help_text = String(payload.help_text || '').trim();
    }
    if (payload.sort_order !== undefined) {
      item.sort_order = Number(payload.sort_order || 0);
    }
    if (payload.options !== undefined) {
      item.options = Array.isArray(payload.options)
        ? payload.options.map((entry) => String(entry || '').trim()).filter(Boolean)
        : [];
    }
    if (payload.is_editable !== undefined) {
      item.is_editable = normalizeBoolean(payload.is_editable);
    }
    if (payload.is_required !== undefined) {
      item.is_required = normalizeBoolean(payload.is_required);
    }
    if (payload.active !== undefined) {
      item.active = normalizeBoolean(payload.active);
    }

    await item.save();
    return serializeDriverVehicleField(item.toObject());
  }

  if (payload.name !== undefined) {
    item.name = String(payload.name || '').trim();
  }
  if (payload.account_type !== undefined) {
    item.account_type = normalizeDriverAccountType(payload.account_type);
  }
  if (payload.image_type !== undefined) {
    item.image_type = String(payload.image_type || 'front_back').trim();
  }
  if (payload.has_expiry_date !== undefined) {
    item.has_expiry_date = normalizeBoolean(payload.has_expiry_date);
  }
  if (payload.has_identify_number !== undefined) {
    item.has_identify_number = normalizeBoolean(payload.has_identify_number);
  }
  if (payload.identify_number_key !== undefined || payload.has_identify_number !== undefined) {
    item.identify_number_key = item.has_identify_number
      ? String(payload.identify_number_key ?? item.identify_number_key ?? '').trim()
      : '';
  }
  if (payload.verification_type !== undefined) {
    item.verification_type = normalizeDriverDocumentVerificationType(payload.verification_type);
  }
  if (payload.is_editable !== undefined) {
    item.is_editable = normalizeBoolean(payload.is_editable);
  }
  if (payload.is_required !== undefined) {
    item.is_required = normalizeBoolean(payload.is_required);
  }
  if (payload.active !== undefined) {
    item.active = normalizeBoolean(payload.active);
  }

  const keys = buildDriverNeededDocumentKeys(
    {
      ...item.toObject(),
      ...payload,
      name: item.name,
      image_type: item.image_type,
    },
    item.toObject(),
  );

  item.key = keys.key;
  item.front_key = keys.front_key;
  item.back_key = keys.back_key;

  await item.save();
  return serializeDriverNeededDocument(item.toObject());
};

export const deleteDriverNeededDocument = async (id) => {
  const deleted = await DriverNeededDocument.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Driver needed document not found');
  }

  return true;
};


export const listOwnerNeededDocuments = async () => {
  const items = await OwnerNeededDocument.find().sort({ createdAt: -1 }).lean();
  return items.map(serializeOwnerNeededDocument);
};

export const createOwnerNeededDocument = async (payload) => {
  if (!payload.name?.trim()) {
    throw new ApiError(400, 'Document name is required');
  }

  const item = await OwnerNeededDocument.create({
    name: String(payload.name).trim(),
    image_type: String(payload.image_type || 'front_back').trim(),
    has_expiry_date: normalizeBoolean(payload.has_expiry_date),
    has_identify_number: normalizeBoolean(payload.has_identify_number),
    is_editable: normalizeBoolean(payload.is_editable),
    is_required: normalizeBoolean(payload.is_required),
    active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
  });

  return serializeOwnerNeededDocument(item.toObject());
};

export const updateOwnerNeededDocument = async (id, payload) => {
  const item = await OwnerNeededDocument.findById(id);
  if (!item) throw new ApiError(404, 'Owner needed document not found');

  if (payload.name !== undefined) {
    item.name = String(payload.name || '').trim();
  }
  if (payload.image_type !== undefined) {
    item.image_type = String(payload.image_type || 'front_back').trim();
  }
  if (payload.has_expiry_date !== undefined) {
    item.has_expiry_date = normalizeBoolean(payload.has_expiry_date);
  }
  if (payload.has_identify_number !== undefined) {
    item.has_identify_number = normalizeBoolean(payload.has_identify_number);
  }
  if (payload.is_editable !== undefined) {
    item.is_editable = normalizeBoolean(payload.is_editable);
  }
  if (payload.is_required !== undefined) {
    item.is_required = normalizeBoolean(payload.is_required);
  }
  if (payload.active !== undefined) {
    item.active = normalizeBoolean(payload.active);
  }

  await item.save();
  return serializeOwnerNeededDocument(item.toObject());
};

export const deleteOwnerNeededDocument = async (id) => {
  const deleted = await OwnerNeededDocument.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Owner needed document not found');
  return true;
};

export const listReferralTranslations = async () => {
  const [languages, translations] = await Promise.all([
    AppLanguage.find().sort({ default_status: -1, code: 1 }).lean(),
    ReferralTranslation.find().sort({ language_code: 1 }).lean(),
  ]);

  const translationMap = new Map(
    translations.map((item) => [String(item.language_code || '').toLowerCase(), item]),
  );

  const languageRows = languages.map((language) =>
    serializeReferralTranslation({
      language,
      translation: translationMap.get(String(language.code || '').toLowerCase()) || null,
    }),
  );

  const existingCodes = new Set(languageRows.map((item) => item.language_code));

  const orphanRows = translations
    .filter((item) => !existingCodes.has(String(item.language_code || '').toLowerCase()))
    .map((item) =>
      serializeReferralTranslation({
        language: null,
        translation: item,
      }),
    );

  return [...languageRows, ...orphanRows];
};

export const updateReferralTranslation = async (languageCode, payload = {}) => {
  const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();

  if (!normalizedLanguageCode) {
    throw new ApiError(400, 'languageCode is required');
  }

  const language = await AppLanguage.findOne({ code: normalizedLanguageCode }).lean();

  const item = await ReferralTranslation.findOneAndUpdate(
    { language_code: normalizedLanguageCode },
    {
      $set: {
        language_code: normalizedLanguageCode,
        language_name: language?.name || String(payload.language_name || ''),
        user_referral: normalizeReferralTranslationSection(payload.user_referral),
        driver_referral: normalizeReferralTranslationSection(payload.driver_referral),
      },
    },
    {
      returnDocument: 'after',
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return serializeReferralTranslation({
    language,
    translation: item,
  });
};

export const getReferralTranslationContent = async (languageCode = '') => {
  const { languages, preferredLanguage, normalizedLanguageCode } =
    await resolveReferralTranslationLanguage(languageCode);

  const codesToTry = [
    normalizedLanguageCode,
    preferredLanguage?.code,
    languages.find((item) => Number(item.default_status) === 1)?.code,
    'en',
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  let translation = null;
  let resolvedLanguage = preferredLanguage;

  if (codesToTry.length > 0) {
    translation = await ReferralTranslation.findOne({
      language_code: { $in: codesToTry },
    })
      .sort({ updatedAt: -1 })
      .lean();

    if (translation) {
      resolvedLanguage =
        languages.find(
          (item) =>
            String(item.code || '').toLowerCase() === String(translation.language_code || '').toLowerCase(),
        ) || resolvedLanguage;
    }
  }

  return {
    language_code: String(
      resolvedLanguage?.code || translation?.language_code || normalizedLanguageCode || 'en',
    )
      .trim()
      .toLowerCase(),
    language_name: resolvedLanguage?.name || translation?.language_name || '',
    user_referral: {
      ...REFERRAL_TRANSLATION_DEFAULTS,
      ...normalizeReferralTranslationSection(translation?.user_referral),
    },
    driver_referral: {
      ...REFERRAL_TRANSLATION_DEFAULTS,
      ...normalizeReferralTranslationSection(translation?.driver_referral),
    },
    available_languages: languages.map((item) => ({
      code: String(item.code || '').toLowerCase(),
      name: item.name || '',
      active: Number(item.active ?? 1) === 1,
      default_status: Number(item.default_status ?? 0) === 1,
    })),
  };
};



export const listLanguages = async () => AppLanguage.find().sort({ code: 1 }).lean();

export const updateLanguageStatus = async (id, payload) => {
  const language = await AppLanguage.findByIdAndUpdate(id, { active: Number(payload.active) }, { returnDocument: 'after' });
  if (!language) throw new ApiError(404, 'Language not found');
  return language.toObject();
};

export const deleteLanguage = async (id) => {
  const deleted = await AppLanguage.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Language not found');
  return true;
};

export const listPreferences = async () => UserPreference.find().sort({ createdAt: -1 }).lean();

export const createPreference = async (payload) => {
  const firstLetter = (payload.name || 'P').trim().charAt(0).toUpperCase() || 'P';
  const preference = await UserPreference.create({
    name: payload.name,
    icon: payload.icon || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect rx="16" width="64" height="64" fill="%23E0E7FF"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-size="28">${firstLetter}</text></svg>`,
    active: 1,
  });
  return preference.toObject();
};

export const updatePreferenceStatus = async (id, payload) => {
  const preference = await UserPreference.findByIdAndUpdate(id, { active: Number(payload.active) }, { returnDocument: 'after' });
  if (!preference) throw new ApiError(404, 'Preference not found');
  return preference.toObject();
};

export const deletePreference = async (id) => {
  const deleted = await UserPreference.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Preference not found');
  return true;
};

export const listRoles = async () => AdminRole.find().sort({ createdAt: -1 }).lean();

export const createRole = async (payload) => {
  const role = await AdminRole.create({
    name: payload.name,
    description: payload.description || '',
    slug: payload.name?.trim().toLowerCase().replace(/\s+/g, '-') || `role-${Date.now()}`,
  });
  return role.toObject();
};

export const deleteRole = async (id) => {
  const deleted = await AdminRole.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'Role not found');
  return true;
};



export const listNotificationChannels = async () => NotificationChannel.find().sort({ createdAt: 1 }).lean();

export const toggleChannelPush = async (id, status) => {
  const channel = await NotificationChannel.findByIdAndUpdate(id, { push_notification: !!status }, { returnDocument: 'after' });
  if (!channel) throw new ApiError(404, 'Channel not found');
  return channel.toObject();
};

export const toggleChannelMail = async (id, status) => {
  const channel = await NotificationChannel.findByIdAndUpdate(id, { mail: !!status }, { returnDocument: 'after' });
  if (!channel) throw new ApiError(404, 'Channel not found');
  return channel.toObject();
};

export const listPaymentGateways = async () => PaymentGateway.find().sort({ name: 1 }).lean();

export const listPaymentMethods = async () =>
  PaymentMethod.find().sort({ createdAt: -1 }).lean();

export const createPaymentMethod = async (payload = {}) => {
  const name = String(payload.method_name ?? payload.name ?? '').trim();
  if (!name) {
    throw new ApiError(400, 'Method name is required');
  }

  const fields = Array.isArray(payload.fields)
    ? payload.fields
      .map((field) => ({
        type: String(field?.type || 'text'),
        name: String(field?.name || '').trim(),
        placeholder: String(field?.placeholder || '').trim(),
        is_required: Boolean(field?.is_required),
      }))
      .filter((field) => field.name)
    : [];

  const method = await PaymentMethod.create({
    name,
    fields,
    active: payload.active !== undefined ? Boolean(payload.active) : true,
  });

  return method.toObject();
};

export const updatePaymentMethod = async (id, payload = {}) => {
  const update = {};

  if (payload.method_name !== undefined || payload.name !== undefined) {
    const name = String(payload.method_name ?? payload.name ?? '').trim();
    if (!name) {
      throw new ApiError(400, 'Method name is required');
    }
    update.name = name;
  }

  if (payload.fields !== undefined) {
    const fields = Array.isArray(payload.fields)
      ? payload.fields
        .map((field) => ({
          type: String(field?.type || 'text'),
          name: String(field?.name || '').trim(),
          placeholder: String(field?.placeholder || '').trim(),
          is_required: Boolean(field?.is_required),
        }))
        .filter((field) => field.name)
      : [];
    update.fields = fields;
  }

  if (payload.active !== undefined) {
    update.active = Boolean(payload.active);
  }

  const method = await PaymentMethod.findByIdAndUpdate(id, update, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!method) {
    throw new ApiError(404, 'Payment method not found');
  }
  return method.toObject();
};

export const deletePaymentMethod = async (id) => {
  const deleted = await PaymentMethod.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Payment method not found');
  }
  return true;
};

export const getPaymentSettings = async () => {
  const settings = await ensureThirdPartySettings();
  const activeGateway = await getActivePaymentGateway();
  return { settings: settings.payment || {}, active_gateway: activeGateway };
};

export const updatePaymentSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.payment = normalizePaymentSettingsPayload(
    settings.payment || {},
    deepMerge(settings.payment || {}, payload),
  );
  settings.markModified('payment');
  await settings.save();
  const activeGateway = await getActivePaymentGateway();
  return { settings: settings.payment, active_gateway: activeGateway };
};

export const getSMSSettings = async () => {
  const settings = await ensureThirdPartySettings();
  return { settings: settings.sms || {} };
};

export const updateSMSSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.sms = deepMerge(settings.sms || {}, payload);
  settings.markModified('sms');
  await settings.save();
  return { settings: settings.sms };
};

export const getFirebaseSettings = async () => {
  const settings = await ensureThirdPartySettings();
  return { settings: settings.firebase || {} };
};

export const updateFirebaseSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.firebase = {
    ...settings.firebase,
    ...payload,
    firebase_json_name: payload.firebase_json_name || settings.firebase.firebase_json_name,
  };
  settings.markModified('firebase');
  await settings.save();
  return { settings: settings.firebase };
};

export const getMapSettings = async () => {
  const settings = await ensureThirdPartySettings();
  return { settings: settings.map_apis || {} };
};

export const updateMapSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.map_apis = { ...settings.map_apis, ...payload };
  settings.markModified('map_apis');
  await settings.save();
  return { settings: settings.map_apis };
};

export const getMailSettings = async () => {
  const settings = await ensureThirdPartySettings();
  return { settings: settings.mail || {} };
};

export const updateMailSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.mail = { ...settings.mail, ...payload };
  settings.markModified('mail');
  await settings.save();
  return { settings: settings.mail };
};

export const getRechargeApiSettings = async () => {
  const settings = await ensureThirdPartySettings();
  return buildRechargeApiResponse(settings.recharge_api || {});
};

export const updateRechargeApiSettings = async (payload) => {
  const settings = await ensureThirdPartySettings();
  settings.recharge_api = normalizeRechargeApiSettings(
    deepMerge(settings.recharge_api || {}, payload || {}),
  );
  settings.markModified('recharge_api');
  await settings.save();
  return buildRechargeApiResponse(settings.recharge_api);
};

export const generateRechargeApiToken = async () => {
  const settings = await ensureThirdPartySettings();
  settings.recharge_api = normalizeRechargeApiSettings({
    ...(settings.recharge_api || {}),
    api_token: randomBytes(32).toString('base64url'),
    token_generated_at: new Date().toISOString(),
  });
  settings.markModified('recharge_api');
  await settings.save();
  return buildRechargeApiResponse(settings.recharge_api);
};

export const runRechargeApiTest = async () => {
  const settings = await ensureThirdPartySettings();
  const payload = buildRechargeApiResponse(settings.recharge_api || {});
  const apiToken = payload.settings?.api_token || '';
  const endpointPath = payload.metadata?.provider_endpoints?.bank_verify_penny_less || '/validation/verifyBankRequest';
  const requestUrl = `${payload.metadata?.base_url || ''}${endpointPath}`;
  const sampleBody = {
    bank_account: '330701XXXXXX',
    ifsc_code: 'ICIC000XXXX',
    benificiary_name: 'DEMO USER',
    partner_request_id: `BANK${Date.now()}`,
  };

  return {
    success: Boolean(apiToken),
    message: apiToken
      ? 'Recharge API configuration looks ready for a callback test.'
      : 'Generate and save an API token before using this integration in production.',
    request_preview: {
      method: 'POST',
      url: requestUrl,
      headers: {
        'Content-Type': 'application/json',
        [payload.metadata?.auth_header_name || 'Authorization']:
          `${payload.metadata?.auth_header_prefix ? `${payload.metadata.auth_header_prefix} ` : ''}${apiToken || '<generate-token-first>'}`,
      },
      body: sampleBody,
    },
    curl: [
      'curl -X POST',
      `  "${requestUrl}"`,
      '  -H "Content-Type: application/json"',
      `  -H "${payload.metadata?.auth_header_name || 'Authorization'}: ${payload.metadata?.auth_header_prefix ? `${payload.metadata.auth_header_prefix} ` : ''}${apiToken || '<generate-token-first>'}"`,
      `  -d '${JSON.stringify(sampleBody)}'`,
    ].join(' \\\n'),
  };
};



const buildDateFilter = (date_option, from_date, to_date) => {
  const filter = {};
  const now = new Date();

  if (date_option === 'today') {
    filter.$gte = new Date(now.setHours(0, 0, 0, 0));
  } else if (date_option === 'yesterday') {
    const yesterday = new Date(now.setDate(now.getDate() - 1));
    filter.$gte = new Date(yesterday.setHours(0, 0, 0, 0));
    filter.$lt = new Date(new Date().setHours(0, 0, 0, 0));
  } else if (date_option === 'this_week') {
    const first = now.getDate() - now.getDay();
    filter.$gte = new Date(now.setDate(first));
  } else if (date_option === 'this_month') {
    filter.$gte = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (date_option === 'this_year') {
    filter.$gte = new Date(now.getFullYear(), 0, 1);
  } else if (date_option === 'range' && from_date && to_date) {
    filter.$gte = new Date(new Date(from_date).setHours(0, 0, 0, 0));
    filter.$lte = new Date(new Date(to_date).setHours(23, 59, 59, 999));
  }

  return Object.keys(filter).length > 0 ? filter : null;
};

export const buildUserReport = async (query = {}) => {
  const { status, date_option, from_date, to_date } = query;
  const filter = { deletedAt: null };

  if (status === 'active') filter.active = true;
  else if (status === 'inactive') filter.active = false;

  const dateFilter = buildDateFilter(date_option, from_date, to_date);
  if (dateFilter) filter.createdAt = dateFilter;

  const users = await User.find(filter).sort({ createdAt: -1 }).lean();
  return {
    headers: ['name', 'email', 'mobile', 'active', 'createdAt'],
    rows: users.map((item) => ({
      name: item.name || '',
      email: item.email || '',
      mobile: item.phone || item.mobile || '',
      active: item.active !== false && !item.deletedAt,
      createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : ''
    }))
  };
};

export const buildDriverReport = async (query = {}) => {
  const { transport_type, vehicle_type, status, date_option, from_date, to_date } = query;
  const filter = {};

  if (transport_type === 'both') {
    filter.registerFor = { $in: ['taxi', 'bike', 'both'] };
  } else if (transport_type) {
    filter.registerFor = transport_type;
  }

  if (vehicle_type) filter.vehicleType = vehicle_type;
  if (status) filter.status = status;

  const dateFilter = buildDateFilter(date_option, from_date, to_date);
  if (dateFilter) filter.createdAt = dateFilter;

  const items = await Driver.find(filter).lean();
  return {
    headers: ['name', 'mobile', 'city', 'transport_type', 'vehicle_type', 'status', 'createdAt'],
    rows: items.map((item) => ({
      name: item.name,
      mobile: item.phone,
      city: item.city,
      transport_type: item.registerFor,
      vehicle_type: item.vehicleType,
      status: item.status,
      createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : ''
    }))
  };
};

export const buildDriverDutyReport = async (query = {}) => {
  const {
    service_location_id,
    driver_id,
    driver,
    status,
    date_option,
    from_date,
    to_date,
  } = query;
  const selectedDriverId = driver_id || driver;
  const driverFilter = {};

  if (service_location_id) {
    driverFilter.service_location_id = service_location_id;
  }
  if (selectedDriverId) {
    driverFilter._id = selectedDriverId;
  }

  const drivers = await Driver.find(driverFilter)
    .select('name phone city registerFor vehicleType service_location_id')
    .lean();
  const driverIds = drivers.map((item) => item._id);
  const driverMap = new Map(drivers.map((item) => [String(item._id), item]));

  if (driverIds.length === 0) {
    return {
      headers: ['ride_id', 'driver', 'driver_phone', 'transport_type', 'vehicle_type', 'pickup', 'drop', 'payment_method', 'fare', 'status', 'ride_time'],
      rows: [],
    };
  }

  const rideFilter = {
    driverId: { $in: driverIds },
  };

  if (status) {
    rideFilter.status = String(status).trim().toLowerCase();
  }

  const dateFilter = buildDateFilter(date_option, from_date, to_date);
  if (dateFilter) {
    rideFilter.createdAt = dateFilter;
  }

  const rides = await Ride.find(rideFilter)
    .sort({ createdAt: -1 })
    .select('driverId pickupAddress dropAddress paymentMethod fare status createdAt transport_type vehicleTypeId')
    .populate('vehicleTypeId', 'name type_name transport_type')
    .lean();

  return {
    headers: ['ride_id', 'driver', 'driver_phone', 'transport_type', 'vehicle_type', 'pickup', 'drop', 'payment_method', 'fare', 'status', 'ride_time'],
    rows: rides.map((ride) => {
      const rideDriver = driverMap.get(String(ride.driverId || '')) || {};
      const vehicleType =
        ride?.vehicleTypeId?.type_name ||
        ride?.vehicleTypeId?.name ||
        rideDriver?.vehicleType ||
        '';

      return {
        ride_id: String(ride._id),
        driver: rideDriver.name || 'Unknown Driver',
        driver_phone: rideDriver.phone || '',
        transport_type:
          ride?.vehicleTypeId?.transport_type ||
          ride?.transport_type ||
          rideDriver?.registerFor ||
          'taxi',
        vehicle_type: vehicleType,
        pickup: ride.pickupAddress || '',
        drop: ride.dropAddress || '',
        payment_method: ride.paymentMethod || '',
        fare: Number(ride.fare || 0),
        status: ride.status || '',
        ride_time: ride.createdAt ? new Date(ride.createdAt).toLocaleString() : '',
      };
    }),
  };
};

export const buildOwnerReport = async (query = {}) => {
  const { service_location_id, status, date_option, from_date, to_date } = query;
  const filter = {};

  if (service_location_id) filter.service_location_id = service_location_id;
  if (status === 'active') filter.active = true;
  else if (status === 'inactive') filter.active = false;

  const dateFilter = buildDateFilter(date_option, from_date, to_date);
  if (dateFilter) filter.createdAt = dateFilter;

  const owners = await listOwners(filter);
  return {
    headers: ['company_name', 'name', 'email', 'transport_type', 'active', 'createdAt'],
    rows: owners.map((item) => ({
      company_name: item.company_name,
      name: item.name,
      email: item.email,
      transport_type: item.transport_type,
      active: item.active,
      createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : ''
    }))
  };
};

export const buildFinanceReport = async (query = {}) => {
  const {
    transport_type,
    vehicle_type,
    status,
    trip_status,
    payment_type,
    date_option,
    from_date,
    to_date,
  } = query;
  const rideFilter = {};
  const effectiveStatus = status || trip_status;

  if (effectiveStatus) {
    rideFilter.status = String(effectiveStatus).trim().toLowerCase();
  }
  if (payment_type) {
    rideFilter.paymentMethod = String(payment_type).trim().toLowerCase();
  }

  const dateFilter = buildDateFilter(date_option, from_date, to_date);
  if (dateFilter) {
    rideFilter.createdAt = dateFilter;
  }

  const items = await Ride.find(rideFilter)
    .sort({ createdAt: -1 })
    .select('driverId userId fare status paymentMethod createdAt transport_type commissionAmount driverEarnings')
    .populate('driverId', 'name phone registerFor vehicleType')
    .populate('userId', 'name phone')
    .lean();

  const normalizedTransportType = String(transport_type || '').trim().toLowerCase();
  const normalizedVehicleType = String(vehicle_type || '').trim().toLowerCase();

  const rows = items
    .map((item) => {
      const resolvedTransportType =
        String(
          item.transport_type ||
          item.driverId?.registerFor ||
          item.driverId?.vehicleType ||
          'taxi',
        )
          .trim()
          .toLowerCase();
      const resolvedVehicleType = String(item.driverId?.vehicleType || '').trim().toLowerCase();
      const fare = Number(item.fare || 0);
      const commission =
        item.commissionAmount !== undefined && item.commissionAmount !== null
          ? Number(item.commissionAmount || 0)
          : Math.max(fare - Number(item.driverEarnings || 0), 0);

      return {
        ride_id: String(item._id),
        driver: item.driverId?.name || 'Unassigned',
        driver_phone: item.driverId?.phone || '',
        user: item.userId?.name || '',
        user_phone: item.userId?.phone || '',
        transport_type: resolvedTransportType,
        vehicle_type: resolvedVehicleType,
        payment_method: String(item.paymentMethod || '').toLowerCase(),
        fare,
        admin_commission: Number(commission.toFixed(2)),
        driver_earnings: Number(Math.max(fare - commission, 0).toFixed(2)),
        status: item.status || '',
        createdAt: item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
      };
    })
    .filter((item) => {
      const transportMatches =
        !normalizedTransportType ||
        normalizedTransportType === 'all' ||
        normalizedTransportType === 'both' ||
        item.transport_type === normalizedTransportType;
      const vehicleMatches =
        !normalizedVehicleType ||
        item.vehicle_type === normalizedVehicleType;
      return transportMatches && vehicleMatches;
    });

  return {
    headers: ['ride_id', 'driver', 'driver_phone', 'user', 'user_phone', 'transport_type', 'vehicle_type', 'payment_method', 'fare', 'admin_commission', 'driver_earnings', 'status', 'createdAt'],
    rows,
  };
};

export const buildFleetFinanceReport = async () => {
  const owners = await listOwners();
  return {
    headers: ['company_name', 'owner', 'transport_type', 'active'],
    rows: owners.map((item) => ({
      company_name: item.company_name,
      owner: item.name,
      transport_type: item.transport_type,
      active: item.active,
    }))
  };
};

export const ensureBusinessSettings = async () => {
  let settings = await AdminBusinessSetting.findOne({ scope: 'default' });
  if (!settings) {
    settings = await AdminBusinessSetting.create(createDefaultBusinessSettings());
  }
  return settings;
};

/**
 * Ensures a default third-party settings document exists.
 */
export const ensureThirdPartySettings = async () => {
  let settings = await AdminThirdPartySetting.findOne({ scope: 'default' });
  if (!settings) {
    settings = await AdminThirdPartySetting.create(createDefaultThirdPartySettings());
  }
  return settings;
};

/**
 * Ensures a default administrative application settings document exists.
 */
export const ensureAppSettings = async () => {
  let settings = await AdminAppSetting.findOne({ scope: 'default' });
  if (!settings) {
    settings = await AdminAppSetting.create(createDefaultAppSettings());
  }
  return settings;
};

export const ensureAppModules = async () => {
  // No-op: AppModule is now nested inside AdminAppSetting
  return;
};

const businessSettingsCategoryMap = {
  customize: 'customization',
  'transport-ride': 'transport_ride',
  'bid-ride': 'bid_ride',
  general: 'general',
  'user-home-management': 'user_home_settings',
};

const appSettingsCategoryMap = {
  wallet: 'wallet_setting',
  tip: 'tip_setting',
};

const generalBusinessSettingsProjection = {
  _id: 0,
  general: {
    app_name: '$general.app_name',
    contact_phone_1: '$general.contact_phone_1',
    contact_phone_2: '$general.contact_phone_2',
    contact_booking_number: '$general.contact_booking_number',
    footer_1: '$general.footer_1',
    footer_2: '$general.footer_2',
    default_lat: '$general.default_lat',
    default_lng: '$general.default_lng',
    logo: '$general.logo',
    favicon: '$general.favicon',
    brand_logo: '$general.brand_logo',
  },
};

const getGeneralBusinessSettingsSection = async () => {
  let results = await AdminBusinessSetting.aggregate([
    { $match: { scope: 'default' } },
    { $project: generalBusinessSettingsProjection },
    { $limit: 1 },
  ]);

  if (results.length === 0) {
    const created = await AdminBusinessSetting.create(createDefaultBusinessSettings());
    return created.general || {};
  }

  return results[0]?.general || {};
};

const getProjectedSettingsSection = async (Model, defaultFactory, key) => {
  if (!Model.schema.path(key)) {
    return {};
  }

  let settings = await Model.findOne(
    { scope: 'default' },
    { [key]: 1, _id: 0 },
  ).lean();

  if (!settings) {
    const created = await Model.create(defaultFactory());
    return created[key] || {};
  }

  return settings[key] || {};
};

export const getGeneralSettings = async (category) => {
  const appKey = appSettingsCategoryMap[category];
  if (appKey) {
    return {
      settings: await getProjectedSettingsSection(
        AdminAppSetting,
        createDefaultAppSettings,
        appKey,
      ),
    };
  }

  const businessKey = businessSettingsCategoryMap[category] || category;
  if (businessKey === 'general') {
    return {
      settings: await getGeneralBusinessSettingsSection(),
    };
  }

  return {
    settings: await getProjectedSettingsSection(
      AdminBusinessSetting,
      createDefaultBusinessSettings,
      businessKey,
    ),
  };
};

export const updateGeneralSettings = async (category, payload) => {
  const bizSettings = await ensureBusinessSettings();
  const appSettings = await ensureAppSettings();

  const newValues = payload.settings || payload;

  if (appSettingsCategoryMap[category]) {
    const key = appSettingsCategoryMap[category];
    appSettings[key] = { ...(appSettings[key] || {}), ...newValues };
    appSettings.markModified(key);
    await appSettings.save();
    return { settings: appSettings[key] };
  }

  const bizKey = businessSettingsCategoryMap[category] || category;
  if (!bizSettings.schema.path(bizKey)) {
    return { settings: {} };
  }

  bizSettings[bizKey] = { ...(bizSettings[bizKey] || {}), ...newValues };
  bizSettings.markModified(bizKey);
  await bizSettings.save();
  return { settings: bizSettings[bizKey] };
};

export const listAppModules = async (query = {}) => {
  const safePage = Number(query.page) || 1;
  const safeLimit = Number(query.limit) || 10;
  const start = (safePage - 1) * safeLimit;

  const [modules, total] = await Promise.all([
    TaxiAppModule.find()
      .sort({ order_by: 1, createdAt: -1 })
      .skip(start)
      .limit(safeLimit)
      .lean(),
    TaxiAppModule.countDocuments(),
  ]);

  const results = modules.map(m => ({
    _id: m._id,
    id: String(m._id),
    name: m.name,
    transport_type: m.transport_type,
    service_type: m.service_type,
    icon_types_for: m.icon_types_for,
    order_by: m.order_by,
    short_description: m.short_description,
    description: m.description,
    mobile_menu_icon: m.mobile_menu_icon,
    mobile_menu_cover_image: m.mobile_menu_cover_image,
    active: m.active,
    created_at: m.createdAt,
    updated_at: m.updatedAt
  }));

  return {
    results,
    paginator: {
      total,
      current_page: safePage,
      per_page: safeLimit,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const createAppModule = async (payload) => {
  const item = await TaxiAppModule.create({
    name: String(payload.name || '').trim(),
    transport_type: payload.transport_type || 'taxi',
    service_type: payload.service_type || 'normal',
    icon_types_for: payload.icon_types_for || null,
    order_by: Number(payload.order_by || 1),
    short_description: String(payload.short_description || '').trim(),
    description: String(payload.description || '').trim(),
    mobile_menu_icon: String(payload.mobile_menu_icon || '').trim(),
    mobile_menu_cover_image: payload.mobile_menu_cover_image || null,
    active: payload.active !== undefined ? (normalizeBoolean(payload.active) ? 1 : 0) : 1,
    company_key: payload.company_key || null
  });
  return item.toObject();
};

export const updateAppModule = async (id, payload) => {
  const update = {};
  if (payload.name !== undefined) update.name = String(payload.name).trim();
  if (payload.transport_type !== undefined) update.transport_type = payload.transport_type;
  if (payload.service_type !== undefined) update.service_type = payload.service_type;
  if (payload.icon_types_for !== undefined) update.icon_types_for = payload.icon_types_for;
  if (payload.order_by !== undefined) update.order_by = Number(payload.order_by);
  if (payload.short_description !== undefined) update.short_description = String(payload.short_description);
  if (payload.description !== undefined) update.description = String(payload.description);
  if (payload.mobile_menu_icon !== undefined) update.mobile_menu_icon = String(payload.mobile_menu_icon);
  if (payload.mobile_menu_cover_image !== undefined) update.mobile_menu_cover_image = payload.mobile_menu_cover_image;
  if (payload.active !== undefined) update.active = normalizeBoolean(payload.active) ? 1 : 0;
  if (payload.company_key !== undefined) update.company_key = payload.company_key;

  const item = await TaxiAppModule.findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' });
  if (!item) throw new ApiError(404, 'App module not found in database registry');
  return item.toObject();
};

export const deleteAppModule = async (id) => {
  const deleted = await TaxiAppModule.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, 'App module registration not found');
  return true;
};

export const listOnboardingScreens = async (audience) => {
  const query = {};
  if (audience) {
    query.$or = [{ audience: audience }, { screen: audience }];
  }
  return OnboardingScreen.find(query).sort({ order: 1 }).lean();
};

export const createOnboardingScreen = async (payload = {}) => {
  const audience = String(payload.audience || payload.screen || 'user').trim().toLowerCase();
  if (!['user', 'driver', 'owner'].includes(audience)) {
    throw new ApiError(400, 'Valid onboarding audience is required');
  }

  const title = String(payload.title || '').trim();
  if (!title) {
    throw new ApiError(400, 'Onboarding title is required');
  }

  const item = await OnboardingScreen.create({
    audience,
    screen: audience,
    order: Number(payload.order || 1),
    title,
    description: String(payload.description || '').trim(),
    active: payload.active !== undefined ? normalizeBoolean(payload.active) : true,
  });

  return item.toObject();
};

export const updateOnboardingScreen = async (id, payload = {}) => {
  const update = {};

  if (payload.audience !== undefined || payload.screen !== undefined) {
    const audience = String(payload.audience || payload.screen || '').trim().toLowerCase();
    if (!['user', 'driver', 'owner'].includes(audience)) {
      throw new ApiError(400, 'Valid onboarding audience is required');
    }
    update.audience = audience;
    update.screen = audience;
  }
  if (payload.order !== undefined) {
    update.order = Number(payload.order || 1);
  }
  if (payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) {
      throw new ApiError(400, 'Onboarding title is required');
    }
    update.title = title;
  }
  if (payload.description !== undefined) {
    update.description = String(payload.description || '').trim();
  }
  if (payload.active !== undefined) {
    update.active = normalizeBoolean(payload.active);
  }

  const item = await OnboardingScreen.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  );
  if (!item) {
    throw new ApiError(404, 'Onboarding screen not found');
  }

  return item.toObject();
};

export const deleteOnboardingScreen = async (id) => {
  const deleted = await OnboardingScreen.findByIdAndDelete(id);
  if (!deleted) {
    throw new ApiError(404, 'Onboarding screen not found');
  }
  return true;
};

export const listTransportTypes = async () => {
  const types = await TaxiTransportType.find({ active: true }).lean();
  if (types.length === 0) {
    return await seedTransportTypes();
  }
  return types;
};

export const seedTransportTypes = async () => {
  const defaults = [
    { name: 'taxi', display_name: 'Taxi' },
    { name: 'delivery', display_name: 'Delivery' },
    { name: 'pooling', display_name: 'Pooling' },
    { name: 'both', display_name: 'Both' }
  ];

  const results = [];
  for (const item of defaults) {
    const existing = await TaxiTransportType.findOne({ name: item.name });
    if (!existing) {
      results.push(await TaxiTransportType.create(item));
    } else {
      results.push(existing);
    }
  }
  return results;
};
