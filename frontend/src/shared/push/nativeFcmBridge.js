import { saveDriverFcmToken, getLocalDriverToken } from '../../modules/driver/services/registrationService';
import { userAuthService, getLocalUserToken } from '../../modules/user/services/authService';

const PENDING_NATIVE_FCM_KEY = 'pendingNativeFcmRegistration';
const LAST_NATIVE_FCM_KEY = 'lastNativeFcmRegistration';
const LAST_NATIVE_FCM_DEBUG_KEY = 'lastNativeFcmDebugState';
const NATIVE_FCM_GLOBAL_KEYS = [
  '__nativeFcmToken',
  '__Appzeto 24NativeFcmToken',
  '__fcmToken',
  'nativeFcmToken',
  'fcmToken',
  '__firebaseToken',
  'firebaseToken',
];
const DRIVER_PORTAL_ROLES = new Set([
  'driver',
  'owner',
  'pooling_driver',
  'bus_driver',
  'service_center',
  'service_center_staff',
]);

const decodeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
};

const getTokenPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(atob(decodeBase64Url(payload)));
    if (decoded && typeof decoded.exp === 'number') {
      const isExpired = Date.now() / 1000 >= decoded.exp;
      if (isExpired) {
        return null;
      }
    }
    return decoded;
  } catch {
    return null;
  }
};

const inferRole = (explicitRole) => {
  const normalizedRole = String(explicitRole || '').trim().toLowerCase();

  if (normalizedRole === 'user' || DRIVER_PORTAL_ROLES.has(normalizedRole)) {
    return normalizedRole;
  }

  const pathname = String(window.location.pathname || '').toLowerCase();
  if (pathname.includes('/taxi/owner')) {
    return 'owner';
  }
  if (pathname.includes('/taxi/driver')) {
    return 'driver';
  }
  if (pathname.includes('/taxi/user')) {
    return 'user';
  }

  const storedCandidates = [
    sessionStorage.getItem('driverToken'),
    sessionStorage.getItem('token'),
    localStorage.getItem('driverToken'),
    localStorage.getItem('userToken'),
    localStorage.getItem('token'),
  ].filter(Boolean);

  const tokenRole = storedCandidates
    .map((token) => getTokenPayload(token)?.role)
    .find((role) => role === 'user' || DRIVER_PORTAL_ROLES.has(String(role || '').toLowerCase()));

  return String(tokenRole || '').toLowerCase();
};

const getActivePortalRole = () => {
  const pathname = String(window.location.pathname || '').toLowerCase();

  if (pathname.includes('/taxi/owner')) {
    return 'owner';
  }
  if (pathname.includes('/taxi/driver') || pathname.includes('/driver')) {
    return 'driver';
  }
  if (pathname.includes('/taxi/user') || pathname.includes('/user')) {
    return 'user';
  }

  return '';
};

const hasRoleSession = (role) => {
  if (DRIVER_PORTAL_ROLES.has(String(role || '').toLowerCase())) {
    return Boolean(getLocalDriverToken());
  }

  if (role === 'user') {
    return Boolean(getLocalUserToken());
  }

  return false;
};

const persistLastRegistration = (payload) => {
  localStorage.setItem(LAST_NATIVE_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const savePendingRegistration = (payload) => {
  localStorage.setItem(PENDING_NATIVE_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const readPendingRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_NATIVE_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const clearPendingRegistration = () => {
  localStorage.removeItem(PENDING_NATIVE_FCM_KEY);
};

const persistDebugState = (payload) => {
  try {
    localStorage.setItem(LAST_NATIVE_FCM_DEBUG_KEY, JSON.stringify({
      ...payload,
      updatedAt: new Date().toISOString(),
    }));
  } catch { }
};

const normalizeBridgePayload = (payload = {}, fallbackPlatform = 'android') => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) {
      return null;
    }

    if (trimmedPayload.startsWith('{') || trimmedPayload.startsWith('[')) {
      try {
        return normalizeBridgePayload(JSON.parse(trimmedPayload), fallbackPlatform);
      } catch {
        // Fall through and treat the raw string as the token itself.
      }
    }

    return {
      token: trimmedPayload,
      role: '',
      platform: fallbackPlatform,
    };
  }

  if (typeof payload !== 'object') {
    return null;
  }

  const nestedPayload =
    payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload.detail && typeof payload.detail === 'object'
        ? payload.detail
        : payload;

  const token = String(
    nestedPayload.token ||
    nestedPayload.fcmToken ||
    nestedPayload.fcm_token ||
    nestedPayload.registrationToken ||
    nestedPayload.nativeFcmToken ||
    nestedPayload.deviceToken ||
    nestedPayload.firebaseToken ||
    nestedPayload.fcm ||
    nestedPayload.value ||
    '',
  ).trim();

  if (!token) {
    return null;
  }

  return {
    token,
    role: String(
      nestedPayload.role ||
      nestedPayload.userRole ||
      nestedPayload.accountRole ||
      nestedPayload.portalRole ||
      nestedPayload.accountType ||
      '',
    ).trim(),
    platform: String(
      nestedPayload.platform ||
      nestedPayload.devicePlatform ||
      nestedPayload.sourcePlatform ||
      fallbackPlatform ||
      'android',
    ).trim() || 'android',
  };
};

const readQueuedGlobalPayloads = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  return NATIVE_FCM_GLOBAL_KEYS
    .map((key) => normalizeBridgePayload(window[key]))
    .filter(Boolean);
};

const submitFcmToken = async ({ token, role, platform = 'mobile' }) => {
  const inferredRole = inferRole(role);
  const activePortalRole = getActivePortalRole();
  const normalizedRole =
    activePortalRole === 'user'
      ? 'user'
      : activePortalRole === 'owner'
        ? 'owner'
        : activePortalRole === 'driver'
          ? 'driver'
          : inferredRole;
  const normalizedPlatform = String(platform || 'mobile').trim().toLowerCase() || 'mobile';
  const normalizedToken = String(token || '').trim();

  if (!normalizedToken) {
    persistDebugState({ ok: false, reason: 'missing-token', role: normalizedRole, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-token' };
  }

  if (!normalizedRole) {
    savePendingRegistration({ token: normalizedToken, role: '', platform: normalizedPlatform });
    persistDebugState({ ok: false, reason: 'missing-role', role: '', platform: normalizedPlatform });
    return { ok: false, reason: 'missing-role' };
  }

  if (!hasRoleSession(normalizedRole)) {
    savePendingRegistration({ token: normalizedToken, role: normalizedRole, platform: normalizedPlatform });
    persistDebugState({ ok: false, reason: 'missing-auth', role: normalizedRole, platform: normalizedPlatform });
    return { ok: false, reason: 'missing-auth' };
  }

  if (DRIVER_PORTAL_ROLES.has(normalizedRole)) {
    await saveDriverFcmToken(normalizedToken, normalizedPlatform);
  } else {
    await userAuthService.saveFcmToken(normalizedToken, normalizedPlatform);
  }

  clearPendingRegistration();
  persistLastRegistration({
    token: normalizedToken,
    role: normalizedRole,
    platform: normalizedPlatform,
  });
  persistDebugState({ ok: true, reason: 'saved', role: normalizedRole, platform: normalizedPlatform });

  return { ok: true, role: normalizedRole, platform: normalizedPlatform };
};

const flushPendingRegistration = async () => {
  const pending = readPendingRegistration();

  if (!pending?.token) {
    return { ok: false, reason: 'no-pending-token' };
  }

  try {
    return await submitFcmToken(pending);
  } catch (error) {
    console.warn('[native-fcm-bridge] pending registration failed', error?.message || error);
    return { ok: false, reason: 'submit-failed' };
  }
};

export const installNativeFcmBridge = () => {
  const processQueuedCalls = async (queuedCalls = []) => {
    for (const queuedCall of queuedCalls) {
      const normalizedCall = normalizeBridgePayload(queuedCall);
      if (!normalizedCall) {
        continue;
      }

      try {
        await submitFcmToken(normalizedCall);
      } catch (error) {
        savePendingRegistration({
          token: normalizedCall.token,
          role: inferRole(normalizedCall.role),
          platform: normalizedCall.platform || 'android',
        });
      }
    }
  };

  const drainQueuedCalls = async () => {
    const queuedCalls = Array.isArray(window.__pendingNativeFcmCalls)
      ? [...window.__pendingNativeFcmCalls]
      : [];

    window.__pendingNativeFcmCalls = [];

    await processQueuedCalls(queuedCalls);

    const globalPayloads = readQueuedGlobalPayloads();
    await processQueuedCalls(globalPayloads);
  };

  const queueNativePayload = (payload) => {
    const normalizedPayload = normalizeBridgePayload(payload);
    if (!normalizedPayload) {
      persistDebugState({ ok: false, reason: 'invalid-native-payload' });
      return null;
    }

    window.__pendingNativeFcmCalls = Array.isArray(window.__pendingNativeFcmCalls)
      ? window.__pendingNativeFcmCalls
      : [];

    window.__pendingNativeFcmCalls.push(normalizedPayload);
    return normalizedPayload;
  };

  const handleNativeFcmToken = async (tokenOrPayload, role, platform = 'android') => {
    const normalizedPayload = normalizeBridgePayload(
      typeof tokenOrPayload === 'object' && tokenOrPayload !== null
        ? tokenOrPayload
        : { token: tokenOrPayload, role, platform },
      platform || 'android',
    );

    if (!normalizedPayload) {
      persistDebugState({ ok: false, reason: 'invalid-native-payload' });
      return { ok: false, reason: 'invalid-native-payload' };
    }

    try {
      const result = await submitFcmToken(normalizedPayload);
      console.info('[native-fcm-bridge] token registration result', result);
      return result;
    } catch (error) {
      console.error('[native-fcm-bridge] token registration error', error);
      savePendingRegistration({
        token: normalizedPayload.token,
        role: inferRole(normalizedPayload.role),
        platform: normalizedPayload.platform || 'android',
      });
      persistDebugState({
        ok: false,
        reason: error?.message || 'unknown-error',
        role: inferRole(normalizedPayload.role),
        platform: String(normalizedPayload.platform || 'android').trim().toLowerCase() || 'android',
      });
      return { ok: false, reason: error?.message || 'unknown-error' };
    }
  };

  window.__saveNativeFcmToken = handleNativeFcmToken;
  window.__setNativeFcmToken = handleNativeFcmToken;
  window.setNativeFcmToken = handleNativeFcmToken;
  window.onNativeFcmToken = handleNativeFcmToken;
  window.onFcmTokenReceived = handleNativeFcmToken;
  window.saveFcmToken = handleNativeFcmToken;
  window.setFcmToken = handleNativeFcmToken;

  window.__flushNativeFcmToken = async () => {
    const result = await flushPendingRegistration();
    console.info('[native-fcm-bridge] flush result', result);
    return result;
  };

  window.__getNativeFcmDebugState = () => {
    try {
      return JSON.parse(localStorage.getItem(LAST_NATIVE_FCM_DEBUG_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const retryPending = () => {
    flushPendingRegistration().catch(() => { });
  };

  const handleMessageEvent = (event) => {
    try {
      const rawData = event?.data;
      const normalizedPayload = normalizeBridgePayload(rawData);

      if (!normalizedPayload) {
        return;
      }

      if (queueNativePayload(normalizedPayload)) {
        retryPending();
      }
    } catch { }
  };

  window.addEventListener('focus', retryPending);
  window.addEventListener('pageshow', retryPending);
  window.addEventListener('app:auth-ready', retryPending);
  window.addEventListener('message', handleMessageEvent);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      retryPending();
    }
  });

  drainQueuedCalls().catch(() => { });
  window.setTimeout(retryPending, 1500);
  window.setInterval(retryPending, 15000);
};
