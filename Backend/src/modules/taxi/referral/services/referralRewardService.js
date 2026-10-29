import mongoose from 'mongoose';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { UserWallet } from '../../user/models/UserWallet.js';
import { WalletTransaction } from '../../driver/models/WalletTransaction.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { REWARD_STATUS, logReferral } from '../constants.js';
import { ReferralReward } from '../models/ReferralReward.js';

// A claim that has been PROCESSING this long is assumed to belong to a crashed request and may be taken over.
const STALE_PROCESSING_MS = 2 * 60 * 1000;

export const getReferralProgramSettings = async (program) => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const config = setting?.referral?.[program] || {};

  return {
    enabled: Boolean(config.enabled),
    type: String(config.type || 'instant_referrer').trim().toLowerCase(),
    amount: Math.max(0, Number(config.amount || 0) || 0),
    rideCount: Math.max(0, Number(config.ride_count || 0) || 0),
  };
};

const toAmount = (value) => Math.round(Math.max(0, Number(value || 0) || 0) * 100) / 100;

const isTransactionUnsupported = (error) =>
  error?.code === 20 || /replica set|Transaction numbers are only allowed/i.test(String(error?.message || ''));

// Runs fn(session) in a transaction when the deployment supports them, else once without a session.
const runAtomically = async (fn) => {
  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      return fn(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const walletAlreadyHasReference = async (reward) => {
  if (reward.payeeType === 'user') {
    return Boolean(
      await UserWallet.exists({ userId: reward.payeeId, 'transactions.referenceKey': reward.referenceKey }),
    );
  }

  return Boolean(
    await WalletTransaction.exists({ driverId: reward.payeeId, 'metadata.referenceKey': reward.referenceKey }),
  );
};

const creditWallet = async (reward, session) => {
  if (reward.payeeType === 'user') {
    await UserWallet.updateOne(
      { userId: reward.payeeId },
      {
        $inc: { balance: reward.amount },
        $push: {
          transactions: {
            $each: [
              {
                kind: 'credit',
                amount: reward.amount,
                title: reward.title || 'Referral Reward',
                referenceKey: reward.referenceKey,
              },
            ],
            $slice: -50,
          },
        },
      },
      { session },
    );
    return;
  }

  await applyDriverWalletAdjustment({
    driverId: reward.payeeId,
    amount: reward.amount,
    type: 'adjustment',
    description: reward.title || 'Referral Reward',
    metadata: {
      ...(reward.metadata || {}),
      referenceKey: reward.referenceKey,
      source: 'driver_referral',
    },
    session,
  });
};

const markCredited = (reward, { legacy = false, session = null } = {}) =>
  ReferralReward.updateOne(
    { _id: reward._id },
    { $set: { status: REWARD_STATUS.CREDITED, creditedAt: new Date(), lockedAt: null, lastError: '', legacy } },
    { session },
  );

// Takes the payout for this process. Only one caller can hold it: others get null.
const claimReward = (referenceKey) =>
  ReferralReward.findOneAndUpdate(
    {
      referenceKey,
      $or: [
        { status: { $in: [REWARD_STATUS.PENDING, REWARD_STATUS.FAILED] } },
        { status: REWARD_STATUS.PROCESSING, lockedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      ],
    },
    { $set: { status: REWARD_STATUS.PROCESSING, lockedAt: new Date() }, $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  );

/** True when this payout was made (or is being made) already: a ledger row, or a wallet entry from before the ledger. */
export const referralRewardAlreadyPaid = async ({ payeeType, payeeId, referenceKey }) => {
  if (await ReferralReward.exists({ referenceKey })) {
    return true;
  }
  return walletAlreadyHasReference({ payeeType, payeeId, referenceKey });
};

/** Pays one ledger row once. Returns 'credited' | 'existing' | 'failed'. Never throws. */
const processReward = async (referenceKey) => {
  const reward = await claimReward(referenceKey);

  if (!reward) {
    logReferral('REFERRAL_REWARD_ALREADY_EXISTS', { referenceKey });
    return 'existing';
  }

  try {
    // paid before the ledger existed (or by a crashed attempt that did commit): record it, do not pay again
    if (await walletAlreadyHasReference(reward)) {
      await markCredited(reward, { legacy: true });
      logReferral('REFERRAL_REWARD_ALREADY_EXISTS', { referenceKey, legacy: true });
      return 'existing';
    }

    if (reward.payeeType === 'user') {
      await UserWallet.updateOne(
        { userId: reward.payeeId },
        { $setOnInsert: { userId: reward.payeeId, balance: 0, refundWallet: 0, transactions: [] } },
        { upsert: true },
      );
    }

    await runAtomically(async (session) => {
      await creditWallet(reward, session);
      await markCredited(reward, { session });
    });

    logReferral('REFERRAL_REWARD_CREATED', {
      referenceKey,
      payeeType: reward.payeeType,
      payeeId: String(reward.payeeId),
      amount: reward.amount,
    });
    return 'credited';
  } catch (error) {
    await ReferralReward.updateOne(
      { _id: reward._id },
      { $set: { status: REWARD_STATUS.FAILED, lockedAt: null, lastError: String(error?.message || error).slice(0, 500) } },
    ).catch(() => null);
    logReferral('REFERRAL_REWARD_FAILED', {
      referenceKey,
      payeeType: reward.payeeType,
      payeeId: String(reward.payeeId),
      error: String(error?.message || error).slice(0, 200),
    });
    return 'failed';
  }
};

/**
 * Pays a referral reward exactly once for `referenceKey`, however many requests race (unique ledger row + atomic claim).
 * Returns 'credited' | 'existing' | 'skipped' | 'failed'. A 'failed' payout stays in the ledger and is retried by
 * retryPendingReferralRewards() or by the next call with the same key.
 */
export const creditReferralReward = async ({
  payeeType,
  payeeId,
  amount,
  title = '',
  referenceKey,
  referrerId = null,
  referredId = null,
  metadata = {},
}) => {
  const normalizedAmount = toAmount(amount);
  const key = String(referenceKey || '').trim();

  if (!['user', 'driver'].includes(payeeType) || !payeeId || normalizedAmount <= 0 || !key) {
    return 'skipped';
  }

  try {
    await ReferralReward.updateOne(
      { referenceKey: key },
      {
        $setOnInsert: {
          referenceKey: key,
          payeeType,
          payeeId,
          referrerId,
          referredId,
          amount: normalizedAmount,
          title: String(title || 'Referral Reward').trim(),
          metadata,
          status: REWARD_STATUS.PENDING,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // two requests upserting the same new key: the loser just proceeds to the claim
    if (error?.code !== 11000) {
      throw error;
    }
  }

  return processReward(key);
};

/** Retries payouts that failed, never started or were left half-way by a crash. Safe to run at any time. */
export const retryPendingReferralRewards = async ({ limit = 50, olderThanMs = 60 * 1000 } = {}) => {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await ReferralReward.find({
    $or: [
      { status: REWARD_STATUS.FAILED },
      { status: REWARD_STATUS.PENDING, updatedAt: { $lt: cutoff } },
      { status: REWARD_STATUS.PROCESSING, lockedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
    ],
  })
    .select('referenceKey')
    .limit(Math.max(1, Math.min(500, Number(limit) || 50)))
    .lean();

  const summary = { checked: rows.length, credited: 0, existing: 0, failed: 0 };

  for (const row of rows) {
    const result = await processReward(row.referenceKey);
    summary[result] = (summary[result] || 0) + 1;
  }

  return summary;
};

let retryTimer = null;

export const startReferralRewardRetryLoop = ({ intervalMs = 5 * 60 * 1000 } = {}) => {
  if (retryTimer) {
    return;
  }

  retryTimer = setInterval(() => {
    retryPendingReferralRewards().catch((error) => {
      console.error('[referral] reward retry failed', error?.message || error);
    });
  }, intervalMs);
  retryTimer.unref?.();
};
