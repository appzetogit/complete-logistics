import mongoose from 'mongoose';
import { Ride } from '../../user/models/Ride.js';
import { RIDE_STATUS } from '../../constants/index.js';

// The driver's "Your Performance" numbers: completed rides only, days and weeks in IST
// (weeks start on Monday, like the app's Earnings tab).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// How far back the streak is looked for. A longer streak is shown as this many days.
const STREAK_LOOKBACK_DAYS = 120;

// 'YYYY-MM-DD' of the IST calendar day that contains `date`.
export const istDayKey = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

// UTC instant at which the IST day containing `date` starts.
const istDayStart = (date) => {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
};

// UTC instant at which the IST week (Monday 00:00 IST) containing `date` starts.
const istWeekStart = (date) => {
  const dayStart = istDayStart(date);
  const istWeekday = new Date(dayStart.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (istWeekday + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
};

/**
 * Consecutive IST days with at least one completed ride, counted back from today. A streak that ended
 * yesterday is still alive until today ends (a driver who has not finished a ride yet this morning keeps it).
 */
export const computeDayStreak = (dayKeysWithRides, now = new Date()) => {
  const days = new Set(dayKeysWithRides);
  let cursor = istDayStart(now);
  if (!days.has(istDayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  let streak = 0;
  while (days.has(istDayKey(cursor)) && streak < STREAK_LOOKBACK_DAYS) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
};

export const getDriverPerformance = async (driverId, { now = new Date() } = {}) => {
  const todayStart = istDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const thisWeekStart = istWeekStart(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * DAY_MS);
  const lookbackStart = new Date(Math.min(
    todayStart.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS,
    lastWeekStart.getTime(),
  ));

  const perDay = await Ride.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(String(driverId)),
        status: RIDE_STATUS.COMPLETED,
        completedAt: { $gte: lookbackStart, $lte: now },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'Asia/Kolkata' } },
        rides: { $sum: 1 },
      },
    },
  ]);

  const countsByDay = new Map(perDay.map((row) => [row._id, row.rides]));
  const sumBetween = (start, end) => {
    let total = 0;
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += DAY_MS) {
      total += countsByDay.get(istDayKey(cursor)) || 0;
    }
    return total;
  };

  return {
    dayStreak: computeDayStreak([...countsByDay.keys()], now),
    ridesToday: countsByDay.get(istDayKey(todayStart)) || 0,
    ridesYesterday: countsByDay.get(istDayKey(yesterdayStart)) || 0,
    tripsThisWeek: sumBetween(thisWeekStart, new Date(todayStart.getTime() + DAY_MS)),
    tripsLastWeek: sumBetween(lastWeekStart, thisWeekStart),
  };
};
