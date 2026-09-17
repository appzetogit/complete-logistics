const DEFAULT_BACKEND_ORIGIN = 'http://localhost:5000';

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const resolveOrigin = (origin) => {
  if (typeof window === 'undefined') return origin;
  const { hostname } = window.location;
  // If we are accessing via IP or a real hostname, but the config says localhost,
  // we replace localhost with the current hostname so mobile devices hit the dev machine.
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && origin.includes('localhost')) {
    return origin.replace('localhost', hostname);
  }
  return origin;
};

export const API_BASE_URL = trimTrailingSlash(
  resolveOrigin(import.meta.env.VITE_API_BASE_URL || `${DEFAULT_BACKEND_ORIGIN}/api/v1`),
);

export const BACKEND_ORIGIN = trimTrailingSlash(
  resolveOrigin(
    import.meta.env.VITE_BACKEND_ORIGIN ||
      import.meta.env.VITE_SOCKET_URL ||
      import.meta.env.VITE_ASSET_BASE_URL ||
      API_BASE_URL.replace(/\/api(?:\/v1)?$/, ''),
  ),
);

export const BACKEND_LABEL = BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN;
