import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, 
  MessageCircle, 
  AlertTriangle, 
  Shield, 
  Star, 
  ChevronLeft, 
  Share2, 
  Package, 
  CheckCircle2,
  Receipt,
  Clock, 
  ShieldCheck, 
  ChevronRight
} from 'lucide-react';
import { GoogleMap, OverlayView, OverlayViewF, PolylineF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../../admin/utils/googleMaps';
import { socketService } from '../../../../shared/api/socket';
import api from '../../../../shared/api/axiosInstance';
import { BACKEND_ORIGIN } from '../../../../shared/api/runtimeConfig';
import { subscribeRideRealtime } from '../../../../shared/services/rideRealtime';
import { computeDrivingRoute } from '../../../../shared/utils/googleRoutes';
import { clearCurrentRide, getCurrentRide, saveCurrentRide } from '../../services/currentRideService';

// Assets (Using the same icons as RideTracking)
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'delivered']);
const ACTIVE_RIDE_VALIDATE_MS = 4000;
const COMPLETED_TRACKING_STATUSES = new Set(['completed', 'delivered']);
const TIP_OPTIONS = [0, 20, 50, 100];
const ROUTE_REFRESH_MIN_DISTANCE_METERS = 30;
const ROUTE_REFRESH_MIN_INTERVAL_MS = 4000;
const ROUTE_PROGRESS_CAPTURE_METERS = 40;
const ROUTE_DESTINATION_CHANGE_METERS = 15;
const MAX_ROUTE_CACHE_ENTRIES = 120;

const toLatLng = (coords, fallback = DEFAULT_CENTER) => {
  const [lng, lat] = coords || [];
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { lat: Number(lat), lng: Number(lng) };
  }
  return fallback;
};

const arePositionsNearlyEqual = (first, second, threshold = 0.0002) => (
  Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
  Math.abs(Number(first?.lng ?? 0) - Number(second?.lng ?? 0)) < threshold
);

const toRadians = (value) => Number(value || 0) * (Math.PI / 180);

const getDistanceMeters = (first, second) => {
  if (!first || !second) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(Number(second.lat) - Number(first.lat));
  const deltaLng = toRadians(Number(second.lng) - Number(first.lng));
  const startLat = toRadians(first.lat);
  const endLat = toRadians(second.lat);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const normalizeHeading = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return ((numeric % 360) + 360) % 360;
};

const calculateBearing = (from, to, fallback = 0) => {
  if (!from || !to || arePositionsNearlyEqual(from, to, 0.00001)) return fallback;
  const fromLat = Number(from.lat) * (Math.PI / 180);
  const toLat = Number(to.lat) * (Math.PI / 180);
  const deltaLng = (Number(to.lng) - Number(from.lng)) * (Math.PI / 180);
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return normalizeHeading(Math.atan2(y, x) * (180 / Math.PI), fallback);
};

const getRouteHeading = (position, path = [], fallback = 0) => {
  const nextPoint = path.find((point) => !arePositionsNearlyEqual(position, point, 0.00001));
  return nextPoint ? calculateBearing(position, nextPoint, fallback) : fallback;
};

const RotatingVehicleMarker = ({ position, iconUrl = deliveryIcon, heading = 0, title = 'Delivery Captain' }) => (
  <OverlayViewF
    position={position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
  >
    <div title={title} className="pointer-events-none flex h-14 w-14 items-center justify-center">
      <div
        className="flex h-11 w-11 items-center justify-center transition-transform duration-500 ease-out"
        style={{ transform: `rotate(${normalizeHeading(heading)}deg)` }}
      >
        <img
          src={iconUrl || deliveryIcon}
          alt={title}
          className="h-12 w-12 object-contain drop-shadow-[0_8px_10px_rgba(15,23,42,0.35)]"
          draggable={false}
        />
      </div>
    </div>
  </OverlayViewF>
);

const CircleLocationMarker = ({ position, color = '#ef4444', size = 14, title = 'Destination' }) => (
  <OverlayViewF
    position={position}
    mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    getPixelPositionOffset={() => ({ x: -(size / 2), y: -(size / 2) })}
  >
    <div
      title={title}
      className="pointer-events-none rounded-full border-2 border-white shadow-[0_3px_10px_rgba(15,23,42,0.25)]"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  </OverlayViewF>
);

const getTrackingVehicleIcon = (ride, driver) => {
  const customIcon = String(
    ride?.vehicleIconUrl ||
    ride?.vehicle?.vehicleIconUrl ||
    ride?.vehicle?.icon ||
    driver?.vehicleIconUrl ||
    driver?.map_icon ||
    driver?.icon ||
    '',
  ).trim();
  if (customIcon) return customIcon;
  const iconType = String(ride?.vehicleIconType || driver?.vehicleIconType || driver?.vehicleType || '').toLowerCase();
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  if (iconType.includes('car')) return carIcon;
  return deliveryIcon;
};

const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;

const resolveAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${BACKEND_ORIGIN}${raw}`;
  return `${BACKEND_ORIGIN}/${raw.replace(/^\/+/, '')}`;
};

const mergeDriverSnapshot = (baseDriver = {}, incomingDriver = {}) => ({
  ...baseDriver,
  ...incomingDriver,
  profileImage: incomingDriver.profileImage || baseDriver.profileImage || '',
  vehicleImage: incomingDriver.vehicleImage || baseDriver.vehicleImage || '',
  name: incomingDriver.name || baseDriver.name || 'Delivery Captain',
  phone: incomingDriver.phone || baseDriver.phone || '',
  rating: incomingDriver.rating || baseDriver.rating || '4.9',
  plate: incomingDriver.plate || baseDriver.plate || incomingDriver.vehicleNumber || baseDriver.vehicleNumber || 'Assigned',
});

const getInitials = (name = '') =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'DC';
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

const trimRoutePathFromPosition = (path = [], position) => {
  if (!Array.isArray(path) || path.length < 2 || !position) {
    return null;
  }

  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  path.forEach((point, index) => {
    const distance = getDistanceMeters(position, point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex < 0 || nearestDistance > ROUTE_PROGRESS_CAPTURE_METERS) {
    return null;
  }

  if (nearestIndex >= path.length - 1) {
    return [position];
  }

  return [position, ...path.slice(nearestIndex + 1)];
};

const rememberRouteCacheEntry = (cache, key, value) => {
  cache.set(key, value);

  if (cache.size <= MAX_ROUTE_CACHE_ENTRIES) {
    return;
  }

  const firstKey = cache.keys().next().value;
  if (firstKey) {
    cache.delete(firstKey);
  }
};

const ParcelTracking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const storedRide = useMemo(() => getCurrentRide(), []);
  const state = useMemo(() => location.state || storedRide || {}, [location.state, storedRide]);
  const [rideRealtime, setRideRealtime] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [map, setMap] = useState(null);
  const [socketRealtimeHealthy, setSocketRealtimeHealthy] = useState(() => socketService.isConnected());
  const [rating, setRating] = useState(() => Number(state.feedback?.rating || 0));
  const [comment, setComment] = useState(() => state.feedback?.comment || '');
  const [selectedTip, setSelectedTip] = useState(() => Number(state.feedback?.tipAmount || 0));
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(Boolean(state.feedback?.submittedAt));
  const [feedbackError, setFeedbackError] = useState('');
  const [tipSettings, setTipSettings] = useState({
    enable_tips: '1',
    min_tip_amount: '10',
  });
  const { isLoaded, loadError } = useBaseGoogleMapsLoader();
  const latestStateRef = useRef(state);
  const latestDriverRef = useRef(state.driver || {});
  const latestRideRealtimeRef = useRef(null);
  const hydrateRideStateRef = useRef(async () => {});
  const hasAutoFramedMapRef = useRef(false);
  const hasCompletedRedirectRef = useRef(false);
  const routeCacheRef = useRef(new Map());
  const lastResolvedRouteRef = useRef({
    origin: null,
    destination: null,
    resolvedAt: 0,
  });

  const rideId = state.rideId || '';
  const tripStatus = String(rideRealtime?.status || state.liveStatus || state.status || 'accepted').toLowerCase();
  
  const pickupPosition = useMemo(() => toLatLng(rideRealtime?.pickup?.coordinates || state.pickupCoords || [75.9048, 22.7039]), [rideRealtime?.pickup?.coordinates, state.pickupCoords]);
  const dropPosition = useMemo(() => toLatLng(rideRealtime?.drop?.coordinates || state.dropCoords || [75.8937, 22.7533], pickupPosition), [pickupPosition, rideRealtime?.drop?.coordinates, state.dropCoords]);
  const driverPosition = useMemo(() => toLatLng(rideRealtime?.driverLocation?.coordinates, pickupPosition), [pickupPosition, rideRealtime?.driverLocation?.coordinates]);
  const activeDestination = useMemo(
    () => (['started', 'ongoing', 'arrived', 'completed', 'delivered'].includes(tripStatus) ? dropPosition : pickupPosition),
    [dropPosition, pickupPosition, tripStatus],
  );

  const driver = useMemo(() => mergeDriverSnapshot(state.driver || {}, rideRealtime?.driver || {}), [state.driver, rideRealtime?.driver]);
  const vehicleIcon = getTrackingVehicleIcon(state, driver);
  const displayDriverHeading = useMemo(() => {
    if (Number.isFinite(Number(rideRealtime?.driverLocation?.heading))) {
      return normalizeHeading(rideRealtime.driverLocation.heading);
    }

    return getRouteHeading(
      driverPosition,
      routePath,
      calculateBearing(driverPosition, activeDestination),
    );
  }, [activeDestination, driverPosition, rideRealtime?.driverLocation?.heading, routePath]);
  const fare = rideRealtime?.fare || state.fare || 45;
  const otp = String(rideRealtime?.otp || state.otp || '');
  const completedAt = rideRealtime?.completedAt || state.completedAt || Date.now();
  const isDeliveryCompleted = COMPLETED_TRACKING_STATUSES.has(tripStatus);
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);
  const availableTipOptions = useMemo(
    () =>
      [...new Set([0, minimumTipAmount, ...TIP_OPTIONS].filter((amount) => Number.isFinite(amount) && amount >= 0))]
        .sort((left, right) => left - right),
    [minimumTipAmount],
  );
  const totalBill = Number(fare || 0) + Number(selectedTip || 0);
  const completedDateLabel = new Date(completedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const completedTimeLabel = new Date(completedAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  useEffect(() => {
    hasCompletedRedirectRef.current = false;
  }, [rideId]);

  useEffect(() => {
    const fetchTipSettings = async () => {
      try {
        const response = await api.get('/rides/app-settings/tip');
        const nextSettings = response?.data?.settings || response?.settings || {};
        setTipSettings((current) => ({
          ...current,
          ...nextSettings,
        }));
      } catch {
        // keep defaults for parcel feedback
      }
    };

    fetchTipSettings();
  }, []);

  useEffect(() => {
    const feedback = rideRealtime?.feedback || state.feedback || null;
    if (!feedback) {
      return;
    }

    setRating(Number(feedback.rating || 0));
    setComment(feedback.comment || '');
    setSelectedTip(Number(feedback.tipAmount || 0));
    setIsFeedbackSubmitted(Boolean(feedback.submittedAt));
  }, [rideRealtime?.feedback, state.feedback]);

  useEffect(() => {
    let active = true;

    if (!rideId) {
      return () => {
        active = false;
      };
    }

    const hydrateRideState = async () => {
      try {
        const payload = unwrapApiPayload(await api.get(`/rides/${rideId}`));

        if (!active || !payload) {
          return;
        }

        const mergedDriver = mergeDriverSnapshot(latestStateRef.current.driver || {}, payload?.driver || {});
        const nextRealtime = {
          pickup: {
            coordinates: payload?.pickupLocation?.coordinates,
            address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
          },
          drop: {
            coordinates: payload?.dropLocation?.coordinates,
            address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
          },
          driverLocation: payload?.lastDriverLocation
            ? {
                coordinates: payload.lastDriverLocation.coordinates,
                heading: payload.lastDriverLocation.heading,
              }
            : latestRideRealtimeRef.current?.driverLocation || null,
          status: payload?.liveStatus || payload?.status || 'accepted',
          fare: payload?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload?.otp || latestStateRef.current.otp || '',
          completedAt: payload?.completedAt || latestStateRef.current.completedAt || null,
          feedback: payload?.feedback || latestStateRef.current.feedback || null,
          driver: mergedDriver,
        };

        const nextStatus = String(nextRealtime.status || '').toLowerCase();
        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          setRideRealtime(nextRealtime);
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: mergedDriver,
            fare: payload?.fare || latestStateRef.current.fare || 0,
            paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload?.completedAt || latestStateRef.current.completedAt || Date.now(),
            feedback: payload?.feedback || latestStateRef.current.feedback || null,
          });
          return;
        }

        if (TERMINAL_STATUSES.has(nextStatus)) {
          clearCurrentRide();
          navigate(userHomeRoute, { replace: true });
          return;
        }

        setRideRealtime(nextRealtime);
        saveCurrentRide({
          ...latestStateRef.current,
          rideId,
          driver: mergedDriver,
          status: payload?.status || latestStateRef.current.status || 'accepted',
          liveStatus: payload?.liveStatus || payload?.status || latestStateRef.current.liveStatus || 'accepted',
        });
      } catch {
        // socket updates continue to drive the UI
      }
    };

    hydrateRideStateRef.current = hydrateRideState;
    hydrateRideState();
    const intervalId = window.setInterval(hydrateRideState, ACTIVE_RIDE_VALIDATE_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [rideId]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    latestDriverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    latestRideRealtimeRef.current = rideRealtime;
  }, [rideRealtime]);

  useEffect(() => {
    if (!rideId) {
      return undefined;
    }

    const refreshTrackingState = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }

      socketService.connect({ role: 'user' });
      socketService.emit('ride:join', { rideId });

      const hydrate = hydrateRideStateRef.current;
      if (typeof hydrate === 'function') {
        Promise.resolve(hydrate()).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', refreshTrackingState);
    window.addEventListener('focus', refreshTrackingState);

    return () => {
      document.removeEventListener('visibilitychange', refreshTrackingState);
      window.removeEventListener('focus', refreshTrackingState);
    };
  }, [rideId]);

  useEffect(() => {
    hasAutoFramedMapRef.current = false;
  }, [rideId, tripStatus, activeDestination.lat, activeDestination.lng]);

  useEffect(() => {
    if (!tipsEnabled && selectedTip !== 0) {
      setSelectedTip(0);
      return;
    }

    if (tipsEnabled && minimumTipAmount > 0 && selectedTip > 0 && selectedTip < minimumTipAmount) {
      setSelectedTip(minimumTipAmount);
    }
  }, [minimumTipAmount, selectedTip, tipsEnabled]);

  // Socket & Polling
  useEffect(() => {
    if (!rideId) return;
    const socket = socketService.connect({ role: 'user' });
    if (!socket) {
      setSocketRealtimeHealthy(false);
      return;
    }

    const onRideState = (payload) => {
      if (String(payload?.rideId) !== String(rideId)) {
        return;
      }

      const nextStatus = String(payload?.liveStatus || payload?.status || '').toLowerCase();
      if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
        const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload?.driver || {});
        setRideRealtime((prev) => ({
          ...(prev || {}),
          pickup: {
            coordinates: payload?.pickupLocation?.coordinates,
            address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
          },
          drop: {
            coordinates: payload?.dropLocation?.coordinates,
            address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
          },
          driverLocation: payload?.lastDriverLocation
            ? {
                coordinates: payload.lastDriverLocation.coordinates,
                heading: payload.lastDriverLocation.heading,
              }
            : prev?.driverLocation || latestRideRealtimeRef.current?.driverLocation || null,
          status: nextStatus,
          fare: payload?.fare || prev?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload?.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload?.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload?.otp || prev?.otp || latestStateRef.current.otp || '',
          completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
          feedback: payload?.feedback || prev?.feedback || null,
          driver: mergedDriver,
        }));
        saveCurrentRide({
          ...latestStateRef.current,
          ...payload,
          rideId,
          driver: mergedDriver,
          fare: payload?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          status: nextStatus,
          liveStatus: nextStatus,
          completedAt: payload?.completedAt || Date.now(),
          feedback: payload?.feedback || null,
        });
        return;
      }

      if (TERMINAL_STATUSES.has(nextStatus)) {
        clearCurrentRide();
        navigate(userHomeRoute, { replace: true });
        return;
      }

      const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload?.driver || {});
      setRideRealtime((prev) => ({
        pickup: {
          coordinates: payload?.pickupLocation?.coordinates,
          address: payload?.pickupAddress || latestStateRef.current.pickup || 'Pickup',
        },
        drop: {
          coordinates: payload?.dropLocation?.coordinates,
          address: payload?.dropAddress || latestStateRef.current.drop || 'Drop',
        },
        driverLocation: payload?.lastDriverLocation
          ? {
              coordinates: payload.lastDriverLocation.coordinates,
              heading: payload.lastDriverLocation.heading,
            }
          : prev?.driverLocation || null,
        status: payload?.liveStatus || payload?.status || prev?.status || 'accepted',
        fare: payload?.fare || prev?.fare || latestStateRef.current.fare || 0,
        paymentMethod: payload?.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
        vehicleIconType: payload?.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
        vehicleIconUrl: payload?.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
        otp: payload?.otp || prev?.otp || latestStateRef.current.otp || '',
        completedAt: payload?.completedAt || prev?.completedAt || null,
        feedback: payload?.feedback || prev?.feedback || null,
        driver: mergedDriver,
      }));
    };
    const onLocationUpdated = (payload) => {
      if (String(payload.rideId) === String(rideId)) {
        setRideRealtime(prev => ({
          ...prev,
          driverLocation: {
            coordinates: payload.coordinates,
            heading: payload.heading ?? prev?.driverLocation?.heading ?? null,
          }
        }));
      }
    };
    const onStatusUpdated = (payload) => {
      if (String(payload.rideId) === String(rideId)) {
        const nextStatus = String(payload.liveStatus || payload.status).toLowerCase();
        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          setRideRealtime((prev) => ({
            ...(prev || {}),
            status: nextStatus,
            completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
            feedback: payload?.feedback || prev?.feedback || null,
          }));
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: latestDriverRef.current,
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload?.completedAt || Date.now(),
            feedback: payload?.feedback || null,
          });
          return;
        }
        if (TERMINAL_STATUSES.has(nextStatus)) {
          clearCurrentRide();
          navigate(userHomeRoute, { replace: true });
          return;
        }
        setRideRealtime(prev => ({ ...prev, status: nextStatus }));
      }
    };

    socketService.on('ride:state', onRideState);
    socketService.on('ride:driver-location:updated', onLocationUpdated);
    socketService.on('ride:status:updated', onStatusUpdated);
    socketService.emit('ride:join', { rideId });
    setSocketRealtimeHealthy(socket.connected);
    const onSocketConnect = () => setSocketRealtimeHealthy(true);
    const onSocketDisconnect = () => setSocketRealtimeHealthy(false);
    const onSocketConnectError = () => setSocketRealtimeHealthy(false);
    socket.on('connect', onSocketConnect);
    socket.on('disconnect', onSocketDisconnect);
    socket.on('connect_error', onSocketConnectError);

    return () => {
      socketService.off('ride:state', onRideState);
      socketService.off('ride:driver-location:updated', onLocationUpdated);
      socketService.off('ride:status:updated', onStatusUpdated);
      socket.off('connect', onSocketConnect);
      socket.off('disconnect', onSocketDisconnect);
      socket.off('connect_error', onSocketConnectError);
    };
  }, [rideId, navigate, routePrefix, userHomeRoute]);

  useEffect(() => {
    if (!TERMINAL_STATUSES.has(tripStatus)) {
      return;
    }

    if (COMPLETED_TRACKING_STATUSES.has(tripStatus)) {
      return;
    }

    clearCurrentRide();
    navigate(userHomeRoute, { replace: true });
  }, [navigate, tripStatus, userHomeRoute]);

  useEffect(() => {
    if (!rideId || socketRealtimeHealthy) {
      return () => {};
    }

    return subscribeRideRealtime(
      rideId,
      (payload) => {
        if (!payload || String(payload.rideId || '') !== String(rideId)) {
          return;
        }

        const nextStatus = String(payload.liveStatus || payload.status || 'accepted').toLowerCase();
        const mergedDriver = mergeDriverSnapshot(latestDriverRef.current, payload.driver || {});

        setRideRealtime((prev) => ({
          ...(prev || {}),
          pickup: payload.pickup || prev?.pickup || {
            coordinates: latestStateRef.current.pickupCoords,
            address: latestStateRef.current.pickup || 'Pickup',
          },
          drop: payload.drop || prev?.drop || {
            coordinates: latestStateRef.current.dropCoords,
            address: latestStateRef.current.drop || 'Drop',
          },
          driverLocation: payload.driverLocation || prev?.driverLocation || latestRideRealtimeRef.current?.driverLocation || null,
          status: payload.liveStatus || payload.status || prev?.status || 'accepted',
          fare: payload.fare || prev?.fare || latestStateRef.current.fare || 0,
          paymentMethod: payload.paymentMethod || prev?.paymentMethod || latestStateRef.current.paymentMethod || 'Cash',
          vehicleIconType: payload.vehicleIconType || prev?.vehicleIconType || latestStateRef.current.vehicleIconType || '',
          vehicleIconUrl: payload.vehicleIconUrl || prev?.vehicleIconUrl || latestStateRef.current.vehicleIconUrl || '',
          otp: payload.otp || prev?.otp || latestStateRef.current.otp || '',
          completedAt: payload.completedAt || prev?.completedAt || null,
          feedback: payload.feedback || prev?.feedback || null,
          driver: mergedDriver,
        }));

        if (COMPLETED_TRACKING_STATUSES.has(nextStatus)) {
          saveCurrentRide({
            ...latestStateRef.current,
            ...payload,
            rideId,
            driver: mergedDriver,
            status: nextStatus,
            liveStatus: nextStatus,
            completedAt: payload.completedAt || Date.now(),
            feedback: payload.feedback || null,
          });
        }
      },
      () => {},
    );
  }, [rideId, socketRealtimeHealthy]);

  // Route Path Update
  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.importLibrary) {
      setRoutePath(arePositionsNearlyEqual(driverPosition, activeDestination) ? [driverPosition] : [driverPosition, activeDestination]);
      return;
    }

    if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
      setRoutePath([driverPosition]);
      return;
    }

    const trimmedRoutePath = trimRoutePathFromPosition(routePath, driverPosition);
    if (trimmedRoutePath) {
      const currentFirstPoint = routePath[0];
      const nextFirstPoint = trimmedRoutePath[0];
      const shouldUpdateRoutePath = routePath.length !== trimmedRoutePath.length ||
        !arePositionsNearlyEqual(currentFirstPoint, nextFirstPoint, 0.00001);

      if (shouldUpdateRoutePath) {
        setRoutePath(trimmedRoutePath);
      }
    }

    const now = Date.now();
    const lastResolvedRoute = lastResolvedRouteRef.current;
    const destinationChanged = !lastResolvedRoute.destination ||
      getDistanceMeters(lastResolvedRoute.destination, activeDestination) > ROUTE_DESTINATION_CHANGE_METERS;
    const movedEnough = !lastResolvedRoute.origin ||
      getDistanceMeters(lastResolvedRoute.origin, driverPosition) > ROUTE_REFRESH_MIN_DISTANCE_METERS;
    const staleEnough = now - Number(lastResolvedRoute.resolvedAt || 0) >= ROUTE_REFRESH_MIN_INTERVAL_MS;

    if (!destinationChanged && !(movedEnough && staleEnough)) {
      return;
    }

    const routeCacheKey = getRouteCacheKey(driverPosition, activeDestination);
    const cachedRoute = routeCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute);
      lastResolvedRouteRef.current = {
        origin: driverPosition,
        destination: activeDestination,
        resolvedAt: now,
      };
      return;
    }

    let active = true;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: driverPosition,
        destination: activeDestination,
      });

      if (!active) {
        return;
      }

      if (result.status === 'OK' && result.path.length) {
        rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, result.path);
        lastResolvedRouteRef.current = {
          origin: driverPosition,
          destination: activeDestination,
          resolvedAt: Date.now(),
        };
        setRoutePath(result.path);
        return;
      }

      const fallbackRoute = [driverPosition, activeDestination];
      rememberRouteCacheEntry(routeCacheRef.current, routeCacheKey, fallbackRoute);
      lastResolvedRouteRef.current = {
        origin: driverPosition,
        destination: activeDestination,
        resolvedAt: Date.now(),
      };
      setRoutePath(fallbackRoute);
    })();

    return () => {
      active = false;
    };
  }, [activeDestination, driverPosition, isLoaded, routePath]);

  useEffect(() => {
    if (!map || !window.google?.maps) {
      return;
    }

    if (routePath.length > 1) {
      if (!hasAutoFramedMapRef.current) {
        const bounds = new window.google.maps.LatLngBounds();
        routePath.forEach((point) => bounds.extend(point));
        bounds.extend(driverPosition);
        bounds.extend(activeDestination);
        map.fitBounds(bounds, { top: 120, right: 48, bottom: 320, left: 48 });
        hasAutoFramedMapRef.current = true;
        return;
      }

      map.panTo(driverPosition);
      return;
    }

    if (!hasAutoFramedMapRef.current) {
      map.panTo(driverPosition);
      map.setZoom(15);
      hasAutoFramedMapRef.current = true;
      return;
    }

    map.panTo(driverPosition);
  }, [activeDestination, driverPosition, map, routePath]);

  const handleCall = () => {
    if (driver.phone) window.open(`tel:${driver.phone}`, '_self');
  };

  const handleShare = () => {
    const text = `Tracking my delivery! Driver: ${driver.name}, Vehicle: ${driver.plate}. Destination: ${state.drop}`;
    if (navigator.share) navigator.share({ title: 'Parcel Tracking', text });
    else {
      navigator.clipboard.writeText(text);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    }
  };

  const submitParcelFeedback = async () => {
    if (!rideId) {
      clearCurrentRide();
      navigate(userHomeRoute, { replace: true });
      return;
    }

    if (rating < 1) {
      setFeedbackError('Please rate your delivery driver before finishing.');
      return;
    }

    if (!tipsEnabled && Number(selectedTip || 0) > 0) {
      setFeedbackError('Tips are currently disabled.');
      return;
    }

    if (tipsEnabled && Number(selectedTip || 0) > 0 && minimumTipAmount > 0 && Number(selectedTip || 0) < minimumTipAmount) {
      setFeedbackError(`Minimum tip amount is Rs ${minimumTipAmount}.`);
      return;
    }

    try {
      setIsSubmittingFeedback(true);
      setFeedbackError('');
      const response = await api.patch(`/rides/${rideId}/feedback`, {
        rating,
        comment,
        tipAmount: selectedTip || 0,
      });
      const payload = unwrapApiPayload(response) || {};
      const feedback = payload?.feedback || {
        rating,
        comment,
        tipAmount: selectedTip || 0,
        submittedAt: new Date().toISOString(),
      };

      setRideRealtime((prev) => ({
        ...(prev || {}),
        feedback,
        completedAt: payload?.completedAt || prev?.completedAt || Date.now(),
      }));
      setIsFeedbackSubmitted(true);
      saveCurrentRide({
        ...latestStateRef.current,
        ...(rideRealtime || {}),
        rideId,
        driver,
        fare,
        paymentMethod: rideRealtime?.paymentMethod || state.paymentMethod || 'Cash',
        status: tripStatus,
        liveStatus: tripStatus,
        completedAt: payload?.completedAt || completedAt,
        feedback,
      });
    } catch (error) {
      setFeedbackError(error?.message || 'Could not submit feedback right now.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto relative font-sans overflow-hidden">
      {/* Map Content */}
      <div className="absolute inset-0 z-0">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={driverPosition}
            zoom={15}
            onLoad={setMap}
            options={{
              disableDefaultUI: true,
              styles: [
                { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] }
              ]
            }}
          >
            {routePath.length > 0 && (
              <PolylineF
                path={routePath}
                options={{ strokeColor: '#0f172a', strokeOpacity: 0.9, strokeWeight: 6 }}
              />
            )}
            <RotatingVehicleMarker position={driverPosition} iconUrl={vehicleIcon} heading={displayDriverHeading} />
            <CircleLocationMarker
              position={activeDestination}
              title={['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus) ? 'Drop' : 'Pickup'}
              color={['started', 'ongoing', 'arrived', 'completed'].includes(tripStatus) ? '#ef4444' : '#10b981'}
            />
          </GoogleMap>
        ) : (
          <div className="h-full w-full bg-slate-200 animate-pulse" />
        )}
      </div>

      {/* Header Overlays */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-8 left-4 right-4 z-10 flex gap-3">
        <button onClick={() => navigate(userHomeRoute, { replace: true })} className="w-12 h-12 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/80 flex items-center justify-center text-gray-900">
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <div className="min-w-0 flex-1 bg-white/90 backdrop-blur-xl rounded-2xl p-3 shadow-xl border border-white/80 flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900">
            <Package size={16} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Destination</p>
            <p className="mt-1 truncate text-xs font-black text-gray-900">
              {state.drop || 'Drop'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Toast Notification */}
      <AnimatePresence>
        {shareToast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-full text-xs font-black shadow-2xl">
            Tracking link copied!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Tracking Card */}
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-[40px] shadow-[0_-20px_60px_rgba(0,0,0,0.1)] p-6 pb-8 border-t border-gray-100"
      >
        <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto mb-6" />

        {isDeliveryCompleted ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.28)]">
                <CheckCircle2 size={22} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Parcel Delivered</p>
                <h2 className="text-[22px] font-black text-slate-900">Delivered successfully</h2>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/10">
                    <Receipt size={14} className="text-orange-300" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-white">Delivery Summary</p>
                    <p className="text-[10px] font-bold text-slate-400">{completedDateLabel} · {completedTimeLabel}</p>
                  </div>
                </div>
                <button type="button" onClick={handleShare} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-white">
                  <Share2 size={12} />
                  Share
                </button>
              </div>

              <div className="space-y-4 px-4 py-4">
                <div className="flex items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 p-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-slate-900 text-[18px] font-black text-white">
                    {getInitials(driver.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-black text-slate-900">{driver.name}</p>
                    <p className="truncate text-[11px] font-bold text-slate-500">{driver.plate || 'Assigned'} · {driver.vehicle || 'Delivery Agent'}</p>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-black text-slate-800">
                      <Star size={10} className="fill-yellow-500 text-yellow-500" />
                      {driver.rating || '4.9'}
                    </div>
                  </div>
                </div>

                <div className="rounded-[18px] border border-slate-100 bg-white p-3">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <div className="h-10 border-l border-dashed border-slate-200" />
                      <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="truncate text-[13px] font-black text-slate-900">{state.pickup || 'Pickup'}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Pickup</p>
                      </div>
                      <div>
                        <p className="truncate text-[13px] font-black text-slate-900">{state.drop || 'Drop'}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Destination</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[18px] border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-500">Delivery fare</span>
                    <span className="text-[13px] font-black text-slate-900">Rs {Number(fare || 0).toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-500">Tip</span>
                    <span className="text-[13px] font-black text-slate-900">Rs {Number(selectedTip || 0).toFixed(2)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[15px] font-black text-slate-900">Total</span>
                    <span className="text-[18px] font-black text-slate-900">Rs {totalBill.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-white/80 bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              {isFeedbackSubmitted ? (
                <div className="text-center">
                  <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">Feedback submitted</p>
                  <p className="mt-2 text-[12px] font-bold text-slate-500">
                    Rating: {rating || 0}/5 {selectedTip > 0 ? `| Tip added: Rs ${Number(selectedTip || 0).toFixed(2)}` : '| No tip added'}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                    {tipsEnabled ? 'Tip your delivery driver' : 'Driver tips disabled'}
                  </p>
                  {tipsEnabled && minimumTipAmount > 0 ? (
                    <p className="mt-2 text-center text-[11px] font-bold text-slate-500">Minimum tip amount: Rs {minimumTipAmount}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {availableTipOptions.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setSelectedTip(amount);
                          setFeedbackError('');
                        }}
                        disabled={!tipsEnabled && amount > 0}
                        className={`rounded-full border px-4 py-2 text-[11px] font-black transition-all ${
                          selectedTip === amount ? 'border-orange-500 bg-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,0.24)]' : 'border-slate-100 bg-slate-50 text-slate-600'
                        } ${!tipsEnabled && amount > 0 ? 'cursor-not-allowed opacity-50' : ''}`}
                      >
                        {amount === 0 ? 'No tip' : `Rs ${amount}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="rounded-[20px] border border-white/80 bg-white/95 px-4 py-4 text-center shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <p className="text-[16px] font-black text-slate-900">How was your delivery with {driver.name?.split(' ')[0] || 'your driver'}?</p>
              <div className="mt-4 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setRating(value);
                      setFeedbackError('');
                    }}
                    disabled={isFeedbackSubmitted}
                    className={`flex h-11 w-11 items-center justify-center rounded-[12px] transition-all ${
                      rating >= value ? 'bg-orange-500 shadow-[0_10px_20px_rgba(249,115,22,0.24)]' : 'bg-slate-100'
                    } ${isFeedbackSubmitted ? 'cursor-default' : ''}`}
                  >
                    <Star size={19} className={rating >= value ? 'fill-white text-white' : 'text-slate-300'} />
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-[16px] border border-slate-100 bg-slate-50/80 px-3 py-3">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  maxLength={500}
                  disabled={isFeedbackSubmitted}
                  placeholder="Tell us about the delivery"
                  className="w-full resize-none rounded-[12px] border border-slate-100 bg-white px-3 py-2 text-[13px] font-bold text-slate-900 outline-none placeholder:text-slate-300"
                />
              </div>

              {feedbackError ? <p className="mt-3 text-[12px] font-black text-red-500">{feedbackError}</p> : null}

              <button
                type="button"
                onClick={submitParcelFeedback}
                disabled={isSubmittingFeedback || isFeedbackSubmitted}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] bg-slate-900 py-3.5 text-[14px] font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] disabled:opacity-60"
              >
                {isSubmittingFeedback ? 'Saving your feedback...' : isFeedbackSubmitted ? 'Feedback already saved' : 'Submit rating'}
                <ChevronRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => {
                  clearCurrentRide();
                  navigate(userHomeRoute, { replace: true });
                }}
                className="mt-3 text-[12px] font-black text-slate-500"
              >
                Continue home
              </button>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          {/* Driver Info Section */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-[24px] bg-slate-900 overflow-hidden border-2 border-white shadow-sm">
                  <img src={`https://ui-avatars.com/api/?name=${driver.name.replace(' ', '+')}&background=0f172a&color=fff&bold=true`} alt="Driver" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white px-2 py-0.5 rounded-full border border-gray-100 flex items-center gap-1 shadow-sm">
                  <Star size={10} className="text-amber-400 fill-amber-400" />
                  <span className="text-[10px] font-black text-gray-900">{driver.rating}</span>
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-gray-900 leading-tight tracking-tight">{driver.name}</h3>
                <p className="text-xs font-bold text-gray-400 mt-0.5 uppercase tracking-tight">{driver.plate} • {driver.vehicle || 'Delivery Agent'}</p>
                <div className="flex items-center gap-1.5 mt-2 text-slate-900">
                  <Clock size={12} strokeWidth={3} />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {tripStatus === 'arrived' || tripStatus === 'arriving'
                      ? 'Driver Has Arrived'
                      : tripStatus === 'started' || tripStatus === 'ongoing'
                        ? 'Heading to Drop'
                        : 'Arriving Shortly'}
                  </span>
                </div>
              </div>
            </div>

            {/* OTP Display */}
            {otp && (
              <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 flex flex-col items-center">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">OTP</span>
                <span className="text-xl font-black text-slate-900 leading-none">{otp}</span>
              </div>
            )}
          </div>

          {/* Action Grid */}
          <div className="grid grid-cols-4 gap-3">
            <ActionButton icon={Phone} label="Call" onClick={handleCall} />
            <ActionButton icon={MessageCircle} label="Chat" onClick={() => navigate(`${routePrefix}/ride/chat`, { state: { rideId, peer: driver } })} />
            <ActionButton icon={Share2} label="Share" onClick={handleShare} />
            <ActionButton icon={ShieldCheck} label="Safety" onClick={() => navigate(routePrefix ? `${routePrefix}/support` : '/ride/support')} color="dark" />
          </div>

          {/* Trip Footer */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-50">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Estimated Fare</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-gray-900">₹{fare}</span>
                <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-widest">{state.paymentMethod || 'Cash'}</span>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCancelConfirm(true)}
              className="px-6 py-3 rounded-2xl border border-red-100 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-colors"
            >
              Cancel
            </motion.button>
          </div>
        </div>
        )}
      </motion.div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelConfirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCancelConfirm(false)} className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] max-w-lg mx-auto" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 40 }} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm bg-white rounded-[40px] p-8 z-[101] shadow-2xl text-center">
              <div className="w-16 h-16 bg-red-50 rounded-[24px] flex items-center justify-center mx-auto mb-6 text-red-500">
                <AlertTriangle size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">Cancel Delivery?</h3>
              <p className="text-sm font-bold text-gray-400 mb-8 leading-relaxed">Your delivery agent is already moving. Cancellation may incur charges.</p>
              <div className="flex flex-col gap-3">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    api.patch(`/rides/${rideId}/cancel`).finally(() => {
                      clearCurrentRide();
                      navigate(userHomeRoute, { replace: true });
                    });
                  }}
                  className="w-full bg-red-500 text-white py-5 rounded-[24px] text-sm font-black uppercase tracking-widest shadow-xl shadow-red-500/20"
                >
                  Yes, Cancel
                </motion.button>
                <button onClick={() => setShowCancelConfirm(false)} className="w-full py-4 text-sm font-black text-gray-400 uppercase tracking-widest">Keep Tracking</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionButton = ({ icon: Icon, label, onClick, color = 'gray' }) => (
  <motion.button
    whileTap={{ scale: 0.94 }}
    onClick={onClick}
    className={`flex flex-col items-center gap-1.5 py-4 rounded-[24px] border ${
      color === 'dark'
        ? 'bg-slate-900 border-slate-900 text-white'
        : 'bg-gray-50 border-gray-100 text-gray-700'
    }`}
  >
    <Icon size={20} strokeWidth={2.5} />
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </motion.button>
);

export default ParcelTracking;
