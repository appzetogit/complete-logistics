import { createClient } from 'redis';
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
