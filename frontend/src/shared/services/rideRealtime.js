const FIREBASE_DATABASE_URL = String(import.meta.env.VITE_FIREBASE_DATABASE_URL || '').trim().replace(/\/$/, '');

export const HAS_FIREBASE_RIDE_DB = FIREBASE_DATABASE_URL.length > 0;
let firebaseRideAccessDenied = false;

const rideUrl = (rideId) => `${FIREBASE_DATABASE_URL}/taxiRides/${encodeURIComponent(String(rideId))}.json`;

const toCoordsArray = (value, fallback = null) => {
  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return [Number(lng), Number(lat)];
    }
  }

  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude ?? value?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return [lng, lat];
  }

  return fallback;
};

export const pointSnapshot = (value, fallbackAddress = '') => {
  const coordinates = toCoordsArray(value, null);

  if (!coordinates) {
    return null;
  }

  return {
    coordinates,
    lng: coordinates[0],
    lat: coordinates[1],
    address: String(value?.address || fallbackAddress || ''),
    updatedAt: new Date().toISOString(),
  };
};

const mergeByPath = (target, path, data) => {
  if (!path || path === '/') {
    return data;
  }

  const segments = String(path).split('/').filter(Boolean);
  const next = { ...(target || {}) };
  let cursor = next;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    cursor[key] = typeof cursor[key] === 'object' && cursor[key] !== null ? { ...cursor[key] } : {};
    cursor = cursor[key];
  }

  cursor[segments[segments.length - 1]] = data;
  return next;
};

export const createRideRealtimeSnapshot = ({
  rideId,
  pickup,
  drop,
  fare,
  status = 'searching',
  userId = '',
  driverId = '',
  driver = null,
}) => ({
  rideId: String(rideId),
  pickup: pointSnapshot(pickup),
  drop: pointSnapshot(drop),
  fare: Number(fare || 0),
  status,
  userId: userId ? String(userId) : '',
  driverId: driverId ? String(driverId) : '',
  driver: driver || null,
  driverLocation: null,
  updatedAt: new Date().toISOString(),
});

const writeJson = async (rideId, method, payload) => {
  if (!HAS_FIREBASE_RIDE_DB || !rideId || firebaseRideAccessDenied) {
    return null;
  }

  const response = await fetch(rideUrl(rideId), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    firebaseRideAccessDenied = true;
    return null;
  }

  if (!response.ok) {
    throw new Error(`Firebase ride sync failed (${response.status})`);
  }

  return response.json().catch(() => null);
};

export const seedRideRealtime = (payload) => writeJson(payload.rideId, 'PUT', createRideRealtimeSnapshot(payload));

export const patchRideRealtime = (rideId, payload) =>
  writeJson(rideId, 'PATCH', {
    ...payload,
    updatedAt: new Date().toISOString(),
  });

export const pushDriverLocationRealtime = (rideId, location, extra = {}) =>
  patchRideRealtime(rideId, {
    driverLocation: {
      ...pointSnapshot(location),
      heading: Number.isFinite(Number(extra.heading)) ? Number(extra.heading) : null,
      speed: Number.isFinite(Number(extra.speed)) ? Number(extra.speed) : null,
      updatedAt: new Date().toISOString(),
    },
  });

export const subscribeRideRealtime = (rideId, onValue, onError) => {
  if (!HAS_FIREBASE_RIDE_DB || !rideId || firebaseRideAccessDenied || typeof EventSource === 'undefined') {
    return () => {};
  }

  let currentState = null;
  const source = new EventSource(rideUrl(rideId));

  const applyUpdate = (event) => {
    try {
      const parsed = JSON.parse(event.data || '{}');

      if (parsed.path === '/') {
        currentState = parsed.data;
      } else {
        currentState = mergeByPath(currentState, parsed.path, parsed.data);
      }

      onValue(currentState);
    } catch (error) {
      onError?.(error);
    }
  };

  source.addEventListener('put', applyUpdate);
  source.addEventListener('patch', applyUpdate);
  source.onerror = (error) => {
    firebaseRideAccessDenied = true;
    onError?.(error);
    source.close();
  };

  return () => {
    source.close();
  };
};
