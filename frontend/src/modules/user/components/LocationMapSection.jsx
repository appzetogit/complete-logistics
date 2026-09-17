import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { LoaderCircle, Navigation } from 'lucide-react';
import { GoogleMap } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { getSavedLocation, saveLocation, LOCATION_UPDATED_EVENT } from '../services/locationStore';
import { useUserTheme } from '../../../shared/context/UserThemeContext';

const DEFAULT_CENTER = { lat: 17.385, lon: 78.4867 };
const DEFAULT_ZOOM = 16;
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const AUTO_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const areCentersNearlyEqual = (first, second, threshold = 0.00001) => (
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
  Math.abs(Number(first?.lon ?? 0) - Number(second?.lon ?? 0)) < threshold
);

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }]
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }]
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }]
  }
];

const LocationMapSection = () => {
  const { theme } = useUserTheme();
  const isDark = theme === 'dark';
  const [coords, setCoords] = useState(null);
  const [centerCoords, setCenterCoords] = useState(DEFAULT_CENTER);
  const [status, setStatusState] = useState('idle');
  const setStatus = (newStatus) => {
    setStatusState(newStatus);
    try {
      window.dispatchEvent(new CustomEvent('Appzeto 24:location-status', { detail: newStatus }));
    } catch (e) {
      console.error(e);
    }
  };
  const [isDragging, setIsDragging] = useState(false);
  const [map, setMap] = useState(null);
  const isDraggingRef = useRef(false);
  const requestedLocationRef = useRef(false);
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const [address, setAddress] = useState(() => getSavedLocation()?.address || '');

  useEffect(() => {
    const handleUpdate = () => {
      const saved = getSavedLocation();
      setAddress(saved?.address || '');
      if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') {
        const nextCoords = { lat: saved.lat, lon: saved.lon };
        setCoords(nextCoords);
        setCenterCoords(nextCoords);
        setStatus('ready');
      }
    };
    window.addEventListener(LOCATION_UPDATED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(LOCATION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const persistCoords = (next) => {
    setCoords(next);
    setCenterCoords(next);
    setStatus('ready');
    saveLocation({
      ...next,
      updatedAt: Date.now(),
    });
  };

  const persistAddress = (address) => {
    saveLocation({ address: String(address || '').trim() });
  };

  useEffect(() => {
    const saved = getSavedLocation();
    if (typeof saved?.lat === 'number' && typeof saved?.lon === 'number') {
      persistCoords({ lat: saved.lat, lon: saved.lon });
    }

    const shouldRefreshCurrentLocation =
      !saved
      || typeof saved?.lat !== 'number'
      || typeof saved?.lon !== 'number'
      || !saved?.updatedAt
      || (Date.now() - saved.updatedAt) > AUTO_REFRESH_INTERVAL_MS;

    if (shouldRefreshCurrentLocation && !requestedLocationRef.current) {
      requestedLocationRef.current = true;
      requestLocation();
    }
  }, []);

  useEffect(() => {
    if (coords && map) {
      map.panTo({ lat: coords.lat, lng: coords.lon });
      map.setZoom(DEFAULT_ZOOM);
    }
  }, [coords, map]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }

    setStatus('loading');

    const handleSuccess = (position) => {
      const next = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };

      persistCoords(next);
      if (map) {
        map.panTo({ lat: next.lat, lng: next.lon });
        map.setZoom(DEFAULT_ZOOM);
      }

      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: { lat: next.lat, lng: next.lon } }, (results, geocodeStatus) => {
          if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
            try {
              persistAddress(results[0].formatted_address);
            } catch {
              // ignore
            }
          }
        });
      }
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        if (error?.code === 1) {
          setStatus('denied');
          return;
        }
        // Try fallback with low-accuracy for fast IP-based tracking
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          () => {
            setStatus('error');
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  };

  const helperText = (() => {
    if (status === 'loading') return 'Pinning your current location...';
    if (status === 'denied') return 'Location permission denied. Tap to try again.';
    if (status === 'error') return 'Unable to fetch location. Tap to retry.';
    if (isDragging) return 'Move the map to set the pin.';
    if (status === 'ready') return 'Drag the map to fine-tune. Tap Update to refresh GPS.';
    return 'Pin your current location, then adjust by dragging.';
  })();

  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    clickableIcons: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    gestureHandling: 'greedy',
    styles: theme === 'dark' ? darkMapStyle : undefined,
  }), [theme]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="w-full lg:px-5"
    >
      {/* Search Header for Desktop */}
      <div className="hidden lg:flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Map</p>
          <h3 className="mt-0.5 flex items-baseline gap-1 text-[16px] font-semibold text-slate-900">
            <span className="truncate">Pin your location</span>
            <span className="inline-flex" aria-hidden="true">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="inline-block"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1.05,
                    delay: dot * 0.18,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  .
                </motion.span>
              ))}
            </span>
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{helperText}</p>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={requestLocation}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/60 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow-[0_8px_16px_-4px_rgba(15,23,42,0.1)] transition-all active:shadow-inner"
        >
          <div className="relative">
            <Navigation
              size={14}
              strokeWidth={2.8}
              className={`transition-colors ${status === 'loading' ? 'animate-pulse text-yellow-500' : 'text-slate-500'}`}
            />
            {coords && (
              <motion.span
                layoutId="active-dot"
                className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
          <span className="uppercase tracking-wider">{coords ? 'Update' : 'Pin'}</span>
        </motion.button>
      </div>

      <div className="relative w-full lg:rounded-[20px] lg:bg-[linear-gradient(135deg,rgba(234,179,8,0.40)_0%,rgba(250,204,21,0.22)_50%,rgba(251,146,60,0.16)_100%)] lg:p-[1px] lg:shadow-[0_0_0_1px_rgba(234,179,8,0.10),0_10px_22px_rgba(15,23,42,0.06)]">
        <motion.div
          aria-hidden="true"
          className="hidden lg:block pointer-events-none absolute inset-0 z-0 rounded-[20px] blur-xl"
          animate={{ opacity: [0.14, 0.26, 0.14] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'linear-gradient(135deg, rgba(234,179,8,0.22) 0%, rgba(250,204,21,0.14) 52%, rgba(251,146,60,0.10) 100%)',
          }}
        />

        <div className={`relative z-10 overflow-hidden lg:rounded-[19px] border-b lg:border ${isDark ? 'border-zinc-800 bg-[#0f172a]' : 'border-slate-200 bg-[#F7F8FB]'}`}>
          <div className="relative h-[220px] lg:h-[480px] w-full">
            {!HAS_VALID_GOOGLE_MAPS_KEY && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className={`text-[12px] font-semibold ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>Google Maps key missing</p>
                  <p className={`mt-1 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>Add `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</p>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && loadError && (
              <div className="flex h-full w-full items-center justify-center px-5 text-center">
                <div>
                  <p className={`text-[12px] font-semibold ${isDark ? 'text-white' : 'text-[#0B1220]'}`}>Map failed to load</p>
                  <p className={`mt-1 text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-[#64748B]'}`}>Check your Google Maps browser key restrictions.</p>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && !isLoaded && (
              <div className="flex h-full w-full items-center justify-center">
                <div className={`flex items-center gap-2 rounded-[16px] px-4 py-3 shadow-sm ${isDark ? 'bg-zinc-900/90 text-white' : 'bg-white/90 text-slate-800'}`}>
                  <LoaderCircle size={18} className="animate-spin text-slate-500" />
                  <span className={`text-[12px] font-medium ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>Loading map</span>
                </div>
              </div>
            )}

            {HAS_VALID_GOOGLE_MAPS_KEY && !loadError && isLoaded && (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={{ lat: centerCoords.lat, lng: centerCoords.lon }}
                zoom={DEFAULT_ZOOM}
                onLoad={(nextMap) => setMap(nextMap)}
                onDragStart={() => {
                  isDraggingRef.current = true;
                  setIsDragging(true);
                }}
                onDragEnd={() => {
                  isDraggingRef.current = false;
                  setIsDragging(false);
                  if (!map) {
                    return;
                  }

                  const center = map.getCenter();
                  if (!center) {
                    return;
                  }

                  persistCoords({ lat: center.lat(), lon: center.lng() });
                  if (window.google?.maps?.Geocoder) {
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode(
                      { location: { lat: center.lat(), lng: center.lng() } },
                      (results, geocodeStatus) => {
                        if (geocodeStatus === 'OK' && results?.[0]?.formatted_address) {
                          persistAddress(results[0].formatted_address);
                        }
                      },
                    );
                  }
                }}
                onIdle={() => {
                  if (!map) {
                    return;
                  }

                  const center = map.getCenter();
                  if (!center) {
                    return;
                  }

                  const next = { lat: center.lat(), lon: center.lng() };

                  if (areCentersNearlyEqual(centerCoords, next)) {
                    return;
                  }

                  setCenterCoords(next);

                  if (!isDraggingRef.current && status === 'ready') {
                    saveLocation(next);
                  }
                }}
                options={mapOptions}
              />
            )}

            {/* The Pinpoint */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2">
              <motion.div
                initial={false}
                animate={{
                  scale: isDragging ? [1, 1.22, 1.15] : 1,
                  opacity: isDragging ? 0.28 : 0.55,
                  y: isDragging ? 7 : 0,
                }}
                className="absolute left-1/2 top-0 h-[3px] w-3.5 -translate-x-1/2 rounded-[100%] bg-slate-900/30 blur-[1.5px]"
              />

              <motion.div
                initial={false}
                animate={{
                  y: isDragging ? -20 : 0,
                  scale: isDragging ? 1.06 : 1,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 25,
                }}
                className="relative flex flex-col items-center -translate-y-1/2"
              >
                <div className="absolute -top-10 bg-[#FFB300] text-slate-950 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-white/20 select-none whitespace-nowrap">
                  Pickup point
                </div>

                <div className="w-[1.5px] h-3.5 bg-slate-900/60" />

                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-[0_3px_10px_rgba(0,0,0,0.2)] flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                </div>
              </motion.div>
            </div>


            {/* Floating locator target button (Mobile only) */}
            <button
              type="button"
              onClick={requestLocation}
              className="block lg:hidden absolute right-4 bottom-28 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 border border-white/10 text-white shadow-lg active:scale-95 transition-transform"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={status === 'loading' ? 'animate-pulse text-yellow-500' : 'text-white'}>
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
              </svg>
            </button>

            {!coords && status !== 'loading' && (
              <button
                type="button"
                onClick={requestLocation}
                className="absolute bottom-2 left-2 z-20 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[11px] font-medium text-slate-700 shadow-sm active:scale-[0.99]"
              >
                Use my location
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default LocationMapSection;
