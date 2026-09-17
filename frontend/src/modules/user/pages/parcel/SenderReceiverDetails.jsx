import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Contact,
  LocateFixed,
  MapPin,
  Mic,
  Navigation,
  PackageCheck,
  Phone,
  Plus,
  Search,
  User,
  X,
} from 'lucide-react';
import { GoogleMap } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { userAuthService } from '../../services/authService';
import api from '../../../../shared/api/axiosInstance';
import { computeDrivingRoute, sumComputedRouteLegs } from '../../../../shared/utils/googleRoutes';
import { useUserTheme } from '../../../../shared/context/UserThemeContext';

const Motion = motion;
const PHONE_REGEX = /^[6-9]\d{9}$/;
const PARCEL_BOOKING_DRAFT_KEY = 'parcelBookingDraft';
const DELIVERY_CATEGORY_SEARCH_TOKENS = {
  trucks: ['truck', 'lcv', 'hcv', 'mcv', 'loader'],
  '2wheeler': ['bike', 'scooter', 'cycle', '2-wheeler'],
  movers: ['mover', 'packers'],
};
const LOCATION_COORDS = {
  'Pipaliyahana, Indore': [75.9048, 22.7039],
  'Vijay Nagar': [75.8937, 22.7533],
  'Vijay Nagar Square': [75.8947, 22.7518],
  Rajwada: [75.8553, 22.7187],
  Bhawarkua: [75.8586, 22.6926],
  'MG Road': [75.8721, 22.7196],
  'Palasia Square': [75.8863, 22.7242],
  'LIG Colony': [75.8904, 22.7322],
  'Scheme No 54': [75.8978, 22.7567],
  'AB Road': [75.8878, 22.7423],
  'Geeta Bhawan': [75.8834, 22.7208],
  'Sapna Sangeeta': [75.8587, 22.6984],
  'Mahalaxmi Nagar': [75.9114, 22.7676],
};
const POPULAR_LOCATIONS = Object.keys(LOCATION_COORDS);
const DEFAULT_COORDS = { lat: 22.7196, lng: 75.8577 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const getCoords = (title, fallback = [75.8577, 22.7196]) => LOCATION_COORDS[title] || fallback;

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

const readStoredUserInfo = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const readParcelBookingDraft = () => {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(window.sessionStorage.getItem(PARCEL_BOOKING_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
};

const coordPairToLatLng = (coords, fallback = DEFAULT_COORDS) => {
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return fallback;
};

const latLngToCoordPair = (position) => [Number(position.lng), Number(position.lat)];

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords, toCoords) => {
  const from = coordPairToLatLng(fromCoords, null);
  const to = coordPairToLatLng(toCoords, null);

  if (!from || !to) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const getNearbyPopularLocations = (anchorCoords, excludedLocations = [], limit = 4) => {
  if (!Array.isArray(anchorCoords) || anchorCoords.length < 2) {
    return POPULAR_LOCATIONS.slice(0, limit);
  }

  const excluded = new Set(
    excludedLocations
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return Object.entries(LOCATION_COORDS)
    .filter(([name]) => !excluded.has(name.toLowerCase()))
    .map(([name, coords]) => ({
      name,
      distanceKm: calculateDistanceKm(anchorCoords, coords),
    }))
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, limit)
    .map((item) => item.name);
};

const normalizeDeliveryPricing = (vehicle = {}) => {
  const basePrice = Number(vehicle?.delivery_distance_pricing?.base_price ?? 0);
  const baseDistance = Number(
    vehicle?.delivery_distance_pricing?.base_distance
      ?? vehicle?.delivery_distance_pricing?.free_distance
      ?? 0,
  );
  const distancePrice = Number(vehicle?.delivery_distance_pricing?.distance_price ?? 0);
  const serviceTaxPercentage = Number(vehicle?.service_tax ?? 0);

  return {
    enabled: Boolean(
      vehicle?.delivery_distance_pricing?.enabled ||
      basePrice > 0 ||
      distancePrice > 0
    ),
    basePrice,
    baseDistance,
    distancePrice,
    serviceTaxPercentage,
  };
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateVehicleFare = (vehicle, distanceKm) => {
  const pricing = normalizeDeliveryPricing(vehicle);
  if (!pricing.enabled) {
    return null;
  }

  const normalizedDistanceKm = Math.max(Number(distanceKm || 0), 0);
  const extraDistanceKm = Math.max(normalizedDistanceKm - pricing.baseDistance, 0);
  const distanceCharge = extraDistanceKm * pricing.distancePrice;
  const subtotal = pricing.basePrice + distanceCharge;
  const serviceTaxAmount = (subtotal * pricing.serviceTaxPercentage) / 100;
  const total = subtotal + serviceTaxAmount;

  return {
    total: Math.max(0, roundCurrency(total)),
    subtotal: roundCurrency(subtotal),
    basePrice: pricing.basePrice,
    baseDistance: pricing.baseDistance,
    distancePrice: pricing.distancePrice,
    extraDistanceKm: roundCurrency(extraDistanceKm),
    distanceCharge: roundCurrency(distanceCharge),
    serviceTaxPercentage: roundCurrency(pricing.serviceTaxPercentage),
    serviceTaxAmount: roundCurrency(serviceTaxAmount),
  };
};

const formatCoordLabel = (coords) => {
  const position = coordPairToLatLng(coords);
  return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
};

const formatLatLngLabel = (position) => `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
const getLatLngCacheKey = (position, precision = 5) =>
  `${Number(position?.lat || 0).toFixed(precision)},${Number(position?.lng || 0).toFixed(precision)}`;
const getCoordPairCacheKey = (coords, precision = 5) =>
  Array.isArray(coords) && coords.length >= 2
    ? `${Number(coords[1] || 0).toFixed(precision)},${Number(coords[0] || 0).toFixed(precision)}`
    : '';
const getParcelRouteCacheKey = (pickupCoords, dropCoords) =>
  `${getCoordPairCacheKey(pickupCoords)}|${getCoordPairCacheKey(dropCoords)}`;
const COORDINATE_LABEL_REGEX = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const isCoordinateLabel = (value = '') => COORDINATE_LABEL_REGEX.test(String(value || '').trim());
const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || '').trim();
const isDeliveryVehicle = (vehicle) => vehicle?.active && ['delivery', 'both'].includes(String(vehicle?.transport_type || '').trim().toLowerCase());
const matchesDeliveryCategory = (vehicle, categoryId) => {
  const normalizedCategoryId = String(categoryId || '').trim().toLowerCase();
  if (!normalizedCategoryId) return false;

  const configuredCategory = String(vehicle?.delivery_category || '').trim().toLowerCase();
  if (configuredCategory) {
    return configuredCategory === normalizedCategoryId;
  }

  const searchTokens = DELIVERY_CATEGORY_SEARCH_TOKENS[normalizedCategoryId] || [];
  const vehicleName = String(vehicle?.name || '').toLowerCase();
  const iconType = String(vehicle?.icon_types || '').toLowerCase();
  return searchTokens.some((token) => vehicleName.includes(token) || iconType.includes(token));
};

const PhoneInput = ({ label, value, onChange, error, name, onClearError, disabled = false }) => (
  <div className="space-y-2">
    <label className="ml-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    <div
      className={`flex items-center gap-3 rounded-[18px] border p-4 transition-all ${
        error
          ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20'
          : value && PHONE_REGEX.test(value)
            ? 'border-emerald-100 bg-emerald-50 dark:border-emerald-850/40 dark:bg-slate-900/30'
            : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'
      }`}
    >
      <Phone
        size={18}
        className={
          error ? 'text-red-500' : value && PHONE_REGEX.test(value) ? 'text-emerald-500' : 'text-slate-400'
        }
      />
      <input
        type="tel"
        maxLength={10}
        disabled={disabled}
        className="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 outline-none placeholder:text-slate-300"
        value={value}
        placeholder="10-digit mobile number"
        onChange={(event) => {
          const nextValue = event.target.value.replace(/\D/g, '');
          onChange(nextValue);
          if (onClearError) onClearError(name, nextValue);
        }}
      />
      {value && PHONE_REGEX.test(value) ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" /> : null}
    </div>
    {error ? (
      <p className="ml-2 flex items-center gap-1 text-[11px] font-black text-red-500">
        <AlertCircle size={11} strokeWidth={3} />
        {error}
      </p>
    ) : null}
  </div>
);

const MapPickerSheet = ({ open, title, confirmLabel, value, initialCoords, onClose, onConfirm }) => {
  const { isLoaded, loadError } = useAppGoogleMapsLoader();
  const [center, setCenter] = useState(coordPairToLatLng(initialCoords));
  const [searchQuery, setSearchQuery] = useState(value || '');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const mapRef = useRef(null);
  const draggingRef = useRef(false);
  const geocodeTimerRef = useRef(null);
  const suggestionTimerRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const placesServiceRef = useRef(null);
  const suggestionCacheRef = useRef(new Map());
  const reverseGeocodeCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());
  const lastResolvedAddressRef = useRef(value || '');
  const ignoreAutocompleteRef = useRef(false);
  const ignoreGeocodingRef = useRef(false);
  const mapDraggedRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;

    const resetTimer = setTimeout(() => {
      setCenter(coordPairToLatLng(initialCoords));
      const nextValue = value || '';
      ignoreAutocompleteRef.current = true;
      mapDraggedRef.current = false;
      if (value && !isCoordinateLabel(value)) {
        ignoreGeocodingRef.current = true;
      }
      setSearchQuery(nextValue);
      setSearchSuggestions([]);
      lastResolvedAddressRef.current = nextValue;
    }, 0);

    return () => clearTimeout(resetTimer);
  }, [initialCoords, open, value]);

  useEffect(() => {
    if (!open || !isLoaded || !window.google?.maps?.Geocoder) return undefined;

    if (ignoreGeocodingRef.current) {
      ignoreGeocodingRef.current = false;
      return undefined;
    }

    if (!mapDraggedRef.current && !value) {
      return undefined;
    }

    clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(() => {
      const cacheKey = getLatLngCacheKey(center);
      const cachedAddress = reverseGeocodeCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        lastResolvedAddressRef.current = cachedAddress;
        ignoreAutocompleteRef.current = true;
        setSearchQuery(cachedAddress);
        return;
      }

      setIsResolvingAddress(true);
      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ location: center }, (results, status) => {
        setIsResolvingAddress(false);

        if (status === 'OK' && results?.[0]?.formatted_address) {
          const nextAddress = results[0].formatted_address;
          reverseGeocodeCacheRef.current.set(cacheKey, nextAddress);
          lastResolvedAddressRef.current = nextAddress;
          ignoreAutocompleteRef.current = true;
          setSearchQuery(nextAddress);
          return;
        }

        const fallbackAddress = formatLatLngLabel(center);
        lastResolvedAddressRef.current = fallbackAddress;
        ignoreAutocompleteRef.current = true;
        setSearchQuery(fallbackAddress);
      });
    }, 450);

    return () => clearTimeout(geocodeTimerRef.current);
  }, [center, isLoaded, open, value]);

  useEffect(() => {
    if (!open) {
      clearTimeout(suggestionTimerRef.current);
      return undefined;
    }

    const trimmedQuery = String(searchQuery || '').trim();
    clearTimeout(suggestionTimerRef.current);

    if (ignoreAutocompleteRef.current) {
      ignoreAutocompleteRef.current = false;
      setSearchSuggestions([]);
      setIsFetchingSuggestions(false);
      return undefined;
    }

    if (trimmedQuery.length < 1) {
      setSearchSuggestions([]);
      setIsFetchingSuggestions(false);
      return undefined;
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}|${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
    const cachedSuggestions = suggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setSearchSuggestions(cachedSuggestions);
      setIsFetchingSuggestions(false);
      return undefined;
    }

    let active = true;
    suggestionTimerRef.current = setTimeout(() => {
      // 1. Get local preset matches matching the query
      const localMatches = Object.keys(LOCATION_COORDS)
        .filter((name) => name.toLowerCase().includes(trimmedQuery.toLowerCase()))
        .slice(0, 5)
        .map((name) => ({
          id: name,
          label: name,
          secondaryText: 'Indore, Madhya Pradesh',
          description: name + ', Indore, Madhya Pradesh',
          coords: LOCATION_COORDS[name],
          placeId: '',
        }));

      // 2. Fetch Google predictions if user has typed 3+ characters
      if (isLoaded && window.google?.maps?.places?.AutocompleteService && trimmedQuery.length >= 3) {
        if (!autocompleteServiceRef.current) {
          autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
        }

        if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
          autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }

        setIsFetchingSuggestions(true);
        const request = {
          input: trimmedQuery,
          componentRestrictions: { country: 'in' },
          sessionToken: autocompleteSessionTokenRef.current || undefined,
          location: new window.google.maps.LatLng(center.lat, center.lng),
          radius: 10000,
        };

        autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
          if (!active) {
            return;
          }

          const googleSuggestions =
            status === 'OK' && Array.isArray(predictions)
              ? predictions.slice(0, 5).map((prediction) => ({
                  id: prediction.place_id || prediction.description,
                  label: prediction.structured_formatting?.main_text || prediction.description,
                  secondaryText: prediction.structured_formatting?.secondary_text || '',
                  description: prediction.description || '',
                  placeId: prediction.place_id || '',
                }))
              : [];

          // Merge presets and Google suggestions, then deduplicate
          const merged = [...localMatches, ...googleSuggestions];
          const seen = new Set();
          const normalizedSuggestions = merged.filter((item) => {
            const key = item.label.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          suggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
          setSearchSuggestions(normalizedSuggestions);
          setIsFetchingSuggestions(false);
        });
      } else {
        // Under 3 characters or Places API not ready: only show local presets matches
        setSearchSuggestions(localMatches);
        setIsFetchingSuggestions(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(suggestionTimerRef.current);
    };
  }, [center, isLoaded, open, searchQuery]);

  const resolveCoordsFromPlaceId = async (placeId) =>
    new Promise((resolve) => {
      const trimmedPlaceId = String(placeId || '').trim();
      const cached = placeSelectionCacheRef.current.get(trimmedPlaceId);
      if (cached) {
        resolve(cached);
        return;
      }

      if (!trimmedPlaceId || !isLoaded) {
        resolve(null);
        return;
      }

      if (window.google?.maps?.places?.PlacesService) {
        if (!placesServiceRef.current) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(document.createElement('div'));
        }

        placesServiceRef.current.getDetails(
          {
            placeId: trimmedPlaceId,
            sessionToken: autocompleteSessionTokenRef.current || undefined,
            fields: ['formatted_address', 'geometry.location', 'name'],
          },
          (place, status) => {
            const locationPoint = place?.geometry?.location;
            if (status === 'OK' && locationPoint) {
              const resolvedResult = {
                lat: locationPoint.lat(),
                lng: locationPoint.lng(),
                address: place.formatted_address || place.name || '',
              };
              placeSelectionCacheRef.current.set(trimmedPlaceId, resolvedResult);
              resolve(resolvedResult);
              return;
            }

            if (!window.google?.maps?.Geocoder) {
              resolve(null);
              return;
            }

            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ placeId: trimmedPlaceId }, (results, geocodeStatus) => {
              if (geocodeStatus !== 'OK' || !results?.[0]?.geometry?.location) {
                resolve(null);
                return;
              }

              const fallbackLocation = results[0].geometry.location;
              const resolvedResult = {
                lat: fallbackLocation.lat(),
                lng: fallbackLocation.lng(),
                address: results[0].formatted_address || '',
              };
              placeSelectionCacheRef.current.set(trimmedPlaceId, resolvedResult);
              resolve(resolvedResult);
            });
          },
        );
        return;
      }

      if (!window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: trimmedPlaceId }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedResult = {
          lat: locationPoint.lat(),
          lng: locationPoint.lng(),
          address: results[0].formatted_address || '',
        };
        placeSelectionCacheRef.current.set(trimmedPlaceId, resolvedResult);
        resolve(resolvedResult);
      });
    });

  const applySearchSuggestion = async (suggestion) => {
    let targetCoords = null;
    let resolvedAddress = suggestion.description || suggestion.label;

    if (Array.isArray(suggestion.coords) && suggestion.coords.length === 2) {
      // Direct local coordinate match
      const [lng, lat] = suggestion.coords;
      targetCoords = { lat, lng };
    } else if (suggestion.placeId) {
      // Autocomplete Google places resolve coordinates
      const resolved = await resolveCoordsFromPlaceId(suggestion.placeId);
      if (resolved) {
        targetCoords = { lat: resolved.lat, lng: resolved.lng };
        resolvedAddress = resolved.address || resolvedAddress;
      }
    }

    if (!targetCoords) {
      return;
    }

    ignoreGeocodingRef.current = true;
    ignoreAutocompleteRef.current = true;
    setCenter(targetCoords);
    setSearchQuery(resolvedAddress);
    setSearchSuggestions([]);
    lastResolvedAddressRef.current = resolvedAddress;

    if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
      autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }

    if (mapRef.current) {
      mapRef.current.panTo(targetCoords);
      mapRef.current.setZoom(17);
    }
  };

  const commitMapCenter = () => {
    if (!mapRef.current) return;
    const mapCenter = mapRef.current.getCenter();
    if (!mapCenter) return;

    setCenter({
      lat: mapCenter.lat(),
      lng: mapCenter.lng(),
    });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      console.warn('Location access is not available on this device.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setIsLocating(false);
        mapDraggedRef.current = true;
        setCenter(next);
        if (mapRef.current) {
          mapRef.current.panTo(next);
          mapRef.current.setZoom(16);
        }
      },
      () => {
        setIsLocating(false);
        console.warn('Could not fetch your current location.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
        <Motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute inset-x-0 bottom-0 top-[10%] mx-auto flex max-w-lg flex-col overflow-hidden rounded-t-[34px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Map Picker</p>
              <h3 className="text-lg font-black tracking-tight text-slate-900">{title}</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-500">
              <X size={18} />
            </button>
          </div>

          <div className="relative flex-1 bg-slate-100">
            {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={center}
                zoom={16}
                onLoad={(map) => {
                  mapRef.current = map;
                }}
                onUnmount={() => {
                  mapRef.current = null;
                }}
                onDragStart={() => {
                  draggingRef.current = true;
                  mapDraggedRef.current = true;
                }}
                onDragEnd={() => {
                  draggingRef.current = false;
                  commitMapCenter();
                }}
                onIdle={() => {
                  if (!mapRef.current || draggingRef.current) return;
                  commitMapCenter();
                }}
                options={{
                  disableDefaultUI: true,
                  zoomControl: false,
                  clickableIcons: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm font-bold text-slate-500">
                {loadError ? 'Map could not be loaded right now.' : 'Loading map...'}
              </div>
            )}

            <div className="absolute inset-x-0 top-0 px-4 pt-4">
              <div className="rounded-[22px] border border-white bg-white/92 px-4 py-4 shadow-xl backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {isResolvingAddress ? 'Resolving address...' : 'Set Location'}
                </p>
                <div className="relative mt-2">
                  <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => {
                      ignoreAutocompleteRef.current = false;
                      setSearchQuery(event.target.value);
                    }}
                    placeholder="Search area, street or landmark..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-3 text-[13px] font-semibold text-slate-900 outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-100"
                  />
                  {searchQuery.length > 0 && (
                    <button 
                      onClick={() => {
                        ignoreAutocompleteRef.current = true;
                        setSearchQuery('');
                      }} 
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {searchSuggestions.length > 0 ? (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/80 p-2">
                    {searchSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => applySearchSuggestion(item)}
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-white transition-colors"
                      >
                        <Navigation size={14} className="mt-0.5 shrink-0 text-slate-900 dark:text-white" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-black text-slate-800">{item.label}</p>
                          {item.secondaryText ? (
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.secondaryText}</p>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {Boolean(searchQuery) && isFetchingSuggestions ? (
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 animate-pulse">
                    Finding nearby address suggestions...
                  </p>
                ) : null}
              </div>
            </div>

            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-slate-900 dark:bg-zinc-800 shadow-xl">
                <MapPin size={18} className="text-white" />
              </div>
            </div>

            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={isLocating}
              className="absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-900 shadow-xl"
            >
              <LocateFixed size={20} className={isLocating ? 'animate-pulse text-slate-900 dark:text-white' : ''} />
            </button>
          </div>

          <div className="bg-white px-5 pb-8 pt-5">
            <button
              type="button"
              onClick={() => onConfirm(latLngToCoordPair(center), String(searchQuery || '').trim())}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
            >
              {confirmLabel}
              <ChevronRight size={16} />
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

const ContactDetailsSheet = ({
  open,
  onClose,
  onSave,
  senderName,
  setSenderName,
  senderMobile,
  setSenderMobile,
  useSelfForReceiver,
  setUseSelfForReceiver,
  receiverName,
  setReceiverName,
  receiverMobile,
  setReceiverMobile,
  errors,
  clearError,
}) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm">
        <Motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="absolute inset-x-0 bottom-0 mx-auto max-w-lg overflow-hidden rounded-t-[34px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-850 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Booking Details</p>
              <h3 className="text-lg font-black tracking-tight text-slate-900">Sender & receiver</h3>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
              <X size={18} />
            </button>
          </div>

          <div className="max-h-[75vh] space-y-6 overflow-y-auto px-5 py-5">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                  <User size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Sender</p>
              </div>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.senderName ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={senderName}
                    placeholder="Sender name"
                    onChange={(event) => {
                      setSenderName(event.target.value);
                      clearError('senderName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.senderName ? <p className="text-[11px] font-black text-red-500">{errors.senderName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={senderMobile} onChange={setSenderMobile} error={errors.senderMobile} name="senderMobile" onClearError={clearError} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                  <Contact size={16} />
                </div>
                <p className="text-sm font-black text-slate-900">Receiver</p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-[24px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-slate-900/10 px-4 py-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 group">
                <div className="relative flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={useSelfForReceiver}
                    onChange={(event) => setUseSelfForReceiver(event.target.checked)}
                    className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border-2 border-slate-200 dark:border-zinc-700 bg-white dark:bg-slate-900 checked:bg-slate-900 checked:border-slate-900 dark:checked:bg-white dark:checked:border-white transition-all"
                  />
                  <CheckCircle2 size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-black text-slate-900 group-hover:text-slate-950 transition-colors">Same as Sender</p>
                  <p className="text-[11px] font-bold text-slate-400">Use sender's name and mobile for receiver</p>
                </div>
              </label>

              <div className="space-y-2">
                <div className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 ${errors.receiverName ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-slate-900/30'} ${useSelfForReceiver ? 'opacity-70' : ''}`}>
                  <User size={16} className="text-slate-400" />
                  <input
                    type="text"
                    value={receiverName}
                    placeholder="Receiver name"
                    disabled={useSelfForReceiver}
                    onChange={(event) => {
                      setReceiverName(event.target.value);
                      clearError('receiverName');
                    }}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  />
                </div>
                {errors.receiverName ? <p className="text-[11px] font-black text-red-500">{errors.receiverName}</p> : null}
              </div>

              <PhoneInput label="Mobile Number" value={receiverMobile} onChange={setReceiverMobile} error={errors.receiverMobile} name="receiverMobile" onClearError={clearError} disabled={useSelfForReceiver} />
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-zinc-850 px-5 py-4">
            <button
              type="button"
              onClick={onSave}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-slate-900 text-sm font-black text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]"
            >
              Save Details
              <ChevronRight size={16} />
            </button>
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

const SenderReceiverDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const { isLoaded: isGoogleMapsLoaded } = useAppGoogleMapsLoader();
  const storedParcelDraft = useMemo(() => readParcelBookingDraft(), []);
  const parcelState = useMemo(
    () => ({ ...storedParcelDraft, ...(location.state || {}) }),
    [location.state, storedParcelDraft],
  );
  const storedUser = useMemo(() => readStoredUserInfo(), []);
  const [senderName, setSenderName] = useState(() => parcelState.senderName || storedUser?.name || '');
  const [senderMobile, setSenderMobile] = useState(() => parcelState.senderMobile || storedUser?.phone || '');
  const [useSelfForReceiver, setUseSelfForReceiver] = useState(() => {
    const receiverNameSeed = String(parcelState.receiverName || '').trim();
    const receiverMobileSeed = String(parcelState.receiverMobile || '').trim();
    const userNameSeed = String(storedUser?.name || '').trim();
    const userPhoneSeed = String(storedUser?.phone || '').trim();
    return Boolean(
      receiverNameSeed &&
      receiverMobileSeed &&
      receiverNameSeed === userNameSeed &&
      receiverMobileSeed === userPhoneSeed,
    );
  });
  const [receiverName, setReceiverName] = useState(() => parcelState.receiverName || '');
  const [receiverMobile, setReceiverMobile] = useState(() => parcelState.receiverMobile || '');
  const [pickup, setPickup] = useState(() => parcelState.pickup || '');
  const [drop, setDrop] = useState(() => parcelState.drop || '');
  const [pickupCoords, setPickupCoords] = useState(() => parcelState.pickupCoords || getCoords(parcelState.pickup || '', [75.8577, 22.7196]));
  const [dropCoords, setDropCoords] = useState(() => parcelState.dropCoords || (parcelState.drop ? getCoords(parcelState.drop || '') : null));
  const [activeInput, setActiveInput] = useState(() => {
    if (location.state?.activeInput === 'pickup' || location.state?.editPickup) {
      return 'pickup';
    }
    return 'drop';
  });
  const [isContactSheetOpen, setIsContactSheetOpen] = useState(false);
  const [isLocatingPickup, setIsLocatingPickup] = useState(false);
  const [errors, setErrors] = useState({});
  const [recoveredSelectedVehicles, setRecoveredSelectedVehicles] = useState([]);
  const [googleSuggestions, setGoogleSuggestions] = useState([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [zones, setZones] = useState([]);
  const [zonePaths, setZonePaths] = useState([]);
  const [serviceStores, setServiceStores] = useState([]);
  const [routeEstimate, setRouteEstimate] = useState({ distanceKm: 0, durationMinutes: 0, source: 'air' });
  const autoPickupRequestedRef = useRef(false);
  const livePickupHydratedRef = useRef(false);
  const dropInputRef = useRef(null);
  const dropGeocodeTimerRef = useRef(null);
  const dropSuggestionTimerRef = useRef(null);
  const dropSuggestionCacheRef = useRef(new Map());
  const autocompleteServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const addressLookupCacheRef = useRef(new Map());
  const placeIdLookupCacheRef = useRef(new Map());
  const routeEstimateCacheRef = useRef(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PARCEL_BOOKING_DRAFT_KEY, JSON.stringify({
      ...parcelState,
      senderName,
      senderMobile,
      receiverName,
      receiverMobile,
      pickup,
      drop,
      pickupCoords,
      dropCoords,
    }));
  }, [drop, dropCoords, parcelState, pickup, pickupCoords, receiverMobile, receiverName, senderMobile, senderName]);

  useEffect(() => {
    let active = true;

    const loadZoneData = async () => {
      try {
        const [zonesResponse, storesResponse] = await Promise.all([
          api.get('/admin/zones'),
          api.get('/users/service-stores'),
        ]);
        if (!active) {
          return;
        }

        const allZones = unwrapResults(zonesResponse).filter(isZoneActive);
        const allPaths = allZones.map(normalizeZonePath).filter((path) => path.length >= 3);
        const allStores = unwrapResults(storesResponse).filter((store) => {
          return store?.active !== false && String(store?.status || '').toLowerCase() !== 'inactive';
        });

        setZones(allZones);
        setZonePaths(allPaths);
        setServiceStores(allStores);
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
  }, []);

  useEffect(() => {
    if (dropInputRef.current) {
      dropInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateSenderDetails = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || response?.data?.data || {};

        if (!active || (!user?.name && !user?.phone)) return;

        const nextName = user.name || '';
        const nextPhone = user.phone || '';

        if (nextName || nextPhone) {
          window.localStorage.setItem('userInfo', JSON.stringify({ ...storedUser, ...user }));
        }

        setSenderName((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.name || '').trim() ? nextName || current : current));
        setSenderMobile((current) => (!String(current || '').trim() || String(current || '').trim() === String(storedUser?.phone || '').trim() ? nextPhone || current : current));
      } catch {
        // ignore and keep fallback info
      }
    };

    hydrateSenderDetails();

    return () => {
      active = false;
    };
  }, [storedUser]);

  useEffect(() => {
    const selectedVehicleIds = Array.isArray(parcelState.selectedVehicleIds)
      ? parcelState.selectedVehicleIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const selectedVehicleId = String(parcelState.selectedVehicleId || '').trim();
    const selectedIdSet = new Set([...selectedVehicleIds, selectedVehicleId].filter(Boolean));
    const deliveryCategory = String(parcelState.deliveryCategory || parcelState.category || '').trim().toLowerCase();

    if (!selectedIdSet.size && !deliveryCategory) {
      setRecoveredSelectedVehicles([]);
      return undefined;
    }

    let active = true;

    const recoverSelectedVehicles = async () => {
      try {
        const response = await api.get('/users/vehicle-types');
        const items = response?.data?.results || response?.results || response?.data?.data?.results || [];
        const deliveryVehicles = Array.isArray(items) ? items.filter(isDeliveryVehicle) : [];

        let matchedVehicles = deliveryVehicles.filter((vehicle) => selectedIdSet.has(getVehicleId(vehicle)));
        if (matchedVehicles.length === 0 && deliveryCategory) {
          matchedVehicles = deliveryVehicles.filter((vehicle) => matchesDeliveryCategory(vehicle, deliveryCategory));
        }

        if (!active) return;
        setRecoveredSelectedVehicles(matchedVehicles);
      } catch {
        if (!active) return;
        setRecoveredSelectedVehicles([]);
      }
    };

    recoverSelectedVehicles();

    return () => {
      active = false;
    };
  }, [parcelState.category, parcelState.deliveryCategory, parcelState.selectedVehicle, parcelState.selectedVehicleId, parcelState.selectedVehicleIds, parcelState.selectedVehicles]);

  const query = useMemo(() => (activeInput === 'pickup' ? pickup : drop), [activeInput, drop, pickup]);

  const currentZone = useMemo(() => {
    if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2 || !zones.length) {
      return null;
    }

    const [lng, lat] = pickupCoords;
    const point = { lat: Number(lat), lng: Number(lng) };

    return zones.find((zone) => {
      const zonePath = normalizeZonePath(zone);
      return zonePath.length >= 3 && isPointInPolygon(point, zonePath);
    }) || null;
  }, [pickupCoords, zones]);

  const currentZoneId = currentZone ? getZoneId(currentZone) : null;

  const zoneStores = useMemo(() => {
    if (!currentZoneId) return [];
    return serviceStores.filter((store) => {
      const storeZoneId = getStoreZoneId(store);
      return String(storeZoneId) === String(currentZoneId);
    });
  }, [currentZoneId, serviceStores]);

  const popularSuggestions = useMemo(() => {
    if (zoneStores.length > 0) {
      return zoneStores.slice(0, 6).map((store) => ({
        title: store.name || store.address || 'Service Store',
        address: store.address || currentZone?.name || 'Service Store',
        coords:
          Number.isFinite(Number(store.longitude)) && Number.isFinite(Number(store.latitude))
            ? [Number(store.longitude), Number(store.latitude)]
            : null,
      }));
    }

    return POPULAR_LOCATIONS.filter((item) => item.toLowerCase().includes(String(query || '').toLowerCase())).slice(0, 6).map(name => ({
      title: name,
      address: name + ', Indore, Madhya Pradesh',
      coords: getCoords(name),
    }));
  }, [zoneStores, currentZone, query]);

  const nearbySuggestions = useMemo(() => {
    if (activeInput === 'drop' && Array.isArray(pickupCoords) && pickupCoords.length === 2) {
      return getNearbyPopularLocations(pickupCoords, [pickup, drop], 4);
    }
    return [];
  }, [activeInput, drop, pickup, pickupCoords]);
  const selectedVehicles = useMemo(() => {
    if (Array.isArray(recoveredSelectedVehicles) && recoveredSelectedVehicles.length) {
      return recoveredSelectedVehicles;
    }
    return [];
  }, [recoveredSelectedVehicles]);
  const primarySelectedVehicle = useMemo(() => {
    return selectedVehicles[0] || null;
  }, [selectedVehicles]);
  const estimatedDistanceKm = useMemo(
    () => calculateDistanceKm(pickupCoords, dropCoords),
    [dropCoords, pickupCoords],
  );
  const effectiveDistanceKm = Number(routeEstimate?.distanceKm || 0) > 0
    ? Number(routeEstimate.distanceKm)
    : estimatedDistanceKm;

  useEffect(() => {
    let active = true;
    const routeCacheKey = getParcelRouteCacheKey(pickupCoords, dropCoords);

    if (!Array.isArray(pickupCoords) || pickupCoords.length !== 2 || !Array.isArray(dropCoords) || dropCoords.length !== 2) {
      setRouteEstimate({ distanceKm: 0, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    if (!isGoogleMapsLoaded || !window.google?.maps?.importLibrary) {
      setRouteEstimate({ distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' });
      return undefined;
    }

    const cachedRouteEstimate = routeEstimateCacheRef.current.get(routeCacheKey);
    if (cachedRouteEstimate) {
      setRouteEstimate(cachedRouteEstimate);
      return undefined;
    }

    void (async () => {
      const result = await computeDrivingRoute({
        origin: coordPairToLatLng(pickupCoords),
        destination: coordPairToLatLng(dropCoords),
      });

      if (!active) {
        return;
      }

      if (result.status !== 'OK' || !result.legs.length) {
        const fallbackEstimate = { distanceKm: estimatedDistanceKm, durationMinutes: 0, source: 'air' };
        routeEstimateCacheRef.current.set(routeCacheKey, fallbackEstimate);
        setRouteEstimate(fallbackEstimate);
        return;
      }

      const totals = sumComputedRouteLegs(result.legs);
      const nextRouteEstimate = {
        distanceKm: roundCurrency(totals.distanceMeters / 1000),
        durationMinutes: Math.max(0, Math.ceil(totals.durationSeconds / 60)),
        source: 'road',
      };
      routeEstimateCacheRef.current.set(routeCacheKey, nextRouteEstimate);
      setRouteEstimate(nextRouteEstimate);
    })();

    return () => {
      active = false;
    };
  }, [dropCoords, estimatedDistanceKm, isGoogleMapsLoaded, pickupCoords]);

  const estimatedFare = useMemo(() => {
    if (!drop.trim()) {
      return null;
    }

    const primaryFare = calculateVehicleFare(primarySelectedVehicle, effectiveDistanceKm);
    if (!Number.isFinite(primaryFare?.total)) {
      return null;
    }

    return {
      min: primaryFare.total,
      max: primaryFare.total,
      approx: Math.round(primaryFare.total),
      dynamic: true,
      minBaseDistance: Number(primaryFare.baseDistance || 0),
      maxBaseDistance: Number(primaryFare.baseDistance || 0),
      subtotal: Number(primaryFare.subtotal || 0),
      serviceTaxPercentage: Number(primaryFare.serviceTaxPercentage || 0),
      serviceTaxAmount: Number(primaryFare.serviceTaxAmount || 0),
    };
  }, [drop, effectiveDistanceKm, primarySelectedVehicle]);

  const validate = () => {
    const nextErrors = {};
    if (!senderName.trim()) nextErrors.senderName = 'Sender name is required';
    if (!PHONE_REGEX.test(senderMobile)) nextErrors.senderMobile = 'Enter a valid 10-digit number';
    if (!receiverName.trim()) nextErrors.receiverName = 'Receiver name is required';
    if (!PHONE_REGEX.test(receiverMobile)) nextErrors.receiverMobile = 'Enter a valid 10-digit number';
    if (!pickup.trim()) nextErrors.pickup = 'Pickup location is required';
    if (!drop.trim()) nextErrors.drop = 'Drop location is required';
    setErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      nextErrors,
    };
  };

  const clearError = (key) => {
    if (!errors[key]) return;
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const syncReceiverWithSelf = () => {
    const nextName = String(storedUser?.name || senderName || '').trim();
    const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

    setReceiverName(nextName);
    setReceiverMobile(nextPhone);
    setErrors((prev) => ({
      ...prev,
      receiverName: '',
      receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
    }));
  };

  useEffect(() => {
    if (!useSelfForReceiver) return;
    const timer = setTimeout(() => {
      const nextName = String(storedUser?.name || senderName || '').trim();
      const nextPhone = String(storedUser?.phone || senderMobile || '').trim();

      setReceiverName(nextName);
      setReceiverMobile(nextPhone);
      setErrors((prev) => ({
        ...prev,
        receiverName: '',
        receiverMobile: nextPhone && !PHONE_REGEX.test(nextPhone) ? 'Enter a valid 10-digit number' : '',
      }));
    }, 0);

    return () => clearTimeout(timer);
  }, [senderMobile, senderName, storedUser, useSelfForReceiver]);

  const validatePhoneField = (key, value) => {
    const trimmedValue = String(value || '').trim();

    setErrors((prev) => {
      const nextError = trimmedValue && !PHONE_REGEX.test(trimmedValue) ? 'Enter a valid 10-digit number' : '';
      if (prev[key] === nextError) return prev;
      return { ...prev, [key]: nextError };
    });
  };

  const clearPhoneError = (key, value) => {
    validatePhoneField(key, value);
  };

  const openSharedLocationPicker = (targetInput) => {
    navigate(`${routePrefix}/ride/select-location`, {
      state: {
        ...parcelState,
        flow: 'parcel',
        returnTo: `${routePrefix}/parcel/details`,
        openMapPicker: true,
        activeInput: targetInput,
        editPickup: targetInput === 'pickup',
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
      },
    });
  };

  const resolveAddressFromCoords = useEffectEvent((position) =>
    new Promise((resolve) => {
      const cacheKey = getLatLngCacheKey(position);
      const cachedAddress = addressLookupCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        resolve(cachedAddress);
        return;
      }

      if (!isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(formatLatLngLabel(position));
        return;
      }
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          addressLookupCacheRef.current.set(cacheKey, results[0].formatted_address);
          resolve(results[0].formatted_address);
          return;
        }
        resolve(formatLatLngLabel(position));
      });
    }));

  const resolveCoordsFromAddress = useEffectEvent((address) =>
    new Promise((resolve) => {
      const trimmedAddress = String(address || '').trim();
      const cacheKey = trimmedAddress.toLowerCase();
      const cachedCoords = addressLookupCacheRef.current.get(cacheKey);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedAddress || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      const addressQuery = /indore/i.test(trimmedAddress) ? trimmedAddress : `${trimmedAddress}, Indore`;

      geocoder.geocode({ address: addressQuery }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        addressLookupCacheRef.current.set(cacheKey, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  const resolveCoordsFromPlaceId = useEffectEvent((placeId) =>
    new Promise((resolve) => {
      const trimmedPlaceId = String(placeId || '').trim();
      const cachedCoords = placeIdLookupCacheRef.current.get(trimmedPlaceId);
      if (cachedCoords) {
        resolve(cachedCoords);
        return;
      }

      if (!trimmedPlaceId || !isGoogleMapsLoaded || !window.google?.maps?.Geocoder) {
        resolve(null);
        return;
      }

      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ placeId: trimmedPlaceId }, (results, status) => {
        if (status !== 'OK' || !results?.[0]?.geometry?.location) {
          resolve(null);
          return;
        }

        const locationPoint = results[0].geometry.location;
        const resolvedCoords = latLngToCoordPair({ lat: locationPoint.lat(), lng: locationPoint.lng() });
        placeIdLookupCacheRef.current.set(trimmedPlaceId, resolvedCoords);
        resolve(resolvedCoords);
      });
    }));

  const requestCurrentPickupLocation = useEffectEvent(() => {
    if (!navigator.geolocation) {
      setErrors((prev) => ({ ...prev, pickup: 'Current location is not available' }));
      return;
    }

    setIsLocatingPickup(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        const coords = latLngToCoordPair(next);
        const address = await resolveAddressFromCoords(next);
        setPickupCoords(coords);
        setPickup(address || formatLatLngLabel(next));
        clearError('pickup');
        setIsLocatingPickup(false);
      },
      () => {
        setIsLocatingPickup(false);
        setErrors((prev) => ({ ...prev, pickup: 'Location permission denied' }));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });

  useEffect(() => {
    if (autoPickupRequestedRef.current || livePickupHydratedRef.current) return;
    autoPickupRequestedRef.current = true;
    livePickupHydratedRef.current = true;
    const timer = setTimeout(() => {
      requestCurrentPickupLocation();
    }, 0);

    return () => clearTimeout(timer);
  }, [requestCurrentPickupLocation]);

  useEffect(() => {
    if (!pickupCoords || !pickup || !isCoordinateLabel(pickup) || !isGoogleMapsLoaded) {
      return;
    }

    let active = true;

    resolveAddressFromCoords(coordPairToLatLng(pickupCoords)).then((resolvedAddress) => {
      if (!active || !resolvedAddress || isCoordinateLabel(resolvedAddress)) {
        return;
      }

      setPickup((current) => (isCoordinateLabel(current) ? resolvedAddress : current));
    });

    return () => {
      active = false;
    };
  }, [isGoogleMapsLoaded, pickup, pickupCoords]);

  useEffect(() => {
    const trimmedQuery = String(query || '').trim();

    clearTimeout(dropGeocodeTimerRef.current);
    clearTimeout(dropSuggestionTimerRef.current);

    if (!trimmedQuery) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const presetCoords = LOCATION_COORDS[trimmedQuery];
    if (presetCoords) {
      if (activeInput === 'pickup') {
        setPickupCoords(presetCoords);
      } else {
        setDropCoords(presetCoords);
      }
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (!isGoogleMapsLoaded || isCoordinateLabel(trimmedQuery)) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    if (trimmedQuery.length < 3 || !window.google?.maps?.places?.AutocompleteService) {
      setGoogleSuggestions([]);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}|${activeInput}|${Array.isArray(pickupCoords) ? pickupCoords.join(',') : ''}`;
    const cachedSuggestions = dropSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setGoogleSuggestions(cachedSuggestions);
      setIsFetchingSuggestions(false);
      return () => clearTimeout(dropGeocodeTimerRef.current);
    }

    let active = true;
    dropSuggestionTimerRef.current = setTimeout(() => {
      if (!autocompleteServiceRef.current) {
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      }
      if (!autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }

      setIsFetchingSuggestions(true);
      const request = {
        input: trimmedQuery,
        componentRestrictions: { country: 'in' },
        types: ['geocode'],
        sessionToken: autocompleteSessionTokenRef.current || undefined,
      };

      if (activeInput === 'drop' && Array.isArray(pickupCoords) && window.google?.maps?.Circle) {
        request.locationBias = new window.google.maps.Circle({
          center: coordPairToLatLng(pickupCoords),
          radius: 12000,
        });
      }

      autocompleteServiceRef.current.getPlacePredictions(request, (predictions = [], status) => {
        if (!active) {
          return;
        }

        const normalizedSuggestions =
          status === 'OK'
            ? predictions.slice(0, 5).map((prediction) => ({
                id: prediction.place_id || prediction.description,
                label: prediction.structured_formatting?.main_text || prediction.description,
                secondaryText: prediction.structured_formatting?.secondary_text || '',
                description: prediction.description || '',
                placeId: prediction.place_id || '',
                source: 'google',
              }))
            : [];

        dropSuggestionCacheRef.current.set(cacheKey, normalizedSuggestions);
        setGoogleSuggestions(normalizedSuggestions);
        setIsFetchingSuggestions(false);
      });
    }, 350);

    return () => {
      active = false;
      clearTimeout(dropGeocodeTimerRef.current);
      clearTimeout(dropSuggestionTimerRef.current);
    };
  }, [query, isGoogleMapsLoaded, pickupCoords, activeInput]);

  const applySuggestion = async (type, suggestion) => {
    const value = typeof suggestion === 'string' ? suggestion : suggestion?.title || suggestion?.label || suggestion?.description || '';

    if (type === 'pickup') {
      setPickup(value);
      if (typeof suggestion === 'string') {
        setPickupCoords(getCoords(value));
      } else if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
        setPickupCoords(suggestion.coords);
      } else if (suggestion?.placeId) {
        const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
        setPickupCoords(resolvedCoords);
      }
      clearError('pickup');
      setActiveInput('drop');
      return;
    }

    setDrop(value);
    if (typeof suggestion === 'string') {
      setDropCoords(getCoords(value));
    } else if (Array.isArray(suggestion?.coords) && suggestion.coords.length === 2) {
      setDropCoords(suggestion.coords);
    } else if (suggestion?.placeId) {
      const resolvedCoords = await resolveCoordsFromPlaceId(suggestion.placeId);
      setDropCoords(resolvedCoords);
      if (autocompleteSessionTokenRef.current && window.google?.maps?.places?.AutocompleteSessionToken) {
        autocompleteSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
      }
    }
    setGoogleSuggestions([]);
    clearError('drop');
  };

  const handleProceed = async ({ fromContactSheet = false } = {}) => {
    const { isValid, nextErrors } = validate();

    if (!isValid) {
      if (nextErrors.senderName || nextErrors.senderMobile || nextErrors.receiverName || nextErrors.receiverMobile) {
        setIsContactSheetOpen(true);
        return;
      }

      if (fromContactSheet) {
        setIsContactSheetOpen(false);
      }
      return;
    }

    let resolvedPickupCoords = pickupCoords;
    let resolvedDropCoords = dropCoords;

    if (!resolvedPickupCoords && pickup.trim()) {
      resolvedPickupCoords = LOCATION_COORDS[pickup.trim()] || (await resolveCoordsFromAddress(pickup));
      if (resolvedPickupCoords) {
        setPickupCoords(resolvedPickupCoords);
      }
    }

    if (!resolvedDropCoords && drop.trim()) {
      resolvedDropCoords = LOCATION_COORDS[drop.trim()] || (await resolveCoordsFromAddress(drop));
      if (resolvedDropCoords) {
        setDropCoords(resolvedDropCoords);
      }
    }

    setIsContactSheetOpen(false);
    navigate(`${routePrefix}/parcel/searching`, {
      state: {
        ...parcelState,
        pickup,
        drop,
        pickupCoords: resolvedPickupCoords,
        dropCoords: resolvedDropCoords,
        senderName,
        senderMobile,
        receiverName,
        receiverMobile,
        paymentMethod: 'Cash',
        fare: estimatedFare?.approx ?? estimatedFare?.min ?? null,
        estimatedFare,
        estimatedDistanceKm,
        deliveryScope: parcelState.deliveryScope || 'city',
        isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
        parcel: {
          category: parcelState.parcelType || 'Parcel',
          weight: parcelState.weight || 'Under 5kg',
          description: parcelState.description || '',
          deliveryCategory: parcelState.deliveryCategory || parcelState.parcel?.deliveryCategory || '',
          goodsTypeFor: parcelState.goodsTypeFor || parcelState.parcel?.goodsTypeFor || '',
          deliveryScope: parcelState.deliveryScope || 'city',
          isOutstation: Boolean(parcelState.isOutstation || parcelState.deliveryScope === 'outstation'),
          senderName,
          senderMobile,
          receiverName,
          receiverMobile,
        },
        isParcel: true,
        searchNonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
  };

  return (
    <div className="relative mx-auto flex min-h-screen max-w-lg flex-col overflow-x-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f7f9fc_100%)] font-sans">
      <ContactDetailsSheet
        open={isContactSheetOpen}
        onClose={() => setIsContactSheetOpen(false)}
        onSave={() => handleProceed({ fromContactSheet: true })}
        senderName={senderName}
        setSenderName={setSenderName}
        senderMobile={senderMobile}
        setSenderMobile={setSenderMobile}
        useSelfForReceiver={useSelfForReceiver}
        setUseSelfForReceiver={(checked) => {
          setUseSelfForReceiver(checked);
          if (!checked) {
            return;
          }
          syncReceiverWithSelf();
        }}
        receiverName={receiverName}
        setReceiverName={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverName(value);
        }}
        receiverMobile={receiverMobile}
        setReceiverMobile={(value) => {
          if (useSelfForReceiver) {
            setUseSelfForReceiver(false);
          }
          setReceiverMobile(value);
        }}
        errors={errors}
        clearError={(key, value) => {
          if (key === 'senderMobile' || key === 'receiverMobile') {
            clearPhoneError(key, value);
            return;
          }
          clearError(key);
        }}
      />

      {/* Background visual blobs for rich depth */}
      <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-64 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-32 right-[-40px] h-48 w-48 rounded-full bg-indigo-100/50 blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md px-5 py-4 border-b border-slate-100/80 dark:border-zinc-800/80 flex items-center gap-3">
        <button 
          onClick={() => navigate(-1)} 
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-800 dark:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm active:scale-95 transition-all"
        >
          <ArrowLeft size={20} className="text-slate-900 dark:text-white" strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100">Parcel Delivery</p>
          <h1 className="mt-0.5 text-[18px] font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate">Details & Address</h1>
        </div>
      </header>

      <main className="flex-1 px-4 pt-2 pb-28 z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[32px] bg-white dark:bg-[#111827] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.08)] border border-slate-50 dark:border-zinc-850 relative"
        >
          <div className="space-y-3">
            {/* Pickup Row */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="w-5 h-5 rounded-full border-2 border-emerald-700 bg-white/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                </div>
              </div>
              <div
                className={`flex-1 flex bg-transparent border rounded-2xl px-4 py-2.5 transition-all cursor-pointer items-center ${
                  activeInput === 'pickup' ? 'border-slate-900 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/10 text-slate-800 dark:text-white' : 'border-slate-100 dark:border-zinc-800/60 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50'
                } ${errors.pickup ? 'border-red-400' : ''}`}
                onClick={() => setActiveInput('pickup')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Pick Up From</p>
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => {
                      setPickup(e.target.value);
                      clearError('pickup');
                    }}
                    onFocus={() => setActiveInput('pickup')}
                    placeholder="Search pickup location..."
                    className="w-full bg-transparent border-none text-[14px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-450 mt-0.5"
                  />
                </div>
                {pickup.length > 0 && activeInput === 'pickup' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickup('');
                    }} 
                    className="ml-2 shrink-0"
                  >
                    <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                  </button>
                )}
              </div>
            </div>

            {/* Dotted connector */}
            <div className="ml-[9px] h-2 w-[1.5px] border-l-[1.5px] border-dotted border-slate-300/70 dark:border-zinc-800/60" />

            {/* Drop Row */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className="w-5 h-5 rounded-full border-2 border-orange-600 bg-white/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
                </div>
              </div>
              <div
                className={`flex-1 flex bg-transparent border rounded-2xl px-4 py-2.5 transition-all cursor-pointer items-center ${
                  activeInput === 'drop' ? 'border-slate-900 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/10 text-slate-800 dark:text-white' : 'border-slate-100 dark:border-zinc-800/60 hover:bg-slate-100/50 dark:hover:bg-zinc-800/50'
                } ${errors.drop ? 'border-red-400' : ''}`}
                onClick={() => setActiveInput('drop')}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Deliver To</p>
                  <input
                    ref={dropInputRef}
                    type="text"
                    value={drop}
                    autoFocus={activeInput === 'drop'}
                    onFocus={() => setActiveInput('drop')}
                    onChange={(e) => {
                      setDrop(e.target.value);
                      clearError('drop');
                    }}
                    placeholder="Search drop location..."
                    className="w-full bg-transparent border-none text-[14px] font-bold text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-450 mt-0.5"
                  />
                </div>
                {drop.length > 0 && activeInput === 'drop' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrop('');
                    }} 
                    className="ml-2 shrink-0"
                  >
                    <X size={16} className="text-slate-300 hover:text-slate-600 transition-colors" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Pills */}
        <div className="relative z-10 flex gap-3 my-5">
          <button
            onClick={() => openSharedLocationPicker(activeInput)}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-100 rounded-2xl py-3.5 shadow-sm hover:shadow-md hover:border-slate-200 active:scale-95 transition-all text-[13px] font-bold text-slate-800 group"
          >
            <MapPin size={16} className="text-slate-900 dark:text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span>Pin on map</span>
          </button>
          
          <button
            onClick={() => setIsContactSheetOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-100 rounded-2xl py-3.5 shadow-sm hover:shadow-md hover:border-slate-200 active:scale-95 transition-all text-[13px] font-bold text-slate-800 group"
          >
            <User size={16} className="text-slate-900 dark:text-white group-hover:scale-110 transition-transform" strokeWidth={2.5} />
            <span>Contact Details</span>
          </button>
        </div>

        {/* Contact details badge */}
        {(senderName || receiverName) && (
          <div className="mx-1 mb-5 bg-gradient-to-r from-slate-50/70 to-slate-100/30 rounded-2xl p-4 border-l-4 border-l-slate-900 border border-slate-100 flex items-center justify-between gap-3 text-[12px] shadow-sm">
            <div className="flex-1 min-w-0 space-y-1.5">
              {senderName && (
                <div className="flex items-center gap-2 text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Sender:</span>
                  <span className="truncate font-semibold text-slate-700">{senderName} ({senderMobile})</span>
                </div>
              )}
              {receiverName && (
                <div className="flex items-center gap-2 text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Receiver:</span>
                  <span className="truncate font-semibold text-slate-700">{receiverName} ({receiverMobile})</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsContactSheetOpen(true)}
              className="text-[11px] font-black text-slate-900 dark:text-white hover:text-slate-800 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-zinc-700 shadow-sm uppercase tracking-wider shrink-0 transition-colors"
            >
              Edit
            </button>
          </div>
        )}

        <div className="mt-5 space-y-5 px-2">
          <h2 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
            {query.trim().length > 0 ? 'Search Results' : 'Suggestions'}
          </h2>

          {googleSuggestions.length > 0 ? (
            <div className="space-y-2">
              {googleSuggestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => applySuggestion(activeInput, item)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left shadow-sm hover:border-slate-300 transition-colors"
                >
                  <div className="mt-0.5 w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-slate-400">
                    <Navigation size={14} className="text-slate-900 dark:text-white fill-slate-900/10" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-black text-slate-800">{item.label}</p>
                    {item.secondaryText ? (
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{item.secondaryText}</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {!query.trim().length && nearbySuggestions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Near Current Pickup</p>
              <div className="grid grid-cols-2 gap-2">
                {nearbySuggestions.map((item) => (
                  <button
                    key={item}
                    onClick={() => applySuggestion(activeInput, item)}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm hover:border-slate-300 transition-colors"
                  >
                    <MapPin size={12} className="shrink-0 text-emerald-500" />
                    <span className="truncate text-[12px] font-bold text-slate-700">{item}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!query.trim().length && popularSuggestions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.16em]">Popular Locations</p>
              <div className="grid grid-cols-2 gap-2">
                {popularSuggestions.map((item) => (
                  <button
                    key={item.title || item}
                    onClick={() => applySuggestion(activeInput, item)}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-sm hover:border-slate-300 transition-colors"
                  >
                    <Navigation size={12} className="text-slate-900 dark:text-white shrink-0" />
                    <span className="text-[12px] font-bold text-slate-700 truncate">{item.title || item}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {Boolean(query) && isFetchingSuggestions ? (
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm animate-pulse">
              Finding suggestions...
            </div>
          ) : null}
        </div>

        <motion.section 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.12 }} 
          className={`mt-8 rounded-[30px] p-6 shadow-xl relative overflow-hidden border transition-colors ${
            isDark 
              ? 'bg-gradient-to-br from-slate-900 to-slate-950 text-white border-slate-800' 
              : 'bg-gradient-to-r from-amber-100 via-yellow-100 to-yellow-50 text-slate-900 border-yellow-200/60 shadow-md'
          }`}
        >
          <div className={`absolute right-[-20px] top-[-20px] w-36 h-36 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-indigo-500/10' : 'bg-yellow-400/20'}`} />
          <div className={`absolute left-[-20px] bottom-[-20px] w-36 h-36 rounded-full blur-2xl pointer-events-none ${isDark ? 'bg-emerald-500/5' : 'bg-emerald-400/10'}`} />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Approx. Delivery Fare</p>
              <p className={`mt-1 text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {estimatedFare ? `Rs ${estimatedFare.approx ?? estimatedFare.min}` : '--'}
              </p>
              <p className={`mt-1 text-[11px] font-bold ${isDark ? 'text-slate-450' : 'text-slate-600'}`}>
                {estimatedFare
                  ? `Based on ${routeEstimate.source === 'road' ? 'road' : 'approx'} travel of ${effectiveDistanceKm.toFixed(1)} km`
                  : 'Enter drop location to view live fare'}
              </p>
              {estimatedFare ? (
                <>
                  <p className={`mt-1 text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Base fare covers {estimatedFare.minBaseDistance === estimatedFare.maxBaseDistance
                      ? `${estimatedFare.maxBaseDistance.toFixed(1)} km`
                      : `${estimatedFare.minBaseDistance.toFixed(1)}-${estimatedFare.maxBaseDistance.toFixed(1)} km`}
                    {' '}before extra charges.
                  </p>
                  <p className={`mt-1 text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Subtotal Rs {Number(estimatedFare.subtotal || 0).toFixed(2)} + service tax {Number(estimatedFare.serviceTaxPercentage || 0).toFixed(2)}% (Rs {Number(estimatedFare.serviceTaxAmount || 0).toFixed(2)})
                  </p>
                </>
              ) : null}
            </div>
             <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shrink-0 ${isDark ? 'bg-white/10 border border-white/10' : 'bg-white shadow-sm border border-slate-200/60'}`}>
               <PackageCheck size={28} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
             </div>
          </div>
        </motion.section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-30 p-6">
        <div className="mx-auto max-w-lg relative">
          <div className="absolute inset-x-0 bottom-0 -mb-6 h-32 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleProceed}
            className="relative flex h-16 w-full items-center justify-center gap-3 rounded-[24px] bg-slate-900 text-[15px] font-black text-white shadow-[0_20px_40px_rgba(15,23,42,0.2)] group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-slate-800 to-slate-950 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10">
               {drop ? 'Confirm Receiver Details' : 'Select Drop Location'}
            </span>
            <ChevronRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default SenderReceiverDetails;
