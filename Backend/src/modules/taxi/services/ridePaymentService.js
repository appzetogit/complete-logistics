import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { applyDriverWalletAdjustment } from '../driver/services/walletService.js';
import { Ride } from '../user/models/Ride.js';
import { emitRideStateToParticipants, emitToDriver } from './dispatchService.js';
import { razorpayRequest, resolveRazorpayCredentials, signaturesMatch } from './razorpayClient.js';
import { getRideDetails } from './rideService.js';
import {
  RIDE_PAYMENT_CODES,
  UNPAID_COLLECTION_FILTER,
  isRideCollectionPaid,
  isRidePayableNow,
  rideFareDue,
  wasSettledAsCash,
} from './ridePaymentState.js';

// The one place a rider's payment for a ride's fare (and tip) is applied, whoever learned about it first:
// the in-app checkout verify, the rider's wallet, the driver's QR status poll or the Razorpay webhook.
//
//   - once per ride: the payment is claimed atomically on `driverPaymentCollection` (not paid yet -> paid);
//     the same payment again (poll + webhook, retries) is a no-op
//   - the driver is credited exactly once, and only what they are owed:
//       ride not settled yet      -> nothing now; settlement sees a paid online ride and credits fare - commission
//       ride settled as cash      -> the fare (commission was already deducted at completion)
//       ride settled as online    -> nothing (already credited at completion)
//     plus any tip
//   - a second payment for a ride that is already paid (or a wrong amount) is refunded, never kept
//   - both apps get `ride:state` at once, the driver also `driver:wallet:updated`

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const OPEN_COLLECTION_STATUSES = new Set(['created', 'active', 'issued', 'pending']);

export const ridePaymentError = (status, code, message, details = {}) => new ApiError(status, message, { code, ...details });

const isSamePayment = (ride, payment) => {
  const collection = ride?.driverPaymentCollection || {};
  if (payment.providerPaymentId && collection.providerPaymentId === payment.providerPaymentId) return true;
  if (payment.providerPaymentId && ride?.feedback?.tipPaymentId === payment.providerPaymentId) return true;
  // A QR / payment link is single use: its id identifies the payment even when the poll could not read the
  // payment id and the webhook could.
  return Boolean(payment.providerId)
    && collection.providerId === payment.providerId
    && collection.source === payment.source
    && isRideCollectionPaid(ride);
};

/**
 * Applies a payment inside the caller's transaction. Returns
 *   { status: 'applied', ride, previous, walletResult }
 *   { status: 'already_applied' | 'duplicate' | 'amount_mismatch' | 'not_payable', ride, due? }
 * Nothing is written unless the status is 'applied'.
 */
export const applyRidePaymentInSession = async ({ session, rideId, userId = null, fareAmount = 0, tipAmount = 0, payment }) => {
  const ride = await Ride.findById(rideId).session(session);
  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }
  if (userId && String(ride.userId) !== String(userId)) {
    throw ridePaymentError(403, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'This payment belongs to another rider');
  }

  const fare = roundMoney(fareAmount);
  const tip = roundMoney(tipAmount);

  if (isSamePayment(ride, payment)) {
    return { status: 'already_applied', ride };
  }
  if (!isRidePayableNow(ride)) {
    return { status: 'not_payable', ride };
  }

  const now = new Date();
  const tipSet = tip > 0
    ? {
        'feedback.tipAmount': tip,
        'feedback.tipPaymentId': payment.providerPaymentId || '',
        'feedback.tipOrderId': payment.providerOrderId || '',
        'feedback.tipPaidAt': now,
      }
    : {};
  let claimed = null;

  if (fare > 0) {
    const due = rideFareDue(ride);
    if (due <= 0) {
      return { status: 'duplicate', ride };
    }
    if (Math.abs(due - fare) > 0.01) {
      return { status: 'amount_mismatch', ride, due };
    }

    const previousCollection = ride.driverPaymentCollection || {};
    const set = {
      driverPaymentCollection: {
        provider: payment.provider || '',
        providerId: payment.providerId || payment.providerPaymentId || '',
        providerOrderId: payment.providerOrderId || '',
        providerPaymentId: payment.providerPaymentId || '',
        providerMode: payment.providerMode || '',
        source: payment.source || '',
        status: 'paid',
        amount: roundMoney(fare + tip),
        currency: payment.currency || 'INR',
        linkUrl: previousCollection.providerId === payment.providerId ? previousCollection.linkUrl || '' : '',
        paidAt: now,
        updatedAt: now,
      },
      ...tipSet,
    };
    // A wallet ride paying what its wallet could not cover stays a wallet ride on the receipt.
    if (ride.paymentMethod === 'wallet') {
      set.walletShortfall = 0;
    } else {
      set.paymentMethod = 'online';
      if (ride.paymentMethod === 'cash') set.paymentSwitchedFrom = 'cash';
    }

    claimed = await Ride.findOneAndUpdate(
      { _id: ride._id, fare: ride.fare, status: { $ne: 'cancelled' }, ...UNPAID_COLLECTION_FILTER },
      { $set: set },
      { session, returnDocument: 'after' },
    );
  } else if (tip > 0) {
    if (ride.feedback?.tipPaidAt) {
      return { status: 'duplicate', ride };
    }
    claimed = await Ride.findOneAndUpdate(
      { _id: ride._id, 'feedback.tipPaidAt': null },
      { $set: tipSet },
      { session, returnDocument: 'after' },
    );
  } else {
    throw ridePaymentError(400, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'Nothing to pay');
  }

  if (!claimed) {
    return { status: 'duplicate', ride };
  }

  const fareCredit = fare > 0 && wasSettledAsCash(ride) ? fare : 0;
  const credit = roundMoney(fareCredit + tip);
  let walletResult = null;
  if (credit > 0) {
    walletResult = await applyDriverWalletAdjustment({
      driverId: ride.driverId,
      rideId: ride._id,
      amount: credit,
      type: 'adjustment',
      description: fareCredit > 0 ? 'Ride completion payment credited from rider' : 'Ride tip credited from rider',
      metadata: {
        source: payment.source || '',
        rideId: String(ride._id),
        userId: String(ride.userId || ''),
        farePortion: fareCredit,
        tipAmount: tip,
        totalCharge: roundMoney(fare + tip),
        provider: payment.provider || '',
        providerOrderId: payment.providerOrderId || '',
        providerPaymentId: payment.providerPaymentId || '',
      },
      session,
    });
  }

  return { status: 'applied', ride: claimed, previous: ride, walletResult, fare, tip, credit };
};

const closeOpenCollection = async (collection = {}) => {
  const providerId = String(collection.providerId || '');
  const mode = String(collection.providerMode || '');
  if (!providerId || !OPEN_COLLECTION_STATUSES.has(String(collection.status || '')) || !/qr|payment_link/.test(mode)) {
    return;
  }
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    await razorpayRequest({
      method: 'POST',
      path: mode.includes('payment_link')
        ? `/payment_links/${encodeURIComponent(providerId)}/cancel`
        : `/payments/qr_codes/${encodeURIComponent(providerId)}/close`,
      keyId,
      keySecret,
    });
  } catch (error) {
    // Best effort: a QR paid after this point is caught by the webhook and refunded.
    console.error('[ride-payment] could not close the open QR / payment link', providerId, error?.message || error);
  }
};

export { closeOpenCollection as closeRidePaymentCollection };

/**
 * Refunds a Razorpay payment we cannot use for this ride (already paid, wrong amount, ride cancelled) and
 * records it on the ride. Never refunds the same payment twice.
 */
export const refundUnusedRidePayment = async ({ rideId, paymentId, amount, reason }) => {
  if (!paymentId || !(Number(amount) > 0)) return null;
  const already = await Ride.exists({ _id: rideId, 'paymentRefunds.paymentId': paymentId });
  if (already) return { paymentId, alreadyRefunded: true };

  const entry = { paymentId, amount: roundMoney(amount), reason, refundId: '', status: 'failed', at: new Date() };
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    const refund = await razorpayRequest({
      method: 'POST',
      path: `/payments/${encodeURIComponent(paymentId)}/refund`,
      body: { amount: Math.round(roundMoney(amount) * 100), notes: { rideId: String(rideId), reason } },
      keyId,
      keySecret,
    });
    entry.refundId = String(refund?.id || '');
    entry.status = String(refund?.status || 'processed');
  } catch (error) {
    entry.error = String(error?.message || error).slice(0, 300);
    console.error('[ride-payment] refund failed, admin must refund manually', String(rideId), paymentId, entry.error);
  }
  await Ride.updateOne({ _id: rideId }, { $push: { paymentRefunds: entry } });
  return entry;
};

/** After the transaction committed: close the QR that is no longer needed, tell both apps. */
export const afterRidePaymentApplied = async (result, { notificationId = '' } = {}) => {
  if (result?.status !== 'applied') return;
  const previousCollection = result.previous?.driverPaymentCollection || {};
  const paidCollection = result.ride?.driverPaymentCollection || {};
  if (previousCollection.providerId && previousCollection.providerId !== paidCollection.providerId) {
    await closeOpenCollection(previousCollection);
  }

  try {
    emitRideStateToParticipants(await getRideDetails(result.ride._id));
  } catch (error) {
    console.error('[ride-payment] ride:state emit failed', String(result.ride._id), error?.message || error);
  }
  if (result.walletResult?.transaction) {
    emitToDriver(result.ride.driverId, 'driver:wallet:updated', {
      wallet: result.walletResult.wallet,
      transaction: result.walletResult.transaction,
      notification: {
        id: notificationId || `ride-payment-${result.ride._id}-${Date.now()}`,
        title: 'Payment received',
        body: `Rs ${roundMoney(result.fare + result.tip).toFixed(2)} received from rider.`,
        sentAt: new Date().toISOString(),
      },
    });
  }
};

/**
 * Applies a gateway payment in its own transaction. A payment that cannot be used is refunded (refundIfUnused).
 * Returns the result plus `refund` when one was made.
 */
export const applyRidePayment = async ({ refundIfUnused = true, ...args }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await applyRidePaymentInSession({ ...args, session });
    });
  } finally {
    await session.endSession();
  }

  if (result.status === 'applied') {
    await afterRidePaymentApplied(result, { notificationId: `ride-payment-${args.payment?.providerPaymentId || ''}` });
  } else if (refundIfUnused && ['duplicate', 'amount_mismatch', 'not_payable'].includes(result.status)
    // only a real payment id can be refunded (the QR poll may only know the QR id)
    && args.payment?.provider === 'razorpay' && String(args.payment?.providerPaymentId || '').startsWith('pay_')) {
    result.refund = await refundUnusedRidePayment({
      rideId: result.ride._id,
      paymentId: args.payment.providerPaymentId,
      amount: roundMoney(Number(args.fareAmount || 0) + Number(args.tipAmount || 0)),
      reason: result.status === 'duplicate' ? 'ride_already_paid' : result.status,
    });
  }
  return result;
};

/** Checkout payments must be captured to count; an authorized one (auto-capture off) is captured here. */
export const ensureRazorpayPaymentCaptured = async ({ paymentId, orderId, amountPaise }) => {
  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const payment = await razorpayRequest({ method: 'GET', path: `/payments/${encodeURIComponent(paymentId)}`, keyId, keySecret });
  if (String(payment?.order_id || '') !== String(orderId)) {
    throw ridePaymentError(400, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'This payment does not belong to this order');
  }
  if (Number(payment?.amount) !== Number(amountPaise)) {
    throw ridePaymentError(400, RIDE_PAYMENT_CODES.AMOUNT_MISMATCH, 'Payment amount does not match the order');
  }
  if (payment.status === 'captured') return payment;
  if (payment.status === 'authorized') {
    return razorpayRequest({
      method: 'POST',
      path: `/payments/${encodeURIComponent(paymentId)}/capture`,
      body: { amount: Number(amountPaise), currency: payment.currency || 'INR' },
      keyId,
      keySecret,
    });
  }
  throw ridePaymentError(400, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, `Payment is ${payment?.status || 'not completed'}`);
};

// ---------------------------------------------------------------------------------------------- webhook

const RIDE_WEBHOOK_EVENTS = new Set(['payment.captured', 'order.paid', 'qr_code.credited', 'payment_link.paid']);

/**
 * Razorpay -> server, for ride payments: the driver's QR / payment link (`qr_code.credited`, `payment_link.paid`)
 * and the rider's in-app checkout (`payment.captured`, `order.paid`). Catches payments the apps never reported
 * (driver app closed, verify call lost). Signature checked against the raw body. Anything that is not a ride
 * payment is ignored (200), so Razorpay never retries it.
 */
export const handleRidePaymentWebhook = async ({ rawBody, signature }) => {
  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
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
  if (!RIDE_WEBHOOK_EVENTS.has(event?.event)) {
    return { handled: false, reason: 'ignored_event' };
  }

  const payment = event?.payload?.payment?.entity;
  if (!payment?.id || payment.status !== 'captured') {
    return { handled: false, reason: 'no_captured_payment' };
  }

  let args;
  if (event.event === 'qr_code.credited' || event.event === 'payment_link.paid') {
    const entity = event.event === 'qr_code.credited' ? event.payload?.qr_code?.entity : event.payload?.payment_link?.entity;
    const notes = entity?.notes || {};
    if (notes.source !== 'driver_collect_amount' || !mongoose.isValidObjectId(String(notes.rideId || '')) || !entity?.id) {
      return { handled: false, reason: 'not_a_ride_payment' };
    }
    args = {
      rideId: String(notes.rideId),
      fareAmount: roundMoney(Number(payment.amount) / 100),
      payment: {
        provider: 'razorpay',
        providerId: String(entity.id),
        providerPaymentId: String(payment.id),
        providerMode: event.event === 'qr_code.credited' ? 'razorpay_qr' : String(notes.fallback || 'upi_payment_link_qr'),
        source: 'qr',
      },
    };
  } else {
    const orderId = String(payment.order_id || event.payload?.order?.entity?.id || '');
    if (!orderId) {
      return { handled: false, reason: 'not_an_order_payment' };
    }
    let notes = event.payload?.order?.entity?.notes;
    if (!notes?.source) {
      const { keyId, keySecret } = await resolveRazorpayCredentials();
      const order = await razorpayRequest({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}`, keyId, keySecret });
      notes = order?.notes || {};
    }
    if (notes.source !== 'ride_completion' || !mongoose.isValidObjectId(String(notes.rideId || ''))) {
      return { handled: false, reason: 'not_a_ride_payment' };
    }
    const fare = roundMoney(notes.fareDue);
    const tip = roundMoney(notes.tipAmount);
    if (Math.round((fare + tip) * 100) !== Number(payment.amount)) {
      return { handled: false, reason: 'amount_mismatch' };
    }
    args = {
      rideId: String(notes.rideId),
      userId: notes.userId || null,
      fareAmount: fare,
      tipAmount: tip,
      payment: {
        provider: 'razorpay',
        providerId: String(payment.id),
        providerOrderId: orderId,
        providerPaymentId: String(payment.id),
        providerMode: 'razorpay_order',
        source: 'razorpay',
      },
    };
  }

  const result = await applyRidePayment(args);
  return { handled: true, status: result.status, refunded: Boolean(result.refund && result.refund.status !== 'failed') };
};
