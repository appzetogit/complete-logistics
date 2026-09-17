export const SOCKET_EVENTS = Object.freeze({
  ERROR: 'errorMessage',
  RIDE_JOIN: 'ride:join',
  RIDE_REJOIN_CURRENT: 'ride:rejoin-current',
  RIDE_JOINED: 'ride:joined',
  RIDE_STATE: 'ride:state',
  RIDE_STATUS_UPDATE: 'ride:status:update',
  RIDE_STATUS_UPDATED: 'ride:status:updated',
  RIDE_DRIVER_LOCATION_UPDATE: 'ride:driver-location:update',
  RIDE_DRIVER_LOCATION_UPDATED: 'ride:driver-location:updated',
  RIDE_DRIVER_ROUTE_UPDATED: 'ride:driver-route:updated',
  RIDE_MESSAGE_SEND: 'ride:message:send',
  RIDE_MESSAGE_NEW: 'ride:message:new',
});
