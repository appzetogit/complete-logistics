import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { RIDE_STATUS } from '../constants/index.js';
import { Ride } from '../user/models/Ride.js';
import { UserWallet } from '../user/models/UserWallet.js';

// Paying a ride from the rider's in-app wallet (paymentMethod 'wallet').
//
//   booking   -> the amount due is HELD: moved from `balance` to `heldBalance` (so `balance` is what the rider can
//                still spend). Not enough balance -> the booking is refused (INSUFFICIENT_WALLET_BALANCE).
//   complete  -> the hold is captured, anything above it is taken from the free balance, the unused part of the
//                hold is released. What the wallet cannot cover is left as `walletShortfall` (payable by the usual
//                completion payment). Never below zero. Runs once per ride.
//   cancel    -> the whole hold is released (a cancellation fee is then charged from the balance as usual).
//
// Every movement is a wallet transaction the rider sees in their history.

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const shortId = (rideId) => String(rideId).slice(-6);

const ensureWallet = (userId, session = null) => UserWallet.updateOne(
  { userId },
  { $setOnInsert: { userId, balance: 0, refundWallet: 0, heldBalance: 0, transactions: [] } },
  { upsert: true, session },
);

const walletTx = ({ kind, amount, title, provider, referenceKey }) => ({
  kind,
  amount: roundMoney(amount),
  title,
  provider,
  referenceKey,
  providerPaymentId: '',
});

/** The part of a ride's fare the wallet pays: the fare less a goods advance paid (or to be paid) online. */
export const walletAmountDueForRide = (ride, { includePendingAdvance = false } = {}) => {
  const fare = roundMoney(ride?.fare || 0);
  const advanceStatus = String(ride?.goodsAdvance?.status || '');
  const advance = advanceStatus === 'paid' || (includePendingAdvance && advanceStatus === 'pending')
    ? roundMoney(ride.goodsAdvance.amount)
    : 0;
  return Math.max(0, roundMoney(fare - advance));
};

/**
 * Reserve `amount` of the rider's wallet for a ride being booked. Atomic: two bookings at once cannot both hold
 * money that is only there once. Throws INSUFFICIENT_WALLET_BALANCE (402) when the balance is short.
 */
export const holdWalletForRide = async ({ userId, rideId, amount }) => {
  const safeAmount = roundMoney(amount);
  if (!(safeAmount > 0)) return null;

  await ensureWallet(userId);
  const result = await UserWallet.updateOne(
    { userId, balance: { $gte: safeAmount } },
    {
      $inc: { balance: -safeAmount, heldBalance: safeAmount },
      $push: {
        transactions: {
          $each: [walletTx({
            kind: 'hold',
            amount: safeAmount,
            title: `Held for ride ${shortId(rideId)}`,
            provider: 'ride_wallet_hold',
            referenceKey: `ride-wallet:${rideId}:hold`,
          })],
          $slice: -50,
        },
      },
    },
  );

  if (!result.modifiedCount) {
    const wallet = await UserWallet.findOne({ userId }).select('balance').lean();
    const balance = roundMoney(wallet?.balance || 0);
    throw new ApiError(402, `Wallet balance ₹${balance} is less than the fare ₹${safeAmount}. Add money or choose another method.`, {
      code: 'INSUFFICIENT_WALLET_BALANCE',
      balance,
      required: safeAmount,
      shortBy: roundMoney(safeAmount - balance),
    });
  }

  return { amount: safeAmount, at: new Date(), status: 'held' };
};

// Move `amount` from heldBalance back to balance (never letting heldBalance go negative).
const returnHeldToBalance = async ({ userId, rideId, amount, title, session = null }) => {
  const safeAmount = roundMoney(amount);
  if (!(safeAmount > 0)) return;
  const wallet = await UserWallet.findOne({ userId }).select('heldBalance').session(session).lean();
  const fromHeld = Math.min(safeAmount, roundMoney(wallet?.heldBalance || 0));
  await UserWallet.updateOne(
    { userId },
    {
      $inc: { balance: safeAmount, heldBalance: -fromHeld },
      $push: {
        transactions: {
          $each: [walletTx({
            kind: 'release',
            amount: safeAmount,
            title,
            provider: 'ride_wallet_release',
            referenceKey: `ride-wallet:${rideId}:release`,
          })],
          $slice: -50,
        },
      },
    },
    { session },
  );
};

/** Undo a hold taken for a booking that was then not created. */
export const releaseUncommittedHold = ({ userId, rideId, amount }) => returnHeldToBalance({
  userId,
  rideId,
  amount,
  title: `Released: booking ${shortId(rideId)} was not created`,
});

/**
 * Release the whole hold of a ride that ended without a trip (cancelled, no driver, expired, replaced). Safe to
 * call more than once and on rides without a hold: only the first call moves money.
 */
export const releaseRideWalletHold = async ({ rideId, reason = 'Ride cancelled', session = null }) => {
  if (!rideId) return { released: 0 };
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, 'walletHold.status': 'held' },
    { $set: { 'walletHold.status': 'released', 'walletHold.releasedAt': new Date() } },
    { returnDocument: 'before', session },
  ).select('userId walletHold').lean();
  if (!ride) return { released: 0 };

  const amount = roundMoney(ride.walletHold?.amount || 0);
  await returnHeldToBalance({
    userId: ride.userId,
    rideId,
    amount,
    title: `Released: ${reason} (ride ${shortId(rideId)})`,
    session,
  });
  return { released: amount };
};

/**
 * Pay a completed wallet ride from the wallet. Runs once per ride (the claim on `walletPayment.at` is part of the
 * transaction), so a retried completion never debits twice. Returns the payment summary, or null when there is
 * nothing to do (not a wallet ride, not completed, already paid).
 */
export const captureRideWalletPayment = async ({ rideId }) => {
  const session = await mongoose.startSession();
  try {
    let summary = null;
    await session.withTransaction(async () => {
      summary = null;
      const now = new Date();
      const ride = await Ride.findOneAndUpdate(
        {
          _id: rideId,
          paymentMethod: 'wallet',
          status: RIDE_STATUS.COMPLETED,
          'walletPayment.at': null,
        },
        { $set: { 'walletPayment.at': now } },
        { returnDocument: 'after', session },
      );
      if (!ride) return;

      const collectionPaid = Boolean(ride.driverPaymentCollection?.paidAt)
        || ['paid', 'captured', 'success', 'completed'].includes(String(ride.driverPaymentCollection?.status || '').toLowerCase());
      const due = collectionPaid ? 0 : walletAmountDueForRide(ride);
      const held = ride.walletHold?.status === 'held' ? roundMoney(ride.walletHold.amount) : 0;

      const fromHold = Math.min(held, due);
      const unusedHold = roundMoney(held - fromHold);
      const extra = roundMoney(due - fromHold);

      await ensureWallet(ride.userId, session);
      const wallet = await UserWallet.findOne({ userId: ride.userId }).select('balance heldBalance').session(session).lean();
      const fromBalance = Math.min(Math.max(0, roundMoney(wallet?.balance || 0)), extra);
      const shortfall = roundMoney(extra - fromBalance);
      const paid = roundMoney(fromHold + fromBalance);
      const transferId = crypto.randomUUID();

      const transactions = [];
      if (paid > 0) {
        transactions.push(walletTx({
          kind: 'debit',
          amount: paid,
          title: `Ride payment for ${shortId(ride._id)}`,
          provider: 'ride_wallet_auto',
          referenceKey: `ride-wallet:${ride._id}:capture`,
        }));
      }
      if (unusedHold > 0) {
        transactions.push(walletTx({
          kind: 'release',
          amount: unusedHold,
          title: `Released: unused hold for ride ${shortId(ride._id)}`,
          provider: 'ride_wallet_release',
          referenceKey: `ride-wallet:${ride._id}:release`,
        }));
      }
      if (transactions.length || held > 0) {
        await UserWallet.updateOne(
          { userId: ride.userId },
          {
            $inc: {
              heldBalance: -Math.min(held, roundMoney(wallet?.heldBalance || 0)),
              balance: roundMoney(unusedHold - fromBalance),
            },
            ...(transactions.length ? { $push: { transactions: { $each: transactions, $slice: -50 } } } : {}),
          },
          { session },
        );
      }

      if (held > 0) {
        ride.walletHold.status = 'captured';
        ride.walletHold.capturedAmount = fromHold;
      }
      ride.walletPayment = { amount: paid, transferId, at: now };
      ride.walletShortfall = shortfall;
      if (due > 0 && shortfall === 0) {
        // Fully paid: the rider app shows no payment sheet.
        ride.driverPaymentCollection = {
          provider: 'wallet',
          providerId: transferId,
          providerOrderId: '',
          providerPaymentId: transferId,
          providerMode: 'wallet_internal',
          source: 'ride_wallet_auto',
          status: 'paid',
          amount: paid,
          currency: 'INR',
          linkUrl: '',
          paidAt: now,
          updatedAt: now,
        };
      }
      await ride.save({ session });
      summary = { rideId: String(ride._id), due, paid, shortfall, fromHold, fromBalance, released: unusedHold };
    });
    return summary;
  } finally {
    await session.endSession();
  }
};

/**
 * Backstop: release holds still marked 'held' on rides that ended without a trip (in case a cancel path did not).
 */
export const releaseStaleRideWalletHolds = async ({ limit = 50 } = {}) => {
  const rides = await Ride.find({ 'walletHold.status': 'held', status: RIDE_STATUS.CANCELLED })
    .select('_id')
    .limit(limit)
    .lean();
  let released = 0;
  for (const ride of rides) {
    const result = await releaseRideWalletHold({ rideId: ride._id, reason: 'Ride cancelled' }).catch(() => ({ released: 0 }));
    if (result.released > 0) released += 1;
  }
  return released;
};
