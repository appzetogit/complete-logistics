import { ApiError } from '../../../utils/ApiError.js';

const MOBILE_PLATFORMS = new Set(['android', 'ios', 'mobile']);
const WEB_PLATFORMS = new Set(['web', 'browser', 'pwa']);

export const normalizePushPlatform = (platform) => {
  const normalized = String(platform || '').trim().toLowerCase();

  if (WEB_PLATFORMS.has(normalized)) {
    return 'web';
  }

  if (MOBILE_PLATFORMS.has(normalized)) {
    return 'mobile';
  }

  throw new ApiError(400, 'platform must be web, android, ios, or mobile');
};

export const normalizePushToken = (token) => {
  const normalized = String(token || '').trim();

  if (!normalized) {
    throw new ApiError(400, 'token is required');
  }

  if (normalized.length < 20) {
    throw new ApiError(400, 'token looks invalid');
  }

  return normalized;
};

export const getPushTokenField = (platform) =>
  normalizePushPlatform(platform) === 'web' ? 'fcmTokenWeb' : 'fcmTokenMobile';

export const assignPushTokenToEntity = (entity, { token, platform }) => {
  const normalizedToken = normalizePushToken(token);
  const normalizedPlatform = normalizePushPlatform(platform);
  const fieldName = getPushTokenField(normalizedPlatform);

  entity[fieldName] = normalizedToken;
  entity.set?.('fcmTokens', undefined, { strict: false });

  return {
    token: normalizedToken,
    platform: normalizedPlatform,
    fieldName,
  };
};

export const listEntityPushTokens = (entity = {}, role = 'unknown') => {
  const mobileToken = String(entity.fcmTokenMobile || '').trim();
  const webToken = String(entity.fcmTokenWeb || '').trim();

  // Prioritize mobile token to prevent double notifications on the same device
  // (e.g. in hybrid/webview wrappers where the same device registers both web & mobile FCM tokens).
  if (mobileToken) {
    return [{ role, field: 'fcmTokenMobile', platform: 'mobile', token: mobileToken }];
  }

  if (webToken) {
    return [{ role, field: 'fcmTokenWeb', platform: 'web', token: webToken }];
  }

  return [];
};
