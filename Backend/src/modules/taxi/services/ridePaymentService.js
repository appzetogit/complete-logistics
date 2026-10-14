import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { applyDriverWalletAdjustment } from '../driver/services/walletService.js';
import { Ride } from '../user/models/Ride.js';
import { emitRideStateToParticipants, emitToDriver } from './dispatchService.js';
import { razorpayRequest, resolveRazorpayCredentials, signaturesMatch } from './razorpayClient.js';
import { getTransportRideSettings } from './transportSettingsService.js';
import { getRideDetails } from './rideService.js';
import {
  RIDE_PAYMENT_CODES,
  UNPAID_COLLECTION_FILTER,
  isRideCollectionPaid,
  isRideInPayableStage,
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
  // A QR or checkout order opened in time may be paid a little later (after the cash pay-online window):
  // that payment still counts.
  const openedInTime = (payment.providerId && ride.driverPaymentCollection?.providerId === payment.providerId)
    || (payment.providerOrderId && ride.riderPaymentOrder?.orderId === payment.providerOrderId);
  if (!isRidePayableNow(ride) && !(openedInTime && isRideInPayableStage(ride))) {
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

  // Not again when the platform already paid the driver this fare (unpaid online booking covered): the rider's
  // late payment settles their debt to the platform.
  const fareCredit = fare > 0 && wasSettledAsCash(ride) && !ride.platformCoveredAt ? fare : 0;
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
const callRazorpayRefund = async ({ rideId, paymentId, amount, reason }) => {
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    const refund = await razorpayRequest({
      method: 'POST',
      path: `/payments/${encodeURIComponent(paymentId)}/refund`,
      body: { amount: Math.round(roundMoney(amount) * 100), notes: { rideId: String(rideId), reason } },
      keyId,
      keySecret,
    });
    return { status: String(refund?.status || 'processed'), refundId: String(refund?.id || ''), error: '' };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 300);
    console.error('[ride-payment] refund failed, an admin must retry or refund it by hand', String(rideId), paymentId, message);
    return { status: 'failed', refundId: '', error: message };
  }
};

const saveRefundOutcome = (rideId, paymentId, outcome) => Ride.updateOne(
  { _id: rideId, 'paymentRefunds.paymentId': paymentId },
  {
    $set: {
      'paymentRefunds.$.status': outcome.status,
      'paymentRefunds.$.refundId': outcome.refundId,
      'paymentRefunds.$.error': outcome.error,
      'paymentRefunds.$.updatedAt': new Date(),
    },
  },
);

/**
 * Refunds a Razorpay payment we cannot use for this ride (already paid, wrong amount, ride not payable) and
 * records it on the ride. The refund is claimed first (a 'pending' entry, only if none exists for this payment),
 * so verify and the webhook handling the same extra payment at the same moment refund it once.
 * A refund Razorpay rejects stays 'failed' and shows up in Admin > Payment Refunds.
 */
export const refundUnusedRidePayment = async ({ rideId, paymentId, amount, reason }) => {
  if (!paymentId || !(Number(amount) > 0)) return null;
  const now = new Date();
  const entry = { paymentId, amount: roundMoney(amount), reason, refundId: '', status: 'pending', error: '', at: now, updatedAt: now };
  const claimed = await Ride.updateOne(
    { _id: rideId, 'paymentRefunds.paymentId': { $ne: paymentId } },
    { $push: { paymentRefunds: entry } },
  );
  if (!claimed.modifiedCount) {
    return { paymentId, alreadyRefunded: true };
  }

  const outcome = await callRazorpayRefund({ rideId, paymentId, amount, reason });
  await saveRefundOutcome(rideId, paymentId, outcome);
  return { ...entry, ...outcome };
};

// A 'pending' refund older than this was interrupted (server restart mid-call): it needs an admin look too.
export const STALE_PENDING_REFUND_MS = 10 * 60 * 1000;

/** Admin: try a failed (or stuck) refund again. Claimed atomically so two clicks never refund twice. */
export const retryRidePaymentRefund = async ({ rideId, paymentId }) => {
  const staleBefore = new Date(Date.now() - STALE_PENDING_REFUND_MS);
  const ride = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      paymentRefunds: {
        $elemMatch: {
          paymentId,
          $or: [{ status: 'failed' }, { status: 'pending', updatedAt: { $lt: staleBefore } }],
        },
      },
    },
    { $set: { 'paymentRefunds.$.status': 'pending', 'paymentRefunds.$.updatedAt': new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!ride) {
    throw new ApiError(409, 'This refund is not waiting for a retry (already refunded, in progress or resolved)');
  }
  const entry = ride.paymentRefunds.find((item) => item.paymentId === paymentId);
  const outcome = await callRazorpayRefund({ rideId, paymentId, amount: entry.amount, reason: entry.reason });
  await saveRefundOutcome(rideId, paymentId, outcome);
  return { ...entry, ...outcome };
};

/** Admin: the money was returned outside the app (bank transfer, Razorpay dashboard). */
export const resolveRidePaymentRefundManually = async ({ rideId, paymentId, note = '', adminId = null }) => {
  const result = await Ride.updateOne(
    { _id: rideId, paymentRefunds: { $elemMatch: { paymentId, status: { $in: ['failed', 'pending'] } } } },
    {
      $set: {
        'paymentRefunds.$.status': 'resolved_manually',
        'paymentRefunds.$.note': String(note || '').trim().slice(0, 300),
        'paymentRefunds.$.resolvedBy': adminId ? String(adminId) : '',
        'paymentRefunds.$.updatedAt': new Date(),
      },
    },
  );
  if (!result.modifiedCount) {
    throw new ApiError(409, 'This refund is not open');
  }
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
  } catch (error) {
    // The unique index on the payment id: this payment is already recorded on another ride. It paid that ride,
    // so it is neither applied here nor refunded.
    if (error?.code !== 11000) throw error;
    console.error('[ride-payment] payment id already used on another ride', args.payment?.providerPaymentId, String(args.rideId));
    return { status: 'used_elsewhere', ride: { _id: args.rideId } };
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

// ------------------------------------------------------------------------- unpaid online bookings

const COVER_SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastCoverSweepAt = 0;

/**
 * An ONLINE booking is settled at completion as commission-only, and its fare is credited when the rider pays.
 * If the rider has still not paid `unpaid_online_cover_hours` after completion (admin setting, default 24,
 * 0 = never), the platform credits the driver the fare itself, so the driver is never left out of pocket.
 * The rider still owes it (the ride stays unpaid and payable); their late payment goes to the platform.
 * Once per ride (atomic), never after a payment. Runs from the dispatch recovery loop, at most every 10 minutes.
 */
export const coverUnpaidOnlineRides = async ({ now = Date.now(), limit = 50, force = false } = {}) => {
  if (!force && now - lastCoverSweepAt < COVER_SWEEP_EVERY_MS) return 0;
  lastCoverSweepAt = now;

  const settings = await getTransportRideSettings();
  const hours = Number(settings.unpaid_online_cover_hours ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) return 0;

  const cutoff = new Date(now - hours * 3600 * 1000);
  const candidates = await Ride.find({
    status: 'completed',
    paymentMethod: 'online',
    settledAs: 'cash',
    platformCoveredAt: null,
    driverId: { $ne: null },
    completedAt: { $lt: cutoff },
    ...UNPAID_COLLECTION_FILTER,
  })
    .sort({ completedAt: 1 })
    .limit(limit)
    .lean();

  let covered = 0;
  for (const candidate of candidates) {
    const amount = rideFareDue(candidate);
    if (amount <= 0) continue;
    const session = await mongoose.startSession();
    let walletResult = null;
    try {
      await session.withTransaction(async () => {
        walletResult = null;
        const claimed = await Ride.findOneAndUpdate(
          { _id: candidate._id, platformCoveredAt: null, status: 'completed', ...UNPAID_COLLECTION_FILTER },
          { $set: { platformCoveredAt: new Date(now), platformCoveredAmount: amount } },
          { session, returnDocument: 'after' },
        );
        if (!claimed) return;
        walletResult = await applyDriverWalletAdjustment({
          driverId: candidate.driverId,
          rideId: candidate._id,
          amount,
          type: 'adjustment',
          description: 'Fare paid by the platform (the rider has not paid yet)',
          metadata: { source: 'platform_cover', rideId: String(candidate._id), userId: String(candidate.userId || ''), farePortion: amount },
          session,
        });
      });
    } catch (error) {
      console.error('[ride-payment] could not cover an unpaid online ride', String(candidate._id), error?.message || error);
    } finally {
      await session.endSession();
    }
    if (walletResult?.transaction) {
      covered += 1;
      emitToDriver(candidate.driverId, 'driver:wallet:updated', {
        wallet: walletResult.wallet,
        transaction: walletResult.transaction,
        notification: {
          id: `ride-cover-${candidate._id}`,
          title: 'Fare credited',
          body: `Rs ${amount.toFixed(2)} credited for a ride the rider has not paid yet.`,
          sentAt: new Date().toISOString(),
        },
      });
    }
  }
  return covered;
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
