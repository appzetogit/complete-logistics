// What is still owed on a ride, from the ride document alone (no database calls), so the rider's pay sheet, the
// driver's QR, the "amount to collect" both apps show and the settlement all use the same number.

export const PAID_COLLECTION_STATUSES = new Set(['paid', 'captured', 'success', 'completed']);

// The rider may pay (in the app or by the driver's QR) once the driver is at the drop, and after completion.
export const PAYABLE_LIVE_STATUSES = new Set(['arrived', 'goods_delivered', 'completed']);

export const RIDE_PAYMENT_CODES = Object.freeze({
  ALREADY_PAID: 'ALREADY_PAID',
  PAYMENT_NOT_ALLOWED: 'PAYMENT_NOT_ALLOWED',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
});

// Mongo filter: the ride's fare is not paid yet (used to claim a payment atomically).
export const UNPAID_COLLECTION_FILTER = Object.freeze({
  'driverPaymentCollection.paidAt': null,
  'driverPaymentCollection.status': { $nin: [...PAID_COLLECTION_STATUSES] },
});

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const isRideCollectionPaid = (ride) =>
  Boolean(ride?.driverPaymentCollection?.paidAt)
  || PAID_COLLECTION_STATUSES.has(String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase());

export const normalizeRidePaymentMethodValue = (value) => {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'cash') return 'cash';
  return method === 'wallet' ? 'wallet' : 'online';
};

/**
 * The fare still owed for this ride (tip not included):
 *   paid already (cash received, QR, online, free ride...) -> 0
 *   wallet ride -> 0 until the wallet is charged at completion, then only what the wallet could not cover
 *   cash / online -> fare less a paid goods advance
 */
export const rideFareDue = (ride) => {
  if (!ride || isRideCollectionPaid(ride)) return 0;
  const fare = roundMoney(ride.fare);
  const advancePaid = ride.goodsAdvance?.status === 'paid' ? roundMoney(ride.goodsAdvance.amount) : 0;
  if (ride.paymentMethod === 'wallet') {
    if (!ride.walletPayment?.at) return 0;
    return Math.max(0, roundMoney(fare - advancePaid - roundMoney(ride.walletPayment.amount)));
  }
  return Math.max(0, roundMoney(fare - advancePaid));
};

// Driver assigned, not cancelled, and at the drop or done.
export const isRideInPayableStage = (ride) =>
  Boolean(ride)
  && ride.status !== 'cancelled'
  && Boolean(ride.driverId)
  && (ride.status === 'completed' || PAYABLE_LIVE_STATUSES.has(String(ride.liveStatus || '')));

// A missing method counts as cash (the Ride model default).
export const isCashBooking = (ride) => String(ride?.paymentMethod || 'cash').trim().toLowerCase() === 'cash';

// How long after completion a cash ride can still be paid online (env CASH_PAY_ONLINE_WINDOW_MINUTES, default 60).
export const cashPayOnlineWindowMinutes = () => {
  const raw = process.env.CASH_PAY_ONLINE_WINDOW_MINUTES;
  const value = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(value) && value >= 0 ? value : 60;
};

// A completed cash ride is open for online payment only for a while: older ones were paid in cash (the driver
// app did not record it), so "Pay online instead" must not appear on the rider's history.
export const isPastCashPayWindow = (ride, now = Date.now()) => {
  if (ride?.status !== 'completed' || !isCashBooking(ride)) return false;
  const completedAt = ride.completedAt ? new Date(ride.completedAt).getTime() : Number.NaN;
  if (!Number.isFinite(completedAt)) return true;
  return now - completedAt > cashPayOnlineWindowMinutes() * 60 * 1000;
};

export const isRidePayableNow = (ride, now = Date.now()) => isRideInPayableStage(ride) && !isPastCashPayWindow(ride, now);

/**
 * A cash ride that can switch to online payment right now: driver at the drop (or completed within the window),
 * fare unpaid and > 0. Drives the apps' "Show QR" / "Pay online instead". Same rule the payment endpoints apply.
 * Online and wallet bookings have their own pay flow, so they never get it.
 */
export const canRidePayOnline = (ride, now = Date.now()) =>
  isCashBooking(ride) && rideFareDue(ride) > 0 && isRidePayableNow(ride, now);

/**
 * How a completed ride is settled with the driver:
 *   'online' -> the platform has (or will surely get) the money: the driver is credited fare - commission
 *               (paid online rides, wallet rides, free rides)
 *   'cash'   -> only the commission is deducted now (cash rides, and online rides the rider has not paid yet:
 *               their fare is credited when the payment arrives)
 */
export const rideSettlementBasis = (ride) => {
  const method = normalizeRidePaymentMethodValue(ride?.paymentMethod);
  if (method === 'wallet') return 'online';
  if (method === 'online') return isRideCollectionPaid(ride) ? 'online' : 'cash';
  return 'cash';
};

// Was this ride settled as cash (commission deducted, fare not credited)? Rides settled before `settledAs`
// existed: cash rides were, online ones were credited at once.
export const wasSettledAsCash = (ride) => {
  if (!ride?.walletSettledAt) return false;
  if (ride.settledAs) return ride.settledAs === 'cash';
  return normalizeRidePaymentMethodValue(ride.paymentMethod) === 'cash';
};
