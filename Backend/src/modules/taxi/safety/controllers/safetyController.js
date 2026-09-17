import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { SafetyAlert } from '../../common/models/SafetyAlert.js';
import { Driver } from '../../driver/models/Driver.js';
import { Delivery } from '../../user/models/Delivery.js';
import { Ride } from '../../user/models/Ride.js';
import { User } from '../../user/models/User.js';
import { emitToAdmins } from '../../services/dispatchService.js';

const cleanString = (value = '') => String(value || '').trim();

const normalizeCoordinates = (value) => {
  if (Array.isArray(value) && value.length >= 2) {
    const [lng, lat] = value;
    if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
      return [Number(lng), Number(lat)];
    }
  }

  const nestedCoordinates = value?.coordinates;
  if (Array.isArray(nestedCoordinates) && nestedCoordinates.length >= 2) {
    const [lng, lat] = nestedCoordinates;
    if (Number.isFinite(Number(lng)) && Number.isFinite(Number(lat))) {
      return [Number(lng), Number(lat)];
    }
  }

  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude ?? value?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return [Number(lng), Number(lat)];
  }

  return null;
};

const serializeSafetyAlert = (alert = {}) => {
  const coordinates = Array.isArray(alert?.location?.coordinates) ? alert.location.coordinates : [];
  const [lng, lat] = coordinates;

  return {
    id: String(alert?._id || ''),
    incidentType: cleanString(alert?.incidentType || 'sos').toLowerCase(),
    status: cleanString(alert?.status || 'active').toLowerCase(),
    sourceApp: cleanString(alert?.sourceApp || '').toLowerCase(),
    serviceType: cleanString(alert?.serviceType || 'general').toLowerCase(),
    riderName: cleanString(alert?.riderName),
    riderPhone: cleanString(alert?.riderPhone),
    driverName: cleanString(alert?.driverName),
    driverPhone: cleanString(alert?.driverPhone),
    vehicleLabel: cleanString(alert?.vehicleLabel),
    tripCode: cleanString(alert?.tripCode),
    pickupAddress: cleanString(alert?.pickupAddress),
    dropAddress: cleanString(alert?.dropAddress),
    locationLabel: cleanString(alert?.locationLabel),
    location:
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? {
            lat: Number(lat),
            lng: Number(lng),
            coordinates: [Number(lng), Number(lat)],
          }
        : null,
    notes: cleanString(alert?.notes),
    createdAt: alert?.createdAt || null,
    updatedAt: alert?.updatedAt || null,
    resolvedAt: alert?.resolvedAt || null,
    rideId: alert?.rideId ? String(alert.rideId?._id || alert.rideId) : '',
    deliveryId: alert?.deliveryId ? String(alert.deliveryId?._id || alert.deliveryId) : '',
    userId: alert?.userId ? String(alert.userId?._id || alert.userId) : '',
    driverId: alert?.driverId ? String(alert.driverId?._id || alert.driverId) : '',
    logs: Array.isArray(alert?.logs)
      ? alert.logs.map((log) => ({
          id: String(log?._id || ''),
          actorRole: cleanString(log?.actorRole || 'system').toLowerCase(),
          message: cleanString(log?.message),
          createdAt: log?.createdAt || null,
        }))
      : [],
  };
};

const readRideContext = async ({ rideId, deliveryId }) => {
  let ride = null;
  let delivery = null;

  if (rideId) {
    ride = await Ride.findById(rideId)
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone vehicle')
      .lean();
  }

  if (deliveryId) {
    delivery = await Delivery.findById(deliveryId)
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone vehicle')
      .lean();
  }

  if (!delivery && ride?.deliveryId) {
    delivery = await Delivery.findById(ride.deliveryId)
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone vehicle')
      .lean();
  }

  if (!ride && delivery?.rideId) {
    ride = await Ride.findById(delivery.rideId)
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone vehicle')
      .lean();
  }

  return { ride, delivery };
};

const deriveServiceType = ({ requestedServiceType, ride, delivery }) => {
  const direct = cleanString(requestedServiceType).toLowerCase();
  if (['ride', 'parcel', 'intercity', 'general'].includes(direct)) {
    return direct;
  }

  const rideType = cleanString(ride?.serviceType || ride?.type).toLowerCase();
  if (['ride', 'parcel', 'intercity'].includes(rideType)) {
    return rideType;
  }

  if (delivery) {
    return 'parcel';
  }

  return 'general';
};

const createAlertRecord = async ({
  sourceApp,
  authId,
  rideId,
  deliveryId,
  serviceType,
  location,
  locationLabel,
  pickupAddress,
  dropAddress,
  notes,
  tripCode,
  vehicleLabel,
}) => {
  const { ride, delivery } = await readRideContext({ rideId, deliveryId });
  const actorUser = sourceApp === 'user'
    ? await User.findById(authId).select('name phone').lean()
    : ride?.userId || delivery?.userId || null;
  const actorDriver = sourceApp === 'driver'
    ? await Driver.findById(authId).select('name phone vehicle').lean()
    : ride?.driverId || delivery?.driverId || null;
  const coords =
    normalizeCoordinates(location)
    || normalizeCoordinates(delivery?.pickupLocation)
    || normalizeCoordinates(ride?.pickupLocation);

  const created = await SafetyAlert.create({
    sourceApp,
    serviceType: deriveServiceType({ requestedServiceType: serviceType, ride, delivery }),
    userId: sourceApp === 'user' ? authId : actorUser?._id || null,
    driverId: sourceApp === 'driver' ? authId : actorDriver?._id || null,
    rideId: ride?._id || rideId || null,
    deliveryId: delivery?._id || deliveryId || null,
    riderName: cleanString(actorUser?.name),
    riderPhone: cleanString(actorUser?.phone),
    driverName: cleanString(actorDriver?.name),
    driverPhone: cleanString(actorDriver?.phone),
    vehicleLabel: cleanString(vehicleLabel) || cleanString(actorDriver?.vehicle),
    tripCode:
      cleanString(tripCode)
      || cleanString(ride?.bookingId)
      || cleanString(ride?._id)
      || cleanString(delivery?._id),
    pickupAddress:
      cleanString(pickupAddress)
      || cleanString(delivery?.pickupAddress)
      || cleanString(ride?.pickupAddress),
    dropAddress:
      cleanString(dropAddress)
      || cleanString(delivery?.dropAddress)
      || cleanString(ride?.dropAddress),
    locationLabel:
      cleanString(locationLabel)
      || cleanString(delivery?.pickupAddress)
      || cleanString(ride?.pickupAddress),
    location: coords ? { type: 'Point', coordinates: coords } : undefined,
    notes: cleanString(notes),
    logs: [
      {
        actorRole: 'system',
        message: `SOS triggered from ${sourceApp} app`,
      },
    ],
  });

  return SafetyAlert.findById(created._id).lean();
};

export const triggerUserSosAlert = asyncHandler(async (req, res) => {
  const alert = await createAlertRecord({
    sourceApp: 'user',
    authId: req.auth.sub,
    rideId: cleanString(req.body?.rideId),
    deliveryId: cleanString(req.body?.deliveryId),
    serviceType: req.body?.serviceType,
    location: req.body?.location,
    locationLabel: req.body?.locationLabel,
    pickupAddress: req.body?.pickupAddress,
    dropAddress: req.body?.dropAddress,
    notes: req.body?.notes,
    tripCode: req.body?.tripCode,
    vehicleLabel: req.body?.vehicleLabel,
  });

  const payload = serializeSafetyAlert(alert);
  emitToAdmins('new_sos', payload);
  emitToAdmins('safety:alert:new', payload);

  res.json({ success: true, data: payload });
});

export const triggerDriverSosAlert = asyncHandler(async (req, res) => {
  const alert = await createAlertRecord({
    sourceApp: 'driver',
    authId: req.auth.sub,
    rideId: cleanString(req.body?.rideId),
    deliveryId: cleanString(req.body?.deliveryId),
    serviceType: req.body?.serviceType,
    location: req.body?.location,
    locationLabel: req.body?.locationLabel,
    pickupAddress: req.body?.pickupAddress,
    dropAddress: req.body?.dropAddress,
    notes: req.body?.notes,
    tripCode: req.body?.tripCode,
    vehicleLabel: req.body?.vehicleLabel,
  });

  const payload = serializeSafetyAlert(alert);
  emitToAdmins('new_sos', payload);
  emitToAdmins('safety:alert:new', payload);

  res.json({ success: true, data: payload });
});

export const listSafetyAlerts = asyncHandler(async (req, res) => {
  const status = cleanString(req.query?.status || 'active').toLowerCase();
  const page = Math.max(1, Number(req.query?.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 25)));
  const query = {};

  if (status && status !== 'all') {
    query.status = status;
  }

  const [results, total] = await Promise.all([
    SafetyAlert.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SafetyAlert.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      results: results.map(serializeSafetyAlert),
      paginator: {
        current_page: page,
        last_page: Math.max(1, Math.ceil(total / limit)),
        total,
      },
    },
  });
});

export const resolveSafetyAlert = asyncHandler(async (req, res) => {
  const alert = await SafetyAlert.findById(req.params.id);

  if (!alert) {
    res.status(404).json({
      success: false,
      message: 'Safety alert not found',
    });
    return;
  }

  alert.status = 'resolved';
  alert.resolvedAt = new Date();
  alert.resolvedByAdminId = cleanString(req.auth?.sub);
  alert.logs.push({
    actorRole: 'admin',
    message: cleanString(req.body?.note) || 'Incident marked as resolved by admin',
  });

  await alert.save();

  const payload = serializeSafetyAlert(alert.toObject());
  emitToAdmins('safety:alert:updated', payload);

  res.json({ success: true, data: payload });
});
