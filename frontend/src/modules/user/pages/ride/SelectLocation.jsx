import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, X, Plus, Minus, Check, Map as MapIcon, LoaderCircle, Navigation, AlertTriangle, ChevronRight } from 'lucide-react';
import { GoogleMap } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, INDIA_CENTER, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import api from '../../../../shared/api/axiosInstance';
import { getSavedLocation, getSavedLocationCoords, saveLocation } from '../../services/locationStore';

const LOCATION_COORDS = {
  'Pipaliyahana, Indore': [75.9048, 22.7039],
  'Vijay Nagar': [75.8937, 22.7533],
  'Vijay Nagar Square': [75.8947, 22.7518],
  'Vijayawada': [80.6480, 16.5062],
  'Vijay Nagar Police Station': [75.8934, 22.7506],
  'Rajwada': [75.8553, 22.7187],
  'Bhawarkua': [75.8586, 22.6926],
  'MG Road': [75.8721, 22.7196],
  'Palasia Square': [75.8863, 22.7242],
  'LIG Colony': [75.8904, 22.7322],
  'Scheme No 54': [75.8978, 22.7567],
  'Bhangadh': [75.8438, 22.7552],
  'AB Road': [75.8878, 22.7423],
  'Geeta Bhawan': [75.8834, 22.7208],
  'Sapna Sangeeta': [75.8587, 22.6984],
  'Mahalaxmi Nagar': [75.9114, 22.7676],
};

const getCoords = (title, fallback = [75.8577, 22.7196]) => LOCATION_COORDS[title] || fallback;
const DEFAULT_COORDS = [75.8577, 22.7196];
const MAP_REVERSE_GEOCODE_DEBOUNCE_MS = 500;
const getLatLngCacheKey = (coords, precision = 5) =>
  `${Number(coords?.lat || 0).toFixed(precision)},${Number(coords?.lng || 0).toFixed(precision)}`;
const sanitizeLocationInput = (value) => String(value || '').replace(/^\s+/g, '').replace(/\s{2,}/g, ' ');

const unwrapResults = (response) => {
  const payload = response?.data?.data || response?.data || response;
  return payload?.results || payload?.zones || (Array.isArray(payload) ? payload : []);
};

const getZoneServiceLocationId = (zone) =>
  zone?.service_location_id?._id
  || zone?.service_location_id?.id
  || zone?.service_location_id
  || zone?.service_location?._id
  || zone?.service_location?.id
  || zone?.service_location
  || '';

const isZoneActive = (zone) => zone?.active !== false && Number(zone?.status ?? 1) !== 0;

const getZoneId = (zone) => zone?._id || zone?.id || '';

const getStoreZoneId = (store) =>
  store?.zone_id?._id
  || store?.zone_id?.id
  || store?.zone_id
  || '';

const toZonePoint = (point) => {
  if (Array.isArray(point) && point.length >= 2) {
    const [lng, lat] = point;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }
  }

  if (point && typeof point === 'object') {
    const lat = Number(point.lat ?? point.latitude);
    const lng = Number(point.lng ?? point.longitude ?? point.lon);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
};

const normalizeZonePath = (zone) => {
  const source = Array.isArray(zone?.coordinates?.[0]) && Array.isArray(zone?.coordinates?.[0]?.[0])
    ? zone.coordinates[0]
    : zone?.coordinates;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(toZonePoint).filter(Boolean);
};

const getBoundsFromPaths = (paths) => {
  if (!paths.length) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  paths.forEach((path) => {
    path.forEach((point) => {
      north = Math.max(north, point.lat);
      south = Math.min(south, point.lat);
      east = Math.max(east, point.lng);
      west = Math.min(west, point.lng);
    });
  });

  if (![north, south, east, west].every(Number.isFinite)) {
    return null;
  }

  return { north, south, east, west };
};

const isPointInPolygon = (point, polygon) => {
  if (!point || polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const isPointInAnyZone = (point, zonePaths) => {
  if (!zonePaths.length) {
    return true;
  }

  return zonePaths.some((path) => isPointInPolygon(point, path));
};

const findMatchingZone = (coords, zones = []) => {
  if (!Array.isArray(coords) || coords.length !== 2 || !Array.isArray(zones) || !zones.length) {
    return null;
  }

  const [lng, lat] = coords;
  const point = { lat: Number(lat), lng: Number(lng) };

  return zones.find((zone) => {
    const zonePath = normalizeZonePath(zone);
    return zonePath.length >= 3 && isPointInPolygon(point, zonePath);
  }) || null;
};

const saveRecentLocation = (address, coords) => {
  if (!address || address.trim().length === 0) return;
  try {
    const key = 'Appzeto 24:recentLocations';
    let list = [];
    const saved = localStorage.getItem(key);
    if (saved) {
      list = JSON.parse(saved);
    }
    if (!Array.isArray(list)) list = [];
    list = list.filter(item => item.address.toLowerCase() !== address.toLowerCase());
    const name = address.split(',')[0].trim();
    list.unshift({
      name: name,
      address: address,
      lat: coords ? coords[1] : null,
      lon: coords ? coords[0] : null,
      distance: coords ? 'Recent' : '',
    });
    list = list.slice(0, 5);
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('Appzeto 24:recent-locations-updated'));
  } catch (e) {
    console.error('Error saving recent location:', e);
  }
};

const SelectLocation = () => {
  const location = useLocation();
  const routeState = location.state || {};
  const serviceLocationId = routeState.service_location_id || routeState.serviceLocationId || '';
  const routeActiveInput = routeState.activeInput === 'pickup' || routeState.activeInput === 'drop'
    ? routeState.activeInput
    : 'drop';
  const isParcelFlow = routeState.flow === 'parcel' || String(routeState.returnTo || '').includes('/parcel/details');
  const savedLocation = getSavedLocation();
  const savedPickupLabel = String(savedLocation?.address || '').trim();
  const savedPickupCoords = getSavedLocationCoords();
  const [pickup, setPickup] = useState(() => routeState.pickup || savedPickupLabel || 'Pipaliyahana, Indore');
  const [drop, setDrop] = useState(() => routeState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => routeState.pickupCoords || savedPickupCoords || getCoords(routeState.pickup || savedPickupLabel || 'Pipaliyahana, Indore'));
  const [dropCoords, setDropCoords] = useState(() => routeState.dropCoords || null);
  const [stops, setStops] = useState(() => routeState.stops || []);          // array of stop strings
  const [activeInput, setActiveInput] = useState(routeActiveInput); // 'pickup' | 'drop' | stopIdx
  const [showMapPicker, setShowMapPicker] = useState(Boolean(routeState.openMapPicker));
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [pickedAddress, setPickedAddress] = useState('Loading address...');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [zones, setZones] = useState([]);
  const [zonePaths, setZonePaths] = useState([]);
  const [serviceStores, setServiceStores] = useState([]);
  const [remoteResults, setRemoteResults] = useState([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const reverseGeocodeTimerRef = useRef(null);
  const lastReverseGeocodedCenterRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const searchCacheRef = useRef(new Map());
  const latestSearchRef = useRef(0);
  const coordsLookupCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());
  const reverseGeocodeCacheRef = useRef(new Map());
  const { isLoaded, loadError } = useAppGoogleMapsLoader();
  const navigate = useNavigate();
  const routePrefix = window.location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const parcelReturnPath = routeState.returnTo || `${routePrefix}/parcel/details`;

  // All known locations â€” filtered live as user types
  const allResults = [
    { title: 'Vijay Nagar', address: 'Vijay Nagar, Indore, Madhya Pradesh' },
    { title: 'Vijay Nagar Square', address: 'Vijay Nagar Square, Bhagyashree Colony, Indore' },
    { title: 'Vijayawada', address: 'Vijayawada, Andhra Pradesh, India' },
    { title: 'Vijay Nagar Police Station', address: 'Vijay Nagar Police Station, Sector D, Indore' },
    { title: 'Rajwada', address: 'Rajwada, Old Palasia, Indore, MP' },
    { title: 'Bhawarkua', address: 'Bhawarkua, Indore, Madhya Pradesh' },
    { title: 'MG Road', address: 'MG Road, Indore, Madhya Pradesh' },
    { title: 'Palasia Square', address: 'Palasia Square, AB Road, Indore' },
    { title: 'LIG Colony', address: 'LIG Colony, Indore, Madhya Pradesh' },
    { title: 'Scheme No 54', address: 'Scheme No 54, Vijay Nagar, Indore' },
    { title: 'Bhangadh', address: 'Bhangadh, Indore, Madhya Pradesh' },
    { title: 'AB Road', address: 'AB Road, Indore, Madhya Pradesh' },
    { title: 'Geeta Bhawan', address: 'Geeta Bhawan, Indore, Madhya Pradesh' },
    { title: 'Sapna Sangeeta', address: 'Sapna Sangeeta Road, Indore, MP' },
    { title: 'Mahalaxmi Nagar', address: 'Mahalaxmi Nagar, Indore, Madhya Pradesh' },
  ];

  const zoneBounds = useMemo(() => getBoundsFromPaths(zonePaths), [zonePaths]);

  useEffect(() => {
    let active = true;

    const loadZoneData = async () => {
      if (!serviceLocationId) {
        setZones([]);
        setZonePaths([]);
        setServiceStores([]);
        return;
      }

      try {
        const [zonesResponse, storesResponse] = await Promise.all([
          api.get('/admin/zones'),
          api.get('/users/service-stores'),
        ]);
        if (!active) {
          return;
        }

        const matchingZones = unwrapResults(zonesResponse)
          .filter((zone) => isZoneActive(zone));
        const matchingPaths = matchingZones
          .map(normalizeZonePath)
          .filter((path) => path.length >= 3);
        const matchingStores = unwrapResults(storesResponse).filter((store) => {
          if (store?.active === false || String(store?.status || '').toLowerCase() === 'inactive') {
            return false;
          }

          return true;
        });

        setZones(matchingZones);
        setZonePaths(matchingPaths);
        setServiceStores(matchingStores);
      } catch {
        if (active) {
          setZones([]);
          setZonePaths([]);
          setServiceStores([]);
        }
      }
    };

    loadZoneData();

    return () => {
      active = false;
    };
  }, [serviceLocationId]);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new window.google.maps.places.PlacesService(document.createElement('div'));
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new window.google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  const getAutocompleteSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) {
      return null;
    }

    if (!autocompleteSessionTokenRef.current) {
      autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }

    return autocompleteSessionTokenRef.current;
  };

  const resetAutocompleteSessionToken = () => {
    if (!window.google?.maps?.places?.AutocompleteSessionToken) {
      autocompleteSessionTokenRef.current = null;
      return;
    }

    autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  };

  const getPlacesService = () => {
    if (!window.google?.maps?.places?.PlacesService) {
      return null;
    }

    if (!placesServiceRef.current) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }

    return placesServiceRef.current;
  };

  const getGeocoder = () => {
    if (!window.google?.maps?.Geocoder) {
      return null;
    }

    if (!geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }

    return geocoderRef.current;
  };

  const resolveCoords = async (label, fallback = DEFAULT_COORDS) => {
    if (!label || !String(label).trim()) {
      return fallback;
    }

    const knownCoords = LOCATION_COORDS[label];
    if (knownCoords) {
      return knownCoords;
    }

    const cacheKey = String(label).trim().toLowerCase();
    const cachedCoords = coordsLookupCacheRef.current.get(cacheKey);
    if (cachedCoords) {
      return cachedCoords;
    }

    if (!window.google?.maps?.Geocoder) {
      return fallback;
    }

    const geocoder = getGeocoder();
    if (!geocoder) {
      return fallback;
    }

    return new Promise((resolve) => {
      geocoder.geocode({ address: String(label).trim() }, (results, status) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          const resolvedCoords = [location.lng(), location.lat()];
          coordsLookupCacheRef.current.set(cacheKey, resolvedCoords);
          resolve(resolvedCoords);
          return;
        }

        resolve(fallback);
      });
    });
  };

  const resolvePlaceSelection = async (result) => {
    if (Array.isArray(result?.coords) && result.coords.length === 2) {
      return {
        title: result.title,
        address: result.address || result.title,
        coords: result.coords,
      };
    }

    const cacheKey = String(result?.placeId || `${result?.title || ''}|${result?.address || ''}`.trim().toLowerCase());
    const cachedSelection = placeSelectionCacheRef.current.get(cacheKey);
    if (cachedSelection) {
      return cachedSelection;
    }

    const geocoder = getGeocoder();
    const placesService = getPlacesService();

    if (result?.placeId && placesService) {
      return new Promise((resolve) => {
        placesService.getDetails(
          {
            placeId: result.placeId,
            sessionToken: getAutocompleteSessionToken(),
            fields: ['formatted_address', 'geometry.location', 'name'],
          },
          (place, status) => {
            const location = place?.geometry?.location;

            if (status === 'OK' && location) {
              const resolvedSelection = {
                title: result.title || place.name || place.formatted_address,
                address: place.formatted_address || result.address || result.title || '',
                coords: [location.lng(), location.lat()],
              };
              placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
              resolve(resolvedSelection);
              return;
            }

            if (geocoder) {
              geocoder.geocode({ placeId: result.placeId }, (results, geocodeStatus) => {
                const geocodedPlace = results?.[0];
                const geocodedLocation = geocodedPlace?.geometry?.location;

                if (geocodeStatus === 'OK' && geocodedLocation) {
                  const resolvedSelection = {
                    title: result.title || geocodedPlace.formatted_address,
                    address: geocodedPlace.formatted_address || result.address || result.title || '',
                    coords: [geocodedLocation.lng(), geocodedLocation.lat()],
                  };
                  placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
                  resolve(resolvedSelection);
                  return;
                }

                resolve({
                  title: result?.title || '',
                  address: result?.address || result?.title || '',
                  coords: DEFAULT_COORDS,
                });
              });
              return;
            }

            resolve({
              title: result?.title || '',
              address: result?.address || result?.title || '',
              coords: DEFAULT_COORDS,
            });
          },
        );
      });
    }

    if (!geocoder) {
      return {
        title: result?.title || '',
        address: result?.address || result?.title || '',
        coords: await resolveCoords(result?.address || result?.title || ''),
      };
    }

    const coords = await resolveCoords(result?.address || result?.title || '');
    const resolvedSelection = {
      title: result?.title || '',
      address: result?.address || result?.title || '',
      coords,
    };
    placeSelectionCacheRef.current.set(cacheKey, resolvedSelection);
    return resolvedSelection;
  };

  const validateZoneSelection = (coords) => {
    if (!Array.isArray(coords) || coords.length !== 2) {
      return false;
    }

    const [lng, lat] = coords;
    const point = { lat: Number(lat), lng: Number(lng) };

    return isPointInAnyZone(point, zonePaths);
  };

  const getQuery = () => {
    if (activeInput === 'pickup') return pickup;
    if (activeInput === 'drop') return drop;
    if (typeof activeInput === 'number') return stops[activeInput] || '';
    return '';
  };

  const query = getQuery();
  const currentZone = useMemo(() => findMatchingZone(pickupCoords, zones), [pickupCoords, zones]);

  const popularSuggestions = useMemo(() => {
    const currentZoneId = String(getZoneId(currentZone));
    const zoneStores = currentZoneId
      ? serviceStores.filter((store) => String(getStoreZoneId(store)) === currentZoneId)
      : [];

    if (zoneStores.length) {
      return zoneStores.slice(0, 6).map((store) => ({
        title: store.name || store.address || 'Service Store',
        address: store.address || currentZone?.name || 'Service Store',
        coords:
          Number.isFinite(Number(store.longitude)) && Number.isFinite(Number(store.latitude))
            ? [Number(store.longitude), Number(store.latitude)]
            : null,
      }));
    }

    return allResults.slice(0, 6);
  }, [currentZone, serviceStores]);

  const isInitialDefault = useMemo(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return false;

    if (activeInput === 'pickup') {
      const defaultPickup = String(routeState.pickup || '').trim();
      const currentSaved = String(savedPickupLabel || '').trim();
      return trimmedQuery === defaultPickup || trimmedQuery === currentSaved;
    }

    if (activeInput === 'drop') {
      const defaultDrop = String(routeState.drop || '').trim();
      return trimmedQuery === defaultDrop;
    }

    if (typeof activeInput === 'number') {
      const defaultStop = String(routeState.stops?.[activeInput] || '').trim();
      return trimmedQuery === defaultStop;
    }

    return false;
  }, [query, activeInput, routeState.pickup, routeState.drop, routeState.stops, savedPickupLabel]);

  const localSearchResults = useMemo(
    () =>
      query.trim().length >= 1 && !isInitialDefault
        ? allResults.filter(
          (result) =>
            result.title.toLowerCase().includes(query.toLowerCase())
            || result.address.toLowerCase().includes(query.toLowerCase()),
        )
        : popularSuggestions,
    [popularSuggestions, query, isInitialDefault],
  );

  useEffect(() => {
    if (isInitialDefault || !query.trim() || query.trim().length < 3 || !HAS_VALID_GOOGLE_MAPS_KEY || !autocompleteServiceRef.current) {
      setRemoteResults([]);
      setIsSearchingLocations(false);
      return;
    }

    const normalizedQuery = query.trim().toLowerCase();
    const cached = searchCacheRef.current.get(normalizedQuery);
    if (cached) {
      setRemoteResults(cached);
      setIsSearchingLocations(false);
      return;
    }

    const requestId = latestSearchRef.current + 1;
    latestSearchRef.current = requestId;
    setIsSearchingLocations(true);

    const timeoutId = window.setTimeout(() => {
      const request = {
        input: query.trim(),
        componentRestrictions: { country: 'in' },
        sessionToken: getAutocompleteSessionToken(),
      };

      if (zoneBounds) {
        request.bounds = zoneBounds;
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (latestSearchRef.current !== requestId) {
          return;
        }

        const nextResults = status === 'OK'
          ? predictions.slice(0, 6).map((prediction) => ({
            title: prediction.structured_formatting?.main_text || prediction.description,
            address: prediction.description,
            placeId: prediction.place_id,
          }))
          : [];

        searchCacheRef.current.set(normalizedQuery, nextResults);
        setRemoteResults(nextResults);
        setIsSearchingLocations(false);
      });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query, zoneBounds]);

  const searchResults = useMemo(() => {
    const merged = [...remoteResults, ...localSearchResults];
    const seen = new Set();

    return merged.filter((result) => {
      const key = `${String(result.title || '').trim().toLowerCase()}|${String(result.address || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }, [localSearchResults, remoteResults]);

  const getMapStartCoord = () => {
    const activeCoords = activeInput === 'drop' ? dropCoords : pickupCoords;

    if (Array.isArray(activeCoords) && activeCoords.length === 2) {
      return { lat: activeCoords[1], lng: activeCoords[0] };
    }

    if (activeInput === 'drop' && Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return { lat: pickupCoords[1], lng: pickupCoords[0] };
    }

    if (Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return { lat: pickupCoords[1], lng: pickupCoords[0] };
    }

    return INDIA_CENTER;
  };

  const shouldSkipReverseGeocode = (nextCenter, threshold = 0.00015) => (
    Math.abs(Number(nextCenter?.lat ?? 0) - Number(lastReverseGeocodedCenterRef.current?.lat ?? 0)) < threshold
    && Math.abs(Number(nextCenter?.lng ?? 0) - Number(lastReverseGeocodedCenterRef.current?.lng ?? 0)) < threshold
  );

  const reverseGeocodeMapCenter = (nextCenter, fallbackLabel = '') => {
    const cacheKey = getLatLngCacheKey(nextCenter);
    const cachedAddress = reverseGeocodeCacheRef.current.get(cacheKey);
    if (cachedAddress) {
      lastReverseGeocodedCenterRef.current = nextCenter;
      setPickedAddress(cachedAddress);
      return;
    }

    const geocoder = getGeocoder();
    if (!geocoder) {
      setPickedAddress(fallbackLabel || `${nextCenter.lat.toFixed(5)}, ${nextCenter.lng.toFixed(5)}`);
      return;
    }

    setIsGeocoding(true);
    geocoder.geocode({ location: nextCenter }, (results, status) => {
      setIsGeocoding(false);
      lastReverseGeocodedCenterRef.current = nextCenter;

      if (status === 'OK' && results?.[0]?.formatted_address) {
        reverseGeocodeCacheRef.current.set(cacheKey, results[0].formatted_address);
        setPickedAddress(results[0].formatted_address);
        return;
      }

      setPickedAddress(fallbackLabel || `${nextCenter.lat.toFixed(5)}, ${nextCenter.lng.toFixed(5)}`);
    });
  };

  const showMapToast = () => {
    const startCoord = getMapStartCoord();
    const seedAddress = activeInput === 'drop' ? drop : pickup;

    setMapCenter(startCoord);
    lastCenterRef.current = startCoord;
    setPickedAddress(String(seedAddress || '').trim() || 'Loading address...');
    setShowMapPicker(true);
  };

  useEffect(() => {
    if (!showMapPicker) {
      return;
    }

    const startCoord = getMapStartCoord();
    const seedAddress = activeInput === 'drop' ? drop : pickup;
    setMapCenter(startCoord);
    lastCenterRef.current = startCoord;
    setPickedAddress(String(seedAddress || '').trim() || 'Loading address...');
  }, [showMapPicker, activeInput, pickupCoords, dropCoords, pickup, drop]);

  useEffect(() => {
    if (!showMapPicker || !window.google?.maps?.Geocoder) {
      return;
    }

    const startCoord = getMapStartCoord();
    reverseGeocodeMapCenter(
      startCoord,
      `${startCoord.lat.toFixed(5)}, ${startCoord.lng.toFixed(5)}`,
    );
  }, [showMapPicker, activeInput, pickupCoords, dropCoords]);

  useEffect(() => () => {
    if (reverseGeocodeTimerRef.current) {
      window.clearTimeout(reverseGeocodeTimerRef.current);
    }
  }, []);

  const handleMapIdle = () => {
    if (!mapInstanceRef.current || !window.google) return;
    const center = mapInstanceRef.current.getCenter();
    const lat = center.lat();
    const lng = center.lng();

    // Only update and geocode if the center has actually changed significantly
    const dist = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);
    if (dist < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    const nextCenter = { lat, lng };

    if (shouldSkipReverseGeocode(nextCenter)) {
      return;
    }

    if (reverseGeocodeTimerRef.current) {
      window.clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = window.setTimeout(() => {
      reverseGeocodeMapCenter(
        nextCenter,
        `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      );
    }, MAP_REVERSE_GEOCODE_DEBOUNCE_MS);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);

    const handleSuccess = (pos) => {
      setIsLocating(false);
      const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (mapInstanceRef.current) {
        mapInstanceRef.current.panTo(newCoords);
        mapInstanceRef.current.setZoom(17);
      }
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          () => {
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const handleConfirmNavigate = async (optionalDrop, optionalDropCoords = null) => {
    const finalDrop = optionalDrop || drop;
    const finalPickup = pickup || 'Pipaliyahana, Indore';

    if (!finalDrop || finalDrop.trim().length === 0) return;

    const resolvedPickupCoords = pickupCoords || await resolveCoords(finalPickup);
    const resolvedDropCoords = optionalDropCoords || dropCoords || await resolveCoords(finalDrop);

    if (isParcelFlow) {
      navigate(parcelReturnPath, {
        state: {
          ...routeState,
          pickup: finalPickup,
          drop: finalDrop,
          pickupCoords: resolvedPickupCoords,
          dropCoords: resolvedDropCoords,
          activeInput: 'drop',
          editPickup: false,
          openMapPicker: false,
        },
      });
      return;
    }

    saveLocation({
      address: finalPickup,
      lat: resolvedPickupCoords[1],
      lon: resolvedPickupCoords[0],
    });

    saveRecentLocation(finalPickup, resolvedPickupCoords);
    saveRecentLocation(finalDrop, resolvedDropCoords);

    const matchedPickupZone = findMatchingZone(resolvedPickupCoords, zones);
    const nextServiceLocationId = getZoneServiceLocationId(matchedPickupZone) || '';
    const nextZoneId = getZoneId(matchedPickupZone) || '';

    navigate(`${routePrefix}/ride/select-vehicle`, {
      state: {
        ...routeState,
        pickup: finalPickup,
        drop: finalDrop,
        stops: stops.filter(s => s.trim().length > 0),
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        service_location_id: nextServiceLocationId,
        zone_id: nextZoneId,
        selectedCategory: routeState.selectedCategory, // Forward category filter
      },
    });
  };

  const returnParcelSelection = (targetInput, address, coords) => {
    navigate(parcelReturnPath, {
      state: {
        ...routeState,
        pickup: targetInput === 'pickup' ? address : pickup,
        drop: targetInput === 'drop' ? address : drop,
        pickupCoords: targetInput === 'pickup' ? coords : pickupCoords,
        dropCoords: targetInput === 'drop' ? coords : dropCoords,
        activeInput: targetInput,
        editPickup: targetInput === 'pickup',
        openMapPicker: false,
      },
    });
  };

  const handleParcelBack = (keepMapPicker = false) => {
    navigate(parcelReturnPath, {
      state: {
        ...routeState,
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        activeInput,
        editPickup: activeInput === 'pickup',
        openMapPicker: keepMapPicker,
      },
    });
  };

  const handleScreenBack = () => {
    if (isParcelFlow) {
      handleParcelBack(false);
      return;
    }
    navigate(-1);
  };

  const handleMapBack = () => {
    if (isParcelFlow) {
      handleParcelBack(false);
      return;
    }
    setShowMapPicker(false);
  };

  const handleConfirmMapLocation = () => {
    const finalAddress = pickedAddress;
    const selectedCoords = [lastCenterRef.current.lng, lastCenterRef.current.lat];

    if (activeInput === 'pickup') {
      if (isParcelFlow) {
        returnParcelSelection('pickup', finalAddress, selectedCoords);
        return;
      }
      setPickup(finalAddress);
      setPickupCoords(selectedCoords);
      saveLocation({
        address: finalAddress,
        lat: selectedCoords[1],
        lon: selectedCoords[0],
      });
      saveRecentLocation(finalAddress, selectedCoords);
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      if (isParcelFlow) {
        returnParcelSelection('drop', finalAddress, selectedCoords);
        return;
      }
      setDrop(finalAddress);
      setDropCoords(selectedCoords);
      saveRecentLocation(finalAddress, selectedCoords);
      // Auto-navigate if it's the destination
      handleConfirmNavigate(finalAddress, selectedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalAddress);
      saveRecentLocation(finalAddress, selectedCoords);
    }
    setShowMapPicker(false);
  };

  const handleUseCurrentLocationResult = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);

    const handleSuccess = (pos) => {
      setIsLocating(false);
      const { latitude, longitude } = pos.coords;
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const addr = results[0].formatted_address;
          const coords = [longitude, latitude];
          if (isParcelFlow) {
            returnParcelSelection(activeInput, addr, coords);
            return;
          }
          if (activeInput === 'drop') {
            setDrop(addr);
            setDropCoords(coords);
            handleConfirmNavigate(addr, coords);
          } else {
            handleSelectResult(addr, coords);
          }
        } else {
          const raw = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
          const coords = [longitude, latitude];
          if (isParcelFlow) {
            returnParcelSelection(activeInput, raw, coords);
            return;
          }
          if (activeInput === 'drop') {
            setDrop(raw);
            setDropCoords(coords);
            handleConfirmNavigate(raw, coords);
          } else {
            handleSelectResult(raw, coords);
          }
        }
      });
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          () => {
            setIsLocating(false);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };


  // Add a new empty stop
  const addStop = () => {
    setStops(prev => [...prev, '']);
    setActiveInput(stops.length); // focus the new stop
  };

  // Remove a stop by index
  const removeStop = (idx) => {
    setStops(prev => prev.filter((_, i) => i !== idx));
    setActiveInput('drop');
  };

  // Update a stop value
  const updateStop = (idx, val) => {
    setStops(prev => prev.map((s, i) => i === idx ? val : s));
  };

  // When a suggestion is tapped
  const handleSelectResult = async (result, selectedCoords = null) => {
    const normalizedResult = typeof result === 'string'
      ? { title: result, address: result, coords: selectedCoords }
      : result;
    const resolvedSelection = await resolvePlaceSelection(normalizedResult);
    const finalTitle = resolvedSelection.title || resolvedSelection.address;
    const resolvedCoords = selectedCoords || resolvedSelection.coords;

    resetAutocompleteSessionToken();

    if (activeInput === 'pickup') {
      if (isParcelFlow) {
        returnParcelSelection('pickup', finalTitle, resolvedCoords);
        return;
      }
      setPickup(finalTitle);
      setPickupCoords(resolvedCoords);
      saveLocation({
        address: finalTitle,
        lat: resolvedCoords[1],
        lon: resolvedCoords[0],
      });
      saveRecentLocation(finalTitle, resolvedCoords);
      setActiveInput('drop');
    } else if (activeInput === 'drop') {
      if (isParcelFlow) {
        returnParcelSelection('drop', finalTitle, resolvedCoords);
        return;
      }
      setDrop(finalTitle);
      setDropCoords(resolvedCoords);
      saveRecentLocation(finalTitle, resolvedCoords);
      handleConfirmNavigate(finalTitle, resolvedCoords);
    } else if (typeof activeInput === 'number') {
      updateStop(activeInput, finalTitle);
      saveRecentLocation(finalTitle, resolvedCoords);
      // Move to next stop or drop
      if (activeInput < stops.length - 1) {
        setActiveInput(activeInput + 1);
      } else {
        setActiveInput('drop');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] w-full lg:max-w-7xl mx-auto font-sans relative overflow-hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:bg-none lg:bg-slate-50">
      
      {/* LEFT COLUMN - CONTENT */}
      <div className="lg:col-span-5 lg:h-screen lg:overflow-y-auto lg:border-r lg:border-slate-200 lg:bg-white lg:shadow-xl relative z-10 flex flex-col pb-6">
        <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-orange-100/55 blur-3xl pointer-events-none lg:hidden" />
        <div className="absolute top-56 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none lg:hidden" />
        <div className="absolute bottom-16 right-[-40px] h-44 w-44 rounded-full bg-blue-100/50 blur-3xl pointer-events-none lg:hidden" />
        
        <AnimatePresence>
          {showMapPicker && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              className="fixed inset-0 z-[100] bg-white flex flex-col w-full lg:absolute lg:inset-0 lg:max-w-none"
            >
              {/* Map Header */}
              <div className="absolute top-0 left-0 right-0 z-20 px-5 pt-10 pb-4 bg-gradient-to-b from-white via-white/80 to-transparent">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleMapBack}
                    className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border border-slate-100 active:scale-95 transition-all"
                  >
                    <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
                  </button>
                  <div className="min-w-0 flex-1 bg-white rounded-2xl shadow-lg border border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Select Point</p>
                    <p className="block w-full text-[14px] font-semibold text-slate-900 truncate leading-tight">
                      {isGeocoding ? 'Locating...' : pickedAddress}
                    </p>
                  </div>
                </div>
              </div>

              {/* Map Area */}
              <div className="flex-1 relative bg-slate-200">
                {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                    <div className="rounded-3xl bg-white px-8 py-10 shadow-xl border border-slate-100">
                      <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <X size={32} className="text-rose-400" />
                      </div>
                      <p className="text-[16px] font-bold text-slate-900">Config Error</p>
                      <p className="mt-2 text-[13px] font-medium text-slate-500">
                        Google Maps API Key is missing.
                      </p>
                    </div>
                  </div>
                ) : loadError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 px-6 text-center">
                    <div className="rounded-3xl bg-white px-8 py-10 shadow-xl border border-slate-100">
                      <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle size={32} className="text-rose-400" />
                      </div>
                      <p className="text-[16px] font-bold text-slate-900">Load Failed</p>
                      <p className="mt-2 text-[13px] font-medium text-slate-500">
                        Map could not be loaded. Please check your browser console or network.
                      </p>
                    </div>
                  </div>
                ) : isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={mapCenter}
                    zoom={16}
                    onLoad={(map) => (mapInstanceRef.current = map)}
                    onIdle={handleMapIdle}
                    onDragStart={() => setIsDragging(true)}
                    options={{
                      disableDefaultUI: true,
                      clickableIcons: false,
                      gestureHandling: 'greedy',
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                    <div className="relative">
                      <LoaderCircle size={44} className="animate-spin text-slate-300" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <MapIcon size={18} className="text-slate-200" />
                      </div>
                    </div>
                    <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-slate-400 animate-pulse">Initializing Maps</p>
                  </div>
                )}

                {/* Central Pin - Uber Style */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] pointer-events-none z-10">
                  <div className="relative">
                    <motion.div
                      animate={isDragging || isGeocoding ? { y: -12 } : { y: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="flex flex-col items-center"
                    >
                      <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shadow-2xl rotate-45 border-2 border-white">
                        <div className="-rotate-45">
                          <MapIcon size={18} className="text-white fill-white/20" />
                        </div>
                      </div>
                      {/* Stick */}
                      <div className="w-1 h-5 bg-slate-900 -mt-2 shadow-2xl" />
                    </motion.div>
                    {/* Shadow Dot */}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1 bg-black/30 rounded-full blur-sm" />
                  </div>
                </div>

                {/* Current Location FAB */}
                <button
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="absolute bottom-6 right-5 w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all z-20"
                >
                  {isLocating ? (
                    <LoaderCircle size={20} className="animate-spin text-slate-400" />
                  ) : (
                    <Navigation size={20} className="text-slate-900 fill-slate-900/10" />
                  )}
                </button>
              </div>

              {/* Confirm Actions */}
              <div className="px-5 pt-4 pb-10 bg-white border-t border-slate-50 space-y-4">
                <div className="flex items-center gap-3 py-1 px-1">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                    <MapPin size={20} className="text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[15px] font-bold text-slate-900 leading-none">Confirm Spot</h4>
                    <p className="text-[12px] font-medium text-slate-400 mt-1 line-clamp-1">{pickedAddress}</p>
                  </div>
                </div>
                <button
                  onClick={handleConfirmMapLocation}
                  disabled={isGeocoding}
                  className="w-full bg-slate-900 py-4 rounded-3xl text-white font-bold text-[15px] shadow-xl shadow-slate-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <Check size={18} strokeWidth={3} />
                  Confirm Location
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="sticky top-0 z-30 lg:bg-white lg:pt-4 lg:px-2">
          <div className="bg-white/70 backdrop-blur-md border-b border-white/70 shadow-[0_10px_20px_rgba(15,23,42,0.05)] lg:rounded-[24px] lg:border lg:border-slate-100">
            <div className="px-5 py-4 flex items-center gap-3">
              <button onClick={handleScreenBack} className="p-2 -ml-2 active:scale-95 transition-all rounded-full">
                <ArrowLeft size={22} className="text-slate-900" strokeWidth={3} />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ride</p>
                <h1 className="mt-0.5 text-[20px] font-bold text-slate-900 tracking-tight leading-none truncate">Where to?</h1>
              </div>
            </div>
          </div>
        </header>

        {/* Input Card */}
        <div className="relative z-10 px-5 pt-4">
          <div className="bg-white/80 backdrop-blur-md rounded-[22px] p-4 shadow-[0_18px_44px_rgba(15,23,42,0.08)] border border-white/80 lg:shadow-none lg:border-slate-100 lg:bg-slate-50/50">
            <div className="space-y-3">

              {/* Pickup Row */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-emerald-700 bg-white/70 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                  </div>
                </div>
                <div
                  className={`flex-1 flex items-center bg-white/70 border border-white/80 rounded-xl px-3 py-2.5 transition-all lg:bg-white ${activeInput === 'pickup' ? 'ring-2 ring-emerald-200 lg:ring-emerald-400/50' : 'lg:border-slate-200'}`}
                  onClick={() => setActiveInput('pickup')}
                >
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => setPickup(sanitizeLocationInput(e.target.value))}
                    onFocus={() => setActiveInput('pickup')}
                    placeholder="Your pickup location"
                    className="w-full bg-transparent border-none text-[15px] font-medium text-slate-900 focus:outline-none placeholder:text-slate-300"
                  />
                  {pickup.length > 0 && (
                    <button onClick={() => setPickup('')} className="ml-2 shrink-0">
                      <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dotted connector */}
              <div className="ml-[9px] h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70" />

              {/* Dynamic Stops */}
              <AnimatePresence>
                {stops.map((stop, idx) => (
                  <motion.div
                    key={`stop-${idx}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-500 bg-white/70 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        </div>
                      </div>
                      <div
                        className={`flex-1 flex items-center rounded-xl px-3 py-2.5 transition-all lg:bg-white lg:border-slate-200 ${stop.trim().length > 0
                            ? 'bg-white/90 border border-indigo-200 shadow-[0_10px_24px_rgba(99,102,241,0.10)] lg:shadow-none'
                            : 'bg-indigo-50/70 border border-indigo-100/70'
                          } ${activeInput === idx ? 'ring-2 ring-indigo-200 lg:ring-indigo-400/50' : ''}`}
                        onClick={() => setActiveInput(idx)}
                      >
                        <input
                          type="text"
                          value={stop}
                          autoFocus={activeInput === idx}
                          placeholder={`Stop ${idx + 1} location...`}
                          onFocus={() => setActiveInput(idx)}
                          onChange={(e) => updateStop(idx, sanitizeLocationInput(e.target.value))}
                          className={`w-full bg-transparent border-none text-[15px] font-medium text-slate-900 focus:outline-none ${stop.trim().length > 0 ? 'placeholder:text-slate-300' : 'placeholder:text-indigo-300'
                            }`}
                        />
                        {stop.length > 0 && (
                          <button onClick={() => updateStop(idx, '')} className="ml-2 shrink-0">
                            <X size={16} className="text-indigo-300 hover:text-indigo-600 transition-colors" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => removeStop(idx)}
                        className="w-7 h-7 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                      >
                        <Minus size={14} className="text-rose-500" strokeWidth={3} />
                      </button>
                    </div>
                    {/* Connector after each stop */}
                    <div className="ml-[9px] mt-3 h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70" />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Drop Row */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <div className="w-5 h-5 rounded-full border-2 border-orange-600 bg-white/70 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                  </div>
                </div>
                <div
                  className={`flex-1 flex items-center bg-white/70 border border-white/80 rounded-xl px-3 py-2.5 transition-all lg:bg-white lg:border-slate-200 ${activeInput === 'drop' ? 'ring-2 ring-orange-200 lg:ring-orange-400/50' : ''}`}
                  onClick={() => setActiveInput('drop')}
                >
                  <input
                    type="text"
                    value={drop}
                    autoFocus={activeInput === 'drop'}
                    placeholder="Enter drop location..."
                    onFocus={() => setActiveInput('drop')}
                    onChange={(e) => setDrop(sanitizeLocationInput(e.target.value))}
                    className="w-full bg-transparent border-none text-[15px] font-medium text-slate-900 focus:outline-none placeholder:text-slate-300"
                  />
                  {drop.length > 0 && (
                    <button onClick={() => setDrop('')} className="ml-2 shrink-0">
                      <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Action Pills */}
        <div className="relative z-10 flex gap-3 px-5 my-4">
          <button
            onClick={showMapToast}
            className="flex-1 flex items-center justify-center gap-2 bg-white/75 backdrop-blur-md border border-white/80 lg:bg-white lg:border-slate-200 rounded-full py-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] lg:shadow-sm active:scale-95 transition-all text-[13px] font-bold text-slate-800"
          >
            <MapPin size={16} className="text-slate-900" />
            <span>Select on map</span>
          </button>
          <button
            onClick={addStop}
            className="flex-1 flex items-center justify-center gap-2 rounded-full py-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] lg:shadow-sm active:scale-95 transition-all text-[13px] font-bold bg-white/75 backdrop-blur-md border border-white/80 lg:bg-white lg:border-slate-200 text-slate-800"
          >
            <div className="w-4 h-4 rounded bg-indigo-500 flex items-center justify-center">
              <Plus size={12} className="text-white" strokeWidth={3} />
            </div>
            <span>Add stop {stops.length > 0 ? `(${stops.length})` : ''}</span>
          </button>
        </div>

        {/* Stop count chips */}
        {stops.length > 0 && (
          <div className="relative z-10 px-5 mb-2">
            <div className="flex gap-2 flex-wrap">
              {stops.map((s, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-white/75 backdrop-blur-md border border-white/80 lg:bg-slate-50 lg:border-slate-200 rounded-full px-3 py-1 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-[12px] font-bold text-slate-700 truncate max-w-[110px]">
                    {s.trim() || `Stop ${idx + 1}`}
                  </span>
                  <button onClick={() => removeStop(idx)}>
                    <X size={11} className="text-slate-400 hover:text-slate-700" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        <div className="relative z-10 px-5 mb-4 pb-20 lg:pb-4">
          <h2 className="text-[14px] font-bold text-slate-400 mb-3 ml-1 uppercase tracking-widest">
            {query.trim().length > 0 ? 'Search Results' : currentZone?.name ? `${currentZone.name} Suggestions` : 'Popular Locations'}
          </h2>

          {searchResults.length > 0 ? (
            <div className="bg-white/75 backdrop-blur-md rounded-2xl border border-white/80 lg:bg-white lg:border-slate-100 overflow-hidden shadow-[0_14px_34px_rgba(15,23,42,0.06)] lg:shadow-sm">
              {/* Quick Go to Current Location */}
              <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={handleUseCurrentLocationResult}
                className="w-full text-left flex items-center gap-3 px-4 py-3.5 border-b border-white/70 lg:border-slate-100 bg-emerald-50/30 hover:bg-emerald-50/50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-100 shadow-sm flex items-center justify-center shrink-0">
                  {isLocating ? (
                    <LoaderCircle size={18} className="animate-spin text-emerald-500" />
                  ) : (
                    <Navigation size={18} className="text-emerald-500 fill-emerald-50" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-[15px] font-bold text-slate-900 leading-tight group-hover:text-emerald-600 transition-colors">Use Current Location</h4>
                  <p className="text-[12px] text-slate-400 font-medium mt-0.5">Perfect for accurate pickup</p>
                </div>
                <ChevronRight size={16} className="text-slate-300" />
              </motion.button>

              {searchResults.map((result, idx) => (
                <motion.button
                  key={idx}
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-white/70 lg:border-slate-100 last:border-none hover:bg-white/60 transition-colors"
                >
                  <div className="mt-0.5 w-10 h-10 rounded-2xl bg-white/70 lg:bg-slate-50 border border-white/80 lg:border-slate-100 shadow-sm flex items-center justify-center shrink-0 text-slate-500">
                    <MapPin size={18} strokeWidth={2.6} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-[15px] font-semibold text-slate-900 leading-tight">{result.title}</h4>
                    <p className="text-[13px] text-slate-500 font-medium mt-1 line-clamp-1">{result.address}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-3xl bg-white/80 border border-white/80 shadow-sm flex items-center justify-center mx-auto text-slate-400 text-[22px] font-bold">
                —
              </div>
              <p className="mt-3 text-[15px] font-semibold text-slate-600">
                No results for <span className="text-slate-900">"{query}"</span>
              </p>
              <p className="text-[13px] font-medium text-slate-400 mt-1">Try a different search term</p>
            </div>
          )}
          {query.trim().length >= 3 && (
            <div className="mt-3 px-1">
              <p className="text-[11px] font-bold text-slate-400">
                {isSearchingLocations
                  ? 'Searching locations inside your service zone...'
                  : zonePaths.length
                    ? 'Showing zone-prioritized results after 3+ characters.'
                    : 'Showing optimized search results after 3+ characters.'}
              </p>
            </div>
          )}
          {!query.trim().length && currentZone?.name && (
            <div className="mt-3 px-1">
              <p className="text-[11px] font-bold text-slate-400">
                Popular suggestions are pulled from the admin-created stores in the <span className="text-slate-600">{currentZone.name}</span> zone.
              </p>
            </div>
          )}
        </div>

        {/* Persistent Confirm Button */}
        <AnimatePresence>
          {pickup && drop && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed bottom-6 left-5 right-5 z-40 lg:absolute lg:bottom-6 lg:left-6 lg:right-6"
            >
              <button
                onClick={() => handleConfirmNavigate()}
                className="w-full bg-[#f8e001] py-4 rounded-3xl text-slate-900 font-bold text-[16px] shadow-[0_8px_30px_rgba(248,224,1,0.3)] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                Confirm & Proceed
                <ChevronRight size={18} strokeWidth={3} className="opacity-60" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RIGHT COLUMN - MAP (DESKTOP ONLY) */}
      <div className="hidden lg:block lg:col-span-7 lg:relative lg:h-screen lg:bg-slate-100 lg:rounded-l-3xl lg:overflow-hidden lg:shadow-inner">
        <div className="absolute inset-0 bg-slate-200 flex flex-col items-center justify-center">
           {/* We can show a placeholder or load the GoogleMap if key exists */}
           {!HAS_VALID_GOOGLE_MAPS_KEY ? (
              <div className="flex flex-col items-center text-slate-400">
                <MapIcon size={48} className="mb-4 opacity-50" />
                <p className="font-bold uppercase tracking-widest text-[13px]">Map View</p>
              </div>
           ) : isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapCenter}
                zoom={14}
                options={{
                  disableDefaultUI: true,
                  clickableIcons: false,
                  gestureHandling: 'greedy',
                }}
              />
           ) : (
             <div className="flex flex-col items-center justify-center text-slate-400">
               <LoaderCircle size={44} className="animate-spin mb-4" />
               <p className="font-bold uppercase tracking-widest text-[13px]">Loading Map...</p>
             </div>
           )}
           {/* Overlay overlaying the map with branding */}
           <div className="absolute top-6 right-6 bg-white/90 backdrop-blur px-4 py-2 rounded-2xl shadow-lg border border-slate-100 font-black text-[#FFC400] text-[18px] tracking-tight flex items-center gap-2">
             <MapPin className="text-[#FFC400]" size={20} fill="currentColor" /> Appzeto
           </div>
        </div>
      </div>
    </div>
  );
};

export default SelectLocation;
