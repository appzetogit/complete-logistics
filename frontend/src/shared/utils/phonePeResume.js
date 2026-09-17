const STORAGE_PREFIX = 'phonepe-pending:';
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

const canUseStorage = () => {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const getStorageKey = (flowKey) => `${STORAGE_PREFIX}${String(flowKey || '').trim()}`;

export const rememberPendingPhonePeRedirect = (flowKey, payload = {}) => {
  if (!canUseStorage()) return;

  const merchantTransactionId = String(payload?.merchantTransactionId || '').trim();
  if (!merchantTransactionId) return;

  try {
    globalThis.localStorage.setItem(
      getStorageKey(flowKey),
      JSON.stringify({
        merchantTransactionId,
        savedAt: Date.now(),
        ...payload,
      }),
    );
  } catch {
    // Ignore local storage failures and keep the checkout flow moving.
  }
};

export const readPendingPhonePeRedirect = (flowKey, { ttlMs = DEFAULT_TTL_MS } = {}) => {
  if (!canUseStorage()) return null;

  try {
    const raw = globalThis.localStorage.getItem(getStorageKey(flowKey));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed?.savedAt || 0);

    if (savedAt && Date.now() - savedAt > ttlMs) {
      globalThis.localStorage.removeItem(getStorageKey(flowKey));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const clearPendingPhonePeRedirect = (flowKey) => {
  if (!canUseStorage()) return;

  try {
    globalThis.localStorage.removeItem(getStorageKey(flowKey));
  } catch {
    // Ignore local storage failures during cleanup.
  }
};

export const resolvePendingPhonePeTransaction = (flowKey, search = globalThis.location?.search || '') => {
  const params = new URLSearchParams(search);
  const merchantTransactionId = String(params.get('phonepe_txn') || '').trim();

  if (merchantTransactionId) {
    const existing = readPendingPhonePeRedirect(flowKey) || {};
    rememberPendingPhonePeRedirect(flowKey, {
      ...existing,
      merchantTransactionId,
    });
    return merchantTransactionId;
  }

  return String(readPendingPhonePeRedirect(flowKey)?.merchantTransactionId || '').trim();
};
