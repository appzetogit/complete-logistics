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

export const toPoint = (coordinates, fieldName) => ({
  type: 'Point',
  coordinates: normalizePoint(coordinates, fieldName),
});
