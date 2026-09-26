export const RIDE_STATUS = Object.freeze({
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/// Live status of a job.
///
/// `ARRIVING` means the driver has reached the pickup; `ARRIVED` means they
/// have reached the drop. `GOODS_LOADED` and `GOODS_DELIVERED` apply to parcel
/// jobs only — they mark the two points where the driver must photograph the
/// consignment, and passenger rides skip straight past them.
export const RIDE_LIVE_STATUS = Object.freeze({
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ARRIVING: 'arriving',
  GOODS_LOADED: 'goods_loaded',
  STARTED: 'started',
  ARRIVED: 'arrived',
  GOODS_DELIVERED: 'goods_delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

/// The parcel-only steps, so callers can gate them without hardcoding strings.
export const PARCEL_ONLY_LIVE_STATUSES = Object.freeze([
  RIDE_LIVE_STATUS.GOODS_LOADED,
  RIDE_LIVE_STATUS.GOODS_DELIVERED,
]);

export const VEHICLE_TYPES = Object.freeze(['bike', 'auto', 'car']);

export const DISPATCH_RADII = Object.freeze([2500, 4000, 6000, 8000, 10000, 15000]);
export const DISPATCH_INTERCITY_RADII = Object.freeze([10000, 20000, 35000, 50000]);
export const DISPATCH_TOP_DRIVERS = 5;
export const DISPATCH_RETRY_DELAY_MS = 8000;
