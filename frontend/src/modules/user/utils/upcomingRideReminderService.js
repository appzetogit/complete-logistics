import toast from 'react-hot-toast';
import { addRealtimeNotification } from './realtimeNotificationStore';

const REMINDER_WINDOWS_MINUTES = [120, 60];
const SENT_REMINDERS_STORAGE_KEY = 'taxi:user:upcoming-reminder-sent';
const ACTIVE_REMINDERS = new Map();

const readSentReminders = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SENT_REMINDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeSentReminders = (value) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SENT_REMINDERS_STORAGE_KEY, JSON.stringify(value));
};

const markReminderAsSent = (reminderKey) => {
  const sent = readSentReminders();
  sent[reminderKey] = new Date().toISOString();
  writeSentReminders(sent);
};

const hasReminderBeenSent = (reminderKey) => Boolean(readSentReminders()[reminderKey]);

const parseDateTime = (dateValue, timeValue = '') => {
  if (!dateValue) {
    return null;
  }

  if (!timeValue) {
    const parsedDate = new Date(dateValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const rawTime = String(timeValue || '').trim().toUpperCase();
  const twelveHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  const twentyFourHourMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);

  let hours = 0;
  let minutes = 0;

  if (twelveHourMatch) {
    hours = Number(twelveHourMatch[1]) % 12;
    minutes = Number(twelveHourMatch[2]);
    if (twelveHourMatch[3] === 'PM') {
      hours += 12;
    }
  } else if (twentyFourHourMatch) {
    hours = Number(twentyFourHourMatch[1]);
    minutes = Number(twentyFourHourMatch[2]);
  } else {
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  const nextDate = new Date(parsedDate);
  nextDate.setHours(hours, minutes, 0, 0);
  return Number.isNaN(nextDate.getTime()) ? null : nextDate;
};

const emitReminder = ({ reminderKey, title, body, type }) => {
  if (hasReminderBeenSent(reminderKey)) {
    return;
  }

  markReminderAsSent(reminderKey);
  addRealtimeNotification({
    id: `upcoming-reminder:${reminderKey}`,
    title,
    body,
    type,
    source: 'upcoming-reminder',
    sentAt: new Date().toISOString(),
  });

  toast(title, {
    duration: 5000,
    className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-sky-50 bg-white',
  });
}

const scheduleReminder = ({ reminderKey, eventTime, minutesBefore, title, body, type }) => {
  if (!(eventTime instanceof Date) || Number.isNaN(eventTime.getTime())) {
    return;
  }

  const now = Date.now();
  const reminderAt = eventTime.getTime() - (minutesBefore * 60 * 1000);

  if (ACTIVE_REMINDERS.has(reminderKey)) {
    window.clearTimeout(ACTIVE_REMINDERS.get(reminderKey));
    ACTIVE_REMINDERS.delete(reminderKey);
  }

  if (eventTime.getTime() <= now || hasReminderBeenSent(reminderKey)) {
    return;
  }

  if (reminderAt <= now) {
    emitReminder({ reminderKey, title, body, type });
    return;
  }

  const timeoutId = window.setTimeout(() => {
    ACTIVE_REMINDERS.delete(reminderKey);
    emitReminder({ reminderKey, title, body, type });
  }, reminderAt - now);

  ACTIVE_REMINDERS.set(reminderKey, timeoutId);
};

const scheduleReminderWindowSet = ({ scope, entityId, eventTime, title, body, type }) => {
  if (typeof window === 'undefined' || !entityId) {
    return;
  }

  REMINDER_WINDOWS_MINUTES.forEach((minutesBefore) => {
    scheduleReminder({
      reminderKey: `${scope}:${entityId}:${minutesBefore}`,
      eventTime,
      minutesBefore,
      title,
      body,
      type,
    });
  });
};

const getBusReminderPayload = (booking) => {
  const bookingId = String(booking?.id || booking?._id || booking?.bookingCode || '').trim();
  const eventTime = parseDateTime(booking?.travelDate, booking?.bus?.departure);

  if (!bookingId || !eventTime) {
    return null;
  }

  const fromCity = String(booking?.bus?.fromCity || 'Pickup').trim();
  const toCity = String(booking?.bus?.toCity || 'Drop').trim();
  const operator = String(booking?.bus?.operator || booking?.bus?.busName || 'Bus').trim();

  return {
    scope: 'bus',
    entityId: bookingId,
    eventTime,
    title: `Bus soon: ${fromCity} to ${toCity}`,
    body: `${operator} departs at ${booking?.bus?.departure || 'scheduled time'}. Please be ready 10 minutes early.`,
    type: 'ride',
  };
};

const getPoolingReminderPayload = (booking) => {
  const bookingId = String(booking?._id || booking?.bookingId || '').trim();
  const routeSchedules = Array.isArray(booking?.route?.schedules) ? booking.route.schedules : [];
  const selectedSchedule = routeSchedules.find((item) => String(item?.id || '') === String(booking?.scheduleId || ''));
  const departureTime = String(selectedSchedule?.departureTime || booking?.departureTime || '').trim();
  const eventTime = parseDateTime(booking?.travelDate, departureTime);

  if (!bookingId || !eventTime) {
    return null;
  }

  const routeName = String(
    booking?.route?.routeName ||
    `${booking?.route?.originLabel || 'Pickup'} to ${booking?.route?.destinationLabel || 'Drop'}`,
  ).trim();

  return {
    scope: 'pooling',
    entityId: bookingId,
    eventTime,
    title: `Pooling trip soon: ${routeName}`,
    body: `Your shared ride leaves at ${departureTime || 'the scheduled time'}. Please reach ${booking?.pickupLabel || 'the pickup point'} early.`,
    type: 'ride',
  };
};

const isTerminalRideStatus = (ride) => {
  const status = String(ride?.status || ride?.liveStatus || '').toLowerCase();
  return ['cancelled', 'completed', 'failed', 'expired'].includes(status);
};

const getScheduledRideReminderPayload = (ride) => {
  const rideId = String(ride?.rideId || ride?._id || ride?.id || '').trim();
  const eventTime = parseDateTime(ride?.scheduledAt);

  if (!rideId || !eventTime || isTerminalRideStatus(ride)) {
    return null;
  }

  return {
    scope: 'scheduled-ride',
    entityId: rideId,
    eventTime,
    title: 'Scheduled ride coming up',
    body: `${ride?.pickupAddress || ride?.pickup || 'Pickup'} to ${ride?.dropAddress || ride?.drop || 'Drop'} is scheduled soon.`,
    type: 'ride',
  };
};

export const syncUpcomingRideReminders = ({
  busBookings = [],
  poolingBookings = [],
  scheduledRides = [],
} = {}) => {
  busBookings
    .map(getBusReminderPayload)
    .filter(Boolean)
    .forEach(scheduleReminderWindowSet);

  poolingBookings
    .map(getPoolingReminderPayload)
    .filter(Boolean)
    .forEach(scheduleReminderWindowSet);

  scheduledRides
    .map(getScheduledRideReminderPayload)
    .filter(Boolean)
    .forEach(scheduleReminderWindowSet);
};

export const scheduleBusBookingReminders = (booking) => {
  const payload = getBusReminderPayload(booking);
  if (payload) {
    scheduleReminderWindowSet(payload);
  }
};

export const schedulePoolingBookingReminders = (booking) => {
  const payload = getPoolingReminderPayload(booking);
  if (payload) {
    scheduleReminderWindowSet(payload);
  }
};

export const scheduleScheduledRideReminders = (ride) => {
  const payload = getScheduledRideReminderPayload(ride);
  if (payload) {
    scheduleReminderWindowSet(payload);
  }
};
