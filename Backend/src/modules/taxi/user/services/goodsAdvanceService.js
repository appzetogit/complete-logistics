import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { RIDE_STATUS } from '../../constants/index.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { getTransportRideSettings } from '../../services/transportSettingsService.js';
import { razorpayRequest, resolveRazorpayCredentials, signaturesMatch } from '../../services/razorpayClient.js';
import { Ride } from '../models/Ride.js';
import { UserWallet } from '../models/UserWallet.js';

// 20% (configurable) advance on goods bookings.
//
//   pending  -> rider has not paid yet; the ride must NOT be dispatched
//   paid     -> advance held by the platform; ride is dispatched
//   refunded -> driver cancelled / no driver found / admin cancelled: the whole advance goes back
//   forfeited-> rider cancelled: `keptAmount` (a share of the FARE, goods_advance_cancel_keep_percent,
//               default 15%, never more than the advance) is kept and the rest, `refundedAmount`, goes back
//
// Every state change is an atomic compare-and-set on the ride, so a repeated
// verify/refund/forfeit call can never pay or refund twice.

export const GOODS_ADVANCE_PAYMENT_WINDOW_MS = 30 * 60 * 1000;
const REFUND_DESTINATIONS = ['refund_wallet', 'wallet', 'source'];
// Share of the fare that is kept when the rider cancels after paying the advance.
export const DEFAULT_CANCEL_KEEP_PERCENT = 15;


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

/**
 * The advance shares a rider may choose from: the default percent, plus 100
 * (pay in full) when allowed. Empty when the advance is off.
 */
export const getAdvanceOptions = (config) => {
  const percent = Number(config?.percent || 0);
  if (!(percent > 0)) {
    return [];
  }
  return config.allowFull && percent < 100 ? [percent, 100] : [percent];
};

// The client only picks from the allowed list; anything else falls back to the default.
export const pickAdvancePercent = (config, requestedPercent) => {
  const requested = Number(requestedPercent);
  return getAdvanceOptions(config).includes(requested) ? requested : Number(config?.percent || 0);
};

export const getGoodsAdvanceConfig = async () => {
  const settings = await getTransportRideSettings();
  const rawPercent = settings.goods_advance_percent;
  const percent = Number.isFinite(Number(rawPercent)) && String(rawPercent).trim() !== ''
    ? Math.min(100, Math.max(0, Number(rawPercent)))
    : 20;
  const refundTo = String(settings.goods_advance_refund_to || 'refund_wallet').trim().toLowerCase();
  const rawAllowFull = String(settings.goods_advance_allow_full ?? 'true').trim().toLowerCase();
  const allowFull = !['false', '0', 'no', 'off'].includes(rawAllowFull);
  const rawKeep = settings.goods_advance_cancel_keep_percent;
  const cancelKeepPercent = Number.isFinite(Number(rawKeep)) && String(rawKeep ?? '').trim() !== ''
    ? Math.min(100, Math.max(0, Number(rawKeep)))
    : DEFAULT_CANCEL_KEEP_PERCENT;

  return {
    percent,
    allowFull,
    cancelKeepPercent,
    refundTo: REFUND_DESTINATIONS.includes(refundTo) ? refundTo : 'refund_wallet',
  };
};

/**
 * How a paid advance is split when the rider cancels: `keepPercent` of the FARE is kept, but never more
 * than the advance itself; everything else goes back. A keep share at or above the advance share
 * refunds nothing. Returns { keptAmount, refundAmount } (both >= 0, together the advance).
 */
export const splitAdvanceOnRiderCancel = ({ fare, advanceAmount, keepPercent }) => {
  const advance = Math.max(0, roundMoney(advanceAmount));
  const safeKeep = Math.min(100, Math.max(0, Number.isFinite(Number(keepPercent)) ? Number(keepPercent) : 0));
  const share = roundMoney((Math.max(0, roundMoney(fare)) * safeKeep) / 100);
  const keptAmount = Math.min(advance, share);

  return { keptAmount, refundAmount: roundMoney(advance - keptAmount) };
};

/**
 * Advance block to store on a new ride, or undefined when none applies.
 * Goods only. `waived` is true when the rider pays nothing for the ride
 * anyway (free ride / subscription cover).
 */
export const resolveGoodsAdvanceForNewRide = async ({ serviceType, fare, waived = false, requestedPercent, deps = {} }) => {
  if (String(serviceType || '').toLowerCase() !== 'parcel' || waived) {
    return undefined;
  }

  const config = await (deps.getConfig || getGoodsAdvanceConfig)();
  const chosenPercent = pickAdvancePercent(config, requestedPercent);
  const { percent, amount } = computeGoodsAdvance({ fare, percent: chosenPercent });

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

export const serializeGoodsAdvance = (ride) => {
  const advance = ride?.goodsAdvance || {};
  const amount = Number(advance.amount || 0);
  let keptAmount = roundMoney(advance.keptAmount);
  let refundedAmount = roundMoney(advance.refundedAmount);

  // Advances settled before the split was stored: a rider-cancelled one was kept whole, a refunded one went back whole.
  if (advance.status === 'forfeited' && !keptAmount && !refundedAmount) {
    keptAmount = roundMoney(amount);
  }
  if (advance.status === 'refunded' && !refundedAmount) {
    refundedAmount = roundMoney(amount);
  }

  return {
    percent: Number(advance.percent || 0),
    amount,
    status: advance.status || 'none',
    // "Advance paid ₹54 · Online · 03:46 PM": how and when it was paid, and what happened to it.
    provider: advance.provider || '',
    paidAt: advance.paidAt || null,
    refundDestination: advance.refundDestination || '',
    refundedAt: advance.refundedAt || null,
    forfeitedAt: advance.forfeitedAt || null,
    // After a rider cancel: "₹150 charged, ₹50 refunded".
    keptAmount,
    refundedAmount,
  };
};

// ---------------------------------------------------------------- Razorpay



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
    {
      $set: { 'goodsAdvance.provider': 'razorpay', 'goodsAdvance.providerOrderId': order.id },
      $addToSet: { 'goodsAdvance.providerOrderIds': order.id },
    },
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

/**
 * Applies a captured Razorpay payment to the goods advance it was made for, no matter
 * which path learned about it first (checkout verify, webhook or reconcile).
 * Identified by the order notes we wrote when creating the order, and checked against
 * the advance amount. Idempotent: the same payment twice is a no-op; a second payment
 * on an advance that is already settled (or a booking that closed) is refunded.
 * Returns { handled, ride?, alreadyPaid?, refunded?, reason? }.
 */
export const applyGatewayAdvancePayment = async ({ orderId, paymentId, amountPaise, notes = {}, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const rideId = String(notes?.rideId || '');

  if (notes?.purpose !== 'goods_advance' || !mongoose.isValidObjectId(rideId) || !orderId || !paymentId) {
    return { handled: false, reason: 'not_a_goods_advance_payment' };
  }

  const ride = await RideModel.findOne({ _id: rideId, serviceType: 'parcel' });
  if (!ride || !ride.goodsAdvance || ride.goodsAdvance.status === 'none') {
    return { handled: false, reason: 'booking_not_found' };
  }

  if (notes.userId && String(ride.userId) !== String(notes.userId)) {
    return { handled: false, reason: 'rider_mismatch' };
  }

  const expectedPaise = Math.round(roundMoney(ride.goodsAdvance.amount) * 100);
  if (Number(amountPaise) !== expectedPaise) {
    return { handled: false, reason: 'amount_mismatch' };
  }

  if (ride.goodsAdvance.providerPaymentId === paymentId) {
    return { handled: true, ride, alreadyPaid: true };
  }

  const refundThisPayment = async (reason) => {
    await refundRazorpayPayment({
      paymentId,
      amount: ride.goodsAdvance.amount,
      notes: { rideId: String(ride._id), reason },
      deps,
    }).catch((error) => {
      console.error('Goods advance auto-refund failed', String(ride._id), paymentId, error?.message || error);
    });
    return { handled: true, ride, refunded: true, reason };
  };

  if (ride.goodsAdvance.status !== 'pending') {
    return refundThisPayment('advance_already_settled');
  }

  const duplicate = await RideModel.exists({
    _id: { $ne: ride._id },
    'goodsAdvance.providerPaymentId': paymentId,
  });
  if (duplicate) {
    return { handled: false, reason: 'payment_used_elsewhere' };
  }

  const paid = await RideModel.findOneAndUpdate(
    { _id: ride._id, status: RIDE_STATUS.SEARCHING, 'goodsAdvance.status': 'pending' },
    {
      $set: {
        'goodsAdvance.status': 'paid',
        'goodsAdvance.provider': 'razorpay',
        'goodsAdvance.providerOrderId': orderId,
        'goodsAdvance.providerPaymentId': paymentId,
        'goodsAdvance.paidAt': new Date(),
      },
      $addToSet: { 'goodsAdvance.providerOrderIds': orderId },
    },
    { returnDocument: 'after' },
  );

  if (!paid) {
    return refundThisPayment('booking_closed_before_payment');
  }

  return { handled: true, ride: paid, alreadyPaid: false };
};

const WEBHOOK_PAYMENT_EVENTS = new Set(['payment.captured', 'order.paid']);

/**
 * Razorpay webhook. The signature is checked against the RAW request body with
 * RAZORPAY_WEBHOOK_SECRET. Only payment.captured / order.paid for goods advances are acted on;
 * everything else is acknowledged and ignored.
 */
export const handleRazorpayWebhook = async ({ rawBody, signature, deps = {} }) => {
  const secret = String(deps.webhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET ?? '').trim();
  if (!secret) {
    throw new ApiError(503, 'Razorpay webhook is not configured');
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (!signature || !signaturesMatch(expected, signature)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    throw new ApiError(400, 'Invalid webhook body');
  }

  if (!WEBHOOK_PAYMENT_EVENTS.has(event?.event)) {
    return { handled: false, reason: 'ignored_event' };
  }

  const payment = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;
  const orderId = String(payment?.order_id || orderEntity?.id || '');
  if (!payment?.id || !orderId || payment.status !== 'captured') {
    return { handled: false, reason: 'no_payment' };
  }

  let notes = orderEntity?.notes?.purpose ? orderEntity.notes : payment?.notes;
  if (!notes?.purpose) {
    // Payment entities do not always carry the order's notes: read them from the order.
    const { keyId, keySecret } = await (deps.resolveCredentials || resolveRazorpayCredentials)();
    const order = await (deps.razorpayRequest || razorpayRequest)({
      method: 'GET',
      path: `/orders/${encodeURIComponent(orderId)}`,
      keyId,
      keySecret,
    });
    notes = order?.notes || {};
  }

  return applyGatewayAdvancePayment({
    orderId,
    paymentId: String(payment.id),
    amountPaise: payment.amount,
    notes,
    deps,
  });
};

/**
 * The rider's app lost the verify call after paying (network, timeout). Asks Razorpay
 * about every order created for this booking and applies a captured payment if there is one.
 * Returns { ride, alreadyPaid }.
 */
export const reconcileGoodsAdvancePayment = async ({ rideId, userId, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const ride = await loadOwnPendingAdvanceRide({ rideId, userId, RideModel });

  if (ride.goodsAdvance.status === 'paid') {
    return { ride, alreadyPaid: true };
  }
  if (ride.goodsAdvance.status !== 'pending') {
    throw new ApiError(409, 'The advance for this booking is not payable');
  }

  const orderIds = [...new Set([
    ride.goodsAdvance.providerOrderId,
    ...(ride.goodsAdvance.providerOrderIds || []),
  ].filter(Boolean))];

  if (!orderIds.length) {
    throw new ApiError(404, 'No online payment was started for this booking');
  }

  const { keyId, keySecret } = await (deps.resolveCredentials || resolveRazorpayCredentials)();
  const request = deps.razorpayRequest || razorpayRequest;

  for (const orderId of orderIds) {
    const [order, payments] = await Promise.all([
      request({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}`, keyId, keySecret }),
      request({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}/payments`, keyId, keySecret }),
    ]);
    const captured = (payments?.items || []).find((item) => item?.status === 'captured');
    if (!captured) {
      continue;
    }

    const result = await applyGatewayAdvancePayment({
      orderId,
      paymentId: String(captured.id),
      amountPaise: captured.amount,
      notes: order?.notes || {},
      deps,
    });

    if (result.handled && result.ride && !result.refunded) {
      return { ride: result.ride, alreadyPaid: Boolean(result.alreadyPaid) };
    }
    if (result.refunded) {
      throw new ApiError(409, 'This booking is no longer open. Any amount paid will be refunded.');
    }
  }

  throw new ApiError(404, 'No completed payment was found for this booking yet');
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
          $each: [{ kind: 'credit', amount, title, provider, walletField: field }],
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

/** 'source' only when asked for AND the advance was paid through Razorpay; otherwise one of the wallets. */
const resolveRefundDestination = (ride, config) => {
  const canRefundToSource =
    ride.goodsAdvance.provider === 'razorpay' && Boolean(ride.goodsAdvance.providerPaymentId);

  if (config.refundTo === 'source' && canRefundToSource) {
    return 'source';
  }

  return config.refundTo === 'refund_wallet' ? 'refund_wallet' : 'wallet';
};

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
  const destination = resolveRefundDestination(ride, config);

  const claimFilter = { _id: ride._id, serviceType: 'parcel', 'goodsAdvance.status': 'paid' };
  const claimUpdate = {
    $set: {
      'goodsAdvance.status': 'refunded',
      'goodsAdvance.refundedAt': new Date(),
      'goodsAdvance.refundDestination': destination,
      'goodsAdvance.refundedAmount': amount,
      'goodsAdvance.keptAmount': 0,
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
        {
          $set: {
            'goodsAdvance.status': 'paid',
            'goodsAdvance.refundedAt': null,
            'goodsAdvance.refundDestination': '',
            'goodsAdvance.refundedAmount': 0,
          },
        },
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
 * The rider cancelled after paying the advance. `goods_advance_cancel_keep_percent` of the FARE (default 15%,
 * never more than the advance) is kept; the rest of the advance goes back to the rider, to the same place
 * a normal refund goes (refund wallet / wallet / the original Razorpay payment).
 *
 *   fare 1000, advance 200 (20%)  -> kept 150, refunded 50
 *   fare 1000, paid in full 1000  -> kept 150, refunded 850
 *
 * The kept part goes to the assigned driver when the pricing rule sends cancellation fees to the driver
 * (`creditDriver`), otherwise the platform keeps it. The driver gets only the kept part.
 *
 * Safe to call repeatedly: every state change is a compare-and-set on `paid`, so only one call settles it.
 * A wallet refund, the driver credit and the status change are one transaction. A Razorpay refund is an
 * external call: the status is claimed first and put back to `paid` if the gateway fails, so it can be retried.
 *
 * Returns { forfeited, status, amount, keptAmount, refundedAmount, refundDestination, creditedToDriver };
 * `amount` is the kept part. When nothing is kept (keep percent 0) the advance is simply refunded in full.
 */
const loadConfigOrDefaults = async (deps) => {
  try {
    return await (deps.getConfig || getGoodsAdvanceConfig)();
  } catch (error) {
    // The rider already cancelled: settle with the defaults rather than leave the advance unsettled.
    console.error('Goods advance settings could not be loaded; using the defaults', error?.message || error);
    return { cancelKeepPercent: DEFAULT_CANCEL_KEEP_PERCENT, refundTo: 'refund_wallet' };
  }
};

/**
 * What a rider cancel would do to a PAID goods advance, without changing anything. Uses the same split and
 * destination rules as forfeitGoodsAdvance, so the preview always matches the real cancel.
 * Returns zeros when the ride has no paid advance.
 */
export const previewAdvanceOnRiderCancel = async (ride, deps = {}) => {
  if (ride?.serviceType !== 'parcel' || ride?.goodsAdvance?.status !== 'paid') {
    return { keptAmount: 0, refundAmount: 0, refundDestination: '', keepPercent: 0 };
  }

  const config = await loadConfigOrDefaults(deps);
  const { keptAmount, refundAmount } = splitAdvanceOnRiderCancel({
    fare: ride.fare,
    advanceAmount: ride.goodsAdvance.amount,
    keepPercent: config.cancelKeepPercent,
  });

  return {
    keptAmount,
    refundAmount,
    refundDestination: refundAmount > 0 ? resolveRefundDestination(ride, config) : '',
    keepPercent: config.cancelKeepPercent,
  };
};

export const forfeitGoodsAdvance = async ({ rideId, creditDriver = false, deps = {} }) => {
  const RideModel = deps.Ride || Ride;
  const WalletModel = deps.UserWallet || UserWallet;
  const applyDriverCredit = deps.applyDriverWalletAdjustment || applyDriverWalletAdjustment;
  const runInTransaction = deps.runInTransaction || defaultRunInTransaction;

  const notSettled = {
    forfeited: false,
    status: '',
    amount: 0,
    keptAmount: 0,
    refundedAmount: 0,
    refundDestination: '',
    creditedToDriver: false,
  };

  const ride = await RideModel.findOne({ _id: rideId, serviceType: 'parcel', 'goodsAdvance.status': 'paid' });
  if (!ride) {
    return notSettled;
  }

  const config = await loadConfigOrDefaults(deps);
  const { keptAmount, refundAmount } = splitAdvanceOnRiderCancel({
    fare: ride.fare,
    advanceAmount: ride.goodsAdvance.amount,
    keepPercent: config.cancelKeepPercent,
  });

  if (keptAmount <= 0) {
    // Nothing to keep (keep percent 0, or no fare): it is an ordinary full refund.
    const result = await refundGoodsAdvance({ rideId, reason: 'cancelled_by_rider', deps });
    return result.refunded
      ? { ...notSettled, status: 'refunded', refundedAmount: result.amount, refundDestination: result.destination }
      : notSettled;
  }

  const destination = refundAmount > 0 ? resolveRefundDestination(ride, config) : '';
  const settledAt = new Date();
  const filter = { _id: ride._id, serviceType: 'parcel', 'goodsAdvance.status': 'paid' };
  const update = {
    $set: {
      'goodsAdvance.status': 'forfeited',
      'goodsAdvance.forfeitedAt': settledAt,
      'goodsAdvance.keptAmount': keptAmount,
      'goodsAdvance.refundedAmount': refundAmount,
      ...(refundAmount > 0
        ? { 'goodsAdvance.refundedAt': settledAt, 'goodsAdvance.refundDestination': destination }
        : {}),
    },
  };

  // Only the kept part goes to the driver.
  const creditDriverWithKept = async (claimed, session) => {
    if (!claimed.driverId || keptAmount <= 0) {
      return false;
    }

    await applyDriverCredit({
      driverId: claimed.driverId,
      rideId: claimed._id,
      amount: keptAmount,
      type: 'adjustment',
      description: `Advance received for rider-cancelled goods booking ${String(claimed._id).slice(-6)}`,
      metadata: { source: 'goods_advance_forfeit', rideId: String(claimed._id) },
      session,
    });
    return true;
  };

  const settled = (creditedToDriver) => ({
    forfeited: true,
    status: 'forfeited',
    amount: keptAmount,
    keptAmount,
    refundedAmount: refundAmount,
    refundDestination: destination,
    creditedToDriver,
  });

  // ---- refund back to the original Razorpay payment (external call)
  if (destination === 'source') {
    const claimed = await RideModel.findOneAndUpdate(filter, update, { returnDocument: 'before' });
    if (!claimed) {
      return notSettled;
    }

    try {
      await refundRazorpayPayment({
        paymentId: claimed.goodsAdvance.providerPaymentId,
        amount: refundAmount,
        notes: { rideId: String(claimed._id), reason: 'cancelled_by_rider' },
        deps,
      });
    } catch (error) {
      await RideModel.updateOne(
        { _id: claimed._id, 'goodsAdvance.status': 'forfeited' },
        {
          $set: {
            'goodsAdvance.status': 'paid',
            'goodsAdvance.forfeitedAt': null,
            'goodsAdvance.keptAmount': 0,
            'goodsAdvance.refundedAmount': 0,
            'goodsAdvance.refundedAt': null,
            'goodsAdvance.refundDestination': '',
          },
        },
      ).catch(() => null);
      throw error;
    }

    let creditedToDriver = false;
    if (creditDriver) {
      try {
        creditedToDriver = await creditDriverWithKept(claimed, undefined);
      } catch (error) {
        // The rider's refund already went through; the platform keeps the kept part.
        console.error('Goods advance driver credit failed; platform keeps it', String(rideId), error?.message || error);
      }
    }

    return settled(creditedToDriver);
  }

  // ---- refund to a wallet (or nothing to refund): status, rider credit and driver credit are one transaction
  if (refundAmount > 0) {
    await ensureUserWallet(ride.userId, WalletModel);
  }

  const settle = async (session, withDriverCredit) => {
    const options = session ? { session } : {};
    const claimed = await RideModel.findOneAndUpdate(filter, update, { returnDocument: 'before', ...options });

    if (!claimed) {
      return null;
    }

    if (refundAmount > 0) {
      await creditUserWallet({
        userId: claimed.userId,
        amount: refundAmount,
        field: destination === 'refund_wallet' ? 'refundWallet' : 'balance',
        title: `Goods advance refund for cancelled booking ${String(claimed._id).slice(-6)}`,
        provider: 'goods_advance_refund',
        WalletModel,
        session,
      });
    }

    return { creditedToDriver: withDriverCredit ? await creditDriverWithKept(claimed, session) : false };
  };

  let outcome;

  if (creditDriver || refundAmount > 0) {
    try {
      outcome = await runInTransaction((session) => settle(session, creditDriver));
    } catch (error) {
      if (!creditDriver) {
        throw error;
      }
      // The driver credit failed and the transaction rolled back. The rider still cancelled, so settle again
      // without it: the rider still gets the refund and the platform keeps the kept part.
      console.error('Goods advance driver credit failed; platform keeps it', String(rideId), error?.message || error);
      outcome = await runInTransaction((session) => settle(session, false));
    }
  } else {
    outcome = await settle(undefined, false);
  }

  return outcome ? settled(outcome.creditedToDriver) : notSettled;
};
