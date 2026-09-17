import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Clock,
  Navigation,
  X,
  ShieldCheck,
  Star,
  Info,
  MapPinned,
  Check,
  AlertTriangle,
  User,
  Pencil,
  ArrowUpDown,
  PhoneCall,
  Briefcase,
  Compass
} from 'lucide-react';
import { userService } from '../../services/userService';
import { GoogleMap } from '@react-google-maps/api';
import { useAppGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER } from '../../../admin/utils/googleMaps';
import toast from 'react-hot-toast';

const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();

const serializePackageForFlow = (pkg = {}) => ({
  id: pkg.id || '',
  serviceLocationId: pkg.serviceLocationId || '',
  serviceLocationName: pkg.serviceLocationName || '',
  packageTypeId: pkg.packageTypeId || '',
  packageTypeName: pkg.packageTypeName || '',
  destination: pkg.destination || '',
  availability: pkg.availability || 'available',
  vehicles: Array.isArray(pkg.vehicles)
    ? pkg.vehicles.map((vehicle, index) => ({
      id: vehicle.id || `${pkg.id || 'pkg'}:${vehicle.vehicleTypeId || index}`,
      vehicleTypeId: vehicle.vehicleTypeId || '',
      vehicleName: vehicle.vehicleName || 'Vehicle',
      capacity: Number(vehicle.capacity || 0),
      icon: vehicle.icon || '',
      iconType: vehicle.iconType || vehicle.vehicleName || 'car',
      dispatchType: String(vehicle.dispatchType || 'normal').trim().toLowerCase(),
      supportsBidding: ['bidding', 'both'].includes(String(vehicle.dispatchType || 'normal').trim().toLowerCase()),
      basePrice: Number(vehicle.basePrice || 0),
      freeDistance: Number(vehicle.freeDistance || 0),
      distancePrice: Number(vehicle.distancePrice || 0),
      freeTime: Number(vehicle.freeTime || 0),
      timePrice: Number(vehicle.timePrice || 0),
      serviceTax: Number(vehicle.serviceTax || 0),
      cancellationFee: Number(vehicle.cancellationFee || 0),
    }))
    : [],
});

const formatDateToDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
};

const formatTimeTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayHour).padStart(2, '0')}:${minutes} ${ampm}`;
};

const normalizeSuggestionKey = (result) =>
  `${String(result?.title || '').trim().toLowerCase()}|${String(result?.address || '').trim().toLowerCase()}`;
const MAP_REVERSE_GEOCODE_DEBOUNCE_MS = 450;
const getLatLngCacheKey = (coords, precision = 5) =>
  `${Number(coords?.lat || 0).toFixed(precision)},${Number(coords?.lng || 0).toFixed(precision)}`;

const IntercityHome = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Locations State
  const [fromCity, setFromCity] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);

  const [toCitySearch, setToCitySearch] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [isToFocused, setIsToFocused] = useState(false);

  // Date and Time State
  const [travelDate, setTravelDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [travelTime, setTravelTime] = useState(() => {
    const now = new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour from now
    return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  });

  const [tripType, setTripType] = useState('One Way');

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapCenter, setMapCenter] = useState(INDIA_CENTER);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mapSearchInput, setMapSearchInput] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [isSearchingMapLocations, setIsSearchingMapLocations] = useState(false);
  const [isMapSearchFocused, setIsMapSearchFocused] = useState(false);
  const [isEditingPickup, setIsEditingPickup] = useState(false);
  const mapInstanceRef = useRef(null);
  const lastCenterRef = useRef(INDIA_CENTER);
  const dateTimeInputRef = useRef(null);
  const mapSearchInputRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteSessionTokenRef = useRef(null);
  const mapSearchCacheRef = useRef(new Map());
  const latestMapSearchRef = useRef(0);
  const reverseGeocodeTimerRef = useRef(null);
  const reverseGeocodeCacheRef = useRef(new Map());
  const placeSelectionCacheRef = useRef(new Map());

  const { isLoaded } = useAppGoogleMapsLoader();

  useEffect(() => {
    const loadPackages = async () => {
      try {
        setLoading(true);
        const response = await userService.getIntercityPackages();
        const results = Array.isArray(response?.results) ? response.results : [];
        setPackages(results);

        // Initial setup for fromCity if results exist
        if (results.length > 0 && !fromCity && results[0]?.serviceLocationName) {
          setFromCity(results[0].serviceLocationName);
        }
      } catch (err) {
        setError('Could not load intercity packages');
      } finally {
        setLoading(false);
      }
    };
    loadPackages();
  }, []);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places?.AutocompleteService) {
      return;
    }

    autocompleteServiceRef.current = autocompleteServiceRef.current || new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = placesServiceRef.current || new window.google.maps.places.PlacesService(document.createElement('div'));
    autocompleteSessionTokenRef.current = autocompleteSessionTokenRef.current
      || new window.google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  // Set current location on mount if allowed
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMapCenter(coords);
          setPickupCoords([coords.lng, coords.lat]);
          reverseGeocode(coords);
        },
        null,
        { enableHighAccuracy: true }
      );
    }
  }, [isLoaded]);

  const reverseGeocode = (coords) => {
    if (!window.google?.maps?.Geocoder) return;

    const cacheKey = getLatLngCacheKey(coords);
    const cached = reverseGeocodeCacheRef.current.get(cacheKey);
    if (cached) {
      setPickupAddress(cached.address);
      if (cached.cityName) {
        const matched = packages.find((pkg) => pkg.serviceLocationName.toLowerCase() === cached.cityName.toLowerCase());
        if (matched) {
          setFromCity(matched.serviceLocationName);
        }
      }
      return;
    }

    setIsGeocoding(true);
    const geocoder = geocoderRef.current || new window.google.maps.Geocoder();
    geocoderRef.current = geocoder;
    geocoder.geocode({ location: coords }, (results, status) => {
      setIsGeocoding(false);
      if (status === 'OK' && results?.[0]) {
        const address = results[0].formatted_address;
        setPickupAddress(address);

        // Find city name to filter packages
        const cityObj = results[0].address_components.find(c =>
          c.types.includes('locality') || c.types.includes('administrative_area_level_2')
        );
        const cityName = cityObj?.long_name || '';
        reverseGeocodeCacheRef.current.set(cacheKey, {
          address,
          cityName,
        });

        if (cityObj) {
          // Check if this city exists in our packages
          const matched = packages.find(p => p.serviceLocationName.toLowerCase() === cityName.toLowerCase());
          if (matched) {
            setFromCity(matched.serviceLocationName);
          }
        }
      }
    });
  };

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

  const resolveSuggestionSelection = async (result) => {
    const cacheKey = String(result?.placeId || normalizeSuggestionKey(result));
    if (cacheKey) {
      const cached = placeSelectionCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const placesService = placesServiceRef.current;
    const geocoder = geocoderRef.current || (window.google?.maps?.Geocoder ? new window.google.maps.Geocoder() : null);
    geocoderRef.current = geocoder;

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
              const resolvedResult = {
                address: place.formatted_address || result.address || result.title || '',
                coords: { lat: location.lat(), lng: location.lng() },
              };
              if (cacheKey) {
                placeSelectionCacheRef.current.set(cacheKey, resolvedResult);
              }
              resolve(resolvedResult);
              return;
            }

            if (!geocoder || !result.placeId) {
              resolve(null);
              return;
            }

            geocoder.geocode({ placeId: result.placeId }, (results, geocodeStatus) => {
              const geocodedPlace = results?.[0];
              const geocodedLocation = geocodedPlace?.geometry?.location;

                if (geocodeStatus === 'OK' && geocodedLocation) {
                  const resolvedResult = {
                    address: geocodedPlace.formatted_address || result.address || result.title || '',
                    coords: { lat: geocodedLocation.lat(), lng: geocodedLocation.lng() },
                  };
                  if (cacheKey) {
                    placeSelectionCacheRef.current.set(cacheKey, resolvedResult);
                  }
                  resolve(resolvedResult);
                  return;
                }

              resolve(null);
            });
          },
        );
      });
    }

    return null;
  };

  const handleMapIdle = () => {
    if (!mapInstanceRef.current || !window.google?.maps?.Geocoder) return;
    const center = mapInstanceRef.current.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    const diff = Math.abs(lat - lastCenterRef.current.lat) + Math.abs(lng - lastCenterRef.current.lng);

    if (diff < 0.00001) {
      setIsDragging(false);
      return;
    }

    lastCenterRef.current = { lat, lng };
    setIsDragging(false);
    if (reverseGeocodeTimerRef.current) {
      window.clearTimeout(reverseGeocodeTimerRef.current);
    }

    reverseGeocodeTimerRef.current = window.setTimeout(() => {
      reverseGeocode({ lat, lng });
    }, MAP_REVERSE_GEOCODE_DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (reverseGeocodeTimerRef.current) {
      window.clearTimeout(reverseGeocodeTimerRef.current);
    }
  }, []);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const nextCenter = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapInstanceRef.current) {
          mapInstanceRef.current.panTo(nextCenter);
          mapInstanceRef.current.setZoom(17);
        } else {
          setMapCenter(nextCenter);
        }
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true }
    );
  };

  const handleOpenMapPicker = () => {
    const center = Array.isArray(pickupCoords) && pickupCoords.length === 2
      ? { lat: pickupCoords[1], lng: pickupCoords[0] }
      : mapCenter;

    setMapCenter(center);
    lastCenterRef.current = center;
    setMapSearchInput(pickupAddress || '');
    setMapSearchResults([]);
    setIsSearchingMapLocations(false);
    setIsMapSearchFocused(false);
    setIsEditingPickup(false);
    setShowMapPicker(true);
  };

  const handleEditPickup = () => {
    setIsEditingPickup(true);
    setMapSearchInput('');
    setMapSearchResults([]);
    setIsMapSearchFocused(true);

    window.setTimeout(() => {
      mapSearchInputRef.current?.focus();
    }, 0);
  };

  const handleMapSearchSuggestionSelect = async (result) => {
    const resolved = await resolveSuggestionSelection(result);
    if (!resolved?.coords) {
      return;
    }

    const nextCenter = resolved.coords;
    lastCenterRef.current = nextCenter;
    setMapCenter(nextCenter);
    setPickupAddress(resolved.address);
    setMapSearchInput(resolved.address);
    setMapSearchResults([]);
    setIsMapSearchFocused(false);
    setIsEditingPickup(false);
    resetAutocompleteSessionToken();

    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(nextCenter);
      mapInstanceRef.current.setZoom(17);
    }
  };

  useEffect(() => {
    const trimmedQuery = mapSearchInput.trim();

    if (
      !showMapPicker
      || !isMapSearchFocused
      || !trimmedQuery
      || trimmedQuery.length < 4
      || !HAS_VALID_GOOGLE_MAPS_KEY
      || !autocompleteServiceRef.current
      || trimmedQuery === String(pickupAddress || '').trim()
    ) {
      setMapSearchResults([]);
      setIsSearchingMapLocations(false);
      return;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const cached = mapSearchCacheRef.current.get(normalizedQuery);
    if (cached) {
      setMapSearchResults(cached);
      setIsSearchingMapLocations(false);
      return;
    }

    const requestId = latestMapSearchRef.current + 1;
    latestMapSearchRef.current = requestId;
    setIsSearchingMapLocations(true);

    const timeoutId = window.setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: trimmedQuery,
          componentRestrictions: { country: 'in' },
          sessionToken: getAutocompleteSessionToken(),
          locationBias: { center: mapCenter, radius: 30000 },
        },
        (predictions = [], status) => {
          if (latestMapSearchRef.current !== requestId) {
            return;
          }

          const nextResults = status === 'OK'
            ? predictions.slice(0, 6).map((prediction) => ({
              title: prediction.structured_formatting?.main_text || prediction.description,
              address: prediction.description,
              placeId: prediction.place_id,
            }))
            : [];

          mapSearchCacheRef.current.set(normalizedQuery, nextResults);
          setMapSearchResults(nextResults);
          setIsSearchingMapLocations(false);
        },
      );
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isMapSearchFocused, mapCenter, mapSearchInput, pickupAddress, showMapPicker]);

  const filteredPackages = useMemo(() => {
    const query = normalizeSearchValue(toCitySearch);

    if (query) {
      return packages.filter((pkg) =>
        normalizeSearchValue(pkg.destination).includes(query) ||
        normalizeSearchValue(pkg.packageTypeName).includes(query) ||
        normalizeSearchValue(pkg.serviceLocationName).includes(query)
      );
    }

    return packages;
  }, [packages, toCitySearch]);

  const handleSwapLocations = () => {
    if (!pickupAddress && !toCitySearch && !selectedPackage) return;

    const prevPickupAddress = pickupAddress;
    const prevFromCity = fromCity;

    const newPickup = selectedPackage?.destination || toCitySearch || '';
    setPickupAddress(newPickup);
    setPickupCoords(null);

    const newDest = prevPickupAddress || prevFromCity || '';
    setToCitySearch(newDest);

    // Try to find a package that matches this reverse route
    const reversedPkg = packages.find(
      (pkg) =>
        pkg.serviceLocationName.toLowerCase().trim() === newPickup.toLowerCase().trim() &&
        pkg.destination.toLowerCase().trim() === newDest.toLowerCase().trim()
    );

    if (reversedPkg) {
      setSelectedPackage(reversedPkg);
      setFromCity(reversedPkg.serviceLocationName);
    } else {
      setSelectedPackage(null);
      if (newPickup) {
        setFromCity(newPickup);
      }
    }
  };

  const handleDateTimeChange = (e) => {
    const val = e.target.value; // YYYY-MM-DDTHH:MM
    if (val) {
      const [d, t] = val.split('T');
      setTravelDate(d);
      setTravelTime(t);
    }
  };

  const triggerDateTimePicker = () => {
    if (dateTimeInputRef.current) {
      if (typeof dateTimeInputRef.current.showPicker === 'function') {
        dateTimeInputRef.current.showPicker();
      } else {
        dateTimeInputRef.current.focus();
        dateTimeInputRef.current.click();
      }
    }
  };

  const handleExploreCabs = () => {
    if (!pickupAddress) {
      toast.error('Please set your Pickup Location');
      setShowMapPicker(true);
      return;
    }

    if (!selectedPackage) {
      // Check if we can auto-match the current drop search query to a package
      const match = packages.find(p => p.destination.toLowerCase().trim() === toCitySearch.toLowerCase().trim());
      if (match) {
        setSelectedPackage(match);
        proceedWithPackage(match);
      } else {
        toast.error('Please select a valid Drop Location from the suggestions');
        setIsToFocused(true);
      }
      return;
    }

    proceedWithPackage(selectedPackage);
  };

  const proceedWithPackage = (pkg) => {
    const flowPackage = serializePackageForFlow(pkg);
    const effectiveFromCity = flowPackage.serviceLocationName || fromCity || 'Pickup City';
    const combinedScheduledAt = new Date(`${travelDate}T${travelTime}`);

    navigate(`${routePrefix}/intercity/vehicle`, {
      state: {
        fromCity: effectiveFromCity,
        toCity: flowPackage.destination,
        tripType,
        rideMode: 'schedule',
        date: travelDate,
        scheduledAt: combinedScheduledAt.toISOString(),
        selectedPackages: [flowPackage],
        pickupAddress,
        pickupCoords
      }
    });
  };

  const displayDateStr = formatDateToDDMMYYYY(travelDate);
  const displayTimeStr = formatTimeTo12Hour(travelTime);

  return (
    <div className="min-h-screen bg-[#F8FAFC] max-w-lg mx-auto font-sans relative overflow-x-hidden flex flex-col pb-28">
      {/* Map Picker Modal */}
      <AnimatePresence>
        {showMapPicker && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            className="fixed inset-0 z-[100] bg-white flex flex-col max-w-lg mx-auto"
          >
            <div className="absolute top-0 left-0 right-0 z-20 px-6 pt-12 pb-6 bg-gradient-to-b from-white via-white/95 to-transparent">
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMapPicker(false)}
                  className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100"
                >
                  <ArrowLeft size={20} className="text-slate-900" strokeWidth={2.5} />
                </motion.button>
                <div className="flex-1 bg-white rounded-[24px] shadow-lg border border-blue-50 px-5 py-4 min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Pinpoint Pickup</p>
                    <button
                      type="button"
                      onClick={handleEditPickup}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600"
                    >
                      <Pencil size={10} />
                      Edit
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditingPickup ? (
                      <>
                        <Search size={14} className="shrink-0 text-slate-400" />
                        <input
                          ref={mapSearchInputRef}
                          type="text"
                          value={mapSearchInput}
                          onChange={(event) => setMapSearchInput(event.target.value)}
                          onFocus={() => setIsMapSearchFocused(true)}
                          placeholder={isGeocoding ? 'Finding exact address...' : 'Search pickup location'}
                          className="w-full bg-transparent text-[14px] font-bold text-slate-900 outline-none placeholder:text-slate-400"
                        />
                      </>
                    ) : (
                      <p className="truncate text-[14px] font-bold text-slate-900 leading-tight">
                        {isGeocoding ? 'Finding exact address...' : (pickupAddress || 'Set location on map')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {(isSearchingMapLocations || mapSearchResults.length > 0) ? (
                <div className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  {isSearchingMapLocations ? (
                    <div className="flex items-center gap-2 px-1 py-2 text-[12px] font-bold text-slate-500">
                      <LoaderCircle size={14} className="animate-spin text-blue-500" />
                      Searching suggestions...
                    </div>
                  ) : null}
                  {mapSearchResults.map((result) => (
                    <button
                      key={normalizeSuggestionKey(result)}
                      type="button"
                      onClick={() => handleMapSearchSuggestionSelect(result)}
                      className="flex w-full items-start gap-3 rounded-2xl px-1 py-3 text-left transition hover:bg-slate-50"
                    >
                      <MapPin size={15} className="mt-0.5 shrink-0 text-blue-500" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-black text-slate-900">{result.title}</span>
                        <span className="mt-0.5 block text-[12px] font-bold leading-5 text-slate-500">{result.address}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex-1 relative bg-slate-100">
              {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={mapCenter}
                  zoom={15}
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
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50 p-10 text-center">
                  <AlertTriangle size={40} className="text-amber-400" />
                  <p className="text-[14px] font-bold text-slate-500">
                    Map service unavailable. Please check your connection or API key.
                  </p>
                </div>
              )}

              {/* Pin Overlay */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[100%] pointer-events-none z-10">
                <motion.div
                  animate={isDragging || isGeocoding ? { y: -15 } : { y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-12 h-12 bg-blue-600 rounded-[18px] flex items-center justify-center shadow-2xl border-4 border-white">
                    <MapPinned size={20} className="text-white" />
                  </div>
                  <div className="w-1 h-6 bg-blue-600 -mt-2 shadow-2xl" />
                </motion.div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-black/20 rounded-full blur-md" />
              </div>

              <button
                onClick={handleUseCurrentLocation}
                className="absolute bottom-10 right-6 w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 active:scale-90 transition-all z-20"
              >
                {isLocating ? <LoaderCircle size={24} className="animate-spin text-blue-500" /> : <Navigation size={24} className="text-slate-900" />}
              </button>
            </div>

            <div className="px-6 pt-6 pb-12 bg-white border-t border-slate-50">
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const center = mapInstanceRef.current?.getCenter();
                  const lng = center?.lng?.() ?? lastCenterRef.current.lng;
                  const lat = center?.lat?.() ?? lastCenterRef.current.lat;
                  setPickupCoords([lng, lat]);
                  setShowMapPicker(false);
                }}
                disabled={isGeocoding}
                className="w-full h-16 bg-blue-600 rounded-[22px] text-white font-black text-[16px] uppercase tracking-widest shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-40"
              >
                <Check size={20} strokeWidth={3} />
                Confirm Pickup
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between sticky top-0 bg-white border-b border-slate-100 z-30 shadow-sm">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(routePrefix || '/')}
          className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-slate-100"
        >
          <ArrowLeft size={20} className="text-slate-800" strokeWidth={2.5} />
        </motion.button>
        <h2 className="text-[17px] font-extrabold text-slate-900 tracking-tight">Outstation Cabs</h2>
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 hover:opacity-90 cursor-pointer shadow-inner">
          <User size={18} strokeWidth={2.5} />
        </div>
      </header>

      {/* Main Container Card */}
      <div className="px-5 pt-4">
        <div className="bg-white rounded-[28px] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)] border border-slate-100 relative">

          {/* Subtitle Header */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-slate-200" />
            <span className="text-[10px] font-extrabold text-blue-500 tracking-[0.15em] uppercase whitespace-nowrap">
              India's Premier Intercity Cabs
            </span>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-slate-200" />
          </div>

          {/* Trip Type Toggle */}
          <div className="flex border border-slate-200 rounded-xl p-1 mb-5 bg-white">
            <button
              onClick={() => setTripType('One Way')}
              className={`flex-1 py-3.5 rounded-lg text-center transition-all duration-200 flex flex-col items-center justify-center ${tripType === 'One Way' ? 'bg-[#1E90FF] text-white shadow-sm font-bold' : 'text-slate-800 hover:bg-slate-50'
                }`}
            >
              <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">One Way</span>
              <span className={`text-[9px] mt-0.5 leading-none opacity-85 ${tripType === 'One Way' ? 'text-white' : 'text-slate-500'}`}>
                Drop-off only
              </span>
            </button>
            <button
              onClick={() => setTripType('Round Trip')}
              className={`flex-1 py-3.5 rounded-lg text-center transition-all duration-200 flex flex-col items-center justify-center ${tripType === 'Round Trip' ? 'bg-[#1E90FF] text-white shadow-sm font-bold' : 'text-slate-800 hover:bg-slate-50'
                }`}
            >
              <span className="text-[13px] font-extrabold tracking-wide uppercase leading-tight">Round Trip</span>
              <span className={`text-[9px] mt-0.5 leading-none opacity-85 ${tripType === 'Round Trip' ? 'text-white' : 'text-slate-500'}`}>
                Return with same cab
              </span>
            </button>
          </div>

          {/* Locations Fields Box */}
          <div className="relative border border-slate-200 rounded-2xl bg-[#F2F7FA] p-0.5 overflow-visible">

            {/* FROM Field */}
            <div
              onClick={handleOpenMapPicker}
              className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-[#EBF3F7] rounded-t-2xl transition-colors border-b border-slate-200/80"
            >
              <div className="w-6 h-6 shrink-0 flex items-center justify-center text-slate-400">
                <MapPin size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase leading-none mb-1.5">FROM</p>
                <p className="text-[15px] font-bold text-slate-800 truncate leading-snug">
                  {pickupAddress || 'Enter Pickup Location'}
                </p>
              </div>
            </div>

            {/* SWAP Button */}
            <button
              onClick={handleSwapLocations}
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center z-10 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              <ArrowUpDown size={15} className="text-[#1E90FF]" />
            </button>

            {/* TO Field */}
            <div className="px-5 py-4 flex items-center gap-4 rounded-b-2xl relative">
              <div className="w-6 h-6 shrink-0 flex items-center justify-center text-[#1E90FF]">
                <MapPin size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase leading-none mb-1">TO</p>
                <input
                  type="text"
                  placeholder="Enter Drop Location"
                  value={toCitySearch}
                  onChange={(e) => {
                    setToCitySearch(e.target.value);
                    if (selectedPackage && selectedPackage.destination !== e.target.value) {
                      setSelectedPackage(null);
                    }
                  }}
                  onFocus={() => setIsToFocused(true)}
                  className="w-full bg-transparent border-0 outline-none p-0 font-bold text-[15px] text-slate-800 placeholder:text-slate-400 leading-snug mt-0.5"
                />
              </div>
              {toCitySearch && (
                <button
                  type="button"
                  onClick={() => {
                    setToCitySearch('');
                    setSelectedPackage(null);
                  }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200/50"
                >
                  <X size={14} />
                </button>
              )}

              {/* Suggestions Dropdown Overlay */}
              <AnimatePresence>
                {isToFocused && (
                  <>
                    {/* Click Outside Handler Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setIsToFocused(false)} />

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-72 overflow-y-auto"
                    >
                      {loading ? (
                        <div className="p-8 flex items-center justify-center gap-2.5 text-slate-400">
                          <LoaderCircle size={18} className="animate-spin text-blue-500" />
                          <span className="text-[13px] font-medium">Loading routes...</span>
                        </div>
                      ) : filteredPackages.length > 0 ? (
                        filteredPackages.map((pkg) => (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => {
                              setSelectedPackage(pkg);
                              setToCitySearch(pkg.destination);
                              setFromCity(pkg.serviceLocationName);
                              setIsToFocused(false);
                            }}
                            className="w-full px-5 py-3.5 text-left hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0 transition-colors group"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                                From {pkg.serviceLocationName}
                              </p>
                              <p className="text-[14px] font-black text-slate-800 group-hover:text-blue-600 transition-colors">
                                To {pkg.destination}
                              </p>
                            </div>
                            <div className="text-right pl-3">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Starts from</p>
                              <p className="text-[14px] font-black text-slate-900 group-hover:text-blue-600">
                                ₹{pkg.vehicles?.[0]?.basePrice || '---'}
                              </p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400">
                          <p className="text-[13px] font-bold">No routes matching query</p>
                          <p className="text-[11px] mt-0.5">Check spelling or try a different city</p>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* TRIP START Picker */}
          <div
            onClick={triggerDateTimePicker}
            className="mt-4 p-4 rounded-2xl bg-[#EBF5FC] border border-[#D5E6F3] flex items-center gap-4 cursor-pointer hover:bg-[#E2F0FA] transition-colors group relative"
          >
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-[#1E90FF] shadow-sm">
              <Calendar size={18} />
            </div>
            <div className="flex-1">
              <p className="text-[9px] font-extrabold text-slate-400 tracking-wider uppercase leading-none mb-1.5">TRIP START</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-black text-slate-800 leading-none">{displayDateStr}</span>
                <span className="text-[12px] font-medium text-slate-500 leading-none">{displayTimeStr}</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />

            {/* Hidden Native Picker */}
            <input
              ref={dateTimeInputRef}
              type="datetime-local"
              min={new Date().toISOString().slice(0, 16)}
              value={`${travelDate}T${travelTime}`}
              onChange={handleDateTimeChange}
              className="absolute pointer-events-none opacity-0 inset-0 w-full h-full"
            />
          </div>

          {/* EXPLORE CABS Button */}
          <button
            onClick={handleExploreCabs}
            type="button"
            className="mt-5 w-full bg-[#FF7A1A] hover:bg-[#E06610] text-white font-extrabold text-[15px] py-4 rounded-xl tracking-widest shadow-md hover:shadow-lg active:scale-[0.98] transition-all text-center uppercase"
          >
            EXPLORE CABS
          </button>

        </div>
      </div>

      {/* Horizontal Scroll Banners */}
      <div className="mt-6">
        <div className="flex gap-4 overflow-x-auto px-5 py-2 scrollbar-hide">

          {/* Banner 1: Chardham */}
          <div className="w-[280px] shrink-0 h-[140px] rounded-2xl overflow-hidden relative shadow-md group">
            <img
              src="/chardham_banner.png"
              alt="Chardham Cab Packages"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col justify-end p-4">
              <span className="self-start bg-black/75 border border-amber-400/40 text-amber-400 text-[8px] font-extrabold px-2 py-0.5 rounded-full tracking-wider uppercase mb-1">
                ★ Exclusive ★
              </span>
              <h4 className="text-white text-[15px] font-black uppercase tracking-tight leading-tight">
                Chardham Cab Packages
              </h4>
            </div>
          </div>

          {/* Banner 2: Offers */}
          <div className="w-[280px] shrink-0 h-[140px] rounded-2xl overflow-hidden relative shadow-md group">
            <img
              src="/offers_banner.png"
              alt="Beach Cab Offers"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col justify-end p-4">
              <span className="self-start bg-amber-500 text-slate-900 text-[8px] font-extrabold px-2 py-0.5 rounded-full tracking-wider uppercase mb-1">
                Offers
              </span>
              <h4 className="text-white text-[15px] font-black uppercase tracking-tight leading-tight">
                First Intercity Trip? Get 20% Off!
              </h4>
            </div>
          </div>

        </div>
      </div>

      {/* Travel Expert CTA Banner */}
      <div className="px-5 mt-6">
        <div className="p-4 bg-gradient-to-r from-[#E3F2FD]/80 to-[#E1F5FE]/80 border border-blue-100 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-[8px] font-extrabold text-blue-500 tracking-wider uppercase mb-0.5">SAY HELLO TO</p>
            <h4 className="text-[13px] font-extrabold text-slate-900 leading-tight">YOUR TRAVEL EXPERT</h4>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">Get expert advice for smarter travel plans!</p>
          </div>
          <button
            onClick={() => window.open('tel:+918000000000', '_self')}
            type="button"
            className="bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-1.5 shadow-sm transition-all text-[11px] font-black cursor-pointer shrink-0 active:scale-95"
          >
            <PhoneCall size={12} className="text-[#1E90FF]" />
            Call Expert | 24x7
          </button>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white border-t border-slate-200 grid grid-cols-3 h-16 items-center z-40 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.04)]">

        {/* ONE WAY */}
        <button
          onClick={() => {
            setTripType('One Way');
          }}
          className={`flex flex-col items-center justify-center h-full border-r border-slate-100 transition-colors ${tripType === 'One Way' ? 'bg-[#1E90FF] text-white font-extrabold' : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          <Compass size={18} strokeWidth={2.5} className="mb-0.5" />
          <span className="text-[9px] tracking-wide uppercase font-extrabold">One Way</span>
        </button>

        {/* ROUND TRIP */}
        <button
          onClick={() => {
            setTripType('Round Trip');
          }}
          className={`flex flex-col items-center justify-center h-full border-r border-slate-100 transition-colors ${tripType === 'Round Trip' ? 'bg-[#1E90FF] text-white font-extrabold' : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          <Briefcase size={18} strokeWidth={2.5} className="mb-0.5" />
          <span className="text-[9px] tracking-wide uppercase font-extrabold">Round Trip</span>
        </button>

        {/* LOCAL */}
        <button
          onClick={() => navigate(`${routePrefix}/rental`)}
          className="flex flex-col items-center justify-center h-full border-r border-slate-100 text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <Clock size={18} strokeWidth={2.5} className="mb-0.5" />
          <span className="text-[9px] tracking-wide uppercase font-extrabold">Local</span>
        </button>

        {/*
        <button
          onClick={() => navigate(`${routePrefix}/cab/airport`)}
          className="flex flex-col items-center justify-center h-full text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <Plane size={18} strokeWidth={2.5} className="mb-0.5" />
          <span className="text-[9px] tracking-wide uppercase font-extrabold">Airport</span>
        </button>
        */}

      </nav>
    </div>
  );
};

export default IntercityHome;
