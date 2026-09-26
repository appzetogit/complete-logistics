import { ApiError } from '../../../../utils/ApiError.js';
import { normalizePoint } from '../../../../utils/geo.js';
import { GoodsType } from '../../admin/models/GoodsType.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { startDispatchFlow } from '../../services/dispatchService.js';
import { Delivery } from '../models/Delivery.js';
import {
  createRideRecord,
  ensureRideParticipantAccess,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  listRideHistoryForIdentity,
  serializeRideRealtime,
} from '../../services/rideService.js';

const ensureParcelRide = (ride) => {
  if (!ride || String(ride.serviceType || ride.type || 'ride').toLowerCase() !== 'parcel') {
    throw new ApiError(404, 'Delivery not found');
  }

  return ride;
};

const normalizeVehicleLabel = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getVehicleTokens = (vehicle = {}) =>
  [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.icon_types,
    String(vehicle?.name || '').replace(/\s+/g, '_'),
  ]
    .map(normalizeVehicleLabel)
    .filter(Boolean);

const goodsTypeAllowsVehicle = (goodsType, vehicle) => {
  const allowedLabels = String(goodsType?.goods_types_for || goodsType?.goods_type_for || 'both')
    .split(',')
    .map(normalizeVehicleLabel)
    .filter(Boolean);

  if (!allowedLabels.length || allowedLabels.includes('both') || allowedLabels.includes('all')) {
    return true;
  }

  const tokens = getVehicleTokens(vehicle);
  return allowedLabels.some((label) => tokens.some((token) => token.includes(label) || label.includes(token)));
};

const ensureDeliveryVehicleAllowed = async ({ vehicleTypeId, parcel }) => {
  const category = String(parcel?.category || '').trim();

  if (!vehicleTypeId || !category) {
    return;
  }

  const [goodsType, vehicle] = await Promise.all([
    GoodsType.findOne({
      goods_type_name: { $regex: `^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      active: 1,
    })
      .select('goods_type_name goods_types_for goods_type_for')
      .lean(),
    Vehicle.findById(vehicleTypeId).select('name vehicle_type icon_types').lean(),
  ]);

  if (!goodsType || !vehicle) {
    return;
  }

  if (!goodsTypeAllowsVehicle(goodsType, vehicle)) {
    throw new ApiError(400, `${goodsType.goods_type_name || category} is not allowed for the selected vehicle type`);
  }
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceKm = (fromCoords = [], toCoords = []) => {
  if (!Array.isArray(fromCoords) || !Array.isArray(toCoords) || fromCoords.length < 2 || toCoords.length < 2) {
    return 0;
  }

  const [fromLng, fromLat] = fromCoords.map(Number);
  const [toLng, toLat] = toCoords.map(Number);
  if (![fromLng, fromLat, toLng, toLat].every(Number.isFinite)) {
    return 0;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/// Resolves the rider's chosen body height against the vehicle's configured
/// options. Returns null when nothing was chosen or the key is unknown, so a
/// stale key from an old app build cannot silently apply someone else's price.
const resolveLoadHeight = (vehicle = {}, loadHeightKey = '') => {
  const key = String(loadHeightKey || '').trim();
  if (!key) return null;

  const options = Array.isArray(vehicle?.load_height_options) ? vehicle.load_height_options : [];
  const match = options.find((option) => String(option?.key || '') === key);
  if (!match) return null;

  return {
    key: match.key,
    label: match.label || '',
    height_ft: Math.max(0, Number(match.height_ft || 0)),
    price: Math.max(0, Number(match.price || 0)),
  };
};

/// Resolves the rider's ticked add-ons the same way. Unknown keys are dropped
/// rather than trusted, and the catalog order is preserved so the fare
/// breakdown reads the same as the options screen.
const resolveExtras = (vehicle = {}, extraKeys = []) => {
  const wanted = new Set(
    (Array.isArray(extraKeys) ? extraKeys : []).map((key) => String(key || '').trim()).filter(Boolean),
  );
  if (!wanted.size) return [];

  const options = Array.isArray(vehicle?.extra_options) ? vehicle.extra_options : [];
  return options
    .filter((option) => wanted.has(String(option?.key || '')))
    .map((option) => ({
      key: option.key,
      label: option.label || '',
      price: Math.max(0, Number(option.price || 0)),
    }));
};

/// Detention terms are disclosed with the quote but never added to it — the
/// charge depends on how long loading actually takes, so it is settled at trip
/// completion. The rider and driver both see the terms up front.
const resolveDetentionTerms = (pricing = {}) => ({
  freeMinutes: Math.max(0, Number(pricing?.free_time || 0)),
  chargePerHour: Math.max(0, Number(pricing?.time_price || 0)),
});

const computeDeliveryFareBreakdown = ({
  vehicle = {},
  pickupCoords = [],
  dropCoords = [],
  loadHeightKey = '',
  extraKeys = [],
}) => {
  const pricing = vehicle?.delivery_distance_pricing || {};
  const enabled = Boolean(
    pricing?.enabled ||
    Number(pricing?.base_price || 0) > 0 ||
    Number(pricing?.distance_price || 0) > 0
  );

  const serviceTaxPercentage = Math.max(0, Number(vehicle?.service_tax || 0));
  const loadHeight = resolveLoadHeight(vehicle, loadHeightKey);
  const extras = resolveExtras(vehicle, extraKeys);
  const detention = resolveDetentionTerms(pricing);
  const distanceKm = Math.max(0, calculateDistanceKm(pickupCoords, dropCoords));
  const baseDistance = Math.max(0, Number(pricing?.base_distance ?? pricing?.free_distance ?? 0));

  // With distance pricing unconfigured there is no fare to quote. The rider's
  // selections still ride along so the driver is told what to bring even when
  // the operator prices the job off-platform.
  if (!enabled) {
    return {
      total: 0,
      subtotal: 0,
      distanceKm: roundCurrency(distanceKm),
      baseDistanceKm: roundCurrency(baseDistance),
      basePrice: 0,
      distanceCharge: 0,
      loadHeight,
      loadHeightCharge: 0,
      extras,
      extrasCharge: 0,
      detention,
      serviceTaxPercentage,
      serviceTaxAmount: 0,
      priced: false,
    };
  }

  const basePrice = Math.max(0, Number(pricing?.base_price || 0));
  const distancePrice = Math.max(0, Number(pricing?.distance_price || 0));
  const extraDistanceKm = Math.max(distanceKm - baseDistance, 0);
  const distanceCharge = extraDistanceKm * distancePrice;
  const loadHeightCharge = loadHeight ? loadHeight.price : 0;
  const extrasCharge = extras.reduce((sum, extra) => sum + extra.price, 0);
  const subtotal = basePrice + distanceCharge + loadHeightCharge + extrasCharge;
  const serviceTaxAmount = (subtotal * serviceTaxPercentage) / 100;

  return {
    total: roundCurrency(subtotal + serviceTaxAmount),
    subtotal: roundCurrency(subtotal),
    distanceKm: roundCurrency(distanceKm),
    baseDistanceKm: roundCurrency(baseDistance),
    basePrice: roundCurrency(basePrice),
    distanceCharge: roundCurrency(distanceCharge),
    loadHeight,
    loadHeightCharge: roundCurrency(loadHeightCharge),
    extras,
    extrasCharge: roundCurrency(extrasCharge),
    detention,
    serviceTaxPercentage: roundCurrency(serviceTaxPercentage),
    serviceTaxAmount: roundCurrency(serviceTaxAmount),
    priced: true,
  };
};

/// Fields the fare engine needs off a vehicle type. Kept in one place because
/// the quote and the booking must load exactly the same set — if they drift,
/// the rider gets quoted one price and charged another.
const DELIVERY_FARE_VEHICLE_FIELDS =
  'name delivery_distance_pricing service_tax load_height_options extra_options load_capacity_ton capacity_label';

/// Priced quote for a pickup/drop pair, used by the vehicle options screen
/// before the rider commits. Runs the identical breakdown the booking uses.
export const quoteDeliveryFare = async ({
  vehicleTypeId,
  pickup,
  drop,
  loadHeightKey,
  extraKeys,
  parcel,
}) => {
  if (!vehicleTypeId) {
    throw new ApiError(400, 'vehicleTypeId is required');
  }

  await ensureDeliveryVehicleAllowed({ vehicleTypeId, parcel });

  const vehicle = await Vehicle.findById(vehicleTypeId).select(DELIVERY_FARE_VEHICLE_FIELDS).lean();
  if (!vehicle) {
    throw new ApiError(404, 'Vehicle type not found');
  }

  const breakdown = computeDeliveryFareBreakdown({
    vehicle,
    pickupCoords: normalizePoint(pickup, 'pickup'),
    dropCoords: normalizePoint(drop, 'drop'),
    loadHeightKey,
    extraKeys,
  });

  return {
    vehicleTypeId: String(vehicle._id),
    vehicleName: vehicle.name || '',
    ...breakdown,
  };
};

export const serializeDeliveryRealtime = (ride) => {
  const serializedRide = serializeRideRealtime(ride);

  return {
    ...serializedRide,
    deliveryId: ride.deliveryId?._id ? String(ride.deliveryId._id) : ride.deliveryId ? String(ride.deliveryId) : null,
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    type: 'parcel',
    serviceType: 'parcel',
  };
};

export const createDeliveryRecord = async ({
  userId,
  pickup,
  drop,
  pickupAddress,
  dropAddress,
  fare,
  vehicleTypeId,
  vehicleTypeIds,
  vehicleIconType,
  vehicleIconUrl,
  paymentMethod,
  parcel,
  loadHeightKey,
  extraKeys,
}) => {
  await ensureDeliveryVehicleAllowed({ vehicleTypeId, parcel });
  const pickupCoords = normalizePoint(pickup, 'pickup');
  const dropCoords = normalizePoint(drop, 'drop');
  const vehicle = vehicleTypeId
    ? await Vehicle.findById(vehicleTypeId).select(DELIVERY_FARE_VEHICLE_FIELDS).lean()
    : null;
  const fareBreakdown = computeDeliveryFareBreakdown({
    vehicle,
    pickupCoords,
    dropCoords,
    loadHeightKey,
    extraKeys,
  });
  const resolvedFare = fareBreakdown.total > 0 ? fareBreakdown.total : Number(fare || 0);

  const ride = await createRideRecord({
    userId,
    pickupCoords,
    dropCoords,
    pickupAddress,
    dropAddress,
    fare: resolvedFare,
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    transport_type: 'delivery',
    serviceType: 'parcel',
    parcel: {
      ...(parcel || {}),
      loadHeight: fareBreakdown.loadHeight,
      extras: fareBreakdown.extras,
      detention: fareBreakdown.detention,
    },
  });

  await startDispatchFlow(ride);

  const detailedRide = await getRideDetails(ride._id);
  return serializeDeliveryRealtime(ensureParcelRide(detailedRide));
};

export const getActiveDeliveryForIdentity = async ({ role, entityId }) => {
  const ride = await getActiveRideForIdentity({ role, entityId });

  if (!ride) {
    return null;
  }

  if (String(ride.serviceType || ride.type || 'ride').toLowerCase() !== 'parcel') {
    return null;
  }

  return serializeDeliveryRealtime(ride);
};

export const getDeliveryById = async ({ deliveryId, role, entityId }) => {
  const delivery = await Delivery.findById(deliveryId).select('rideId');

  if (!delivery?.rideId) {
    throw new ApiError(404, 'Delivery not found');
  }

  await ensureRideParticipantAccess({ rideId: delivery.rideId, role, entityId });
  const ride = await getRideDetails(delivery.rideId);
  return serializeDeliveryRealtime(ensureParcelRide(ride));
};

export const listDeliveriesForIdentity = async ({ role, entityId, limit }) => {
  const { results: rides } = await listRideHistoryForIdentity({ role, entityId, limit });
  return rides
    .filter((ride) => String(ride.serviceType || ride.type || 'ride').toLowerCase() === 'parcel')
    .map((ride) => ({
      ...ride,
      type: 'parcel',
      serviceType: 'parcel',
    }));
};
