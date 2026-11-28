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

// A city that is in a state. A country-wide or state-less location ('India') cannot answer 'which state?'.
const hasState = async (locationId) => Boolean(locationId && (await ServiceLocation.exists({ _id: locationId, state_id: { $ne: null } })));

/**
 * The service location for a point [lng, lat]. A location that belongs to a state wins: the explicit id, then the
 * zone (id or the one containing the point), then the nearest city that has a state. A location without a state
 * (a country-wide 'India' zone) is only the last resort, so records are labelled with a real state whenever one is near.
 */
export const resolveAreaLocationId = async ({ coordinates, zoneId = null, serviceLocationId = null } = {}) => {
  let fallback = null;

  const explicit = asObjectId(serviceLocationId);
  if (explicit) {
    if (await hasState(explicit)) return explicit;
    fallback = explicit;
  }

  const knownZone = asObjectId(zoneId);
  if (knownZone) {
    const zone = await Zone.findById(knownZone).select('service_location_id').lean();
    if (zone?.service_location_id) {
      if (await hasState(zone.service_location_id)) return zone.service_location_id;
      fallback = fallback || zone.service_location_id;
    }
  }

  const point = Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every((n) => Number.isFinite(Number(n)))
    ? coordinates.map(Number)
    : null;
  if (!point) return fallback;

  const containing = await findZoneByPickup(point).catch(() => null);
  if (containing?.service_location_id) {
    if (await hasState(containing.service_location_id)) return containing.service_location_id;
    fallback = fallback || containing.service_location_id;
  }

  const nearest = await ServiceLocation.findOne({
    state_id: { $ne: null },
    location: { $near: { $geometry: { type: 'Point', coordinates: point }, $maxDistance: NEAREST_LOCATION_MAX_METERS } },
  })
    .select('_id')
    .lean()
    .catch(() => null);
  return nearest?._id || fallback || null;
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
