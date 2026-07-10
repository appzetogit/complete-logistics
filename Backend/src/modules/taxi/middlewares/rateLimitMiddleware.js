import crypto from 'node:crypto';
import { runRedisCommand } from '../../../infrastructure/redis/redisClient.js';
import { env } from '../../../config/env.js';

const fallbackCounters = new Map();

const nowMs = () => Date.now();

const cleanupFallbackCounter = (key) => {
  const current = fallbackCounters.get(key);
  if (!current) {
    return;
  }

  if (current.expiresAt <= nowMs()) {
    fallbackCounters.delete(key);
  }
};

const readFallbackCounter = (key, windowMs) => {
  cleanupFallbackCounter(key);

  const current = fallbackCounters.get(key);
  if (!current) {
    const nextValue = {
      count: 1,
      expiresAt: nowMs() + windowMs,
    };
    fallbackCounters.set(key, nextValue);
    return nextValue;
  }

  current.count += 1;
  return current;
};

const sha1 = (value) => crypto.createHash('sha1').update(String(value || '')).digest('hex');

const toCleanString = (value) => String(value || '').trim();

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
};

const resolveIdentifierParts = (req, mode = 'ip') => {
  const ip = getClientIp(req);
  const authId = toCleanString(req.auth?.sub);
  const phone = toCleanString(
    req.body?.phone ||
    req.body?.mobile ||
    req.body?.driverPhone ||
    req.query?.phone,
  ).replace(/\D/g, '');
  const email = toCleanString(req.body?.email || req.query?.email).toLowerCase();
  const rideId = toCleanString(req.params?.rideId || req.body?.rideId);

  if (mode === 'auth_or_ip') {
    return [authId || `ip:${ip}`, rideId];
  }

  if (mode === 'phone_or_ip') {
    return [phone || email || `ip:${ip}`];
  }

  if (mode === 'email_or_ip') {
    return [email || `ip:${ip}`];
  }

  return [ip];
};

const buildRateLimitKey = (req, scope, mode) => {
  const rawParts = resolveIdentifierParts(req, mode).filter(Boolean).join(':');
  return `ratelimit:${scope}:${mode}:${sha1(rawParts)}`;
};

export const buildScopedRateLimitKey = ({ scope, mode = 'custom', parts = [] } = {}) => {
  const rawParts = (Array.isArray(parts) ? parts : [parts])
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(':');

  return `ratelimit:${scope}:${mode}:${sha1(rawParts)}`;
};

const formatRetryAfterSeconds = (expiresAtMs) => {
  const diffMs = Math.max(0, Number(expiresAtMs || 0) - nowMs());
  return Math.max(1, Math.ceil(diffMs / 1000));
};

const applyFallbackRateLimit = ({ key, max, windowMs }) => {
  const value = readFallbackCounter(key, windowMs);
  return {
    count: value.count,
    allowed: value.count <= max,
    retryAfterSeconds: formatRetryAfterSeconds(value.expiresAt),
    source: 'memory',
  };
};

const applyRedisRateLimit = async ({ key, max, windowMs }) => {
  const result = await runRedisCommand(async (client) => {
    const count = await client.incr(key);
    if (count === 1) {
      await client.pExpire(key, windowMs);
    }

    const ttlMs = await client.pTTL(key);
    return {
      count,
      ttlMs,
    };
  }, { label: `rate limit ${key}` });

  if (!result.ok) {
    return null;
  }

  const ttlMs = Number(result.value?.ttlMs || windowMs);

  return {
    count: Number(result.value?.count || 0),
    allowed: Number(result.value?.count || 0) <= max,
    retryAfterSeconds: Math.max(1, Math.ceil(Math.max(1, ttlMs) / 1000)),
    source: 'redis',
  };
};

const defaultMessage = 'Too many requests. Please try again later.';

const consumeRateLimitKey = async ({ key, max, windowMs, mode = 'custom' }) => {
  let outcome = null;

  if (env.redis.rateLimitEnabled) {
    outcome = await applyRedisRateLimit({
      key,
      max,
      windowMs,
    });
  }

  if (!outcome) {
    outcome = applyFallbackRateLimit({
      key,
      max,
      windowMs,
    });
  }

  return {
    ...outcome,
    mode,
  };
};

export const consumeScopedRateLimit = async ({
  scope,
  max,
  windowMs,
  mode = 'custom',
  parts = [],
} = {}) => {
  if (!scope || !Number.isFinite(Number(max)) || !Number.isFinite(Number(windowMs))) {
    throw new Error('consumeScopedRateLimit requires scope, max, and windowMs');
  }

  const normalizedMax = Math.max(1, Number(max));
  const normalizedWindowMs = Math.max(1000, Number(windowMs));
  const key = buildScopedRateLimitKey({ scope, mode, parts });

  return consumeRateLimitKey({
    key,
    max: normalizedMax,
    windowMs: normalizedWindowMs,
    mode,
  });
};

export const createRateLimitMiddleware = ({
  scope,
  max,
  windowMs,
  mode = 'ip',
  modes,
  message = defaultMessage,
} = {}) => {
  if (!scope || !Number.isFinite(Number(max)) || !Number.isFinite(Number(windowMs))) {
    throw new Error('Rate limit middleware requires scope, max, and windowMs');
  }

  const normalizedMax = Math.max(1, Number(max));
  const normalizedWindowMs = Math.max(1000, Number(windowMs));
  const normalizedModes = Array.isArray(modes) && modes.length ? modes : [mode];

  return async (req, res, next) => {
    const outcomes = [];

    for (const currentMode of normalizedModes) {
      const key = buildRateLimitKey(req, scope, currentMode);
      outcomes.push(await consumeRateLimitKey({
        key,
        max: normalizedMax,
        windowMs: normalizedWindowMs,
        mode: currentMode,
      }));
    }

    const blockingOutcome = outcomes.find((entry) => !entry.allowed);
    const headerOutcome = blockingOutcome || outcomes.reduce((selected, entry) => {
      if (!selected) {
        return entry;
      }

      return entry.count > selected.count ? entry : selected;
    }, null);

    res.setHeader('X-RateLimit-Limit', String(normalizedMax));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, normalizedMax - headerOutcome.count)));
    res.setHeader('X-RateLimit-Reset', String(headerOutcome.retryAfterSeconds));
    res.setHeader('X-RateLimit-Source', headerOutcome.source);
    res.setHeader('X-RateLimit-Mode', headerOutcome.mode);

    if (!blockingOutcome) {
      next();
      return;
    }

    res.setHeader('Retry-After', String(blockingOutcome.retryAfterSeconds));
    res.status(429).json({
      success: false,
      message,
    });
  };
};

export const otpSendRateLimit = createRateLimitMiddleware({
  scope: 'otp_send',
  max: 5,
  windowMs: 10 * 60 * 1000,
  modes: ['phone_or_ip', 'ip'],
  message: 'Too many OTP requests. Please try again later.',
});

export const otpVerifyRateLimit = createRateLimitMiddleware({
  scope: 'otp_verify',
  max: 10,
  windowMs: 10 * 60 * 1000,
  modes: ['phone_or_ip', 'ip'],
  message: 'Too many OTP verification attempts. Please try again later.',
});

export const loginRateLimit = createRateLimitMiddleware({
  scope: 'login',
  max: 10,
  windowMs: 15 * 60 * 1000,
  modes: ['phone_or_ip', 'ip'],
  message: 'Too many login attempts. Please try again later.',
});

export const rideCreationRateLimit = createRateLimitMiddleware({
  scope: 'ride_create',
  max: 10,
  windowMs: 10 * 60 * 1000,
  mode: 'auth_or_ip',
  message: 'Too many ride requests. Please try again later.',
});

export const paymentOrderRateLimit = createRateLimitMiddleware({
  scope: 'payment_order',
  max: 12,
  windowMs: 15 * 60 * 1000,
  mode: 'auth_or_ip',
  message: 'Too many payment requests. Please try again later.',
});

export const availableDriversRateLimit = createRateLimitMiddleware({
  scope: 'available_drivers',
  max: 60,
  windowMs: 60 * 1000,
  mode: 'ip',
  message: 'Too many driver availability requests. Please try again later.',
});
