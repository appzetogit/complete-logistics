import { getFirebaseMessaging, getFirebaseStatus } from '../../../config/firebase.js';
import { Driver } from '../driver/models/Driver.js';
import { User } from '../user/models/User.js';
import { listEntityPushTokens } from './pushTokenService.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

// "Not configured" used to be returned silently, so a server with no Firebase key just never sent a push and
// nothing in the logs said why. Log it (at most once a minute so a busy server does not flood the log).
let lastNotConfiguredLogAt = 0;
const logPushNotConfigured = () => {
  const now = Date.now();
  if (now - lastNotConfiguredLogAt < 60_000) {
    return;
  }
  lastNotConfiguredLogAt = now;
  console.error(`[push] NOT SENT - ${getFirebaseStatus().reason || 'Firebase messaging is not configured on the backend'}`);
};

const summarizeFailures = (failures = []) => {
  const byCode = new Map();
  failures.forEach((error) => {
    const code = error?.code || 'unknown';
    const entry = byCode.get(code) || { code, message: String(error?.message || '').slice(0, 200), count: 0 };
    entry.count += 1;
    byCode.set(code, entry);
  });
  return [...byCode.values()];
};

const chunk = (items, size) => {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
};

const collectAudienceTargets = async ({ sendTo, serviceLocationId }) => {
  const includeUsers = sendTo === 'all' || sendTo === 'users';
  const includeDrivers = sendTo === 'all' || sendTo === 'drivers';
  const targets = [];

  if (includeUsers) {
    const users = await User.find({
      deletedAt: null,
      isActive: { $ne: false },
      active: { $ne: false },
    })
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (includeDrivers) {
    const driverQuery = {
      deletedAt: null,
      approve: { $ne: false },
      status: { $ne: 'pending' },
    };

    if (serviceLocationId) {
      driverQuery.service_location_id = serviceLocationId;
    }

    const drivers = await Driver.find(driverQuery)
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    drivers.forEach((driver) => {
      listEntityPushTokens(driver, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(driver._id),
        });
      });
    });
  }

  return targets;
};

const removeInvalidTokens = async (invalidTargets = []) => {
  if (invalidTargets.length === 0) {
    return 0;
  }

  const userIdsByField = { fcmTokenWeb: new Set(), fcmTokenMobile: new Set() };
  const driverIdsByField = { fcmTokenWeb: new Set(), fcmTokenMobile: new Set() };

  invalidTargets.forEach((target) => {
    if (target.role === 'user') {
      userIdsByField[target.field]?.add(target.entityId);
    }

    if (target.role === 'driver') {
      driverIdsByField[target.field]?.add(target.entityId);
    }
  });

  const operations = [];

  Object.entries(userIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        User.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $set: { [field]: '' } },
        ),
      );
    }
  });

  Object.entries(driverIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        Driver.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $set: { [field]: '' } },
        ),
      );
    }
  });

  await Promise.all(operations);
  return invalidTargets.length;
};

const sendPushToTargets = async ({
  targets = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    logPushNotConfigured();
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      errors: [],
      reason: getFirebaseStatus().reason || 'Firebase messaging is not configured on the backend',
    };
  }

  const dedupedTargets = Array.from(
    new Map((Array.isArray(targets) ? targets : []).map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    console.warn(`[push] not sent: no saved FCM token for the recipient (${title || 'notification'}). The app must call POST /users/fcm-token or /drivers/fcm-token after login.`);
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      errors: [],
      reason: 'No saved FCM tokens were found for the selected entities',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const invalidTargets = [];
  const failures = [];
  const safeData = Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, String(value ?? '')]),
  );

  for (const batch of chunk(dedupedTargets, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((target) => target.token),
      notification: {
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
      data: {
        ...safeData,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: image ? { imageUrl: image } : undefined,
      },
      webpush: {
        notification: {
          title,
          body,
          ...(image ? { image } : {}),
        },
      },
    });

    response.responses.forEach((item, index) => {
      if (item.success) {
        deliveredCount += 1;
        return;
      }

      failedCount += 1;
      failures.push(item.error);
      if (INVALID_TOKEN_CODES.has(item.error?.code)) {
        invalidTargets.push(batch[index]);
      }
    });
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);
  const errors = summarizeFailures(failures);

  if (failedCount > 0) {
    console.error(
      `[push] ${failedCount}/${dedupedTargets.length} failed for "${title || 'notification'}": `
      + errors.map((entry) => `${entry.code} x${entry.count} (${entry.message})`).join('; '),
    );
  }

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    errors,
    reason: '',
  };
};

const collectDirectTargets = async ({ userIds = [], driverIds = [] }) => {
  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const normalizedDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const targets = [];

  if (normalizedUserIds.length) {
    const users = await User.find({ _id: { $in: normalizedUserIds } })
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (normalizedDriverIds.length) {
    const drivers = await Driver.find({ _id: { $in: normalizedDriverIds } })
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    drivers.forEach((driver) => {
      listEntityPushTokens(driver, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(driver._id),
        });
      });
    });
  }

  return targets;
};

export const sendPushNotificationToAudience = async ({
  notificationId,
  serviceLocationId,
  sendTo,
  title,
  body,
  image,
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'Firebase messaging is not configured on the backend',
    };
  }

  const targets = await collectAudienceTargets({ sendTo, serviceLocationId });
  const dedupedTargets = Array.from(
    new Map(targets.map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'No saved FCM tokens were found for the selected audience',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const invalidTargets = [];

  for (const batch of chunk(dedupedTargets, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((target) => target.token),
      notification: {
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
      data: {
        notificationId: String(notificationId || ''),
        serviceLocationId: String(serviceLocationId || ''),
        sendTo: String(sendTo || 'all'),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: image ? { imageUrl: image } : undefined,
      },
      webpush: {
        notification: {
          title,
          body,
          ...(image ? { image } : {}),
        },
      },
    });

    response.responses.forEach((item, index) => {
      if (item.success) {
        deliveredCount += 1;
        return;
      }

      failedCount += 1;
      if (INVALID_TOKEN_CODES.has(item.error?.code)) {
        invalidTargets.push(batch[index]);
      }
    });
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    reason: '',
  };
};

/**
 * Everything needed to answer "why is no push arriving": is Firebase configured on this server, and how many
 * users / drivers have a saved device token. No secrets are returned.
 */
export const getPushStatus = async () => {
  const firebase = getFirebaseStatus();
  const hasToken = { $or: [{ fcmTokenMobile: { $nin: ['', null] } }, { fcmTokenWeb: { $nin: ['', null] } }] };
  const [users, usersWithToken, drivers, driversWithToken, onlineDrivers, onlineDriversWithToken] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    User.countDocuments({ deletedAt: null, ...hasToken }),
    Driver.countDocuments({ deletedAt: null }),
    Driver.countDocuments({ deletedAt: null, ...hasToken }),
    Driver.countDocuments({ deletedAt: null, isOnline: true }),
    Driver.countDocuments({ deletedAt: null, isOnline: true, ...hasToken }),
  ]);

  return {
    firebase,
    tokens: {
      users: { total: users, withToken: usersWithToken },
      drivers: { total: drivers, withToken: driversWithToken },
      onlineDrivers: { total: onlineDrivers, withToken: onlineDriversWithToken },
    },
    hints: [
      !firebase.configured && firebase.reason,
      firebase.configured && driversWithToken === 0 && 'No driver has saved a device token: the driver app must call POST /drivers/fcm-token after login.',
      firebase.configured && usersWithToken === 0 && 'No user has saved a device token: the user app must call POST /users/fcm-token after login.',
      firebase.configured && onlineDrivers > onlineDriversWithToken && `${onlineDrivers - onlineDriversWithToken} online driver(s) have no device token and cannot get ride-request pushes.`,
    ].filter(Boolean),
  };
};

export const sendPushNotificationToEntities = async ({
  userIds = [],
  driverIds = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const targets = await collectDirectTargets({ userIds, driverIds });
  return sendPushToTargets({
    targets,
    title,
    body,
    image,
    data,
  });
};
