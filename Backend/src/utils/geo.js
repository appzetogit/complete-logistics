import { ApiError } from './ApiError.js';

export const normalizePoint = (coordinates, fieldName = 'coordinates') => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throw new ApiError(400, `${fieldName} must be [longitude, latitude]`);
  }

  const [longitude, latitude] = coordinates.map(Number);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new ApiError(400, `${fieldName} must contain valid longitude and latitude values`);
  }

  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new ApiError(400, `${fieldName} must be valid [longitude, latitude]`);
  }

  return [longitude, latitude];
};

const toRadians = (value) => Number(value) * (Math.PI / 180);

/** Great-circle distance in meters between two [longitude, latitude] points; Infinity when either is invalid. */
export const distanceMeters = (first, second) => {
  const [firstLng, firstLat] = Array.isArray(first) ? first.map(Number) : [];
  const [secondLng, secondLat] = Array.isArray(second) ? second.map(Number) : [];
  if (![firstLng, firstLat, secondLng, secondLat].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }
  const deltaLat = toRadians(secondLat - firstLat);
  const deltaLng = toRadians(secondLng - firstLng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const toPoint = (coordinates, fieldName) => ({
  type: 'Point',
  coordinates: normalizePoint(coordinates, fieldName),
});
