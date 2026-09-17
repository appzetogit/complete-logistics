import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { getLocalDriverToken, saveDriverFcmToken } from '../../modules/driver/services/registrationService';
import { getLocalUserToken, userAuthService } from '../../modules/user/services/authService';

const LAST_BROWSER_FCM_KEY = 'lastBrowserFcmRegistration';
const FIREBASE_CONFIG = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};
const VAPID_KEY = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();

let messagingSupportPromise = null;

const hasFirebaseConfig = () =>
  Object.values(FIREBASE_CONFIG).every((value) => String(value || '').trim());

const hasBrowserSupport = () =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof Notification !== 'undefined';

const isNativeContainer = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  // Primary flag set by main.jsx WebView detection.
  if (window.__isAppzeto24WebView) {
    return true;
  }

  // Fallback: detect Flutter / native bridge globals independently in case
  // main.jsx detection missed this WebView variant.
  if (
    typeof window.flutter_inappwebview !== 'undefined' ||
    typeof window.Flutter !== 'undefined' ||
    typeof window.__Appzeto24_native !== 'undefined' ||
      typeof window.AndroidBridge !== 'undefined' ||
      typeof window.Android !== 'undefined'
  ) {
  window.__isAppzeto24WebView = true;
  return true;
}

return false;
};

const getPushPlatform = () => {
  if (typeof navigator !== 'undefined') {
    const ua = String(navigator.userAgent || '');
    // When inside a mobile WebView or mobile browser, the token should be
    // registered as 'mobile' so the backend stores it in fcmTokenMobile.
    if (/Android|iPhone|iPad|iPod/i.test(ua) && isNativeContainer()) {
      return 'mobile';
    }
  }
  return 'web';
};

const getRoleFromPathname = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const pathname = String(window.location.pathname || '').toLowerCase();

  if (pathname.includes('/taxi/owner')) {
    return 'driver';
  }

  if (pathname.includes('/taxi/driver') || pathname.includes('/driver')) {
    return 'driver';
  }

  if (pathname.includes('/taxi/user') || pathname.includes('/user')) {
    return 'user';
  }

  return '';
};

const getStoredRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(LAST_BROWSER_FCM_KEY) || 'null');
  } catch {
    return null;
  }
};

const persistRegistration = (payload) => {
  localStorage.setItem(LAST_BROWSER_FCM_KEY, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
};

const getFirebaseApp = () => {
  if (!hasFirebaseConfig()) {
    return null;
  }

  return getApps()[0] || initializeApp(FIREBASE_CONFIG);
};

const getMessagingSupport = async () => {
  if (!messagingSupportPromise) {
    messagingSupportPromise = isSupported().catch(() => false);
  }

  return messagingSupportPromise;
};

const getAuthenticatedRoles = () => {
  const preferredRole = getRoleFromPathname();

  if (preferredRole === 'user') {
    return getLocalUserToken() ? ['user'] : [];
  }

  if (preferredRole === 'driver') {
    return getLocalDriverToken() ? ['driver'] : [];
  }

  const roles = [];

  if (getLocalUserToken()) {
    roles.push('user');
  }

  if (getLocalDriverToken()) {
    roles.push('driver');
  }

  return roles;
};

const createServiceWorkerUrl = () => {
  const params = new URLSearchParams({
    apiKey: FIREBASE_CONFIG.apiKey,
    authDomain: FIREBASE_CONFIG.authDomain,
    projectId: FIREBASE_CONFIG.projectId,
    storageBucket: FIREBASE_CONFIG.storageBucket,
    messagingSenderId: FIREBASE_CONFIG.messagingSenderId,
    appId: FIREBASE_CONFIG.appId,
  });

  return `/firebase-messaging-sw.js?${params.toString()}`;
};

const saveTokenForRole = async (role, token) => {
  const platform = getPushPlatform();
  const saveFn = role === 'driver' ? saveDriverFcmToken : (t, p) => userAuthService.saveFcmToken(t, p);

  // Save to the primary platform field.
  await saveFn(token, platform);

  // When inside a WebView, the primary platform is 'mobile' (fcmTokenMobile).
  // Also save to 'web' (fcmTokenWeb) so both fields have a valid token and
  // push notifications can be delivered through either channel.
  if (platform === 'mobile') {
    await saveFn(token, 'web').catch(() => { });
  }
};

const shouldSkipRegistration = (role, token, platform) => {
  const stored = getStoredRegistration();
  return stored?.role === role && stored?.token === token && stored?.platform === platform;
};

const registerBrowserFcmToken = async ({ interactive = false } = {}) => {
  if (!hasBrowserSupport()) {
    return { ok: false, reason: 'browser-unsupported' };
  }

  // NOTE: We intentionally do NOT bail when isNativeContainer() is true.
  // The Flutter WebView APK does not reliably send the native FCM token via
  // the JS bridge or a direct API call, so we let the browser FCM SDK run
  // inside the WebView as well. getPushPlatform() returns 'mobile' when in
  // a WebView, so the token is saved to fcmTokenMobile. If Flutter later
  // sends a native token through the bridge, it will overwrite this value.

  if (!hasFirebaseConfig() || !VAPID_KEY) {
    return { ok: false, reason: 'firebase-web-config-missing' };
  }

  const roles = getAuthenticatedRoles();
  if (roles.length === 0) {
    return { ok: false, reason: 'missing-auth' };
  }

  const supported = await getMessagingSupport();
  if (!supported) {
    return { ok: false, reason: 'messaging-unsupported' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'permission-denied' };
  }

  if (Notification.permission !== 'granted') {
    if (!interactive) {
      return { ok: false, reason: 'permission-not-granted' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission-not-granted' };
    }
  }

  const app = getFirebaseApp();
  if (!app) {
    return { ok: false, reason: 'firebase-app-missing' };
  }

  const serviceWorkerRegistration = await navigator.serviceWorker.register(createServiceWorkerUrl());
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration,
  });

  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }

  const platform = getPushPlatform();
  const rolesToSave = roles.filter((role) => !shouldSkipRegistration(role, token, platform));
  await Promise.all(rolesToSave.map((role) => saveTokenForRole(role, token)));

  roles.forEach((role) => {
    persistRegistration({ role, token, platform });
  });

  return {
    ok: true,
    token,
    platform,
    roles,
    skippedRoles: roles.filter((role) => !rolesToSave.includes(role)),
  };
};

export const installBrowserFcmRegistration = () => {
  window.__registerBrowserFcmToken = (options) => registerBrowserFcmToken(options);

  const retryPassiveRegistration = () => {
    registerBrowserFcmToken({ interactive: false }).catch(() => { });
  };

  window.addEventListener('focus', retryPassiveRegistration);
  window.addEventListener('pageshow', retryPassiveRegistration);
  window.addEventListener('app:auth-ready', retryPassiveRegistration);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      retryPassiveRegistration();
    }
  });

  window.setTimeout(retryPassiveRegistration, 2000);
};
