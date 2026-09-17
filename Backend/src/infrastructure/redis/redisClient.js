import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { env } from '../../config/env.js';

let redisClient = null;
let redisConnectPromise = null;
let lastRedisConnectFailureAt = 0;
const REDIS_RETRY_COOLDOWN_MS = 30_000;

const withTimeout = async (promise, timeoutMs, label = 'Redis command') => {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const attachRedisEventLogging = (client) => {
  client.on('connect', () => {
    console.log('[redis] connected');
  });

  client.on('error', (error) => {
    console.error('[redis] client error', error?.message || error);
  });

  client.on('reconnecting', () => {
    console.warn('[redis] reconnecting');
  });

  client.on('ready', () => {
    console.log('[redis] ready');
  });

  client.on('end', () => {
    console.warn('[redis] connection closed');
  });
};

export const isRedisEnabled = () => Boolean(env.redis.enabled && env.redis.url);

export const getRedisClient = () => {
  if (!isRedisEnabled()) {
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({
      url: env.redis.url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: env.redis.connectTimeoutMs,
        reconnectStrategy: () => false,
        keepAlive: 5000, // Sends TCP keep-alive probes to prevent idle connection termination
      },
    });
    attachRedisEventLogging(redisClient);
  }

  return redisClient;
};

export const connectRedis = async () => {
  const client = getRedisClient();

  if (!client) {
    return null;
  }

  if (client.isReady) {
    return client;
  }

  if (lastRedisConnectFailureAt && Date.now() - lastRedisConnectFailureAt < REDIS_RETRY_COOLDOWN_MS) {
    return null;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = client.connect()
      .catch((error) => {
        lastRedisConnectFailureAt = Date.now();
        console.error('[redis] initial connect failed', error?.message || error);

        try {
          client.removeAllListeners();
          client.destroy();
        } catch {}

        redisClient = null;
        return null;
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }

  const connectedClient = await redisConnectPromise;
  return connectedClient?.isReady ? connectedClient : null;
};

export const getRedisStatus = () => {
  const client = getRedisClient();

  return {
    enabled: isRedisEnabled(),
    configured: Boolean(env.redis.url),
    ready: Boolean(client?.isReady),
    open: Boolean(client?.isOpen),
  };
};

/**
 * Socket.IO cross-process broadcasting. Without this, an emit from one worker
 * never reaches sockets connected to another worker, so any deploy running more
 * than one Node process silently drops half its realtime events.
 *
 * Uses its own pub/sub connections (not the shared command client) because the
 * shared one is deliberately configured to give up on reconnect; a dead pub/sub
 * link would instead stop broadcasts with no visible error.
 */
export const createSocketAdapter = async () => {
  if (!isRedisEnabled()) {
    return null;
  }

  try {
    const pubClient = createClient({
      url: env.redis.url,
      socket: {
        connectTimeout: env.redis.connectTimeoutMs,
        keepAlive: 5000,
        reconnectStrategy: (retries) => Math.min(200 * (retries + 1), 5000),
      },
    });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (error) => console.error('[redis][socket-pub]', error?.message || error));
    subClient.on('error', (error) => console.error('[redis][socket-sub]', error?.message || error));

    await Promise.all([pubClient.connect(), subClient.connect()]);

    return createAdapter(pubClient, subClient);
  } catch (error) {
    console.error('[redis] socket adapter unavailable', error?.message || error);
    return null;
  }
};

export const runRedisCommand = async (executor, { label = 'Redis command' } = {}) => {
  if (!isRedisEnabled()) {
    return { ok: false, reason: 'disabled', value: null };
  }

  try {
    const client = await withTimeout(connectRedis(), env.redis.connectTimeoutMs, `${label} connect`);
    if (!client?.isReady) {
      return { ok: false, reason: 'not_ready', value: null };
    }

    const value = await withTimeout(executor(client), env.redis.commandTimeoutMs, label);
    return { ok: true, reason: '', value };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || 'redis_error',
      value: null,
    };
  }
};
