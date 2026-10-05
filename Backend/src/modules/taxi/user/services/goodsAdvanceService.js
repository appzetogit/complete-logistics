import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';
import { Ride } from '../models/Ride.js';
import { UserWallet } from '../models/UserWallet.js';

// 20% (configurable) advance on goods bookings.
//
//   pending  -> rider has not paid yet; the ride must NOT be dispatched
//   paid     -> advance held by the platform; ride is dispatched
//   refunded -> driver cancelled / no driver found / admin cancelled
//   forfeited-> rider cancelled; advance is kept (not refunded)
//
// Every state change is an atomic compare-and-set on the ride, so a repeated
// verify/refund/forfeit call can never pay or refund twice.

export const GOODS_ADVANCE_PAYMENT_WINDOW_MS = 30 * 60 * 1000;
const REFUND_DESTINATIONS = ['refund_wallet', 'wallet', 'source'];

// Loaded lazily: paymentGatewayService pulls in adminService, which would make
// this module part of an import cycle with rideService/dispatchService.
const resolveRazorpayCredentials = async () => {
  const { resolveConfiguredGatewayCredentials } = await import('../../services/paymentGatewayService.js');
  return resolveConfiguredGatewayCredentials('razor_pay');
};

// Money moves and the ride's advance status change together or not at all.
// Retries transient write conflicts (e.g. a double-tapped pay button).
const defaultRunInTransaction = (work) => mongoose.connection.transaction(work);

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const computeGoodsAdvance = ({ fare, percent }) => {
  const safeFare = Math.max(0, roundMoney(fare));
  const safePercent = Math.min(100, Math.max(0, Number.isFinite(Number(percent)) ? Number(percent) : 0));
  const amount = Math.min(safeFare, roundMoney((safeFare * safePercent) / 100));

  return {
    percent: safePercent,
    amount,
    remainingAmount: roundMoney(safeFare - amount),
  };
};

export const getGoodsAdvanceConfig = async () => {
  const settings = await getTransportRideSettings();
  const rawPercent = settings.goods_advance_percent;
  const percent = Number.isFinite(Number(rawPercent)) && String(rawPercent).trim() !== ''
    ? Math.min(100, Math.max(0, Number(rawPercent)))
    : 20;
  const refundTo = String(settings.goods_advance_refund_to || 'refund_wallet').trim().toLowerCase();

  return {
    percent,
    refundTo: REFUND_DESTINATIONS.includes(refundTo) ? refundTo : 'refund_wallet',
  };
};

/**
 * Advance block to store on a new ride, or undefined when none applies.
 * Goods only. `waived` is true when the rider pays nothing for the ride
 * anyway (free ride / subscription cover).
 */
export const resolveGoodsAdvanceForNewRide = async ({ serviceType, fare, waived = false, deps = {} }) => {
  if (String(serviceType || '').toLowerCase() !== 'parcel' || waived) {
    return undefined;
  }

  const config = await (deps.getConfig || getGoodsAdvanceConfig)();
  const { percent, amount } = computeGoodsAdvance({ fare, percent: config.percent });

  if (percent <= 0 || amount <= 0) {
    return undefined;
  }

  return { percent, amount, status: 'pending' };
};

export const isDispatchBlockedByAdvance = (ride) => ride?.goodsAdvance?.status === 'pending';

export const getAdvancePaidAmount = (ride) =>
  ride?.goodsAdvance?.status === 'paid' ? roundMoney(ride.goodsAdvance.amount) : 0;

export const getRemainingFare = (ride) => {
  const fare = roundMoney(ride?.fare || 0);
  const status = ride?.goodsAdvance?.status;
  const amount = status === 'pending' || status === 'paid' ? roundMoney(ride.goodsAdvance.amount) : 0;
  return Math.max(0, roundMoney(fare - amount));
};

export const serializeGoodsAdvance = (ride) => ({
  percent: Number(ride?.goodsAdvance?.percent || 0),
  amount: Number(ride?.goodsAdvance?.amount || 0),
  status: ride?.goodsAdvance?.status || 'none',
});

// ---------------------------------------------------------------- Razorpay

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status || 502,
      payload?.error?.description || payload?.error?.message || 'Razorpay request failed',
    );
  }

  return payload;
};

const signaturesMatch = (expected, received) => {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const loadOwnPendingAdvanceRide = async ({ rideId, userId, RideModel }) => {
  const ride = await RideModel.findOne({ _id: rideId, userId });

  if (!ride || ride.serviceType !== 'parcel' || !ride.goodsAdvance || ride.goodsAdvance.status === 'none') {
    throw new ApiError(404, 'Goods booking with an advance was not found');
  }

  return ride;
};

export const createGoodsAdvanceOrder = async ({ rideId, userId, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const ride = await loadOwnPendingAdvanceRide({ rideId, userId, RideModel });

  if (ride.goodsAdvance.status !== 'pending' || ride.status !== RIDE_STATUS.SEARCHING) {
    throw new ApiError(409, 'The advance for this booking is not payable');
  }

  const { keyId, keySecret } = await (deps.resolveCredentials || resolveRazorpayCredentials)();
  const request = deps.razorpayRequest || razorpayRequest;
  const amount = roundMoney(ride.goodsAdvance.amount);
  const compactRideId = String(ride._id).slice(-8);
  const compactUserId = String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';

  const order = await request({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: `gadv_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`,
      notes: {
        rideId: String(ride._id),
        userId: String(userId),
        purpose: 'goods_advance',
      },
    },
    keyId,
    keySecret,
  });

  // Only the latest order for this ride can be verified.
  await RideModel.updateOne(
    { _id: ride._id, 'goodsAdvance.status': 'pending' },
    { $set: { 'goodsAdvance.provider': 'razorpay', 'goodsAdvance.providerOrderId': order.id } },
  );

  return {
    keyId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || 'INR',
    advanceAmount: amount,
    remainingAmount: getRemainingFare(ride),
  };
};

export const refundRazorpayPayment = async ({ paymentId, amount, notes = {}, deps = {} }) => {
  const { keyId, keySecret } = await (deps.resolveCredentials || resolveRazorpayCredentials)();
  return (deps.razorpayRequest || razorpayRequest)({
    method: 'POST',
    path: `/payments/${encodeURIComponent(paymentId)}/refund`,
    body: { amount: Math.round(roundMoney(amount) * 100), notes },
    keyId,
    keySecret,
  });
};

/**
 * Verifies the Razorpay checkout result and marks the advance paid.
 * The order must be the one created for this ride, belong to this rider, and
 * match the advance amount; a payment can only ever be applied to one ride.
 * Returns { ride, alreadyPaid }.
 */
export const verifyGoodsAdvancePayment = async ({
  rideId,
  userId,
  orderId,
  paymentId,
  signature,
  deps = {},
}) => {
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const RideModel = deps.Ride || Ride;
  const ride = await loadOwnPendingAdvanceRide({ rideId, userId, RideModel });

  if (ride.goodsAdvance.status === 'paid' && ride.goodsAdvance.providerPaymentId === paymentId) {
    return { ride, alreadyPaid: true };
  }

  if (ride.goodsAdvance.providerOrderId !== orderId) {
    throw new ApiError(400, 'This payment does not belong to the booking');
  }

  const { keyId, keySecret } = await (deps.resolveCredentials || resolveRazorpayCredentials)();
  const expectedSignature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');

  if (!signaturesMatch(expectedSignature, signature)) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await (deps.razorpayRequest || razorpayRequest)({
    method: 'GET',
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId,
    keySecret,
  });

  const expectedPaise = Math.round(roundMoney(ride.goodsAdvance.amount) * 100);
  if (
    Number(order?.amount) !== expectedPaise ||
    String(order?.notes?.rideId || '') !== String(ride._id) ||
    String(order?.notes?.userId || '') !== String(userId) ||
    order?.notes?.purpose !== 'goods_advance'
  ) {
    throw new ApiError(400, 'Verified payment does not match this booking advance');
  }

  const duplicate = await RideModel.exists({
    _id: { $ne: ride._id },
    'goodsAdvance.providerPaymentId': paymentId,
  });
  if (duplicate) {
    throw new ApiError(409, 'This payment was already used for another booking');
  }

  const paid = await RideModel.findOneAndUpdate(
    {
      _id: ride._id,
      userId,
      status: RIDE_STATUS.SEARCHING,
      'goodsAdvance.status': 'pending',
      'goodsAdvance.providerOrderId': orderId,
    },
    {
      $set: {
        'goodsAdvance.status': 'paid',
        'goodsAdvance.provider': 'razorpay',
        'goodsAdvance.providerPaymentId': paymentId,
        'goodsAdvance.paidAt': new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!paid) {
    // The rider paid but the booking is no longer open (cancelled/expired in
    // the meantime): send the money back to the original payment.
    const latest = await RideModel.findById(ride._id).select('status goodsAdvance').lean();
    if (latest?.goodsAdvance?.status === 'pending') {
      await refundRazorpayPayment({
        paymentId,
        amount: ride.goodsAdvance.amount,
        notes: { rideId: String(ride._id), reason: 'booking_closed_before_payment' },
        deps,
      }).catch((error) => {
        console.error('Goods advance auto-refund failed', String(ride._id), paymentId, error?.message || error);
      });
    }
    throw new ApiError(409, 'This booking is no longer open. Any amount paid will be refunded.');
  }

  return { ride: paid, alreadyPaid: false };
};

// ------------------------------------------------------------------ Wallet

const ensureUserWallet = async (userId, WalletModel) =>
  WalletModel.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true },
  );

const creditUserWallet = async ({ userId, amount, field, title, provider, WalletModel, session }) =>
  WalletModel.updateOne(
    { userId },
    {
      $inc: { [field]: amount },
      $push: {
        transactions: {
          $each: [{ kind: 'credit', amount, title, provider }],
          $slice: -50,
        },
      },
    },
    session ? { session } : {},
  );

/**
 * Pays the advance from the rider's spendable wallet balance.
 * The debit and the ride's pending -> paid change happen in one transaction, so
 * a double tap, or a cancel racing the payment, can never charge without
 * marking the booking paid (or the other way round).
 */
export const payGoodsAdvanceWithWallet = async ({ rideId, userId, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const WalletModel = deps.UserWallet || UserWallet;
  const runInTransaction = deps.runInTransaction || defaultRunInTransaction;
  const ride = await loadOwnPendingAdvanceRide({ rideId, userId, RideModel });

  if (ride.goodsAdvance.status === 'paid' && ride.goodsAdvance.provider === 'wallet') {
    return { ride, alreadyPaid: true };
  }

  if (ride.goodsAdvance.status !== 'pending' || ride.status !== RIDE_STATUS.SEARCHING) {
    throw new ApiError(409, 'The advance for this booking is not payable');
  }

  const amount = roundMoney(ride.goodsAdvance.amount);
  const transferId = crypto.randomUUID();

  await ensureUserWallet(userId, WalletModel);

  try {
    const paid = await runInTransaction(async (session) => {
      const options = session ? { session } : {};

      const debited = await WalletModel.updateOne(
        { userId, balance: { $gte: amount } },
        {
          $inc: { balance: -amount },
          $push: {
            transactions: {
              $each: [{
                kind: 'debit',
                amount,
                title: `Advance for goods booking ${String(ride._id).slice(-6)}`,
                provider: 'goods_advance_wallet',
                providerPaymentId: transferId,
              }],
              $slice: -50,
            },
          },
        },
        options,
      );

      if (!debited?.modifiedCount) {
        throw new ApiError(400, 'Insufficient wallet balance');
      }

      const updated = await RideModel.findOneAndUpdate(
        { _id: ride._id, userId, status: RIDE_STATUS.SEARCHING, 'goodsAdvance.status': 'pending' },
        {
          $set: {
            'goodsAdvance.status': 'paid',
            'goodsAdvance.provider': 'wallet',
            'goodsAdvance.providerOrderId': '',
            'goodsAdvance.providerPaymentId': transferId,
            'goodsAdvance.paidAt': new Date(),
          },
        },
        { returnDocument: 'after', ...options },
      );

      if (!updated) {
        // Rolls back the debit above.
        throw new ApiError(409, 'This booking is no longer open. Your wallet was not charged.');
      }

      return updated;
    });

    return { ride: paid, alreadyPaid: false };
  } catch (error) {
    if (error?.statusCode === 409) {
      // A duplicate payment (double tap) that lost the race: already paid is success.
      const latest = await RideModel.findOne({ _id: ride._id, userId });
      if (latest?.goodsAdvance?.status === 'paid' && latest.goodsAdvance.provider === 'wallet') {
        return { ride: latest, alreadyPaid: true };
      }
    }
    throw error;
  }
};

// ------------------------------------------------------- Refund / forfeit

/**
 * Refunds a paid advance (driver cancelled, no driver found, admin cancelled).
 * Safe to call repeatedly: only the first call that finds the advance `paid`
 * does anything. Returns { refunded, destination, amount }.
 *
 * Refunds into the rider's wallet are transactional with the status change, so
 * a crash cannot leave a refunded booking with no money returned. A refund to
 * the original Razorpay payment is an external call: the status is claimed
 * first and put back to `paid` if the gateway call fails, so it can be retried.
 */
export const refundGoodsAdvance = async ({ rideId, reason = '', deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const WalletModel = deps.UserWallet || UserWallet;
  const runInTransaction = deps.runInTransaction || defaultRunInTransaction;

  const ride = await RideModel.findOne({ _id: rideId, serviceType: 'parcel', 'goodsAdvance.status': 'paid' });
  if (!ride) {
    return { refunded: false, destination: '', amount: 0 };
  }

  const amount = roundMoney(ride.goodsAdvance.amount);
  const config = await (deps.getConfig || getGoodsAdvanceConfig)();
  const canRefundToSource =
    ride.goodsAdvance.provider === 'razorpay' && Boolean(ride.goodsAdvance.providerPaymentId);
  const destination = config.refundTo === 'source' && canRefundToSource
    ? 'source'
    : config.refundTo === 'refund_wallet'
      ? 'refund_wallet'
      : 'wallet';

  const claimFilter = { _id: ride._id, serviceType: 'parcel', 'goodsAdvance.status': 'paid' };
  const claimUpdate = {
    $set: {
      'goodsAdvance.status': 'refunded',
      'goodsAdvance.refundedAt': new Date(),
      'goodsAdvance.refundDestination': destination,
    },
  };

  if (destination === 'source') {
    const claimed = await RideModel.findOneAndUpdate(claimFilter, claimUpdate, { returnDocument: 'before' });
    if (!claimed) {
      return { refunded: false, destination: '', amount: 0 };
    }

    try {
      await refundRazorpayPayment({
        paymentId: claimed.goodsAdvance.providerPaymentId,
        amount,
        notes: { rideId: String(claimed._id), reason },
        deps,
      });
    } catch (error) {
      await RideModel.updateOne(
        { _id: claimed._id, 'goodsAdvance.status': 'refunded' },
        { $set: { 'goodsAdvance.status': 'paid', 'goodsAdvance.refundedAt': null, 'goodsAdvance.refundDestination': '' } },
      ).catch(() => null);
      throw error;
    }

    return { refunded: true, destination, amount };
  }

  await ensureUserWallet(ride.userId, WalletModel);

  const claimed = await runInTransaction(async (session) => {
    const options = session ? { session } : {};
    const won = await RideModel.findOneAndUpdate(claimFilter, claimUpdate, { returnDocument: 'before', ...options });

    if (!won) {
      return null;
    }

    await creditUserWallet({
      userId: won.userId,
      amount,
      field: destination === 'refund_wallet' ? 'refundWallet' : 'balance',
      title: `Goods advance refund for booking ${String(won._id).slice(-6)}`,
      provider: 'goods_advance_refund',
      WalletModel,
      session,
    });

    return won;
  });

  return claimed
    ? { refunded: true, destination, amount }
    : { refunded: false, destination: '', amount: 0 };
};

/**
 * Rider cancelled: the advance is kept. Optionally passes it to the assigned
 * driver (when the pricing rule says cancellation fees go to the driver); in
 * that case the status change and the driver credit are one transaction.
 * Returns { forfeited, amount, creditedToDriver }.
 */
export const forfeitGoodsAdvance = async ({ rideId, creditDriver = false, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const applyDriverCredit = deps.applyDriverWalletAdjustment || applyDriverWalletAdjustment;
  const runInTransaction = deps.runInTransaction || defaultRunInTransaction;

  const filter = { _id: rideId, serviceType: 'parcel', 'goodsAdvance.status': 'paid' };
  const update = { $set: { 'goodsAdvance.status': 'forfeited', 'goodsAdvance.forfeitedAt': new Date() } };

  const run = async (session, withDriverCredit = creditDriver) => {
    const options = session ? { session } : {};
    const claimed = await RideModel.findOneAndUpdate(filter, update, { returnDocument: 'before', ...options });

    if (!claimed) {
      return null;
    }

    const amount = roundMoney(claimed.goodsAdvance.amount);
    let creditedToDriver = false;

    if (withDriverCredit && claimed.driverId && amount > 0) {
      await applyDriverCredit({
        driverId: claimed.driverId,
        rideId: claimed._id,
        amount,
        type: 'adjustment',
        description: `Advance received for rider-cancelled goods booking ${String(claimed._id).slice(-6)}`,
        metadata: { source: 'goods_advance_forfeit', rideId: String(claimed._id) },
        session,
      });
      creditedToDriver = true;
    }

    return { forfeited: true, amount, creditedToDriver };
  };

  let outcome;

  if (creditDriver) {
    try {
      outcome = await runInTransaction((session) => run(session, true));
    } catch (error) {
      // The driver credit failed and the transaction rolled back. The rider
      // still cancelled, so forfeit anyway and let the platform keep the advance.
      console.error('Goods advance driver credit failed; forfeiting to platform', String(rideId), error?.message || error);
      outcome = await run(undefined, false);
    }
  } else {
    outcome = await run(undefined, false);
  }

  return outcome || { forfeited: false, amount: 0, creditedToDriver: false };
};
