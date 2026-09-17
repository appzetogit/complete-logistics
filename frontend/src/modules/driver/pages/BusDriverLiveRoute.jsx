import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Pause,
  Play,
  Route as RouteIcon,
  RotateCcw,
  Square,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';
import simplify from 'simplify-js';
import toast from 'react-hot-toast';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { computeDrivingRoute } from '../../../shared/utils/googleRoutes';
import { getCurrentDriver } from '../services/registrationService';
import {
  getBusDriverLiveTrip,
  startBusDriverLiveTrip,
  updateBusDriverLiveLocation,
  updateBusDriverLiveTripStatus,
} from '../services/busDriverService';

const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
};

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const LIVE_SYNC_DISTANCE_KM = 0.12;
const LIVE_SYNC_INTERVAL_MS = 8000;
const LIVE_TRAIL_MAX_DISTANCE_KM = 2.5;
const LIVE_TRAIL_MAX_POINTS = 80;

const STOP_TYPE_TONE = {
  pickup: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  drop: 'bg-rose-50 text-rose-700 border-rose-200',
  both: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const STATUS_TONE = {
  idle: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-sky-50 text-sky-700 border-sky-200',
};

const unwrap = (response) => response?.data?.data || response?.data || response;

const formatDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createToday = () => formatDateKey(new Date());

const parseDateKey = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const formatDisplayDate = (value) => {
  if (!value) return 'No date selected';
  const date = parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toLatLng = (source, fallback = null) => {
  const lat = Number(source?.lat ?? source?.latitude);
  const lng = Number(source?.lng ?? source?.longitude ?? source?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  return fallback;
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const getDistanceKm = (pointA, pointB) => {
  if (!pointA || !pointB) return 0;

  const lat1 = Number(pointA.lat);
  const lng1 = Number(pointA.lng);
  const lat2 = Number(pointB.lat);
  const lng2 = Number(pointB.lng);

  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const latDelta = toRadians(lat2 - lat1);
  const lngDelta = toRadians(lng2 - lng1);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const simplifyLatLngPath = (points, tolerance = 0.0006) => {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point) => toLatLng(point))
    .filter(Boolean);

  if (normalized.length <= 2) {
    return normalized;
  }

  return simplify(
    normalized.map((point) => ({ x: point.lng, y: point.lat, ...point })),
    tolerance,
    true,
  ).map((point) => ({ lat: point.y, lng: point.x }));
};

const buildFallbackRoute = (origin, destination) => [origin, destination].filter(Boolean);

const getPathDistanceKm = (points = []) =>
  (Array.isArray(points) ? points : []).reduce((total, point, index, items) => {
    if (index === 0) return total;
    return total + getDistanceKm(items[index - 1], point);
  }, 0);

const trimLiveTrail = (points = []) => {
  const normalized = (Array.isArray(points) ? points : [])
    .map((point) => {
      const coords = toLatLng(point);
      return coords ? { ...point, ...coords } : null;
    })
    .filter(Boolean)
    .slice(-LIVE_TRAIL_MAX_POINTS);

  if (normalized.length <= 2) {
    return normalized;
  }

  const kept = [normalized[normalized.length - 1]];
  let distanceKm = 0;

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const nextPoint = kept[kept.length - 1];
    const candidate = normalized[index];
    distanceKm += getDistanceKm(candidate, nextPoint);

    if (distanceKm > LIVE_TRAIL_MAX_DISTANCE_KM) {
      break;
    }

    kept.push(candidate);
  }

  return kept.reverse();
};

const getStatusLabel = (status) =>
  ({
    idle: 'Waiting to start',
    in_progress: 'Journey in progress',
    paused: 'Tracking paused',
    completed: 'Journey completed',
  }[String(status || '').toLowerCase()] || 'Waiting to start');

const getCurrentPositionAsync = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Live GPS is not available on this device'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speedKmph: Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : null,
          recordedAt: new Date().toISOString(),
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });

const buildRouteMetrics = (routePath, currentLocation) => {
  if (!routePath.length || !currentLocation) {
    return {
      totalDistanceKm: 0,
      coveredDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
    };
  }

  const cumulative = [0];
  for (let index = 1; index < routePath.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + getDistanceKm(routePath[index - 1], routePath[index]);
  }

  const totalDistanceKm = cumulative[cumulative.length - 1] || 0;
  if (totalDistanceKm <= 0) {
    return {
      totalDistanceKm,
      coveredDistanceKm: 0,
      remainingDistanceKm: 0,
      progressPercent: 0,
    };
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  routePath.forEach((point, index) => {
    const distance = getDistanceKm(point, currentLocation);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const coveredDistanceKm = cumulative[nearestIndex] || 0;
  const remainingDistanceKm = Math.max(0, totalDistanceKm - coveredDistanceKm);
  const progressPercent = Math.max(0, Math.min(100, (coveredDistanceKm / totalDistanceKm) * 100));

  return {
    totalDistanceKm,
    coveredDistanceKm,
    remainingDistanceKm,
    progressPercent,
  };
};

const findNearestRouteIndex = (routePath, currentLocation) => {
  if (!Array.isArray(routePath) || !routePath.length || !currentLocation) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  routePath.forEach((point, index) => {
    const distance = getDistanceKm(point, currentLocation);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
};

const buildRemainingRoutePath = (routePath, currentLocation) => {
  const normalizedRoute = (Array.isArray(routePath) ? routePath : [])
    .map((point) => toLatLng(point))
    .filter(Boolean);
  const currentPoint = toLatLng(currentLocation);

  if (normalizedRoute.length <= 1) {
    return normalizedRoute;
  }

  if (!currentPoint) {
    return normalizedRoute;
  }

  const nearestIndex = findNearestRouteIndex(normalizedRoute, currentPoint);
  const remainingRoute = normalizedRoute.slice(Math.min(nearestIndex + 1, normalizedRoute.length - 1));
  const firstRemainingPoint = remainingRoute[0];

  if (firstRemainingPoint && getDistanceKm(currentPoint, firstRemainingPoint) < 0.03) {
    return [firstRemainingPoint, ...remainingRoute.slice(1)];
  }

  return [currentPoint, ...remainingRoute];
};
const getRouteCacheKey = (origin, destination) => {
  const serializePoint = (point) =>
    point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

  return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

const createSvgMarkerIcon = (svgMarkup, width, height, anchorX, anchorY) => {
  if (!window.google?.maps) {
    return undefined;
  }

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgMarkup)}`,
    scaledSize: new window.google.maps.Size(width, height),
    anchor: new window.google.maps.Point(anchorX, anchorY),
  };
};

const getOriginMarkerIcon = () =>
  createSvgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46" fill="none">
      <path d="M19 2C10.2 2 3 9 3 17.6C3 29.2 19 44 19 44C19 44 35 29.2 35 17.6C35 9 27.8 2 19 2Z" fill="#16A34A"/>
      <circle cx="19" cy="18" r="7" fill="white"/>
      <path d="M16 18.2L18.1 20.3L22.8 15.7" stroke="#16A34A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    38,
    46,
    19,
    44,
  );

const getDestinationMarkerIcon = () =>
  createSvgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46" fill="none">
      <path d="M19 2C10.2 2 3 9 3 17.6C3 29.2 19 44 19 44C19 44 35 29.2 35 17.6C35 9 27.8 2 19 2Z" fill="#DC2626"/>
      <circle cx="19" cy="18" r="7" fill="white"/>
      <circle cx="19" cy="18" r="3.4" fill="#DC2626"/>
    </svg>`,
    38,
    46,
    19,
    44,
  );

const getBusMarkerIcon = () =>
  createSvgMarkerIcon(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="56" viewBox="0 0 44 56" fill="none">
      <path d="M22 2C11.5 2 3 10.4 3 20.8C3 34.4 22 54 22 54C22 54 41 34.4 41 20.8C41 10.4 32.5 2 22 2Z" fill="#2563EB"/>
      <circle cx="22" cy="21" r="12" fill="white"/>
      <path d="M15.5 16.8C15.5 14.7013 17.2013 13 19.3 13H24.7C26.7987 13 28.5 14.7013 28.5 16.8V24.2C28.5 25.626 27.396 26.8 26 26.8V28.2C26 28.7523 25.5523 29.2 25 29.2H24.4C23.8477 29.2 23.4 28.7523 23.4 28.2V26.8H20.6V28.2C20.6 28.7523 20.1523 29.2 19.6 29.2H19C18.4477 29.2 18 28.7523 18 28.2V26.8C16.604 26.8 15.5 25.626 15.5 24.2V16.8Z" fill="#2563EB"/>
      <path d="M18 16.4H26V20.2H18V16.4Z" fill="#BFDBFE"/>
      <circle cx="19.8" cy="23.4" r="1.5" fill="#0F172A"/>
      <circle cx="24.2" cy="23.4" r="1.5" fill="#0F172A"/>
    </svg>`,
    44,
    56,
    22,
    54,
  );

const BusDriverLiveRoute = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const seededState = location.state || {};
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastSyncedPointRef = useRef(null);
  const lastSyncedAtRef = useRef(0);
  const routeCacheRef = useRef(new Map());
  const hasAutoFittedRef = useRef(false);
  const programmaticCameraRef = useRef(false);
  const seededProfileRef = useRef(seededState.profile || null);
  const [profile, setProfile] = useState(seededState.profile || null);
  const [travelDate, setTravelDate] = useState(seededState.travelDate || '');
  const [selectedScheduleId, setSelectedScheduleId] = useState(seededState.selectedScheduleId || '');
  const [routePath, setRoutePath] = useState([]);
  const [trailPoints, setTrailPoints] = useState([]);
  const [loading, setLoading] = useState(!seededState.profile);
  const [syncingTrip, setSyncingTrip] = useState(false);
  const [tripActionPending, setTripActionPending] = useState(false);
  const [locationPermissionError, setLocationPermissionError] = useState('');
  const [isFollowingBus, setIsFollowingBus] = useState(true);
  const mapState = useBaseGoogleMapsLoader();
  const isMapReady =
    mapState.isLoaded &&
    HAS_VALID_GOOGLE_MAPS_KEY &&
    Boolean(window.google?.maps);

  const releaseProgrammaticCameraLock = useCallback(() => {
    window.setTimeout(() => {
      programmaticCameraRef.current = false;
    }, 220);
  }, []);

  const fitMapToPoints = useCallback((points) => {
    if (!mapRef.current || !window.google?.maps || !Array.isArray(points) || !points.length) {
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => {
      const normalized = toLatLng(point);
      if (normalized) {
        bounds.extend(normalized);
      }
    });

    if (!bounds.isEmpty()) {
      programmaticCameraRef.current = true;
      mapRef.current.fitBounds(bounds, 70);
      releaseProgrammaticCameraLock();
    }
  }, [releaseProgrammaticCameraLock]);

  const centerMapOnPoint = useCallback((point, zoom = 15, force = false) => {
    const normalized = toLatLng(point);
    if (!mapRef.current || !normalized) {
      return;
    }

    const currentCenter = mapRef.current.getCenter?.();
    const currentZoom = Number(mapRef.current.getZoom?.() || 0);
    const centerPoint = currentCenter
      ? { lat: currentCenter.lat(), lng: currentCenter.lng() }
      : null;
    const distanceFromCenterKm = centerPoint ? getDistanceKm(centerPoint, normalized) : Number.POSITIVE_INFINITY;

    programmaticCameraRef.current = true;

    if (force || distanceFromCenterKm > 0.08) {
      mapRef.current.panTo(normalized);
    }

    if (force || currentZoom < zoom - 0.3 || currentZoom > zoom + 1.2) {
      mapRef.current.setZoom(zoom);
    }

    releaseProgrammaticCameraLock();
  }, [releaseProgrammaticCameraLock]);

  const mergeProfileAndTrip = useCallback((baseProfile, liveTripPayload) => {
    if (!baseProfile) {
      return null;
    }

    return {
      ...baseProfile,
      busService: baseProfile.busService
        ? {
            ...baseProfile.busService,
            liveTracking: liveTripPayload?.liveTracking || baseProfile.busService.liveTracking || null,
            route: liveTripPayload?.route || baseProfile.busService.route || {},
            schedules: Array.isArray(liveTripPayload?.schedules)
              ? liveTripPayload.schedules
              : baseProfile.busService.schedules || [],
          }
        : baseProfile.busService,
    };
  }, []);

  const syncLiveTrip = useCallback(async () => {
    setSyncingTrip(true);
    try {
      const tripResponse = await getBusDriverLiveTrip();
      const tripData = unwrap(tripResponse);
      setProfile((currentProfile) => {
        const seed = currentProfile || seededProfileRef.current;
        return mergeProfileAndTrip(seed, tripData);
      });
      setTrailPoints(trimLiveTrail(tripData?.liveTracking?.recentPath));
      if (tripData?.liveTracking?.travelDate && !travelDate) {
        setTravelDate(tripData.liveTracking.travelDate);
      }
      if (tripData?.liveTracking?.scheduleId && !selectedScheduleId) {
        setSelectedScheduleId(tripData.liveTracking.scheduleId);
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to load live journey data');
    } finally {
      setSyncingTrip(false);
    }
  }, [mergeProfileAndTrip, selectedScheduleId, travelDate]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) return;
        seededProfileRef.current = data;
        setProfile(data);

        const firstSchedule = Array.isArray(data?.busService?.schedules) ? data.busService.schedules[0] : null;
        const liveScheduleId = data?.busService?.liveTracking?.scheduleId || '';
        const liveTravelDate = data?.busService?.liveTracking?.travelDate || '';

        if (!selectedScheduleId) {
          setSelectedScheduleId(seededState.selectedScheduleId || liveScheduleId || firstSchedule?.id || '');
        }
        if (!travelDate) {
          setTravelDate(seededState.travelDate || liveTravelDate || createToday());
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Unable to load live route details');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [seededState.selectedScheduleId, seededState.travelDate, selectedScheduleId, travelDate]);

  useEffect(() => {
    if (profile?.busService) {
      setTrailPoints(trimLiveTrail(profile.busService.liveTracking?.recentPath));
    }
  }, [profile?.busService]);

  useEffect(() => {
    syncLiveTrip();
  }, [syncLiveTrip]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      syncLiveTrip();
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [syncLiveTrip]);

  const busService = profile?.busService || null;
  const liveTracking = busService?.liveTracking || {
    status: 'idle',
    scheduleId: '',
    travelDate: '',
    currentLocation: null,
    recentPath: [],
    totalDistanceKm: 0,
  };
  const schedules = Array.isArray(busService?.schedules) ? busService.schedules : [];
  const effectiveScheduleId = liveTracking?.scheduleId || selectedScheduleId || schedules[0]?.id || '';
  const effectiveTravelDate = liveTracking?.travelDate || travelDate || createToday();
  const selectedSchedule =
    schedules.find((item) => item.id === effectiveScheduleId) ||
    schedules.find((item) => item.id === selectedScheduleId) ||
    schedules[0] ||
    null;
  const routeStops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const pickupStops = routeStops.filter((stop) => stop?.stopType === 'pickup' || stop?.stopType === 'both');
  const dropStops = routeStops.filter((stop) => stop?.stopType === 'drop' || stop?.stopType === 'both');
  const originPoint = useMemo(
    () => toLatLng(busService?.route?.originCoords),
    [busService?.route?.originCoords?.lat, busService?.route?.originCoords?.lng],
  );
  const destinationPoint = useMemo(
    () => toLatLng(busService?.route?.destinationCoords),
    [busService?.route?.destinationCoords?.lat, busService?.route?.destinationCoords?.lng],
  );
  const currentBusPoint = useMemo(
    () => toLatLng(liveTracking?.currentLocation) || toLatLng(trailPoints[trailPoints.length - 1]),
    [
      liveTracking?.currentLocation?.lat,
      liveTracking?.currentLocation?.lng,
      trailPoints,
    ],
  );
  const routeEndpoints = useMemo(
    () => [originPoint, destinationPoint].filter(Boolean),
    [destinationPoint, originPoint],
  );
  const mapCenter = useMemo(() => {
    if (currentBusPoint) {
      return currentBusPoint;
    }

    if (routeEndpoints.length === 0) {
      return DEFAULT_CENTER;
    }

    if (routeEndpoints.length === 1) {
      return routeEndpoints[0];
    }

    return {
      lat: (routeEndpoints[0].lat + routeEndpoints[1].lat) / 2,
      lng: (routeEndpoints[0].lng + routeEndpoints[1].lng) / 2,
    };
  }, [currentBusPoint, routeEndpoints]);

  const simplifiedTrail = useMemo(() => simplifyLatLngPath(trailPoints, 0.00035), [trailPoints]);
  const remainingRoutePath = useMemo(
    () => buildRemainingRoutePath(routePath, currentBusPoint),
    [currentBusPoint, routePath],
  );
  const shouldShowLiveTrail = useMemo(() => {
    const status = String(liveTracking?.status || '').toLowerCase();
    return (
      ['in_progress', 'paused'].includes(status) &&
      simplifiedTrail.length >= 3 &&
      getPathDistanceKm(simplifiedTrail) >= 0.15
    );
  }, [liveTracking?.status, simplifiedTrail]);
  const routeMetrics = useMemo(
    () => buildRouteMetrics(routePath, currentBusPoint),
    [currentBusPoint, routePath],
  );
  const originMarkerIcon = useMemo(() => (isMapReady ? getOriginMarkerIcon() : undefined), [isMapReady]);
  const destinationMarkerIcon = useMemo(() => (isMapReady ? getDestinationMarkerIcon() : undefined), [isMapReady]);
  const busMarkerIcon = useMemo(() => (isMapReady ? getBusMarkerIcon() : undefined), [isMapReady]);
  const recenterOnBus = useCallback((zoom = 16) => {
    if (currentBusPoint) {
      centerMapOnPoint(currentBusPoint, zoom, true);
      setIsFollowingBus(true);
      return;
    }

    fitMapToPoints([...routePath, ...routeEndpoints].filter(Boolean));
  }, [centerMapOnPoint, currentBusPoint, fitMapToPoints, routeEndpoints, routePath]);

  useEffect(() => {
    if (!isMapReady || routeEndpoints.length < 2 || !window.google?.maps?.importLibrary) {
      setRoutePath(buildFallbackRoute(originPoint, destinationPoint));
      return;
    }

    const routeCacheKey = getRouteCacheKey(routeEndpoints[0], routeEndpoints[1]);
    const cachedRoute = routeCacheRef.current.get(routeCacheKey);
    if (cachedRoute) {
      setRoutePath(cachedRoute);
      return;
    }

    let active = true;
    void (async () => {
      const result = await computeDrivingRoute({
        origin: routeEndpoints[0],
        destination: routeEndpoints[1],
        region: 'IN',
      });

      if (!active) {
        return;
      }

      if (result.status === 'OK') {
        const nextRoutePath = result.path.length > 1 ? result.path : buildFallbackRoute(originPoint, destinationPoint);
        routeCacheRef.current.set(routeCacheKey, nextRoutePath);
        setRoutePath(nextRoutePath);
        return;
      }

      const fallbackRoute = buildFallbackRoute(originPoint, destinationPoint);
      routeCacheRef.current.set(routeCacheKey, fallbackRoute);
      setRoutePath(fallbackRoute);
    })();

    return () => {
      active = false;
    };
  }, [destinationPoint, isMapReady, originPoint, routeEndpoints]);

  useEffect(() => {
    if (!isMapReady || hasAutoFittedRef.current) {
      return;
    }

    if (currentBusPoint) {
      centerMapOnPoint(currentBusPoint, 16, true);
      hasAutoFittedRef.current = true;
      return;
    }

    const visiblePoints = [...routePath, ...routeEndpoints].filter(Boolean);
    if (visiblePoints.length > 1) {
      fitMapToPoints(visiblePoints);
      hasAutoFittedRef.current = true;
    }
  }, [centerMapOnPoint, currentBusPoint, fitMapToPoints, isMapReady, routeEndpoints, routePath]);

  const stopTrackingWatch = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const applyLiveTripPayload = useCallback((payload) => {
    setProfile((currentProfile) => mergeProfileAndTrip(currentProfile || seededProfileRef.current, payload));
    setTrailPoints(trimLiveTrail(payload?.liveTracking?.recentPath));
    if (payload?.liveTracking?.travelDate) {
      setTravelDate(payload.liveTracking.travelDate);
    }
    if (payload?.liveTracking?.scheduleId) {
      setSelectedScheduleId(payload.liveTracking.scheduleId);
    }
  }, [mergeProfileAndTrip]);

  const pushLiveLocation = useCallback(async (point) => {
    const now = Date.now();
    const lastPoint = lastSyncedPointRef.current;
    const lastSyncedAt = lastSyncedAtRef.current;
    const movedDistanceKm = lastPoint ? getDistanceKm(lastPoint, point) : Number.POSITIVE_INFINITY;
    const shouldSync =
      !lastPoint ||
      movedDistanceKm >= LIVE_SYNC_DISTANCE_KM ||
      now - lastSyncedAt >= LIVE_SYNC_INTERVAL_MS;

    if (!shouldSync) {
      return;
    }

    lastSyncedPointRef.current = point;
    lastSyncedAtRef.current = now;

    try {
      const response = await updateBusDriverLiveLocation({
        scheduleId: effectiveScheduleId,
        travelDate: effectiveTravelDate,
        location: point,
      });
      applyLiveTripPayload(unwrap(response));
    } catch (error) {
      toast.error(error?.message || 'Unable to sync live bus location');
    }
  }, [applyLiveTripPayload, effectiveScheduleId, effectiveTravelDate]);

  const handleIncomingLocation = useCallback((point) => {
    if (!point) {
      return;
    }

    setLocationPermissionError('');
    setTrailPoints((current) => trimLiveTrail([...current, point]));
    setProfile((currentProfile) => {
      if (!currentProfile?.busService) {
        return currentProfile;
      }

      const nextRecentPath = trimLiveTrail([
        ...(currentProfile.busService.liveTracking?.recentPath || []),
        point,
      ]);
      const nextLiveTracking = {
        ...(currentProfile.busService.liveTracking || {}),
        currentLocation: point,
        recentPath: nextRecentPath,
        lastUpdatedAt: new Date().toISOString(),
      };

      return {
        ...currentProfile,
        busService: {
          ...currentProfile.busService,
          liveTracking: nextLiveTracking,
        },
      };
    });
    if (isFollowingBus) {
      centerMapOnPoint(point, 16, false);
    }
    pushLiveLocation(point);
  }, [centerMapOnPoint, isFollowingBus, pushLiveLocation]);

  const startTrackingWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationPermissionError('Live GPS is not available on this device.');
      return;
    }

    stopTrackingWatch();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        handleIncomingLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speedKmph: Number.isFinite(position.coords.speed) ? position.coords.speed * 3.6 : null,
          recordedAt: new Date().toISOString(),
        });
      },
      (error) => {
        const message = error?.message || 'Location permission was denied';
        setLocationPermissionError(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }, [handleIncomingLocation, stopTrackingWatch]);

  useEffect(() => {
    if (String(liveTracking?.status || '') === 'in_progress') {
      startTrackingWatch();
      return () => {
        stopTrackingWatch();
      };
    }

    stopTrackingWatch();
    return undefined;
  }, [liveTracking?.status, startTrackingWatch, stopTrackingWatch]);

  useEffect(() => () => stopTrackingWatch(), [stopTrackingWatch]);

  const handleStartJourney = async () => {
    if (!effectiveScheduleId) {
      toast.error('Pick a schedule first before starting the journey');
      return;
    }

    if (!effectiveTravelDate) {
      toast.error('Pick a travel date first before starting the journey');
      return;
    }

    setTripActionPending(true);
    try {
      let initialLocation = null;
      try {
        initialLocation = await getCurrentPositionAsync();
      } catch (error) {
        setLocationPermissionError(error?.message || 'Unable to read current location');
      }

      const response = await startBusDriverLiveTrip({
        scheduleId: effectiveScheduleId,
        travelDate: effectiveTravelDate,
        ...(initialLocation ? { location: initialLocation } : {}),
      });
      applyLiveTripPayload(unwrap(response));
      if (initialLocation) {
        lastSyncedPointRef.current = initialLocation;
        lastSyncedAtRef.current = Date.now();
        centerMapOnPoint(initialLocation, 16, true);
      }
      setIsFollowingBus(true);
      startTrackingWatch();
      toast.success('Journey tracking started');
    } catch (error) {
      toast.error(error?.message || 'Unable to start the journey');
    } finally {
      setTripActionPending(false);
    }
  };

  const handleTripStatusChange = async (action, successMessage) => {
    setTripActionPending(true);
    try {
      const response = await updateBusDriverLiveTripStatus({ action });
      applyLiveTripPayload(unwrap(response));

      if (action === 'pause' || action === 'complete' || action === 'reset') {
        stopTrackingWatch();
      }

      if (action === 'resume') {
        setIsFollowingBus(true);
        startTrackingWatch();
      }

      if (action === 'reset') {
        setTrailPoints([]);
        lastSyncedPointRef.current = null;
        lastSyncedAtRef.current = 0;
      }

      toast.success(successMessage);
    } catch (error) {
      toast.error(error?.message || 'Unable to update journey status');
    } finally {
      setTripActionPending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] px-5 py-10">
        <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
        </div>
      </div>
    );
  }

  if (!busService) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] px-5 py-8">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => navigate('/taxi/driver/bus-home')}
            className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-900"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-lg font-black text-slate-900">No bus route is available right now.</p>
          <p className="mt-2 text-sm text-slate-500">Assign the bus service first from admin, then reopen this page.</p>
        </div>
      </div>
    );
  }

  const liveStatusTone = STATUS_TONE[String(liveTracking?.status || 'idle')] || STATUS_TONE.idle;

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-4 pb-10 pt-6" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[30px] bg-[#10213b] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => navigate('/taxi/driver/bus-home')}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">Live Bus Control</p>
                <h1 className="mt-2 text-2xl font-black">
                  {busService.route?.originCity || 'Origin'} to {busService.route?.destinationCity || 'Destination'}
                </h1>
                <p className="mt-1 text-sm text-white/70">
                  {formatDisplayDate(effectiveTravelDate)} {selectedSchedule?.label ? `• ${selectedSchedule.label}` : ''} {selectedSchedule?.departureTime ? `• ${selectedSchedule.departureTime}` : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${liveStatusTone}`}>
                {getStatusLabel(liveTracking?.status)}
              </span>
              {String(liveTracking?.status || '') === 'idle' ? (
                <button
                  type="button"
                  onClick={handleStartJourney}
                  disabled={tripActionPending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={15} />
                  Start Journey
                </button>
              ) : null}
              {String(liveTracking?.status || '') === 'in_progress' ? (
                <button
                  type="button"
                  onClick={() => handleTripStatusChange('pause', 'Journey paused')}
                  disabled={tripActionPending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Pause size={15} />
                  Pause
                </button>
              ) : null}
              {String(liveTracking?.status || '') === 'paused' ? (
                <button
                  type="button"
                  onClick={() => handleTripStatusChange('resume', 'Journey resumed')}
                  disabled={tripActionPending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Play size={15} />
                  Resume
                </button>
              ) : null}
              {['in_progress', 'paused'].includes(String(liveTracking?.status || '')) ? (
                <button
                  type="button"
                  onClick={() => handleTripStatusChange('complete', 'Journey completed')}
                  disabled={tripActionPending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Square size={15} />
                  Complete
                </button>
              ) : null}
              {String(liveTracking?.status || '') === 'completed' ? (
                <button
                  type="button"
                  onClick={() => handleTripStatusChange('reset', 'Journey reset')}
                  disabled={tripActionPending}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/8 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Pickup Stops</p>
              <p className="mt-2 text-2xl font-black">{pickupStops.length}</p>
            </div>
            <div className="rounded-2xl bg-white/8 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Drop Stops</p>
              <p className="mt-2 text-2xl font-black">{dropStops.length}</p>
            </div>
            <div className="rounded-2xl bg-white/8 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Tracked Distance</p>
              <p className="mt-2 text-2xl font-black">{Number(liveTracking?.totalDistanceKm || 0).toFixed(1)} km</p>
            </div>
            <div className="rounded-2xl bg-white/8 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Route Progress</p>
              <p className="mt-2 text-2xl font-black">{routeMetrics.progressPercent.toFixed(0)}%</p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Live Route Map</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">{busService.route?.routeName || 'Standard route'}</h2>
                <p className="mt-1 text-sm text-slate-500">Grey starts from the live bus and shows only the remaining road route.</p>
              </div>
            </div>

            <div className="relative h-[480px] overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
              {isMapReady ? (
                <GoogleMap
                  mapContainerStyle={MAP_CONTAINER_STYLE}
                  center={mapCenter}
                  zoom={routeEndpoints.length > 1 ? 6 : 8}
                  options={{
                    disableDefaultUI: true,
                    clickableIcons: false,
                    gestureHandling: 'greedy',
                    zoomControl: true,
                    keyboardShortcuts: true,
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false,
                  }}
                  onLoad={(map) => {
                    mapRef.current = map;
                    hasAutoFittedRef.current = false;
                  }}
                  onDragStart={() => setIsFollowingBus(false)}
                  onZoomChanged={() => {
                    if (mapRef.current && !programmaticCameraRef.current) {
                      setIsFollowingBus(false);
                    }
                  }}
                >
                  {originPoint ? (
                    <MarkerF
                      position={originPoint}
                      icon={originMarkerIcon}
                      title={busService.route?.originCity || 'Origin'}
                    />
                  ) : null}
                  {destinationPoint ? (
                    <MarkerF
                      position={destinationPoint}
                      icon={destinationMarkerIcon}
                      title={busService.route?.destinationCity || 'Destination'}
                    />
                  ) : null}
                  {remainingRoutePath.length > 1 ? (
                    <PolylineF
                      path={remainingRoutePath}
                      options={{
                        strokeColor: '#334155',
                        strokeOpacity: 0.9,
                        strokeWeight: 5,
                      }}
                    />
                  ) : null}
                  {shouldShowLiveTrail ? (
                    <PolylineF
                      path={simplifiedTrail}
                      options={{
                        strokeColor: '#dc2626',
                        strokeOpacity: 0.96,
                        strokeWeight: 6,
                      }}
                    />
                  ) : null}
                  {currentBusPoint ? (
                    <MarkerF
                      position={currentBusPoint}
                      icon={busMarkerIcon}
                      title={busService.busName || 'Live bus'}
                    />
                  ) : null}
                </GoogleMap>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-slate-500">
                  Route map will appear once Google Maps is ready.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => recenterOnBus(16)}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg"
              >
                <Navigation size={15} />
                {currentBusPoint ? 'Recenter Bus' : 'Center Route'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFollowingBus(false);
                  fitMapToPoints([...routePath, ...routeEndpoints].filter(Boolean));
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700"
              >
                <LocateFixed size={15} />
                Route Fit
              </button>
              <div className={`inline-flex items-center rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] ${
                isFollowingBus ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {isFollowingBus ? 'Following Bus' : 'Manual View'}
              </div>
            </div>

            {locationPermissionError ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                {locationPermissionError}
              </div>
            ) : null}
          </section>

          <div className="space-y-5">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Navigation size={16} className="text-slate-500" />
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Journey Snapshot</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Current Bus Position</p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {currentBusPoint ? `${currentBusPoint.lat.toFixed(6)}, ${currentBusPoint.lng.toFixed(6)}` : 'Waiting for live GPS'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {liveTracking?.currentLocation?.speedKmph ? `${liveTracking.currentLocation.speedKmph.toFixed(0)} km/h` : 'Speed unavailable'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Remaining Route</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{routeMetrics.remainingDistanceKm.toFixed(1)} km</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Planned road path {routeMetrics.totalDistanceKm.toFixed(1)} km
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pickup Coordinates</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{busService.route?.originCity || 'Origin not set'}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {originPoint ? `${originPoint.lat.toFixed(6)}, ${originPoint.lng.toFixed(6)}` : 'Coordinates not saved'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Destination Coordinates</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{busService.route?.destinationCity || 'Destination not set'}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {destinationPoint ? `${destinationPoint.lat.toFixed(6)}, ${destinationPoint.lng.toFixed(6)}` : 'Coordinates not saved'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Bus size={14} /> Driver</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{busService.driverName || profile?.name || 'Driver'}</p>
                  <p className="mt-1 text-sm text-slate-500">{busService.driverPhone || profile?.phone || 'No phone'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><CalendarDays size={14} /> Schedule</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{selectedSchedule?.label || 'Schedule not set'}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedSchedule?.departureTime || '--:--'} to {selectedSchedule?.arrivalTime || '--:--'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><Clock3 size={14} /> Last Update</p>
                  <p className="mt-2 text-sm font-black text-slate-900">
                    {liveTracking?.lastUpdatedAt ? new Date(liveTracking.lastUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{syncingTrip ? 'Refreshing live trip...' : 'Live sync active'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400"><RouteIcon size={14} /> Trail Points</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{trailPoints.length}</p>
                  <p className="mt-1 text-sm text-slate-500">{shouldShowLiveTrail ? 'Live trail visible' : 'Trail hidden until real movement'}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <RouteIcon size={16} className="text-slate-500" />
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Route Stops</p>
              </div>

              <div className="mt-4 space-y-3">
                {routeStops.length ? routeStops.map((stop, index) => {
                  const stopTone = STOP_TYPE_TONE[stop?.stopType] || 'bg-slate-100 text-slate-600 border-slate-200';

                  return (
                    <article key={stop?.id || `route-stop-${index}`} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900">{stop?.city || 'City not set'}</p>
                          <p className="mt-1 text-sm text-slate-600">{stop?.pointName || 'Point not set'}</p>
                          <p className="mt-2 text-xs font-semibold text-slate-500">{stop?.arrivalTime || '--:--'} to {stop?.departureTime || '--:--'}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${stopTone}`}>
                          {stop?.stopType || 'stop'}
                        </span>
                      </div>
                    </article>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-500">
                    No route stops are configured for this bus service yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-slate-500" />
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Routing Meta</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Admin Route Distance</p>
                  <p className="mt-2 text-sm font-black text-slate-900">{busService.route?.distanceKm || 'NA'}</p>
                  <p className="mt-1 text-sm text-slate-500">{busService.route?.durationHours || 'Duration not set'}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Live Tracking Mode</p>
                  <p className="mt-2 text-sm font-black text-slate-900">Browser GPS + simplified trail</p>
                  <p className="mt-1 text-sm text-slate-500">Smoothed with `simplify-js` for cleaner real-time movement.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusDriverLiveRoute;
