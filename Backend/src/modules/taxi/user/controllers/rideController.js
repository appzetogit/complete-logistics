import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { normalizePoint } from '../../../../utils/geo.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';
import { Driver } from '../../driver/models/Driver.js';
import { WalletTransaction } from '../../driver/models/WalletTransaction.js';
import { applyDriverWalletAdjustment, serializeDriverWallet } from '../../driver/services/walletService.js';
import { RIDE_LIVE_STATUS, RIDE_STATUS } from '../../constants/index.js';
import {
  acceptRideBidAssignment,
  attachAcceptSelfie,
  createRideRecord,
  ensureRideParticipantAccess,
  getAllowedRidePaymentMethodsForPricing,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  increaseRideBidCeiling,
  listRideBidsForUser,
  listRideHistoryForIdentity,
  RIDE_AUDIENCE,
  audienceForRole,
  serializeRidePaymentState,
  serializeRideRealtime,
  submitRideFeedback,
  submitRiderRatingByDriver,
  withoutAcceptSelfie,
  rawRideForAudience,
  serializeRideCancellation,
  updateRideLifecycle,
} from '../../services/rideService.js';
import {
  cancelActiveRideByDriver,
  cancelRideByUser,
  emitRideStateToParticipants,
  emitToDriver,
  getSocketServer,
  notifyRideAccepted,
  notifyRideBiddingUpdated,
  previewUserCancellation,
  restartRideDispatchWithLatestFare,
  startDispatchFlow,
} from '../../services/dispatchService.js';
import { getTipSettings } from '../../services/appSettingsService.js';
import { matchDrivers } from '../../services/matchingService.js';
import { env } from '../../../../config/env.js';
import { Vehicle } from '../../admin/models/Vehicle.js';
import { Ride } from '../models/Ride.js';
import { UserWallet } from '../models/UserWallet.js';
import { getFreeRidesSummaryForUser } from '../services/freeRideService.js';
import { serializeGoodsAdvance } from '../services/goodsAdvanceService.js';
import {
  afterRidePaymentApplied,
  applyRidePayment,
  applyRidePaymentInSession,
  ensureRazorpayPaymentCaptured,
  handleRidePaymentWebhook,
  ridePaymentError,
} from '../../services/ridePaymentService.js';
import { RIDE_PAYMENT_CODES, isRideCollectionPaid, isRidePayableNow, rideFareDue } from '../../services/ridePaymentState.js';
import { signaturesMatch } from '../../services/razorpayClient.js';
import { serializeCancelStatus } from '../../driver/services/driverCancelService.js';

const EARTH_RADIUS_METERS = 6371000;
const AVERAGE_CITY_SPEED_KMPH = 24;

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const calculateDistanceMeters = (fromCoords = [], toCoords = []) => {
  const [fromLng, fromLat] = fromCoords;
  const [toLng, toLat] = toCoords;

  if (![fromLng, fromLat, toLng, toLat].every((value) => Number.isFinite(Number(value)))) {
    return null;
  }

  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const startLat = toRadians(fromLat);
  const endLat = toRadians(toLat);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_METERS * c);
};

const estimateEtaMinutes = (distanceMeters) => {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return 1;
  }

  const metersPerMinute = (AVERAGE_CITY_SPEED_KMPH * 1000) / 60;
  return Math.max(1, Math.round(distanceMeters / metersPerMinute));
};

const normalizeMoneyAmount = (value, fieldName = 'amount') => {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, `${fieldName} must be greater than zero`);
  }

  return Math.round(amount * 100) / 100;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const ensureUserWallet = async (userId, session = null) => {
  if (!userId) return;
  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true, ...(session ? { session } : {}) },
  );
};

const buildCompletionAmounts = (ride, tipAmount = 0) => {
  const fare = roundMoney(ride?.fare || 0);
  const normalizedTipAmount = roundMoney(tipAmount || 0);
  // What is still owed: nothing once paid (cash received, QR, online...), less a paid goods advance, and for a
  // wallet ride only what the wallet could not cover.
  const fareDue = rideFareDue(ride);
  return {
    fare,
    fareDue,
    tipAmount: normalizedTipAmount,
    totalCharge: roundMoney(fareDue + normalizedTipAmount),
  };
};

// The rating is optional when paying: it can come with the payment or later (PATCH /rides/:rideId/feedback).
const validateRideCompletionFeedback = async ({ rating, tipAmount }) => {
  const hasRating = rating !== undefined && rating !== null && rating !== '' && Number(rating) !== 0;
  const numericRating = hasRating ? Number(rating) : null;
  const numericTip = roundMoney(tipAmount || 0);

  if (hasRating && (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5)) {
    throw new ApiError(400, 'rating must be an integer between 1 and 5');
  }

  if (!Number.isFinite(numericTip) || numericTip < 0) {
    throw new ApiError(400, 'tipAmount must be zero or greater');
  }

  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled && numericTip > 0) {
    throw new ApiError(400, 'Tips are currently disabled');
  }

  if (tipsEnabled && numericTip > 0 && minimumTipAmount > 0 && numericTip < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  return {
    rating: numericRating,
    tipAmount: numericTip,
  };
};

// The rider can pay once the driver is at the drop (liveStatus arrived / goods_delivered) and after completion.
const loadPayableRideForUser = async (rideId, userId, session = null) => {
  if (!mongoose.isValidObjectId(rideId)) {
    throw new ApiError(404, 'Ride not found');
  }
  const ride = await Ride.findOne({ _id: rideId, userId }).session(session);

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  if (!isRidePayableNow(ride)) {
    throw ridePaymentError(
      409,
      RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED,
      'This ride cannot be paid yet. You can pay once the driver reaches the drop.',
    );
  }

  return ride;
};

const assertSomethingToPay = (ride, amounts) => {
  if (amounts.totalCharge > 0) return;
  if (isRideCollectionPaid(ride)) {
    throw ridePaymentError(409, RIDE_PAYMENT_CODES.ALREADY_PAID, 'This ride is already paid');
  }
  throw ridePaymentError(400, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'No payable amount remains for this ride');
};

const ridePaymentResultError = (result) => {
  const refunded = Boolean(result.refund && result.refund.status !== 'failed');
  const refundNote = result.refund ? (refunded ? ' The payment is being refunded.' : ' Support will refund this payment.') : '';
  if (result.status === 'duplicate' || result.status === 'already_applied') {
    return ridePaymentError(409, RIDE_PAYMENT_CODES.ALREADY_PAID, `This ride is already paid.${refundNote}`, { refunded });
  }
  if (result.status === 'amount_mismatch') {
    return ridePaymentError(400, RIDE_PAYMENT_CODES.AMOUNT_MISMATCH, `The amount due for this ride has changed.${refundNote}`, {
      refunded,
      amountDue: result.due,
    });
  }
  return ridePaymentError(409, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, `This ride cannot be paid now.${refundNote}`, { refunded });
};

// Records the rider's rating if one came with the payment (completed rides only, once per ride).
const recordOptionalRating = async ({ rideId, userId, rating, comment = '' }) => {
  if (!rating) return;
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, userId, status: RIDE_STATUS.COMPLETED, 'feedback.submittedAt': null },
    {
      $set: {
        'feedback.rating': rating,
        'feedback.comment': String(comment || '').trim().slice(0, 500),
        'feedback.submittedAt': new Date(),
      },
    },
    { returnDocument: 'after' },
  );
  if (!ride?.driverId) return;

  const driver = await Driver.findByIdAndUpdate(
    ride.driverId,
    { $inc: { ratingCount: 1, totalRatingScore: rating } },
    { returnDocument: 'after' },
  );
  if (driver?.ratingCount) {
    await Driver.updateOne(
      { _id: driver._id },
      { $set: { rating: Number((Number(driver.totalRatingScore || 0) / driver.ratingCount).toFixed(1)) } },
    );
  }
};

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials('razor_pay');
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

export const createRide = async (req, res) => {
  const { pickup, drop, pickupAddress, dropAddress, fare, estimatedDistanceMeters, estimatedDurationMinutes, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, serviceType, tripMode, intercity, promo_code, zone_id, service_location_id, transport_type, scheduledAt, bookingMode, userMaxBidFare, bidStepAmount } =
    req.body;

  if (!pickup || !drop) {
    throw new ApiError(400, 'pickup and drop are required');
  }

  const resolvedVehicleTypeId = vehicleTypeId || (Array.isArray(vehicleTypeIds) ? vehicleTypeIds[0] : null);
  if (!resolvedVehicleTypeId) {
    throw new ApiError(400, 'vehicleTypeId is required');
  }

  const ride = await createRideRecord({
    userId: req.auth.sub,
    pickupCoords: normalizePoint(pickup, 'pickup'),
    dropCoords: normalizePoint(drop, 'drop'),
    pickupAddress,
    dropAddress,
    fare: Number(fare || 0),
    estimatedDistanceMeters: Number(estimatedDistanceMeters || 0),
    estimatedDurationMinutes: Number(estimatedDurationMinutes || 0),
    vehicleTypeId,
    vehicleTypeIds,
    vehicleIconType,
    vehicleIconUrl,
    paymentMethod,
    serviceType,
    tripMode,
    intercity,
    promo_code,
    zone_id,
    service_location_id,
    transport_type,
    scheduledAt,
    bookingMode,
    userMaxBidFare,
    bidStepAmount,
  });

  await startDispatchFlow(ride);

  const freeRides = await getFreeRidesSummaryForUser(req.auth.sub).catch(() => null);
  const paymentMethodChanged = ride.$locals?.paymentMethodChanged === true;

  res.status(201).json({
    success: true,
    data: {
      // the rider's cut of the document (no commission terms)
      ride: rawRideForAudience(ride, RIDE_AUDIENCE.USER),
      ...(freeRides ? { freeRides } : {}),
      // The requested method (e.g. wallet) is not allowed for this vehicle/zone: `ride.paymentMethod` is what is used.
      paymentMethodChanged,
      ...(paymentMethodChanged ? { requestedPaymentMethod: ride.$locals.requestedPaymentMethod } : {}),
      realtime: {
        room: getRideRoom(ride._id),
        rideId: String(ride._id),
      },
    },
  });
};

export const getRideById = async (req, res) => {
  await ensureRideParticipantAccess({
    rideId: req.params.rideId,
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  // Only the driver sees their own rating of the rider.
  const ride = await getRideDetails(req.params.rideId, { includeDriverFeedback: req.auth.role === 'driver' });
  const freeRides = req.auth.role === 'user'
    ? await getFreeRidesSummaryForUser(req.auth.sub).catch(() => null)
    : null;

  // Each side gets its own cut: no OTP for the driver; no earnings, commission or accept selfie for the rider.
  const plain = rawRideForAudience(ride, audienceForRole(req.auth.role));
  // The same payment fields as every other ride payload (the raw document does not have them).
  const paymentState = serializeRidePaymentState(ride);
  for (const key of ['isPaid', 'amountToCollect', 'riderPaysInApp', 'paidBy', 'paymentSwitchedFrom', 'canPayOnline']) {
    plain[key] = paymentState[key];
  }
  // Same shape as every other ride payload: null until the ride is cancelled.
  plain.cancellation = serializeRideCancellation(ride);

  res.json({
    success: true,
    data: freeRides ? { ...plain, freeRides } : plain,
  });
};

// What cancelling now would cost, so the app can warn before the rider confirms.
export const getRideCancelPreview = async (req, res) => {
  const ride = await Ride.findOne({ _id: req.params.rideId, userId: req.auth.sub });

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  if ([RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED].includes(ride.status)) {
    throw new ApiError(409, 'This ride can no longer be cancelled');
  }

  res.json({
    success: true,
    data: { rideId: String(ride._id), ...(await previewUserCancellation(ride)) },
  });
};

export const getMyActiveRide = async (req, res) => {
  const ride = await getActiveRideForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  const freeRides = req.auth.role === 'user'
    ? await getFreeRidesSummaryForUser(req.auth.sub).catch(() => null)
    : null;

  res.json({
    success: true,
    data: ride
      ? {
          ...serializeRideRealtime(ride, { audience: audienceForRole(req.auth.role) }),
          ...(freeRides ? { freeRides } : {}),
        }
      : null,
  });
};

export const listMyRides = async (req, res) => {
  const history = await listRideHistoryForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
    limit: req.query.limit,
    page: req.query.page,
    category: req.query.category,
  });

  res.json({
    success: true,
    data: {
      results: history.results,
      total: history.pagination.total,
      pagination: history.pagination,
    },
  });
};

export const updateRideStatus = async (req, res) => {
  if (req.auth.role !== 'driver') {
    throw new ApiError(403, 'Only drivers can update ride status');
  }

  const nextStatus = String(req.body.status || '').trim().toLowerCase();

  const driverSettableStatuses = [
    RIDE_LIVE_STATUS.ACCEPTED,
    RIDE_LIVE_STATUS.ARRIVING,
    RIDE_LIVE_STATUS.GOODS_LOADED,
    RIDE_LIVE_STATUS.STARTED,
    RIDE_LIVE_STATUS.ARRIVED,
    RIDE_LIVE_STATUS.GOODS_DELIVERED,
    RIDE_LIVE_STATUS.COMPLETED,
  ];

  if (!driverSettableStatuses.includes(nextStatus)) {
    throw new ApiError(400, `status must be one of ${driverSettableStatuses.join(', ')}`);
  }

  const ride = await updateRideLifecycle({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    nextStatus,
    paymentMethod: req.body.paymentMethod,
    // Carried on the two goods steps; ignored for every other transition.
    proofImageUrl: req.body.proofImageUrl,
    proofNote: req.body.proofNote,
    receivedBy: req.body.receivedBy,
    selfieImageUrl: req.body.selfieImageUrl,
    // [lng, lat] of the driver now (checked against the pickup / drop radius), and the start-trip OTP.
    coordinates: req.body.coordinates,
    otp: req.body.otp,
    endTripEarly: req.body.endTripEarly, // "arrived" short of the drop: the rider got off early (passenger rides)
    // "Cash received" on completing a cash ride: the fare is paid, the rider can no longer pay it online too.
    cashReceived: req.body.cashReceived,
  });

  try {
    const io = getSocketServer();
    if (io) {
      const populatedRide = await getRideDetails(ride._id);
      const payload = {
        rideId: String(populatedRide._id),
        status: populatedRide.status,
        liveStatus: populatedRide.liveStatus,
        acceptedAt: populatedRide.acceptedAt,
        arrivedAt: populatedRide.arrivedAt,
        startedAt: populatedRide.startedAt,
        completedAt: populatedRide.completedAt,
      };
      const room = getRideRoom(populatedRide._id);
      
      // Emit ride:status:updated
      io.to(room).emit('ride:status:updated', payload);
      
      // ride:state to the rider and the driver, each in their own view
      const statePayload = emitRideStateToParticipants(populatedRide);
      
      // Sync to Firebase/Realtime DB
      const { mirrorRideRealtimeState } = await import('../../services/rideRealtimeSyncService.js');
      mirrorRideRealtimeState(statePayload).catch(() => {});
    }
  } catch (socketError) {
    console.error('Failed to emit status update socket event from controller:', socketError);
  }

  res.json({
    success: true,
    data: serializeRideRealtime(ride, { audience: RIDE_AUDIENCE.DRIVER }),
  });
};

export const submitRideReview = async (req, res) => {
  if (req.auth.role !== 'user') {
    throw new ApiError(403, 'Only users can rate completed rides');
  }

  const ride = await submitRideFeedback({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    rating: req.body.rating,
    comment: req.body.comment,
    tipAmount: req.body.tipAmount,
  });

  res.json({
    success: true,
    data: serializeRideRealtime(ride),
  });
};

/// The driver rates the rider after a completed ride (once per ride).
export const submitRiderRating = async (req, res) => {
  if (req.auth.role !== 'driver') {
    throw new ApiError(403, 'Only drivers can rate riders');
  }

  const ride = await submitRiderRatingByDriver({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    rating: req.body?.rating,
    comment: req.body?.comment,
  });

  res.json({
    success: true,
    data: serializeRideRealtime(ride, { audience: RIDE_AUDIENCE.DRIVER }),
  });
};

/// A driver cancels a ride they accepted but have not started. Counts toward
/// the daily cancel limit; reaching it blocks them until the next IST day.
export const driverCancelRide = async (req, res) => {
  if (req.auth.role !== 'driver') {
    throw new ApiError(403, 'Only drivers can cancel an accepted ride');
  }

  const result = await cancelActiveRideByDriver({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    reason: req.body?.reason,
  });

  res.json({
    success: true,
    data: {
      rideId: String(result.ride._id),
      status: result.ride.status,
      liveStatus: result.ride.liveStatus,
      redispatched: result.redispatched,
      advanceRefunded: result.advanceRefunded,
      ...serializeCancelStatus(result.cancelStatus),
    },
  });
};

export const submitAcceptSelfie = async (req, res) => {
  if (req.auth.role !== 'driver') {
    throw new ApiError(403, 'Only drivers can submit an accept selfie');
  }

  const ride = await attachAcceptSelfie({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    selfieUrl: req.body.selfieUrl,
  });

  res.json({
    success: true,
    data: serializeRideRealtime(ride, { audience: RIDE_AUDIENCE.DRIVER }),
  });
};

export const createRazorpayRideCompletionOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const { tipAmount } = await validateRideCompletionFeedback({
    rating: req.body?.rating,
    tipAmount: req.body?.tipAmount,
  });

  const ride = await loadPayableRideForUser(rideId, req.auth.sub);
  const paymentAmounts = buildCompletionAmounts(ride, tipAmount);
  assertSomethingToPay(ride, paymentAmounts);

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const amountPaise = Math.round(paymentAmounts.totalCharge * 100);

  // A double tap (or reopening the pay sheet) gets the same open order, so the rider can never pay two.
  let order = null;
  let reused = false;
  const open = ride.riderPaymentOrder;
  if (
    open?.orderId
    && Number(open.amountPaise) === amountPaise
    && roundMoney(open.fareDue) === paymentAmounts.fareDue
    && roundMoney(open.tipAmount) === paymentAmounts.tipAmount
  ) {
    const existing = await razorpayRequest({
      method: 'GET',
      path: `/orders/${encodeURIComponent(open.orderId)}`,
      keyId,
      keySecret,
    }).catch(() => null);
    if (existing && ['created', 'attempted'].includes(existing.status)) {
      order = existing;
      reused = true;
    }
  }

  if (!order) {
    const compactRideId = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ride';
    const compactUserId = String(req.auth?.sub || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
    const receipt = `uride_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`;

    order = await razorpayRequest({
      method: 'POST',
      path: '/orders',
      body: {
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          rideId,
          userId: String(req.auth.sub),
          driverId: String(ride.driverId),
          fareDue: String(paymentAmounts.fareDue),
          tipAmount: String(paymentAmounts.tipAmount),
          source: 'ride_completion',
        },
      },
      keyId,
      keySecret,
    });

    await Ride.updateOne(
      { _id: ride._id },
      {
        $set: {
          riderPaymentOrder: {
            orderId: order.id,
            amountPaise,
            fareDue: paymentAmounts.fareDue,
            tipAmount: paymentAmounts.tipAmount,
            createdAt: new Date(),
          },
        },
      },
    );
  }

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      fare: paymentAmounts.fare,
      fareDue: paymentAmounts.fareDue,
      tipAmount: paymentAmounts.tipAmount,
      totalCharge: paymentAmounts.totalCharge,
      reused,
    },
  });
};

export const verifyRazorpayRideCompletion = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const comment = String(req.body?.comment || '');
  const { rating } = await validateRideCompletionFeedback({ rating: req.body?.rating, tipAmount: 0 });
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }
  if (!mongoose.isValidObjectId(rideId)) {
    throw new ApiError(404, 'Ride not found');
  }

  const ride = await Ride.findOne({ _id: rideId, userId: req.auth.sub })
    .select('_id driverPaymentCollection feedback')
    .lean();
  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  // The app retried after a successful verify (or the webhook got there first): already applied.
  const alreadyApplied = String(ride.driverPaymentCollection?.providerPaymentId || '') === paymentId
    || String(ride.feedback?.tipPaymentId || '') === paymentId;

  if (!alreadyApplied) {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (!signaturesMatch(expectedSignature, signature)) {
      throw new ApiError(400, 'Invalid payment signature');
    }

    const order = await razorpayRequest({
      method: 'GET',
      path: `/orders/${encodeURIComponent(orderId)}`,
      keyId,
      keySecret,
    });

    // The order must be this rider's completion order for this ride: an order (and its payment) paid for
    // another ride can never pay this one, even for the same amount.
    const notes = order?.notes || {};
    if (
      String(notes.rideId || '') !== rideId
      || String(notes.userId || '') !== String(req.auth.sub)
      || notes.source !== 'ride_completion'
    ) {
      throw ridePaymentError(400, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'This payment was not made for this ride');
    }

    const fareAmount = roundMoney(notes.fareDue);
    const tipAmount = roundMoney(notes.tipAmount);
    if (Math.round((fareAmount + tipAmount) * 100) !== Number(order.amount)) {
      throw ridePaymentError(400, RIDE_PAYMENT_CODES.AMOUNT_MISMATCH, 'Verified payment amount does not match the order');
    }

    const usedElsewhere = await Ride.exists({
      _id: { $ne: rideId },
      $or: [{ 'driverPaymentCollection.providerPaymentId': paymentId }, { 'feedback.tipPaymentId': paymentId }],
    });
    if (usedElsewhere) {
      throw ridePaymentError(409, RIDE_PAYMENT_CODES.PAYMENT_NOT_ALLOWED, 'This payment was already used for another ride');
    }

    await ensureRazorpayPaymentCaptured({ paymentId, orderId, amountPaise: Number(order.amount) });

    const result = await applyRidePayment({
      rideId,
      userId: req.auth.sub,
      fareAmount,
      tipAmount,
      payment: {
        provider: 'razorpay',
        providerId: paymentId,
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        providerMode: 'razorpay_order',
        source: 'razorpay',
        currency: order.currency || 'INR',
      },
    });

    if (!['applied', 'already_applied'].includes(result.status)) {
      throw ridePaymentResultError(result);
    }

    await Ride.updateOne({ _id: rideId, 'riderPaymentOrder.orderId': orderId }, { $unset: { riderPaymentOrder: 1 } });
  }

  await recordOptionalRating({ rideId, userId: req.auth.sub, rating, comment });

  res.json({
    success: true,
    data: await getRideDetails(rideId),
  });
};

export const payRideCompletionWithWallet = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const comment = String(req.body?.comment || '');
  const { rating, tipAmount } = await validateRideCompletionFeedback({
    rating: req.body?.rating,
    tipAmount: req.body?.tipAmount,
  });

  const session = await mongoose.startSession();
  let result = null;
  const transferId = crypto.randomUUID();

  try {
    await session.withTransaction(async () => {
      const ride = await loadPayableRideForUser(rideId, req.auth.sub, session);
      const paymentAmounts = buildCompletionAmounts(ride, tipAmount);
      assertSomethingToPay(ride, paymentAmounts);

      await ensureUserWallet(req.auth.sub, session);
      // Debited only if the balance covers it, in the same transaction that marks the ride paid.
      const debited = await UserWallet.findOneAndUpdate(
        { userId: req.auth.sub, balance: { $gte: paymentAmounts.totalCharge } },
        {
          $inc: { balance: -paymentAmounts.totalCharge },
          $push: {
            transactions: {
              $each: [{
                kind: 'debit',
                amount: paymentAmounts.totalCharge,
                title: `Ride payment for ${rideId.slice(-6)}${tipAmount > 0 ? ' with tip' : ''}`,
                provider: 'ride_completion_wallet',
                providerPaymentId: transferId,
                walletField: 'balance',
              }],
              $slice: -50,
            },
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!debited) {
        throw new ApiError(400, 'Insufficient wallet balance');
      }

      result = await applyRidePaymentInSession({
        session,
        rideId,
        userId: req.auth.sub,
        fareAmount: paymentAmounts.fareDue,
        tipAmount: paymentAmounts.tipAmount,
        payment: {
          provider: 'wallet',
          providerId: transferId,
          providerPaymentId: transferId,
          providerMode: 'wallet_internal',
          source: 'wallet',
          currency: 'INR',
        },
      });

      if (result.status !== 'applied') {
        throw ridePaymentResultError(result);
      }
    });
  } finally {
    await session.endSession();
  }

  await afterRidePaymentApplied(result, { notificationId: `ride-wallet-${transferId}` });
  await recordOptionalRating({ rideId, userId: req.auth.sub, rating, comment });

  res.status(201).json({
    success: true,
    data: await getRideDetails(rideId),
  });
};

// Razorpay -> server for ride payments (driver QR / payment link, rider checkout). app.js keeps the raw body.
export const razorpayRidePaymentWebhook = async (req, res) => {
  const result = await handleRidePaymentWebhook({
    rawBody: req.rawBody,
    signature: String(req.get('x-razorpay-signature') || ''),
  });

  res.json({ success: true, ...result });
};

export const createRazorpayRideTipOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const tipAmount = normalizeMoneyAmount(req.body?.tipAmount, 'tipAmount');
  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled) {
    throw new ApiError(403, 'Tips are currently disabled');
  }

  if (minimumTipAmount > 0 && tipAmount < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  const ride = await Ride.findOne({
    _id: rideId,
    userId: req.auth.sub,
    status: 'completed',
  }).select('_id driverId feedback');

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const amountPaise = Math.round(tipAmount * 100);
  const compactRideId = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ride';
  const compactUserId = String(req.auth?.sub || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `utip_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        rideId,
        userId: String(req.auth.sub),
        driverId: String(ride.driverId),
        kind: 'ride_tip',
      },
    },
    keyId,
    keySecret,
  });

  res.status(201).json({
    success: true,
    data: {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      tipAmount,
    },
  });
};

export const verifyRazorpayRideTip = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const tipAmount = normalizeMoneyAmount(req.body?.tipAmount, 'tipAmount');
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'rating must be between 1 and 5');
  }

  const tipSettings = await getTipSettings();
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);

  if (!tipsEnabled) {
    throw new ApiError(403, 'Tips are currently disabled');
  }

  if (minimumTipAmount > 0 && tipAmount < minimumTipAmount) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  const ride = await Ride.findOne({
    _id: rideId,
    userId: req.auth.sub,
    status: 'completed',
  });

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt && String(ride.feedback?.tipPaymentId || '') === paymentId) {
    const existingRide = await getRideDetails(rideId);
    res.json({
      success: true,
      data: existingRide,
    });
    return;
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const order = await razorpayRequest({
    method: 'GET',
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId,
    keySecret,
  });

  const amountPaise = Number(order?.amount);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  const verifiedTipAmount = Math.round(amountPaise) / 100;
  if (Math.abs(verifiedTipAmount - tipAmount) > 0.001) {
    throw new ApiError(400, 'Verified tip amount does not match selected tip');
  }

  const driver = await Driver.findById(ride.driverId);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const existingWalletCredit = await WalletTransaction.findOne({
    driverId: ride.driverId,
    'metadata.providerPaymentId': paymentId,
  })
    .select('_id')
    .lean();

  if (existingWalletCredit && String(ride.feedback?.tipPaymentId || '') !== paymentId) {
    throw new ApiError(409, 'This tip payment was already processed');
  }

  const walletResult = existingWalletCredit
    ? {
        wallet: await serializeDriverWallet(driver),
        transaction: null,
      }
    : await applyDriverWalletAdjustment({
        driverId: ride.driverId,
        rideId: ride._id,
        amount: verifiedTipAmount,
        type: 'adjustment',
        description: 'Ride tip credited from rider',
        metadata: {
          source: 'ride_tip',
          provider: 'razorpay',
          providerOrderId: orderId,
          providerPaymentId: paymentId,
          rideId: String(ride._id),
          userId: String(req.auth.sub),
        },
      });

  ride.feedback = {
    rating,
    comment: comment.trim(),
    tipAmount: verifiedTipAmount,
    tipPaymentId: paymentId,
    tipOrderId: orderId,
    tipPaidAt: new Date(),
    submittedAt: new Date(),
  };

  driver.ratingCount = Number(driver.ratingCount || 0) + 1;
  driver.totalRatingScore = Number(driver.totalRatingScore || 0) + rating;
  driver.rating = Number((driver.totalRatingScore / driver.ratingCount).toFixed(1));

  await Promise.all([ride.save(), driver.save()]);

  if (walletResult.transaction) {
    emitToDriver(ride.driverId, 'driver:wallet:updated', {
      wallet: walletResult.wallet,
      transaction: walletResult.transaction,
      notification: {
        id: `ride-tip-${paymentId}`,
        title: 'Payment received',
        body: `Rs ${verifiedTipAmount.toFixed(2)} tip received from rider.`,
        sentAt: new Date().toISOString(),
      },
    });
  }

  const populatedRide = await getRideDetails(ride._id);

  res.json({
    success: true,
    data: populatedRide,
  });
};

export const getRideAppTipSettings = async (_req, res) => {
  const tipSettings = await getTipSettings();

  res.json({
    success: true,
    data: {
      settings: tipSettings,
    },
  });
};

// What the cancel response says about the goods advance. Right after the cancel it comes from this request's
// settlement; on a repeated cancel (the ride is already settled) it is read back from what is stored.
// kept + refunded = the advance.
const advanceCancelSummary = (ride) => {
  const stored = serializeGoodsAdvance(ride);
  const settled = ride.$locals?.advance;
  const keptAmount = settled ? Number(settled.keptAmount || 0) : stored.status === 'forfeited' ? stored.keptAmount : 0;
  const refundedAmount = settled
    ? Number(settled.refundedAmount || 0)
    : ['forfeited', 'refunded'].includes(stored.status) ? stored.refundedAmount : 0;

  return {
    advanceRefunded: refundedAmount > 0,
    advanceStatus: settled?.status || stored.status,
    advanceKeptAmount: keptAmount,
    advanceRefundedAmount: refundedAmount,
    advanceRefundDestination: settled?.refundDestination || stored.refundDestination || '',
  };
};

export const cancelRide = async (req, res) => {
  const ride = await cancelRideByUser({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    reason: req.body?.reason,
  });

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  res.json({
    success: true,
    data: {
      rideId: String(ride._id),
      status: ride.status,
      liveStatus: ride.liveStatus,
      // Goods advance: a rider cancel keeps a share of the fare and refunds the rest ("₹150 charged, ₹50 refunded").
      ...advanceCancelSummary(ride),
      cancellation: serializeRideCancellation(ride),
    },
  });
};

// A stable, opaque id for a map marker: the same driver keeps the same marker between refreshes, but the
// real driver id is never exposed.
const driverMarkerId = (driverId) => crypto
  .createHmac('sha256', String(env.jwtSecret || 'marker'))
  .update(`driver-marker:${String(driverId)}`)
  .digest('hex')
  .slice(0, 16);

/// What a rider may know about a nearby driver: enough to draw the car on the map and estimate the pickup,
/// nothing that identifies the person (no name, plate, vehicle details, rating or phone).
const toPublicDriverMarker = (driver, origin) => {
  const distanceMeters = calculateDistanceMeters(origin, driver.location?.coordinates || []);
  const markerId = driverMarkerId(driver._id);
  return {
    id: markerId,
    markerId,
    vehicleTypeId: driver.vehicleTypeId ? String(driver.vehicleTypeId) : '',
    vehicleIconType: driver.vehicleIconType || '',
    location: driver.location?.coordinates ? { type: 'Point', coordinates: driver.location.coordinates } : null,
    heading: Number.isFinite(Number(driver.heading)) ? Number(driver.heading) : null,
    distanceMeters,
    etaMinutes: estimateEtaMinutes(distanceMeters),
  };
};

const AVAILABLE_DRIVERS_MAX_DISTANCE = 25000;

const parseAvailabilityQuery = (query) => {
  const latitude = Number(query.lat);
  const longitude = Number(query.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new ApiError(400, 'lat and lng are required');
  }
  const distance = Number(query.maxDistance);
  return {
    origin: [longitude, latitude],
    maxDistance: Number.isFinite(distance) && distance > 0 ? Math.min(distance, AVAILABLE_DRIVERS_MAX_DISTANCE) : AVAILABLE_DRIVERS_MAX_DISTANCE,
    serviceLocationId: query.service_location_id && mongoose.Types.ObjectId.isValid(query.service_location_id)
      ? new mongoose.Types.ObjectId(query.service_location_id)
      : null,
  };
};

// Drivers for one vehicle type; when the service location has none, any zone (as the booking flow does).
const matchAvailableDrivers = async ({ origin, maxDistance, serviceLocationId, vehicleTypeId, limit }) => {
  const options = { maxDistance, limit, vehicleTypeId };
  let result = await matchDrivers(origin, { ...options, serviceLocationId });
  if (!result.drivers.length && serviceLocationId) {
    result = await matchDrivers(origin, { ...options, serviceLocationId: null });
  }
  return result.drivers;
};

/**
 * GET /rides/available-drivers/summary?lat=&lng=[&vehicleTypeIds=a,b][&service_location_id=][&transport_type=]
 * Every vehicle type in one call (the app used to make one call per type): the count, the closest driver's
 * distance/ETA and the map markers. Markers only: no names, plates or phone numbers.
 */
export const listAvailableDriversSummary = async (req, res) => {
  const { origin, maxDistance, serviceLocationId } = parseAvailabilityQuery(req.query);
  const requested = String(req.query.vehicleTypeIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  const transportType = String(req.query.transport_type || '').trim().toLowerCase();

  const vehicleFilter = requested.length
    ? { _id: { $in: requested.slice(0, 30) } }
    : { status: 1, ...(transportType ? { transport_type: { $in: [transportType, 'both'] } } : {}) };
  const vehicles = await Vehicle.find(vehicleFilter).select('_id').limit(30).lean();

  const perType = await Promise.all(vehicles.map(async (vehicle) => {
    const drivers = await matchAvailableDrivers({
      origin,
      maxDistance,
      serviceLocationId,
      vehicleTypeId: String(vehicle._id),
      limit: 20,
    });
    const markers = drivers.map((driver) => toPublicDriverMarker(driver, origin))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    // cash / online / wallet the admin allows for this vehicle here (the app shows only these options)
    const { allowedPaymentMethods } = await getAllowedRidePaymentMethodsForPricing({
      serviceLocationId,
      transportType: transportType || 'taxi',
      vehicleTypeId: String(vehicle._id),
    }).catch(() => ({ allowedPaymentMethods: ['cash', 'online'] }));
    return [String(vehicle._id), {
      allowedPaymentMethods,
      totalDrivers: markers.length,
      closestDriverDistanceMeters: markers[0]?.distanceMeters ?? null,
      closestDriverEtaMinutes: markers[0]?.etaMinutes ?? null,
      drivers: markers,
    }];
  }));

  res.json({
    success: true,
    data: { byVehicleType: Object.fromEntries(perType) },
  });
};

export const listAvailableDrivers = async (req, res) => {
  const { vehicleTypeId, lat, lng, maxDistance, limit = 30, service_location_id, transport_type } = req.query;
  const latitude = Number(lat);
  const longitude = Number(lng);
  const distance = Number(maxDistance);

  if (!vehicleTypeId) {
    throw new ApiError(400, 'vehicleTypeId is required');
  }

  if (!mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
    throw new ApiError(400, 'vehicleTypeId is invalid');
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError(400, 'lat and lng are required');
  }

  const normalizedServiceLocationId =
    service_location_id && mongoose.Types.ObjectId.isValid(service_location_id)
      ? new mongoose.Types.ObjectId(service_location_id)
      : null;

  const matchOptions = {
    maxDistance: Number.isFinite(distance) && distance > 0 ? Math.min(distance, 25000) : 25000,
    limit: Math.min(Number(limit) || 30, 50),
    vehicleTypeId,
  };

  let matchResult = await matchDrivers([longitude, latitude], {
    ...matchOptions,
    serviceLocationId: normalizedServiceLocationId,
  });

  if (!matchResult.drivers.length && normalizedServiceLocationId) {
    matchResult = await matchDrivers([longitude, latitude], {
      ...matchOptions,
      serviceLocationId: null,
    });
  }

  const { drivers } = matchResult;

  // Map markers only: who the drivers are (name, plate, vehicle, rating) is not the rider's business.
  const enrichedDrivers = drivers
    .map((driver) => toPublicDriverMarker(driver, [longitude, latitude]))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const closestDriver = enrichedDrivers[0] || null;
  const { allowedPaymentMethods } = await getAllowedRidePaymentMethodsForPricing({
    serviceLocationId: normalizedServiceLocationId,
    transportType: transport_type || 'taxi',
    vehicleTypeId,
  });

  res.json({
    success: true,
    data: {
      totalDrivers: enrichedDrivers.length,
      closestDriverDistanceMeters: closestDriver?.distanceMeters ?? null,
      closestDriverEtaMinutes: closestDriver?.etaMinutes ?? null,
      allowedPaymentMethods,
      drivers: enrichedDrivers,
    },
  });
};

export const getRideBids = async (req, res) => {
  const result = await listRideBidsForUser({
    rideId: req.params.rideId,
    userId: req.auth.sub,
  });

  res.json({
    success: true,
    data: result,
  });
};

export const acceptRideBid = async (req, res) => {
  const ride = await acceptRideBidAssignment({
    rideId: req.params.rideId,
    bidId: req.params.bidId,
    userId: req.auth.sub,
  });

  await notifyRideAccepted(ride);

  res.json({
    success: true,
    data: {
      rideId: String(ride._id),
      status: ride.status,
      liveStatus: ride.liveStatus,
      acceptedAt: ride.acceptedAt,
    },
  });
};

export const updateRideBidCeiling = async (req, res) => {
  const ride = await increaseRideBidCeiling({
    rideId: req.params.rideId,
    userId: req.auth.sub,
    incrementSteps: req.body.incrementSteps,
  });

  await notifyRideBiddingUpdated(ride.rideId || req.params.rideId);
  if (ride.pricingNegotiationMode === 'user_increment_only') {
    await restartRideDispatchWithLatestFare(ride.rideId || req.params.rideId);
  }

  res.json({
    success: true,
    data: ride,
  });
};
