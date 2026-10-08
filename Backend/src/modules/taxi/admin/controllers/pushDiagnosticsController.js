import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { getPushStatus, sendPushNotificationToEntities } from '../../services/pushNotificationService.js';

// GET /admin/push/status - is Firebase configured here, and how many devices can be reached.
export const getPushDiagnostics = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getPushStatus() });
});

// POST /admin/push/test { userId | driverId, title?, body? } - sends one real push and reports exactly what happened
// (including the Firebase error code when it fails), so a broken setup can be found in one call.
export const sendTestPush = asyncHandler(async (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const driverId = String(req.body?.driverId || '').trim();

  if (!userId && !driverId) {
    throw new ApiError(400, 'userId or driverId is required');
  }

  const result = await sendPushNotificationToEntities({
    userIds: userId ? [userId] : [],
    driverIds: driverId ? [driverId] : [],
    title: String(req.body?.title || 'Test notification'),
    body: String(req.body?.body || 'If you can read this, push notifications work.'),
    data: { type: 'test_push' },
  });

  res.json({ success: true, data: result });
});
