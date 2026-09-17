import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Phone, MessageCircle, CheckCircle2, AlertTriangle, Star } from 'lucide-react';
import { GoogleMap, OverlayView, Polyline } from '@react-google-maps/api';
import api from '../../../../shared/api/axiosInstance';
import { socketService } from '../../../../shared/api/socket';
import { getLocalUserToken, userAuthService } from '../../services/authService';
import { getCurrentRide, isActiveCurrentRide, saveCurrentRide } from '../../services/currentRideService';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import LuxuryIcon from '@/assets/icons/Luxury.png';
import PremiumIcon from '@/assets/icons/Premium.png';
import SuvIcon from '@/assets/icons/SUV.png';
import BikeIcon from '@/assets/icons/bike.png';
import CarIcon from '@/assets/icons/car.png';
import AutoIcon from '@/assets/icons/auto.png';

const MAP_OPTIONS = {
  disableDefaultUI: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
    { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  ],
};

const unwrap = (response) => response?.data?.data || response?.data || response;
const unwrapLoginPayload = (response) => {
  const payload = unwrap(response);
  return payload?.token ? payload : payload?.data || {};
};

const generateOTP = () => String(Math.floor(1000 + Math.random() * 9000));
const DRIVER_PLACEHOLDER = { name: 'Delivery Captain', rating: '4.9', vehicle: 'Bike', plate: 'Assigned', phone: '', eta: 2 };
const STAGES = { SEARCHING: 'searching', ACCEPTED: 'accepted' };
const ACTIVE_DELIVERY_POLL_MS = 8000;
const ACTIVE_DELIVERY_POLL_DELAY_MS = 6000;
const SEARCH_TIMEOUT_MS = 20000;
const CONSUMED_SEARCH_NONCE_PREFIX = 'Appzeto 24_consumed_parcel_search_nonce:';
const ACTIVE_SEARCH_NONCES = new Set();
const ACTIVE_SEARCH_NONCE_CLEANUPS = new Map();

const withUserAuthorization = (token) => (
  token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {}
);

const PinLocationMarker = ({ position, title, color, size = 34, zIndex = 1 }) => (
  <OverlayView
    position={position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    zIndex={zIndex}
    getPixelPositionOffset={() => ({
      x: -(size / 2),
      y: -(size - 2),
    })}
  >
    <div title={title} className="pointer-events-none flex flex-col items-center">
      <div
        className="relative rounded-full border-2 border-white shadow-[0_8px_18px_rgba(15,23,42,0.25)]"
        style={{ width: size, height: size, backgroundColor: color }}
      >
        <div className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
      </div>
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: `${Math.round(size * 0.18)}px solid transparent`,
          borderRight: `${Math.round(size * 0.18)}px solid transparent`,
          borderTop: `${Math.round(size * 0.28)}px solid ${color}`,
          marginTop: -2,
          filter: 'drop-shadow(0 6px 8px rgba(15,23,42,0.18))',
        }}
      />
    </div>
  </OverlayView>
);

const readCoordinatePair = (...sources) => {
  for (const source of sources) {
    if (Array.isArray(source) && source.length >= 2) {
      const [lng, lat] = source;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return [Number(lng), Number(lat)];
      }
    }

    const nestedCoords = source?.coordinates;
    if (Array.isArray(nestedCoords) && nestedCoords.length >= 2) {
      const [lng, lat] = nestedCoords;
      if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return [Number(lng), Number(lat)];
      }
    }

    const lat = Number(source?.lat ?? source?.latitude);
    const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }

  return null;
};

const toLatLng = (coords, fallback = { lat: 22.7196, lng: 75.8577 }) => {
  const pair = readCoordinatePair(coords);
  if (!pair) {
    return fallback;
  }

  return { lng: pair[0], lat: pair[1] };
};

const getVehicleIcon = (type = 'car') => {
  const val = String(type).toLowerCase();
  if (val.includes('bike') || val.includes('2wheel')) return BikeIcon;
  if (val.includes('auto')) return AutoIcon;
  if (val.includes('lux')) return LuxuryIcon;
  if (val.includes('premium')) return PremiumIcon;
  if (val.includes('suv')) return SuvIcon;
  return CarIcon;
};

const getOverlayCenterOffset = (width, height) => ({
  x: -(width / 2),
  y: -(height / 2),
});

const clampVehicleCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 4;
  }
  return Math.max(3, Math.min(8, Math.round(numeric)));
};

const buildAvailableVehicleMarkers = (center, count) => {
  const safeCount = clampVehicleCount(count);
  const lat = Number(center?.lat || 0);
  const lng = Number(center?.lng || 0);

  return Array.from({ length: safeCount }, (_, index) => {
    const angle = ((Math.PI * 2) / safeCount) * index + (index % 2 ? 0.28 : -0.12);
    const radius = 0.0022 + (index % 3) * 0.00045;

    return {
      id: `available-delivery-${index}`,
      position: {
        lat: lat + Math.sin(angle) * radius,
        lng: lng + Math.cos(angle) * radius,
      },
      heading: (angle * 180) / Math.PI + 90,
      delay: index * 0.18,
    };
  });
};

const BlinkingVehicleMarker = ({ marker, iconUrl }) => (
  <OverlayView
    position={marker.position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    getPixelPositionOffset={getOverlayCenterOffset}
  >
    <div className="pointer-events-none relative flex h-14 w-14 items-center justify-center">
      {[0, 1].map((ring) => (
        <motion.span
          key={ring}
          className="absolute h-10 w-10 rounded-full border border-emerald-500/45 bg-emerald-400/10"
          animate={{ scale: [0.65, 1.7], opacity: [0.55, 0] }}
          transition={{
            repeat: Infinity,
            duration: 1.8,
            delay: marker.delay + ring * 0.55,
            ease: 'easeOut',
          }}
        />
      ))}
      <motion.img
        src={iconUrl || BikeIcon}
        alt="Available vehicle"
        draggable={false}
        className="relative h-9 w-9 object-contain drop-shadow-[0_6px_8px_rgba(15,23,42,0.34)]"
        style={{ rotate: `${marker.heading}deg` }}
        animate={{
          scale: [1, 1.16, 1],
          opacity: [0.78, 1, 0.78],
        }}
        transition={{
          repeat: Infinity,
          duration: 1.35,
          delay: marker.delay,
          ease: 'easeInOut',
        }}
      />
    </div>
  </OverlayView>
);

const normalizeDriver = (driver = {}) => ({
  name: driver.name || 'Delivery Captain',
  rating: driver.rating || '4.9',
  vehicle: driver.vehicle || driver.vehicleType || driver.vehicle_type || 'Bike',
  vehicleType: driver.vehicleType || driver.vehicle_type || driver.vehicle || 'Bike',
  plate: driver.plate || driver.vehicleNumber || driver.vehicle_number || 'Assigned',
  vehicleNumber: driver.vehicleNumber || driver.vehicle_number || driver.plate || 'Assigned',
  phone: driver.phone || driver.mobile || driver.phoneNumber || '',
  profileImage: driver.profileImage || driver.profile_image || driver.image || driver.avatar || driver.selfie || '',
  vehicleImage: driver.vehicleImage || driver.vehicle_image || driver.vehiclePhoto || driver.vehicle_photo || driver.vehicle?.image || '',
  vehicleColor: driver.vehicleColor || driver.vehicle_color || driver.vehicle?.vehicleColor || driver.vehicle?.vehicle_color || '',
  vehicleMake: driver.vehicleMake || driver.vehicle_make || driver.vehicle?.vehicleMake || driver.vehicle?.vehicle_make || '',
  vehicleModel: driver.vehicleModel || driver.vehicle_model || driver.vehicle?.vehicleModel || driver.vehicle?.vehicle_model || '',
  vehicleIconUrl: driver.vehicleIconUrl || driver.map_icon || driver.icon || '',
  eta: driver.eta || 2,
});

const normalizeLabel = (value = '') => String(value).trim().toLowerCase();

const normalizePreferredVehicleTypes = (value = '') =>
  String(value || '')
    .split(',')
    .map((entry) => normalizeLabel(entry))
    .filter(Boolean);

const normalizeVehicleLabel = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getVehicleTokens = (vehicle = {}) =>
  [
    vehicle.name,
    vehicle.vehicle_type,
    vehicle.label,
    vehicle.icon_types,
    vehicle.transport_type,
  ]
    .map(normalizeVehicleLabel)
    .filter(Boolean);

const findVehicleMatch = (types, preferredLabel) => {
  const exactMatch = types.find((type) => normalizeLabel(type.name || type.vehicle_type || type.label) === preferredLabel);
  if (exactMatch) return exactMatch;
  const transportMatch = types.find((type) => normalizeLabel(type.transport_type) === preferredLabel);
  if (transportMatch) return transportMatch;
  return types.find((type) => {
    const haystack = `${type.name || ''} ${type.vehicle_type || ''} ${type.label || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
    return haystack.includes(preferredLabel);
  });
};

const pickParcelVehicles = (types = [], preferredType = '') => {
  const activeTypes = types.filter((type) => type.active !== false && Number(type.status ?? 1) !== 0);
  const preferredLabels = normalizePreferredVehicleTypes(preferredType).filter((entry) => entry !== 'both');
  const matches = [];

  for (const preferredLabel of preferredLabels) {
    const match = findVehicleMatch(activeTypes, preferredLabel);
    if (match && !matches.some((item) => String(item._id || item.id) === String(match._id || match.id))) {
      matches.push(match);
    }
  }

  if (matches.length > 0) return matches;

  if (!preferredLabels.length) {
    const parcelMatches = activeTypes.filter((type) => {
      const value = `${type.name || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
      return value.includes('bike') || value.includes('delivery') || value.includes('parcel') || value.includes('car');
    });
    if (parcelMatches.length > 0) return parcelMatches;
    return activeTypes;
  }

  const parcelFirst = activeTypes.find((type) => {
    const value = `${type.name || ''} ${type.icon_types || ''} ${type.transport_type || ''}`.toLowerCase();
    return value.includes('bike') || value.includes('delivery') || value.includes('parcel');
  });

  return parcelFirst ? [parcelFirst] : activeTypes.slice(0, 1);
};

const findVehicleById = (types = [], vehicleId = '') =>
  types.find((type) => String(type?._id || type?.id) === String(vehicleId || '')) || null;

const findVehiclesByIds = (types = [], vehicleIds = []) => {
  const wantedIds = new Set(
    (Array.isArray(vehicleIds) ? vehicleIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  );

  if (!wantedIds.size) {
    return [];
  }

  return types.filter((type) => wantedIds.has(String(type?._id || type?.id || '')));
};

const formatParcelFareLabel = (estimatedFare, fallbackFare) => {
  const minFare = Number(estimatedFare?.min);
  const maxFare = Number(estimatedFare?.max);
  const approxFare = Number(estimatedFare?.approx);
  const singleFare = Number(fallbackFare);

  if (Number.isFinite(minFare) && Number.isFinite(maxFare) && maxFare > minFare) {
    return `Rs ${Math.round(minFare)} - Rs ${Math.round(maxFare)}`;
  }

  if (Number.isFinite(approxFare)) {
    return `Rs ${Math.round(approxFare)}`;
  }

  if (Number.isFinite(minFare)) {
    return `Rs ${Math.round(minFare)}`;
  }

  if (Number.isFinite(singleFare)) {
    return `Rs ${Math.round(singleFare)}`;
  }

  return '--';
};

const isVehicleCompatibleWithGoodsType = (vehicle, goodsTypeFor = '') => {
  const allowedLabels = String(goodsTypeFor || 'both')
    .split(',')
    .map(normalizeVehicleLabel)
    .filter(Boolean);

  if (!allowedLabels.length || allowedLabels.includes('both') || allowedLabels.includes('all')) {
    return true;
  }

  const tokens = getVehicleTokens(vehicle);
  return allowedLabels.some((label) => tokens.some((token) => token.includes(label) || label.includes(token)));
};

const ParcelSearchingDriver = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = useMemo(() => location.state || {}, [location.state]);
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const [stage, setStage] = useState(STAGES.SEARCHING);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [otp] = useState(generateOTP);
  const [driver, setDriver] = useState(DRIVER_PLACEHOLDER);
  const [searchStatus, setSearchStatus] = useState('Preparing dispatch...');
  const [bookingError, setBookingError] = useState('');
  const [nearbyVehicleCount, setNearbyVehicleCount] = useState(4);
  const activeRidePollRef = useRef(null);
  const activeRidePollStartTimeoutRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const requestStartedRef = useRef(false);
  const cleanupSearchRef = useRef(null);
  const cleanupDelayRef = useRef(null);
  const acceptedTimerRef = useRef(null);
  const driverRef = useRef(driver);
  const activeRideIdRef = useRef('');
  const trackingStartedRef = useRef(false);
  const searchNonce = String(routeState.searchNonce || '');
  const preferredVehicleType = String(
    routeState.goodsTypeFor ||
    routeState.selectedGoodsType?.goodsTypeFor ||
    routeState.selectedGoodsType?.goods_types_for ||
    routeState.selectedGoodsType?.goods_type_for ||
    '',
  ).trim();
  const { isLoaded } = useBaseGoogleMapsLoader();
  const resolvedPickupCoords = useMemo(
    () => readCoordinatePair(routeState.pickupCoords, routeState.pickupLocation, routeState.pickup),
    [routeState.pickup, routeState.pickupCoords, routeState.pickupLocation],
  );
  const resolvedDropCoords = useMemo(
    () => readCoordinatePair(routeState.dropCoords, routeState.dropLocation, routeState.drop),
    [routeState.drop, routeState.dropCoords, routeState.dropLocation],
  );

  const pickupPos = useMemo(
    () => toLatLng(resolvedPickupCoords),
    [resolvedPickupCoords],
  );

  const dropPos = useMemo(
    () => (resolvedDropCoords ? toLatLng(resolvedDropCoords, null) : null),
    [resolvedDropCoords],
  );

  const availableVehicleIcon = useMemo(
    () => (
      routeState.vehicleIconUrl ||
      routeState.vehicle?.vehicleIconUrl ||
      routeState.vehicle?.icon ||
      getVehicleIcon(routeState.vehicleIconType || routeState.vehicle?.iconType || preferredVehicleType || 'bike')
    ),
    [preferredVehicleType, routeState.vehicle, routeState.vehicleIconType, routeState.vehicleIconUrl],
  );

  const availableVehicleMarkers = useMemo(
    () => buildAvailableVehicleMarkers(pickupPos, nearbyVehicleCount),
    [nearbyVehicleCount, pickupPos],
  );
  const expectedFareLabel = useMemo(
    () => formatParcelFareLabel(routeState.estimatedFare, routeState.fare),
    [routeState.estimatedFare, routeState.fare],
  );
  const expectedFareMeta = useMemo(() => {
    const distanceKm = Number(routeState.estimatedDistanceKm);
    const serviceTaxPercentage = Number(routeState.estimatedFare?.serviceTaxPercentage || 0);
    const serviceTaxLabel = serviceTaxPercentage > 0
      ? ` Includes ${serviceTaxPercentage.toFixed(2)}% service tax.`
      : '';
    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      return `Estimated for about ${distanceKm.toFixed(1)} km.${serviceTaxLabel}`;
    }

    return `Based on the current parcel route.${serviceTaxLabel}`;
  }, [routeState.estimatedDistanceKm, routeState.estimatedFare?.serviceTaxPercentage]);

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    if (!searchNonce) {
      navigate(userHomeRoute, { replace: true });
      return;
    }

    const nonceKey = `${CONSUMED_SEARCH_NONCE_PREFIX}${searchNonce}`;
    const pendingCleanup = ACTIVE_SEARCH_NONCE_CLEANUPS.get(searchNonce);
    if (pendingCleanup) {
      clearTimeout(pendingCleanup);
      ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
    }

    if (ACTIVE_SEARCH_NONCES.has(searchNonce)) {
      return () => {
        const cleanupId = setTimeout(() => {
          ACTIVE_SEARCH_NONCES.delete(searchNonce);
          ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
        }, 0);
        ACTIVE_SEARCH_NONCE_CLEANUPS.set(searchNonce, cleanupId);
      };
    }

    if (sessionStorage.getItem(nonceKey)) {
      const activeRide = getCurrentRide();
      if (isActiveCurrentRide(activeRide)) {
        navigate(`${routePrefix}/parcel/tracking`, { replace: true, state: activeRide });
        return;
      }
      navigate(userHomeRoute, { replace: true });
      return;
    }

    sessionStorage.setItem(nonceKey, '1');
    ACTIVE_SEARCH_NONCES.add(searchNonce);

    return () => {
      const cleanupId = setTimeout(() => {
        ACTIVE_SEARCH_NONCES.delete(searchNonce);
        ACTIVE_SEARCH_NONCE_CLEANUPS.delete(searchNonce);
      }, 0);
      ACTIVE_SEARCH_NONCE_CLEANUPS.set(searchNonce, cleanupId);
    };
  }, [navigate, routePrefix, searchNonce, userHomeRoute]);

  useEffect(() => {
    if (cleanupDelayRef.current) {
      clearTimeout(cleanupDelayRef.current);
      cleanupDelayRef.current = null;
    }

    if (requestStartedRef.current) {
      return () => {
        cleanupDelayRef.current = setTimeout(() => {
          cleanupSearchRef.current?.();
        }, 0);
      };
    }

    if (!searchNonce) {
      navigate(userHomeRoute, { replace: true });
      return undefined;
    }

    requestStartedRef.current = true;
    let disposed = false;

    const moveToTracking = ({ acceptedDriver, rideId, rideSnapshot }) => {
      if (disposed || trackingStartedRef.current) return;
      const nextDriver = normalizeDriver(acceptedDriver);
      driverRef.current = nextDriver;
      setDriver(nextDriver);
      setStage(STAGES.ACCEPTED);
      setSearchStatus('Captain accepted your parcel request.');
      activeRideIdRef.current = String(rideId || activeRideIdRef.current || '');
      trackingStartedRef.current = true;

        const nextRide = {
        ...routeState,
        type: 'parcel',
        serviceType: 'parcel',
        pickup: rideSnapshot?.pickupAddress || routeState.pickup,
        drop: rideSnapshot?.dropAddress || routeState.drop,
        pickupCoords: readCoordinatePair(
          rideSnapshot?.pickup?.coordinates,
          rideSnapshot?.pickupLocation?.coordinates,
          routeState.pickupCoords,
        ) || resolvedPickupCoords,
        dropCoords: readCoordinatePair(
          rideSnapshot?.drop?.coordinates,
          rideSnapshot?.dropLocation?.coordinates,
          routeState.dropCoords,
        ) || resolvedDropCoords,
        rideId: activeRideIdRef.current,
        otp,
        driver: nextDriver,
        fare: rideSnapshot?.fare ?? routeState.fare ?? routeState.estimatedFare?.min ?? null,
        vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
        paymentMethod: routeState.paymentMethod || 'Cash',
        status: 'accepted',
        parcel: rideSnapshot?.parcel || routeState.parcel || null,
      };

      saveCurrentRide(nextRide);
      clearInterval(activeRidePollRef.current);
      clearTimeout(searchTimeoutRef.current);
      clearTimeout(acceptedTimerRef.current);
      acceptedTimerRef.current = setTimeout(() => {
        navigate(`${routePrefix}/parcel/tracking`, { replace: true, state: nextRide });
      }, 2200);
    };

    const hydrateAcceptedDelivery = async (token) => {
      if (disposed) return null;
      const activeResponse = await api.get('/deliveries/active/me', {
        ...withUserAuthorization(token),
        params: { t: Date.now() },
      });
      const activeDelivery = unwrap(activeResponse);
      if (!activeDelivery?.rideId) return null;
      return activeDelivery;
    };

    const onRideSearchUpdate = ({ matchedDrivers, radius }) => {
      setNearbyVehicleCount(clampVehicleCount(matchedDrivers));
      const radiusKm = radius ? (Number(radius) / 1000).toFixed(1) : '';
      setSearchStatus(
        matchedDrivers > 0
          ? `${matchedDrivers} captain${matchedDrivers > 1 ? 's' : ''} notified within ${radiusKm} km`
          : `Searching within ${radiusKm} km`,
      );
    };

    const onRideAccepted = ({ driver: acceptedDriver, rideId, parcel }) => {
      moveToTracking({ acceptedDriver, rideId, rideSnapshot: { fare: routeState.fare, parcel } });
    };

    const onRideState = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) return;
      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        moveToTracking({ acceptedDriver: payload.driver, rideId: payload.rideId, rideSnapshot: payload });
      }
    };

    const onRideStatusUpdated = async (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) return;
      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        const activeDelivery = await hydrateAcceptedDelivery(getLocalUserToken()).catch(() => null);
        moveToTracking({
          acceptedDriver: activeDelivery?.driver || driverRef.current,
          rideId: payload.rideId,
          rideSnapshot: activeDelivery || payload,
        });
      }
    };

    const onRideCancelled = ({ reason }) => {
      const nextMessage = reason || 'Search timed out.';
      setBookingError(nextMessage);
      setSearchStatus(nextMessage);
      setStage(STAGES.SEARCHING);
      clearTimeout(searchTimeoutRef.current);
    };

    const onError = ({ message }) => {
      const nextMessage = message || 'Error occurred.';
      setBookingError(nextMessage);
      setSearchStatus(nextMessage);
      clearTimeout(searchTimeoutRef.current);
    };

    socketService.on('rideSearchUpdate', onRideSearchUpdate);
    socketService.on('rideAccepted', onRideAccepted);
    socketService.on('ride:state', onRideState);
    socketService.on('ride:status:updated', onRideStatusUpdated);
    socketService.on('rideCancelled', onRideCancelled);
    socketService.on('errorMessage', onError);

    cleanupSearchRef.current = () => {
      if (disposed) return;
      disposed = true;
      requestStartedRef.current = false;
      clearInterval(activeRidePollRef.current);
      clearTimeout(activeRidePollStartTimeoutRef.current);
      clearTimeout(searchTimeoutRef.current);
      clearTimeout(acceptedTimerRef.current);
      activeRidePollStartTimeoutRef.current = null;
      activeRidePollRef.current = null;
      socketService.off('rideSearchUpdate', onRideSearchUpdate);
      socketService.off('rideAccepted', onRideAccepted);
      socketService.off('ride:state', onRideState);
      socketService.off('ride:status:updated', onRideStatusUpdated);
      socketService.off('rideCancelled', onRideCancelled);
      socketService.off('errorMessage', onError);
    };

    (async () => {
      try {
        let userToken = getLocalUserToken();
        if (!userToken) {
          const loginResponse = await userAuthService.loginDemoUser();
          const loginPayload = unwrapLoginPayload(loginResponse);
          if (loginPayload?.token) {
            userToken = loginPayload.token;
            localStorage.setItem('token', userToken);
            localStorage.setItem('userToken', userToken);
            localStorage.setItem('role', 'user');
            localStorage.setItem('userInfo', JSON.stringify(loginPayload.user || {}));
          }
        }
        if (disposed) return;

        const vehicleCatalogResponse = await api.get('/users/vehicle-types');
        if (disposed) return;

        const vehicleCatalog = unwrap(vehicleCatalogResponse);
        const vehicleTypes = vehicleCatalog?.vehicle_types || vehicleCatalog?.results || (Array.isArray(vehicleCatalog) ? vehicleCatalog : []);
        const requestedVehicles = findVehiclesByIds(vehicleTypes, routeState.selectedVehicleIds);
        const requestedVehicle = findVehicleById(vehicleTypes, routeState.selectedVehicleId);
        const requestedVehicleTypes = requestedVehicles.filter((vehicle) => isVehicleCompatibleWithGoodsType(vehicle, preferredVehicleType));
        const selectedVehicleTypes = requestedVehicleTypes.length > 0
          ? requestedVehicleTypes
          : requestedVehicle && isVehicleCompatibleWithGoodsType(requestedVehicle, preferredVehicleType)
            ? [requestedVehicle]
            : pickParcelVehicles(vehicleTypes, preferredVehicleType);
        const selectedVehicleType = selectedVehicleTypes[0];
        const selectedVehicleTypeIds = selectedVehicleTypes.map((type) => type?._id || type?.id).filter(Boolean);

        if (selectedVehicleTypeIds.length === 0) {
          throw new Error('No vehicles available.');
        }

        const rideRequestConfig = userToken ? { headers: { Authorization: `Bearer ${userToken}` } } : {};
        const parcelPayload = {
          ...(routeState.parcel || {}),
          category: routeState.parcel?.category || routeState.parcelType || 'Parcel',
          weight: routeState.parcel?.weight || routeState.weight || 'Under 5kg',
          description: routeState.parcel?.description || routeState.description || '',
          deliveryScope: routeState.parcel?.deliveryScope || routeState.deliveryScope || 'city',
          isOutstation: Boolean(routeState.parcel?.isOutstation || routeState.isOutstation || routeState.deliveryScope === 'outstation'),
          senderName: routeState.parcel?.senderName || routeState.senderName || '',
          senderMobile: routeState.parcel?.senderMobile || routeState.senderMobile || '',
          receiverName: routeState.parcel?.receiverName || routeState.receiverName || '',
          receiverMobile: routeState.parcel?.receiverMobile || routeState.receiverMobile || '',
          goodsTypeFor: preferredVehicleType || routeState.parcel?.goodsTypeFor || 'both',
          deliveryCategory: routeState.parcel?.deliveryCategory || routeState.deliveryCategory || '',
        };

        const socket = socketService.connect({ role: 'user', token: userToken });
        const response = await api.post('/deliveries', {
          pickup: resolvedPickupCoords || [75.9048, 22.7039],
          drop: resolvedDropCoords || [75.8937, 22.7533],
          pickupAddress: routeState.pickup || '',
          dropAddress: routeState.drop || '',
          fare: routeState.fare ?? routeState.estimatedFare?.min ?? null,
          vehicleTypeId: selectedVehicleTypeIds[0],
          vehicleTypeIds: selectedVehicleTypeIds,
          vehicleIconType: selectedVehicleType.icon_types || 'bike',
          vehicleIconUrl: selectedVehicleType.map_icon || selectedVehicleType.icon || selectedVehicleType.image || '',
          paymentMethod: routeState.paymentMethod || 'Cash',
          type: 'parcel',
          parcel: parcelPayload,
        }, rideRequestConfig);

        if (disposed) return;

        const payload = unwrap(response);
        const rideId = payload?.rideId || payload?.realtime?.rideId || payload?.ride?._id || payload?._id || payload?.id;
        activeRideIdRef.current = String(rideId || '');

        if (socket && rideId) {
          socketService.emit('joinRide', { rideId });
          socketService.emit('ride:join', { rideId });
        }

        const pollActiveRide = async () => {
          if (disposed) return;
          try {
            const activeRide = await hydrateAcceptedDelivery(userToken);
            if (disposed || !activeRide?.rideId) return;
            const isThisRide = String(activeRide.rideId || '') === String(rideId || '');
            const rideState = String(activeRide.status || activeRide.liveStatus || '').toLowerCase();
            const isAcceptedRide = ['accepted', 'arriving', 'started', 'ongoing'].includes(rideState);

            if (isThisRide && ['searching', 'pending'].includes(rideState)) {
              setStage(STAGES.SEARCHING);
              setSearchStatus('Broadcasted to nearby captains...');
            }
            if (isThisRide && isAcceptedRide) {
              moveToTracking({ acceptedDriver: activeRide.driver || driverRef.current, rideId: activeRide.rideId, rideSnapshot: activeRide });
            }
          } catch {
            // Socket remains the primary path; polling is only a race-condition fallback.
          }
        };

        clearInterval(activeRidePollRef.current);
        activeRidePollRef.current = null;
        const startFallbackPolling = () => {
          if (disposed || trackingStartedRef.current) return;
          pollActiveRide();
          activeRidePollRef.current = setInterval(pollActiveRide, ACTIVE_DELIVERY_POLL_MS);
        };
        clearTimeout(activeRidePollStartTimeoutRef.current);
        activeRidePollStartTimeoutRef.current = window.setTimeout(
          startFallbackPolling,
          ACTIVE_DELIVERY_POLL_DELAY_MS,
        );
        if (!disposed) {
          setSearchStatus('Booking created. Notifying nearby captains...');
          setNearbyVehicleCount(clampVehicleCount(selectedVehicleTypeIds.length));
        }

        searchTimeoutRef.current = setTimeout(async () => {
          if (disposed || trackingStartedRef.current) return;
          const activeRide = await hydrateAcceptedDelivery(userToken).catch(() => null);
          const rideState = String(activeRide?.status || activeRide?.liveStatus || '').toLowerCase();
          if (!activeRide?.rideId || rideState === 'cancelled') {
            setBookingError('No response from captains.');
            setSearchStatus('Try again in a moment.');
            clearInterval(activeRidePollRef.current);
            return;
          }
          if (['accepted', 'arriving', 'started', 'ongoing'].includes(rideState)) {
            moveToTracking({ acceptedDriver: activeRide.driver || driverRef.current, rideId: activeRide.rideId, rideSnapshot: activeRide });
          }
        }, SEARCH_TIMEOUT_MS);
      } catch (error) {
        if (disposed) return;
        const errorMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Dispatch failed.';
        setBookingError(errorMessage);
        setSearchStatus(errorMessage);
        clearTimeout(searchTimeoutRef.current);
      }
    })();

    return () => {
      cleanupDelayRef.current = setTimeout(() => {
        cleanupSearchRef.current?.();
      }, 0);
    };
  }, [navigate, otp, preferredVehicleType, resolvedDropCoords, resolvedPickupCoords, routePrefix, routeState, searchNonce, userHomeRoute]);

  const handleCancel = async () => {
    clearInterval(activeRidePollRef.current);
    clearTimeout(searchTimeoutRef.current);
    clearTimeout(acceptedTimerRef.current);

    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch (_error) {
      // Navigation still proceeds even if the cancel request races with another state update.
    }

    navigate(userHomeRoute, { replace: true });
  };

  const isSearching = stage === STAGES.SEARCHING;
  const isAccepted = stage === STAGES.ACCEPTED;

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto relative font-['Plus_Jakarta_Sans'] overflow-hidden">
      <div className="absolute inset-0 z-0">
        {HAS_VALID_GOOGLE_MAPS_KEY && isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={pickupPos}
            zoom={15}
            options={MAP_OPTIONS}
          >
            <PinLocationMarker position={pickupPos} title="Pickup" color="#000000" zIndex={100} />

            {dropPos && (
              <PinLocationMarker position={dropPos} title="Drop" color="#f97316" />
            )}

            {isSearching && (
              <>
                {availableVehicleMarkers.map((marker) => (
                  <BlinkingVehicleMarker
                    key={marker.id}
                    marker={marker}
                    iconUrl={availableVehicleIcon}
                  />
                ))}
                <OverlayView
                  position={pickupPos}
                  mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                >
                  <div className="flex items-center justify-center -translate-y-[22px]">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative flex items-center justify-center pointer-events-none"
                    >
                      {[1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ scale: [0.5, 4.5], opacity: [0.5, 0] }}
                          transition={{
                            repeat: Infinity,
                            duration: 3,
                            delay: i * 0.75,
                            ease: 'easeOut',
                          }}
                          className="absolute w-20 h-20 rounded-full border-2 border-orange-400/40 bg-orange-400/5 shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                        />
                      ))}

                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                        className="absolute w-[320px] h-[320px] rounded-full overflow-hidden"
                        style={{
                          background: 'conic-gradient(from 0deg, rgba(249, 115, 22, 0.5) 0deg, transparent 60deg, transparent 360deg)',
                        }}
                      />
                    </motion.div>
                  </div>
                </OverlayView>
              </>
            )}

            {dropPos && (
              <Polyline
                path={[pickupPos, dropPos]}
                options={{
                  strokeColor: '#0f172a',
                  strokeOpacity: 0.2,
                  strokeWeight: 4,
                  icons: [{
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '10px',
                  }],
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center p-8 text-center" />
        )}
      </div>

      <div className="absolute top-8 left-4 right-16 z-20 bg-white/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] border border-white/80">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">Parcel Route</p>
        <p className="text-[13px] font-extrabold text-slate-900 leading-tight truncate">{routeState.pickup || 'Pickup'} to {routeState.drop || 'Drop'}</p>
      </div>

      <AnimatePresence>
        {isAccepted && otp && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0, x: -20 }}
            animate={{ scale: 1, opacity: 1, x: 0 }}
            className="absolute top-[88px] left-4 z-20 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.12)] rounded-[12px] p-3 min-w-[70px] border border-slate-50"
          >
            <p className="text-[18px] font-extrabold text-[#1d4ed8] leading-tight text-center tracking-wider">{otp}</p>
            <p className="text-[10px] font-bold text-slate-400 mt-0.5 text-center whitespace-nowrap">Pickup OTP</p>
          </motion.div>
        )}
      </AnimatePresence>

      {(isSearching || isAccepted) && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowCancelConfirm(true)}
          className="absolute top-8 right-4 z-20 w-10 h-10 bg-white/90 backdrop-blur-md rounded-[12px] shadow-[0_4px_14px_rgba(15,23,42,0.10)] border border-white/80 flex items-center justify-center"
        >
          <X size={16} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>
      )}

      <div className="absolute bottom-8 left-4 right-4 z-20">
        <AnimatePresence mode="wait">
          {isSearching && (
            <motion.div
              key="searching"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="rounded-[32px] border border-white/80 bg-white/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] px-6 pt-3 pb-6 space-y-5"
            >
              <div className="w-10 h-1.5 bg-slate-100 rounded-full mx-auto mb-2" />

              <div className="text-center space-y-1.5">
                <h1 className="text-[22px] font-extrabold text-slate-950 tracking-tight">Finding your delivery captain</h1>
                <p className="text-[13px] font-semibold text-slate-400 max-w-[260px] mx-auto leading-normal">{searchStatus}</p>
              </div>

              <div className="rounded-[24px] border border-orange-100 bg-gradient-to-r from-orange-50 via-white to-amber-50 px-5 py-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">Expected Price</p>
                <p className="mt-1 text-[24px] font-extrabold tracking-tight text-slate-950">{expectedFareLabel}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">{expectedFareMeta}</p>
              </div>

              <div className="flex justify-center gap-2.5 py-1">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 1.4, 1],
                      opacity: [0.3, 1, 0.3],
                      backgroundColor: ['#e2e8f0', '#f97316', '#e2e8f0'],
                    }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                    className="w-2.5 h-2.5 rounded-full"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between px-5 py-4 rounded-[24px] bg-slate-50/80 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Fast Dispatch</span>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div className="flex items-center gap-3">
                  <ShieldCheck size={20} className="text-blue-500" strokeWidth={2.5} />
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Parcel Safety</span>
                </div>
              </div>

              {bookingError && (
                <div className="rounded-[22px] border border-red-100 bg-red-50 px-4 py-3 text-center">
                  <p className="text-[12px] font-bold text-red-500">{bookingError}</p>
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCancelConfirm(true)}
                className="w-full py-4.5 rounded-[22px] bg-red-50 text-[13px] font-extrabold text-red-500 uppercase tracking-[0.1em] hover:bg-red-100 transition-colors border border-red-100/50"
              >
                Cancel Search
              </motion.button>
            </motion.div>
          )}

          {isAccepted && (
            <motion.div
              key="accepted"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="px-0"
            >
              <div className="overflow-hidden rounded-[32px] bg-white shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18)] border border-slate-100">
                <div className="flex items-center justify-center gap-2.5 bg-emerald-50/50 py-4 border-b border-emerald-100/50">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                    <CheckCircle2 size={12} className="text-white" strokeWidth={3} />
                  </div>
                  <span className="text-[14px] font-black tracking-tight text-emerald-700 uppercase tracking-wider">Captain confirmed</span>
                </div>

                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] font-black text-slate-400 uppercase tracking-widest">{driver.name || 'Captain'}</span>
                        <div className="flex items-center gap-1 bg-yellow-400/10 px-1.5 py-0.5 rounded-full border border-yellow-400/20">
                          <Star size={10} className="fill-yellow-500 text-yellow-500" />
                          <span className="text-[11px] font-black text-yellow-700">{driver.rating || '4.7'}</span>
                        </div>
                      </div>

                      <h2 className="text-[28px] font-black tracking-tighter text-slate-900 leading-none mb-4 uppercase">
                        {driver.plate || 'Assigned'}
                      </h2>

                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200/50">
                        <p className="text-[12px] font-black text-slate-600">
                          {[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel, driver.vehicleType || 'Delivery Vehicle'].filter(Boolean).join(' ') || 'Delivery Vehicle'}
                        </p>
                      </div>
                    </div>

                    <div className="relative h-20 w-24 shrink-0">
                      <div className="absolute right-0 top-0 h-20 w-20 overflow-hidden rounded-[24px] bg-[#1d2333] border-4 border-white shadow-xl flex items-center justify-center">
                        <img
                          src={driver.vehicleIconUrl || availableVehicleIcon || BikeIcon}
                          className="h-12 w-12 object-contain brightness-0 invert opacity-90"
                          alt="Vehicle"
                        />
                      </div>
                      <div className="absolute -left-2 bottom-0 h-16 w-16 overflow-hidden rounded-full border-[4px] border-white shadow-2xl bg-slate-200">
                        <img
                          src={driver.profileImage || `https://ui-avatars.com/api/?name=${(driver.name || 'DC').replace(' ', '+')}&background=cbd5e1&color=0f172a`}
                          className="h-full w-full object-cover"
                          alt="Driver"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-7 grid grid-cols-2 gap-4">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => window.open(`tel:${driver.phone}`)}
                      className="flex items-center justify-center gap-3 rounded-[22px] bg-slate-50 py-4.5 border border-slate-200/60 hover:bg-slate-100 transition-colors"
                    >
                      <Phone size={18} className="text-slate-900" strokeWidth={2.5} />
                      <span className="text-[13px] font-black text-slate-900 uppercase tracking-widest leading-none">Call</span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => navigate(`${routePrefix}/parcel/chat`, { state: { driver } })}
                      className="flex items-center justify-center gap-3 rounded-[22px] bg-slate-950 py-4.5 shadow-[0_12px_24px_rgba(15,23,42,0.15)] active:shadow-none"
                    >
                      <MessageCircle size={18} className="text-white" strokeWidth={2.5} />
                      <span className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Chat</span>
                    </motion.button>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2.5">
                <div className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
                <span className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">Captain is arriving</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCancelConfirm && (
          <div className="z-[100] relative">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCancelConfirm(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] max-w-sm bg-white rounded-[28px] p-7 z-[101] shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-red-50 rounded-[18px] flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-red-400" strokeWidth={2} />
              </div>
              <h3 className="text-[18px] font-bold text-slate-900 mb-1.5">Cancel parcel search?</h3>
              <p className="text-[13px] font-bold text-slate-400 mb-6 leading-relaxed">
                We&apos;re still searching nearby captains. Stop looking?
              </p>
              <div className="space-y-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCancel}
                  className="w-full bg-slate-900 text-white py-3.5 rounded-[16px] text-[13px] font-bold uppercase tracking-widest"
                >
                  Yes, Cancel
                </motion.button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="w-full py-3.5 text-[13px] font-bold text-slate-400 uppercase tracking-widest"
                >
                  {isSearching ? 'Keep Searching' : 'Go Back'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ParcelSearchingDriver;
