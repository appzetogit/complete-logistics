import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { PaymentOrder, PAYMENT_ORDER_STATUS } from '../models/PaymentOrder.js';
import {
  createCashfreeOrder,
  createCashfreeRefund,
  fetchCashfreeRefund,
  fetchCashfreeOrderPayments,
  resolveCashfreeCredentials,
  verifyCashfreeWebhookSignature,
} from '../../services/cashfreeClient.js';
import { applyDriverWalletAdjustment } from '../../driver/services/walletService.js';
import { UserWallet } from '../../user/models/UserWallet.js';
import { Ride } from '../../user/models/Ride.js';
import { afterRidePaymentApplied, applyRidePaymentInSession } from '../../services/ridePaymentService.js';
import { emitToDriver, startDispatchFlow } from '../../services/dispatchService.js';
import { reconcileCashfreeCollections, syncCashfreeCollectionByLink } from './driverCollectService.js';
import { getRideDetails } from '../../services/rideService.js';

/*
 * Gateway-neutral payment orders (Cashfree today). The flow for every purpose:
 *   1. createGatewayOrder   - amount and owner are decided HERE (server side), saved as a PaymentOrder, then the
 *                             gateway order is opened. The app only gets the payment session to open checkout.
 *   2. settlePaymentOrder   - called by the app's verify, the webhook and the reconcile loop. It asks the gateway
 *                             what was really paid (a webhook body is never trusted), claims the order once
 *                             (created -> paid) and applies it in a transaction (paid -> applied).
 *   3. a payment that cannot be used (ride already paid, ride cancelled) is refunded, once.
 */

const GATEWAY = 'cashfree';
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toPaise = (value) => Math.round(roundMoney(value) * 100);

const isTransactionUnsupported = (error) =>
  error?.code === 20 || /replica set|Transaction numbers are only allowed/i.test(String(error?.message || ''));

const runAtomically = async (fn) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    if (isTransactionUnsupported(error)) return fn(null);
    throw error;
  } finally {
    await session.endSession();
  }
};

const newOrderId = (purpose) => {
  const prefix = { user_wallet_topup: 'uw', driver_wallet_topup: 'dw', ride_payment: 'rp', goods_advance: 'ga' }[purpose] || 'po';
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}`;
};

export const getBackendOrigin = (req) => {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:5000';
  return `${proto}://${host}`;
};

/** Opens a Cashfree order for something the server already priced. Returns what the app needs for checkout. */
export const createGatewayOrder = async ({ purpose, ownerType, ownerId, amount, customer, context = {}, notifyUrl, returnUrl }) => {
  const normalizedAmount = roundMoney(amount);
  if (!(normalizedAmount > 0)) {
    throw new ApiError(400, 'amount must be greater than zero');
  }

  const credentials = await resolveCashfreeCredentials();
  const orderId = newOrderId(purpose);

  // The row first: a payment can never exist for an order we do not know.
  const row = await PaymentOrder.create({
    orderId,
    gateway: GATEWAY,
    purpose,
    ownerType,
    ownerId,
    amount: normalizedAmount,
    context,
  });

  let gatewayOrder;
  try {
    gatewayOrder = await createCashfreeOrder({
      orderId,
      amount: normalizedAmount,
      customer: { id: String(ownerId), ...customer },
      notifyUrl,
      returnUrl: returnUrl ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}order_id=${orderId}` : undefined,
      tags: { purpose, owner: String(ownerId).slice(-12) },
      credentials,
    });
  } catch (error) {
    await PaymentOrder.updateOne({ _id: row._id }, { $set: { status: PAYMENT_ORDER_STATUS.FAILED } });
    throw error;
  }

  await PaymentOrder.updateOne({ _id: row._id }, { $set: { paymentSessionId: String(gatewayOrder.payment_session_id || '') } });

  return {
    orderId,
    paymentSessionId: String(gatewayOrder.payment_session_id || ''),
    amount: normalizedAmount,
    currency: 'INR',
    environment: credentials.isLive ? 'production' : 'sandbox',
  };
};

const pickSuccessfulPayment = (payments, expectedAmount) => {
  const list = Array.isArray(payments) ? payments : [];
  return list.find((payment) => String(payment?.payment_status || '').toUpperCase() === 'SUCCESS'
    && toPaise(payment.payment_amount ?? payment.order_amount) === toPaise(expectedAmount)) || null;
};

// ---- applying -------------------------------------------------------------------------------------------------

const applyWalletTopUpForUser = async (order, session) => {
  const written = await UserWallet.updateOne(
    { userId: order.ownerId },
    {
      $inc: { balance: order.amount },
      $push: {
        transactions: {
          $each: [{
            kind: 'credit',
            amount: order.amount,
            title: 'Wallet Refilled',
            provider: GATEWAY,
            providerOrderId: order.orderId,
            providerPaymentId: order.providerPaymentId,
          }],
          $slice: -50,
        },
      },
    },
    // upsert: a rider who never opened the wallet still gets the credit (a silent no-match would lose it)
    { session, upsert: true },
  );
  if (!written.modifiedCount && !written.upsertedCount) {
    throw new Error('wallet credit was not written');
  }
  return { outcome: 'applied' };
};

const applyWalletTopUpForDriver = async (order, session) => {
  const result = await applyDriverWalletAdjustment({
    driverId: order.ownerId,
    amount: order.amount,
    type: 'top_up',
    description: 'Driver wallet top-up',
    metadata: {
      source: GATEWAY,
      provider: GATEWAY,
      providerOrderId: order.orderId,
      providerPaymentId: order.providerPaymentId,
    },
    session,
  });
  return { outcome: 'applied', walletResult: result };
};

const applyRidePaymentForOrder = async (order, session) => {
  const { rideId, fareDue = 0, tipAmount = 0 } = order.context || {};
  const result = await applyRidePaymentInSession({
    session,
    rideId,
    userId: order.ownerId,
    fareAmount: fareDue,
    tipAmount,
    payment: {
      provider: GATEWAY,
      providerId: order.providerPaymentId,
      providerOrderId: order.orderId,
      providerPaymentId: order.providerPaymentId,
      providerMode: 'cashfree_order',
      source: GATEWAY,
      currency: order.currency || 'INR',
    },
  });
  if (!['applied', 'already_applied'].includes(result.status)) {
    return { outcome: 'unusable', rideResult: result };
  }
  return { outcome: result.status === 'applied' ? 'applied' : 'already_applied', rideResult: result };
};

// Goods advance paid at booking: pending -> paid, only while the booking is still searching and the amount matches.
const applyGoodsAdvanceForOrder = async (order, session) => {
  const { rideId } = order.context || {};
  const paid = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      userId: order.ownerId,
      serviceType: 'parcel',
      status: 'searching',
      'goodsAdvance.status': 'pending',
      'goodsAdvance.amount': order.amount,
    },
    {
      $set: {
        'goodsAdvance.status': 'paid',
        'goodsAdvance.provider': GATEWAY,
        'goodsAdvance.providerOrderId': order.orderId,
        'goodsAdvance.providerPaymentId': order.providerPaymentId,
        'goodsAdvance.paidAt': new Date(),
      },
      $addToSet: { 'goodsAdvance.providerOrderIds': order.orderId },
    },
    session ? { session, returnDocument: 'after' } : { returnDocument: 'after' },
  );
  if (!paid) return { outcome: 'unusable', rideResult: { status: 'advance_not_payable' } };
  return { outcome: 'applied', rideResult: { status: 'applied' } };
};

const APPLIERS = {
  goods_advance: applyGoodsAdvanceForOrder,
  user_wallet_topup: applyWalletTopUpForUser,
  driver_wallet_topup: applyWalletTopUpForDriver,
  ride_payment: applyRidePaymentForOrder,
};

/**
 * paid -> applied (or refund_pending), in one transaction with the money movement. Safe to call any number of
 * times, from any number of workers: only the call that wins the claim moves money.
 */
const applyPaidOrder = async (orderId) => {
  let applied = null;
  try {
    applied = await runAtomically(async (session) => {
      const opts = session ? { session, returnDocument: 'after' } : { returnDocument: 'after' };
      const claimed = await PaymentOrder.findOneAndUpdate(
        { orderId, status: PAYMENT_ORDER_STATUS.PAID },
        { $set: { status: PAYMENT_ORDER_STATUS.APPLIED, appliedAt: new Date() } },
        opts,
      );
      if (!claimed) return null;

      const applier = APPLIERS[claimed.purpose];
      const done = await applier(claimed, session);
      if (done.outcome === 'unusable') {
        await PaymentOrder.updateOne(
          { _id: claimed._id },
          { $set: { status: PAYMENT_ORDER_STATUS.REFUND_PENDING, appliedAt: null, applyResult: done.rideResult?.status || 'unusable', 'refund.reason': done.rideResult?.status || 'unusable' } },
          session ? { session } : {},
        );
      } else {
        await PaymentOrder.updateOne({ _id: claimed._id }, { $set: { applyResult: done.outcome } }, session ? { session } : {});
      }
      return { order: claimed, done };
    });
  } catch (error) {
    // The payment id is already recorded on another ride (unique index): that ride has it, nothing to apply here.
    if (error?.code === 11000) {
      await PaymentOrder.updateOne({ orderId }, { $set: { status: PAYMENT_ORDER_STATUS.REFUND_PENDING, applyResult: 'used_elsewhere', 'refund.reason': 'used_elsewhere' } });
      return { applied: false };
    }
    throw error;
  }

  if (!applied) return { applied: false };

  const { order, done } = applied;
  if (done.outcome === 'applied') {
    if (order.purpose === 'ride_payment') {
      await afterRidePaymentApplied(done.rideResult, { notificationId: `ride-payment-${order.providerPaymentId}` });
      await Ride.updateOne({ _id: order.context?.rideId, 'riderPaymentOrder.orderId': order.orderId }, { $unset: { riderPaymentOrder: 1 } });
    }
    if (order.purpose === 'goods_advance') {
      // Same as the Razorpay path: the request is dispatched only once the advance is paid (idempotent).
      try {
        const detailed = await getRideDetails(order.context?.rideId);
        if (detailed?.status === 'searching' && !detailed.driverId) await startDispatchFlow(detailed);
      } catch (error) {
        console.error('[payment-order] dispatch after goods advance failed', order.orderId, error?.message || error);
      }
    }
    if (order.purpose === 'driver_wallet_topup' && done.walletResult) {
      emitToDriver(order.ownerId, 'driver:wallet:updated', {
        wallet: done.walletResult.wallet,
        transaction: done.walletResult.transaction,
      });
    }
  }
  if (done.outcome === 'unusable') {
    await refundPaymentOrder(order.orderId);
  }
  return { applied: done.outcome === 'applied', outcome: done.outcome };
};

/** Refunds a paid order we could not use. The refund id is fixed per order, so a retry never refunds twice. */
export const refundPaymentOrder = async (orderId) => {
  const claimed = await PaymentOrder.findOneAndUpdate(
    { orderId, status: PAYMENT_ORDER_STATUS.REFUND_PENDING },
    { $set: { 'refund.at': new Date() } },
    { returnDocument: 'after' },
  );
  if (!claimed) return null;

  const refundId = `rf_${claimed.orderId}`;
  try {
    let refund;
    try {
      refund = await createCashfreeRefund({
        orderId: claimed.orderId,
        refundId,
        amount: claimed.amount,
        note: claimed.refund?.reason || 'unused payment',
      });
    } catch (error) {
      // Cashfree answers a repeated refund id with an error (not the first refund): if it already exists, an
      // earlier attempt went through and only our bookkeeping was lost.
      refund = await fetchCashfreeRefund({ orderId: claimed.orderId, refundId }).catch(() => null);
      if (!refund?.refund_id) throw error;
    }
    await PaymentOrder.updateOne(
      { _id: claimed._id },
      { $set: { status: PAYMENT_ORDER_STATUS.REFUNDED, 'refund.refundId': refundId, 'refund.status': String(refund?.refund_status || 'PENDING'), 'refund.error': '' } },
    );
    return { status: 'refunded', refundId };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 300);
    console.error('[payment-order] refund failed, retry or refund by hand', orderId, message);
    await PaymentOrder.updateOne({ _id: claimed._id }, { $set: { 'refund.status': 'failed', 'refund.error': message } });
    return { status: 'failed', error: message };
  }
};

/**
 * Asks Cashfree what happened to this order and applies it. Returns
 *   { status: 'applied' | 'already_applied' | 'pending' | 'refunded' | 'refund_pending' | 'failed', order }
 */
export const settlePaymentOrder = async (orderId) => {
  let order = await PaymentOrder.findOne({ orderId, gateway: GATEWAY });
  if (!order) throw new ApiError(404, 'Payment order not found');

  if (order.status === PAYMENT_ORDER_STATUS.CREATED || order.status === PAYMENT_ORDER_STATUS.FAILED) {
    const payments = await fetchCashfreeOrderPayments(orderId);
    await PaymentOrder.updateOne({ _id: order._id }, { $set: { lastCheckedAt: new Date() } });
    const success = pickSuccessfulPayment(payments, order.amount);
    if (!success) {
      return { status: 'pending', order };
    }
    const paymentId = String(success.cf_payment_id || '');
    if (!paymentId) throw new ApiError(502, 'Cashfree payment has no id');
    // created -> paid: exactly one caller wins
    await PaymentOrder.findOneAndUpdate(
      { _id: order._id, status: { $in: [PAYMENT_ORDER_STATUS.CREATED, PAYMENT_ORDER_STATUS.FAILED] } },
      { $set: { status: PAYMENT_ORDER_STATUS.PAID, providerPaymentId: paymentId, paidAt: new Date() } },
    );
    order = await PaymentOrder.findById(order._id);
  }

  if (order.status === PAYMENT_ORDER_STATUS.PAID) {
    const result = await applyPaidOrder(orderId);
    order = await PaymentOrder.findById(order._id);
    if (order.status === PAYMENT_ORDER_STATUS.REFUNDED) return { status: 'refunded', order };
    if (order.status === PAYMENT_ORDER_STATUS.REFUND_PENDING) return { status: 'refund_pending', order };
    return { status: result.applied ? 'applied' : 'already_applied', order };
  }
  if (order.status === PAYMENT_ORDER_STATUS.REFUND_PENDING) {
    await refundPaymentOrder(orderId);
    order = await PaymentOrder.findById(order._id);
    return { status: order.status === PAYMENT_ORDER_STATUS.REFUNDED ? 'refunded' : 'refund_pending', order };
  }
  if (order.status === PAYMENT_ORDER_STATUS.REFUNDED) return { status: 'refunded', order };
  return { status: 'already_applied', order };
};

/** For the app: the caller's own order only. */
export const loadOwnOrder = async ({ orderId, ownerType, ownerId, purpose }) => {
  const order = await PaymentOrder.findOne({ orderId: String(orderId || ''), gateway: GATEWAY });
  if (!order || order.ownerType !== ownerType || String(order.ownerId) !== String(ownerId) || order.purpose !== purpose) {
    throw new ApiError(404, 'Payment order not found');
  }
  return order;
};

// ---- webhook & reconcile ---------------------------------------------------------------------------------------

export const handleCashfreeWebhook = async ({ rawBody, signature, timestamp }) => {
  let credentials;
  try {
    credentials = await resolveCashfreeCredentials();
  } catch {
    throw new ApiError(503, 'Cashfree is not configured');
  }
  if (!verifyCashfreeWebhookSignature({ rawBody, signature, timestamp, secretKey: credentials.secretKey })) {
    throw new ApiError(401, 'Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    throw new ApiError(400, 'Invalid webhook body');
  }
  const orderId = String(event?.data?.order?.order_id || '');

  // The driver's collect QR is a Cashfree payment link. Its events carry the link id (or an order made from the link);
  // only the id is taken from the body, what was paid is read back from Cashfree.
  const linkId = String(
    event?.data?.link_id
      || event?.data?.order?.order_tags?.link_id
      || (/^CFPay_(.+)_[A-Za-z0-9]+$/.exec(orderId) || [])[1]
      || '',
  );
  if (linkId) {
    const synced = await syncCashfreeCollectionByLink(linkId);
    if (synced.handled) return { handled: true, status: synced.status };
  }

  if (!orderId) return { handled: false };

  const known = await PaymentOrder.exists({ orderId, gateway: GATEWAY });
  if (!known) return { handled: false };

  // Only the order id is taken from the body; what was paid is read back from Cashfree.
  const result = await settlePaymentOrder(orderId);
  return { handled: true, status: result.status };
};

const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;
const RECONCILE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const RECONCILE_RECHECK_MS = 5 * 60 * 1000;
const RECONCILE_BATCH = 50;

/** Backstop for a lost webhook, a closed app or a crash between "paid" and "applied". */
export const reconcilePaymentOrders = async () => {
  const now = Date.now();
  const candidates = await PaymentOrder.find({
    gateway: GATEWAY,
    $or: [
      {
        status: PAYMENT_ORDER_STATUS.CREATED,
        createdAt: { $lt: new Date(now - RECONCILE_MIN_AGE_MS), $gt: new Date(now - RECONCILE_MAX_AGE_MS) },
        // an abandoned checkout is looked at every few minutes, not on every sweep
        $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(now - RECONCILE_RECHECK_MS) } }],
      },
      { status: { $in: [PAYMENT_ORDER_STATUS.PAID, PAYMENT_ORDER_STATUS.REFUND_PENDING] }, updatedAt: { $lt: new Date(now - 60 * 1000) } },
    ],
  }).sort({ createdAt: 1 }).limit(RECONCILE_BATCH).select('orderId').lean();

  let settled = 0;
  // the driver's open collect QR links (a lost webhook, a driver who closed the app)
  await reconcileCashfreeCollections().catch((error) => console.error('[driver-collect] reconcile failed', error?.message || error));
  for (const candidate of candidates) {
    try {
      const result = await settlePaymentOrder(candidate.orderId);
      if (result.status !== 'pending') settled += 1;
    } catch (error) {
      console.error('[payment-order] reconcile failed', candidate.orderId, error?.message || error);
    }
  }
  return { checked: candidates.length, settled };
};
