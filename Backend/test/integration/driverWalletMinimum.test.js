// Real-database tests: a driver whose wallet was flagged "blocked" while the admin's minimum balance was higher must be
// let in again once the minimum is lowered (the stored flag is a cache, the live balance and settings decide).
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { bootstrap } from './harness.js';

let t;
let walletService;
let AdminAppSetting;
let invalidateCachedValue;

before(async () => {
  t = await bootstrap();
  walletService = await import('../../src/modules/taxi/driver/services/walletService.js');
  AdminAppSetting = (await import('../../src/modules/taxi/admin/models/AdminAppSetting.js')).AdminAppSetting;
  ({ invalidateCachedValue } = await import('../../src/utils/cache.js'));
});
after(async () => { await t.stop(); });

const setMinimumBalance = async (value) => {
  await AdminAppSetting.updateOne(
    { scope: 'default' },
    { $set: { 'wallet_setting.driver_wallet_minimum_amount_to_get_an_order': String(value) } },
    { upsert: true },
  );
  await invalidateCachedValue('cache:settings:wallet');
};

// the callers pass the driver document (an ObjectId would be mistaken for one, it has an _id getter)
const ensure = async (driverId) => walletService.ensureDriverWalletCanAcceptRide(await t.m.Driver.findById(driverId));
const storedFlag = async (driverId) => (await t.m.Driver.findById(driverId).lean()).wallet.isBlocked;

test('minimum 0, balance 0, stale blocked flag: the driver is let in and the flag is cleared', async () => {
  await setMinimumBalance(0);
  const { driver } = await t.factories.driver({ wallet: { balance: 0, cashLimit: 100, isBlocked: true } });

  const wallet = await ensure(driver._id);
  assert.equal(wallet.balance, 0);
  assert.equal(await storedFlag(driver._id), false, 'the stale flag is reset');
});

test('the wallet the app shows is not blocked for that driver either', async () => {
  await setMinimumBalance(0);
  const { driver } = await t.factories.driver({ wallet: { balance: 0, cashLimit: 100, isBlocked: true } });
  const serialized = await walletService.serializeDriverWallet(await t.m.Driver.findById(driver._id));
  assert.equal(serialized.isBlocked, false);
});

test('balance below the minimum is still refused, and the flag is set', async () => {
  await setMinimumBalance(0);
  const { driver } = await t.factories.driver({ wallet: { balance: -10, cashLimit: 0, isBlocked: false } });

  await assert.rejects(
    ensure(driver._id),
    (error) => error.statusCode === 403 && /minimum balance is not met/i.test(error.message),
  );
  assert.equal(await storedFlag(driver._id), true);
});

test('a negative minimum (cash debt allowed) lets a driver in even with a stale flag', async () => {
  await setMinimumBalance(-50);
  const { driver } = await t.factories.driver({ wallet: { balance: -10, cashLimit: 50, isBlocked: true } });

  await ensure(driver._id);
  assert.equal(await storedFlag(driver._id), false);

  const { driver: deeper } = await t.factories.driver({ wallet: { balance: -60, cashLimit: 50, isBlocked: false } });
  await assert.rejects(ensure(deeper._id), (error) => error.statusCode === 403);
});

test('raising the minimum again blocks a driver who is now below it', async () => {
  await setMinimumBalance(100);
  const { driver } = await t.factories.driver({ wallet: { balance: 40, cashLimit: 0, isBlocked: false } });
  await assert.rejects(ensure(driver._id), (error) => error.statusCode === 403);
  assert.equal(await storedFlag(driver._id), true);
});
