// node --test src/modules/taxi/driver/services/driverCancelService.test.js
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017';
process.env.JWT_SECRET ??= 'test-secret-for-driver-cancel';

const {
  assertDriverNotCancelBlocked,
  clearDriverCancelBlock,
  computeCancelStatus,
  istDateKey,
  nextIstDayStart,
  registerDriverCancel,
  serializeCancelStatus,
} = await import('./driverCancelService.js');

// 2026-03-10 14:00 IST == 08:30 UTC
const at = (iso) => new Date(iso);
const NOON_IST = at('2026-03-10T06:30:00Z');

const makeDriverModel = (initial = {}) => {
  const doc = { cancelTracking: {}, isOnline: true, incentiveTracking: { currentOnlineStartedAt: new Date() }, ...initial };
  return {
    doc,
    findById: () => ({ select: async () => doc }),
    updateOne: async (_filter, update) => {
      for (const [path, value] of Object.entries(update.$set || {})) {
        const keys = path.split('.');
        const last = keys.pop();
        const target = keys.reduce((node, key) => (node[key] ??= {}), doc);
        target[last] = value;
      }
      return { modifiedCount: 1 };
    },
    findOneAndUpdate: (_filter, update) => ({
      select: async () => {
        for (const [path, value] of Object.entries(update.$set || {})) {
          const keys = path.split('.');
          const last = keys.pop();
          keys.reduce((node, key) => (node[key] ??= {}), doc)[last] = value;
        }
        return doc;
      },
    }),
  };
};

test('IST day key and next-day start use the IST calendar, not UTC', () => {
  // 20:00 UTC on the 9th is already 01:30 IST on the 10th.
  assert.equal(istDateKey(at('2026-03-09T20:00:00Z')), '2026-03-10');
  assert.equal(istDateKey(at('2026-03-09T18:29:00Z')), '2026-03-09');
  // Next IST midnight after 14:00 IST on the 10th is 00:00 IST on the 11th = 18:30 UTC on the 10th.
  assert.equal(nextIstDayStart(NOON_IST).toISOString(), '2026-03-10T18:30:00.000Z');
});

test('status: counts only today, and reports cancels left', () => {
  const today = istDateKey(NOON_IST);
  const status = computeCancelStatus({ tracking: { dateKey: today, count: 2 }, now: NOON_IST, limit: 3 });
  assert.equal(status.count, 2);
  assert.equal(status.cancelsLeft, 1);
  assert.equal(status.blocked, false);

  const stale = computeCancelStatus({ tracking: { dateKey: '2026-03-09', count: 5 }, now: NOON_IST, limit: 3 });
  assert.equal(stale.count, 0);
  assert.equal(stale.cancelsLeft, 3);
});

test('1st and 2nd cancel are allowed; the 3rd blocks the driver until next IST day and forces offline', async () => {
  const Driver = makeDriverModel();
  const run = () => registerDriverCancel({ driverId: 'd1', now: NOON_IST, deps: { Driver, limit: 3 } });

  const first = await run();
  assert.equal(first.count, 1);
  assert.equal(first.cancelsLeft, 2);
  assert.equal(first.blocked, false);
  assert.equal(Driver.doc.isOnline, true);

  const second = await run();
  assert.equal(second.cancelsLeft, 1);
  assert.equal(second.blocked, false);

  const third = await run();
  assert.equal(third.count, 3);
  assert.equal(third.cancelsLeft, 0);
  assert.equal(third.blocked, true);
  assert.equal(third.blockedUntil.toISOString(), '2026-03-10T18:30:00.000Z');
  assert.equal(Driver.doc.isOnline, false);
  assert.equal(Driver.doc.incentiveTracking.currentOnlineStartedAt, null);
});

test('the block lifts at the next IST day and the count restarts', async () => {
  const Driver = makeDriverModel();
  for (let i = 0; i < 3; i += 1) {
    await registerDriverCancel({ driverId: 'd1', now: NOON_IST, deps: { Driver, limit: 3 } });
  }

  const nextMorning = at('2026-03-10T19:00:00Z'); // 00:30 IST on the 11th
  assert.doesNotThrow(() => assertDriverNotCancelBlocked(Driver.doc, { now: nextMorning }));
  assert.equal(computeCancelStatus({ tracking: Driver.doc.cancelTracking, now: nextMorning, limit: 3 }).count, 0);

  const again = await registerDriverCancel({ driverId: 'd1', now: nextMorning, deps: { Driver, limit: 3 } });
  assert.equal(again.count, 1);
  assert.equal(again.blocked, false);
});

test('a blocked driver is rejected with 403 and a blockedUntil', async () => {
  const Driver = makeDriverModel();
  for (let i = 0; i < 3; i += 1) {
    await registerDriverCancel({ driverId: 'd1', now: NOON_IST, deps: { Driver, limit: 3 } });
  }

  assert.throws(
    () => assertDriverNotCancelBlocked(Driver.doc, { now: NOON_IST }),
    (error) => error.statusCode === 403 && error.details.code === 'DRIVER_CANCEL_BLOCKED' && Boolean(error.details.blockedUntil),
  );
  assert.doesNotThrow(() => assertDriverNotCancelBlocked({ cancelTracking: {} }, { now: NOON_IST }));
});

test('limit 0 counts cancels but never blocks', async () => {
  const Driver = makeDriverModel();
  let status;
  for (let i = 0; i < 5; i += 1) {
    status = await registerDriverCancel({ driverId: 'd1', now: NOON_IST, deps: { Driver, limit: 0 } });
  }
  assert.equal(status.count, 5);
  assert.equal(status.blocked, false);
  assert.equal(Driver.doc.isOnline, true);
});

test('admin can clear the block and the count', async () => {
  const Driver = makeDriverModel();
  for (let i = 0; i < 3; i += 1) {
    await registerDriverCancel({ driverId: 'd1', now: NOON_IST, deps: { Driver, limit: 3 } });
  }

  const cleared = await clearDriverCancelBlock({ driverId: 'd1', deps: { Driver, limit: 3 } });
  assert.equal(cleared.blocked, false);
  assert.equal(Driver.doc.cancelTracking.blockedUntil, null);
  assert.equal(Driver.doc.cancelTracking.count, 0);
});

test('app-facing shape', () => {
  const shape = serializeCancelStatus({
    limit: 3, count: 3, cancelsLeft: 0, blocked: true, blockedUntil: new Date('2026-03-10T18:30:00Z'),
  });
  assert.deepEqual(shape, {
    cancelLimit: 3,
    cancelsToday: 3,
    cancelsLeft: 0,
    cancelBlocked: true,
    blockedUntil: '2026-03-10T18:30:00.000Z',
  });
});
