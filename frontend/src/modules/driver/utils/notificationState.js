const DRIVER_NOTIFICATION_HIDDEN_KEY = 'driverNotificationHiddenIds';
const DRIVER_NOTIFICATION_READ_KEY = 'driverNotificationReadIds';
const DRIVER_NOTIFICATION_LOCAL_KEY = 'driverLocalNotifications';

const readIdSet = (storageKey) => {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || '')) : []);
  } catch {
    return new Set();
  }
};

const writeIdSet = (storageKey, values) => {
  localStorage.setItem(storageKey, JSON.stringify(Array.from(values)));
};

const readLocalNotifications = () => {
  try {
    const raw = localStorage.getItem(DRIVER_NOTIFICATION_LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalNotifications = (notifications = []) => {
  localStorage.setItem(DRIVER_NOTIFICATION_LOCAL_KEY, JSON.stringify(notifications));
};

const normalizeNotificationId = (notification = {}) => String(notification?.id || notification?._id || '');

export const getHiddenDriverNotificationIds = () => readIdSet(DRIVER_NOTIFICATION_HIDDEN_KEY);

export const hideDriverNotification = (id) => {
  const next = getHiddenDriverNotificationIds();
  next.add(String(id || ''));
  writeIdSet(DRIVER_NOTIFICATION_HIDDEN_KEY, next);
  return next;
};

export const hideAllDriverNotifications = (ids = []) => {
  const next = getHiddenDriverNotificationIds();
  ids.forEach((id) => next.add(String(id || '')));
  writeIdSet(DRIVER_NOTIFICATION_HIDDEN_KEY, next);
  return next;
};

export const getReadDriverNotificationIds = () => readIdSet(DRIVER_NOTIFICATION_READ_KEY);

export const markDriverNotificationsAsRead = (ids = []) => {
  const next = getReadDriverNotificationIds();
  ids.forEach((id) => next.add(String(id || '')));
  writeIdSet(DRIVER_NOTIFICATION_READ_KEY, next);
  return next;
};

export const getLocalDriverNotifications = () => readLocalNotifications();

export const addLocalDriverNotification = (notification = {}) => {
  const nextNotification = {
    id: normalizeNotificationId(notification) || `local-${Date.now()}`,
    title: String(notification.title || 'Notification').trim(),
    body: String(notification.body || '').trim(),
    sentAt: notification.sentAt || new Date().toISOString(),
    createdAt: notification.createdAt || new Date().toISOString(),
    image: String(notification.image || '').trim(),
    sendTo: String(notification.sendTo || 'driver').trim(),
    serviceLocationName: String(notification.serviceLocationName || '').trim(),
    source: String(notification.source || 'local').trim(),
  };

  const existing = readLocalNotifications();
  const filtered = existing.filter((item) => normalizeNotificationId(item) !== nextNotification.id);
  const next = [nextNotification, ...filtered].slice(0, 100);
  writeLocalNotifications(next);
  return nextNotification;
};

export const getMergedDriverNotifications = (notifications = []) => {
  const localNotifications = getLocalDriverNotifications();
  const combined = [...localNotifications, ...notifications];
  const byId = new Map();

  combined.forEach((notification) => {
    const id = normalizeNotificationId(notification);
    if (!id || byId.has(id)) {
      return;
    }
    byId.set(id, notification);
  });

  return Array.from(byId.values()).sort((left, right) => {
    const leftTime = new Date(left?.sentAt || left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.sentAt || right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
};

export const getVisibleDriverNotifications = (notifications = []) => {
  const hiddenIds = getHiddenDriverNotificationIds();
  return getMergedDriverNotifications(notifications).filter((notification) => !hiddenIds.has(normalizeNotificationId(notification)));
};

export const getUnreadDriverNotificationCount = (notifications = []) => {
  const hiddenIds = getHiddenDriverNotificationIds();
  const readIds = getReadDriverNotificationIds();

  return notifications.reduce((count, notification) => {
    const id = normalizeNotificationId(notification);
    if (!id || hiddenIds.has(id) || readIds.has(id)) {
      return count;
    }
    return count + 1;
  }, 0);
};
