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
  createRideRecord,
  ensureRideParticipantAccess,
  getAllowedRidePaymentMethodsForPricing,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  increaseRideBidCeiling,
  listRideBidsForUser,
  listRideHistoryForIdentity,
  serializeRideRealtime,
  submitRideFeedback,
  updateRideLifecycle,
} from '../../services/rideService.js';
import {
  cancelRideByUser,
  emitToDriver,
  getSocketServer,
  notifyRideAccepted,
  notifyRideBiddingUpdated,
  restartRideDispatchWithLatestFare,
  startDispatchFlow,
} from '../../services/dispatchService.js';
import { getTipSettings } from '../../services/appSettingsService.js';
import { matchDrivers } from '../../services/matchingService.js';
import { Ride } from '../models/Ride.js';
import { UserWallet } from '../models/UserWallet.js';

const EARTH_RADIUS_METERS = 6371000;
const AVERAGE_CITY_SPEED_KMPH = 24;
const PAYMENT_PAID_STATUSES = new Set(['paid', 'captured', 'completed']);

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

const isDriverCollectionPaid = (ride = {}) =>
  Boolean(ride?.driverPaymentCollection?.paidAt) ||
  PAYMENT_PAID_STATUSES.has(String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase());

const buildCompletionAmounts = (ride, tipAmount = 0) => {
  const fare = roundMoney(ride?.fare || 0);
  const normalizedTipAmount = roundMoney(tipAmount || 0);
  const fareDue = isDriverCollectionPaid(ride) ? 0 : fare;
  return {
    fare,
    fareDue,
    tipAmount: normalizedTipAmount,
    totalCharge: roundMoney(fareDue + normalizedTipAmount),
  };
};

const validateRideCompletionFeedback = async ({ rating, tipAmount }) => {
  const numericRating = Number(rating);
  const numericTip = roundMoney(tipAmount || 0);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
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

const loadCompletedRideForUser = async (rideId, userId, session = null) => {
  const ride = await Ride.findOne({
    _id: rideId,
    userId,
    status: RIDE_STATUS.COMPLETED,
  }).session(session);

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  return ride;
};

const finalizeRideCompletion = async ({
  ride,
  userId,
  rating,
  comment = '',
  tipAmount = 0,
  paymentRecord = null,
  paymentSource = '',
  session = null,
}) => {
  if (ride.feedback?.submittedAt) {
    const samePayment =
      (paymentRecord?.providerPaymentId && String(ride.driverPaymentCollection?.providerPaymentId || '') === paymentRecord.providerPaymentId) ||
      (paymentRecord?.providerPaymentId && String(ride.feedback?.tipPaymentId || '') === paymentRecord.providerPaymentId);

    if (samePayment) {
      return getRideDetails(ride._id);
    }

    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const driver = await Driver.findById(ride.driverId).session(session);
  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const { fare, fareDue, totalCharge } = buildCompletionAmounts(ride, tipAmount);
  const previousPaymentMethod = String(ride.paymentMethod || 'cash').trim().toLowerCase() === 'cash' ? 'cash' : 'online';
  const driverCreditAmount = roundMoney(
    tipAmount + (fareDue > 0 && previousPaymentMethod === 'cash' ? fare : 0),
  );

  let walletResult = null;
  if (driverCreditAmount > 0) {
    walletResult = await applyDriverWalletAdjustment({
      driverId: ride.driverId,
      rideId: ride._id,
      amount: driverCreditAmount,
      type: 'adjustment',
      description: fareDue > 0
        ? 'Ride completion payment credited from rider'
        : 'Ride tip credited from rider',
      metadata: {
        source: paymentSource || 'ride_completion',
        rideId: String(ride._id),
        userId: String(userId),
        farePortion: fareDue > 0 ? fare : 0,
        tipAmount,
        totalCharge,
        provider: paymentRecord?.provider || '',
        providerOrderId: paymentRecord?.providerOrderId || '',
        providerPaymentId: paymentRecord?.providerPaymentId || '',
      },
      session,
    });
  }

  if (fareDue > 0) {
    ride.paymentMethod = 'online';
    ride.driverPaymentCollection = {
      provider: paymentRecord?.provider || ride.driverPaymentCollection?.provider || '',
      providerId: paymentRecord?.providerId || ride.driverPaymentCollection?.providerId || paymentRecord?.providerPaymentId || '',
      providerOrderId: paymentRecord?.providerOrderId || '',
      providerPaymentId: paymentRecord?.providerPaymentId || '',
      providerMode: paymentRecord?.providerMode || ride.driverPaymentCollection?.providerMode || '',
      source: paymentRecord?.source || paymentSource || '',
      status: 'paid',
      amount: totalCharge,
      currency: paymentRecord?.currency || ride.driverPaymentCollection?.currency || 'INR',
      linkUrl: paymentRecord?.linkUrl || ride.driverPaymentCollection?.linkUrl || '',
      paidAt: paymentRecord?.paidAt || new Date(),
      updatedAt: new Date(),
    };
  } else if (paymentRecord?.providerPaymentId && !isDriverCollectionPaid(ride) && paymentRecord?.provider) {
    ride.driverPaymentCollection = {
      provider: paymentRecord.provider,
      providerId: paymentRecord.providerId || paymentRecord.providerPaymentId || '',
      providerOrderId: paymentRecord.providerOrderId || '',
      providerPaymentId: paymentRecord.providerPaymentId || '',
      providerMode: paymentRecord.providerMode || '',
      source: paymentRecord.source || paymentSource || '',
      status: 'paid',
      amount: totalCharge,
      currency: paymentRecord.currency || 'INR',
      linkUrl: paymentRecord.linkUrl || '',
      paidAt: paymentRecord.paidAt || new Date(),
      updatedAt: new Date(),
    };
  }

  ride.feedback = {
    rating,
    comment: String(comment || '').trim(),
    tipAmount,
    tipPaymentId: paymentRecord?.providerPaymentId || '',
    tipOrderId: paymentRecord?.providerOrderId || '',
    tipPaidAt: paymentRecord?.providerPaymentId ? (paymentRecord?.paidAt || new Date()) : null,
    submittedAt: new Date(),
  };

  driver.ratingCount = Number(driver.ratingCount || 0) + 1;
  driver.totalRatingScore = Number(driver.totalRatingScore || 0) + rating;
  driver.rating = Number((driver.totalRatingScore / driver.ratingCount).toFixed(1));

  await Promise.all([
    ride.save({ session }),
    driver.save({ session }),
  ]);

  return {
    ride: await getRideDetails(ride._id),
    walletResult,
  };
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
  const { pickup, drop, pickupAddress, dropAddress, fare, estimatedDistanceMeters, estimatedDurationMinutes, vehicleTypeId, vehicleTypeIds, vehicleIconType, vehicleIconUrl, paymentMethod, serviceType, intercity, promo_code, zone_id, service_location_id, transport_type, scheduledAt, bookingMode, userMaxBidFare, bidStepAmount } =
    req.body;

  if (!pickup || !drop) {
    throw new ApiError(400, 'pickup and drop are required');
  }

  console.log('--- TEMPORARY DEBUG LOG ---');
  console.log('backend received vehicleType (ID):', vehicleTypeId);

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

  res.status(201).json({
    success: true,
    data: {
      ride,
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

  const ride = await getRideDetails(req.params.rideId);

  res.json({
    success: true,
    data: ride,
  });
};

export const getMyActiveRide = async (req, res) => {
  const ride = await getActiveRideForIdentity({
    role: req.auth.role,
    entityId: req.auth.sub,
  });

  res.json({
    success: true,
    data: ride ? serializeRideRealtime(ride) : null,
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

  if (![RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.STARTED, RIDE_LIVE_STATUS.ARRIVED, RIDE_LIVE_STATUS.COMPLETED].includes(nextStatus)) {
    throw new ApiError(400, 'status must be accepted, arriving, started, arrived, or completed');
  }

  const ride = await updateRideLifecycle({
    rideId: req.params.rideId,
    driverId: req.auth.sub,
    nextStatus,
    paymentMethod: req.body.paymentMethod,
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
      
      // Emit ride:state
      const statePayload = serializeRideRealtime(populatedRide);
      io.to(room).emit('ride:state', statePayload);
      
      // Sync to Firebase/Realtime DB
      const { mirrorRideRealtimeState } = await import('../../services/rideRealtimeSyncService.js');
      mirrorRideRealtimeState(statePayload).catch(() => {});
    }
  } catch (socketError) {
    console.error('Failed to emit status update socket event from controller:', socketError);
  }

  res.json({
    success: true,
    data: serializeRideRealtime(ride),
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

export const createRazorpayRideCompletionOrder = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const { tipAmount } = await validateRideCompletionFeedback({
    rating: Number(req.body?.rating || 0),
    tipAmount: req.body?.tipAmount,
  });

  const ride = await loadCompletedRideForUser(rideId, req.auth.sub);

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const paymentAmounts = buildCompletionAmounts(ride, tipAmount);

  if (paymentAmounts.totalCharge <= 0) {
    throw new ApiError(400, 'No payable amount remains for this ride');
  }

  const compactRideId = rideId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'ride';
  const compactUserId = String(req.auth?.sub || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const receipt = `uride_${compactUserId}_${compactRideId}_${Date.now().toString(36)}`;

  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(paymentAmounts.totalCharge * 100),
      currency: 'INR',
      receipt,
      notes: {
        rideId,
        userId: String(req.auth.sub),
        driverId: String(ride.driverId),
        fareDue: String(paymentAmounts.fareDue),
        tipAmount: String(tipAmount),
        source: 'ride_completion',
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
      fare: paymentAmounts.fare,
      fareDue: paymentAmounts.fareDue,
      tipAmount: paymentAmounts.tipAmount,
      totalCharge: paymentAmounts.totalCharge,
    },
  });
};

export const verifyRazorpayRideCompletion = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const { tipAmount } = await validateRideCompletionFeedback({
    rating,
    tipAmount: req.body?.tipAmount,
  });
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');

  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }

  const ride = await loadCompletedRideForUser(rideId, req.auth.sub);

  if (
    ride.feedback?.submittedAt &&
    (String(ride.driverPaymentCollection?.providerPaymentId || '') === paymentId || String(ride.feedback?.tipPaymentId || '') === paymentId)
  ) {
    return res.json({
      success: true,
      data: await getRideDetails(rideId),
    });
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

  const paymentAmounts = buildCompletionAmounts(ride, tipAmount);
  const verifiedTotalCharge = roundMoney(Number(order?.amount || 0) / 100);
  if (verifiedTotalCharge <= 0) {
    throw new ApiError(400, 'Invalid order amount');
  }

  if (Math.abs(verifiedTotalCharge - paymentAmounts.totalCharge) > 0.001) {
    throw new ApiError(400, 'Verified payment amount does not match the payable ride total');
  }

  const existingWalletCredit = await WalletTransaction.findOne({
    driverId: ride.driverId,
    'metadata.providerPaymentId': paymentId,
  })
    .select('_id')
    .lean();

  if (
    existingWalletCredit &&
    String(ride.driverPaymentCollection?.providerPaymentId || '') !== paymentId &&
    String(ride.feedback?.tipPaymentId || '') !== paymentId
  ) {
    throw new ApiError(409, 'This ride completion payment was already processed');
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const liveRide = await loadCompletedRideForUser(rideId, req.auth.sub, session);
    const result = await finalizeRideCompletion({
      ride: liveRide,
      userId: req.auth.sub,
      rating,
      comment,
      tipAmount,
      paymentSource: 'ride_completion_razorpay',
      paymentRecord: {
        provider: 'razorpay',
        providerId: paymentId,
        providerOrderId: orderId,
        providerPaymentId: paymentId,
        providerMode: 'razorpay_order',
        source: 'ride_completion_razorpay',
        currency: order.currency || 'INR',
        paidAt: new Date(),
      },
      session,
    });

    await session.commitTransaction();

    if (result.walletResult?.transaction) {
      emitToDriver(liveRide.driverId, 'driver:wallet:updated', {
        wallet: result.walletResult.wallet,
        transaction: result.walletResult.transaction,
        notification: {
          id: `ride-payment-${paymentId}`,
          title: 'Payment received',
          body: `Rs ${paymentAmounts.totalCharge.toFixed(2)} received from rider for completed ride.`,
          sentAt: new Date().toISOString(),
        },
      });
    }

    res.json({
      success: true,
      data: result.ride,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const payRideCompletionWithWallet = async (req, res) => {
  const rideId = String(req.params.rideId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '');
  const { tipAmount } = await validateRideCompletionFeedback({
    rating,
    tipAmount: req.body?.tipAmount,
  });

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ride = await loadCompletedRideForUser(rideId, req.auth.sub, session);
    const paymentAmounts = buildCompletionAmounts(ride, tipAmount);

    if (paymentAmounts.totalCharge <= 0) {
      throw new ApiError(400, 'No payable amount remains for this ride');
    }

    await ensureUserWallet(req.auth.sub, session);
    const userWallet = await UserWallet.findOne({ userId: req.auth.sub }).session(session);
    if (!userWallet) {
      throw new ApiError(404, 'User wallet not found');
    }

    if (Number(userWallet.balance || 0) < paymentAmounts.totalCharge) {
      throw new ApiError(400, 'Insufficient wallet balance');
    }

    const transferId = crypto.randomUUID();
    userWallet.balance = roundMoney(Number(userWallet.balance || 0) - paymentAmounts.totalCharge);
    userWallet.transactions.push({
      kind: 'debit',
      amount: paymentAmounts.totalCharge,
      title: `Ride payment for ${rideId.slice(-6)}${tipAmount > 0 ? ' with tip' : ''}`,
      provider: 'ride_completion_wallet',
      providerPaymentId: transferId,
    });
    userWallet.transactions = userWallet.transactions.slice(-50);
    await userWallet.save({ session });

    const result = await finalizeRideCompletion({
      ride,
      userId: req.auth.sub,
      rating,
      comment,
      tipAmount,
      paymentSource: 'ride_completion_wallet',
      paymentRecord: {
        provider: 'wallet',
        providerId: transferId,
        providerOrderId: '',
        providerPaymentId: transferId,
        providerMode: 'wallet_internal',
        source: 'ride_completion_wallet',
        currency: 'INR',
        paidAt: new Date(),
      },
      session,
    });

    await session.commitTransaction();

    if (result.walletResult?.transaction) {
      emitToDriver(ride.driverId, 'driver:wallet:updated', {
        wallet: result.walletResult.wallet,
        transaction: result.walletResult.transaction,
        notification: {
          id: `ride-wallet-${transferId}`,
          title: 'Payment received',
          body: `Rs ${paymentAmounts.totalCharge.toFixed(2)} received from rider wallet for completed ride.`,
          sentAt: new Date().toISOString(),
        },
      });
    }

    res.status(201).json({
      success: true,
      data: result.ride,
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
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

export const cancelRide = async (req, res) => {
  const ride = await cancelRideByUser({
    rideId: req.params.rideId,
    userId: req.auth.sub,
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
    },
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

  const enrichedDrivers = drivers.map((driver) => {
    const distanceMeters = calculateDistanceMeters([longitude, latitude], driver.location?.coordinates || []);
    const etaMinutes = estimateEtaMinutes(distanceMeters);

    return {
      id: driver._id,
      name: driver.name,
      vehicleTypeId: driver.vehicleTypeId,
      vehicleType: driver.vehicleType,
      vehicleIconType: driver.vehicleIconType,
      vehicleNumber: driver.vehicleNumber,
      vehicleColor: driver.vehicleColor,
      vehicleMake: driver.vehicleMake,
      vehicleModel: driver.vehicleModel,
      rating: driver.rating,
      location: driver.location,
      distanceMeters,
      etaMinutes,
    };
  });

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
