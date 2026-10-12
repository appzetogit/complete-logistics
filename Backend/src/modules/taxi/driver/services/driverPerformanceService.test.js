// node --test src/modules/taxi/driver/services/driverPerformanceService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret';
const { computeDayStreak, istDayKey } = await import('./driverPerformanceService.js');

// 2026-10-12 10:00 IST (a Monday)
const now = new Date('2026-10-12T04:30:00.000Z');

test('IST day keys roll over at IST midnight, not UTC', () => {
  assert.equal(istDayKey(new Date('2026-10-11T18:29:00.000Z')), '2026-10-11'); // 23:59 IST
  assert.equal(istDayKey(new Date('2026-10-11T18:31:00.000Z')), '2026-10-12'); // 00:01 IST
});

test('streak counts consecutive days ending today', () => {
  assert.equal(computeDayStreak(['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-08'], now), 3);
});

test('no ride yet today keeps the streak that ended yesterday', () => {
  assert.equal(computeDayStreak(['2026-10-11', '2026-10-10'], now), 2);
});

test('a missed day breaks it; nothing recent means 0', () => {
  assert.equal(computeDayStreak(['2026-10-10', '2026-10-09'], now), 0);
  assert.equal(computeDayStreak([], now), 0);
});
