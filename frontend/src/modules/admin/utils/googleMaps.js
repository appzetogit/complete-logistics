import { useJsApiLoader } from '@react-google-maps/api';

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const HAS_VALID_GOOGLE_MAPS_KEY =
  typeof GOOGLE_MAPS_API_KEY === 'string' &&
  GOOGLE_MAPS_API_KEY.trim() !== '' &&
  GOOGLE_MAPS_API_KEY !== 'your-google-maps-browser-key';

export const INDIA_CENTER = { lat: 22.7196, lng: 75.8577 };
export const DELHI_CENTER = { lat: 28.6139, lng: 77.209 };
export const GOOGLE_MAPS_LOADER_ID = 'appzeto-google-maps';
export const GOOGLE_MAPS_LIBRARIES = ['drawing', 'places', 'routes'];

export const getLatLng = (source, fallback = INDIA_CENTER) => {
  const lat = Number(source?.lat ?? source?.latitude);
  const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return fallback;
};

const useGoogleMapsLoader = () =>
  useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: HAS_VALID_GOOGLE_MAPS_KEY ? GOOGLE_MAPS_API_KEY : '',
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: '3.64',
  });

export const useBaseGoogleMapsLoader = () => useGoogleMapsLoader();

export const usePlacesGoogleMapsLoader = () => useGoogleMapsLoader();

export const useDrawingGoogleMapsLoader = () => useGoogleMapsLoader();

export const useAppGoogleMapsLoader = useGoogleMapsLoader;
