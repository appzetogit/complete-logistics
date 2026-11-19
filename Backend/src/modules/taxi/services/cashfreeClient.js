import crypto from 'node:crypto';
import { ApiError } from '../../../utils/ApiError.js';

// Cashfree Payment Gateway (PG) REST client. Amounts are in RUPEES (not paise).
// The base URL can be overridden with CASHFREE_BASE_URL (the tests point it at a fake server).
export const CASHFREE_API_VERSION = process.env.CASHFREE_API_VERSION || '2023-08-01';
const REQUEST_TIMEOUT_MS = 15000;

const baseUrlFor = (isLive) =>
  String(process.env.CASHFREE_BASE_URL || '').trim()
  || (isLive ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

export const resolveCashfreeCredentials = async () => {
  const { resolveConfiguredGatewayCredentials } = await import('./paymentGatewayService.js');
  const credentials = await resolveConfiguredGatewayCredentials('cashfree');
  return { appId: credentials.appId, secretKey: credentials.secretKey, isLive: Boolean(credentials.isLive) };
};

export const cashfreeRequest = async ({ method = 'GET', path, body, credentials }) => {
  const { appId, secretKey, isLive } = credentials || (await resolveCashfreeCredentials());
  let response;
  try {
    response = await fetch(`${baseUrlFor(isLive)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': CASHFREE_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError(502, 'Cashfree could not be reached', { code: 'cashfree_unreachable', reason: String(error?.message || error) });
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 401: wrong App ID / Secret; 429: rate limited. Both are ours to fix or retry, not the caller's mistake.
    const status = response.status >= 500 ? 502 : response.status === 429 ? 429 : response.status === 401 ? 502 : 400;
    throw new ApiError(status, response.status === 401 ? 'Cashfree rejected the configured keys' : payload?.message || 'Cashfree request failed', {
      code: 'cashfree_error',
      cashfreeCode: payload?.code || '',
      cashfreeStatus: response.status,
    });
  }
  return payload;
};

export const createCashfreeOrder = ({ orderId, amount, customer, returnUrl, notifyUrl, tags = {}, credentials }) =>
  cashfreeRequest({
    method: 'POST',
    path: '/orders',
    credentials,
    body: {
      order_id: orderId,
      order_amount: Number(Number(amount).toFixed(2)),
      order_currency: 'INR',
      customer_details: {
        customer_id: String(customer.id),
        customer_phone: String(customer.phone || '').replace(/\D/g, '').slice(-10) || '9999999999',
        ...(customer.name ? { customer_name: String(customer.name).slice(0, 100) } : {}),
        ...(customer.email ? { customer_email: String(customer.email) } : {}),
      },
      order_meta: {
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(notifyUrl ? { notify_url: notifyUrl } : {}),
      },
      order_tags: tags,
    },
  });

export const fetchCashfreeOrder = (orderId, credentials) =>
  cashfreeRequest({ path: `/orders/${encodeURIComponent(orderId)}`, credentials });

export const fetchCashfreeOrderPayments = (orderId, credentials) =>
  cashfreeRequest({ path: `/orders/${encodeURIComponent(orderId)}/payments`, credentials });

export const createCashfreeRefund = ({ orderId, refundId, amount, note = '', credentials }) =>
  cashfreeRequest({
    method: 'POST',
    path: `/orders/${encodeURIComponent(orderId)}/refunds`,
    credentials,
    body: { refund_id: refundId, refund_amount: Number(Number(amount).toFixed(2)), refund_note: String(note).slice(0, 100) },
  });

export const fetchCashfreeRefund = ({ orderId, refundId, credentials }) =>
  cashfreeRequest({ path: `/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(refundId)}`, credentials });

// ---- payment links: the driver shows a QR at the drop and the rider pays it from any UPI app ------------------------
// POST /links returns link_url (the pay page) and link_qrcode (a PNG data URL). One link = one fare, single payment.
export const createCashfreePaymentLink = ({ linkId, amount, purpose, customer = {}, notifyUrl, expiresAt, notes = {}, credentials }) =>
  cashfreeRequest({
    method: 'POST',
    path: '/links',
    credentials,
    body: {
      link_id: linkId,
      link_amount: Number(Number(amount).toFixed(2)),
      link_currency: 'INR',
      link_purpose: String(purpose || 'Ride fare').slice(0, 500),
      customer_details: {
        customer_phone: String(customer.phone || '').replace(/\D/g, '').slice(-10) || '9999999999',
        ...(customer.name ? { customer_name: String(customer.name).slice(0, 100) } : {}),
      },
      link_partial_payments: false,
      link_expiry_time: new Date(expiresAt).toISOString(),
      link_notify: { send_sms: false, send_email: false },
      link_auto_reminders: false,
      link_notes: notes,
      ...(notifyUrl ? { link_meta: { notify_url: notifyUrl } } : {}),
    },
  });

export const fetchCashfreePaymentLink = (linkId, credentials) =>
  cashfreeRequest({ path: `/links/${encodeURIComponent(linkId)}`, credentials });

/** The orders created when someone paid (or tried to pay) the link. */
export const fetchCashfreePaymentLinkOrders = (linkId, credentials) =>
  cashfreeRequest({ path: `/links/${encodeURIComponent(linkId)}/orders`, credentials });

export const cancelCashfreePaymentLink = (linkId, credentials) =>
  cashfreeRequest({ method: 'POST', path: `/links/${encodeURIComponent(linkId)}/cancel`, credentials });

/** Webhook signature: base64(HMAC-SHA256(timestamp + rawBody, secret)). */
export const verifyCashfreeWebhookSignature = ({ rawBody, signature, timestamp, secretKey }) => {
  if (!rawBody || !signature || !timestamp || !secretKey) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = crypto.createHmac('sha256', secretKey).update(`${timestamp}${body}`).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
