import { ApiError } from '../../../../utils/ApiError.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';
import { Driver } from '../models/Driver.js';

// A driver may cancel an accepted (not yet started) ride, but only a limited
// number of times per IST day. Hitting the limit blocks them from going online
// or accepting/bidding on rides until the next IST midnight (or until an admin
// clears it). Rejecting a request and cancelling a scheduled ride do not count.

const IST_OFFSET_MS = 330 * 60 * 1000;
const DEFAULT_DAILY_CANCEL_LIMIT = 3;

export const istDateKey = (date = new Date()) =>
  new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

export const nextIstDayStart = (date = new Date()) => {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - IST_OFFSET_MS,
  );
};

// 0 turns the limit off (cancels are still counted, nobody is blocked).
export const getDailyCancelLimit = async () => {
  const settings = await getTransportRideSettings();
  const raw = settings.driver_daily_cancel_limit;
  const numeric = Number(raw);

  return raw !== undefined && String(raw).trim() !== '' && Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : DEFAULT_DAILY_CANCEL_LIMIT;
};

export const computeCancelStatus = ({ tracking, now = new Date(), limit = DEFAULT_DAILY_CANCEL_LIMIT }) => {
  const today = istDateKey(now);
  const count = tracking?.dateKey === today ? Math.max(0, Number(tracking.count || 0)) : 0;
  const blockedUntil =
    tracking?.blockedUntil && new Date(tracking.blockedUntil).getTime() > now.getTime()
      ? new Date(tracking.blockedUntil)
      : null;

  return {
    dateKey: today,
    count,
    limit,
    cancelsLeft: limit > 0 ? Math.max(0, limit - count) : null,
    blocked: Boolean(blockedUntil),
    blockedUntil,
  };
};

export const serializeCancelStatus = (status) => ({
  cancelLimit: status.limit,
  cancelsToday: status.count,
  cancelsLeft: status.cancelsLeft,
  cancelBlocked: status.blocked,
  blockedUntil: status.blockedUntil ? status.blockedUntil.toISOString() : null,
});

export const getDriverCancelStatus = async (driverOrTracking, { now = new Date(), limit } = {}) => {
  const resolvedLimit = limit ?? (await getDailyCancelLimit());
  const tracking = driverOrTracking?.cancelTracking ?? driverOrTracking;
  return computeCancelStatus({ tracking, now, limit: resolvedLimit });
};

/** Throws 403 while the driver is blocked for cancelling too often. */
export const assertDriverNotCancelBlocked = (driver, { now = new Date() } = {}) => {
  const until = driver?.cancelTracking?.blockedUntil;

  if (until && new Date(until).getTime() > now.getTime()) {
    throw new ApiError(
      403,
      'You have cancelled too many rides today and are blocked until the next day. Contact support if this is a mistake.',
      { code: 'DRIVER_CANCEL_BLOCKED', blockedUntil: new Date(until).toISOString() },
    );
  }
};

/**
 * Counts one driver cancel and blocks the driver when the daily limit is hit.
 * Returns the resulting status.
 */
export const registerDriverCancel = async ({ driverId, now = new Date(), deps = {} }) => {
  const DriverModel = deps.Driver || Driver;
  const limit = deps.limit ?? (await getDailyCancelLimit());
  const driver = await DriverModel.findById(driverId).select('cancelTracking');
  const before = computeCancelStatus({ tracking: driver?.cancelTracking, now, limit });
  const count = before.count + 1;
  const reachedLimit = limit > 0 && count >= limit;
  const blockedUntil = reachedLimit ? nextIstDayStart(now) : before.blockedUntil;

  const update = {
    'cancelTracking.dateKey': before.dateKey,
    'cancelTracking.count': count,
    'cancelTracking.lastCancelAt': now,
    'cancelTracking.blockedUntil': blockedUntil,
  };

  if (reachedLimit) {
    // Force offline. The open online session is dropped rather than merged
    // into today's active minutes, so being blocked cannot earn incentives.
    update.isOnline = false;
    update['incentiveTracking.currentOnlineStartedAt'] = null;
  }

  await DriverModel.updateOne({ _id: driverId }, { $set: update });

  return computeCancelStatus({
    tracking: { dateKey: before.dateKey, count, blockedUntil },
    now,
    limit,
  });
};

/** Admin: lift the block and reset today's count. */
export const clearDriverCancelBlock = async ({ driverId, deps = {} }) => {
  const DriverModel = deps.Driver || Driver;
  const limit = deps.limit ?? (await getDailyCancelLimit());
  const updated = await DriverModel.findOneAndUpdate(
    { _id: driverId, deletedAt: null },
    { $set: { 'cancelTracking.count': 0, 'cancelTracking.blockedUntil': null } },
    { returnDocument: 'after' },
  ).select('cancelTracking');

  if (!updated) {
    throw new ApiError(404, 'Driver not found');
  }

  return computeCancelStatus({ tracking: updated.cancelTracking, limit });
};
