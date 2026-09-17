const maskValue = (value, { visibleStart = 3, visibleEnd = 3 } = {}) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= visibleStart + visibleEnd) return normalized;
  return `${normalized.slice(0, visibleStart)}***${normalized.slice(-visibleEnd)}`;
};

const redactUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  try {
    const parsed = new URL(normalized);
    for (const key of ['token', 'access_token', 'authorization', 'auth']) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '***');
      }
    }
    return parsed.toString();
  } catch {
    return normalized.replace(/([?&](?:token|access_token|authorization|auth)=)[^&]+/gi, '$1***');
  }
};

export const buildPaymentRequestContext = (req) => ({
  requestId: req.headers['x-request-id'] || '',
  method: req.method || '',
  path: req.originalUrl || req.url || '',
  userId: req.auth?.sub || '',
  ip: req.ip || req.socket?.remoteAddress || '',
  origin: req.headers.origin || '',
  referer: req.headers.referer || '',
  userAgent: req.headers['user-agent'] || '',
});

export const logPaymentDiagnostic = ({
  provider = 'phonepe',
  scope = 'general',
  stage = 'event',
  level = 'info',
  ...detail
} = {}) => {
  const payload = {
    ts: new Date().toISOString(),
    provider,
    scope,
    stage,
    ...detail,
  };

  const serialized = JSON.stringify(payload);
  const prefix = `[payment-diagnostic][${provider}][${scope}][${stage}]`;

  if (level === 'error') {
    console.error(prefix, serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(prefix, serialized);
    return;
  }

  console.log(prefix, serialized);
};

export const summarizePhonePePayload = (payload = {}) => {
  const paymentDetails = Array.isArray(payload?.paymentDetails) ? payload.paymentDetails : [];
  const latestPayment = paymentDetails[0] || {};

  return {
    success: payload?.success,
    code: payload?.code || latestPayment?.responseCode || '',
    state: payload?.state || latestPayment?.state || '',
    message: payload?.message || latestPayment?.responseCodeDescription || latestPayment?.detailedErrorCode || '',
    amount: payload?.amount || latestPayment?.amount || '',
    merchantOrderId: payload?.merchantOrderId || payload?.orderId || '',
    transactionId: latestPayment?.transactionId || latestPayment?.paymentTransactionId || '',
    redirectUrl: redactUrl(payload?.redirectUrl || payload?.data?.redirectUrl || ''),
  };
};

export const summarizePhonePeRequestBody = (body = {}) => ({
  merchantOrderId: body?.merchantOrderId || '',
  amount: body?.amount || '',
  expireAfter: body?.expireAfter || '',
  paymentFlowType: body?.paymentFlow?.type || '',
  redirectUrl: redactUrl(body?.paymentFlow?.merchantUrls?.redirectUrl || ''),
  message: body?.paymentFlow?.message || '',
  udf1: body?.metaInfo?.udf1 || '',
  udf2: body?.metaInfo?.udf2 || '',
  udf3: body?.metaInfo?.udf3 || '',
  phoneNumber: maskValue(body?.prefillUserLoginDetails?.phoneNumber || '', { visibleStart: 2, visibleEnd: 2 }),
});

export const summarizePhonePeCredentialMeta = ({
  clientId,
  clientVersion,
  environment,
} = {}) => ({
  clientId: maskValue(clientId),
  clientVersion: String(clientVersion || ''),
  environment: String(environment || ''),
});

export const summarizeCheckoutUrl = (url) => redactUrl(url);
