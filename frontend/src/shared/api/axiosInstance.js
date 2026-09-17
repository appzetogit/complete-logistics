import axios from 'axios';
import { API_BASE_URL } from './runtimeConfig';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const compatibleResponseCache = new WeakMap();

const isCompatibleResponseCandidate = (value) => {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return false;
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return false;
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return false;
  }

  if (value instanceof Date) {
    return false;
  }

  return Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]';
};

const createCompatibleResponseView = (payload) => {
  if (!isCompatibleResponseCandidate(payload)) {
    return payload;
  }

  if (compatibleResponseCache.has(payload)) {
    return compatibleResponseCache.get(payload);
  }

  const proxy = new Proxy(payload, {
    get(target, prop, receiver) {
      if (prop === '__raw') {
        return target;
      }

      if (prop === 'data') {
        const nestedData = target?.data;
        if (nestedData === undefined || nestedData === target) {
          return receiver;
        }
        return createCompatibleResponseView(nestedData);
      }

      const directValue = Reflect.get(target, prop, receiver);
      if (directValue !== undefined) {
        return createCompatibleResponseView(directValue);
      }

      const nestedData = target?.data;
      if (nestedData && (Array.isArray(nestedData) || Object.prototype.toString.call(nestedData) === '[object Object]')) {
        if (prop in nestedData) {
          return createCompatibleResponseView(nestedData[prop]);
        }

        if (prop === 'results' && Array.isArray(nestedData)) {
          return createCompatibleResponseView(nestedData);
        }
      }

      return undefined;
    },
    has(target, prop) {
      if (prop in target) {
        return true;
      }

      const nestedData = target?.data;
      return Boolean(
        nestedData &&
        (Array.isArray(nestedData) || Object.prototype.toString.call(nestedData) === '[object Object]') &&
        prop in nestedData
      );
    },
  });

  compatibleResponseCache.set(payload, proxy);
  return proxy;
};

const DEDUPED_GET_TTL_MS = 2500;
const dedupedGetRequests = new Map();
const recentDedupedGetResponses = new Map();

const isDedupedGet = (url = '') => {
  const requestPath = String(url || '').split('?')[0];

  return /^\/users\/me$/.test(requestPath) ||
    /^\/drivers\/me$/.test(requestPath) ||
    /^\/rides\/active\/me$/.test(requestPath) ||
    /^\/deliveries\/active\/me$/.test(requestPath) ||
    /^\/admin\/general-settings\/[^/]+$/.test(requestPath) ||
    /^\/common\/payment-gateway$/.test(requestPath) ||
    /^\/admin\/(countries|service-locations|notification-channels)$/.test(requestPath) ||
    /^\/(countries|common\/ride_modules)$/.test(requestPath);
};

const getDedupedRequestKey = (url = '', config = {}) => {
  const params = config?.params ? JSON.stringify(config.params) : '';
  // Resolve the same auth token that the request interceptor will attach so
  // user-specific GETs never share cache entries across auth states.
  const auth = resolveAuthTokenForRequest({ ...config, url }) || '';
  return `${String(url || '')}|${params}|${auth}`;
};

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

const normalizeAuthRole = (role) => {
  const value = String(role || '').toLowerCase();
  if (value === 'super-admin') {
    return 'admin';
  }
  return value;
};

const DRIVER_PORTAL_ROLES = new Set([
  'driver',
  'owner',
  'pooling_driver',
  'bus_driver',
  'service_center',
  'service_center_staff',
]);

const getSessionItem = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const getStoredTokenByRole = (role) => {
  const normalizedRole = normalizeAuthRole(role);

  // For driver/owner roles we probe both sessionStorage AND localStorage so
  // that after a Flutter WebView hard-refresh (which wipes sessionStorage) we
  // can still find the persisted token in localStorage and avoid sending
  // unauthenticated requests that produce "Authorization token is required".
  const entries = (
    normalizedRole === 'driver' || normalizedRole === 'owner'
      ? [
          getSessionItem('driverToken'),
          getSessionItem('token'),
          localStorage.getItem('driverToken'),
          localStorage.getItem('token'),
        ]
      : [
          localStorage.getItem(`${role}Token`),
          localStorage.getItem('token'),
        ]
  ).filter(Boolean);

  return entries.find((token) => {
    const tokenRole = normalizeAuthRole(getTokenPayload(token)?.role);

    if ((normalizedRole === 'driver' || normalizedRole === 'owner') && DRIVER_PORTAL_ROLES.has(tokenRole)) {
      return true;
    }

    return tokenRole === normalizedRole;
  }) || null;
};

const getRoleFromPathname = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const pathname = String(window.location.pathname || '').toLowerCase();

  if (pathname.includes('/admin')) {
    return 'admin';
  }

  // Owners currently authenticate with driver tokens (fleet-owner flow).
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

const resolveAuthTokenForRequest = (config = {}) => {
  const requestPath = String(config.url || '').split('?')[0];
  const existingAuthorization = config.headers?.Authorization || config.headers?.authorization;

  if (existingAuthorization) {
    return String(existingAuthorization).startsWith('Bearer ')
      ? String(existingAuthorization).slice(7)
      : String(existingAuthorization);
  }

  const chatRole = localStorage.getItem('chatRole');
  const normalizedChatRole = String(chatRole || '').toLowerCase();
  const userToken = getStoredTokenByRole('user');
  const driverToken = getStoredTokenByRole('driver');
  const ownerToken = getStoredTokenByRole('owner');
  const adminToken = getStoredTokenByRole('admin') || localStorage.getItem('adminToken');

  const isPublicUserRoute =
    /^\/users\/(bootstrap|app-modules|settings|goods-types|vehicle-types|register|signup|login|profile-image|auth\/send-otp|auth\/verify-otp|otp-login)(\/|$)/.test(requestPath);
  const isPublicDriverRoute =
    /^\/drivers\/(register|login|auth\/send-otp|auth\/verify-otp|onboarding\/send-otp|onboarding\/verify-otp|onboarding\/personal|onboarding\/referral|onboarding\/vehicle|onboarding\/documents|onboarding\/complete|onboarding\/session\/|service-locations)(\/|$)/.test(requestPath);
  const isAdminRoute =
    /^\/admin(\/|$)/.test(requestPath) ||
    /^\/(countries|common\/ride_modules|types\/|on-boarding(?:-|\/|$)|roles\/|permissions\/)/.test(requestPath);
  const isDriverRoute = /^\/drivers?(\/|$)/.test(requestPath);
  const isUserRoute = /^\/(users|rides|deliveries|promos)(\/|$)/.test(requestPath);
  const isSupportRoute = /^\/support(\/|$)/.test(requestPath);
  const isChatRoute = /^\/chats?(\/|$)/.test(requestPath);
  const pathRole = getRoleFromPathname();

  if (isPublicUserRoute || isPublicDriverRoute) {
    return null;
  }

  if (isChatRoute) {
    if (normalizedChatRole === 'admin') {
      return adminToken;
    }
    if (normalizedChatRole === 'driver') {
      return driverToken || ownerToken;
    }
    if (normalizedChatRole === 'owner') {
      return ownerToken || driverToken;
    }
    if (normalizedChatRole === 'user') {
      return userToken;
    }
  }

  if (isAdminRoute) {
    return adminToken;
  }

  if (isSupportRoute) {
    if (pathRole === 'admin') {
      return adminToken;
    }
    if (pathRole === 'driver') {
      return driverToken || ownerToken;
    }
    return userToken;
  }

  if (isUserRoute) {
    return userToken;
  }

  if (isDriverRoute) {
    return driverToken || ownerToken;
  }

  return userToken || driverToken || ownerToken || adminToken || null;
};

const clearStaleAuthState = (role = '', staleToken = '') => {
  const normalizedRole = normalizeAuthRole(role);
  const currentGenericToken = localStorage.getItem('token');
  const currentSessionGenericToken = getSessionItem('token');
  const shouldClearGenericToken =
    !staleToken ||
    currentGenericToken === staleToken ||
    currentSessionGenericToken === staleToken ||
    normalizeAuthRole(getTokenPayload(currentGenericToken)?.role) === normalizedRole;

  if (shouldClearGenericToken) {
    localStorage.removeItem('token');
    try {
      sessionStorage.removeItem('token');
    } catch {}
  }

  if (!normalizedRole || normalizedRole === 'user') {
    if (!staleToken || localStorage.getItem('userToken') === staleToken) {
      localStorage.removeItem('userToken');
    }
    localStorage.removeItem('userInfo');
  }

  if (!normalizedRole || normalizedRole === 'driver' || normalizedRole === 'owner') {
    if (!staleToken || localStorage.getItem('driverToken') === staleToken) {
      localStorage.removeItem('driverToken');
    }
    try {
      if (!staleToken || getSessionItem('driverToken') === staleToken) {
        sessionStorage.removeItem('driverToken');
      }
      sessionStorage.removeItem('driverInfo');
      sessionStorage.removeItem('chatRole');
    } catch {}
    localStorage.removeItem('driverInfo');
  }

  if (!normalizedRole || normalizedRole === 'admin') {
    if (!staleToken || localStorage.getItem('adminToken') === staleToken) {
      localStorage.removeItem('adminToken');
    }
    localStorage.removeItem('adminInfo');
  }

  localStorage.removeItem('chatRole');
};

const isStaleAuthMessage = (message = '') => {
  const normalizedMessage = String(message || '').trim().toLowerCase();
  return normalizedMessage === 'jwt expired' || normalizedMessage === 'invalid authorization token';
};

// Request Interceptor: Attach Auth Token automatically
api.interceptors.request.use(
  (config) => {
    const existingAuthorization = config.headers?.Authorization || config.headers?.authorization;

    if (existingAuthorization) {
      return config;
    }
    const token = resolveAuthTokenForRequest(config);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Simplify responses and handle global errors
api.interceptors.response.use(
  (response) => {
    // Pro-Level: Many APIs return data in data.data or data.result, you can flatten it here
    return createCompatibleResponseView(response.data);
  },
  (error) => {
    if (error.response) {
      // Global error handling: e.g. deleted or inactive account logout
      const serverMessage = String(error.response.data?.message || '');
      const authHeader = error.config?.headers?.Authorization || error.config?.headers?.authorization || '';
      const token = String(authHeader).startsWith('Bearer ') ? String(authHeader).slice(7) : '';
      const tokenRole = normalizeAuthRole(getTokenPayload(token)?.role || '');
      
      const is401 = error.response.status === 401;
      const is403 = error.response.status === 403;
      const isStaleMessage = isStaleAuthMessage(serverMessage);
      const isDeactivatedOrDeleted =
        serverMessage === 'Authenticated account no longer exists' ||
        (tokenRole === 'user' && serverMessage === 'User account is not active');

      const shouldClearAuth =
        (is401 ||
        isStaleMessage ||
        (is403 && isDeactivatedOrDeleted)) &&
        Boolean(token);

      if (shouldClearAuth) {
        clearStaleAuthState(tokenRole, token);
        window.dispatchEvent(new CustomEvent('app:auth-stale', {
          detail: { role: tokenRole || null, message: serverMessage, token },
        }));
      }

      return Promise.reject({ ...error.response.data, status: error.response.status });
    }

    return Promise.reject({ message: 'Network error or server down.' });
  }
);

const rawGet = api.get.bind(api);

api.get = (url, config = {}) => {
  if (!isDedupedGet(url)) {
    return rawGet(url, config);
  }

  const key = getDedupedRequestKey(url, config);
  const now = Date.now();
  const cached = recentDedupedGetResponses.get(key);

  if (cached && now - cached.timestamp < DEDUPED_GET_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const pending = dedupedGetRequests.get(key);

  if (pending) {
    return pending;
  }

  const request = rawGet(url, config)
    .then((data) => {
      recentDedupedGetResponses.set(key, {
        data,
        timestamp: Date.now(),
      });
      return data;
    })
    .finally(() => {
      dedupedGetRequests.delete(key);
    });

  dedupedGetRequests.set(key, request);
  return request;
};

export default api;
