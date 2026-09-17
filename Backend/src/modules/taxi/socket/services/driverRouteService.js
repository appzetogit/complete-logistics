import simplify from 'simplify-js';
import { getFirebaseDatabase, firebaseServerTimestamp } from '../../../../config/firebase.js';
import { SOCKET_EVENTS } from '../events.js';
import { getRideRoom } from '../../services/rideService.js';

const SIMPLIFY_INTERVAL_MS = 3_000;
const ROUTE_TOLERANCE = 0.0001;
const FIREBASE_WRITE_INTERVAL_MS = 10_000;

const driverRouteBuffers = new Map();
const driverFirebaseWriteTimestamps = new Map();
const driverSimplifyTimestamps = new Map();

const toRoutePoint = (coordinates) => ({
  x: Number(coordinates[0]),
  y: Number(coordinates[1]),
});

const shouldSimplifyRoute = (driverId) => {
  const now = Date.now();
  const lastSimplifiedAt = driverSimplifyTimestamps.get(driverId) || 0;

  if (now - lastSimplifiedAt < SIMPLIFY_INTERVAL_MS) {
    return false;
  }

  driverSimplifyTimestamps.set(driverId, now);
  return true;
};

const maybeWriteRouteToFirebase = ({ driverId, points }) => {
  const now = Date.now();
  const lastWriteAt = driverFirebaseWriteTimestamps.get(driverId) || 0;

  if (now - lastWriteAt < FIREBASE_WRITE_INTERVAL_MS) {
    return;
  }

  driverFirebaseWriteTimestamps.set(driverId, now);

  const database = getFirebaseDatabase();

  if (!database) {
    return;
  }

  database
    .ref(`rides/${driverId}/route`)
    .set({
      points,
      updatedAt: firebaseServerTimestamp(),
    })
    .catch((error) => {
      console.error(`Firebase route sync failed for driver ${driverId}:`, error.message);
    });
};

export const updateDriverRoute = ({ io, rideId, driverId, coordinates }) => {
  const routePoint = toRoutePoint(coordinates);
  const currentBuffer = driverRouteBuffers.get(driverId) || [];
  currentBuffer.push(routePoint);

  // RDP is intentionally batched so 2-3 second GPS pings stay cheap.
  const nextBuffer = shouldSimplifyRoute(driverId)
    ? simplify(currentBuffer, ROUTE_TOLERANCE, true)
    : currentBuffer;

  driverRouteBuffers.set(driverId, nextBuffer);

  const payload = {
    rideId: String(rideId),
    driverId: String(driverId),
    points: nextBuffer,
    updatedAt: new Date().toISOString(),
  };

  io.to(getRideRoom(rideId)).emit(SOCKET_EVENTS.RIDE_DRIVER_ROUTE_UPDATED, payload);
  // Firebase is best-effort; never hold up the socket location update path.
  setImmediate(() => maybeWriteRouteToFirebase({ driverId, points: nextBuffer }));

  return payload;
};

export const clearDriverRoute = (driverId) => {
  driverRouteBuffers.delete(driverId);
  driverFirebaseWriteTimestamps.delete(driverId);
  driverSimplifyTimestamps.delete(driverId);
};
