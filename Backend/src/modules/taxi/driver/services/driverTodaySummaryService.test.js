import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDriverTodaySummaryFromDocument,
  clampOnlineSessionEnd,
  ONLINE_SESSION_SILENCE_GRACE_MS,
} from './driverTodaySummaryService.js';

const MIN = 60 * 1000;
const IST = 5.5 * 60 * MIN;
// A UTC instant for an IST wall-clock time on 13 Oct 2026.
const ist = (hh, mm, day = 13) => new Date(Date.UTC(2026, 9, day, hh, mm) - IST);

test('a session ends shortly after the app went silent, not at "now"', () => {
  const start = ist(9, 0);
  const lastSeenAt = ist(10, 0);
  const now = ist(15, 0);
  const end = clampOnlineSessionEnd({ lastSeenAt }, start, now);
  assert.equal(end.getTime(), lastSeenAt.getTime() + ONLINE_SESSION_SILENCE_GRACE_MS);
});

test('an app that is still reporting keeps its session open up to now', () => {
  const now = ist(15, 0);
  assert.equal(clampOnlineSessionEnd({ lastSeenAt: ist(14, 58) }, ist(9, 0), now).getTime(), now.getTime());
  assert.equal(clampOnlineSessionEnd({}, ist(9, 0), now).getTime(), now.getTime(), 'no heartbeat yet: as before');
});

test('a heartbeat older than the session start ends it at the start (zero, never negative)', () => {
  const start = ist(9, 0);
  assert.equal(clampOnlineSessionEnd({ lastSeenAt: ist(7, 0) }, start, ist(12, 0)).getTime(), start.getTime());
});

test('online since yesterday evening, app killed before midnight: today has no active time', () => {
  const driver = {
    incentiveTracking: {
      currentOnlineStartedAt: ist(20, 0, 12),
      lastSeenAt: ist(22, 0, 12),
      dailyActivity: [],
    },
  };
  const summary = buildDriverTodaySummaryFromDocument(driver, { now: ist(0, 47) });
  assert.equal(summary.activeMinutes, 0);
});

test('online across midnight with the app alive: today counts from midnight only', () => {
  const driver = {
    incentiveTracking: {
      currentOnlineStartedAt: ist(23, 30, 12),
      lastSeenAt: ist(0, 46),
      dailyActivity: [],
    },
  };
  const summary = buildDriverTodaySummaryFromDocument(driver, { now: ist(0, 47) });
  assert.equal(summary.activeMinutes, 47);
});

test('went online at 00:30: 17 minutes at 00:47, not minutes since midnight', () => {
  const driver = {
    incentiveTracking: {
      currentOnlineStartedAt: ist(0, 30),
      lastSeenAt: ist(0, 46),
      dailyActivity: [],
    },
  };
  assert.equal(buildDriverTodaySummaryFromDocument(driver, { now: ist(0, 47) }).activeMinutes, 17);
});
