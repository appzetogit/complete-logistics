import mongoose from 'mongoose';
import { ApiError } from '../../../../../utils/ApiError.js';
import { ServiceLocation } from '../../models/ServiceLocation.js';
import { ensureAdminState } from '../../services/adminService.js';
import { User } from '../../../user/models/User.js';
import { Banner } from '../models/Banner.js';
import { Notification } from '../models/Notification.js';
import { PromoCode } from '../models/PromoCode.js';
import { uploadDataUrlToCloudinary } from '../../../../../utils/cloudinaryUpload.js';
import { sendPushNotificationToAudience } from '../../../services/pushNotificationService.js';

const nextId = () => new mongoose.Types.ObjectId().toString();
const PROMO_TRANSPORT_TYPES = ['taxi', 'delivery', 'pooling', 'bus', 'self_drive', 'all'];

const buildPaginator = (items, page = 1, limit = 50) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Number(limit) || 50);
  const start = (safePage - 1) * safeLimit;

  return {
    results: items.slice(start, start + safeLimit),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total: items.length,
      last_page: Math.max(1, Math.ceil(items.length / safeLimit)),
    },
  };
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  return false;
};

const parseNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeDate = (value, fieldName) => {
  if (!value) {
    throw new ApiError(400, `${fieldName} is required`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldName} must be a valid date`);
  }
  return date;
};

const normalizeEndOfDay = (value, fieldName) => {
  const date = normalizeDate(value, fieldName);
  date.setHours(23, 59, 59, 999);
  return date;
};

const normalizeText = (value) => String(value ?? '').trim();

const normalizeTransportType = (value, fallback = 'all') => {
  const normalized = normalizeText(value ?? fallback).toLowerCase().replace(/\s+/g, '_');

  if (normalized === 'texi') return 'taxi';
  if (normalized === 'selfdrive') return 'self_drive';

  return normalized || fallback;
};

const toObjectIdOrThrow = (value, fieldName = 'id') => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
  return new mongoose.Types.ObjectId(String(value));
};

const serializeServiceLocation = (location) => ({
  _id: location._id,
  name: location.name || location.service_location_name || '',
  service_location_name: location.service_location_name || location.name || '',
  country: location.country || '',
  active: location.active !== false,
  status: location.status || (location.active !== false ? 'active' : 'inactive'),
  createdAt: location.createdAt,
  updatedAt: location.updatedAt,
});

const serializePromoCode = (item) => ({
  _id: item._id,
  service_location_id: item.service_location_id || '',
  service_location_name: item.service_location_name || '',
  service_location_ids: Array.isArray(item.service_location_ids) && item.service_location_ids.length > 0
    ? item.service_location_ids
    : item.service_location_id
      ? [item.service_location_id]
      : [],
  service_location_names: Array.isArray(item.service_location_names) && item.service_location_names.length > 0
    ? item.service_location_names
    : item.service_location_name
      ? [item.service_location_name]
      : [],
  user_id: item.user_id || '',
  user_name: item.user_name || '',
  user_specific: item.user_specific === true,
  transport_type: item.transport_type || 'all',
  code: item.code || '',
  minimum_trip_amount: Number(item.minimum_trip_amount || 0),
  maximum_discount_amount: Number(item.maximum_discount_amount || 0),
  cumulative_max_discount_amount: Number(item.cumulative_max_discount_amount || 0),
  discount_percentage: Number(item.discount_percentage || 0),
  from: item.from_date || item.from || '',
  to: item.to_date || item.to || '',
  uses_per_user: Number(item.uses_per_user || 1),
  max_uses_total: Number(item.max_uses_total || 0),
  usage_count: Number(item.usage_count || 0),
  active: item.active !== false,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeNotification = (item) => ({
  _id: item._id,
  service_location_id: item.service_location_id || '',
  service_location_name: item.service_location_name || '',
  send_to: item.send_to || 'all',
  push_title: item.push_title || '',
  message: item.message || '',
  image: item.image || '',
  status: item.status || 'sent',
  sent_at: item.sent_at || item.createdAt,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeBanner = (item) => ({
  _id: item._id,
  title: item.title || '',
  image: item.image || '',
  link_type: item.link_type || 'external_link',
  external_link: item.external_link || '',
  deep_link: item.deep_link || '',
  redirect_url: item.redirect_url || item.external_link || item.deep_link || '',
  active: item.active !== false,
  push_count: Number(item.push_count || 0),
  last_pushed_at: item.last_pushed_at || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const serializeBannerMinimal = (item) => ({
  _id: item._id,
  image: item.image || '',
  active: item.active !== false,
});

const serializeBannerFromPayload = (item, payload = {}) => {
  const keys = new Set(Object.keys(payload || {}));
  const response = { _id: item._id };

  if (keys.has('image') || keys.has('image_url') || keys.has('use_url')) {
    response.image = item.image || '';
  }
  if (keys.has('image_url')) {
    response.image_url = String(payload.image_url || '');
  }
  if (keys.has('use_url')) {
    response.use_url = payload.use_url === true || payload.use_url === 1 || payload.use_url === '1' || payload.use_url === 'true';
  }
  if (keys.has('active')) {
    response.active = item.active !== false;
  }
  if (keys.has('title')) {
    response.title = item.title || '';
  }
  if (keys.has('link_type')) {
    response.link_type = item.link_type || 'external_link';
  }
  if (keys.has('external_link')) {
    response.external_link = item.external_link || '';
  }
  if (keys.has('deep_link')) {
    response.deep_link = item.deep_link || '';
  }
  if (keys.has('redirect_url') || keys.has('target_route_url')) {
    response.redirect_url = item.redirect_url || item.external_link || item.deep_link || '';
  }

  return response;
};

const ensureServiceLocationExists = async (serviceLocationId) => {
  const location = await ServiceLocation.findById(toObjectIdOrThrow(serviceLocationId, 'service location id')).lean();
  if (!location) {
    throw new ApiError(404, 'Service location not found');
  }
  return location;
};

const normalizeServiceLocationIds = async (payload, existing = null) => {
  const payloadIds = Array.isArray(payload.service_location_ids)
    ? payload.service_location_ids
    : Array.isArray(payload.serviceLocationIds)
      ? payload.serviceLocationIds
      : null;
  const fallbackIds = Array.isArray(existing?.service_location_ids) && existing.service_location_ids.length > 0
    ? existing.service_location_ids
    : existing?.service_location_id
      ? [existing.service_location_id]
      : [];
  const rawIds = payloadIds ?? (payload.service_location_id ? [payload.service_location_id] : fallbackIds);
  const normalizedIds = [...new Set(rawIds.map((value) => String(value || '').trim()).filter(Boolean))];

  if (normalizedIds.length === 0) {
    throw new ApiError(400, 'At least one service location is required');
  }

  const serviceLocations = await Promise.all(normalizedIds.map((serviceLocationId) => ensureServiceLocationExists(serviceLocationId)));

  return {
    service_location_id: serviceLocations[0]._id,
    service_location_name: serviceLocations[0].service_location_name || serviceLocations[0].name || '',
    service_location_ids: serviceLocations.map((location) => location._id),
    service_location_names: serviceLocations.map((location) => location.service_location_name || location.name || ''),
  };
};

const ensurePromoCodeUnique = async (code, ignoreId = null) => {
  const query = { code: String(code).trim().toUpperCase() };
  if (ignoreId) {
    query._id = { $ne: ignoreId };
  }

  const existing = await PromoCode.findOne(query).lean();
  if (existing) {
    throw new ApiError(409, 'Promo code already exists');
  }
};

const normalizePromoPayload = async (payload, existing = null) => {
  const serviceLocationData = await normalizeServiceLocationIds(payload, existing);
  const state = await ensureAdminState();
  const userSpecific = normalizeBoolean(payload.user_specific, existing?.user_specific ?? false);
  const userId = normalizeText(payload.user_id ?? existing?.user_id);
  const realUser = userId
    ? await User.findById(toObjectIdOrThrow(userId, 'user id')).select('_id name phone').lean()
    : null;
  const legacyUser = !realUser && userId
    ? state.users.find((item) => String(item._id) === String(userId))
    : null;
  const user = realUser || legacyUser;

  if (userSpecific && (payload.user_id !== undefined || !existing || existing?.user_specific !== true)) {
    if (!userId) {
      throw new ApiError(400, 'User is required');
    }

    if (!user) {
      throw new ApiError(404, 'User not found');
    }
  }

  const code = normalizeText(payload.code ?? existing?.code).toUpperCase();
  if (!code) {
    throw new ApiError(400, 'Promo code is required');
  }

  const transportType = normalizeTransportType(payload.transport_type ?? existing?.transport_type ?? 'all');
  if (!PROMO_TRANSPORT_TYPES.includes(transportType)) {
    throw new ApiError(400, 'Transport type must be one of taxi, delivery, pooling, bus, self_drive, or all');
  }

  const minimumTripAmount = parseNumber(payload.minimum_trip_amount ?? existing?.minimum_trip_amount, 0);
  const maximumDiscountAmount = parseNumber(payload.maximum_discount_amount ?? existing?.maximum_discount_amount, 0);
  const cumulativeMaxDiscountAmount = parseNumber(
    payload.cumulative_max_discount_amount ?? existing?.cumulative_max_discount_amount,
    0,
  );
  const discountPercentage = parseNumber(payload.discount_percentage ?? existing?.discount_percentage, 0);
  const usesPerUser = Math.max(1, Math.floor(parseNumber(payload.uses_per_user ?? existing?.uses_per_user, 1)));
  const maxUsesTotal = Math.max(0, Math.floor(parseNumber(payload.max_uses_total ?? existing?.max_uses_total, 0)));
  const fromDate = normalizeDate(payload.from ?? payload.from_date ?? existing?.from_date, 'From date');
  const toDate = normalizeEndOfDay(payload.to ?? payload.to_date ?? existing?.to_date, 'To date');

  if (minimumTripAmount < 0) {
    throw new ApiError(400, 'Minimum trip amount must be greater than or equal to 0');
  }
  if (maximumDiscountAmount < 0) {
    throw new ApiError(400, 'Maximum discount amount must be greater than or equal to 0');
  }
  if (cumulativeMaxDiscountAmount < 0) {
    throw new ApiError(400, 'Cumulative maximum discount amount must be greater than or equal to 0');
  }
  if (discountPercentage < 0 || discountPercentage > 100) {
    throw new ApiError(400, 'Discount percentage must be between 0 and 100');
  }

  if (fromDate > toDate) {
    throw new ApiError(400, 'From date must be earlier than or equal to To date');
  }

  return {
    ...serviceLocationData,
    user_id: userSpecific ? user?._id || userId : '',
    user_name: userSpecific ? user?.name || '' : '',
    user_specific: userSpecific,
    transport_type: transportType,
    code,
    minimum_trip_amount: minimumTripAmount,
    maximum_discount_amount: maximumDiscountAmount,
    cumulative_max_discount_amount: cumulativeMaxDiscountAmount,
    discount_percentage: discountPercentage,
    from_date: fromDate,
    to_date: toDate,
    uses_per_user: usesPerUser,
    max_uses_total: maxUsesTotal,
    active: normalizeBoolean(payload.active, existing?.active ?? true),
  };
};

const normalizeNotificationPayload = async (payload, existing = null) => {
  const serviceLocationId = payload.service_location_id || existing?.service_location_id;
  if (!serviceLocationId) {
    throw new ApiError(400, 'Service location is required');
  }

  const serviceLocation = await ensureServiceLocationExists(serviceLocationId);
  const sendTo = normalizeText(payload.send_to ?? existing?.send_to ?? 'all');
  if (!['all', 'drivers', 'users'].includes(sendTo)) {
    throw new ApiError(400, 'Send to must be all, drivers, or users');
  }

  const pushTitle = normalizeText(payload.push_title ?? payload.title ?? existing?.push_title);
  const message = normalizeText(payload.message ?? existing?.message);
  let image = normalizeText(payload.image ?? existing?.image);

  if (!pushTitle) {
    throw new ApiError(400, 'Push title is required');
  }
  if (!message) {
    throw new ApiError(400, 'Message is required');
  }

  // If image is a data URL (base64), upload it to Cloudinary
  if (image.startsWith('data:')) {
    try {
      const uploaded = await uploadDataUrlToCloudinary({
        dataUrl: image,
        publicIdPrefix: 'notification',
      });
      image = uploaded.secureUrl;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      // We don't throw here to allow sending notification even if image upload fails?
      // Actually, it's better to throw so the user knows why it failed.
      throw new ApiError(500, `Failed to upload notification image: ${error.message}`);
    }
  }

  return {
    service_location_id: serviceLocation._id,
    service_location_name: serviceLocation.service_location_name || serviceLocation.name || '',
    send_to: sendTo,
    push_title: pushTitle,
    message,
    image,
    status: 'sent',
    sent_at: new Date(),
  };
};

const normalizeBannerPayload = async (payload, existing = null) => {
  const generatedTitle = `Banner ${new Date().toISOString()}`;
  const title = normalizeText(payload.title ?? existing?.title ?? generatedTitle);
  let image = normalizeText(payload.image ?? payload.image_url ?? existing?.image);
  const rawLinkType = normalizeText(payload.link_type ?? payload.redirect_type ?? existing?.link_type ?? 'external_link');
  const linkType = rawLinkType === 'app_route' ? 'deep_link' : rawLinkType;
  const redirectUrl = normalizeText(
    payload.redirect_url ?? payload.external_link ?? payload.deep_link ?? payload.target_route_url ?? existing?.redirect_url,
  );
  const active = normalizeBoolean(payload.active ?? payload.status, existing?.active ?? true);
  if (!image) {
    throw new ApiError(400, 'Banner image is required');
  }

  // If image is a data URL (base64), upload it to Cloudinary
  if (image.startsWith('data:')) {
    try {
      const uploaded = await uploadDataUrlToCloudinary({
        dataUrl: image,
        publicIdPrefix: 'banner',
      });
      image = uploaded.secureUrl;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new ApiError(500, `Failed to upload banner image: ${error.message}`);
    }
  }

  if (!['external_link', 'deep_link'].includes(linkType)) {
    throw new ApiError(400, 'Link type must be external_link or deep_link');
  }

  return {
    title,
    image,
    link_type: linkType,
    external_link: linkType === 'external_link' ? redirectUrl : '',
    deep_link: linkType === 'deep_link' ? redirectUrl : '',
    redirect_url: redirectUrl,
    active,
  };
};

export const listPromoCodes = async ({ page = 1, limit = 50, search, service_location_id, transport_type, active }) => {
  const query = {};

  if (search) {
    const safeSearch = normalizeText(search);
    query.code = { $regex: safeSearch, $options: 'i' };
  }

  if (service_location_id) {
    const serviceLocationObjectId = toObjectIdOrThrow(service_location_id, 'service location id');
    query.$or = [
      { service_location_id: serviceLocationObjectId },
      { service_location_ids: serviceLocationObjectId },
    ];
  }

  if (transport_type) {
    query.transport_type = normalizeTransportType(transport_type);
  }

  if (active !== undefined) {
    query.active = normalizeBoolean(active);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    PromoCode.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    PromoCode.countDocuments(query),
  ]);

  return {
    results: items.map(serializePromoCode),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const createPromoCode = async (payload) => {
  const normalizedPayload = await normalizePromoPayload(payload);
  await ensurePromoCodeUnique(normalizedPayload.code);

  const promo = await PromoCode.create({
    ...normalizedPayload,
  });

  return serializePromoCode(promo.toObject());
};

export const updatePromoCode = async (id, payload) => {
  const promo = await PromoCode.findById(toObjectIdOrThrow(id, 'promo code id'));
  if (!promo) {
    throw new ApiError(404, 'Promo code not found');
  }

  const nextPayload = await normalizePromoPayload(payload, promo.toObject());
  if (nextPayload.code !== promo.code) {
    await ensurePromoCodeUnique(nextPayload.code, promo._id);
  }

  Object.assign(promo, nextPayload);
  await promo.save();
  return serializePromoCode(promo.toObject());
};

export const deletePromoCode = async (id) => {
  const deleted = await PromoCode.findByIdAndDelete(toObjectIdOrThrow(id, 'promo code id'));
  if (!deleted) {
    throw new ApiError(404, 'Promo code not found');
  }
  return true;
};

export const togglePromoCodeStatus = async (id) => {
  const promo = await PromoCode.findById(toObjectIdOrThrow(id, 'promo code id'));
  if (!promo) {
    throw new ApiError(404, 'Promo code not found');
  }
  promo.active = !promo.active;
  await promo.save();
  return serializePromoCode(promo.toObject());
};

export const listNotifications = async ({ page = 1, limit = 50, send_to, service_location_id }) => {
  const query = {};

  if (send_to) {
    query.send_to = normalizeText(send_to);
  }

  if (service_location_id) {
    query.service_location_id = toObjectIdOrThrow(service_location_id, 'service location id');
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Notification.countDocuments(query),
  ]);

  return {
    results: items.map(serializeNotification),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const createNotification = async (payload) => {
  const normalizedPayload = await normalizeNotificationPayload(payload);
  const notification = await Notification.create(normalizedPayload);
  const serializedNotification = serializeNotification(notification.toObject());
  const delivery = await sendPushNotificationToAudience({
    notificationId: notification._id,
    serviceLocationId: notification.service_location_id,
    sendTo: notification.send_to,
    title: notification.push_title,
    body: notification.message,
    image: notification.image,
  });

  return {
    notification: serializedNotification,
    delivery,
    message: delivery.attempted
      ? 'Notification sent and push delivery attempted'
      : 'Notification created but push delivery is not configured',
  };
};

export const deleteNotification = async (id) => {
  const deleted = await Notification.findByIdAndDelete(toObjectIdOrThrow(id, 'notification id'));
  if (!deleted) {
    throw new ApiError(404, 'Notification not found');
  }
  return true;
};

export const listBanners = async ({ page = 1, limit = 50, active }) => {
  const query = {};
  if (active !== undefined) {
    query.active = normalizeBoolean(active);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    Banner.find(query).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Banner.countDocuments(query),
  ]);

  return {
    results: items.map(serializeBannerMinimal),
    paginator: {
      current_page: safePage,
      per_page: safeLimit,
      total,
      last_page: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
};

export const createBanner = async (payload) => {
  const normalizedPayload = await normalizeBannerPayload(payload);
  const banner = await Banner.create(normalizedPayload);
  return serializeBannerFromPayload(banner.toObject(), payload);
};

export const updateBanner = async (id, payload) => {
  const banner = await Banner.findById(toObjectIdOrThrow(id, 'banner id'));
  if (!banner) {
    throw new ApiError(404, 'Banner not found');
  }

  const nextPayload = await normalizeBannerPayload(payload, banner.toObject());
  Object.assign(banner, nextPayload);
  await banner.save();
  return serializeBanner(banner.toObject());
};

export const deleteBanner = async (id) => {
  const deleted = await Banner.findByIdAndDelete(toObjectIdOrThrow(id, 'banner id'));
  if (!deleted) {
    throw new ApiError(404, 'Banner not found');
  }
  return true;
};

export const pushBanner = async (id) => {
  const banner = await Banner.findById(toObjectIdOrThrow(id, 'banner id'));
  if (!banner) {
    throw new ApiError(404, 'Banner not found');
  }

  banner.push_count = Number(banner.push_count || 0) + 1;
  banner.last_pushed_at = new Date();
  await banner.save();

  return {
    message: 'Push notification triggered successfully',
    banner: serializeBanner(banner.toObject()),
  };
};

export const getPromotionsBootstrap = async () => {
  const [promos, notifications, banners, serviceLocations, users] = await Promise.all([
    listPromoCodes({ page: 1, limit: 50 }),
    listNotifications({ page: 1, limit: 50 }),
    listBanners({ page: 1, limit: 50 }),
    ServiceLocation.find().sort({ createdAt: -1 }).lean(),
    listAdminUsersForPromotions(),
  ]);

  return {
    users,
    service_locations: serviceLocations.map(serializeServiceLocation),
    promo_codes: promos.results,
    notifications: notifications.results,
    banners: banners.results,
    meta: {
      promo_codes: promos.paginator,
      notifications: notifications.paginator,
      banners: banners.paginator,
    },
  };
};

export const listServiceLocationsForPromotions = async () => {
  const items = await ServiceLocation.find().sort({ createdAt: -1 }).lean();
  return items.map(serializeServiceLocation);
};

export const listAdminUsersForPromotions = async () => {
  const users = await User.find()
    .sort({ createdAt: -1 })
    .select('name phone createdAt updatedAt')
    .lean();

  return users.map((user) => ({
    _id: user._id,
    name: user.name || '',
    phone: user.phone || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
};
