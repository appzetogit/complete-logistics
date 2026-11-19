import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { ApiError } from '../../../../utils/ApiError.js';
import { Ride } from '../../user/models/Ride.js';
import { User } from '../../user/models/User.js';
import { isRideCollectionPaid, UNPAID_COLLECTION_FILTER } from '../../services/ridePaymentState.js';
import { applyRidePayment } from '../../services/ridePaymentService.js';
import {
  createCashfreePaymentLink,
  fetchCashfreeOrderPayments,
  fetchCashfreePaymentLink,
  fetchCashfreePaymentLinkOrders,
  resolveCashfreeCredentials,
} from '../../services/cashfreeClient.js';

/*
 * Driver "Collect payment" on Cashfree: at the drop the driver shows a QR, the rider pays it from any UPI app.
 *
 *   create  - one Cashfree payment link for exactly the fare the server says is due (the app sends no amount); its
 *             QR and pay URL are stored on the ride's driverPaymentCollection (provider 'cashfree').
 *   sync    - the status poll, the webhook and the recovery loop all call syncCashfreeDriverCollection: it asks
 *             Cashfree what happened (a webhook body is never trusted) and settles through applyRidePayment,
 *             the same transactional, once-only path every other ride payment uses.
 *   close   - a new QR, cash received or the rider paying in the app cancels the old link (ridePaymentService).
 */

export const CASHFREE_COLLECT_MODE = 'cashfree_payment_link_qr';
const COLLECT_WINDOW_MS = 30 * 60 * 1000;
const RECONCILE_WINDOW_MS = 2 * 60 * 60 * 1000;
const RECONCILE_BATCH = 50;

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const toPaise = (value) => Math.round(roundMoney(value) * 100);

// Cashfree link_status -> the collection status the apps already understand
const LINK_STATE = { ACTIVE: 'active', PARTIALLY_PAID: 'active', PAID: 'paid', EXPIRED: 'expired', CANCELLED: 'cancelled' };

const SETTLED_RESULTS = new Set(['applied', 'already_applied', 'duplicate']);

export const isCashfreeCollection = (collection = {}) =>
  collection?.provider === 'cashfree' || String(collection?.providerMode || '').startsWith('cashfree');

/** Opens the payment link for what the rider still owes. Returns what the app renders. */
export const createCashfreeDriverCollection = async ({ ride, amountDue, driverId, notifyUrl }) => {
  const amount = roundMoney(amountDue);
  if (!(amount > 0)) throw new ApiError(400, 'amount must be greater than zero');

  const credentials = await resolveCashfreeCredentials();
  const rider = await User.findById(ride.userId).select('name phone').lean();
  const linkId = `rc_${String(ride._id).slice(-12)}_${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + COLLECT_WINDOW_MS);

  const link = await createCashfreePaymentLink({
    linkId,
    amount,
    purpose: `Fare for ride ${String(ride._id).slice(-8)}`,
    customer: { phone: rider?.phone, name: rider?.name },
    notifyUrl,
    expiresAt,
    notes: { rideId: String(ride._id), driverId: String(driverId), source: 'driver_collect_amount' },
    credentials,
  });

  const linkUrl = String(link.link_url || '');
  if (!linkUrl) throw new ApiError(502, 'Cashfree payment link was created without a payment URL');
  // Cashfree sends the QR with the link; draw our own if it is ever missing.
  const imageUrl = String(link.link_qrcode || '')
    || await QRCode.toDataURL(linkUrl, { errorCorrectionLevel: 'M', margin: 1, scale: 8 });

  return {
    id: String(link.link_id || linkId),
    entity: 'payment_link',
    status: 'active',
    imageUrl,
    linkUrl,
    amount,
    currency: 'INR',
    description: `Fare for ride ${String(ride._id).slice(-8)}`,
    closeBy: Math.floor(expiresAt.getTime() / 1000),
    rawStatus: 'active',
    providerMode: CASHFREE_COLLECT_MODE,
  };
};

/** Which Cashfree order / payment paid the link. Best effort: the refund needs the order, the ledger the payment. */
const findLinkPayment = async (linkId, expectedPaise, credentials) => {
  try {
    const orders = await fetchCashfreePaymentLinkOrders(linkId, credentials);
    const list = Array.isArray(orders) ? orders : Array.isArray(orders?.data) ? orders.data : [];
    for (const order of list.filter((item) => String(item?.order_status || '').toUpperCase() === 'PAID')) {
      const payments = await fetchCashfreeOrderPayments(order.order_id, credentials);
      const paid = (Array.isArray(payments) ? payments : []).find(
        (payment) => String(payment?.payment_status || '').toUpperCase() === 'SUCCESS'
          && toPaise(payment.payment_amount ?? payment.order_amount) === expectedPaise,
      );
      if (paid) return { orderId: String(order.order_id), paymentId: String(paid.cf_payment_id || '') };
    }
  } catch (error) {
    console.error('[driver-collect] could not read the payment behind the link', linkId, error?.message || error);
  }
  return { orderId: '', paymentId: '' };
};

/** A link that was paid: settle it on the ride (once), or refund it when the ride cannot use it any more. */
const settlePaidLink = async ({ rideId, linkId, amount, mode, currency, credentials }) => {
  const expectedPaise = toPaise(amount);
  const { orderId, paymentId } = await findLinkPayment(linkId, expectedPaise, credentials);
  // same path as the rider's in-app payment: marks the ride paid once, credits the driver, tells both apps; a
  // payment for a ride that is already paid (cash, the rider's app) or for another amount is refunded
  return applyRidePayment({
    rideId,
    fareAmount: roundMoney(amount),
    payment: {
      provider: 'cashfree',
      providerId: linkId,
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerMode: mode || CASHFREE_COLLECT_MODE,
      source: 'qr',
      currency: currency || 'INR',
    },
  });
};

/**
 * Asks Cashfree about the ride's open payment link and settles or records what it says.
 * Returns { handled, status } where status is the collection status (active | paid | expired | cancelled | ...).
 */
export const syncCashfreeDriverCollection = async (rideId) => {
  if (!mongoose.isValidObjectId(String(rideId))) return { handled: false, status: '' };
  const ride = await Ride.findById(rideId).select('_id driverPaymentCollection').lean();
  const collection = ride?.driverPaymentCollection || {};
  if (!ride || !isCashfreeCollection(collection) || !collection.providerId) return { handled: false, status: '' };

  const fullRide = await Ride.findById(rideId).lean();
  // already paid (this link, cash, or the rider's own app payment): nothing to ask
  if (isRideCollectionPaid(fullRide)) return { handled: true, status: 'paid' };

  const credentials = await resolveCashfreeCredentials();
  const link = await fetchCashfreePaymentLink(collection.providerId, credentials);
  const state = LINK_STATE[String(link?.link_status || '').toUpperCase()] || 'pending';
  const expectedPaise = toPaise(collection.amount);
  const paidPaise = toPaise(link?.link_amount_paid);
  const isPaid = state === 'paid' || (expectedPaise > 0 && paidPaise >= expectedPaise);

  if (isPaid) {
    const result = await settlePaidLink({
      rideId: ride._id,
      linkId: collection.providerId,
      amount: collection.amount,
      mode: collection.providerMode,
      currency: collection.currency,
      credentials,
    });
    // applied / already applied / the ride was paid another way (this payment is refunded): the fare is settled.
    // Anything else (a payment id used on another ride, a wrong amount) leaves this QR as it was.
    return { handled: true, status: SETTLED_RESULTS.has(result?.status) ? 'paid' : state === 'paid' ? 'active' : state };
  }

  // only this link's status, and never over a payment that landed meanwhile
  await Ride.updateOne(
    { _id: ride._id, 'driverPaymentCollection.providerId': collection.providerId, ...UNPAID_COLLECTION_FILTER },
    {
      $set: {
        'driverPaymentCollection.status': state,
        'driverPaymentCollection.linkUrl': collection.linkUrl || String(link?.link_url || ''),
        'driverPaymentCollection.updatedAt': new Date(),
      },
    },
  );
  return { handled: true, status: state };
};

/** Webhook / event for a payment link: find the ride it belongs to and settle it from what Cashfree says. */
export const syncCashfreeCollectionByLink = async (linkId) => {
  const id = String(linkId || '').trim();
  if (!id) return { handled: false };
  const ride = await Ride.findOne({ 'driverPaymentCollection.providerId': id, 'driverPaymentCollection.provider': 'cashfree' })
    .select('_id')
    .lean();
  if (ride) {
    const result = await syncCashfreeDriverCollection(ride._id);
    return { handled: result.handled, status: result.status };
  }

  // The ride no longer points at this link (a newer QR replaced it, or the fare was paid another way) but someone
  // may still have paid it: the link carries its ride, so a paid one is settled or refunded like any other payment.
  const credentials = await resolveCashfreeCredentials();
  const link = await fetchCashfreePaymentLink(id, credentials).catch(() => null);
  const notes = link?.link_notes || {};
  if (!link || notes.source !== 'driver_collect_amount' || !mongoose.isValidObjectId(String(notes.rideId || ''))) {
    return { handled: false };
  }
  const paidPaise = toPaise(link.link_amount_paid);
  if (String(link.link_status || '').toUpperCase() !== 'PAID' && paidPaise < toPaise(link.link_amount)) {
    return { handled: true, status: LINK_STATE[String(link.link_status || '').toUpperCase()] || 'pending' };
  }
  await settlePaidLink({
    rideId: String(notes.rideId),
    linkId: id,
    amount: link.link_amount_paid || link.link_amount,
    mode: CASHFREE_COLLECT_MODE,
    currency: link.link_currency,
    credentials,
  });
  return { handled: true, status: 'paid' };
};

/** Backstop for a lost webhook or a driver who closed the app right after the rider paid. */
export const reconcileCashfreeCollections = async () => {
  const rides = await Ride.find({
    'driverPaymentCollection.provider': 'cashfree',
    'driverPaymentCollection.status': { $in: ['active', 'created', 'pending'] },
    'driverPaymentCollection.updatedAt': { $gt: new Date(Date.now() - RECONCILE_WINDOW_MS) },
  })
    .select('_id')
    .limit(RECONCILE_BATCH)
    .lean();

  let settled = 0;
  for (const ride of rides) {
    try {
      const result = await syncCashfreeDriverCollection(ride._id);
      if (result.status === 'paid') settled += 1;
    } catch (error) {
      console.error('[driver-collect] reconcile failed', String(ride._id), error?.message || error);
    }
  }
  return { checked: rides.length, settled };
};
