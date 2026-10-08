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

// nginx APPENDS the real client address to X-Forwarded-For; anything before it was sent by the client and can
// be faked. Use the entry added by our own proxy (the last one for one proxy hop), so a forged header cannot
// dodge the limits. TRUSTED_PROXY_HOPS = number of proxies in front of the app (default 1: nginx).
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    const chain = forwardedFor.split(',').map((part) => part.trim()).filter(Boolean);
    if (chain.length) {
      return chain[Math.max(0, chain.length - TRUSTED_PROXY_HOPS)];
    }
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
  // Optional per-mode limits, e.g. { phone_or_ip: 5, ip: 30 }: one person's number gets a tight limit,
  // while a shared IP (office WiFi, mobile carrier NAT) is not blocked for everyone after a few tries.
  maxByMode = {},
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
      const modeMax = Number.isFinite(Number(maxByMode?.[currentMode])) && Number(maxByMode[currentMode]) > 0
        ? Number(maxByMode[currentMode])
        : normalizedMax;
      outcomes.push({
        ...(await consumeRateLimitKey({
          key,
          max: modeMax,
          windowMs: normalizedWindowMs,
          mode: currentMode,
        })),
        max: modeMax,
      });
    }

    const blockingOutcome = outcomes.find((entry) => !entry.allowed);
    const headerOutcome = blockingOutcome || outcomes.reduce((selected, entry) => {
      if (!selected) {
        return entry;
      }

      return entry.count > selected.count ? entry : selected;
    }, null);

    res.setHeader('X-RateLimit-Limit', String(headerOutcome.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, headerOutcome.max - headerOutcome.count)));
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
      // So the app can say "try again in N minutes" instead of a bare error.
      retryAfterSeconds: blockingOutcome.retryAfterSeconds,
      limitedBy: blockingOutcome.mode === 'ip' ? 'network' : 'phone',
    });
  };
};

const envLimit = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Per phone number the limits stay tight (SMS cost, brute force). Per IP they are much higher: many real users
// share one public IP (office WiFi, mobile carrier NAT), and a tight IP limit locked out every number after 5 tries.
export const otpSendRateLimit = createRateLimitMiddleware({
  scope: 'otp_send',
  max: envLimit('OTP_SEND_MAX_PER_PHONE', 5),
  maxByMode: {
    phone_or_ip: envLimit('OTP_SEND_MAX_PER_PHONE', 5),
    ip: envLimit('OTP_SEND_MAX_PER_IP', 30),
  },
  windowMs: 10 * 60 * 1000,
  modes: ['phone_or_ip', 'ip'],
  message: 'Too many OTP requests. Please try again later.',
});

export const otpVerifyRateLimit = createRateLimitMiddleware({
  scope: 'otp_verify',
  max: envLimit('OTP_VERIFY_MAX_PER_PHONE', 10),
  maxByMode: {
    phone_or_ip: envLimit('OTP_VERIFY_MAX_PER_PHONE', 10),
    ip: envLimit('OTP_VERIFY_MAX_PER_IP', 60),
  },
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

// Confirming a payment the rider has ALREADY made (goods advance, subscription) must not be blocked by the shared payment limiter.
export const paymentConfirmRateLimit = createRateLimitMiddleware({
  scope: 'payment_confirm',
  max: 60,
  windowMs: 15 * 60 * 1000,
  mode: 'auth_or_ip',
  message: 'Too many payment confirmations. Please try again shortly.',
});

export const availableDriversRateLimit = createRateLimitMiddleware({
  scope: 'available_drivers',
  max: 60,
  windowMs: 60 * 1000,
  mode: 'ip',
  message: 'Too many driver availability requests. Please try again later.',
});
