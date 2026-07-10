import { Server } from 'socket.io';
import { env } from '../../../config/env.js';
import { normalizePoint, toPoint } from '../../../utils/geo.js';
import { Driver } from '../driver/models/Driver.js';
import {
  broadcastSupportMessage,
  createSupportMessage,
  getSupportParticipantRoom,
  getSupportRoom,
  getSupportRoleRoom,
  markSupportMessagesAsRead,
  parseSupportConversationKey,
  setSupportChatServer,
} from '../chat/services/supportChatService.js';
import {
  addSocketSubscriptions,
  joinRideRoom,
  markDriverRejectedFromDispatch,
  notifyLateAvailableDriver,
  notifyRideAccepted,
  notifyRideBidUpdated,
  setSocketServer,
  startDispatchFlow,
} from '../services/dispatchService.js';
import { findZoneByPickup } from '../services/matchingService.js';
import { acceptRideAssignment, createRideRecord, getRideRoom, submitRideBid } from '../services/rideService.js';
import { SOCKET_EVENTS } from './events.js';
import { registerRideSocketHandlers } from './handlers/rideSocketHandler.js';
import { authorizeRideRoomAccess } from './middleware/rideRoomAuth.js';
import { attachSocketAuth } from './middleware/socketAuth.js';
import { clearDriverRoute } from './services/driverRouteService.js';
import { consumeScopedRateLimit } from '../middlewares/rateLimitMiddleware.js';

const DRIVER_LOCATION_WRITE_MIN_DISTANCE_METERS = 25;
const DRIVER_LOCATION_WRITE_MAX_INTERVAL_MS = 15000;
const DRIVER_ZONE_REFRESH_MIN_DISTANCE_METERS = 120;
const DRIVER_ZONE_REFRESH_MAX_INTERVAL_MS = 60000;
const driverLocationState = new Map();

const getSocketClientIp = (socket) => {
  const forwardedFor = socket.handshake.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return socket.handshake.address || socket.conn?.remoteAddress || 'unknown';
};

const toRadians = (value) => Number(value || 0) * (Math.PI / 180);

const getDistanceMeters = (first = [], second = []) => {
  const [firstLng, firstLat] = first;
  const [secondLng, secondLat] = second;

  if (![firstLng, firstLat, secondLng, secondLat].every((value) => Number.isFinite(Number(value)))) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(Number(secondLat) - Number(firstLat));
  const deltaLng = toRadians(Number(secondLng) - Number(firstLng));
  const startLat = toRadians(firstLat);
  const endLat = toRadians(secondLat);
  const haversine = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const onAsync = (socket, handler) => async (payload = {}) => {
  try {
    await handler(payload);
  } catch (error) {
    socket.emit('errorMessage', {
      message: error.message || 'Socket operation failed',
    });
  }
};

export const configureTaxiSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
      credentials: true,
    },
  });

  attachSocketAuth(io);
  setSocketServer(io);
  setSupportChatServer(io);

  io.on('connection', async (socket) => {
    const identity = socket.auth;

    addSocketSubscriptions(socket, { role: identity.role, entityId: identity.sub });

    socket.join(getSupportParticipantRoom(identity.role, identity.sub));
    socket.join(getSupportRoleRoom(identity.role));

    if (identity.role === 'driver') {
      await Driver.findByIdAndUpdate(identity.sub, { socketId: socket.id });
      const previousDriverState = driverLocationState.get(identity.sub) || {};
      driverLocationState.set(identity.sub, {
        ...previousDriverState,
        socketId: socket.id,
      });
      notifyLateAvailableDriver(identity.sub).catch((error) => {
        console.error('Failed to notify late-available driver on socket connect', error);
      });
    }

    socket.on('chat:join', ({ conversationKey }) => {
      if (conversationKey) {
        const parsed = parseSupportConversationKey(conversationKey);

        if (parsed) {
          for (const key of parsed.keys) {
            socket.join(getSupportRoom(key));
          }
          return;
        }

        socket.join(getSupportRoom(conversationKey));
      }
    });

    socket.on(
      'chat:send',
      onAsync(socket, async ({ message, receiverRole, receiverId, conversationKey }) => {
        let nextReceiverRole = receiverRole;
        let nextReceiverId = receiverId;

        if (identity.role === 'admin' && (!nextReceiverRole || !nextReceiverId) && conversationKey) {
          const parsed = parseSupportConversationKey(conversationKey);
          nextReceiverRole = parsed?.peerRole;
          nextReceiverId = parsed?.peerId;
        }

        const savedMessage = await createSupportMessage({
          senderRole: identity.role,
          senderId: identity.sub,
          receiverRole: nextReceiverRole,
          receiverId: nextReceiverId,
          conversationKey,
          message,
        });

        broadcastSupportMessage(savedMessage);
      }),
    );

    socket.on(
      'chat:read',
      onAsync(socket, async ({ conversationKey }) => {
        if (!conversationKey) {
          return;
        }

        await markSupportMessagesAsRead({
          role: identity.role,
          id: identity.sub,
          conversationKey,
        });
      }),
    );

    socket.on(
      'joinRide',
      onAsync(socket, async ({ rideId }) => {
        if (!rideId) {
          return;
        }

        await authorizeRideRoomAccess({ socket, rideId });
        joinRideRoom(socket, rideId);
      }),
    );

    registerRideSocketHandlers({ io, socket, onAsync });

    socket.on(
      'locationUpdate',
      onAsync(socket, async ({ coordinates }) => {
        if (identity.role !== 'driver') {
          return;
        }

        // Drivers push fresh GPS coordinates every few seconds so matching stays accurate.
        const normalizedCoords = normalizePoint(coordinates, 'coordinates');
        const now = Date.now();
        const previousDriverState = driverLocationState.get(identity.sub) || {};
        const distanceFromPrevious = Array.isArray(previousDriverState.coordinates)
          ? getDistanceMeters(previousDriverState.coordinates, normalizedCoords)
          : Number.POSITIVE_INFINITY;
        const timeSincePreviousWrite = now - Number(previousDriverState.updatedAt || 0);
        const shouldRefreshZone = !previousDriverState.zoneId ||
          distanceFromPrevious >= DRIVER_ZONE_REFRESH_MIN_DISTANCE_METERS ||
          now - Number(previousDriverState.zoneResolvedAt || 0) >= DRIVER_ZONE_REFRESH_MAX_INTERVAL_MS;
        const zone = shouldRefreshZone
          ? await findZoneByPickup(normalizedCoords)
          : (previousDriverState.zoneId ? { _id: previousDriverState.zoneId } : null);
        const nextZoneId = zone?._id ? String(zone._id) : null;
        const shouldWriteDriverState = !Array.isArray(previousDriverState.coordinates) ||
          distanceFromPrevious >= DRIVER_LOCATION_WRITE_MIN_DISTANCE_METERS ||
          timeSincePreviousWrite >= DRIVER_LOCATION_WRITE_MAX_INTERVAL_MS ||
          previousDriverState.socketId !== socket.id ||
          String(previousDriverState.zoneId || '') !== String(nextZoneId || '');

        if (shouldWriteDriverState) {
          await Driver.findByIdAndUpdate(identity.sub, {
            socketId: socket.id,
            location: toPoint(normalizedCoords, 'coordinates'),
            zoneId: zone?._id || null,
          });
        }

        driverLocationState.set(identity.sub, {
          coordinates: normalizedCoords,
          updatedAt: shouldWriteDriverState ? now : Number(previousDriverState.updatedAt || 0),
          zoneId: nextZoneId,
          zoneResolvedAt: shouldRefreshZone ? now : Number(previousDriverState.zoneResolvedAt || 0),
          socketId: socket.id,
        });
        notifyLateAvailableDriver(identity.sub).catch((error) => {
          console.error('Failed to notify late-available driver on location update', error);
        });
      }),
    );

    socket.on(
      'requestRide',
      onAsync(socket, async ({ pickup, drop, fare, estimatedDistanceMeters, estimatedDurationMinutes, vehicleTypeId, vehicleIconType, paymentMethod, serviceType, intercity }) => {
        if (identity.role !== 'user') {
          return;
        }

        const rateLimitOutcome = await consumeScopedRateLimit({
          scope: 'ride_create_socket',
          max: 10,
          windowMs: 10 * 60 * 1000,
          mode: 'auth_or_ip',
          parts: [identity.sub || `ip:${getSocketClientIp(socket)}`],
        });
        if (!rateLimitOutcome.allowed) {
          socket.emit('errorMessage', {
            message: 'Too many ride requests. Please try again later.',
          });
          return;
        }

        // Ride creation and dispatch share the same service path as the REST controller.
        const ride = await createRideRecord({
          userId: identity.sub,
          pickupCoords: normalizePoint(pickup, 'pickup'),
          dropCoords: normalizePoint(drop, 'drop'),
          fare: Number(fare || 0),
          estimatedDistanceMeters: Number(estimatedDistanceMeters || 0),
          estimatedDurationMinutes: Number(estimatedDurationMinutes || 0),
          vehicleTypeId,
          vehicleIconType,
          paymentMethod,
          serviceType,
          intercity,
        });

        joinRideRoom(socket, ride._id);
        await startDispatchFlow(ride);

        socket.emit('rideCreated', {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
          status: ride.status,
        });

        socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
        });
      }),
    );

    socket.on(
      'acceptRide',
      onAsync(socket, async ({ rideId }) => {
        if (identity.role !== 'driver' || !rideId) {
          return;
        }

        // First successful transaction wins; later accepts are rejected by the service layer.
        const ride = await acceptRideAssignment({ rideId, driverId: identity.sub });
        joinRideRoom(socket, ride._id);
        await notifyRideAccepted(ride);

        const acceptedPayload = {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
          status: ride.status,
          liveStatus: ride.liveStatus,
          acceptedAt: ride.acceptedAt,
        };

        socket.emit('rideAccepted', acceptedPayload);
        socket.emit(SOCKET_EVENTS.RIDE_STATE, acceptedPayload);
        socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
        });
      }),
    );

    socket.on(
      'submitRideBid',
      onAsync(socket, async ({ rideId, bidFare }) => {
        if (identity.role !== 'driver' || !rideId) {
          return;
        }

        const result = await submitRideBid({
          rideId,
          driverId: identity.sub,
          bidFare,
        });

        socket.emit('rideBidSubmitted', {
          rideId: String(rideId),
          bid: result.bid,
        });

        await notifyRideBidUpdated(result);
      }),
    );

    socket.on('rejectRide', ({ rideId }) => {
      if (identity.role !== 'driver' || !rideId) {
        return;
      }

      markDriverRejectedFromDispatch(rideId, identity.sub).catch((error) => {
        console.error('Failed to mark driver rejection from dispatch', error);
      });
      socket.to(getRideRoom(rideId)).emit('driverRejectedRide', {
        rideId,
        driverId: identity.sub,
      });
    });

    socket.on('disconnect', async () => {
      if (identity.role === 'driver') {
        clearDriverRoute(identity.sub);
        const previousDriverState = driverLocationState.get(identity.sub);
        if (previousDriverState) {
          driverLocationState.set(identity.sub, {
            ...previousDriverState,
            socketId: null,
          });
        }
        await Driver.findByIdAndUpdate(identity.sub, { socketId: null });
      }
    });
  });

  return io;
};
