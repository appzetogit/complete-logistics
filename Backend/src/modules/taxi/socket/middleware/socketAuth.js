import { ApiError } from '../../../../utils/ApiError.js';
import { User } from '../../user/models/User.js';
import { verifyAccessToken } from '../../services/tokenService.js';
import { isTokenRevoked } from '../../middlewares/authMiddleware.js';

export const getIdentityFromSocket = (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    throw new ApiError(401, 'Socket token is required');
  }

  return verifyAccessToken(token);
};

export const attachSocketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      socket.auth = getIdentityFromSocket(socket);

      if (socket.auth.role === 'user') {
        const user = await User.findById(socket.auth.sub).select('active isActive deletedAt tokensRevokedAt').lean();

        if (!user || user.deletedAt || user.isActive === false || user.active === false) {
          throw new ApiError(401, 'User account is not active');
        }
        if (isTokenRevoked(socket.auth, user)) {
          throw new ApiError(401, 'You have logged out. Please log in again.');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  });
};
