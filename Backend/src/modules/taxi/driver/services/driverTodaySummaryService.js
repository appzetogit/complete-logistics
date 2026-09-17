import { Driver } from '../models/Driver.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const toIstDate = (value = new Date()) => new Date(new Date(value).getTime() + IST_OFFSET_MS);

export const toIstDayKey = (value = new Date()) => toIstDate(value).toISOString().slice(0, 10);

const normalizeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const getElapsedIstDayMinutes = (value = new Date()) => {
  const istNow = toIstDate(value);
  return Math.max(0, Math.round(
    (istNow.getTime() - new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime()) /
      (60 * 1000),
  ));
};

const mergeSummary = (summary = {}, dateKey) => {
  if (String(summary?.dateKey || '') !== dateKey) {
    return {
      dateKey,
      rides: 0,
      earnings: 0,
      distanceMeters: 0,
      activeMinutes: 0,
      activeSeconds: 0,
      updatedAt: null,
    };
  }

  return {
    dateKey,
    rides: normalizeNumber(summary?.rides),
    earnings: normalizeNumber(summary?.earnings),
    distanceMeters: normalizeNumber(summary?.distanceMeters),
    activeMinutes: normalizeNumber(summary?.activeMinutes),
    activeSeconds: normalizeNumber(summary?.activeSeconds),
    updatedAt: summary?.updatedAt ? new Date(summary.updatedAt) : null,
  };
};

const pruneDailyActivity = (dailyActivity = []) => {
  const normalized = Array.isArray(dailyActivity) ? dailyActivity : [];
  return normalized
    .filter((item) => item?.date)
    .slice(-35);
};

const appendDailyActivityMinutes = (dailyActivity = [], dateKey, minutes) => {
  if (!dateKey || minutes <= 0) {
    return pruneDailyActivity(dailyActivity);
  }

  const next = [...(Array.isArray(dailyActivity) ? dailyActivity : [])];
  const existingIndex = next.findIndex((item) => item?.date === dateKey);

  if (existingIndex >= 0) {
    next[existingIndex] = {
      date: dateKey,
      activeMinutes: normalizeNumber(next[existingIndex]?.activeMinutes) + minutes,
    };
  } else {
    next.push({
      date: dateKey,
      activeMinutes: minutes,
    });
  }

  return pruneDailyActivity(next);
};

export const mergeOnlineSessionIntoTracking = (tracking = {}, sessionStart, sessionEnd = new Date()) => {
  const start = sessionStart ? new Date(sessionStart) : null;
  const end = sessionEnd ? new Date(sessionEnd) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return {
      ...tracking,
      dailyActivity: pruneDailyActivity(tracking?.dailyActivity),
    };
  }

  let cursor = new Date(start);
  let nextDailyActivity = Array.isArray(tracking?.dailyActivity) ? [...tracking.dailyActivity] : [];

  while (cursor < end) {
    const cursorDayKey = toIstDayKey(cursor);
    const nextDayStartUtc = new Date(`${cursorDayKey}T18:30:00.000Z`);
    const segmentEnd = nextDayStartUtc > cursor && nextDayStartUtc < end ? nextDayStartUtc : end;
    const minutes = Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / (60 * 1000)));

    nextDailyActivity = appendDailyActivityMinutes(nextDailyActivity, cursorDayKey, minutes);
    cursor = segmentEnd;
  }

  return {
    ...tracking,
    dailyActivity: nextDailyActivity,
  };
};

export const buildDriverTodaySummaryFromDocument = (driver, { now = new Date() } = {}) => {
  const todayKey = toIstDayKey(now);
  const liveTracking = mergeOnlineSessionIntoTracking(
    driver?.incentiveTracking || {},
    driver?.incentiveTracking?.currentOnlineStartedAt,
    now,
  );
  const todayActivity = Array.isArray(liveTracking?.dailyActivity)
    ? liveTracking.dailyActivity.find((item) => item?.date === todayKey)
    : null;

  const baseSummary = mergeSummary(driver?.todaySummary, todayKey);
  const activeMinutes = Math.min(
    normalizeNumber(todayActivity?.activeMinutes),
    getElapsedIstDayMinutes(now),
  );

  return {
    ...baseSummary,
    activeMinutes,
    activeSeconds: Math.round(activeMinutes * 60),
    updatedAt: now,
  };
};

export const syncDriverTodaySummaryDocument = async (driver, { now = new Date() } = {}) => {
  if (!driver?._id) {
    return null;
  }

  const nextSummary = buildDriverTodaySummaryFromDocument(driver, { now });

  const currentSummary = mergeSummary(driver?.todaySummary, nextSummary.dateKey);
  const changed =
    currentSummary.rides !== nextSummary.rides ||
    currentSummary.earnings !== nextSummary.earnings ||
    currentSummary.distanceMeters !== nextSummary.distanceMeters ||
    currentSummary.activeMinutes !== nextSummary.activeMinutes ||
    currentSummary.activeSeconds !== nextSummary.activeSeconds ||
    String(driver?.todaySummary?.dateKey || '') !== nextSummary.dateKey;

  if (!changed) {
    return nextSummary;
  }

  await Driver.updateOne(
    { _id: driver._id },
    {
      $set: {
        todaySummary: nextSummary,
      },
    },
  );

  if (driver.todaySummary) {
    driver.todaySummary = nextSummary;
  }

  return nextSummary;
};

export const incrementDriverTodaySummaryForCompletedRide = async ({ driverId, completedAt, driverEarnings, distanceMeters }) => {
  if (!driverId) {
    return;
  }

  const now = completedAt ? new Date(completedAt) : new Date();
  const todayKey = toIstDayKey(now);
  const driver = await Driver.findById(driverId).select('_id todaySummary incentiveTracking');

  if (!driver) {
    return;
  }

  const syncedSummary = buildDriverTodaySummaryFromDocument(driver, { now });
  const nextSummary = {
    ...syncedSummary,
    rides: normalizeNumber(syncedSummary.rides) + 1,
    earnings: normalizeNumber(syncedSummary.earnings) + normalizeNumber(driverEarnings),
    distanceMeters: normalizeNumber(syncedSummary.distanceMeters) + normalizeNumber(distanceMeters),
    dateKey: todayKey,
    updatedAt: now,
  };

  await Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        todaySummary: nextSummary,
      },
    },
  );
};
