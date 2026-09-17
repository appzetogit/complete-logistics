/**
 * Map Utilities for Admin Operations
 */

/**
 * Builds a URL to fetch country/region boundaries from OpenStreetMap (Nominatim).
 * Used to provide visual guides when drawing zones.
 */
export const buildCountryBoundaryUrl = (query) => {
  return `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=1`;
};

/**
 * Normalizes GeoJSON coordinates (rings) into Google Maps LatLng paths.
 * Handles Polygon and MultiPolygon types.
 */
export const normalizeBoundaryRings = (geojson) => {
  if (!geojson || !geojson.type) return [];

  const createPath = (ring) => ring.map(coord => ({
    lat: coord[1],
    lng: coord[0]
  }));

  if (geojson.type === 'Polygon') {
    return geojson.coordinates.map(createPath);
  }

  if (geojson.type === 'MultiPolygon') {
    return geojson.coordinates.flatMap(poly => poly.map(createPath));
  }

  return [];
};

/**
 * Checks if a driver should be displayed as "available" on the operations map.
 */
export const isDriverAvailable = (driver) => {
  if (!driver) return false;
  
  // Logic from the legacy system:
  // Status 1 = Active, Approve 1 = Approved
  const isActive = driver.status === 1 || driver.active === true || driver.status === 'active';
  const isApproved = driver.approve === 1 || driver.approve === true || driver.approved === true;
  
  return isActive && isApproved;
};
