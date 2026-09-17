const decodeBase64Url = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return normalized + '='.repeat(padding);
};

export const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }

    return JSON.parse(atob(decodeBase64Url(payload)));
  } catch (_error) {
    return null;
  }
};

export const readJsonLocalStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
};

const readStorageValue = (key) => {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  } catch (_error) {
    return localStorage.getItem(key) || '';
  }
};

export const parseSupportConversationKey = (conversationKey) => {
  const raw = String(conversationKey || '');
  const canonicalMatch = /^(user|driver):([^:]+):([^:]+)$/.exec(raw);

  if (canonicalMatch) {
    const channel = canonicalMatch[1];
    const adminId = canonicalMatch[2];
    const peerId = canonicalMatch[3];
    const legacyKey = `admin:${adminId}|${channel}:${peerId}`;

    return {
      format: 'canonical',
      channel,
      adminId,
      peerRole: channel,
      peerId,
      canonicalKey: raw,
      legacyKey,
      keys: [raw, legacyKey],
    };
  }

  const legacyMatch = /^admin:([^|]+)\|(user|driver):([^|]+)$/.exec(raw);

  if (!legacyMatch) {
    return null;
  }

  const adminId = legacyMatch[1];
  const peerRole = legacyMatch[2];
  const peerId = legacyMatch[3];
  const canonicalKey = `${peerRole}:${adminId}:${peerId}`;

  return {
    format: 'legacy',
    channel: peerRole,
    adminId,
    peerRole,
    peerId,
    canonicalKey,
    legacyKey: raw,
    keys: [canonicalKey, raw],
  };
};

export const resolveChatRole = (preferredRole) => {
  const role = String(
    preferredRole ||
      readStorageValue('chatRole') ||
      readStorageValue('role') ||
      '',
  ).toLowerCase();

  if (role === 'admin' || role === 'driver' || role === 'user') {
    return role;
  }

  if (readStorageValue('adminToken')) {
    return 'admin';
  }

  if (readStorageValue('token') || readStorageValue('driverToken')) {
    return 'driver';
  }

  return 'guest';
};

export const resolveChatToken = (preferredRole) => {
  const role = resolveChatRole(preferredRole);
  const adminToken = readStorageValue('adminToken');
  const userToken = readStorageValue('userToken') || readStorageValue('token');
  const driverToken = readStorageValue('driverToken') || readStorageValue('token');

  if (role === 'admin') {
    return adminToken;
  }

  if (role === 'driver') {
    return driverToken;
  }

  if (role === 'user') {
    return userToken;
  }

  return adminToken || userToken || driverToken || null;
};

export const getChatSession = (preferredRole) => {
  const role = resolveChatRole(preferredRole);
  const token = resolveChatToken(role);
  const payload = decodeJwtPayload(token);
  const adminInfo = readJsonLocalStorage('adminInfo');

  return {
    role,
    token,
    id: payload?.sub || payload?.id || null,
    name:
      role === 'admin'
        ? adminInfo?.name || payload?.name || 'Admin'
        : role === 'driver'
          ? payload?.name || 'Driver'
          : payload?.name || 'User',
    phone: payload?.phone || '',
    isAuthenticated: Boolean(token),
  };
};
