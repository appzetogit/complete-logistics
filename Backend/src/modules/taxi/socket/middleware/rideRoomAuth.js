import { ensureRideParticipantAccess } from '../../services/rideService.js';

export const authorizeRideRoomAccess = async ({ socket, rideId }) =>
  ensureRideParticipantAccess({
    rideId,
    role: socket.auth.role,
    entityId: socket.auth.sub,
  });
