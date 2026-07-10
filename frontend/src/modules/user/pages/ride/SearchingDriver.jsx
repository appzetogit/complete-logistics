import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Phone, MessageCircle, Shield, CheckCircle2, Navigation, AlertTriangle, Star, MapPin, Calendar, Clock3, LoaderCircle } from 'lucide-react';
import { GoogleMap, OverlayView, Polyline } from '@react-google-maps/api';
import { socketService } from '../../../../shared/api/socket';
import api from '../../../../shared/api/axiosInstance';
import { getLocalUserToken, userAuthService } from '../../services/authService';
import { getCurrentRide, isActiveCurrentRide, saveCurrentRide } from '../../services/currentRideService';
import { useBaseGoogleMapsLoader, HAS_VALID_GOOGLE_MAPS_KEY } from '../../../admin/utils/googleMaps';
import { scheduleScheduledRideReminders } from '../../utils/upcomingRideReminderService';
import { toHistorySafeState } from '../../../../shared/utils/historyState';

const MAP_OPTIONS = {
  disableDefaultUI: true,
  styles: [
    { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
    { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
    { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
    { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
    { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
    { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
    { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
    { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
    { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
    { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
    { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
  ]
};

const unwrap = (response) => response?.data?.data || response?.data || response;
import LuxuryIcon from '@/assets/icons/Luxury.png';
import PremiumIcon from '@/assets/icons/Premium.png';
import SuvIcon from '@/assets/icons/SUV.png';
import BikeIcon from '@/assets/icons/bike.png';
import CarIcon from '@/assets/icons/car.png';
import AutoIcon from '@/assets/icons/auto.png';

const getVehicleIcon = (type = 'car') => {
  const val = String(type).toLowerCase();
  if (val.includes('bike')) return BikeIcon;
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
const SEARCH_FALLBACK_POLL_DELAY_MS = 10000;
const SEARCH_FALLBACK_POLL_INTERVAL_MS = 10000;

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
      id: `available-driver-${index}`,
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
        src={iconUrl || CarIcon}
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

const DRIVER_PLACEHOLDER = { name: 'Captain', rating: '4.9', vehicle: 'Taxi', plate: 'Assigned', phone: '', eta: 2 };
const STAGES = { SEARCHING: 'searching', ACCEPTED: 'accepted', COMPLETING: 'completing' };
const CONSUMED_SEARCH_NONCE_PREFIX = 'Appzeto 24_consumed_search_nonce:';
const ACTIVE_SEARCH_NONCES = new Set();
const ACTIVE_SEARCH_NONCE_CLEANUPS = new Map();

const normalizeDriver = (driver = {}) => ({
  name: driver.name || 'Captain',
  rating: driver.rating || '4.9',
  vehicle: driver.vehicle || driver.vehicleType || driver.vehicle_type || 'Taxi',
  vehicleType: driver.vehicleType || driver.vehicle_type || driver.vehicle || 'Taxi',
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

const formatCurrency = (amount) => `Rs ${Math.round(Number(amount) || 0)}`;

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Scheduled';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Scheduled';
  }

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildHistoryState = (value) => toHistorySafeState(value) || {};

const SearchingDriver = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = useMemo(() => location.state || {}, [location.state]);
  const [stage, setStage] = useState(STAGES.SEARCHING);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [driver, setDriver] = useState(DRIVER_PLACEHOLDER);
  const [rideOtp, setRideOtp] = useState('');
  const [searchStatus, setSearchStatus] = useState('Connecting with drivers nearby');
  const [nearbyVehicleCount, setNearbyVehicleCount] = useState(4);
  const [rideBids, setRideBids] = useState([]);
  const [biddingSummary, setBiddingSummary] = useState(() => ({
    bookingMode: String(routeState.bookingMode || 'normal'),
    pricingNegotiationMode: String(routeState.pricingNegotiationMode || 'none'),
    baseFare: Number(routeState.baseFare || routeState.fare || routeState.vehicle?.price || 0),
    bidFloorFare: Number(routeState.bidFloorFare || routeState.baseFare || routeState.fare || routeState.vehicle?.price || 0),
    userMaxBidFare: Number(routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0),
    bidCeilingMaxFare: Number(routeState.bidCeilingMaxFare || routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0),
    bidStepAmount: Number(routeState.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(routeState.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: routeState.nextFareIncreaseAt || null,
  }));
  const [bidActionLoading, setBidActionLoading] = useState(false);
  const [scheduledStatus, setScheduledStatus] = useState(() => (routeState.scheduledAt ? 'saving' : 'idle'));
  const [scheduledError, setScheduledError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [fareHistory, setFareHistory] = useState(() => {
    const initialFare = Number(routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 0);
    return initialFare > 0 ? [initialFare] : [];
  });
  const timerRef = useRef(null);
  const activeRidePollRef = useRef(null);
  const activeRidePollStartTimeoutRef = useRef(null);
  const requestStartedRef = useRef(false);
  const cleanupSearchRef = useRef(null);
  const cleanupDelayRef = useRef(null);
  const trackingStartedRef = useRef(false);
  const driverRef = useRef(driver);
  const cancellingRef = useRef(false);
  const routePrefix = useMemo(
    () => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''),
    [location.pathname],
  );
  const userHomeRoute = routePrefix || '/taxi/user';
  const selectedVehicleTypeId = useMemo(
    () => routeState.vehicleTypeId || routeState.vehicle?.vehicleTypeId,
    [routeState],
  );
  const activeRideIdRef = useRef('');
  const searchNonce = String(routeState.searchNonce || '');
  const isDriverBidRide = biddingSummary.pricingNegotiationMode === 'driver_bid';
  const isUserIncrementRide = biddingSummary.pricingNegotiationMode === 'user_increment_only';
  const isBiddingRide = isDriverBidRide;
  const isScheduledRide = Boolean(routeState.scheduledAt);
  const isScheduledBiddingRide = isScheduledRide && isBiddingRide;
  const isSearching = stage === STAGES.SEARCHING;
  const isAccepted = stage === STAGES.ACCEPTED || stage === STAGES.COMPLETING;
  const fareIncreaseCountdownMs = Math.max(0, new Date(biddingSummary.nextFareIncreaseAt || 0).getTime() - now);
  const canIncreaseFare = !isUserIncrementRide || !biddingSummary.nextFareIncreaseAt || fareIncreaseCountdownMs <= 0;
  const formatCountdown = (milliseconds) => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };
  const fareIncreaseCountdownLabel = canIncreaseFare
    ? 'You can increase the fare now.'
    : `Next increase in ${formatCountdown(fareIncreaseCountdownMs)}`;

  const appendFareHistory = (fare) => {
    const normalizedFare = Math.round(Number(fare || 0));
    if (!Number.isFinite(normalizedFare) || normalizedFare <= 0) {
      return;
    }
    setFareHistory((current) => (
      current[current.length - 1] === normalizedFare ? current : [...current, normalizedFare]
    ));
  };

  const { isLoaded } = useBaseGoogleMapsLoader();

  const pickupPos = useMemo(
    () => (
      routeState.pickupCoords
        ? { lng: routeState.pickupCoords[0], lat: routeState.pickupCoords[1] }
        : { lat: 22.7196, lng: 75.8577 }
    ),
    [routeState.pickupCoords],
  );

  const dropPos = useMemo(
    () => (
      routeState.dropCoords
        ? { lng: routeState.dropCoords[0], lat: routeState.dropCoords[1] }
        : null
    ),
    [routeState.dropCoords],
  );
  const availableVehicleIcon = useMemo(
    () => (
      routeState.vehicleIconUrl ||
      routeState.vehicle?.vehicleIconUrl ||
      routeState.vehicle?.icon ||
      getVehicleIcon(routeState.vehicleIconType || routeState.vehicle?.iconType || routeState.vehicle?.name)
    ),
    [routeState.vehicle?.icon, routeState.vehicle?.iconType, routeState.vehicle?.name, routeState.vehicle?.vehicleIconUrl, routeState.vehicleIconType, routeState.vehicleIconUrl],
  );
  const availableVehicleMarkers = useMemo(
    () => buildAvailableVehicleMarkers(pickupPos, nearbyVehicleCount),
    [nearbyVehicleCount, pickupPos],
  );
  const formattedScheduledTime = useMemo(
    () => formatScheduledDateTime(routeState.scheduledAt),
    [routeState.scheduledAt],
  );

  const loadRideBids = async (rideId) => {
    const response = await userAuthService.getRideBids(rideId);
    const payload = unwrap(response);
    setRideBids(Array.isArray(payload?.bids) ? payload.bids : []);
    setBiddingSummary((current) => ({
      ...current,
      bookingMode: String(payload?.ride?.bookingMode || current.bookingMode || 'normal'),
      pricingNegotiationMode: String(payload?.ride?.pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
      baseFare: Number(payload?.ride?.baseFare || current.baseFare || routeState.baseFare || 0),
      bidFloorFare: Number(payload?.ride?.bidFloorFare || current.bidFloorFare || routeState.bidFloorFare || routeState.baseFare || 0),
      userMaxBidFare: Number(payload?.ride?.userMaxBidFare || current.userMaxBidFare || routeState.userMaxBidFare || 0),
      bidCeilingMaxFare: Number(payload?.ride?.bidCeilingMaxFare || current.bidCeilingMaxFare || routeState.bidCeilingMaxFare || routeState.userMaxBidFare || 0),
      bidStepAmount: Number(payload?.ride?.bidStepAmount || current.bidStepAmount || routeState.bidStepAmount || 10),
      fareIncreaseWaitMinutes: Number(payload?.ride?.fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
      nextFareIncreaseAt: payload?.ride?.nextFareIncreaseAt || current.nextFareIncreaseAt || null,
    }));
    appendFareHistory(payload?.ride?.userMaxBidFare);
  };

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  useEffect(() => {
    if (!isUserIncrementRide || canIncreaseFare) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, [canIncreaseFare, isUserIncrementRide]);

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
        navigate(`${routePrefix}/ride/tracking`, {
          replace: true,
          state: activeRide,
        });
        setRideOtp(activeRide?.otp || '');
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
  }, [navigate, routePrefix, searchNonce]);

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

    if (!searchNonce || !selectedVehicleTypeId) {
      setSearchStatus('Vehicle type missing. Please select a vehicle again.');
      navigate(userHomeRoute, { replace: true });
      return undefined;
    }

    requestStartedRef.current = true;
    let disposed = false;

    const onRideSearchUpdate = ({ matchedDrivers, radius }) => {
      setNearbyVehicleCount(clampVehicleCount(matchedDrivers));
      const radiusKm = radius ? (Number(radius) / 1000).toFixed(1) : '';
      setSearchStatus(
        matchedDrivers > 0
          ? `${matchedDrivers} captain${matchedDrivers > 1 ? 's' : ''} notified within ${radiusKm} km - waiting for acceptance`
          : `Searching within ${radiusKm} km`,
      );
    };

    const moveToTracking = ({ acceptedDriver, rideId, rideSnapshot }) => {
      if (disposed) {
        return;
      }

      if (trackingStartedRef.current) {
        return;
      }

      const nextDriver = normalizeDriver(acceptedDriver);
      const nextOtp = String(rideSnapshot?.otp || routeState?.otp || '');
      driverRef.current = nextDriver;
      setDriver(nextDriver);
      setStage(STAGES.ACCEPTED);
      setSearchStatus('Captain accepted your ride.');
      activeRideIdRef.current = String(rideId || activeRideIdRef.current || '');
      trackingStartedRef.current = true;
      saveCurrentRide({
        ...routeState,
        pickup: rideSnapshot?.pickupAddress || routeState.pickup,
        drop: rideSnapshot?.dropAddress || routeState.drop,
        pickupCoords: rideSnapshot?.pickupLocation?.coordinates || routeState.pickupCoords,
        dropCoords: rideSnapshot?.dropLocation?.coordinates || routeState.dropCoords,
        rideId: activeRideIdRef.current,
        otp: nextOtp,
        driver: nextDriver,
        fare: rideSnapshot?.fare || routeState.fare || routeState.baseFare || routeState.vehicle?.price || 22,
        vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
        paymentMethod: routeState.paymentMethod || 'Cash',
        status: 'accepted',
      });
      setRideOtp(nextOtp);

      clearTimeout(timerRef.current);
      clearInterval(activeRidePollRef.current);
      timerRef.current = setTimeout(() => {
        navigate(`${routePrefix}/ride/tracking`, {
          replace: true,
          state: buildHistoryState({
            ...routeState,
            pickup: rideSnapshot?.pickupAddress || routeState.pickup,
            drop: rideSnapshot?.dropAddress || routeState.drop,
            pickupCoords: rideSnapshot?.pickupLocation?.coordinates || routeState.pickupCoords,
            dropCoords: rideSnapshot?.dropLocation?.coordinates || routeState.dropCoords,
            rideId: activeRideIdRef.current,
            otp: nextOtp,
            driver: nextDriver,
            fare: rideSnapshot?.fare || routeState.fare || routeState.baseFare || routeState.vehicle?.price || 22,
            vehicleIconUrl: rideSnapshot?.vehicleIconUrl || routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
            paymentMethod: routeState.paymentMethod || 'Cash',
          }),
        });
      }, 2200);
    };

    const onRideAccepted = ({ driver: acceptedDriver, rideId }) => {
      moveToTracking({ acceptedDriver, rideId });
    };

    const onRideBidUpdated = ({ rideId, bid, userMaxBidFare, bidStepAmount, bookingMode }) => {
      if (!rideId || String(rideId) !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (bid) {
        setRideBids((current) => {
          const filtered = current.filter((item) => item.id !== bid.id);
          return [...filtered, bid].sort((first, second) => {
            const fareDelta = Number(first.bidFare || 0) - Number(second.bidFare || 0);
            if (fareDelta !== 0) return fareDelta;
            return new Date(first.createdAt || 0).getTime() - new Date(second.createdAt || 0).getTime();
          });
        });
      }

      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(bookingMode || current.bookingMode || 'normal'),
        pricingNegotiationMode: String(current.pricingNegotiationMode || 'driver_bid'),
        bidFloorFare: Number(current.bidFloorFare || routeState.bidFloorFare || current.baseFare || 0),
        userMaxBidFare: Number(userMaxBidFare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(current.bidCeilingMaxFare || routeState.bidCeilingMaxFare || userMaxBidFare || 0),
        bidStepAmount: Number(bidStepAmount || current.bidStepAmount || 10),
      }));
      setSearchStatus('Drivers are sending fare offers.');
    };

    const onRideBiddingUpdated = ({ rideId, userMaxBidFare, bidStepAmount, bookingMode, pricingNegotiationMode, baseFare, bidFloorFare, bidCeilingMaxFare, fareIncreaseWaitMinutes, nextFareIncreaseAt, fare }) => {
      if (!rideId || String(rideId) !== String(activeRideIdRef.current || '')) {
        return;
      }

      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(bookingMode || current.bookingMode || 'normal'),
        pricingNegotiationMode: String(pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
        baseFare: Number(baseFare || current.baseFare || 0),
        bidFloorFare: Number(bidFloorFare || current.bidFloorFare || baseFare || fare || 0),
        userMaxBidFare: Number(userMaxBidFare || fare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(bidCeilingMaxFare || current.bidCeilingMaxFare || userMaxBidFare || fare || 0),
        bidStepAmount: Number(bidStepAmount || current.bidStepAmount || 10),
        fareIncreaseWaitMinutes: Number(fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
        nextFareIncreaseAt: nextFareIncreaseAt || current.nextFareIncreaseAt || null,
      }));
      appendFareHistory(userMaxBidFare || fare);
    };

    const onRideState = (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        moveToTracking({ acceptedDriver: payload.driver, rideId: payload.rideId, rideSnapshot: payload });
      }
    };

    const hydrateAcceptedRide = async () => {
      if (disposed) {
        return null;
      }

      const activeResponse = await api.get('/rides/active/me');
      const activeRide = activeResponse?.data?.data || activeResponse?.data || activeResponse;

      if (!activeRide?.rideId) {
        return null;
      }

      return activeRide;
    };

    const onRideStatusUpdated = async (payload) => {
      if (!payload || String(payload.rideId || '') !== String(activeRideIdRef.current || '')) {
        return;
      }

      if (payload.status === 'accepted' || payload.liveStatus === 'accepted') {
        const activeRide = await hydrateAcceptedRide().catch(() => null);
        moveToTracking({
          acceptedDriver: activeRide?.driver || driverRef.current,
          rideId: payload.rideId,
          rideSnapshot: activeRide || payload,
        });
      }
    };

    const onRideCancelled = ({ reason }) => {
      const displayReason = reason === 'No drivers accepted the ride request' 
        ? 'No drivers available nearby'
        : (reason || 'No drivers accepted the ride request.');
      setSearchStatus(displayReason);
      setStage(STAGES.SEARCHING);
    };

    const onError = ({ message }) => {
      setSearchStatus(message || 'Could not request ride.');
    };

    socketService.on('rideSearchUpdate', onRideSearchUpdate);
    socketService.on('rideAccepted', onRideAccepted);
    socketService.on('rideBidUpdated', onRideBidUpdated);
    socketService.on('rideBiddingUpdated', onRideBiddingUpdated);
    socketService.on('ride:state', onRideState);
    socketService.on('ride:status:updated', onRideStatusUpdated);
    socketService.on('rideCancelled', onRideCancelled);
    socketService.on('errorMessage', onError);

    cleanupSearchRef.current = () => {
      if (disposed) {
        return;
      }

      disposed = true;
      requestStartedRef.current = false;
      clearTimeout(timerRef.current);
      clearTimeout(activeRidePollStartTimeoutRef.current);
      clearInterval(activeRidePollRef.current);
      activeRidePollStartTimeoutRef.current = null;
      activeRidePollRef.current = null;
      socketService.off('rideSearchUpdate', onRideSearchUpdate);
      socketService.off('rideAccepted', onRideAccepted);
      socketService.off('rideBidUpdated', onRideBidUpdated);
      socketService.off('rideBiddingUpdated', onRideBiddingUpdated);
      socketService.off('ride:state', onRideState);
      socketService.off('ride:status:updated', onRideStatusUpdated);
      socketService.off('rideCancelled', onRideCancelled);
      socketService.off('errorMessage', onError);
    };

    (async () => {
      try {
        let userToken = getLocalUserToken();

        if (!userToken) {
          navigate('/taxi/user/login', { replace: true });
          return;
        }

        if (disposed) {
          return;
        }

        const rideRequestConfig = userToken
          ? {
            headers: {
              Authorization: `Bearer ${userToken}`,
            },
            timeout: 15000,
          }
          : { timeout: 15000 };

        const requestPayload = {
          pickup: routeState.pickupCoords || [75.9048, 22.7039],
          drop: routeState.dropCoords || [75.8937, 22.7533],
          pickupAddress: routeState.pickup || '',
          dropAddress: routeState.drop || '',
          fare: routeState.baseFare || routeState.fare || routeState.vehicle?.price || 22,
          estimatedDistanceMeters: routeState.estimatedDistanceMeters || 0,
          estimatedDurationMinutes: routeState.estimatedDurationMinutes || 0,
          vehicleTypeId: selectedVehicleTypeId,
          vehicleTypeIds: selectedVehicleTypeId ? [selectedVehicleTypeId] : [],
          vehicleIconType: routeState.vehicleIconType || routeState.vehicle?.iconType,
          vehicleIconUrl: routeState.vehicleIconUrl || routeState.vehicle?.vehicleIconUrl || routeState.vehicle?.icon || '',
          paymentMethod: routeState.paymentMethod || 'Cash',
          serviceType: routeState.serviceType || 'ride',
          intercity: routeState.intercity || undefined,
          promo_code: routeState.promo_code || '',
          zone_id: routeState.zone_id || routeState.zoneId || '',
          service_location_id: routeState.service_location_id || routeState.serviceLocationId || '',
          transport_type: routeState.transport_type || routeState.transportType || routeState.vehicle?.transportType || 'taxi',
          bookingMode: routeState.bookingMode || 'normal',
          userMaxBidFare: routeState.userMaxBidFare || routeState.fare || routeState.vehicle?.price || 22,
          bidStepAmount: routeState.bidStepAmount || 10,
          scheduledAt: routeState.scheduledAt || null,
        };

        console.log('--- TEMPORARY DEBUG LOG ---');
        console.log('booking payload vehicleType:', selectedVehicleTypeId);

        const response = await api.post('/rides', requestPayload, rideRequestConfig);

        if (disposed) {
          return;
        }

        const payload = response?.data || response;
        const ride = payload?.data?.ride || payload?.ride || payload;
        const rideId = ride?._id || ride?.id || payload?.realtime?.rideId;
        const normalizedRideId = String(rideId || '');
        activeRideIdRef.current = normalizedRideId;
        if ((ride?.pricingNegotiationMode || routeState.pricingNegotiationMode || 'none') !== 'none') {
          setBiddingSummary({
            bookingMode: String(ride?.bookingMode || routeState.bookingMode || 'normal'),
            pricingNegotiationMode: String(ride?.pricingNegotiationMode || routeState.pricingNegotiationMode || 'none'),
            baseFare: Number(ride?.baseFare || routeState.baseFare || routeState.fare || 0),
            bidFloorFare: Number(ride?.bidFloorFare || routeState.bidFloorFare || routeState.baseFare || routeState.fare || 0),
            userMaxBidFare: Number(ride?.userMaxBidFare || routeState.userMaxBidFare || routeState.fare || 0),
            bidCeilingMaxFare: Number(ride?.bidCeilingMaxFare || routeState.bidCeilingMaxFare || routeState.userMaxBidFare || routeState.fare || 0),
            bidStepAmount: Number(ride?.bidStepAmount || routeState.bidStepAmount || 10),
            fareIncreaseWaitMinutes: Number(ride?.fareIncreaseWaitMinutes || routeState.fareIncreaseWaitMinutes || 0),
            nextFareIncreaseAt: ride?.nextFareIncreaseAt || routeState.nextFareIncreaseAt || null,
          });
          if ((ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'driver_bid') {
            loadRideBids(rideId).catch(() => { });
          }
          appendFareHistory(ride?.userMaxBidFare || ride?.fare);
        }
        if (isScheduledRide && !isScheduledBiddingRide) {
          scheduleScheduledRideReminders({
            ...ride,
            rideId: normalizedRideId,
            scheduledAt: ride?.scheduledAt || routeState.scheduledAt || null,
            pickupAddress: ride?.pickupAddress || routeState.pickup || '',
            dropAddress: ride?.dropAddress || routeState.drop || '',
            status: ride?.status || 'scheduled',
            liveStatus: ride?.liveStatus || 'scheduled',
          });
          setScheduledStatus('scheduled');
          setSearchStatus('Your ride has been scheduled successfully.');
          return;
        }
        const socket = socketService.connect({ role: 'user', token: userToken });

        if (socket && rideId) {
          socketService.emit('joinRide', { rideId });
          socketService.emit('ride:join', { rideId });
        }

        const pollActiveRide = async () => {
          if (disposed) {
            return;
          }

          try {
            const activeRide = await hydrateAcceptedRide();

            if (disposed || !activeRide?.rideId) {
              return;
            }

            const isThisRide = String(activeRide.rideId || '') === normalizedRideId;
            const isAcceptedRide = ['accepted', 'arriving', 'started', 'ongoing'].includes(String(activeRide.status || activeRide.liveStatus || '').toLowerCase());

            if (isThisRide && isAcceptedRide) {
              moveToTracking({
                acceptedDriver: activeRide.driver || driverRef.current,
                rideId: activeRide.rideId,
                rideSnapshot: activeRide,
              });
            }
          } catch (_error) {
            // Socket remains the primary path; polling is only a race-condition fallback.
          }
        };

        clearInterval(activeRidePollRef.current);
        activeRidePollRef.current = null;
        const startFallbackPolling = () => {
          if (disposed || trackingStartedRef.current) {
            return;
          }

          pollActiveRide();
          activeRidePollRef.current = setInterval(pollActiveRide, SEARCH_FALLBACK_POLL_INTERVAL_MS);
        };
        clearTimeout(activeRidePollStartTimeoutRef.current);
        activeRidePollStartTimeoutRef.current = window.setTimeout(
          startFallbackPolling,
          SEARCH_FALLBACK_POLL_DELAY_MS,
        );

        if (!disposed) {
          setSearchStatus(
            (ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'driver_bid'
              ? (isScheduledRide ? 'Scheduled ride created. Waiting for driver bids...' : 'Booking created. Waiting for driver bids...')
              : (ride?.pricingNegotiationMode || routeState.pricingNegotiationMode) === 'user_increment_only'
                ? 'Booking created. Notifying nearby drivers at your current fare...'
                : 'Booking created. Notifying nearby drivers...',
          );
        }
      } catch (error) {
        console.error('[searching-driver] Ride creation error:', error);
        if (!disposed) {
          const errorMessage = error?.response?.data?.message || error?.message || 'Network error or server down';
          const isNoDrivers = errorMessage.toLowerCase().includes('no driver') || errorMessage.toLowerCase().includes('not available');

          if (isScheduledRide && !isScheduledBiddingRide) {
            setScheduledStatus('error');
            setScheduledError(errorMessage);
            setSearchStatus(errorMessage);
            return;
          }
          setSearchStatus(isNoDrivers ? 'No drivers available nearby' : errorMessage);
          
          if (!isNoDrivers) {
            setTimeout(() => {
              if (!disposed) navigate(userHomeRoute, { replace: true });
            }, 3000);
          }
        }
      }
    })();

    return () => {
      cleanupDelayRef.current = setTimeout(() => {
        cleanupSearchRef.current?.();
      }, 0);
    };
  }, [isScheduledBiddingRide, isScheduledRide, navigate, routePrefix, routeState, searchNonce, selectedVehicleTypeId, userHomeRoute]);

  const handleCancel = useCallback(async () => {
    if (cancellingRef.current) {
      return;
    }

    cancellingRef.current = true;
    clearTimeout(timerRef.current);

    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch (_error) {
      // Navigation still proceeds even if the cancel request races with another state update.
    }

    navigate(userHomeRoute, { replace: true });
  }, [navigate, userHomeRoute]);

  useEffect(() => {
    if (!isSearching || trackingStartedRef.current) {
      return undefined;
    }

    const historyState = window.history.state || {};
    const hasSearchBackGuard = Boolean(historyState?.__searchBackGuard);

    if (!hasSearchBackGuard) {
      window.history.pushState(
        { ...historyState, __searchBackGuard: true, __searchNonce: searchNonce || Date.now() },
        '',
        window.location.href,
      );
    }

    const handlePopState = () => {
      if (trackingStartedRef.current || cancellingRef.current) {
        return;
      }

      // Keep the current entry alive long enough to reuse the existing cancel flow.
      window.history.go(1);
      handleCancel();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [handleCancel, isSearching, searchNonce]);

  const handleAcceptBid = async (bidId) => {
    const rideId = activeRideIdRef.current;
    if (!rideId || !bidId || bidActionLoading) {
      return;
    }

    setBidActionLoading(true);
    try {
      await userAuthService.acceptRideBid(rideId, bidId);
      setSearchStatus('Confirming your selected bid...');
    } catch (error) {
      setSearchStatus(error?.message || 'Could not accept this bid.');
    } finally {
      setBidActionLoading(false);
    }
  };

  const handleIncreaseBid = async () => {
    const rideId = activeRideIdRef.current;
    if (!rideId || bidActionLoading) {
      return;
    }

    setBidActionLoading(true);
    try {
      const response = await userAuthService.increaseRideBidCeiling(rideId, 1);
      const payload = unwrap(response);
      setBiddingSummary((current) => ({
        ...current,
        bookingMode: String(payload?.bookingMode || current.bookingMode || 'bidding'),
        pricingNegotiationMode: String(payload?.pricingNegotiationMode || current.pricingNegotiationMode || 'none'),
        baseFare: Number(payload?.baseFare || current.baseFare || 0),
        bidFloorFare: Number(payload?.bidFloorFare || current.bidFloorFare || payload?.baseFare || 0),
        userMaxBidFare: Number(payload?.userMaxBidFare || payload?.fare || current.userMaxBidFare || 0),
        bidCeilingMaxFare: Number(payload?.bidCeilingMaxFare || current.bidCeilingMaxFare || payload?.userMaxBidFare || payload?.fare || 0),
        bidStepAmount: Number(payload?.bidStepAmount || current.bidStepAmount || 10),
        fareIncreaseWaitMinutes: Number(payload?.fareIncreaseWaitMinutes || current.fareIncreaseWaitMinutes || 0),
        nextFareIncreaseAt: payload?.nextFareIncreaseAt || current.nextFareIncreaseAt || null,
      }));
      appendFareHistory(payload?.userMaxBidFare || payload?.fare);
      setNow(Date.now());
      setSearchStatus(
        (payload?.pricingNegotiationMode || biddingSummary.pricingNegotiationMode) === 'user_increment_only'
          ? 'Raised the fare and resent the request to nearby drivers.'
          : 'Raised your max fare by one step.',
      );
    } catch (error) {
      setSearchStatus(error?.message || 'Could not increase bid ceiling.');
    } finally {
      setBidActionLoading(false);
    }
  };

  const navigateAfterCancel = async (nextState = {}) => {
    const rideId = activeRideIdRef.current;

    try {
      if (rideId) {
        await api.patch(`/rides/${rideId}/cancel`);
      }
    } catch {
      // Navigation should still proceed even if cancellation races with another update.
    }

    navigate(`${routePrefix}/ride/select-vehicle`, {
      replace: true,
      state: buildHistoryState({
        ...routeState,
        ...nextState,
      }),
    });
  };

  if (isScheduledRide && !isScheduledBiddingRide) {
    return (
      <div className="min-h-screen max-w-lg mx-auto flex items-center justify-center bg-slate-950 px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-[32px] border border-white/10 bg-white/5 px-6 py-8 text-center shadow-2xl"
        >
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] ${scheduledStatus === 'scheduled' ? 'bg-emerald-600/20 text-emerald-400' :
              scheduledStatus === 'error' ? 'bg-rose-600/20 text-rose-400' : 'bg-blue-600/20 text-blue-400'
            }`}>
            {scheduledStatus === 'scheduled' ? <CheckCircle2 size={26} /> : scheduledStatus === 'error' ? <AlertTriangle size={26} /> : <LoaderCircle size={26} className="animate-spin" />}
          </div>
          <h1 className="mt-5 text-[22px] font-black text-white">
            {scheduledStatus === 'scheduled' ? 'Ride scheduled' : scheduledStatus === 'error' ? 'Scheduling failed' : 'Scheduling your ride'}
          </h1>
          <p className="mt-2 text-[13px] font-bold text-white/55">
            {scheduledStatus === 'scheduled'
              ? 'Your booking has been saved. Drivers will be notified automatically at the scheduled time.'
              : scheduledStatus === 'error'
                ? (scheduledError || 'Could not schedule this ride.')
                : 'Saving your booking and preparing automatic driver notification.'}
          </p>
          <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-left">
            <div className="flex items-center gap-3 text-white">
              <Calendar size={16} className="text-blue-300" />
              <span className="text-sm font-bold">Scheduled For</span>
            </div>
            <p className="mt-2 text-lg font-black text-white">{formattedScheduledTime}</p>
            <div className="mt-4 flex items-center gap-3 text-white/65">
              <Clock3 size={15} />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">{routeState.pickup || 'Pickup'} to {routeState.drop || 'Drop'}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(userHomeRoute, { replace: true })}
            className="mt-6 h-12 w-full rounded-[18px] bg-white text-sm font-black uppercase tracking-[0.16em] text-slate-900"
          >
            {scheduledStatus === 'error' ? 'Back to Home' : 'Done'}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 w-full lg:max-w-7xl mx-auto relative font-['Plus_Jakarta_Sans'] overflow-hidden lg:grid lg:grid-cols-12 lg:bg-white lg:shadow-xl">
      
      {/* MAP BACKGROUND (Mobile) / RIGHT COLUMN (Desktop) */}
      <div className="absolute inset-0 z-0 lg:relative lg:col-span-7 lg:col-start-6 lg:h-full lg:rounded-r-3xl lg:overflow-hidden lg:z-0 lg:bg-slate-200">
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
                          animate={{
                            scale: [0.5, 4.5],
                            opacity: [0.5, 0]
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 3,
                            delay: i * 0.75,
                            ease: "easeOut"
                          }}
                          className="absolute w-20 h-20 rounded-full border-2 border-orange-400/40 bg-orange-400/5 shadow-[0_0_20px_rgba(249,115,22,0.2)]"
                        />
                      ))}

                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                        className="absolute w-[320px] h-[320px] rounded-full overflow-hidden"
                        style={{
                          background: 'conic-gradient(from 0deg, rgba(249, 115, 22, 0.5) 0deg, transparent 60deg, transparent 360deg)'
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
                    repeat: '10px'
                  }]
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center p-8 text-center" />
        )}

        <div className="absolute top-8 left-4 right-16 z-20 bg-white/90 backdrop-blur-md rounded-2xl px-5 py-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] border border-white/80 lg:hidden">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none mb-1">Current Route</p>
          <p className="text-[13px] font-extrabold text-slate-900 leading-tight truncate">{routeState.pickup || 'Pickup'} → {routeState.drop || 'Drop'}</p>
        </div>

        <AnimatePresence>
          {isAccepted && rideOtp && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, x: -20 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              className="absolute top-[88px] left-4 z-20 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.12)] rounded-[12px] p-3 min-w-[70px] border border-slate-50 lg:hidden"
            >
              <p className="text-[18px] font-extrabold text-[#1d4ed8] leading-tight text-center tracking-wider">{rideOtp}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 text-center whitespace-nowrap">Start OTP</p>
            </motion.div>
          )}
        </AnimatePresence>

        {(isSearching || isAccepted) && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowCancelConfirm(true)}
            className="absolute top-8 right-4 z-20 w-10 h-10 bg-white/90 backdrop-blur-md rounded-[12px] shadow-[0_4px_14px_rgba(15,23,42,0.10)] border border-white/80 flex items-center justify-center lg:hidden">
            <X size={16} className="text-slate-900" strokeWidth={2.5} />
          </motion.button>
        )}
      </div>

      {/* Bottom card (Mobile) / Left Column (Desktop) */}
      <div className="absolute bottom-8 left-4 right-4 z-20 lg:relative lg:col-span-5 lg:col-start-1 lg:row-start-1 lg:bottom-0 lg:left-0 lg:right-0 lg:h-full lg:p-6 lg:border-r lg:border-slate-200 lg:z-10 lg:flex lg:flex-col lg:justify-center">
        
        {/* Desktop Header */}
        <div className="hidden lg:flex items-center justify-between mb-8">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</p>
              <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">Trip Overview</h1>
            </div>
            {(isSearching || isAccepted) && (
              <button onClick={() => setShowCancelConfirm(true)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <X size={18} className="text-slate-900" />
              </button>
            )}
        </div>

        {/* Current Route Desktop */}
        <div className="hidden lg:block bg-slate-50 border border-slate-100 rounded-[20px] p-4 mb-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] leading-none mb-2">Current Route</p>
          <div className="flex flex-col gap-2">
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <p className="text-[13px] font-medium text-slate-700 truncate">{routeState.pickup || 'Pickup'}</p>
             </div>
             <div className="w-px h-3 bg-slate-200 ml-1" />
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                <p className="text-[13px] font-medium text-slate-700 truncate">{routeState.drop || 'Drop'}</p>
             </div>
          </div>
        </div>

        <AnimatePresence mode="wait">

          {/* Searching */}
          {isSearching && (
            <motion.div key="searching" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              className="rounded-[32px] border border-white/80 bg-white/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] px-6 pt-3 pb-6 space-y-5">

              <div className="w-10 h-1.5 bg-slate-100 rounded-full mx-auto mb-2" />

              <div className="text-center space-y-1.5">
                <h1 className="text-[22px] font-extrabold text-slate-950 tracking-tight">Finding your ride</h1>
                <p className="text-[13px] font-semibold text-slate-400 max-w-[260px] mx-auto leading-normal">{searchStatus}</p>
              </div>

              <div className="flex justify-center gap-2.5 py-1">
                {[0, 1, 2, 3].map(i => (
                  <motion.div key={i} animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.3, 1, 0.3],
                    backgroundColor: ['#e2e8f0', '#f97316', '#e2e8f0']
                  }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                    className="w-2.5 h-2.5 rounded-full" />
                ))}
              </div>

              {isBiddingRide && (
                <div className="rounded-[24px] border border-orange-100 bg-orange-50/70 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">Bid Mode</p>
                      <p className="mt-1 text-[13px] font-bold text-slate-900">Drivers can bid from {formatCurrency(biddingSummary.bidFloorFare || biddingSummary.baseFare)} up to {formatCurrency(biddingSummary.userMaxBidFare)}.</p>
                    </div>
                    <button
                      type="button"
                      disabled={bidActionLoading}
                      onClick={handleIncreaseBid}
                      className="shrink-0 rounded-full bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                    >
                      +{formatCurrency(biddingSummary.bidStepAmount)}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {rideBids.length ? rideBids.map((bid) => (
                      <div key={bid.id} className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-3 py-3 border border-orange-100">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-black text-slate-900">{bid.driver?.name || 'Driver'}</p>
                          <p className="truncate text-[11px] font-bold text-slate-500">{bid.driver?.vehicleNumber || bid.driver?.vehicleType || 'Ride offer'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-black text-slate-900">{formatCurrency(bid.bidFare)}</span>
                          <button
                            type="button"
                            disabled={bidActionLoading}
                            onClick={() => handleAcceptBid(bid.id)}
                            className="rounded-full bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                          >
                            Accept
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[18px] bg-white px-3 py-3 border border-orange-100">
                        <p className="text-[12px] font-bold text-slate-600">No bids yet. We&apos;re still reaching nearby drivers.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isUserIncrementRide && (
                <div className="rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Current Offer</p>
                      <p className="mt-1 text-[18px] font-black text-slate-900">{formatCurrency(biddingSummary.userMaxBidFare)}</p>

                    </div>
                    <button
                      type="button"
                      disabled={bidActionLoading || !canIncreaseFare}
                      onClick={handleIncreaseBid}
                      className="shrink-0 rounded-full bg-slate-950 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white disabled:opacity-60"
                    >
                      +{formatCurrency(biddingSummary.bidStepAmount)}
                    </button>
                  </div>
                  <div className="rounded-[18px] border border-blue-100 bg-white px-3 py-3">
                    <p className="text-[11px] font-black text-slate-700">
                      {canIncreaseFare ? 'You can increase the fare now and rebroadcast the request.' : fareIncreaseCountdownLabel}
                    </p>
                  </div>
                  {fareHistory.length > 0 && (
                    <div className="rounded-[18px] border border-blue-100/80 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Fare History</p>
                      <p className="mt-2 text-[12px] font-black text-slate-800">
                        {fareHistory.map((fare) => formatCurrency(fare)).join(' -> ')}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => navigateAfterCancel()}
                      className="rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700"
                    >
                      Try Another Vehicle
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateAfterCancel({ rideMode: 'schedule' })}
                      className="rounded-[16px] border border-blue-200 bg-blue-100/70 px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700"
                    >
                      Schedule Instead
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-5 py-4 rounded-[24px] bg-slate-50/80 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Fast Matching</span>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div className="flex items-center gap-3">
                  <ShieldCheck size={20} className="text-blue-500" strokeWidth={2.5} />
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Top Safety</span>
                </div>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCancelConfirm(true)}
                className="w-full py-4.5 rounded-[22px] bg-red-50 text-[13px] font-extrabold text-red-500 uppercase tracking-[0.1em] hover:bg-red-100 transition-colors border border-red-100/50"
              >
                Cancel Search
              </motion.button>
            </motion.div>
          )}

          {/* Accepted - Ride Confirmed Premium Card */}
          {isAccepted && (
            <motion.div
              key="accepted"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="px-0"
            >
              <div className="overflow-hidden rounded-[32px] bg-white shadow-[0_24px_64px_-12px_rgba(15,23,42,0.18)] border border-slate-100">
                {/* Status Bar */}
                <div className="flex items-center justify-center gap-2.5 bg-emerald-50/50 py-4 border-b border-emerald-100/50">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                    <CheckCircle2 size={12} className="text-white" strokeWidth={3} />
                  </div>
                  <span className="text-[14px] font-black tracking-tight text-emerald-700 uppercase tracking-wider">Captain confirmed</span>
                </div>

                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      {/* Driver Name and Rating */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] font-black text-slate-400 uppercase tracking-widest">{driver.name || "Vishal K."}</span>
                        <div className="flex items-center gap-1 bg-yellow-400/10 px-1.5 py-0.5 rounded-full border border-yellow-400/20">
                          <Star size={10} className="fill-yellow-500 text-yellow-500" />
                          <span className="text-[11px] font-black text-yellow-700">{driver.rating || "4.7"}</span>
                        </div>
                      </div>

                      {/* Driver Name / Display */}
                      <h2 className="text-[28px] font-black tracking-tighter text-slate-900 leading-none mb-4 uppercase">
                        {driver.plate || "MP13ZL3184"}
                      </h2>

                      {/* Vehicle Details Pill */}
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200/50">
                        <p className="text-[12px] font-black text-slate-600">
                          {[driver.vehicleColor, driver.vehicleMake, driver.vehicleModel, driver.vehicleType || "Taxi"].filter(Boolean).join(' ') || "White Dzire Taxi"}
                        </p>
                      </div>
                    </div>

                    {/* Premium Overlaid Avatars */}
                    <div className="relative h-20 w-24 shrink-0">
                      <div className="absolute right-0 top-0 h-20 w-20 overflow-hidden rounded-[24px] bg-[#1d2333] border-4 border-white shadow-xl flex items-center justify-center">
                        <img
                          src={availableVehicleIcon || CarIcon}
                          className="h-12 w-12 object-contain brightness-0 invert opacity-90"
                          alt="Vehicle"
                        />
                      </div>
                      <div className="absolute -left-2 bottom-0 h-16 w-16 overflow-hidden rounded-full border-[4px] border-white shadow-2xl bg-slate-200">
                        <img
                          src={`https://ui-avatars.com/api/?name=${(driver.name || "VK").replace(' ', '+')}&background=cbd5e1&color=0f172a`}
                          className="h-full w-full object-cover"
                          alt="Driver"
                        />
                      </div>
                    </div>
                  </div>

                  {/* High Density Actions */}
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
                      onClick={() => navigate(`${routePrefix}/ride/chat`, { state: buildHistoryState({ driver }) })}
                      className="flex items-center justify-center gap-3 rounded-[22px] bg-slate-950 py-4.5 shadow-[0_12px_24px_rgba(15,23,42,0.15)] active:shadow-none"
                    >
                      <MessageCircle size={18} className="text-white" strokeWidth={2.5} />
                      <span className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Chat</span>
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Status Indicator */}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCancelConfirm(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto" />
            <motion.div initial={{ scale: 0.92, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] max-w-sm bg-white rounded-[28px] p-7 z-[101] shadow-2xl text-center">
              <div className="w-14 h-14 bg-red-50 rounded-[18px] flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={26} className="text-red-400" strokeWidth={2} />
              </div>
              <h3 className="text-[18px] font-bold text-slate-900 mb-1.5">Cancel ride?</h3>
              <p className="text-[13px] font-bold text-slate-400 mb-6 leading-relaxed">
                {"We're still searching. Stop looking?"}
              </p>
              <div className="space-y-2.5">
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleCancel}
                  className="w-full bg-slate-900 text-white py-3.5 rounded-[16px] text-[13px] font-bold uppercase tracking-widest">
                  Yes, Cancel
                </motion.button>
                <button onClick={() => setShowCancelConfirm(false)}
                  className="w-full py-3.5 text-[13px] font-bold text-slate-400 uppercase tracking-widest">
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

export default SearchingDriver;
