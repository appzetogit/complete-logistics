export const LOCATION_STORAGE_KEY = 'Appzeto 24:lastLocation';
export const LOCATION_UPDATED_EVENT = 'Appzeto 24:location-updated';

export const DEFAULT_LOCATION_LABEL = 'Choose your location';
export const DEFAULT_LOCATION_COORDS = [78.4867, 17.385];

export const getSavedLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    const lat = Number(saved?.lat);
    const lon = Number(saved?.lon);
    const updatedAt = Number(saved?.updatedAt);
    const address = String(saved?.address || '').trim();

    return {
      address,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  } catch {
    return null;
  }
};

export const getSavedLocationLabel = () => (
  String(getSavedLocation()?.address || '').trim() || DEFAULT_LOCATION_LABEL
);

export const getSavedLocationCoords = () => {
  const saved = getSavedLocation();
  if (saved && Number.isFinite(saved.lon) && Number.isFinite(saved.lat)) {
    return [saved.lon, saved.lat];
  }

  return null;
};

export const saveLocation = (nextLocation = {}) => {
  if (typeof window === 'undefined') {
    return null;
  }

  const previous = getSavedLocation() || {};
  const next = {
    ...previous,
    ...nextLocation,
  };

  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(LOCATION_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }

  return next;
};
