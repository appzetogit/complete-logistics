export const RIDE_STATUS = Object.freeze({
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const RIDE_LIVE_STATUS = Object.freeze({
  SEARCHING: 'searching',
  ACCEPTED: 'accepted',
  ARRIVING: 'arriving',
  STARTED: 'started',
  ARRIVED: 'arrived',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const VEHICLE_TYPES = Object.freeze(['bike', 'auto', 'car']);

export const DISPATCH_RADII = Object.freeze([2500, 4000, 6000, 8000, 10000, 15000]);
export const DISPATCH_INTERCITY_RADII = Object.freeze([10000, 20000, 35000, 50000]);
export const DISPATCH_TOP_DRIVERS = 5;
export const DISPATCH_RETRY_DELAY_MS = 8000;
