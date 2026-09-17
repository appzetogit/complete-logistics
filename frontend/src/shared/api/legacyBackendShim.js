import { BACKEND_ORIGIN } from './runtimeConfig';

const LEGACY_BACKEND_ORIGIN = BACKEND_ORIGIN;
const SHIM_FLAG = '__LEGACY_BACKEND_SHIM_INSTALLED__';

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const emptyCollection = (overrides = {}) => ({
  success: true,
  message: 'Legacy backend detached. Using safe offline fallback.',
  data: {
    results: [],
    items: [],
    users: [],
    drivers: [],
    owners: [],
    zones: [],
    languages: [],
    preferences: [],
    roles: [],
    permissions: [],
    app_modules: [],
    notifications: [],
    banners: [],
    service_locations: [],
    vehicle_types: [],
    vehicle_preference: [],
    ride_modules: [],
    ...overrides,
  },
  results: [],
});

const dashboardPayload = () => ({
  success: true,
  message: 'Legacy backend detached. Using safe offline fallback.',
  data: {
    totalUsers: 0,
    totalDrivers: {
      total: 0,
      approved: 0,
      declined: 0,
    },
    total_users: 0,
    total_drivers: 0,
    approved_drivers: 0,
    pending_drivers: 0,
    todayEarnings: 0,
    overallEarnings: 0,
    cancelChart: [],
  },
});

const loginPayload = (role) => ({
  success: true,
  message: 'Legacy backend detached. Using safe offline fallback.',
  token: `offline-${role}-token`,
  access_token: `offline-${role}-token`,
  data: {
    token: `offline-${role}-token`,
    [role]: {
      id: `offline-${role}`,
      name: `Offline ${role}`,
      email: `${role}@offline.local`,
      phone: '0000000000',
      role,
    },
    user: {
      id: `offline-${role}`,
      name: `Offline ${role}`,
      email: `${role}@offline.local`,
      phone: '0000000000',
      role,
    },
  },
});

const blobResponse = () =>
  new Response(new Blob(['']), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
    },
  });

const routePayload = (pathname, method) => {
  if (method === 'POST' && pathname.endsWith('/admin/login')) {
    return loginPayload('admin');
  }

  if (method === 'POST' && pathname.endsWith('/driver/login')) {
    return loginPayload('driver');
  }

  if (method === 'POST' && pathname.endsWith('/mobile-otp')) {
    return {
      success: true,
      message: 'OTP sent in offline fallback mode.',
    };
  }

  if (method === 'POST' && pathname.endsWith('/validate-otp')) {
    return loginPayload('driver');
  }

  if (pathname.includes('/download')) {
    return blobResponse();
  }

  if (pathname.includes('/dashboard')) {
    return dashboardPayload();
  }

  if (pathname.includes('/users') || pathname.includes('/drivers') || pathname.includes('/owners')) {
    return emptyCollection();
  }

  if (
    pathname.includes('/service-locations') ||
    pathname.includes('/types/') ||
    pathname.includes('/countries') ||
    pathname.includes('/common/ride_modules') ||
    pathname.includes('/vehicle_preference') ||
    pathname.includes('/zones') ||
    pathname.includes('/languages') ||
    pathname.includes('/preferences') ||
    pathname.includes('/roles') ||
    pathname.includes('/permissions') ||
    pathname.includes('/app-modules') ||
    pathname.includes('/notification-channels') ||
    pathname.includes('/integration-settings') ||
    pathname.includes('/on-boarding') ||
    pathname.includes('/notifications') ||
    pathname.includes('/banners') ||
    pathname.includes('/promos') ||
    pathname.includes('/referral')
  ) {
    return emptyCollection();
  }

  return emptyCollection();
};

export const installLegacyBackendShim = () => {
  if (globalThis[SHIM_FLAG]) {
    return;
  }

  globalThis[SHIM_FLAG] = true;
  globalThis.__LEGACY_BACKEND_ORIGIN__ = LEGACY_BACKEND_ORIGIN;
};
