import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { normalizePoint, toPoint } from '../../../utils/geo.js';
import { RentalBookingRequest } from '../admin/models/RentalBookingRequest.js';
import { ServiceLocation } from '../admin/models/ServiceLocation.js';
import { ServiceStore } from '../admin/models/ServiceStore.js';
import { RentalVehicleType } from '../admin/models/RentalVehicleType.js';
import { Zone } from '../driver/models/Zone.js';
import { emitToAdmins } from './dispatchService.js';

const ACTIVE_RENTAL_TRACKING_STATUSES = new Set(['assigned', 'confirmed', 'end_requested']);
const TRACKING_HISTORY_LIMIT = 120;
const DEFAULT_GEOFENCE_RADIUS_METERS = 25000;
const LOCATION_STALE_AFTER_MS = 2 * 60 * 1000;

const cleanString = (value = '') => String(value || '').trim();

const toFiniteNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampNonNegative = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const haversineDistanceMeters = (pointA = [], pointB = []) => {
  if (!Array.isArray(pointA) || pointA.length < 2 || !Array.isArray(pointB) || pointB.length < 2) {
    return null;
  }

  const [lng1, lat1] = pointA.map(Number);
  const [lng2, lat2] = pointB.map(Number);

  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) {
    return null;
  }

  const earthRadius = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

const pointInPolygon = (coordinates = [], ring = []) => {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  const [x, y] = coordinates.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }

  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = Array.isArray(ring[index]) ? ring[index] : [];
    const previousPoint = Array.isArray(ring[previous]) ? ring[previous] : [];
    const xi = Number(currentPoint[0]);
    const yi = Number(currentPoint[1]);
    const xj = Number(previousPoint[0]);
    const yj = Number(previousPoint[1]);

    if (![xi, yi, xj, yj].every(Number.isFinite)) {
      continue;
    }

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const buildTrackingEntry = (entry = {}) => {
  const coordinates = Array.isArray(entry?.coordinates) ? entry.coordinates : [];
  const [lng, lat] = coordinates;

  return {
    capturedAt: entry?.capturedAt || null,
    heading: toFiniteNumber(entry?.heading, null),
    speed: toFiniteNumber(entry?.speed, null),
    accuracyMeters: toFiniteNumber(entry?.accuracyMeters, null),
    zoneStatus: cleanString(entry?.zoneStatus || 'unknown').toLowerCase(),
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
    coordinates:
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? [Number(lng), Number(lat)]
        : [],
  };
};

const buildTrackingAlert = (alert = {}) => ({
  code: cleanString(alert?.code).toLowerCase(),
  severity: cleanString(alert?.severity || 'warning').toLowerCase(),
  message: cleanString(alert?.message),
  active: alert?.active !== false,
  createdAt: alert?.createdAt || null,
  updatedAt: alert?.updatedAt || alert?.createdAt || null,
  resolvedAt: alert?.resolvedAt || null,
  metadata: alert?.metadata && typeof alert.metadata === 'object' ? alert.metadata : {},
});

const buildBookingScope = async (booking = {}) => {
  const serviceCenterIds = Array.isArray(booking?.serviceCenterIds)
    ? booking.serviceCenterIds.filter((value) => mongoose.Types.ObjectId.isValid(value))
    : [];
  const serviceCenters = serviceCenterIds.length
    ? await ServiceStore.find({ _id: { $in: serviceCenterIds } })
        .select('_id name zone_id service_location_id latitude longitude location')
        .lean()
    : [];

  const zoneIds = [
    ...new Set(
      serviceCenters
        .map((center) => String(center?.zone_id || '').trim())
        .filter(Boolean),
    ),
  ];

  const serviceLocationId = cleanString(booking?.serviceLocation?.locationId);
  const hubPointFromStore = serviceCenters.find(
    (center) =>
      Array.isArray(center?.location?.coordinates) &&
      center.location.coordinates.length >= 2,
  );

  let hubPoint = hubPointFromStore?.location?.coordinates || [];
  let hubName = cleanString(hubPointFromStore?.name);

  if ((!hubPoint || hubPoint.length < 2) && serviceLocationId && mongoose.Types.ObjectId.isValid(serviceLocationId)) {
    const serviceLocation = await ServiceLocation.findById(serviceLocationId)
      .select('name service_location_name location latitude longitude')
      .lean();

    if (Array.isArray(serviceLocation?.location?.coordinates) && serviceLocation.location.coordinates.length >= 2) {
      hubPoint = serviceLocation.location.coordinates;
      hubName = cleanString(serviceLocation.service_location_name || serviceLocation.name);
    } else {
      const latitude = toFiniteNumber(serviceLocation?.latitude, null);
      const longitude = toFiniteNumber(serviceLocation?.longitude, null);
      if (latitude !== null && longitude !== null) {
        hubPoint = [longitude, latitude];
        hubName = cleanString(serviceLocation?.service_location_name || serviceLocation?.name);
      }
    }
  }

  const fallbackLatitude = toFiniteNumber(booking?.serviceLocation?.latitude, null);
  const fallbackLongitude = toFiniteNumber(booking?.serviceLocation?.longitude, null);
  if ((!hubPoint || hubPoint.length < 2) && fallbackLatitude !== null && fallbackLongitude !== null) {
    hubPoint = [fallbackLongitude, fallbackLatitude];
    hubName = cleanString(booking?.serviceLocation?.name);
  }

  const zones = zoneIds.length
    ? await Zone.find({ _id: { $in: zoneIds }, active: true, status: 'active' })
        .select('name boundary_mode circle_center circle_radius_meters geometry service_location_id')
        .lean()
    : serviceLocationId && mongoose.Types.ObjectId.isValid(serviceLocationId)
      ? await Zone.find({
          service_location_id: serviceLocationId,
          active: true,
          status: 'active',
        })
          .select('name boundary_mode circle_center circle_radius_meters geometry service_location_id')
          .lean()
      : [];

  return {
    serviceCenters,
    zones,
    hubPoint: Array.isArray(hubPoint) && hubPoint.length >= 2 ? hubPoint.map(Number) : [],
    hubName,
  };
};

const evaluateTrackingState = async ({ booking, coordinates = [] }) => {
  const scope = await buildBookingScope(booking);
  const normalizedCoordinates = normalizePoint(coordinates, 'coordinates');

  const matchingZone = scope.zones.find((zone) => {
    if (cleanString(zone?.boundary_mode).toLowerCase() === 'circle') {
      const centerLat = toFiniteNumber(zone?.circle_center?.lat, null);
      const centerLng = toFiniteNumber(zone?.circle_center?.lng, null);
      const radiusMeters = clampNonNegative(zone?.circle_radius_meters, 0);

      if (centerLat === null || centerLng === null || radiusMeters <= 0) {
        return false;
      }

      const distance = haversineDistanceMeters(normalizedCoordinates, [centerLng, centerLat]);
      return distance !== null && distance <= radiusMeters;
    }

    const polygonRing = Array.isArray(zone?.geometry?.coordinates?.[0]) ? zone.geometry.coordinates[0] : [];
    return pointInPolygon(normalizedCoordinates, polygonRing);
  }) || null;

  const distanceFromHubMeters =
    Array.isArray(scope.hubPoint) && scope.hubPoint.length >= 2
      ? haversineDistanceMeters(normalizedCoordinates, scope.hubPoint)
      : null;
  const geofenceRadiusMeters = scope.zones.length > 0 ? null : DEFAULT_GEOFENCE_RADIUS_METERS;
  const isInsideHubFallback =
    geofenceRadiusMeters === null || distanceFromHubMeters === null
      ? true
      : distanceFromHubMeters <= geofenceRadiusMeters;
  const isInsideAllowedArea = Boolean(matchingZone) || isInsideHubFallback;

  return {
    isInsideAllowedArea,
    zoneStatus: scope.zones.length > 0 ? (matchingZone ? 'inside' : 'outside') : (isInsideHubFallback ? 'inside' : 'outside'),
    matchedZoneName: cleanString(matchingZone?.name),
    distanceFromHubMeters: distanceFromHubMeters === null ? null : Math.round(distanceFromHubMeters),
    hubName: scope.hubName,
    geofenceRadiusMeters,
  };
};

const upsertTrackingAlert = ({ alerts = [], code, severity = 'warning', message, active = true, metadata = {} }) => {
  const normalizedCode = cleanString(code).toLowerCase();
  if (!normalizedCode) {
    return { alerts, changed: false };
  }

  const nextAlerts = Array.isArray(alerts) ? [...alerts] : [];
  const index = nextAlerts.findIndex((alert) => cleanString(alert?.code).toLowerCase() === normalizedCode);
  const now = new Date();

  if (active) {
    if (index === -1) {
      nextAlerts.push({
        code: normalizedCode,
        severity,
        message,
        active: true,
        createdAt: now,
        updatedAt: now,
        metadata,
      });
      return { alerts: nextAlerts, changed: true };
    }

    const existingAlert = nextAlerts[index] || {};
    const alreadyActive = existingAlert.active !== false;
    nextAlerts[index] = {
      ...existingAlert,
      severity,
      message,
      active: true,
      updatedAt: now,
      resolvedAt: null,
      metadata,
    };
    return { alerts: nextAlerts, changed: !alreadyActive };
  }

  if (index === -1) {
    return { alerts: nextAlerts, changed: false };
  }

  const existingAlert = nextAlerts[index] || {};
  if (existingAlert.active === false) {
    return { alerts: nextAlerts, changed: false };
  }

  nextAlerts[index] = {
    ...existingAlert,
    active: false,
    updatedAt: now,
    resolvedAt: now,
  };
  return { alerts: nextAlerts, changed: true };
};

export const buildRentalTrackingSnapshot = (booking = {}) => {
  const tracking = booking?.rentalTracking && typeof booking.rentalTracking === 'object'
    ? booking.rentalTracking
    : {};
  const locationCoordinates = Array.isArray(tracking?.currentLocation?.coordinates)
    ? tracking.currentLocation.coordinates
    : [];
  const [lng, lat] = locationCoordinates;
  const lastLocationAt = tracking?.lastLocationAt || null;
  const lastLocationTimestamp = lastLocationAt ? new Date(lastLocationAt).getTime() : NaN;
  const isStale = Number.isFinite(lastLocationTimestamp)
    ? Date.now() - lastLocationTimestamp > LOCATION_STALE_AFTER_MS
    : true;

  let trackingStatus = cleanString(tracking?.trackingStatus || '').toLowerCase() || 'inactive';
  if (trackingStatus === 'active' && isStale) {
    trackingStatus = 'location_off';
  }

  const activeAlerts = (Array.isArray(tracking?.alerts) ? tracking.alerts : [])
    .filter((alert) => alert?.active !== false)
    .map(buildTrackingAlert);

  return {
    enabled: ACTIVE_RENTAL_TRACKING_STATUSES.has(cleanString(booking?.status).toLowerCase()),
    trackingStatus,
    zoneStatus: cleanString(tracking?.zoneStatus || 'unknown').toLowerCase(),
    isStale,
    lastLocationAt,
    lastClientTimestamp: tracking?.lastClientTimestamp || null,
    heading: toFiniteNumber(tracking?.lastHeading, null),
    speed: toFiniteNumber(tracking?.lastSpeed, null),
    accuracyMeters: toFiniteNumber(tracking?.lastAccuracyMeters, null),
    currentLocation:
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? {
            lat: Number(lat),
            lng: Number(lng),
            coordinates: [Number(lng), Number(lat)],
          }
        : null,
    distanceFromHubMeters: toFiniteNumber(tracking?.distanceFromHubMeters, null),
    geofenceRadiusMeters: toFiniteNumber(tracking?.geofenceRadiusMeters, null),
    matchedZoneName: cleanString(tracking?.matchedZoneName),
    hubName: cleanString(tracking?.hubName || booking?.serviceLocation?.name),
    alerts: activeAlerts,
    history: (Array.isArray(tracking?.history) ? tracking.history : []).slice(-20).map(buildTrackingEntry),
  };
};

const buildRentalTrackingAdminPayload = (booking = {}) => ({
  id: String(booking?._id || ''),
  bookingReference: cleanString(booking?.bookingReference),
  status: cleanString(booking?.status || 'pending').toLowerCase(),
  user: {
    id: String(booking?.userId?._id || booking?.userId || ''),
    name: cleanString(booking?.userId?.name || booking?.contactName),
    phone: cleanString(booking?.userId?.phone || booking?.contactPhone),
    email: cleanString(booking?.userId?.email || booking?.contactEmail),
  },
  vehicle: {
    id: String(booking?.assignedVehicle?.vehicleId || booking?.vehicleTypeId?._id || booking?.vehicleTypeId || ''),
    name: cleanString(booking?.assignedVehicle?.name || booking?.vehicleTypeId?.name || booking?.vehicleName),
    category: cleanString(booking?.assignedVehicle?.vehicleCategory || booking?.vehicleTypeId?.vehicleCategory || booking?.vehicleCategory),
    image: cleanString(booking?.assignedVehicle?.image || booking?.vehicleTypeId?.image || booking?.vehicleImage),
  },
  serviceLocation: {
    id: cleanString(booking?.serviceLocation?.locationId),
    name: cleanString(booking?.serviceLocation?.name),
    address: cleanString(booking?.serviceLocation?.address),
    city: cleanString(booking?.serviceLocation?.city),
    latitude: toFiniteNumber(booking?.serviceLocation?.latitude, null),
    longitude: toFiniteNumber(booking?.serviceLocation?.longitude, null),
  },
  assignedAt: booking?.assignedAt || null,
  pickupDateTime: booking?.pickupDateTime || null,
  returnDateTime: booking?.returnDateTime || null,
  updatedAt: booking?.updatedAt || null,
  finalCharge: clampNonNegative(booking?.finalCharge, 0),
  finalElapsedMinutes: clampNonNegative(booking?.finalElapsedMinutes, 0),
  rentalTracking: buildRentalTrackingSnapshot(booking),
});

export const listActiveRentalTrackingBookings = async () => {
  const items = await RentalBookingRequest.find({
    status: { $in: [...ACTIVE_RENTAL_TRACKING_STATUSES] },
  })
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image')
    .sort({ assignedAt: -1, updatedAt: -1 })
    .lean();

  return items.map(buildRentalTrackingAdminPayload);
};

export const updateUserRentalTracking = async ({
  bookingId,
  userId,
  status = 'active',
  coordinates,
  heading = null,
  speed = null,
  accuracyMeters = null,
  capturedAt = null,
}) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, 'Valid rental booking id is required');
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(401, 'Authenticated user id is invalid');
  }

  const normalizedStatus = cleanString(status).toLowerCase() || 'active';
  if (!['active', 'location_off', 'tracking_stopped'].includes(normalizedStatus)) {
    throw new ApiError(400, 'Invalid rental tracking status');
  }

  const booking = await RentalBookingRequest.findOne({
    _id: bookingId,
    userId,
  })
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image');

  if (!booking) {
    throw new ApiError(404, 'Rental booking not found');
  }

  if (!ACTIVE_RENTAL_TRACKING_STATUSES.has(cleanString(booking.status).toLowerCase())) {
    throw new ApiError(409, 'Rental tracking is only available while the booking is active');
  }

  booking.rentalTracking = booking.rentalTracking || {};
  booking.rentalTracking.alerts = Array.isArray(booking.rentalTracking.alerts)
    ? booking.rentalTracking.alerts
    : [];
  booking.rentalTracking.history = Array.isArray(booking.rentalTracking.history)
    ? booking.rentalTracking.history
    : [];

  const clientCapturedAt = capturedAt ? new Date(capturedAt) : new Date();
  const safeCapturedAt = Number.isNaN(clientCapturedAt.getTime()) ? new Date() : clientCapturedAt;

  let zoneAlertChanged = false;
  let availabilityAlertChanged = false;

  if (normalizedStatus === 'active') {
    const normalizedCoordinates = normalizePoint(coordinates, 'coordinates');
    const evaluation = await evaluateTrackingState({
      booking,
      coordinates: normalizedCoordinates,
    });

    booking.rentalTracking.currentLocation = toPoint(normalizedCoordinates, 'coordinates');
    booking.rentalTracking.lastLocationAt = new Date();
    booking.rentalTracking.lastClientTimestamp = safeCapturedAt;
    booking.rentalTracking.lastHeading = toFiniteNumber(heading, null);
    booking.rentalTracking.lastSpeed = toFiniteNumber(speed, null);
    booking.rentalTracking.lastAccuracyMeters = clampNonNegative(accuracyMeters, 0);
    booking.rentalTracking.trackingStatus = 'active';
    booking.rentalTracking.zoneStatus = evaluation.zoneStatus;
    booking.rentalTracking.matchedZoneName = evaluation.matchedZoneName;
    booking.rentalTracking.distanceFromHubMeters = evaluation.distanceFromHubMeters;
    booking.rentalTracking.geofenceRadiusMeters = evaluation.geofenceRadiusMeters;
    booking.rentalTracking.hubName = evaluation.hubName || cleanString(booking?.serviceLocation?.name);

    booking.rentalTracking.history = [
      ...booking.rentalTracking.history,
      {
        coordinates: normalizedCoordinates,
        capturedAt: safeCapturedAt,
        heading: toFiniteNumber(heading, null),
        speed: toFiniteNumber(speed, null),
        accuracyMeters: clampNonNegative(accuracyMeters, 0),
        zoneStatus: evaluation.zoneStatus,
      },
    ].slice(-TRACKING_HISTORY_LIMIT);

    const zoneAlertResult = upsertTrackingAlert({
      alerts: booking.rentalTracking.alerts,
      code: 'outside_zone',
      severity: 'critical',
      active: !evaluation.isInsideAllowedArea,
      message: evaluation.matchedZoneName
        ? `Renter moved outside the allowed zone near ${evaluation.matchedZoneName}.`
        : `Renter moved outside the allowed rental zone${evaluation.hubName ? ` near ${evaluation.hubName}` : ''}.`,
      metadata: {
        zoneStatus: evaluation.zoneStatus,
        matchedZoneName: evaluation.matchedZoneName,
        distanceFromHubMeters: evaluation.distanceFromHubMeters,
      },
    });
    booking.rentalTracking.alerts = zoneAlertResult.alerts;
    zoneAlertChanged = zoneAlertResult.changed;

    const availabilityAlertResult = upsertTrackingAlert({
      alerts: booking.rentalTracking.alerts,
      code: 'location_off',
      severity: 'warning',
      active: false,
      message: 'User location tracking has resumed.',
    });
    booking.rentalTracking.alerts = availabilityAlertResult.alerts;
    availabilityAlertChanged = availabilityAlertResult.changed;
  } else {
    booking.rentalTracking.trackingStatus = normalizedStatus;
    booking.rentalTracking.zoneStatus = 'unknown';
    booking.rentalTracking.lastClientTimestamp = safeCapturedAt;

    const availabilityAlertResult = upsertTrackingAlert({
      alerts: booking.rentalTracking.alerts,
      code: 'location_off',
      severity: normalizedStatus === 'tracking_stopped' ? 'critical' : 'warning',
      active: true,
      message:
        normalizedStatus === 'tracking_stopped'
          ? 'User tracking stopped while the rental booking is still active.'
          : 'User location is unavailable or permission was denied.',
      metadata: {
        trackingStatus: normalizedStatus,
      },
    });
    booking.rentalTracking.alerts = availabilityAlertResult.alerts;
    availabilityAlertChanged = availabilityAlertResult.changed;
  }

  await booking.save();

  const updatedBooking = await RentalBookingRequest.findById(booking._id)
    .populate('userId', 'name phone email')
    .populate('vehicleTypeId', 'name vehicleCategory image')
    .lean();

  const adminPayload = buildRentalTrackingAdminPayload(updatedBooking);
  emitToAdmins('rental:tracking:updated', adminPayload);

  if (zoneAlertChanged || availabilityAlertChanged) {
    emitToAdmins('rental:tracking:alert', adminPayload);
  }

  return adminPayload;
};
