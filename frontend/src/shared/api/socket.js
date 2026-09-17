import { io } from 'socket.io-client';
import { BACKEND_ORIGIN } from './runtimeConfig';

const SOCKET_ORIGIN = import.meta.env.VITE_SOCKET_URL || BACKEND_ORIGIN;

const isLocalLikeHostname = (hostname = '') => {
  const value = String(hostname || '').trim().toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
};

const shouldPreferWebsocketFirst = () => {
  try {
    const socketUrl = new URL(
      SOCKET_ORIGIN,
      typeof window !== 'undefined' ? window.location.origin : undefined,
    );

    if (isLocalLikeHostname(socketUrl.hostname)) {
      return true;
    }
  } catch {
    // Fall back to current window detection below.
  }

  if (typeof window !== 'undefined' && isLocalLikeHostname(window.location.hostname)) {
    return true;
  }

  return false;
};

const decodeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
};

const getTokenPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(atob(decodeBase64Url(payload)));
    if (decoded && typeof decoded.exp === 'number') {
      const isExpired = Date.now() / 1000 >= decoded.exp;
      if (isExpired) {
        return null;
      }
    }
    return decoded;
  } catch {
    return null;
  }
};

const getSessionItem = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const DRIVER_PORTAL_ROLES = new Set([
  'driver',
  'owner',
  'pooling_driver',
  'bus_driver',
  'service_center',
  'service_center_staff',
]);

const getStoredTokenByRole = (role) => {
  const normalizedRole = String(role || '').toLowerCase();
  const entries = (
    normalizedRole === 'driver' || normalizedRole === 'owner'
      ? [
          getSessionItem('driverToken'),
          getSessionItem('token'),
          localStorage.getItem('driverToken'),
          localStorage.getItem('token'),
        ]
      : [
          localStorage.getItem(`${role}Token`),
          localStorage.getItem('token'),
        ]
  ).filter(Boolean);

  return entries.find((token) => {
    const tokenRole = String(getTokenPayload(token)?.role || '').toLowerCase();

    if ((normalizedRole === 'driver' || normalizedRole === 'owner') && DRIVER_PORTAL_ROLES.has(tokenRole)) {
      return true;
    }

    return tokenRole === normalizedRole;
  }) || null;
};

const resolveTokenForRole = (role) => {
  const normalizedRole = String(role || '').toLowerCase();
  const adminToken = getStoredTokenByRole('admin') || localStorage.getItem('adminToken');
  const userToken = getStoredTokenByRole('user');
  const driverToken = getStoredTokenByRole('driver');
  const ownerToken = getStoredTokenByRole('owner');

  if (normalizedRole === 'admin') {
    return adminToken;
  }

  if (normalizedRole === 'driver') {
    return driverToken || ownerToken;
  }

  if (normalizedRole === 'owner') {
    return ownerToken || driverToken;
  }

  if (normalizedRole === 'user') {
    return userToken;
  }

  return userToken || driverToken || ownerToken || adminToken || null;
};

class SocketService {
  constructor() {
    this.socket = null;
    this.currentToken = null;
    this.listeners = new Map();
  }

  attachRegisteredListeners() {
    if (!this.socket) {
      return;
    }

    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((callback) => {
        this.socket.on(event, callback);
      });
    });
  }

  connect(options = {}) {
    const token = options.token || resolveTokenForRole(options.role);

    if (!token) {
      console.warn('[socket] missing token for role', options.role || 'unknown');
      return null;
    }

    if (this.socket && this.currentToken === token) {
      if (!this.socket.connected) {
        console.info('[socket] reconnecting existing socket', {
          role: options.role || 'unknown',
          socketId: this.socket.id || null,
        });
        this.socket.auth = { ...(this.socket.auth || {}), token };
        this.socket.connect();
      }

      console.info('[socket] reusing existing connection', {
        role: options.role || 'unknown',
        socketId: this.socket.id || null,
        connected: this.socket.connected,
      });
      return this.socket;
    }

    if (this.socket) {
      console.info('[socket] disconnecting previous socket before reconnect');
      this.socket.disconnect();
    }

    this.currentToken = token;
    const preferWebsocketFirst = shouldPreferWebsocketFirst();
    this.socket = io(SOCKET_ORIGIN, {
      auth: { token },
      // Prefer WebSocket first everywhere so realtime-heavy ride flows do not
      // pay the polling handshake cost on every connection.
      transports: preferWebsocketFirst ? ['websocket', 'polling'] : ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 750,
      reconnectionDelayMax: 2500,
      timeout: 10000,
    });
    this.attachRegisteredListeners();

    this.socket.on('connect', () => {
      console.info('[socket] connected', {
        role: options.role || 'unknown',
        socketId: this.socket?.id || null,
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[socket] connect_error', {
        role: options.role || 'unknown',
        message: error?.message || 'unknown error',
        description: error?.description || null,
        context: error?.context || null,
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('[socket] disconnected', {
        role: options.role || 'unknown',
        reason,
      });
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentToken = null;
    }
  }

  on(event, callback) {
    if (!event || typeof callback !== 'function') {
      return;
    }

    const callbacks = this.listeners.get(event) || new Set();
    callbacks.add(callback);
    this.listeners.set(event, callbacks);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (!event) {
      return;
    }

    if (callback) {
      const callbacks = this.listeners.get(event);
      callbacks?.delete(callback);

      if (callbacks?.size === 0) {
        this.listeners.delete(event);
      }
    } else {
      this.listeners.delete(event);
    }

    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
        return;
      }

      this.socket.off(event);
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }
}

export const socketService = new SocketService();
