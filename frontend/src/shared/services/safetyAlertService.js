import api from '../api/axiosInstance';
import { getLocalDriverToken } from '../../modules/driver/services/registrationService';
import { getCurrentRide } from '../../modules/user/services/currentRideService';
import { withUserAuth } from '../../modules/user/services/authService';

const ACTIVE_TRIP_SNAPSHOT_KEY = 'driverActiveTripSnapshot';

const cleanString = (value = '') => String(value || '').trim();

const readCoordinatePair = (...sources) => {
  for (const source of sources) {
    if (Array.isArray(source) && source.length >= 2) {
      const [lng, lat] = source;
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
        return [Number(lng), Number(lat)];
      }
    }

    const nestedCoords = source?.coordinates;
    if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
      const [lng, lat] = nestedCoords;
      if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
        return [Number(lng), Number(lat)];
      }
    }

    const lat = Number(source?.lat ?? source?.latitude);
    const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [Number(lng), Number(lat)];
    }
  }

  return null;
};

const getDriverAuthConfig = () => {
  const token = getLocalDriverToken();
  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
};

const readDriverTripSnapshot = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_TRIP_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const readBrowserLocation = () =>
  new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.longitude, position.coords.latitude]),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000,
      },
    );
  });

export const triggerUserSosAlert = async (extra = {}) => {
  const ride = getCurrentRide() || {};
  const location =
    readCoordinatePair(ride?.pickupCoords, ride?.pickupLocation, ride?.dropCoords, ride?.dropLocation)
    || await readBrowserLocation();

  const payload = {
    rideId: cleanString(ride?.rideId),
    deliveryId: cleanString(ride?.deliveryId),
    serviceType: cleanString(ride?.serviceType || ride?.type || 'general').toLowerCase(),
    tripCode: cleanString(ride?.rideId),
    pickupAddress: cleanString(ride?.pickup),
    dropAddress: cleanString(ride?.drop),
    vehicleLabel: cleanString(ride?.vehicle?.name || ride?.vehicleLabel || ride?.driver?.vehicleType),
    locationLabel: cleanString(ride?.pickup || ride?.drop),
    location: location ? { coordinates: location } : null,
    ...extra,
  };

  const response = await api.post('/users/sos', payload, withUserAuth());
  return response?.data?.data || response?.data || null;
};

export const triggerDriverSosAlert = async (extra = {}) => {
  const snapshot = readDriverTripSnapshot() || {};
  const job = snapshot?.job || snapshot?.raw || snapshot || {};
  const location =
    readCoordinatePair(
      snapshot?.driverCoords,
      job?.driverCoords,
      job?.driverLocation,
      job?.pickupLocation,
      job?.pickup,
    ) || await readBrowserLocation();

  const payload = {
    rideId: cleanString(job?.rideId || job?.id || job?._id),
    deliveryId: cleanString(job?.deliveryId),
    serviceType: cleanString(job?.serviceType || job?.type || 'general').toLowerCase(),
    tripCode: cleanString(job?.rideId || job?.id || job?._id),
    pickupAddress: cleanString(job?.pickupAddress || job?.pickup),
    dropAddress: cleanString(job?.dropAddress || job?.drop),
    vehicleLabel: cleanString(job?.vehicle?.name || job?.vehicleType || job?.vehicleLabel),
    locationLabel: cleanString(job?.pickupAddress || job?.pickup || job?.dropAddress),
    location: location ? { coordinates: location } : null,
    ...extra,
  };

  const response = await api.post('/drivers/sos', payload, getDriverAuthConfig());
  return response?.data?.data || response?.data || null;
};
