import crypto from 'node:crypto';
import { ApiError } from '../../../utils/ApiError.js';

// Shared Razorpay helpers (goods advance, subscription purchase, ...).

// Loaded lazily: paymentGatewayService pulls in adminService, which would make
// this module part of an import cycle with rideService/dispatchService.
export const resolveRazorpayCredentials = async () => {
  const { resolveConfiguredGatewayCredentials } = await import('./paymentGatewayService.js');
  return resolveConfiguredGatewayCredentials('razor_pay');
};

export const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description || payload?.error?.message || 'Razorpay request failed',
    );
  }

  return payload;
};

export const signaturesMatch = (expected, received) => {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
