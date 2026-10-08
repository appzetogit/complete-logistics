import { createDefaultBusinessSettings } from '../../admin/data/defaultBusinessSettings.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { getOrLoadCachedValue } from '../../../../utils/cache.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { Ride } from '../models/Ride.js';
import { User } from '../models/User.js';

// "First N completed rides are free" (rides and goods both count).
//
// Everything is behind free_rides.enabled, which defaults to off. The counter
// moves on completion, not on creation, so cancelled rides never use up a free
// ride. Settings live in AdminBusinessSetting.free_rides and are editable via
// PATCH /admin/general-settings/free_rides.

const SETTINGS_CACHE_TTL_MS = 30_000;
const FREE_RIDES_CACHE_KEY = 'cache:settings:free_rides';
const defaultFreeRideSettings = createDefaultBusinessSettings().free_rides || {};

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());

const toNonNegativeInteger = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.floor(numericValue) : fallback;
};

const toNonNegativeNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
};

export const normalizeFreeRideSettings = (raw = {}) => {
  const merged = { ...defaultFreeRideSettings, ...(raw || {}) };

  return {
    enabled: isTruthy(merged.enabled),
    limit: toNonNegativeInteger(merged.limit, 3),
    // Fares are client-supplied for plain rides, so a free ride above this cap
    // is charged normally instead of being covered. 0 means no cap.
    maxFare: toNonNegativeNumber(merged.max_fare, 500),
  };
};

export const getFreeRideSettings = async () =>
  getOrLoadCachedValue(FREE_RIDES_CACHE_KEY, {
    ttlMs: SETTINGS_CACHE_TTL_MS,
    load: async () => {
      const businessSettings = await AdminBusinessSetting.findOne({ scope: 'default' })
        .select('free_rides')
        .lean();

      return normalizeFreeRideSettings(businessSettings?.free_rides);
    },
  });

export const buildFreeRidesSummary = ({ settings, used = 0 }) => {
  const limit = Number(settings?.limit || 0);
  const safeUsed = Math.max(0, Number(used || 0));

  return {
    enabled: Boolean(settings?.enabled),
    limit,
    used: safeUsed,
    left: Math.max(0, limit - safeUsed),
    // A ride whose fare is above this is NOT free (0 = no cap).
    maxFare: Math.max(0, Number(settings?.maxFare || 0)),
  };
};

export const getFreeRidesSummaryForUser = async (userOrId) => {
  const settings = await getFreeRideSettings();
  let used = 0;

  if (settings.enabled) {
    if (userOrId && typeof userOrId === 'object' && 'freeRidesUsed' in userOrId) {
      used = userOrId.freeRidesUsed;
    } else if (userOrId) {
      const user = await User.findById(userOrId._id || userOrId).select('freeRidesUsed').lean();
      used = user?.freeRidesUsed;
    }
  }

  return buildFreeRidesSummary({ settings, used });
};

const ACTIVE_RIDE_STATUSES = [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING];

/**
 * Decides whether a ride being created right now is free.
 * Returns { covered:false } or { covered:true, fareCovered, freeRidesUsedBefore }.
 *
 * Free rides already booked but not yet completed count against the limit, so
 * a user cannot queue many scheduled rides while their counter is still 0.
 */
export const resolveFreeRideForNewRide = async ({ user, fare, deps = {} }) => {
  const getSettings = deps.getSettings || getFreeRideSettings;
  const countOutstanding =
    deps.countOutstanding ||
    ((userId) =>
      Ride.countDocuments({
        userId,
        'freeRide.covered': true,
        'freeRide.consumedAt': null,
        status: { $in: ACTIVE_RIDE_STATUSES },
      }));

  const settings = await getSettings();
  if (!settings.enabled || settings.limit <= 0) {
    return { covered: false };
  }

  const used = Math.max(0, Number(user?.freeRidesUsed || 0));
  if (used >= settings.limit) {
    return { covered: false };
  }

  const safeFare = Number(fare);
  if (!Number.isFinite(safeFare) || safeFare < 0) {
    return { covered: false };
  }

  if (settings.maxFare > 0 && safeFare > settings.maxFare) {
    return { covered: false };
  }

  const outstanding = await countOutstanding(user._id);
  if (used + outstanding >= settings.limit) {
    return { covered: false };
  }

  return {
    covered: true,
    fareCovered: safeFare,
    freeRidesUsedBefore: used,
  };
};

/**
 * Counts a completed free ride once. The ride is flagged first with an atomic
 * compare-and-set, so repeated completion calls cannot increment twice; if the
 * increment itself fails the flag is rolled back so a retry can succeed.
 */
export const consumeFreeRide = async ({ ride, deps = {} }) => {
  if (!ride?.freeRide?.covered || !ride?._id || !ride?.userId) {
    return false;
  }

  const RideModel = deps.Ride || Ride;
  const UserModel = deps.User || User;

  const claimed = await RideModel.updateOne(
    { _id: ride._id, 'freeRide.covered': true, 'freeRide.consumedAt': null },
    { $set: { 'freeRide.consumedAt': new Date() } },
  );

  if (!claimed?.modifiedCount) {
    return false;
  }

  try {
    await UserModel.updateOne({ _id: ride.userId }, { $inc: { freeRidesUsed: 1 } });
  } catch (error) {
    await RideModel.updateOne(
      { _id: ride._id },
      { $set: { 'freeRide.consumedAt': null } },
    ).catch(() => null);
    throw error;
  }

  return true;
};
