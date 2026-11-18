import { RIDE_STATUS } from '../constants/index.js';
import { Driver } from '../driver/models/Driver.js';
import { User } from '../user/models/User.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';

const MAX_BODY_LENGTH = 120;

const trimBody = (text) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > MAX_BODY_LENGTH ? `${clean.slice(0, MAX_BODY_LENGTH - 1)}…` : clean;
};

/**
 * Push for a new ride chat message, to the participant who did NOT send it (a socket reaches them only while the
 * app is open). A normal notification, not data-only: the apps draw nothing themselves for a chat message, so the
 * system tray must show it while the app is in the background or closed. `data.rideId` opens the right chat.
 * Returns the push result, or null when nobody should be notified.
 */
export const notifyRideMessageRecipient = async ({ savedMessage, participants, send = sendPushNotificationToEntities }) => {
  const senderRole = savedMessage?.senderRole;
  const { userId = '', driverId = '', status = '' } = participants || {};

  // before a driver is assigned there is nobody to notify; a finished ride's chat is closed
  if (!['user', 'driver'].includes(senderRole)) return null;
  if ([RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED].includes(status)) return null;

  const recipient = senderRole === 'user' ? { driverIds: [driverId] } : { userIds: [userId] };
  const recipientId = senderRole === 'user' ? driverId : userId;
  if (!recipientId) return null;
  // never the sender (only possible if the ride's two ids were the same account)
  if (String(recipientId) === String(savedMessage.senderId)) return null;

  const sender = senderRole === 'user'
    ? await User.findById(savedMessage.senderId).select('name').lean()
    : await Driver.findById(savedMessage.senderId).select('name').lean();
  const title = String(sender?.name || '').trim() || (senderRole === 'user' ? 'Rider' : 'Driver');

  return send({
    ...recipient,
    title,
    body: trimBody(savedMessage.message),
    data: { type: 'ride_message', rideId: String(savedMessage.rideId) },
  });
};
