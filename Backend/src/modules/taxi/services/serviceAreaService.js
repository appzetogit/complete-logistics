import mongoose from 'mongoose';
import { ServiceLocation } from '../admin/models/ServiceLocation.js';
import { Zone } from '../driver/models/Zone.js';
import { Ride } from '../user/models/Ride.js';
import { User } from '../user/models/User.js';
import { findZoneByPickup } from './matchingService.js';

/*
 * Which city (service location) a point belongs to. Used only to label records (ride, rider, driver) for the
 * state-wise admin view; it never feeds dispatch or pricing.
 */

const NEAREST_LOCATION_MAX_METERS = 150 * 1000;

const asObjectId = (value) => {
  const text = String(value?._id || value || '').trim();
  return mongoose.isValidObjectId(text) ? new mongoose.Types.ObjectId(text) : null;
};

/** The service location for a point [lng, lat]: explicit id, then the zone (id or the one containing the point), then the nearest city. */
export const resolveAreaLocationId = async ({ coordinates, zoneId = null, serviceLocationId = null } = {}) => {
  const explicit = asObjectId(serviceLocationId);
  if (explicit) return explicit;

  const knownZone = asObjectId(zoneId);
  if (knownZone) {
    const zone = await Zone.findById(knownZone).select('service_location_id').lean();
    if (zone?.service_location_id) return zone.service_location_id;
  }

  const point = Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every((n) => Number.isFinite(Number(n)))
    ? coordinates.map(Number)
    : null;
  if (!point) return null;

  const containing = await findZoneByPickup(point).catch(() => null);
  if (containing?.service_location_id) return containing.service_location_id;

  const nearest = await ServiceLocation.findOne({
    location: { $near: { $geometry: { type: 'Point', coordinates: point }, $maxDistance: NEAREST_LOCATION_MAX_METERS } },
  })
    .select('_id')
    .lean()
    .catch(() => null);
  return nearest?._id || null;
};

/** Labels a new ride (and a rider who has no city yet) with the city of its pickup. Never throws. */
export const tagRideArea = async ({ ride, userId, zoneId = null, serviceLocationId = null }) => {
  try {
    const areaId = await resolveAreaLocationId({
      coordinates: ride?.pickupLocation?.coordinates,
      zoneId,
      serviceLocationId,
    });
    if (!areaId) return null;

    await Ride.updateOne({ _id: ride._id }, { $set: { area_location_id: areaId } });
    if (ride.set) ride.set('area_location_id', areaId);
    await User.updateOne({ _id: userId, area_location_id: null }, { $set: { area_location_id: areaId } });
    return areaId;
  } catch (error) {
    console.error('[service-area] could not tag ride', String(ride?._id || ''), error?.message || error);
    return null;
  }
};
