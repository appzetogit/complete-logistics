import React, { useEffect, useMemo, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import simplify from 'simplify-js';
import {
    MessageSquare,
    Phone,
    ShieldAlert,
    Check,
    Banknote,
    QrCode,
    Scan,
    ChevronRight,
    Star,
    CheckCircle2,
    Package,
    User,
    ArrowUpRight,
    ArrowLeft,
    Clock3,
    MapPinned,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleMap, MarkerF, OverlayView, OverlayViewF, PolylineF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useBaseGoogleMapsLoader } from '../../admin/utils/googleMaps';
import { socketService } from '../../../shared/api/socket';
import api from '../../../shared/api/axiosInstance';
import { computeDrivingRoute } from '../../../shared/utils/googleRoutes';
import autoIcon from '../../../assets/icons/auto.png';
import bikeIcon from '../../../assets/icons/bike.png';
import carIcon from '../../../assets/icons/car.png';
import { getLocalDriverToken } from '../services/registrationService';
import { BACKEND_ORIGIN } from '../../../shared/api/runtimeConfig';

const MAP_CONTAINER_STYLE = {
    width: '100%',
    height: '100%',
};

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const DEFAULT_DRIVER_COORDS = [75.8577, 22.7196];
const ARRIVAL_RADIUS_METERS = 100;
const ROUTE_SIMPLIFY_TOLERANCE = 0.00008;
const ROUTE_OFF_PATH_METERS = 45;
const ROUTE_REFRESH_DEBOUNCE_MS = 2500;
const DRIVER_LOCATION_EMIT_MIN_DISTANCE_METERS = 12;
const DRIVER_LOCATION_EMIT_MIN_INTERVAL_MS = 3000;

const mapStyles = [
    { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eef2f7' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

const toLatLng = (coordinates, fallback = DEFAULT_CENTER) => {
    const [lng, lat] = coordinates || [];

    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        return { lat: Number(lat), lng: Number(lng) };
    }

    return fallback;
};

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

const createOffsetPosition = (position, latOffset = -0.0045, lngOffset = -0.0035) => ({
    lat: Number(position?.lat ?? DEFAULT_CENTER.lat) + latOffset,
    lng: Number(position?.lng ?? DEFAULT_CENTER.lng) + lngOffset,
});

const arePositionsNearlyEqual = (first, second, threshold = 0.0002) => (
    Math.abs(Number(first?.lat ?? 0) - Number(second?.lat ?? 0)) < threshold &&
    Math.abs(Number(first?.lng ?? 0) - Number(second?.lng ?? 0)) < threshold
);

const getAreaName = (address, fallback) => {
    const cleanAddress = String(address || '').trim();

    if (!cleanAddress) {
        return fallback;
    }

    return cleanAddress
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(', ') || fallback;
};

const formatAddressFromPoint = (point, fallback) => {
    const coordinates = readCoordinatePair(point);

    if (!coordinates) {
        return fallback;
    }

    const [lng, lat] = coordinates;
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

const normalizeTripType = (job = {}) => {
    const value = String(job.type || job.serviceType || 'ride').toLowerCase();
    if (value === 'parcel') return 'parcel';
    if (value === 'intercity') return 'intercity';
    return 'ride';
};

const getTripTitle = (type) => {
    if (type === 'parcel') return 'Delivery';
    if (type === 'intercity') return 'Intercity Ride';
    return 'Taxi Ride';
};

const cleanPhoneNumber = (phone) => String(phone || '').replace(/[^\d+]/g, '');

const buildFallbackRoute = (origin, destination) => [origin, destination];
const unwrapApiPayload = (response) => response?.data?.data || response?.data || response;
const hexToRgba = (hex, alpha = 1) => {
    const sanitized = String(hex || '').replace('#', '');

    if (sanitized.length !== 6) {
        return `rgba(15, 23, 42, ${alpha})`;
    }

    const red = Number.parseInt(sanitized.slice(0, 2), 16);
    const green = Number.parseInt(sanitized.slice(2, 4), 16);
    const blue = Number.parseInt(sanitized.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const getJobRideId = (job = {}) => String(job.rideId || job.id || job._id || job.requestId || '').trim();
const ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS = [0, 700, 1500, 2500, 4000];

const resolveVehiclePreviewIcon = (iconUrl = '', fallback = carIcon) => {
    const raw = String(iconUrl || '').trim();

    if (!raw) {
        return fallback;
    }

    if (/^(https?:|data:image\/|blob:)/.test(raw)) {
        return raw;
    }

    if (raw.startsWith('/')) {
        return `${BACKEND_ORIGIN}${raw}`;
    }

    if (/^(uploads\/|images\/)/.test(raw)) {
        return `${BACKEND_ORIGIN}/${raw}`;
    }

    return raw;
};

const getActiveTripVehicleIcon = (ride = {}, driver = {}) => {
    const customIcon = String(
        ride?.vehicleIconUrl ||
        ride?.vehicle?.vehicleIconUrl ||
        ride?.vehicle?.icon ||
        driver?.vehicleIconUrl ||
        driver?.map_icon ||
        driver?.icon ||
        '',
    ).trim();

    if (customIcon) {
        return resolveVehiclePreviewIcon(customIcon, carIcon);
    }

    const iconType = String(
        ride?.vehicleIconType ||
        driver?.vehicleIconType ||
        driver?.vehicleType ||
        '',
    ).toLowerCase();

    if (iconType.includes('bike')) return bikeIcon;
    if (iconType.includes('auto')) return autoIcon;
    if (iconType.includes('car')) return carIcon;

    return carIcon;
};

const getActiveTripPhaseKey = (id) => (id ? `driverActiveTripPhase:${id}` : '');
const getActiveTripUiStateKey = (id) => (id ? `driverActiveTripUiState:${id}` : '');
const ACTIVE_TRIP_SESSION_KEY = 'driverActiveTripSnapshot';

const readStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return '';

    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
};

const writeStoredTripPhase = (id, nextPhase) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, nextPhase);
    } catch {
        // Local storage can be blocked in private contexts; trip still works without it.
    }
};

const clearStoredTripPhase = (id) => {
    const key = getActiveTripPhaseKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return null;

    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredTripUiState = (id, nextState) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.setItem(key, JSON.stringify(nextState));
    } catch {
        // Ignore storage failures and continue with in-memory state.
    }
};

const clearStoredTripUiState = (id) => {
    const key = getActiveTripUiStateKey(id);
    if (!key) return;

    try {
        localStorage.removeItem(key);
    } catch {
        // No-op.
    }
};

const readStoredActiveTripSnapshot = () => {
    try {
        const raw = localStorage.getItem(ACTIVE_TRIP_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeStoredActiveTripSnapshot = (snapshot) => {
    try {
        localStorage.setItem(ACTIVE_TRIP_SESSION_KEY, JSON.stringify(snapshot));
    } catch {
        // Ignore storage failures.
    }
};

const clearStoredActiveTripSnapshot = () => {
    try {
        localStorage.removeItem(ACTIVE_TRIP_SESSION_KEY);
    } catch {
        // No-op.
    }
};

const isSnapshotForRide = (snapshot, rideId = '') => {
    const snapshotRideId = getJobRideId(snapshot?.request?.raw || snapshot?.request || snapshot || {});
    const normalizedRideId = String(rideId || '').trim();

    if (!snapshotRideId || !normalizedRideId) {
        return false;
    }

    return snapshotRideId === normalizedRideId;
};

const readStoredDriverCoords = () => {
    try {
        const stored = JSON.parse(localStorage.getItem('driverInfo') || '{}');
        const coordinates = stored?.location?.coordinates || stored?.coordinates;

        if (Array.isArray(coordinates) && coordinates.length === 2) {
            const [lng, lat] = coordinates;
            if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
                return [Number(lng), Number(lat)];
            }
        }
    } catch {
        // Ignore storage parsing issues and fall back to live geolocation.
    }

    return null;
};

const resolvePhaseFromJob = (job = {}) => {
    const rideId = getJobRideId(job);
    const explicitPhase = String(job.phase || '').toLowerCase();
    const storedPhase = readStoredTripPhase(rideId);
    const liveStatus = String(job.liveStatus || job.status || '').toLowerCase();

    if (liveStatus === 'cancelled' || liveStatus === 'canceled') {
        return 'cancelled';
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(explicitPhase)) {
        return explicitPhase;
    }

    if (['to_pickup', 'otp_verification', 'in_trip', 'payment_confirm', 'review'].includes(storedPhase)) {
        return storedPhase;
    }

    if (liveStatus === 'arriving') return 'otp_verification';
    if (liveStatus === 'started' || liveStatus === 'ongoing') return 'in_trip';
    if (liveStatus === 'arrived') return 'payment_confirm';
    if (liveStatus === 'completed') return 'review';

    return 'to_pickup';
};
const withDriverAuthorization = (token) => (
    token
        ? {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        : {}
);

const normalizeHeading = (value, fallback = 0) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return ((numeric % 360) + 360) % 360;
};

const calculateBearing = (from, to, fallback = 0) => {
    if (!from || !to || arePositionsNearlyEqual(from, to, 0.00001)) {
        return fallback;
    }

    const fromLat = Number(from.lat) * (Math.PI / 180);
    const toLat = Number(to.lat) * (Math.PI / 180);
    const deltaLng = (Number(to.lng) - Number(from.lng)) * (Math.PI / 180);
    const y = Math.sin(deltaLng) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat) -
        Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);

    return normalizeHeading(Math.atan2(y, x) * (180 / Math.PI), fallback);
};

const getRouteHeading = (position, path = [], fallback = 0) => {
    const nextPoint = path.find((point) => !arePositionsNearlyEqual(position, point, 0.00001));
    return nextPoint ? calculateBearing(position, nextPoint, fallback) : fallback;
};

const getVehicleMarkerOffset = (width, height) => ({
    x: -(width / 2),
    y: -(height / 2),
});

const RotatingVehicleMarker = ({ position, iconUrl = carIcon, heading = 0, title = 'Driver' }) => (
    <OverlayViewF
        position={position}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
        getPixelPositionOffset={getVehicleMarkerOffset}
    >
        <div title={title} className="pointer-events-none flex h-14 w-14 items-center justify-center">
            <div
                className="flex h-11 w-11 items-center justify-center transition-transform duration-500 ease-out"
                style={{ transform: `rotate(${normalizeHeading(heading)}deg)` }}
            >
                <img
                    src={iconUrl || carIcon}
                    alt={title}
                    className="h-12 w-12 object-contain drop-shadow-[0_8px_10px_rgba(15,23,42,0.35)]"
                    draggable={false}
                />
            </div>
        </div>
    </OverlayViewF>
);

const getCurrentCoords = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error('Location is not available on this device.'));
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('Please allow location permission to continue tracking.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
});

const parseFareAmount = (value) => {
    const numeric = Number(String(value || '').replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
};

const formatCurrencyAmount = (value) => {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
        return 'Rs 0';
    }

    const hasDecimals = Math.abs(numeric % 1) > 0.001;
    return `Rs ${hasDecimals ? numeric.toFixed(2) : Math.round(numeric)}`;
};

const formatDateTimeLabel = (value, fallback = '--') => {
    if (!value) {
        return fallback;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const formatDurationLabel = (start, end = Date.now()) => {
    if (!start) {
        return '--';
    }

    const startTime = new Date(start).getTime();
    const endTime = typeof end === 'string' || end instanceof Date ? new Date(end).getTime() : Number(end);

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
        return '--';
    }

    const totalMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes} min`;
};

const computeCommissionSummary = ({ fare = 0, pricingSnapshot = null, explicitCommissionAmount, explicitDriverEarnings }) => {
    const normalizedFare = Math.max(0, Number(fare || 0));
    const commissionType = Number(pricingSnapshot?.admin_commission_type_from_driver ?? 1);
    const commissionValue = Math.max(0, Number(pricingSnapshot?.admin_commission_from_driver ?? 0));
    const fallbackCommissionAmount = commissionType === 1
        ? Math.round(((normalizedFare * commissionValue) / 100) * 100) / 100
        : Math.min(normalizedFare, commissionValue);
    const normalizedExplicitCommission = Number(explicitCommissionAmount);
    const normalizedExplicitDriverEarnings = Number(explicitDriverEarnings);
    const hasSettledExplicitCommission = Number.isFinite(normalizedExplicitCommission) && (
        normalizedExplicitCommission > 0
        || normalizedFare <= 0
        || fallbackCommissionAmount <= 0
    );
    const commissionAmount = hasSettledExplicitCommission
        ? Math.max(0, normalizedExplicitCommission)
        : fallbackCommissionAmount;
    const derivedDriverEarnings = Math.max(normalizedFare - commissionAmount, 0);
    const hasSettledExplicitDriverEarnings = Number.isFinite(normalizedExplicitDriverEarnings) && (
        normalizedExplicitDriverEarnings > 0
        || normalizedFare <= 0
        || derivedDriverEarnings <= 0
    );
    const driverEarnings = hasSettledExplicitDriverEarnings
        ? Math.max(0, normalizedExplicitDriverEarnings)
        : derivedDriverEarnings;

    return {
        commissionAmount,
        driverEarnings,
        commissionType,
        commissionValue,
        commissionLabel: commissionType === 1 ? `${commissionValue}%` : formatCurrencyAmount(commissionValue),
    };
};

const getSimulationPath = ({ routePath = [], from, to }) => {
    const path = routePath.length > 1 ? routePath : [from, to].filter(Boolean);
    return path
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));
};
const getRouteCacheKey = (origin, destination) => {
    const serializePoint = (point) =>
        point ? `${Number(point.lat || 0).toFixed(5)},${Number(point.lng || 0).toFixed(5)}` : '';

    return `${serializePoint(origin)}|${serializePoint(destination)}`;
};

const toRadians = (value) => Number(value) * (Math.PI / 180);

const getDistanceMeters = (from, to) => {
    if (!from || !to) {
        return 0;
    }

    const fromLat = Number(from.lat);
    const fromLng = Number(from.lng);
    const toLat = Number(to.lat);
    const toLng = Number(to.lng);

    if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const deltaLat = toRadians(toLat - fromLat);
    const deltaLng = toRadians(toLng - fromLng);
    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
};

const simplifyRoutePath = (points, tolerance = ROUTE_SIMPLIFY_TOLERANCE) => {
    const normalized = (Array.isArray(points) ? points : [])
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));

    if (normalized.length <= 2) {
        return normalized;
    }

    const simplified = simplify(
        normalized.map((point) => ({ x: point.lng, y: point.lat })),
        tolerance,
        true,
    ).map((point) => ({ lat: point.y, lng: point.x }));

    const firstPoint = normalized[0];
    const lastPoint = normalized[normalized.length - 1];
    const nextPath = simplified.slice();

    if (!arePositionsNearlyEqual(nextPath[0], firstPoint, 0.000001)) {
        nextPath.unshift(firstPoint);
    }

    if (!arePositionsNearlyEqual(nextPath[nextPath.length - 1], lastPoint, 0.000001)) {
        nextPath.push(lastPoint);
    }

    return nextPath;
};

const projectPointOnSegment = (point, segmentStart, segmentEnd) => {
    const ax = Number(segmentStart?.lng);
    const ay = Number(segmentStart?.lat);
    const bx = Number(segmentEnd?.lng);
    const by = Number(segmentEnd?.lat);
    const px = Number(point?.lng);
    const py = Number(point?.lat);

    if (![ax, ay, bx, by, px, py].every(Number.isFinite)) {
        return null;
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abLengthSquared = (abx * abx) + (aby * aby);

    if (abLengthSquared <= 0) {
        return { lat: ay, lng: ax, ratio: 0 };
    }

    const apx = px - ax;
    const apy = py - ay;
    const ratio = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / abLengthSquared));

    return {
        lat: ay + (aby * ratio),
        lng: ax + (abx * ratio),
        ratio,
    };
};

const trimRoutePathFromPosition = (points, position) => {
    const normalizedPath = (Array.isArray(points) ? points : [])
        .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));

    if (!position || normalizedPath.length === 0) {
        return {
            path: normalizedPath,
            distanceMeters: Number.POSITIVE_INFINITY,
            advanced: false,
        };
    }

    if (normalizedPath.length === 1) {
        return {
            path: [position],
            distanceMeters: getDistanceMeters(position, normalizedPath[0]),
            advanced: !arePositionsNearlyEqual(position, normalizedPath[0], 0.00001),
        };
    }

    let closestDistanceMeters = Number.POSITIVE_INFINITY;
    let closestSegmentIndex = 0;
    let closestProjectedPoint = normalizedPath[0];

    for (let index = 0; index < normalizedPath.length - 1; index += 1) {
        const projected = projectPointOnSegment(position, normalizedPath[index], normalizedPath[index + 1]);
        if (!projected) {
            continue;
        }

        const distanceMeters = getDistanceMeters(position, projected);
        if (distanceMeters < closestDistanceMeters) {
            closestDistanceMeters = distanceMeters;
            closestSegmentIndex = index;
            closestProjectedPoint = { lat: projected.lat, lng: projected.lng };
        }
    }

    const remainingPath = [
        position,
        closestProjectedPoint,
        ...normalizedPath.slice(closestSegmentIndex + 1),
    ].filter((point, index, items) => (
        index === 0 || !arePositionsNearlyEqual(point, items[index - 1], 0.000001)
    ));

    return {
        path: simplifyRoutePath(remainingPath),
        distanceMeters: closestDistanceMeters,
        advanced: closestSegmentIndex > 0 || !arePositionsNearlyEqual(position, normalizedPath[0], 0.00005),
    };
};

const arePathsEquivalent = (first = [], second = [], threshold = 0.00001) => {
    if (first.length !== second.length) {
        return false;
    }

    return first.every((point, index) => arePositionsNearlyEqual(point, second[index], threshold));
};

const formatDistanceLabel = (meters) => {
    const distance = Number(meters || 0);

    if (!Number.isFinite(distance) || distance <= 0) {
        return 'Nearby';
    }

    if (distance < 1000) {
        return `${Math.max(50, Math.round(distance / 10) * 10)} m away`;
    }

    return `${(distance / 1000).toFixed(distance >= 10000 ? 0 : 1)} km away`;
};

const formatTimerClock = (totalSeconds) => {
    const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatWholeMinutes = (value) => `${Math.max(0, Math.floor(Number(value) || 0))} min`;

const buildPersistedTripState = (job = {}, overrides = {}) => {
    const mergedJob = {
        ...job,
        ...overrides,
    };
    const currentRideId = getJobRideId(mergedJob);
    const currentType = normalizeTripType(mergedJob);

    if (!currentRideId) {
        return null;
    }

    return {
        type: currentType,
        rideId: currentRideId,
        phase: mergedJob.phase || '',
        otp: mergedJob.otp || '',
        arrivedAt: mergedJob.arrivedAt || '',
        paymentMethod: mergedJob.paymentMethod || 'Cash',
        pricingSnapshot: mergedJob.pricingSnapshot || null,
        currentDriverCoords: mergedJob.lastDriverLocation?.coordinates || mergedJob.driverLocation?.coordinates || null,
        request: {
            type: currentType,
            title: getTripTitle(currentType),
            fare: `Rs ${mergedJob.fare || 0}`,
            payment: mergedJob.paymentMethod || 'Cash',
            pickup: getAreaName(mergedJob.pickupAddress, formatAddressFromPoint(mergedJob.pickupLocation, 'Pickup area')),
            drop: getAreaName(mergedJob.dropAddress, formatAddressFromPoint(mergedJob.dropLocation, 'Drop area')),
            requestId: currentRideId,
            rideId: currentRideId,
            raw: mergedJob,
        },
    };
};

const buildDriverPaymentCollection = ({ mode = '', status = '', paymentQr = null } = {}) => {
    const normalizedMode = String(mode || '').trim().toLowerCase();

    if (!normalizedMode) {
        return null;
    }

    if (normalizedMode === 'online') {
        return {
            method: 'online',
            source: 'driver_qr',
            qrId: paymentQr?.id || '',
            status: status === 'success' ? 'paid' : 'pending',
            paidAt: status === 'success' ? new Date().toISOString() : null,
        };
    }

    if (normalizedMode === 'cash') {
        return {
            method: 'cash',
            source: 'driver_cash',
            status: 'paid',
            paidAt: new Date().toISOString(),
        };
    }

    return {
        method: normalizedMode,
        status: status === 'success' ? 'paid' : 'pending',
        paidAt: status === 'success' ? new Date().toISOString() : null,
    };
};

const ActiveTrip = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routeState = useMemo(() => location.state || {}, [location.state]);
    const routeRideId = routeState?.rideId || routeState?.request?.rideId || '';
    const storedActiveTripSnapshot = useMemo(() => {
        const snapshot = readStoredActiveTripSnapshot();
        return isSnapshotForRide(snapshot, routeRideId) ? snapshot : null;
    }, [routeRideId]);
    const [hydratedTripState, setHydratedTripState] = useState(() => storedActiveTripSnapshot);
    const routeOtp = routeState?.request?.raw?.otp || routeState?.request?.otp || routeState?.otp || '';
    const [isHydratingTrip, setIsHydratingTrip] = useState(!routeRideId || !routeOtp);
    const exitToDriverHome = React.useCallback((statusMessage = '') => {
        if (routeRideId) {
            clearStoredTripPhase(routeRideId);
            clearStoredTripUiState(routeRideId);
        }
        clearStoredActiveTripSnapshot();

        navigate('/taxi/driver/home', {
            replace: true,
            state: statusMessage ? { statusMessage } : undefined,
        });
    }, [navigate, routeRideId]);

    useEffect(() => {
        let active = true;
        const hasRestorableRouteState = Boolean(routeRideId && routeOtp);

        if (hasRestorableRouteState) {
            setIsHydratingTrip(false);
        }

        const hydrateTripState = async () => {
            let lastRestoreError = '';
            let restoredActiveTrip = false;

            try {
                for (let attemptIndex = 0; attemptIndex < ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS.length; attemptIndex += 1) {
                    const delayMs = ACTIVE_TRIP_HYDRATION_RETRY_DELAYS_MS[attemptIndex];

                    if (delayMs > 0) {
                        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
                    }

                    if (!active) {
                        return;
                    }

                    const driverToken = getLocalDriverToken();
                    const [activeDelivery, activeRide] = await Promise.allSettled([
                        api.get('/deliveries/active/me', withDriverAuthorization(driverToken)),
                        api.get('/rides/active/me', withDriverAuthorization(driverToken)),
                    ]);

                    if (!active) {
                        return;
                    }

                    const deliveryPayload =
                        activeDelivery.status === 'fulfilled' ? unwrapApiPayload(activeDelivery.value) : null;
                    const ridePayload =
                        activeRide.status === 'fulfilled' ? unwrapApiPayload(activeRide.value) : null;

                    const currentJob = getJobRideId(deliveryPayload)
                        ? deliveryPayload
                        : getJobRideId(ridePayload)
                            ? ridePayload
                            : null;
                    const currentRideId = getJobRideId(currentJob);
                    const currentStatus = String(currentJob?.liveStatus || currentJob?.status || '').toLowerCase();

                    if (currentRideId && currentStatus !== 'cancelled' && currentStatus !== 'canceled') {
                        const restoredPhase = resolvePhaseFromJob(currentJob);
                        const nextPersistedState = buildPersistedTripState(currentJob, {
                            phase: restoredPhase,
                        });

                        setHydratedTripState(nextPersistedState);
                        writeStoredActiveTripSnapshot(nextPersistedState);
                        setPhase(restoredPhase);
                        restoredActiveTrip = true;
                        return;
                    }

                    if (currentRideId && (currentStatus === 'cancelled' || currentStatus === 'canceled')) {
                        lastRestoreError = 'Ride was cancelled or is no longer active.';
                        break;
                    }
                }
            } catch {
                lastRestoreError = 'Could not restore active trip.';
            } finally {
                if (active) {
                    const fallbackSnapshot = readStoredActiveTripSnapshot();
                    const matchingFallbackSnapshot = isSnapshotForRide(fallbackSnapshot, routeRideId)
                        ? fallbackSnapshot
                        : null;
                    if (restoredActiveTrip) {
                        setIsHydratingTrip(false);
                        return;
                    }

                    if (matchingFallbackSnapshot) {
                        setHydratedTripState(matchingFallbackSnapshot);
                        setPhase(resolvePhaseFromJob(matchingFallbackSnapshot?.request?.raw || matchingFallbackSnapshot));
                    } else if (lastRestoreError) {
                        exitToDriverHome(lastRestoreError);
                    } else {
                        exitToDriverHome('Ride was cancelled or is no longer active.');
                    }

                    setIsHydratingTrip(false);
                }
            }
        };

        hydrateTripState();

        return () => {
            active = false;
        };
    }, [exitToDriverHome, routeOtp, routeRideId]);

    const effectiveState = hydratedTripState || routeState;

    const tripType = effectiveState?.type || 'ride';
    const isParcel = tripType === 'parcel';
    const liveRequest = effectiveState?.request || {};
    const liveRaw = liveRequest.raw || {};
    const rideId = getJobRideId(liveRequest) || getJobRideId(effectiveState);
    const [resolvedPickupCoords, setResolvedPickupCoords] = useState(null);
    const [resolvedDropCoords, setResolvedDropCoords] = useState(null);
    const vehicleIconUrl = getActiveTripVehicleIcon(
        {
            ...effectiveState,
            ...liveRequest,
            ...liveRaw,
            vehicle: liveRaw?.vehicle || liveRequest?.vehicle || effectiveState?.vehicle || null,
        },
        liveRaw?.driver || liveRequest?.raw?.driver || liveRequest?.driver || effectiveState?.driver || {},
    );

    const pickupAddressLabel = String(
        liveRaw?.pickupAddress ||
        liveRequest?.pickup ||
        effectiveState?.request?.pickup ||
        effectiveState?.pickupAddress ||
        '',
    ).trim();
    const dropAddressLabel = String(
        liveRaw?.dropAddress ||
        liveRequest?.drop ||
        effectiveState?.request?.drop ||
        effectiveState?.dropAddress ||
        '',
    ).trim();

    const pickupCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) || resolvedPickupCoords || DEFAULT_DRIVER_COORDS,
        [
            effectiveState?.pickup,
            effectiveState?.pickupCoords,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            resolvedPickupCoords,
        ],
    );
    const dropCoords = useMemo(
        () => readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) || resolvedDropCoords || [75.8937, 22.7533],
        [effectiveState?.drop, effectiveState?.dropCoords, effectiveState?.dropLocation, effectiveState?.request?.raw?.drop, effectiveState?.request?.raw?.dropLocation, liveRaw?.drop, liveRaw?.dropLocation, liveRequest?.drop, liveRequest?.dropLocation, liveRequest?.raw?.drop, liveRequest?.raw?.dropLocation, resolvedDropCoords],
    );
    const assignedDriverCoords = readCoordinatePair(
        liveRaw?.driverLocation,
        liveRequest?.driverLocation,
        effectiveState?.driverCoords,
        effectiveState?.currentDriverCoords,
        readStoredDriverCoords(),
    );

    const pickupPosition = useMemo(() => toLatLng(pickupCoords), [pickupCoords]);
    const dropPosition = useMemo(() => toLatLng(dropCoords), [dropCoords]);
    const initialDriverPosition = useMemo(
        () => assignedDriverCoords ? toLatLng(assignedDriverCoords, pickupPosition) : createOffsetPosition(pickupPosition),
        [assignedDriverCoords, pickupPosition],
    );

    const [phase, setPhase] = useState(() => {
        const initialState = isSnapshotForRide(storedActiveTripSnapshot, routeRideId)
            ? storedActiveTripSnapshot
            : routeState;
        const initialJob = initialState?.request?.raw || initialState?.request || initialState || {};

        return resolvePhaseFromJob({
            ...initialJob,
            rideId: routeRideId || getJobRideId(initialState?.request || initialState),
            phase: initialState?.phase || initialJob?.phase || '',
        });
    });
    const [otp, setOtp] = useState(['', '', '', '']);
    const [otpError, setOtpError] = useState('');
    const [selectedRating, setSelectedRating] = useState(0);
    const [driverPaymentStatus, setDriverPaymentStatus] = useState('pending');
    const [selectedPaymentMode, setSelectedPaymentMode] = useState('');
    const [paymentQr, setPaymentQr] = useState(null);
    const [paymentQrError, setPaymentQrError] = useState('');
    const [isGeneratingPaymentQr, setIsGeneratingPaymentQr] = useState(false);
    const [qrZoomed, setQrZoomed] = useState(true);
    const [arrivalGuardError, setArrivalGuardError] = useState('');
    const [localArrivedAt, setLocalArrivedAt] = useState('');
    const [waitingNow, setWaitingNow] = useState(Date.now());
    const [map, setMap] = useState(null);
    const [driverPosition, setDriverPosition] = useState(initialDriverPosition);
    const [driverHeading, setDriverHeading] = useState(null);
    const [routePath, setRoutePath] = useState([]);
    const [routeError, setRouteError] = useState('');
    const [isSimulationEnabled, setIsSimulationEnabled] = useState(false);
    const [isSimulationRunning, setIsSimulationRunning] = useState(false);
    const [simulationStep, setSimulationStep] = useState(0);
    const { isLoaded, loadError } = useBaseGoogleMapsLoader();
    const simulationPathRef = React.useRef([]);
    const simulationTimerRef = React.useRef(null);
    const isSimulationEnabledRef = React.useRef(false);
    const routeCacheRef = React.useRef(new Map());
    const hasResolvedLivePositionRef = React.useRef(false);
    const hasHydratedUiStateRef = React.useRef(false);
    const mapFrameKeyRef = React.useRef('');
    const lastRouteRefreshAtRef = React.useRef(0);
    const routeTrimStateRef = React.useRef({ distanceMeters: Number.POSITIVE_INFINITY, shouldRefresh: false });
    const lastDriverLocationEmitRef = React.useRef({
        position: null,
        emittedAt: 0,
    });
    const previousDestinationRef = React.useRef(null);

    const activeDestination = useMemo(
        () => (phase === 'to_pickup' || phase === 'otp_verification' ? pickupPosition : dropPosition),
        [dropPosition, phase, pickupPosition],
    );
    const pickupDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, pickupPosition),
        [driverPosition, pickupPosition],
    );
    const dropDistanceMeters = useMemo(
        () => getDistanceMeters(driverPosition, dropPosition),
        [driverPosition, dropPosition],
    );
    const riderDistanceLabel = useMemo(
        () => formatDistanceLabel(pickupDistanceMeters),
        [pickupDistanceMeters],
    );

    useEffect(() => {
        const currentStatus = String(
            liveRaw?.liveStatus ||
            liveRaw?.status ||
            liveRequest?.liveStatus ||
            liveRequest?.status ||
            effectiveState?.liveStatus ||
            effectiveState?.status ||
            '',
        ).toLowerCase();

        if (currentStatus === 'cancelled' || currentStatus === 'canceled' || phase === 'cancelled') {
            exitToDriverHome('Ride was cancelled by the user.');
        }
    }, [effectiveState?.liveStatus, effectiveState?.status, exitToDriverHome, liveRaw?.liveStatus, liveRaw?.status, liveRequest?.liveStatus, liveRequest?.status, phase]);

    useEffect(() => {
        const currentRideId = rideId || routeRideId;

        if (!currentRideId) {
            return undefined;
        }

        const socket = socketService.connect({ role: 'driver' });
        const onSocketConnect = () => {
            socketService.emit('ride:join', { rideId: currentRideId });
        };
        if (socket) {
            socketService.emit('ride:join', { rideId: currentRideId });
            socket.on('connect', onSocketConnect);
        }

        const handleTripClosed = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            const closeReason = String(payload.reason || '').toLowerCase();
            if (closeReason === 'accepted-by-another-driver') {
                return;
            }

            clearStoredTripPhase(currentRideId);
            clearStoredTripUiState(currentRideId);
            exitToDriverHome(payload.message || 'Ride was cancelled by the user.');
        };

        const handleRideStatusUpdated = (payload = {}) => {
            if (String(payload.rideId || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        const handleRideState = (payload) => {
            if (!payload) {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled or is no longer active.');
                return;
            }

            if (String(payload.rideId || payload._id || '') !== String(currentRideId)) {
                return;
            }

            const nextStatus = String(payload.liveStatus || payload.status || '').toLowerCase();
            if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
                clearStoredTripPhase(currentRideId);
                clearStoredTripUiState(currentRideId);
                exitToDriverHome('Ride was cancelled by the user.');
            }
        };

        socketService.on('rideRequestClosed', handleTripClosed);
        socketService.on('rideCancelled', handleTripClosed);
        socketService.on('ride:status:updated', handleRideStatusUpdated);
        socketService.on('ride:state', handleRideState);

        return () => {
            socketService.off('rideRequestClosed', handleTripClosed);
            socketService.off('rideCancelled', handleTripClosed);
            socketService.off('ride:status:updated', handleRideStatusUpdated);
            socketService.off('ride:state', handleRideState);
            if (socket) {
                socket.off('connect', onSocketConnect);
            }
        };
    }, [exitToDriverHome, rideId, routeRideId]);

    useEffect(() => {
        if (!rideId) {
            return;
        }

        writeStoredTripPhase(rideId, phase);
    }, [phase, rideId]);

    useEffect(() => {
        if (!rideId || hasHydratedUiStateRef.current) {
            return;
        }

        const storedUiState = readStoredTripUiState(rideId);
        hasHydratedUiStateRef.current = true;

        if (!storedUiState) {
            return;
        }

        if (typeof storedUiState.selectedPaymentMode === 'string') {
            setSelectedPaymentMode(storedUiState.selectedPaymentMode);
        }

        if (typeof storedUiState.driverPaymentStatus === 'string') {
            setDriverPaymentStatus(storedUiState.driverPaymentStatus);
        }

        if (storedUiState.paymentQr && typeof storedUiState.paymentQr === 'object') {
            setPaymentQr(storedUiState.paymentQr);
        }

        if (typeof storedUiState.paymentQrError === 'string') {
            setPaymentQrError(storedUiState.paymentQrError);
        }

        if (typeof storedUiState.selectedRating === 'number') {
            setSelectedRating(storedUiState.selectedRating);
        }

        if (typeof storedUiState.localArrivedAt === 'string') {
            setLocalArrivedAt(storedUiState.localArrivedAt);
        }
    }, [rideId]);

    useEffect(() => {
        if (!rideId || !hasHydratedUiStateRef.current) {
            return;
        }

        writeStoredTripUiState(rideId, {
            selectedPaymentMode,
            driverPaymentStatus,
            paymentQr,
            paymentQrError,
            selectedRating,
            localArrivedAt,
        });
    }, [driverPaymentStatus, localArrivedAt, paymentQr, paymentQrError, rideId, selectedPaymentMode, selectedRating]);

    useEffect(() => {
        if (!rideId || !effectiveState) {
            return;
        }

        const rawJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;

        const derivedLiveStatus =
            phase === 'otp_verification'
                ? 'arriving'
                : phase === 'in_trip'
                    ? 'started'
                    : phase === 'payment_confirm'
                        ? 'arrived'
                        : phase === 'review'
                            ? 'completed'
                            : rawJob?.liveStatus || rawJob?.status || 'accepted';
        const derivedStatus =
            phase === 'in_trip' || phase === 'payment_confirm'
                ? 'ongoing'
                : phase === 'review'
                    ? 'completed'
                    : rawJob?.status || derivedLiveStatus;
        const nextPersistedState = buildPersistedTripState(rawJob, {
            phase,
            liveStatus: derivedLiveStatus,
            status: derivedStatus,
            arrivedAt: phase === 'otp_verification' ? (localArrivedAt || rawJob?.arrivedAt || '') : '',
        });
        if (nextPersistedState) {
            writeStoredActiveTripSnapshot(nextPersistedState);
        }
    }, [effectiveState, liveRaw, liveRequest, localArrivedAt, phase, rideId]);

    useEffect(() => {
        if (!rideId || hydratedTripState) {
            return;
        }

        const routeJob = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest
                : effectiveState;

        const restoredPhase = resolvePhaseFromJob({
            ...routeJob,
            rideId,
        });

        setPhase((current) => (current === 'to_pickup' ? restoredPhase : current));
    }, [effectiveState, hydratedTripState, liveRaw, liveRequest, rideId]);

    useEffect(() => {
        setResolvedPickupCoords(null);
        setResolvedDropCoords(null);
    }, [rideId]);

    useEffect(() => {
        if (!isLoaded || !window.google?.maps?.Geocoder) {
            return;
        }

        const geocoder = new window.google.maps.Geocoder();
        let active = true;

        const resolveAddressCoords = (address, setter) => {
            const trimmedAddress = String(address || '').trim();

            if (!trimmedAddress) {
                return;
            }

            geocoder.geocode({ address: trimmedAddress }, (results, status) => {
                if (!active || status !== 'OK' || !results?.[0]?.geometry?.location) {
                    return;
                }

                const locationPoint = results[0].geometry.location;
                setter([locationPoint.lng(), locationPoint.lat()]);
            });
        };

        if (!readCoordinatePair(
            liveRaw?.pickup,
            liveRaw?.pickupLocation,
            liveRequest?.pickup,
            liveRequest?.pickupLocation,
            liveRequest?.raw?.pickup,
            liveRequest?.raw?.pickupLocation,
            effectiveState?.pickup,
            effectiveState?.pickupLocation,
            effectiveState?.request?.raw?.pickup,
            effectiveState?.request?.raw?.pickupLocation,
            effectiveState?.pickupCoords,
        ) && pickupAddressLabel) {
            resolveAddressCoords(pickupAddressLabel, setResolvedPickupCoords);
        }

        if (!readCoordinatePair(
            liveRaw?.drop,
            liveRaw?.dropLocation,
            liveRequest?.drop,
            liveRequest?.dropLocation,
            liveRequest?.raw?.drop,
            liveRequest?.raw?.dropLocation,
            effectiveState?.drop,
            effectiveState?.dropLocation,
            effectiveState?.request?.raw?.drop,
            effectiveState?.request?.raw?.dropLocation,
            effectiveState?.dropCoords,
        ) && dropAddressLabel) {
            resolveAddressCoords(dropAddressLabel, setResolvedDropCoords);
        }

        return () => {
            active = false;
        };
    }, [
        dropAddressLabel,
        effectiveState?.dropCoords,
        effectiveState?.drop,
        effectiveState?.dropLocation,
        effectiveState?.pickup,
        effectiveState?.pickupCoords,
        effectiveState?.pickupLocation,
        effectiveState?.request?.raw?.drop,
        effectiveState?.request?.raw?.dropLocation,
        effectiveState?.request?.raw?.pickup,
        effectiveState?.request?.raw?.pickupLocation,
        isLoaded,
        liveRaw?.drop,
        liveRaw?.dropLocation,
        liveRaw?.pickup,
        liveRaw?.pickupLocation,
        liveRequest?.drop,
        liveRequest?.dropLocation,
        liveRequest?.pickup,
        liveRequest?.pickupLocation,
        liveRequest?.raw?.drop,
        liveRequest?.raw?.dropLocation,
        liveRequest?.raw?.pickup,
        liveRequest?.raw?.pickupLocation,
        pickupAddressLabel,
    ]);

    const tripData = isParcel ? {
        sender: {
            name: liveRaw.parcel?.senderName || 'Sender',
            rating: '5.0',
            phone: liveRaw.parcel?.senderMobile || '',
        },
        receiver: {
            name: liveRaw.parcel?.receiverName || 'Receiver',
            phone: liveRaw.parcel?.receiverMobile || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${liveRaw.fare || effectiveState?.fare || 120}`,
        payment: effectiveState?.paymentMethod || 'Online'
    } : {
        user: {
            name: liveRaw.user?.name || liveRequest?.user?.name || 'Passenger',
            rating: liveRaw.user?.rating || liveRequest?.user?.rating || '4.8',
            phone: liveRaw.user?.phone || liveRequest?.user?.phone || '',
        },
        pickup: getAreaName(liveRaw.pickupAddress || liveRequest?.pickup, formatAddressFromPoint(liveRaw.pickupLocation, 'Pickup area')),
        drop: getAreaName(liveRaw.dropAddress || liveRequest?.drop, formatAddressFromPoint(liveRaw.dropLocation, 'Drop area')),
        fare: `Rs ${liveRaw.fare || effectiveState?.fare || 120}`,
        payment: liveRequest?.payment || effectiveState?.paymentMethod || 'Online'
    };

    const displayFare = liveRequest?.fare || tripData.fare;
    const fareAmount = parseFareAmount(displayFare);
    const expectedOtp = String(liveRaw?.otp || liveRequest?.otp || effectiveState?.otp || '');
    const waitingPricing = liveRaw?.pricingSnapshot || liveRequest?.raw?.pricingSnapshot || effectiveState?.pricingSnapshot || {};
    const allowedPaymentModes = (() => {
        const rawItems = Array.isArray(waitingPricing?.allowed_payment_methods) ? waitingPricing.allowed_payment_methods : [];
        const normalized = [...new Set(
            rawItems
                .map((item) => String(item || '').trim().toLowerCase())
                .filter((item) => item === 'cash' || item === 'online')
        )];

        return normalized.length ? normalized : ['cash', 'online'];
    })();
    const waitingChargePerMinute = Math.max(0, Number(waitingPricing?.waiting_charge ?? 0));
    const freeWaitingBeforeMinutes = Math.max(0, Number(waitingPricing?.free_waiting_before ?? 0));
    const waitingStartedAt = localArrivedAt || liveRaw?.arrivedAt || liveRequest?.raw?.arrivedAt || effectiveState?.arrivedAt || '';
    const waitingElapsedSeconds = waitingStartedAt
        ? Math.max(0, Math.floor((waitingNow - new Date(waitingStartedAt).getTime()) / 1000))
        : 0;
    const freeWaitingRemainingSeconds = Math.max(0, freeWaitingBeforeMinutes * 60 - waitingElapsedSeconds);
    const waitingChargeableMinutes = Math.max(0, Math.ceil(waitingElapsedSeconds / 60) - freeWaitingBeforeMinutes);
    const canMarkArrived = pickupDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const canDeliverParcel = dropDistanceMeters <= ARRIVAL_RADIUS_METERS;
    const isWaitingForOtp = phase === 'otp_verification' && Boolean(waitingStartedAt);
    const pickupContact = isParcel ? tripData.sender : tripData.user;
    const destinationContact = isParcel ? tripData.receiver : tripData.user;
    const tripStartedAt = liveRaw?.startedAt || liveRequest?.raw?.startedAt || effectiveState?.startedAt || '';
    const tripArrivedAt = localArrivedAt || liveRaw?.arrivedAt || liveRequest?.raw?.arrivedAt || effectiveState?.arrivedAt || '';
    const tripDurationLabel = formatDurationLabel(tripStartedAt, tripArrivedAt || Date.now());
    const tripSummaryTitle = isParcel ? 'Delivery Summary' : 'Ride Summary';
    const tripSummarySubtitle = isParcel ? 'Review the delivery details before you close the order.' : 'Review the trip details before you close the ride.';
    const destinationRoleLabel = isParcel ? 'Receiver' : 'Rider';
    const paymentModeLabel = selectedPaymentMode
        ? (selectedPaymentMode === 'cash' ? 'Cash' : 'Online')
        : (effectiveState?.paymentMethod || liveRequest?.payment || tripData.payment || 'Pending');
    const commissionSummary = computeCommissionSummary({
        fare: fareAmount,
        pricingSnapshot: waitingPricing,
        explicitCommissionAmount: liveRaw?.commissionAmount ?? effectiveState?.commissionAmount,
        explicitDriverEarnings: liveRaw?.driverEarnings ?? effectiveState?.driverEarnings,
    });
    const paymentCollectionLabel = isParcel ? 'receiver' : 'rider';
    const routeStrokeColor = '#000000';
    const routeAccentSoft = hexToRgba(routeStrokeColor, 0.08);
    const routeAccentMuted = hexToRgba(routeStrokeColor, 0.18);
    const routeAccentBorder = hexToRgba(routeStrokeColor, 0.18);
    const simulationTotalSteps = Math.max(0, simulationPathRef.current.length - 1);
    const simulationProgress = simulationTotalSteps > 0
        ? Math.min(100, Math.round((simulationStep / simulationTotalSteps) * 100))
        : 0;
    const displayDriverHeading = useMemo(() => {
        if (Number.isFinite(Number(driverHeading))) {
            return normalizeHeading(driverHeading);
        }

        return getRouteHeading(
            driverPosition,
            routePath,
            calculateBearing(driverPosition, activeDestination),
        );
    }, [activeDestination, driverHeading, driverPosition, routePath]);
    const displayDriverHeadingRef = React.useRef(displayDriverHeading);

    const callContact = (phone) => {
        const cleanPhone = cleanPhoneNumber(phone);

        if (!cleanPhone) {
            window.alert('Phone number is not available for this trip yet.');
            return;
        }

        window.open(`tel:${cleanPhone}`, '_self');
    };

    const openTripChat = () => {
        navigate('/taxi/driver/chat', {
            state: {
                rideId,
                peer: {
                    name: pickupContact?.name || 'Passenger',
                    phone: pickupContact?.phone || '',
                    subtitle: `${isParcel ? 'Sender' : 'Passenger'} - Active now`,
                    role: isParcel ? 'Sender' : 'Passenger',
                },
            },
        });
    };

    const openSupportChat = () => {
        navigate('/taxi/driver/support/chat', {
            state: {
                rideId,
                backPath: '/taxi/driver/active-trip',
                backState: {
                    ...effectiveState,
                    rideId,
                },
            },
        });
    };

    const triggerEmergencySos = () => {
        window.open('tel:112', '_self');
    };

    const publishRideStatus = (nextStatus, paymentMode = '') => {
        if (!rideId) {
            return;
        }

        const driverPaymentCollection = nextStatus === 'completed'
            ? buildDriverPaymentCollection({
                mode: paymentMode || selectedPaymentMode,
                status: driverPaymentStatus,
                paymentQr,
            })
            : null;

        socketService.emit('ride:status:update', {
            rideId,
            status: nextStatus,
            paymentMethod: paymentMode || undefined,
            ...(driverPaymentCollection ? { driverPaymentCollection } : {}),
        });
    };

    const completeRideAndExit = async () => {
        const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';

        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                await api.patch(
                    `/rides/${rideId}/status`,
                    {
                        status: 'completed',
                        paymentMethod: paymentMode || undefined,
                        driverPaymentCollection: buildDriverPaymentCollection({
                            mode: paymentMode,
                            status: driverPaymentStatus,
                            paymentQr,
                        }) || undefined,
                    },
                    withDriverAuthorization(driverToken),
                );
            }
        } catch {
            // Keep going with the socket publish so the trip can still complete in transient API failure cases.
        }

        publishRideStatus('completed', paymentMode);
        clearStoredTripPhase(rideId);
        clearStoredTripUiState(rideId);
        navigate('/taxi/driver/home');
    };

    const completeRideForUserSync = async (paymentMode = '') => {
        if (!rideId) {
            return;
        }

        try {
            const driverToken = getLocalDriverToken();
            await api.patch(
                `/rides/${rideId}/status`,
                {
                    status: 'completed',
                    paymentMethod: paymentMode || undefined,
                    driverPaymentCollection: buildDriverPaymentCollection({
                        mode: paymentMode,
                        status: driverPaymentStatus,
                        paymentQr,
                    }) || undefined,
                },
                withDriverAuthorization(driverToken),
            );
        } catch {
            // The socket publish below remains as a realtime fallback for the rider side.
        }

        publishRideStatus('completed', paymentMode);
    };

    useEffect(() => {
        if (!waitingStartedAt || phase !== 'otp_verification') {
            return undefined;
        }

        setWaitingNow(Date.now());
        const intervalId = window.setInterval(() => {
            setWaitingNow(Date.now());
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [phase, waitingStartedAt]);

    const publishDriverLocation = (position, heading = displayDriverHeading, { speed = null, force = false } = {}) => {
        if (!rideId || !position) {
            return;
        }

        const now = Date.now();
        const lastEmission = lastDriverLocationEmitRef.current;
        const movedDistance = getDistanceMeters(lastEmission.position, position);
        const shouldEmit = force ||
            !lastEmission.position ||
            movedDistance >= DRIVER_LOCATION_EMIT_MIN_DISTANCE_METERS ||
            now - Number(lastEmission.emittedAt || 0) >= DRIVER_LOCATION_EMIT_MIN_INTERVAL_MS;

        if (!shouldEmit) {
            return;
        }

        socketService.emit('ride:driver-location:update', {
            rideId,
            coordinates: [position.lng, position.lat],
            heading: normalizeHeading(heading),
            speed,
            simulated: isSimulationEnabledRef.current,
        });

        lastDriverLocationEmitRef.current = {
            position,
            emittedAt: now,
        };
    };

    const stopSimulationTimer = () => {
        if (simulationTimerRef.current) {
            clearInterval(simulationTimerRef.current);
            simulationTimerRef.current = null;
        }
    };

    const startSimulation = () => {
        const nextPath = getSimulationPath({
            routePath,
            from: driverPosition,
            to: activeDestination,
        });

        if (nextPath.length < 2) {
            return;
        }

        stopSimulationTimer();
        simulationPathRef.current = nextPath;
        const nextHeading = getRouteHeading(nextPath[0], nextPath.slice(1), displayDriverHeading);
        setSimulationStep(0);
        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
        setRoutePath(nextPath);
        setDriverPosition(nextPath[0]);
        setDriverHeading(nextHeading);
        publishDriverLocation(nextPath[0], nextHeading);
    };

    const pauseSimulation = () => {
        stopSimulationTimer();
        setIsSimulationRunning(false);
    };

    const resumeSimulation = () => {
        if (simulationPathRef.current.length < 2) {
            startSimulation();
            return;
        }

        setIsSimulationEnabled(true);
        setIsSimulationRunning(true);
    };

    const resetSimulation = () => {
        stopSimulationTimer();
        simulationPathRef.current = [];
        setIsSimulationEnabled(false);
        setIsSimulationRunning(false);
        setSimulationStep(0);
        setDriverPosition(initialDriverPosition);
        const nextHeading = calculateBearing(initialDriverPosition, activeDestination, displayDriverHeading);
        setDriverHeading(nextHeading);
        publishDriverLocation(initialDriverPosition, nextHeading);
    };

    const generatePaymentQr = async () => {
        if (!rideId || !fareAmount) {
            setPaymentQrError('Ride fare is missing.');
            return;
        }

        setIsGeneratingPaymentQr(true);
        setPaymentQrError('');
        setPaymentQr(null);

        try {
            const response = await api.post('/drivers/payments/qr', {
                rideId,
                amount: fareAmount,
            });
            const qr = response?.data?.data || response?.data || {};

            if (!qr.imageUrl) {
                throw new Error('Payment QR image was not returned.');
            }

            setPaymentQr(qr);
            setDriverPaymentStatus('qr_generated');
        } catch (error) {
            setDriverPaymentStatus('pending');
            setPaymentQrError(error?.response?.data?.message || error?.message || 'Could not generate payment QR.');
        } finally {
            setIsGeneratingPaymentQr(false);
        }
    };

    const refreshPaymentStatus = async () => {
        if (!rideId || !paymentQr?.id) {
            return;
        }

        try {
            const response = await api.get('/drivers/payments/qr/status', {
                params: { rideId },
            });
            const status = response?.data?.data || response?.data || {};

            if (status?.paid || ['paid', 'captured', 'completed'].includes(String(status?.status || '').toLowerCase())) {
                setPaymentQr((current) => ({
                    ...(current || paymentQr),
                    status: status.status,
                    paidAt: status.paidAt || Date.now(),
                }));
                setPaymentQrError('');
                setDriverPaymentStatus('success');
            }
        } catch (error) {
            const message = error?.response?.data?.message || error?.message || '';
            if (message) {
                setPaymentQrError(message);
            }
        }
    };

    const handlePaymentModeSelect = (modeId) => {
        setSelectedPaymentMode(modeId);

        if (modeId === 'online') {
            generatePaymentQr();
            return;
        }

        setPaymentQr(null);
        setPaymentQrError('');
        setDriverPaymentStatus('success');
    };

    useEffect(() => {
        if (driverPaymentStatus !== 'qr_generated' || !paymentQr?.id) {
            return undefined;
        }

        refreshPaymentStatus();
        const intervalId = window.setInterval(refreshPaymentStatus, 3000);

        return () => window.clearInterval(intervalId);
    }, [driverPaymentStatus, paymentQr?.id, rideId]);

    const startTripAfterOtp = async (enteredOtp) => {
        if (String(enteredOtp).length !== 4) {
            setOtpError('Enter the full 4 digit PIN.');
            return;
        }

        let resolvedExpectedOtp = String(expectedOtp || '');

        try {
            const driverToken = getLocalDriverToken();
            const endpoint = isParcel ? '/deliveries/active/me' : '/rides/active/me';
            const response = await api.get(endpoint, withDriverAuthorization(driverToken));
            const latestActiveJob = unwrapApiPayload(response);
            const latestRideId = getJobRideId(latestActiveJob);

            if (latestRideId && String(latestRideId) === String(rideId || routeRideId || '')) {
                resolvedExpectedOtp = String(latestActiveJob?.otp || resolvedExpectedOtp || '');

                const latestPersistedState = buildPersistedTripState(latestActiveJob, {
                    phase,
                    arrivedAt: localArrivedAt || latestActiveJob?.arrivedAt || '',
                });

                if (latestPersistedState) {
                    setHydratedTripState(latestPersistedState);
                    writeStoredActiveTripSnapshot(latestPersistedState);
                }
            }
        } catch {
            // Fall back to the currently hydrated OTP if the refresh request fails.
        }

        if (String(enteredOtp) !== resolvedExpectedOtp) {
            setOtpError('Wrong PIN. Ask the passenger again.');
            return;
        }

        setOtpError('');
        setLocalArrivedAt('');
        setPhase('in_trip');
        const startedAtIso = new Date().toISOString();
        const rawJobForSnapshot = liveRaw?.rideId || liveRaw?._id || liveRaw?.id
            ? liveRaw
            : liveRequest?.rideId || liveRequest?._id || liveRequest?.id
                ? liveRequest?.raw || liveRequest
                : effectiveState?.request?.raw || effectiveState;
        const optimisticSnapshot = buildPersistedTripState(rawJobForSnapshot, {
            phase: 'in_trip',
            liveStatus: 'started',
            status: 'ongoing',
            startedAt: startedAtIso,
            arrivedAt: '',
        });

        if (optimisticSnapshot) {
            writeStoredActiveTripSnapshot(optimisticSnapshot);
            setHydratedTripState(optimisticSnapshot);
        }

        try {
            if (rideId) {
                const driverToken = getLocalDriverToken();
                await api.patch(
                    `/rides/${rideId}/status`,
                    { status: 'started' },
                    withDriverAuthorization(driverToken),
                );
            }
        } catch {
            // Keep the optimistic local state; socket/live hydration will reconcile when available.
        }

        publishRideStatus('started');
    };

    useEffect(() => {
        isSimulationEnabledRef.current = isSimulationEnabled;
    }, [isSimulationEnabled]);

    useEffect(() => {
        displayDriverHeadingRef.current = displayDriverHeading;
    }, [displayDriverHeading]);

    useEffect(() => {
        if (!isSimulationEnabled && !hasResolvedLivePositionRef.current) {
            setDriverPosition((currentPosition) =>
                arePositionsNearlyEqual(currentPosition, initialDriverPosition) ? currentPosition : initialDriverPosition,
            );
        }
    }, [initialDriverPosition, isSimulationEnabled]);

    useEffect(() => {
        let watchId = null;
        let cancelled = false;
        const socket = socketService.connect({ role: 'driver' });

        if (socket && rideId) {
            socketService.emit('ride:join', { rideId });
        }

        getCurrentCoords()
            .then((position) => {
                if (!cancelled && !isSimulationEnabledRef.current) {
                    hasResolvedLivePositionRef.current = true;
                    setDriverPosition((previousPosition) => {
                        const nextHeading = calculateBearing(previousPosition, position, displayDriverHeadingRef.current);
                        setDriverHeading(nextHeading);
                        publishDriverLocation(position, nextHeading, { force: true });
                        return position;
                    });
                }
            })
            .catch(() => {});

        if (!navigator.geolocation) {
            return () => {
                cancelled = true;
            };
        }

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (cancelled || isSimulationEnabledRef.current) {
                    return;
                }

                const nextPosition = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                };

                setDriverPosition((previousPosition) => {
                    hasResolvedLivePositionRef.current = true;
                    const nextHeading = normalizeHeading(
                        pos.coords.heading,
                        calculateBearing(previousPosition, nextPosition, displayDriverHeadingRef.current),
                    );
                    setDriverHeading(nextHeading);
                    if (rideId) {
                        publishDriverLocation(nextPosition, nextHeading, {
                            speed: pos.coords.speed,
                        });
                    }
                    return nextPosition;
                });
            },
            () => {},
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 15000,
            },
        );

        return () => {
            cancelled = true;
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, [rideId]);

    useEffect(() => {
        stopSimulationTimer();

        if (!isSimulationRunning || simulationPathRef.current.length < 2) {
            return undefined;
        }

        simulationTimerRef.current = setInterval(() => {
            setSimulationStep((currentStep) => {
                const nextStep = Math.min(currentStep + 1, simulationPathRef.current.length - 1);
                const previousPosition = simulationPathRef.current[currentStep];
                const nextPosition = simulationPathRef.current[nextStep];

                if (nextPosition) {
                    const nextHeading = calculateBearing(
                        previousPosition,
                        nextPosition,
                        getRouteHeading(nextPosition, simulationPathRef.current.slice(nextStep + 1), displayDriverHeadingRef.current),
                    );
                    setDriverPosition(nextPosition);
                    setDriverHeading(nextHeading);
                    setRoutePath(simulationPathRef.current.slice(nextStep));
                    publishDriverLocation(nextPosition, nextHeading);
                    map?.panTo(nextPosition);
                }

                if (nextStep >= simulationPathRef.current.length - 1) {
                    stopSimulationTimer();
                    setIsSimulationRunning(false);
                }

                return nextStep;
            });
        }, 750);

        return () => stopSimulationTimer();
    }, [isSimulationRunning, map, rideId]);

    useEffect(() => () => stopSimulationTimer(), []);

    useEffect(() => {
        const destinationChanged = !previousDestinationRef.current ||
            !arePositionsNearlyEqual(previousDestinationRef.current, activeDestination, 0.00001);
        previousDestinationRef.current = activeDestination;

        if (isSimulationEnabled && !destinationChanged) {
            return;
        }

        if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
            const nextPath = [driverPosition];
            setRoutePath((currentPath) => (arePathsEquivalent(currentPath, nextPath) ? currentPath : nextPath));
            setRouteError('');
            routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
            return;
        }

        if (routePath.length > 1 && !destinationChanged) {
            const trimmedRoute = trimRoutePathFromPosition(routePath, driverPosition);
            routeTrimStateRef.current = {
                distanceMeters: trimmedRoute.distanceMeters,
                shouldRefresh: trimmedRoute.distanceMeters > ROUTE_OFF_PATH_METERS,
            };

            if (!routeTrimStateRef.current.shouldRefresh && !arePathsEquivalent(routePath, trimmedRoute.path)) {
                setRoutePath(trimmedRoute.path);
            }

            if (!routeTrimStateRef.current.shouldRefresh) {
                setRouteError('');
                return;
            }
        }

        if (!isLoaded || !window.google?.maps?.importLibrary) {
            const fallbackRoute = buildFallbackRoute(driverPosition, activeDestination);
            setRoutePath(fallbackRoute);
            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = fallbackRoute;
                setSimulationStep(0);
                setDriverPosition(fallbackRoute[0]);
                const nextHeading = getRouteHeading(fallbackRoute[0], fallbackRoute.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(fallbackRoute[0], nextHeading);
                setIsSimulationRunning(true);
            }
            setRouteError('');
            return;
        }

        const now = Date.now();
        if (now - lastRouteRefreshAtRef.current < ROUTE_REFRESH_DEBOUNCE_MS) {
            return;
        }

        const routeCacheKey = getRouteCacheKey(driverPosition, activeDestination);
        const cachedRoute = routeCacheRef.current.get(routeCacheKey);
        if (cachedRoute) {
            if (!arePathsEquivalent(routePath, cachedRoute.routePath)) {
                setRoutePath(cachedRoute.routePath);
            }
            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = cachedRoute.routePath;
                setSimulationStep(0);
                setDriverPosition(cachedRoute.routePath[0]);
                const nextHeading = getRouteHeading(cachedRoute.routePath[0], cachedRoute.routePath.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(cachedRoute.routePath[0], nextHeading);
                setIsSimulationRunning(true);
            }
            setRouteError(cachedRoute.routeError);
            routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
            return;
        }

        lastRouteRefreshAtRef.current = now;
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
                const nextPath = simplifyRoutePath(result.path);
                routeCacheRef.current.set(routeCacheKey, {
                    routePath: nextPath,
                    routeError: '',
                });
                setRoutePath(nextPath);
                
                if (isSimulationEnabled && destinationChanged) {
                    stopSimulationTimer();
                    simulationPathRef.current = nextPath;
                    setSimulationStep(0);
                    setDriverPosition(nextPath[0]);
                    const nextHeading = getRouteHeading(nextPath[0], nextPath.slice(1), displayDriverHeadingRef.current);
                    setDriverHeading(nextHeading);
                    publishDriverLocation(nextPath[0], nextHeading);
                    setIsSimulationRunning(true);
                }

                routeTrimStateRef.current = { distanceMeters: 0, shouldRefresh: false };
                setRouteError('');
                return;
            }

            const fallbackRoute = buildFallbackRoute(driverPosition, activeDestination);
            const nextRouteError = result.status || 'Directions unavailable';
            routeCacheRef.current.set(routeCacheKey, {
                routePath: fallbackRoute,
                routeError: nextRouteError,
            });
            setRoutePath(fallbackRoute);
            
            if (isSimulationEnabled && destinationChanged) {
                stopSimulationTimer();
                simulationPathRef.current = fallbackRoute;
                setSimulationStep(0);
                setDriverPosition(fallbackRoute[0]);
                const nextHeading = getRouteHeading(fallbackRoute[0], fallbackRoute.slice(1), displayDriverHeadingRef.current);
                setDriverHeading(nextHeading);
                publishDriverLocation(fallbackRoute[0], nextHeading);
                setIsSimulationRunning(true);
            }

            routeTrimStateRef.current = { distanceMeters: Number.POSITIVE_INFINITY, shouldRefresh: false };
            setRouteError(nextRouteError);
        })();

        return () => {
            active = false;
        };
    }, [activeDestination, driverPosition, isLoaded, isSimulationEnabled, routePath]);

    useEffect(() => {
        if (!map || !window.google?.maps) {
            return;
        }

        if (isSimulationRunning) {
            map.panTo(driverPosition);
            return;
        }

        const frameKey = [
            phase,
            activeDestination?.lat?.toFixed?.(5) || activeDestination?.lat,
            activeDestination?.lng?.toFixed?.(5) || activeDestination?.lng,
            routePath.length > 1 ? 'route' : 'direct',
        ].join(':');

        if (mapFrameKeyRef.current === frameKey) {
            return;
        }

        mapFrameKeyRef.current = frameKey;

        if (arePositionsNearlyEqual(driverPosition, activeDestination)) {
            map.setCenter(driverPosition);
            map.setZoom(15);
            return;
        }

        const bounds = new window.google.maps.LatLngBounds();

        if (routePath.length > 1) {
            routePath.forEach((point) => bounds.extend(point));
            bounds.extend(driverPosition);
            bounds.extend(activeDestination);
            map.fitBounds(bounds, 72);
            return;
        }

        bounds.extend(driverPosition);
        bounds.extend(activeDestination);
        map.fitBounds(bounds, 80);
    }, [activeDestination, driverPosition, isSimulationRunning, map, routePath]);

    const handleOTPChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;
        const nextOtp = [...otp];
        nextOtp[index] = value;
        setOtp(nextOtp);

        if (value && index < 3) {
            const nextInput = document.getElementById(`otp-${index + 1}`);
            if (nextInput) {
                nextInput.focus();
            }
        }

        setOtpError('');

        const enteredOtp = nextOtp.join('');

        if (enteredOtp.length === 4 && expectedOtp && enteredOtp === expectedOtp) {
            setTimeout(() => startTripAfterOtp(enteredOtp), 250);
            return;
        }

        if (enteredOtp.length === 4 && expectedOtp) {
            setOtpError('Incorrect PIN. Please enter the PIN shown to the passenger.');
        }
    };

    const handleOTPKeyDown = (index, event) => {
        if (event.key !== 'Backspace') {
            return;
        }

        if (otp[index]) {
            const nextOtp = [...otp];
            nextOtp[index] = '';
            setOtp(nextOtp);
            setOtpError('');
            return;
        }

        if (index > 0) {
            const previousInput = document.getElementById(`otp-${index - 1}`);
            if (previousInput) {
                previousInput.focus();
            }
        }
    };

    const mapOptions = useMemo(() => ({
        styles: mapStyles,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        gestureHandling: 'greedy',
    }), []);

    return (
        <div className="relative mx-auto min-h-[100dvh] max-w-lg overflow-hidden bg-slate-200 font-sans select-none">
            {isHydratingTrip && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-200/90 backdrop-blur-sm">
                    <div className="rounded-[16px] bg-white/95 px-4 py-3 shadow-sm text-[12px] font-semibold text-slate-700">
                        Restoring active trip...
                    </div>
                </div>
            )}
            <div className="absolute inset-0 z-0 overflow-hidden bg-slate-200">
                {!HAS_VALID_GOOGLE_MAPS_KEY ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 px-6 text-center">
                        <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-900">Google Maps key missing</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">Set `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env`.</p>
                        </div>
                    </div>
                ) : loadError ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200 px-6 text-center">
                        <div className="rounded-[18px] bg-white/90 px-4 py-4 shadow-sm">
                            <p className="text-[12px] font-semibold text-slate-900">Google Maps failed to load</p>
                            <p className="mt-1 text-[11px] font-bold text-slate-500">Check the browser key restrictions and reload.</p>
                        </div>
                    </div>
                ) : isLoaded ? (
                    <GoogleMap
                        mapContainerStyle={MAP_CONTAINER_STYLE}
                        center={pickupPosition}
                        zoom={14}
                        onLoad={setMap}
                        onUnmount={() => setMap(null)}
                        options={mapOptions}
                    >
                        {routePath.length > 1 && (
                            <>
                                <PolylineF
                                    path={routePath}
                                    options={{
                                        strokeColor: '#000000',
                                        strokeOpacity: 0.16,
                                        strokeWeight: 9,
                                        zIndex: 10,
                                    }}
                                />
                                <PolylineF
                                    path={routePath}
                                    options={{
                                        strokeColor: routeStrokeColor,
                                        strokeOpacity: 0.95,
                                        strokeWeight: 5,
                                        zIndex: 20,
                                    }}
                                />
                            </>
                        )}
                        <RotatingVehicleMarker
                            position={driverPosition}
                            iconUrl={vehicleIconUrl}
                            heading={displayDriverHeading}
                            title="Driver"
                        />
                        <MarkerF
                            position={activeDestination}
                            title={phase === 'to_pickup' || phase === 'otp_verification' ? 'Pickup' : 'Drop'}
                            icon={{
                                path: window.google.maps.SymbolPath.CIRCLE,
                                fillColor: routeStrokeColor,
                                fillOpacity: 1,
                                strokeColor: '#ffffff',
                                strokeWeight: 2,
                                scale: 7,
                            }}
                        />
                    </GoogleMap>
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-slate-200">
                        <div className="rounded-[16px] bg-white/90 px-4 py-3 shadow-sm text-[12px] font-semibold text-slate-700">
                            Loading map
                        </div>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-white/70 via-white/25 to-transparent pointer-events-none" />

                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-8 left-4 z-50 w-10 h-10 rounded-2xl bg-white/95 border border-white/80 shadow-lg flex items-center justify-center"
                >
                    <ArrowLeft size={18} className="text-slate-900" />
                </button>

                <div className="absolute top-8 left-16 right-4 z-50 flex items-center gap-3 bg-slate-900/92 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-2xl">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xl"
                        style={{ backgroundColor: routeStrokeColor }}
                    >
                        <img src={vehicleIconUrl} alt="Vehicle" className="h-7 w-7 object-contain" />
                    </div>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                        <h4 className="text-[9px] font-semibold uppercase tracking-wide leading-none flex items-center gap-2" style={{ color: routeStrokeColor }}>
                            Driver Live
                            <ArrowUpRight size={12} strokeWidth={3} />
                        </h4>
                        <p className="text-[13px] font-semibold text-white leading-tight truncate uppercase">
                            {phase === 'to_pickup' || phase === 'otp_verification' ? `Near ${tripData.pickup}` : `Toward ${tripData.drop}`}
                        </p>
                    </div>
                </div>

                <div className="absolute top-28 left-4 right-4 z-40 grid grid-cols-[minmax(0,1.25fr)_minmax(72px,0.75fr)_minmax(104px,1fr)] gap-2">
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Trip Stage</p>
                        <p className="text-[11px] font-black text-slate-900 mt-1 truncate">
                            {phase === 'to_pickup' ? 'Heading To Pickup' : phase === 'otp_verification' ? 'Verify OTP' : phase === 'in_trip' ? 'On Trip' : phase === 'payment_confirm' ? 'Collect Payment' : 'Complete'}
                        </p>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">ETA</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <Clock3 size={12} style={{ color: routeStrokeColor }} />
                            <p className="text-[11px] font-black text-slate-900 truncate">{phase === 'to_pickup' ? '2 mins' : '12 mins'}</p>
                        </div>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-white/92 border border-white/80 shadow-lg px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Route</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <MapPinned size={12} className="shrink-0 text-slate-500" />
                            <p className="truncate text-[11px] font-black text-slate-900">{phase === 'to_pickup' ? 'Pickup First' : 'To Destination'}</p>
                        </div>
                    </div>
                </div>

                {routeError && (
                    <div className="absolute top-44 right-4 z-40 rounded-2xl bg-white/92 shadow-lg px-3 py-2 min-w-[148px]" style={{ border: `1px solid ${routeAccentBorder}` }}>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.22em]" style={{ color: routeStrokeColor }}>Route</p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-700">Using fallback path while directions load.</p>
                    </div>
                )}

                <div className="absolute top-44 left-4 z-40 w-[190px] rounded-2xl border border-white/80 bg-white/94 px-3 py-3 shadow-lg backdrop-blur-md">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Simulation</p>
                            <p className="mt-0.5 truncate text-[11px] font-black text-slate-900">
                                {isSimulationRunning ? 'Following route' : isSimulationEnabled ? 'Paused' : 'Real GPS'}
                            </p>
                        </div>
                        <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${isSimulationRunning ? 'animate-pulse' : ''}`}
                            style={{ backgroundColor: isSimulationEnabled ? routeStrokeColor : '#cbd5e1' }}
                        />
                    </div>
                    <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ backgroundColor: routeStrokeColor, width: `${isSimulationEnabled ? simulationProgress : 0}%` }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={isSimulationRunning ? pauseSimulation : isSimulationEnabled ? resumeSimulation : startSimulation}
                            className="h-9 rounded-xl px-2 text-[9px] font-black uppercase tracking-wide text-white active:scale-95"
                            style={{ backgroundColor: routeStrokeColor }}
                        >
                            {isSimulationRunning ? 'Pause' : isSimulationEnabled ? 'Resume' : 'Start'}
                        </button>
                        <button
                            type="button"
                            onClick={resetSimulation}
                            disabled={!isSimulationEnabled}
                            className="h-9 rounded-xl border border-slate-100 bg-slate-50 px-2 text-[9px] font-black uppercase tracking-wide text-slate-500 active:scale-95 disabled:opacity-40"
                        >
                            Reset
                        </button>
                    </div>
                    <p className="mt-2 text-[9px] font-semibold leading-tight text-slate-400">
                        Test mode emits live location events along this polyline.
                    </p>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-40">
                <AnimatePresence mode="wait">
                    {phase === 'to_pickup' && (
                        <Motion.div
                            key="to_pickup"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-5 pb-8 shadow-2xl border-t border-slate-100 max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center">
                                        {isParcel ? <Package size={22} className="text-slate-900" /> : <User size={22} className="text-slate-400" />}
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-[15px] font-semibold text-slate-900 tracking-tight uppercase">
                                            {isParcel ? tripData.sender.name : tripData.user.name}
                                        </h4>
                                        <div className="flex items-center gap-1.5 opacity-60">
                                            <Star size={10} fill={routeStrokeColor} className="text-black" />
                                            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                                                {isParcel ? tripData.sender.rating : tripData.user.rating} • {riderDistanceLabel}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            <div className="flex gap-2">
                                    <button onClick={openTripChat} className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 active:scale-95 transition-transform" aria-label="Open trip chat"><MessageSquare size={18} strokeWidth={2.5} /></button>
                                    <button onClick={() => callContact(pickupContact?.phone)} className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center active:scale-95 transition-transform" style={{ color: routeStrokeColor }} aria-label="Call contact"><Phone size={18} strokeWidth={2.5} /></button>
                                </div>
                            </div>
                            <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Arrival Radius</p>
                                        <p className="mt-1 text-[12px] font-black text-slate-900">
                                            {Math.round(pickupDistanceMeters)} m away from pickup
                                        </p>
                                    </div>
                                    <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${canMarkArrived ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                        {canMarkArrived ? 'Unlocked' : 'Within 100 m'}
                                    </div>
                                </div>
                            </div>
                            {arrivalGuardError && (
                                <p className="-mt-1 mb-4 text-center text-[11px] font-black text-red-500 uppercase tracking-wider">
                                    {arrivalGuardError}
                                </p>
                            )}
                            <Motion.button
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    if (!canMarkArrived) {
                                        setArrivalGuardError('Reach within 100 meters of pickup before marking arrived.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    setLocalArrivedAt(new Date().toISOString());
                                    setPhase('otp_verification');
                                    publishRideStatus('arriving');
                                }}
                                className={`w-full h-15 text-white rounded-2xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-lg transition-opacity ${canMarkArrived ? '' : 'opacity-70'}`}
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` }}
                            >
                                {isParcel ? 'Arrived at Sender' : 'I Have Arrived'} <CheckCircle2 size={18} strokeWidth={3} />
                            </Motion.button>
                        </Motion.div>
                    )}

                    {phase === 'otp_verification' && (
                        <Motion.div
                            key="otp_verification"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-100 max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y"
                        >
                            <div className="text-center mb-6">
                                <h3 className="text-xl font-semibold text-slate-900 tracking-tight uppercase leading-none">Security Pin</h3>
                                <p className="text-[10px] font-bold text-slate-400 tracking-wide uppercase mt-2">
                                    Ask <span className="text-slate-900">{isParcel ? 'Sender' : 'Passenger'}</span> for Start PIN
                                </p>
                            </div>
                            {isWaitingForOtp && (
                                <div className="mb-6 rounded-[24px] border border-amber-100 bg-amber-50/70 px-4 py-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm">
                                                <Clock3 size={18} strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-600">Waiting Clock</p>
                                                <p className="mt-1 text-[22px] font-black tracking-tight text-slate-900">{formatTimerClock(waitingElapsedSeconds)}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Free Left</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{formatTimerClock(freeWaitingRemainingSeconds)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Free Before Ride</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{formatWholeMinutes(freeWaitingBeforeMinutes)}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Waiting Charge</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">
                                                Rs {waitingChargePerMinute}/min
                                                {waitingChargeableMinutes > 0 ? ` • ${waitingChargeableMinutes} billable` : ''}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-center gap-3 mb-8">
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        id={`otp-${index}`}
                                        type="tel"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleOTPChange(index, e.target.value)}
                                        onKeyDown={(e) => handleOTPKeyDown(index, e)}
                                        className="w-12 h-16 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-3xl font-semibold text-slate-900 focus:outline-none transition-all shadow-inner"
                                        style={{ '--tw-ring-color': routeStrokeColor, borderColor: routeAccentBorder }}
                                    />
                                ))}
                            </div>
                            {otpError && (
                                <p className="-mt-5 mb-5 text-center text-[11px] font-black text-red-500 uppercase tracking-wider">
                                    {otpError}
                                </p>
                            )}
                            <button
                                onClick={() => startTripAfterOtp(otp.join(''))}
                                className="mb-3 h-13 w-full rounded-xl text-[12px] font-black uppercase tracking-widest text-white shadow-lg active:scale-95 transition-all"
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 16px 28px ${routeAccentMuted}` }}
                            >
                                Submit PIN
                            </button>
                            <div className="flex gap-3">
                                <button onClick={() => {
                                    setLocalArrivedAt('');
                                    setArrivalGuardError('');
                                    setPhase('to_pickup');
                                    publishRideStatus('accepted');
                                }} className="flex-1 h-13 border-2 border-slate-100 text-slate-400 rounded-xl text-[12px] font-semibold uppercase tracking-wide active:scale-95 transition-all">Go Back</button>
                                <button onClick={openSupportChat} className="flex-1 h-13 rounded-xl text-[12px] font-semibold uppercase tracking-wide active:scale-95 transition-all" style={{ backgroundColor: routeAccentSoft, color: routeStrokeColor }}>Support</button>
                            </div>
                        </Motion.div>
                    )}

                    {phase === 'in_trip' && (
                        <Motion.div
                            key="in_trip"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-5 pb-8 shadow-2xl border-t border-slate-100 max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y"
                        >
                                <div className="mb-5 rounded-[22px] border border-slate-100 bg-slate-50/85 px-4 py-3.5 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-[9px] font-semibold uppercase tracking-[0.22em] leading-none mb-1.5" style={{ color: routeStrokeColor }}>Destination</h4>
                                        <p className="text-[15px] font-semibold text-slate-900 tracking-tight leading-5 break-words">
                                            {tripData.drop}
                                        </p>
                                    </div>
                                    <button
                                        onClick={triggerEmergencySos}
                                        className="shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center active:scale-90 transition-transform shadow-sm"
                                        style={{ backgroundColor: routeAccentSoft, color: routeStrokeColor, borderColor: routeAccentBorder }}
                                        aria-label="Call emergency SOS"
                                    >
                                        <ShieldAlert size={22} strokeWidth={2.5} />
                                    </button>
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-3 mb-6 border border-slate-100 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                                        {isParcel ? <Package size={18} className="text-white" /> : <User size={18} className="text-white opacity-40" />}
                                    </div>
                                    <div className="min-w-0 space-y-0.5">
                                        <p className="text-[13px] font-semibold text-slate-900 leading-none uppercase truncate">{isParcel ? tripData.receiver.name : tripData.user.name}</p>
                                        <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide">{isParcel ? 'Receiver' : 'Passenger'}</p>
                                    </div>
                                </div>
                                <button onClick={() => callContact(destinationContact?.phone)} className="shrink-0 w-9 h-9 bg-white rounded-lg border border-slate-100 flex items-center justify-center" style={{ color: routeStrokeColor }} aria-label="Call destination contact"><Phone size={16} strokeWidth={2.5} /></button>
                            </div>
                            {isParcel && (
                                <div className="mb-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Delivery Radius</p>
                                            <p className="mt-1 text-[12px] font-black text-slate-900">
                                                {Math.round(dropDistanceMeters)} m away from receiver
                                            </p>
                                        </div>
                                        <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${canDeliverParcel ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                            {canDeliverParcel ? 'Unlocked' : 'Within 100 m'}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {isParcel && arrivalGuardError && (
                                <p className="-mt-1 mb-4 text-center text-[11px] font-black text-red-500 uppercase tracking-wider">
                                    {arrivalGuardError}
                                </p>
                            )}
                            <Motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => {
                                    if (isParcel && !canDeliverParcel) {
                                        setArrivalGuardError('Reach within 100 meters of receiver before delivering parcel.');
                                        return;
                                    }

                                    setArrivalGuardError('');
                                    publishRideStatus('arrived');
                                    setSelectedPaymentMode('');
                                    setPaymentQr(null);
                                    setPaymentQrError('');
                                    setDriverPaymentStatus('pending');
                                    setPhase('payment_confirm');
                                }}
                                className={`w-full h-15 text-white rounded-xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-xl transition-opacity ${isParcel && !canDeliverParcel ? 'opacity-70' : ''}`}
                                style={{ backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` }}
                            >
                                {isParcel ? 'Deliver Parcel' : 'Arrived at Destination'} <ChevronRight size={18} strokeWidth={3} />
                            </Motion.button>
                        </Motion.div>
                    )}

                    {phase === 'payment_confirm' && (
                        <Motion.div
                            key="payment_confirm"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-100 max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y"
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 shadow-lg transition-all duration-500 text-white" style={{ backgroundColor: driverPaymentStatus === 'success' ? routeStrokeColor : '#0f172a' }}>
                                    {driverPaymentStatus === 'success' ? <Check size={32} strokeWidth={4} /> : <QrCode size={32} strokeWidth={2} />}
                                </div>
                                <h2 className="text-2xl font-semibold text-slate-900 uppercase">
                                    {driverPaymentStatus === 'success' ? 'Payment Success!' : tripSummaryTitle}
                                </h2>
                                <p className="text-[12px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                    {driverPaymentStatus === 'success' ? 'Ready to close this trip' : tripSummarySubtitle}
                                </p>
                            </div>
                            <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-100 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
                                <div className="border-b border-slate-100 px-5 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: routeStrokeColor }}>
                                                {tripSummaryTitle}
                                            </p>
                                            <p className="mt-2 text-[24px] font-black tracking-tight text-slate-900">{displayFare}</p>
                                            <p className="text-[11px] font-semibold text-slate-500">
                                                {isParcel ? 'Parcel delivered and awaiting payment confirmation.' : 'Passenger reached destination and ready to complete.'}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl px-3 py-2 text-right" style={{ backgroundColor: routeAccentSoft }}>
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Payment</p>
                                            <p className="mt-1 text-[13px] font-black text-slate-900">{paymentModeLabel}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 px-5 py-4">
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Clock3 size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Trip Started</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatDateTimeLabel(tripStartedAt)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <CheckCircle2 size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Reached At</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatDateTimeLabel(tripArrivedAt)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <ArrowUpRight size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Trip Duration</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{tripDurationLabel}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                                        <div className="flex items-center gap-2 text-slate-500">
                                            <Banknote size={14} strokeWidth={2.5} />
                                            <p className="text-[9px] font-black uppercase tracking-[0.2em]">Your Earnings</p>
                                        </div>
                                        <p className="mt-2 text-[13px] font-bold leading-5 text-slate-900">{formatCurrencyAmount(commissionSummary.driverEarnings)}</p>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 px-5 py-4">
                                    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1 flex flex-col items-center">
                                                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                                                <span className="my-1 h-10 w-px border-l border-dashed border-slate-200" />
                                                <span className="h-3 w-3 rounded-full bg-rose-500" />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-4">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Pickup</p>
                                                    <p className="mt-1 text-[13px] font-bold leading-5 text-slate-900 break-words">{tripData.pickup}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Destination</p>
                                                    <p className="mt-1 text-[13px] font-bold leading-5 text-slate-900 break-words">{tripData.drop}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                                                    {isParcel ? <Package size={18} strokeWidth={2.5} /> : <User size={18} strokeWidth={2.5} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{destinationRoleLabel}</p>
                                                    <p className="mt-1 text-[14px] font-black text-slate-900 truncate">{destinationContact?.name || '--'}</p>
                                                    <p className="text-[11px] font-semibold text-slate-500">{destinationContact?.phone || 'Phone not available'}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => callContact(destinationContact?.phone)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-700" aria-label="Call destination contact">
                                                <Phone size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3 border-t border-slate-100 px-5 py-4">
                                    <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Trip Fare</p>
                                        <p className="mt-2 text-[14px] font-black text-slate-900">{formatCurrencyAmount(fareAmount)}</p>
                                    </div>
                                    <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Admin Cut</p>
                                        <p className="mt-2 text-[14px] font-black text-slate-900">{formatCurrencyAmount(commissionSummary.commissionAmount)}</p>
                                        <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">{commissionSummary.commissionLabel}</p>
                                    </div>
                                    <div className="rounded-2xl px-4 py-3 text-center text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]" style={{ backgroundColor: routeStrokeColor }}>
                                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/65">Driver Gets</p>
                                        <p className="mt-2 text-[14px] font-black text-white">{formatCurrencyAmount(commissionSummary.driverEarnings)}</p>
                                    </div>
                                </div>
                            </div>
                            {driverPaymentStatus === 'pending' && (
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {[
                                        { id: 'cash', label: 'Cash', icon: Banknote },
                                        { id: 'online', label: 'Online', icon: Scan }
                                    ].filter((mode) => allowedPaymentModes.includes(mode.id)).map((mode) => (
                                        <button
                                            key={mode.id}
                                            onClick={() => handlePaymentModeSelect(mode.id)}
                                            disabled={isGeneratingPaymentQr}
                                            className="flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all bg-slate-50/50"
                                            style={selectedPaymentMode === mode.id ? { borderColor: routeStrokeColor, backgroundColor: routeAccentSoft } : undefined}
                                        >
                                            <mode.icon size={22} className={selectedPaymentMode === mode.id ? '' : 'text-slate-400'} style={selectedPaymentMode === mode.id ? { color: routeStrokeColor } : undefined} strokeWidth={2.5} />
                                            <span className="text-[9px] font-semibold text-slate-900 uppercase tracking-wide mt-2">
                                                {mode.id === 'online' && isGeneratingPaymentQr ? 'Generating' : mode.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {paymentQrError && (
                                <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center">
                                    <p className="text-[11px] font-bold text-red-500">{paymentQrError}</p>
                                </div>
                            )}
                            {selectedPaymentMode === 'cash' && driverPaymentStatus === 'success' && (
                                <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 rounded-3xl border border-emerald-100 bg-emerald-50/80 p-5 text-center shadow-lg">
                                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: routeStrokeColor }}>
                                        <Banknote size={24} strokeWidth={2.5} />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Cash Selected</p>
                                    <p className="mt-2 text-[16px] font-black text-slate-900">Collect {displayFare} from the {paymentCollectionLabel}</p>
                                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                                        Once you have the cash in hand, tap below to close this {isParcel ? 'delivery' : 'ride'}.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            await completeRideForUserSync('cash');
                                            setPhase('review');
                                        }}
                                        className="mt-4 w-full rounded-xl py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-lg"
                                        style={{ backgroundColor: routeStrokeColor, boxShadow: `0 16px 28px ${routeAccentMuted}` }}
                                    >
                                        Cash Received
                                    </button>
                                </Motion.div>
                            )}
                            {driverPaymentStatus === 'qr_generated' && (() => {
                                const isInlineQrImage = String(paymentQr?.imageUrl || '').startsWith('data:image/');

                                return (
                                    <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl p-5 mb-6 text-center shadow-2xl text-white" style={{ backgroundColor: routeStrokeColor }}>
                                        <div
                                            onClick={() => !isInlineQrImage && setQrZoomed(!qrZoomed)}
                                            className={`mx-auto mb-3 flex h-[16rem] w-full max-w-[16rem] items-center justify-center rounded-2xl bg-white p-3 relative overflow-hidden select-none transition-all duration-300 ${
                                                !isInlineQrImage ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98] shadow-inner' : ''
                                            }`}
                                        >
                                            <img
                                                src={paymentQr?.imageUrl}
                                                alt={`Payment QR for ${displayFare}`}
                                                className="h-full w-full object-contain"
                                                style={
                                                    !isInlineQrImage
                                                        ? {
                                                              transform: qrZoomed ? 'scale(2.85) translateY(-2.5%)' : 'scale(1)',
                                                              transformOrigin: 'center center',
                                                              transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                                          }
                                                        : undefined
                                                }
                                            />
                                            {/* Floating badge for zoom/fit state */}
                                            {!isInlineQrImage && (
                                                <div className="absolute top-3 right-3 bg-slate-900/70 backdrop-blur-md px-2 py-1 rounded-lg text-[9px] font-bold text-white flex items-center gap-1 shadow-lg border border-white/10 transition-all select-none">
                                                    <Scan size={10} strokeWidth={2.5} className="animate-pulse text-emerald-400" />
                                                    <span>{qrZoomed ? "ZOOMED" : "FIT"}</span>
                                                </div>
                                            )}
                                            {/* Glowing High-Tech Emerald Laser Scan Line */}
                                            <Motion.div
                                                animate={{ top: ['5%', '95%', '5%'] }}
                                                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                                                className="absolute left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#34d399] pointer-events-none"
                                            />
                                        </div>
                                        <p className="text-white font-semibold text-sm uppercase tracking-wide">Scan to pay {displayFare}</p>
                                        <p
                                            className={`text-white/45 text-[10px] font-semibold mt-1 mb-4 uppercase tracking-wide transition-colors ${
                                                !isInlineQrImage ? 'cursor-pointer hover:text-white/70 select-none' : ''
                                            }`}
                                            onClick={() => !isInlineQrImage && setQrZoomed(!qrZoomed)}
                                        >
                                            {isInlineQrImage
                                                ? 'Razorpay collection QR for this ride'
                                                : qrZoomed
                                                    ? 'Tap QR to see full Razorpay receipt'
                                                    : 'Tap QR to zoom scan area'}
                                        </p>
                                        {paymentQr?.linkUrl && (
                                            <a
                                                href={paymentQr.linkUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="mb-3 block text-[10px] font-semibold uppercase tracking-wide text-white/70 underline underline-offset-4"
                                            >
                                                Open payment link
                                            </a>
                                        )}
                                        <button onClick={() => setDriverPaymentStatus('success')} className="w-full py-3 bg-white/10 text-white rounded-xl text-[10px] font-semibold uppercase tracking-wide border border-white/5">Confirm Received</button>
                                    </Motion.div>
                                );
                            })()}
                            <Motion.button
                                whileTap={{ scale: 0.96 }}
                                disabled={driverPaymentStatus !== 'success' || selectedPaymentMode === 'cash'}
                                onClick={async () => {
                                    const paymentMode = selectedPaymentMode || effectiveState?.paymentMethod || liveRequest?.payment || '';
                                    await completeRideForUserSync(paymentMode);
                                    setPhase('review');
                                }}
                                className={`w-full h-15 rounded-xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-xl transition-all ${driverPaymentStatus === 'success' && selectedPaymentMode !== 'cash' ? 'text-white' : 'bg-slate-100 text-slate-300 pointer-events-none'}`}
                                style={driverPaymentStatus === 'success' && selectedPaymentMode !== 'cash' ? { backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` } : undefined}
                            >
                                {selectedPaymentMode === 'cash'
                                    ? 'Use Cash Received Button'
                                    : driverPaymentStatus === 'success'
                                        ? 'Finalize Earnings'
                                        : 'Waiting...'} <ChevronRight size={18} strokeWidth={3} />
                            </Motion.button>
                        </Motion.div>
                    )}

                    {phase === 'review' && (
                        <Motion.div
                            key="review"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-white rounded-t-[2.5rem] p-6 pb-8 shadow-2xl border-t border-slate-50 text-center"
                        >
                            <div className="mb-8 space-y-4">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto shadow-lg" style={{ backgroundColor: routeStrokeColor }}><User size={24} className="text-white" /></div>
                                <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tight">Rate Experience</h3>
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map((score) => (
                                        <Star
                                            key={score}
                                            size={28}
                                            onClick={() => setSelectedRating(score)}
                                            className={`transition-all ${score <= selectedRating ? '' : 'text-slate-100'}`}
                                            style={score <= selectedRating ? { color: routeStrokeColor } : undefined}
                                            fill={score <= selectedRating ? 'currentColor' : 'transparent'}
                                            strokeWidth={2}
                                        />
                                    ))}
                                </div>
                            </div>
                            <button onClick={completeRideAndExit} className="w-full h-15 text-white rounded-xl flex items-center justify-center gap-3 text-[14px] font-semibold uppercase tracking-wide shadow-xl active:scale-95 transition-all" style={{ backgroundColor: routeStrokeColor, boxShadow: `0 18px 30px ${routeAccentMuted}` }}>Done <Check size={20} strokeWidth={4} /></button>
                        </Motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default ActiveTrip;
