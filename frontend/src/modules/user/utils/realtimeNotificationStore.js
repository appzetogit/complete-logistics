const STORAGE_KEY = 'taxi:user:realtime-notifications';
export const USER_NOTIFICATIONS_UPDATED_EVENT = 'taxi:user-notifications-updated';

const dispatchUpdate = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(USER_NOTIFICATIONS_UPDATED_EVENT));
};

const sanitizeNotification = (notification = {}) => {
  const id = String(notification.id || '').trim();

  if (!id) {
    return null;
  }

  return {
    id,
    title: String(notification.title || 'Notification').trim(),
    body: String(notification.body || '').trim(),
    sentAt: notification.sentAt || new Date().toISOString(),
    type: String(notification.type || 'support').trim(),
    source: String(notification.source || 'realtime').trim(),
    image: notification.image || '',
    serviceLocationName: String(notification.serviceLocationName || '').trim(),
  };
};

const readStoredNotifications = () => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(sanitizeNotification).filter(Boolean);
  } catch {
    return [];
  }
};

const writeStoredNotifications = (notifications) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  dispatchUpdate();
};

export const getRealtimeNotifications = () => readStoredNotifications();

export const addRealtimeNotification = (notification) => {
  const nextNotification = sanitizeNotification(notification);

  if (!nextNotification) {
    return false;
  }

  const existing = readStoredNotifications();

  if (existing.some((item) => item.id === nextNotification.id)) {
    return false;
  }

  const nextList = [nextNotification, ...existing].slice(0, 50);
  writeStoredNotifications(nextList);
  return true;
};

export const removeRealtimeNotification = (id) => {
  const normalizedId = String(id || '').trim();

  if (!normalizedId) {
    return;
  }

  const existing = readStoredNotifications();
  const nextList = existing.filter((item) => item.id !== normalizedId);

  if (nextList.length !== existing.length) {
    writeStoredNotifications(nextList);
  }
};

export const clearRealtimeNotifications = () => {
  writeStoredNotifications([]);
};

export const isRealtimeNotification = (id) =>
  readStoredNotifications().some((item) => item.id === String(id || '').trim());
