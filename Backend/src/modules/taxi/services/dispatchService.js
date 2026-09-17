import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { runRedisCommand } from '../../../infrastructure/redis/redisClient.js';
import { Ride } from '../user/models/Ride.js';
import { User } from '../user/models/User.js';
import { UserWallet } from '../user/models/UserWallet.js';
import { Driver } from '../driver/models/Driver.js';
import { WalletTransaction } from '../driver/models/WalletTransaction.js';
import { applyDriverWalletAdjustment } from '../driver/services/walletService.js';
import { matchDrivers } from './matchingService.js';
import {
  RIDE_LIVE_STATUS,
  RIDE_STATUS,
} from '../constants/index.js';
import { Delivery } from '../user/models/Delivery.js';
import { getRideRoom, resolveSetPriceForRide } from './rideService.js';
import { SOCKET_EVENTS } from '../socket/events.js';
import { resolveTransportDispatchConfig } from './transportSettingsService.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';

const activeDispatches = new Map();
let ioInstance = null;
const scheduledDispatchTimers = new Map();
const dispatchLeaseRefreshTimers = new Map();
const lateDriverNotificationTimestamps = new Map();
const lateDriverNotificationInflight = new Map();
let dispatchRecoveryTimer = null;

const DISPATCH_INSTANCE_ID = `${process.pid}:${crypto.randomUUID()}`;
const DISPATCH_LEASE_TTL_MS = 90_000;
const DISPATCH_LEASE_REFRESH_MS = 30_000;
const DISPATCH_RECOVERY_INTERVAL_MS = 30_000;
const LATE_DRIVER_NOTIFICATION_COOLDOWN_MS = 10_000;

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const getDispatchLeaseKey = (rideId) => `dispatch:lease:${String(rideId)}`;

const renewDispatchLease = async (rideId) => {
  const result = await runRedisCommand(
    async (client) => client.eval(
      `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('pexpire', KEYS[1], ARGV[2])
        end
        return 0
      `,
      {
        keys: [getDispatchLeaseKey(rideId)],
        arguments: [DISPATCH_INSTANCE_ID, String(DISPATCH_LEASE_TTL_MS)],
      },
    ),
    { label: `dispatch lease renew ${rideId}` },
  );

  return !result.ok || Number(result.value || 0) === 1;
};

const releaseDispatchLease = async (rideId) => {
  await runRedisCommand(
    async (client) => client.eval(
      `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
      `,
      {
        keys: [getDispatchLeaseKey(rideId)],
        arguments: [DISPATCH_INSTANCE_ID],
      },
    ),
    { label: `dispatch lease release ${rideId}` },
  ).catch(() => null);
};

const stopDispatchLeaseRefresh = (rideId) => {
  const key = String(rideId);
  const timer = dispatchLeaseRefreshTimers.get(key);
  if (!timer) {
    return;
  }

  clearInterval(timer);
  dispatchLeaseRefreshTimers.delete(key);
};

const startDispatchLeaseRefresh = (rideId) => {
  const key = String(rideId);
  if (dispatchLeaseRefreshTimers.has(key)) {
    return;
  }

  const timer = setInterval(() => {
    renewDispatchLease(key)
      .then((stillOwned) => {
        if (!stillOwned) {
          stopDispatchFlow(key, { releaseLease: false });
        }
      })
      .catch(() => {});
  }, DISPATCH_LEASE_REFRESH_MS);

  timer.unref?.();
  dispatchLeaseRefreshTimers.set(key, timer);
};

const ensureDispatchLease = async (rideId) => {
  const result = await runRedisCommand(
    async (client) => {
      const key = getDispatchLeaseKey(rideId);
      const acquired = await client.set(key, DISPATCH_INSTANCE_ID, {
        NX: true,
        PX: DISPATCH_LEASE_TTL_MS,
      });

      if (acquired === 'OK') {
        return { owned: true };
      }

      const currentOwner = await client.get(key);
      if (currentOwner === DISPATCH_INSTANCE_ID) {
        await client.pExpire(key, DISPATCH_LEASE_TTL_MS);
        return { owned: true };
      }

      return {
        owned: false,
        currentOwner: currentOwner || '',
      };
    },
    { label: `dispatch lease acquire ${rideId}` },
  );

  if (!result.ok) {
    return true;
  }

  if (!result.value?.owned) {
    stopDispatchLeaseRefresh(rideId);
    return false;
  }

  startDispatchLeaseRefresh(rideId);
  return true;
};

const ensureUserWallet = async (userId, session = null) => {
  if (!userId) {
    return;
  }

  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true, session },
  );
};

const normalizeRideTransportType = (ride) => {
  const serviceType = String(ride?.serviceType || '').trim().toLowerCase();
  const transportType = String(ride?.transport_type || '').trim().toLowerCase();

  if (serviceType === 'parcel') {
    return transportType === 'both' ? 'delivery' : (transportType || 'delivery');
  }

  if (serviceType === 'intercity') {
    return 'intercity';
  }

  if (transportType === 'all' || transportType === 'both' || !transportType) {
    return 'taxi';
  }

  return transportType;
};

const computeCancellationFeeAmount = ({ ride, feeType, feeValue }) => {
  const baseAmount = Math.max(roundMoney(ride?.fare || 0), roundMoney(ride?.baseFare || 0), 0);
  const normalizedValue = Math.max(roundMoney(feeValue || 0), 0);
  const normalizedType = String(feeType || 'percentage').trim().toLowerCase();

  if (normalizedValue <= 0) {
    return 0;
  }

  if (normalizedType === 'fixed') {
    return normalizedValue;
  }

  return Math.min(roundMoney((baseAmount * normalizedValue) / 100), baseAmount);
};

const resolveCancellationPricing = async (ride, session) => {
  if (!ride?.vehicleTypeId) {
    return null;
  }

  return resolveSetPriceForRide({
    serviceLocationId: ride.service_location_id || null,
    transportType: normalizeRideTransportType(ride),
    vehicleTypeId: ride.vehicleTypeId,
  });
};

const matchDispatchDrivers = async ({
  ride,
  radius,
  dispatchVehicleTypeIds,
}) => {
  const sharedOptions = {
    maxDistance: radius,
    vehicleTypeId: ride.vehicleTypeId,
    vehicleTypeIds: dispatchVehicleTypeIds,
  };

  let result = await matchDrivers(ride.pickupLocation.coordinates, {
    ...sharedOptions,
    serviceLocationId: ride.service_location_id || null,
  });

  if (!result.drivers.length && ride.service_location_id) {
    result = await matchDrivers(ride.pickupLocation.coordinates, {
      ...sharedOptions,
      serviceLocationId: null,
    });
  }

  return result;
};

const applyUserWalletAdjustment = async ({
  userId,
  amount,
  kind,
  title,
  referenceKey,
  walletField = 'balance',
  provider = 'ride_cancellation',
  session = null,
  requireSufficientFunds = false,
}) => {
  const normalizedAmount = roundMoney(amount);
  const normalizedKind = kind === 'debit' ? 'debit' : 'credit';
  const normalizedField = walletField === 'refundWallet' ? 'refundWallet' : 'balance';
  const normalizedReferenceKey = String(referenceKey || '').trim();

  if (!userId || normalizedAmount <= 0 || !normalizedReferenceKey) {
    return { status: 'skipped', amount: 0 };
  }

  await ensureUserWallet(userId, session);

  const existing = await UserWallet.findOne({
    userId,
    'transactions.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .session(session)
    .lean();

  if (existing) {
    return { status: 'existing', amount: normalizedAmount };
  }

  const tx = {
    kind: normalizedKind,
    amount: normalizedAmount,
    title: String(title || '').trim(),
    provider,
    referenceKey: normalizedReferenceKey,
  };

  const updateFilter = { userId };
  if (normalizedKind === 'debit' && requireSufficientFunds) {
    updateFilter[normalizedField] = { $gte: normalizedAmount };
  }

  const updateResult = await UserWallet.updateOne(
    updateFilter,
    {
      $inc: { [normalizedField]: normalizedKind === 'credit' ? normalizedAmount : -normalizedAmount },
      $push: { transactions: { $each: [tx], $slice: -50 } },
    },
    { session },
  );

  if (!updateResult?.modifiedCount) {
    return { status: requireSufficientFunds ? 'insufficient_funds' : 'not_modified', amount: normalizedAmount };
  }

  return { status: 'applied', amount: normalizedAmount };
};

const applyDriverWalletAdjustmentByReference = async ({
  driverId,
  amount,
  rideId = null,
  description,
  referenceKey,
  metadata = {},
  session = null,
}) => {
  const normalizedAmount = roundMoney(amount);
  const normalizedReferenceKey = String(referenceKey || '').trim();

  if (!driverId || !normalizedAmount || !normalizedReferenceKey) {
    return { status: 'skipped', amount: normalizedAmount, walletResult: null };
  }

  const existing = await WalletTransaction.findOne({
    driverId,
    'metadata.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .session(session)
    .lean();

  if (existing) {
    return { status: 'existing', amount: normalizedAmount, walletResult: null };
  }

  const walletResult = await applyDriverWalletAdjustment({
    driverId,
    amount: normalizedAmount,
    type: 'adjustment',
    rideId,
    description,
    metadata: {
      ...metadata,
      referenceKey: normalizedReferenceKey,
    },
    session,
  });

  return { status: 'applied', amount: normalizedAmount, walletResult };
};

const settleUserCancellationFee = async (ride, session) => {
  const pricing = await resolveCancellationPricing(ride, session);
  const feeAmount = computeCancellationFeeAmount({
    ride,
    feeType: pricing?.user_cancellation_fee_type,
    feeValue: pricing?.user_cancellation_fee,
  });

  if (feeAmount <= 0) {
    return { feeAmount: 0, userDebitStatus: 'none', driverCreditStatus: 'none', driverWalletResult: null };
  }

  const feeReferenceBase = `ride-cancel:user:${String(ride._id)}`;
  const userDebit = await applyUserWalletAdjustment({
    userId: ride.userId,
    amount: feeAmount,
    kind: 'debit',
    title: `Ride cancellation fee for booking ${String(ride._id).slice(-6)}`,
    referenceKey: `${feeReferenceBase}:user-debit`,
    session,
    requireSufficientFunds: true,
  });

  let driverCredit = { status: 'skipped', walletResult: null };
  const shouldCreditDriver =
    ['applied', 'existing'].includes(userDebit.status) &&
    String(pricing?.cancellation_fee_goes_to || 'admin').trim().toLowerCase() === 'driver' &&
    ride.driverId;

  if (shouldCreditDriver) {
    driverCredit = await applyDriverWalletAdjustmentByReference({
      driverId: ride.driverId,
      amount: feeAmount,
      rideId: ride._id,
      description: `Cancellation fee received for booking ${String(ride._id).slice(-6)}`,
      referenceKey: `${feeReferenceBase}:driver-credit`,
      metadata: {
        source: 'ride_cancellation_fee',
        cancelledBy: 'user',
        counterpartyRole: 'user',
        counterpartyId: String(ride.userId),
      },
      session,
    });
  }

  return {
    feeAmount,
    userDebitStatus: userDebit.status,
    driverCreditStatus: driverCredit.status,
    driverWalletResult: driverCredit.walletResult || null,
  };
};

const settleDriverCancellationFee = async (ride, session) => {
  const pricing = await resolveCancellationPricing(ride, session);
  const feeAmount = computeCancellationFeeAmount({
    ride,
    feeType: pricing?.driver_cancellation_fee_type,
    feeValue: pricing?.driver_cancellation_fee,
  });

  if (feeAmount <= 0 || !ride?.driverId) {
    return { feeAmount: 0, driverDebitStatus: 'none', userCreditStatus: 'none', driverWalletResult: null };
  }

  const feeReferenceBase = `ride-cancel:driver:${String(ride._id)}`;
  const driverDebit = await applyDriverWalletAdjustmentByReference({
    driverId: ride.driverId,
    amount: -feeAmount,
    rideId: ride._id,
    description: `Scheduled ride cancellation fee for booking ${String(ride._id).slice(-6)}`,
    referenceKey: `${feeReferenceBase}:driver-debit`,
    metadata: {
      source: 'ride_cancellation_fee',
      cancelledBy: 'driver',
      counterpartyRole: 'user',
      counterpartyId: String(ride.userId),
    },
    session,
  });

  let userCredit = { status: 'skipped' };
  if (['applied', 'existing'].includes(driverDebit.status) && ride.userId) {
    userCredit = await applyUserWalletAdjustment({
      userId: ride.userId,
      amount: feeAmount,
      kind: 'credit',
      title: `Driver cancellation compensation for booking ${String(ride._id).slice(-6)}`,
      referenceKey: `${feeReferenceBase}:user-credit`,
      walletField: 'refundWallet',
      provider: 'ride_cancellation_refund',
      session,
    });
  }

  return {
    feeAmount,
    driverDebitStatus: driverDebit.status,
    userCreditStatus: userCredit.status,
    driverWalletResult: driverDebit.walletResult || null,
  };
};

export const getUserRoom = (userId) => `user:${userId}`;
export const getDriverRoom = (driverId) => `driver:${driverId}`;
export const getAdminRoom = () => 'admin:broadcast';

export const setSocketServer = (io) => {
  ioInstance = io;
};

export const getSocketServer = () => ioInstance;

export const joinRideRoom = (socket, rideId) => {
  socket.join(getRideRoom(rideId));
};

export const addSocketSubscriptions = (socket, { role, entityId }) => {
  if (role === 'admin') {
    socket.join(getAdminRoom());
    return;
  }

  if (role === 'user') {
    socket.join(getUserRoom(entityId));
    return;
  }

  if (role === 'driver') {
    socket.join(getDriverRoom(entityId));
  }
};

const getDispatchVehicleTypeIds = (ride) => {
  const ids = [
    ...(Array.isArray(ride.dispatchVehicleTypeIds) ? ride.dispatchVehicleTypeIds : []),
    ride.vehicleTypeId,
  ];

  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
};

const normalizeDispatchDriverIds = (value) => [...new Set(
  (Array.isArray(value) ? value : [value])
    .map((id) => String(id || '').trim())
    .filter(Boolean),
)];

const getPersistedDispatchTracking = (ride = {}) => ({
  notifiedDriverIds: normalizeDispatchDriverIds(ride?.dispatchTracking?.notifiedDriverIds),
  rejectedDriverIds: normalizeDispatchDriverIds(ride?.dispatchTracking?.rejectedDriverIds),
});

const hydrateDispatchStateFromRide = (ride) => {
  if (!ride?._id) {
    return getDispatchState('');
  }

  const persistedTracking = getPersistedDispatchTracking(ride);
  const currentState = getDispatchState(ride._id);
  const nextNotifiedDriverIds = normalizeDispatchDriverIds([
    ...persistedTracking.notifiedDriverIds,
    ...currentState.notifiedDriverIds,
  ]);
  const nextRejectedDriverIds = normalizeDispatchDriverIds([
    ...persistedTracking.rejectedDriverIds,
    ...currentState.rejectedDriverIds,
  ]);

  if (
    nextNotifiedDriverIds.length !== currentState.notifiedDriverIds.length ||
    nextRejectedDriverIds.length !== currentState.rejectedDriverIds.length
  ) {
    return saveDispatchState(ride._id, {
      notifiedDriverIds: nextNotifiedDriverIds,
      rejectedDriverIds: nextRejectedDriverIds,
    });
  }

  return currentState;
};

const persistDispatchTrackingProgress = async ({
  rideId,
  notifiedDriverIds = [],
  rejectedDriverIds = [],
  reset = false,
} = {}) => {
  if (!rideId) {
    return;
  }

  const safeNotifiedDriverIds = normalizeDispatchDriverIds(notifiedDriverIds);
  const safeRejectedDriverIds = normalizeDispatchDriverIds(rejectedDriverIds);
  const update = reset
    ? {
        $set: {
          'dispatchTracking.notifiedDriverIds': [],
          'dispatchTracking.rejectedDriverIds': [],
          'dispatchTracking.lastDispatchAttemptAt': null,
        },
      }
    : {
        $set: {
          'dispatchTracking.lastDispatchAttemptAt': new Date(),
        },
      };

  if (!reset && safeNotifiedDriverIds.length) {
    update.$addToSet = {
      ...(update.$addToSet || {}),
      'dispatchTracking.notifiedDriverIds': { $each: safeNotifiedDriverIds },
    };
  }

  if (!reset && safeRejectedDriverIds.length) {
    update.$addToSet = {
      ...(update.$addToSet || {}),
      'dispatchTracking.rejectedDriverIds': { $each: safeRejectedDriverIds },
    };
  }

  await Ride.updateOne({ _id: rideId }, update);
};

const emitToSocket = (socketId, event, payload) => {
  if (ioInstance && socketId) {
    ioInstance.to(socketId).emit(event, payload);
  }
};

const emitToRoom = (room, event, payload) => {
  if (ioInstance) {
    ioInstance.to(room).emit(event, payload);
  }
};

export const notifyUserAccountDeleted = (userId) => {
  if (!userId) return;
  emitToRoom(getUserRoom(userId), 'account:deleted', {
    reason: 'delete_request_approved',
  });
};

export const emitToDriver = (driverId, event, payload) => {
  if (driverId) {
    emitToRoom(getDriverRoom(driverId), event, payload);
  }
};

export const emitToAdmins = (event, payload) => {
  emitToRoom(getAdminRoom(), event, payload);
};

const clearDispatchTimer = (rideId) => {
  const state = activeDispatches.get(String(rideId));

  if (state?.timer) {
    clearTimeout(state.timer);
  }
};

const clearScheduledDispatchTimer = (rideId) => {
  const key = String(rideId);
  const timer = scheduledDispatchTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    scheduledDispatchTimers.delete(key);
  }
};

export const stopDispatchFlow = (rideId, { releaseLease = true } = {}) => {
  clearDispatchTimer(rideId);
  clearScheduledDispatchTimer(rideId);
  stopDispatchLeaseRefresh(rideId);
  activeDispatches.delete(String(rideId));

  if (releaseLease) {
    releaseDispatchLease(rideId).catch(() => null);
  }
};

export const restartRideDispatchWithLatestFare = async (rideId) => {
  if (!rideId) {
    return;
  }

  const state = getDispatchState(rideId);
  closeDriverRequestWindow(rideId, [
    ...state.driverIds,
    ...state.notifiedDriverIds,
    ...state.rejectedDriverIds,
  ]);
  stopDispatchFlow(rideId, { releaseLease: false });
  await persistDispatchTrackingProgress({ rideId, reset: true }).catch(() => null);

  const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');
  if (!ride || ride.status !== RIDE_STATUS.SEARCHING || ride.liveStatus !== RIDE_LIVE_STATUS.SEARCHING) {
    return;
  }

  await startDispatchFlow(ride);
};

const getDispatchState = (rideId) => {
  const rideKey = String(rideId);
  const state = activeDispatches.get(rideKey) || {};

  return {
    radiusIndex: Number.isInteger(state.radiusIndex) ? state.radiusIndex : 0,
    timer: state.timer || null,
    driverIds: Array.isArray(state.driverIds) ? state.driverIds : [],
    notifiedDriverIds: Array.isArray(state.notifiedDriverIds) ? state.notifiedDriverIds : [],
    rejectedDriverIds: Array.isArray(state.rejectedDriverIds) ? state.rejectedDriverIds : [],
  };
};

const saveDispatchState = (rideId, nextState = {}) => {
  const rideKey = String(rideId);
  const currentState = getDispatchState(rideKey);

  activeDispatches.set(rideKey, {
    ...currentState,
    ...nextState,
  });

  return activeDispatches.get(rideKey);
};

const hasLocalDispatchFlow = (rideId) => {
  const key = String(rideId);
  return activeDispatches.has(key) ||
    scheduledDispatchTimers.has(key) ||
    dispatchLeaseRefreshTimers.has(key);
};

const closeDriverRequestWindow = (rideId, driverIds = []) => {
  const safeDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : []).map((id) => String(id || '')).filter(Boolean))];

  for (const driverId of safeDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(rideId),
      reason: 'search-window-expired',
    });
  }
};

const emitRideRequestToDrivers = async ({
  ride,
  targetDrivers = [],
  zone = null,
  effectiveRadius = 0,
  dispatchVehicleTypeIds = [],
  dispatchConfig,
  attemptIndex = 0,
}) => {
  if (!ride || !targetDrivers.length) {
    return;
  }

  const requestExpiresAt = new Date(Date.now() + dispatchConfig.retryDelayMs).toISOString();

  for (const driver of targetDrivers) {
    emitToDriver(driver._id, 'rideRequest', {
      rideId: String(ride._id),
      type: ride.serviceType || 'ride',
      serviceType: ride.serviceType || 'ride',
      userId: String(ride.userId),
      user: {
        id: ride.userId?._id ? String(ride.userId._id) : String(ride.userId || ''),
        name: ride.userId?.name || 'Customer',
        phone: ride.userId?.phone || '',
        countryCode: ride.userId?.countryCode || '',
      },
      pickupLocation: ride.pickupLocation,
      pickupAddress: ride.pickupAddress || '',
      dropLocation: ride.dropLocation,
      dropAddress: ride.dropAddress || '',
      scheduledAt: ride.scheduledAt || null,
      estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
      estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
      vehicleTypeId: ride.vehicleTypeId ? String(ride.vehicleTypeId) : null,
      vehicleTypeIds: dispatchVehicleTypeIds,
      vehicleIconType: ride.vehicleIconType,
      vehicleIconUrl: ride.vehicleIconUrl || '',
      fare: ride.fare,
      baseFare: Number(ride.baseFare || ride.fare || 0),
      bookingMode: ride.bookingMode || 'normal',
      pricingNegotiationMode: ride.pricingNegotiationMode || 'none',
      biddingStatus: ride.biddingStatus || 'none',
      bidding: ride.pricingNegotiationMode === 'driver_bid'
        ? {
            enabled: true,
            baseFare: Number(ride.baseFare || ride.fare || 0),
            bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
            userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
            bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
            bidStepAmount: Number(ride.bidStepAmount || 10),
          }
        : {
            enabled: false,
          },
      fareIncreaseWaitMinutes: Number(ride.fareIncreaseWaitMinutes || 0),
      nextFareIncreaseAt: ride.nextFareIncreaseAt || null,
      paymentMethod: ride.paymentMethod,
      parcel: ride.parcel || null,
      intercity: ride.intercity || null,
      radius: effectiveRadius,
      attempt: attemptIndex + 1,
      maxAttempts: dispatchConfig.maxAttempts,
      acceptRejectDurationSeconds: dispatchConfig.retryWindowSeconds,
      expiresInSeconds: dispatchConfig.retryWindowSeconds,
      requestExpiresAt,
      zoneId: zone?._id ? String(zone._id) : null,
    });
  }

  sendPushNotificationToEntities({
    driverIds: targetDrivers.map((driver) => String(driver._id)),
    title: ride.serviceType === 'parcel' ? 'New delivery request' : 'New ride request',
    body: ride.pickupAddress
      ? `Pickup: ${ride.pickupAddress}`
      : 'A new booking is waiting for your response.',
    data: {
      type: 'ride_request',
      rideId: String(ride._id),
      serviceType: ride.serviceType || 'ride',
      userId: String(ride.userId?._id || ride.userId || ''),
    },
  }).catch((error) => {
    console.error('Failed to send driver ride-request push notification', error);
  });
};

export const markDriverRejectedFromDispatch = async (rideId, driverId) => {
  if (!rideId || !driverId) {
    return;
  }

  const state = getDispatchState(rideId);
  const rejectedDriverIds = [...new Set([...state.rejectedDriverIds, String(driverId)])];

  saveDispatchState(rideId, { rejectedDriverIds });
  await persistDispatchTrackingProgress({ rideId, rejectedDriverIds: [String(driverId)] });
};

const closeRideAsUnmatched = async (rideId) => {
  const dispatchState = getDispatchState(rideId);
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, status: RIDE_STATUS.SEARCHING },
    {
      status: RIDE_STATUS.CANCELLED,
      liveStatus: RIDE_LIVE_STATUS.CANCELLED,
      biddingStatus: 'expired',
    },
    { returnDocument: 'after' },
  );

  if (!ride) {
    return;
  }

  if (ride.deliveryId) {
    await Delivery.findByIdAndUpdate(ride.deliveryId, {
      status: ride.status,
      liveStatus: ride.liveStatus,
    });
  }

  await User.findByIdAndUpdate(ride.userId, { currentRideId: null });
  await persistDispatchTrackingProgress({ rideId, reset: true }).catch(() => null);

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'No drivers accepted the ride request',
  });

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'unmatched',
  });

  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'unmatched',
    });
  }

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });
};

export const cancelRideByAdmin = async (rideId) => {
  stopDispatchFlow(rideId, { releaseLease: false });

  const ride = await Ride.findById(rideId);

  if (!ride) {
    stopDispatchFlow(rideId);
    return null;
  }

  ride.status = RIDE_STATUS.CANCELLED;
  ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
  if (ride.bookingMode === 'bidding') {
    ride.biddingStatus = 'cancelled';
  }
  await ride.save();

  if (ride.deliveryId) {
    await Delivery.findByIdAndUpdate(ride.deliveryId, {
      driverId: ride.driverId || null,
      status: ride.status,
      liveStatus: ride.liveStatus,
    });
  }

  await Promise.all([
    User.findByIdAndUpdate(ride.userId, { currentRideId: null }),
    ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }) : Promise.resolve(),
  ]);
  await persistDispatchTrackingProgress({ rideId, reset: true }).catch(() => null);

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'Ride was deleted by admin',
  });

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'deleted-by-admin',
    });
  }

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'deleted-by-admin',
  });

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });

  stopDispatchFlow(rideId);
  return ride;
};

export const cancelRideByUser = async ({ rideId, userId }) => {
  const dispatchState = getDispatchState(rideId);
  stopDispatchFlow(rideId, { releaseLease: false });
  const session = await mongoose.startSession();
  let ride = null;
  let cancellationSettlement = null;

  try {
    session.startTransaction();

    ride = await Ride.findOne({ _id: rideId, userId }).session(session);

    if (!ride) {
      await session.abortTransaction();
      stopDispatchFlow(rideId);
      return null;
    }

    if (ride.status === RIDE_STATUS.COMPLETED || ride.liveStatus === RIDE_LIVE_STATUS.COMPLETED) {
      throw new Error('Completed rides cannot be cancelled');
    }

    if (ride.status === RIDE_STATUS.CANCELLED || ride.liveStatus === RIDE_LIVE_STATUS.CANCELLED) {
      await session.commitTransaction();
      stopDispatchFlow(rideId);
      return ride;
    }

    cancellationSettlement = await settleUserCancellationFee(ride, session);

    ride.status = RIDE_STATUS.CANCELLED;
    ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
    if (ride.bookingMode === 'bidding') {
      ride.biddingStatus = 'cancelled';
    }
    await ride.save({ session });

    if (ride.deliveryId) {
      await Delivery.findByIdAndUpdate(ride.deliveryId, {
        driverId: ride.driverId || null,
        status: ride.status,
        liveStatus: ride.liveStatus,
      }, { session });
    }

    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }, { session }),
      ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }, { session }) : Promise.resolve(),
    ]);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    stopDispatchFlow(rideId);
    throw error;
  } finally {
    session.endSession();
  }
  await persistDispatchTrackingProgress({ rideId, reset: true }).catch(() => null);

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'You cancelled the ride',
  });

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'user-cancelled',
      message: 'User cancelled the ride.',
    });
  }

  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'user-cancelled',
      message: 'User cancelled the ride.',
    });
  }

  emitToRoom(getRideRoom(ride._id), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: 'User cancelled the ride',
  });

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'user-cancelled',
    message: 'User cancelled the ride.',
  });

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });

  if (cancellationSettlement?.driverWalletResult?.transaction) {
    emitToDriver(ride.driverId, 'driver:wallet:updated', {
      wallet: cancellationSettlement.driverWalletResult.wallet,
      transaction: cancellationSettlement.driverWalletResult.transaction,
      notification: {
        id: `ride-cancel-credit-${String(ride._id)}`,
        title: 'Cancellation fee received',
        body: `Rs ${Number(cancellationSettlement.feeAmount || 0).toFixed(2)} credited for rider cancellation.`,
        sentAt: new Date().toISOString(),
      },
    });
  }

  stopDispatchFlow(rideId);
  return ride;
};

export const cancelScheduledRideByDriver = async ({ rideId, driverId }) => {
  const dispatchState = getDispatchState(rideId);
  stopDispatchFlow(rideId, { releaseLease: false });
  const session = await mongoose.startSession();
  let ride = null;
  let cancellationSettlement = null;

  try {
    session.startTransaction();

    ride = await Ride.findOne({ _id: rideId, driverId }).session(session);

    if (!ride) {
      await session.abortTransaction();
      stopDispatchFlow(rideId);
      return null;
    }

    const scheduledAt = ride?.scheduledAt ? new Date(ride.scheduledAt) : null;
    const isScheduledRide = scheduledAt && Number.isFinite(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now();

    if (!isScheduledRide) {
      throw new Error('Only upcoming scheduled rides can be cancelled by the driver');
    }

    if (ride.status === RIDE_STATUS.COMPLETED || ride.liveStatus === RIDE_LIVE_STATUS.COMPLETED) {
      throw new Error('Completed rides cannot be cancelled');
    }

    if (ride.status === RIDE_STATUS.CANCELLED || ride.liveStatus === RIDE_LIVE_STATUS.CANCELLED) {
      await session.commitTransaction();
      stopDispatchFlow(rideId);
      return ride;
    }

    cancellationSettlement = await settleDriverCancellationFee(ride, session);

    ride.status = RIDE_STATUS.CANCELLED;
    ride.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
    if (ride.bookingMode === 'bidding') {
      ride.biddingStatus = 'cancelled';
    }
    await ride.save({ session });

    if (ride.deliveryId) {
      await Delivery.findByIdAndUpdate(ride.deliveryId, {
        driverId: ride.driverId || null,
        status: ride.status,
        liveStatus: ride.liveStatus,
      }, { session });
    }

    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }, { session }),
      ride.driverId ? Driver.findByIdAndUpdate(ride.driverId, { isOnRide: false }, { session }) : Promise.resolve(),
    ]);

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    stopDispatchFlow(rideId);
    throw error;
  } finally {
    session.endSession();
  }
  await persistDispatchTrackingProgress({ rideId, reset: true }).catch(() => null);

  const cancelReason = 'Your scheduled ride was cancelled by the driver.';

  emitToRoom(getUserRoom(ride.userId), 'rideCancelled', {
    rideId: String(ride._id),
    room: getRideRoom(ride._id),
    reason: cancelReason,
  });

  emitToRoom(getRideRoom(ride._id), 'rideRequestClosed', {
    rideId: String(ride._id),
    reason: 'driver-cancelled',
    message: cancelReason,
  });

  if (ride.driverId) {
    emitToRoom(getDriverRoom(ride.driverId), 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'driver-cancelled',
      message: 'Scheduled ride cancelled.',
    });
  }

  for (const notifiedDriverId of dispatchState.notifiedDriverIds) {
    emitToDriver(notifiedDriverId, 'rideRequestClosed', {
      rideId: String(ride._id),
      reason: 'driver-cancelled',
      message: cancelReason,
    });
  }

  emitToRoom(getRideRoom(ride._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(ride._id),
    status: ride.status,
    liveStatus: ride.liveStatus,
  });

  if (cancellationSettlement?.driverWalletResult?.transaction) {
    emitToDriver(ride.driverId, 'driver:wallet:updated', {
      wallet: cancellationSettlement.driverWalletResult.wallet,
      transaction: cancellationSettlement.driverWalletResult.transaction,
      notification: {
        id: `ride-cancel-debit-${String(ride._id)}`,
        title: 'Cancellation fee charged',
        body: `Rs ${Number(cancellationSettlement.feeAmount || 0).toFixed(2)} deducted for scheduled ride cancellation.`,
        sentAt: new Date().toISOString(),
      },
    });
  }

  sendPushNotificationToEntities({
    userIds: [String(ride.userId)],
    title: 'Scheduled ride cancelled',
    body: cancelReason,
    data: {
      type: 'ride_cancelled_by_driver',
      rideId: String(ride._id),
      serviceType: ride.serviceType || 'ride',
    },
  }).catch((error) => {
    console.error('Failed to send user scheduled-ride cancellation push notification', error);
  });

  stopDispatchFlow(rideId);
  return ride;
};

const scheduleNextAttempt = (rideId, nextAttemptIndex, retryDelayMs) => {
  const timer = setTimeout(() => {
    dispatchAttempt(rideId, nextAttemptIndex).catch((error) => {
      console.error('Dispatch retry failed', error);
    });
  }, retryDelayMs);

  saveDispatchState(rideId, { timer });
};

const getAttemptRadiusMeters = (baseDistanceMeters, attemptIndex) => {
  const safeBaseDistance = Math.max(1000, Number(baseDistanceMeters) || 0);
  const growthMultiplier = Math.min(1 + (Math.max(0, attemptIndex) * 0.5), 3);

  return Math.round(safeBaseDistance * growthMultiplier);
};

const dispatchAttempt = async (rideId, attemptIndex = 0) => {
  const ownsDispatch = await ensureDispatchLease(rideId);
  if (!ownsDispatch) {
    stopDispatchFlow(rideId, { releaseLease: false });
    return;
  }

  const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');

  if (!ride || ride.status !== RIDE_STATUS.SEARCHING) {
    stopDispatchFlow(rideId);
    return;
  }

  try {
    const dispatchState = hydrateDispatchStateFromRide(ride);
    const dispatchConfig = await resolveTransportDispatchConfig();
    const radius = getAttemptRadiusMeters(
      dispatchConfig.baseDistanceMeters || dispatchConfig.maxDistanceMeters,
      attemptIndex,
    );
    const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
    if (dispatchConfig.dispatchType === 'one_by_one' && attemptIndex > 0 && dispatchState.driverIds.length) {
      closeDriverRequestWindow(rideId, dispatchState.driverIds);
    }

    const { zone, drivers, searchRadiusMeters } = await matchDispatchDrivers({
      ride,
      radius,
      dispatchVehicleTypeIds,
    });
    const effectiveRadius = Number.isFinite(searchRadiusMeters) && searchRadiusMeters > 0
      ? searchRadiusMeters
      : radius;

    const rejectedDriverIds = new Set(dispatchState.rejectedDriverIds);
    const notifiedDriverIds = new Set(dispatchState.notifiedDriverIds);
    const availableDrivers = drivers.filter((driver) => {
      const driverId = String(driver._id);
      return !rejectedDriverIds.has(driverId) && !notifiedDriverIds.has(driverId);
    });
    const targetDrivers = dispatchConfig.dispatchType === 'broadcast'
      ? availableDrivers
      : availableDrivers.slice(0, 1);
    const nextNotifiedDriverIds = [
      ...dispatchState.notifiedDriverIds,
      ...targetDrivers.map((driver) => String(driver._id)),
    ];

    saveDispatchState(rideId, {
      radiusIndex: attemptIndex,
      driverIds: targetDrivers.map((driver) => String(driver._id)),
      notifiedDriverIds: nextNotifiedDriverIds,
      timer: null,
    });

    await emitRideRequestToDrivers({
      ride,
      targetDrivers,
      zone,
      effectiveRadius,
      dispatchVehicleTypeIds,
      dispatchConfig,
      attemptIndex,
    });
    await persistDispatchTrackingProgress({
      rideId,
      notifiedDriverIds: targetDrivers.map((driver) => String(driver._id)),
    }).catch(() => null);

    emitToRoom(getUserRoom(ride.userId), 'rideSearchUpdate', {
      rideId: String(ride._id),
      status: ride.status,
      radius: effectiveRadius,
      dispatchType: dispatchConfig.dispatchType,
      attempt: attemptIndex + 1,
      maxAttempts: dispatchConfig.maxAttempts,
      matchedDrivers: targetDrivers.length,
      totalNotifiedDrivers: nextNotifiedDriverIds.length,
    });

    if (attemptIndex >= dispatchConfig.maxAttempts - 1) {
      // Final attempt waits one more cycle before the ride is closed as unmatched.
      const timer = setTimeout(() => {
        closeRideAsUnmatched(rideId)
          .catch((error) => console.error('Failed to mark ride unmatched', error))
          .finally(() => stopDispatchFlow(rideId));
      }, dispatchConfig.retryDelayMs);

        saveDispatchState(rideId, {
          radiusIndex: attemptIndex,
          driverIds: targetDrivers.map((driver) => String(driver._id)),
          notifiedDriverIds: nextNotifiedDriverIds,
          timer,
        });

      return;
    }

    scheduleNextAttempt(rideId, attemptIndex + 1, dispatchConfig.retryDelayMs);
  } catch (error) {
    await closeRideAsUnmatched(rideId);
    stopDispatchFlow(rideId);
    throw error;
  }
};

export const startDispatchFlow = async (ride, { forceRestart = false } = {}) => {
  if (!ride?._id) {
    return;
  }

  if (!forceRestart && hasLocalDispatchFlow(ride._id)) {
    return;
  }

  stopDispatchFlow(ride._id, { releaseLease: false });

  const ownsDispatch = await ensureDispatchLease(ride._id);
  if (!ownsDispatch) {
    return;
  }

  const scheduledAt = ride?.scheduledAt ? new Date(ride.scheduledAt) : null;
  const delayMs = scheduledAt ? scheduledAt.getTime() - Date.now() : 0;
  const bookingMode = String(ride?.bookingMode || 'normal').trim().toLowerCase();
  const shouldDispatchImmediately = bookingMode === 'bidding';

  if (!shouldDispatchImmediately && scheduledAt && Number.isFinite(delayMs) && delayMs > 0) {
    const rideId = String(ride._id);
    const timer = setTimeout(() => {
      scheduledDispatchTimers.delete(rideId);
      dispatchAttempt(ride._id, 0).catch((error) => {
        console.error('Scheduled dispatch failed', error);
      });
    }, delayMs);

    scheduledDispatchTimers.set(rideId, timer);
    return;
  }

  try {
    await dispatchAttempt(ride._id, 0);
  } catch (error) {
    console.error('Initial dispatch attempt failed', error);
  }
};

export const restoreScheduledDispatches = async () => {
  const rides = await Ride.find({
    status: RIDE_STATUS.SEARCHING,
    liveStatus: RIDE_LIVE_STATUS.SEARCHING,
  }).select('_id scheduledAt bookingMode dispatchTracking');

  for (const ride of rides) {
    if (hasLocalDispatchFlow(ride._id)) {
      continue;
    }

    await startDispatchFlow(ride);
  }
};

export const startDispatchRecoveryLoop = () => {
  if (dispatchRecoveryTimer) {
    return;
  }

  dispatchRecoveryTimer = setInterval(() => {
    restoreScheduledDispatches().catch((error) => {
      console.error('Dispatch recovery sweep failed', error);
    });
  }, DISPATCH_RECOVERY_INTERVAL_MS);

  dispatchRecoveryTimer.unref?.();
};

export const notifyLateAvailableDriver = async (driverId) => {
  if (!driverId || activeDispatches.size === 0) {
    return;
  }

  const driverKey = String(driverId);
  const lastNotifiedAt = lateDriverNotificationTimestamps.get(driverKey) || 0;
  if (Date.now() - lastNotifiedAt < LATE_DRIVER_NOTIFICATION_COOLDOWN_MS) {
    return;
  }

  if (lateDriverNotificationInflight.has(driverKey)) {
    return lateDriverNotificationInflight.get(driverKey);
  }

  const notifyPromise = (async () => {
    lateDriverNotificationTimestamps.set(driverKey, Date.now());

    const driver = await Driver.findById(driverId)
      .select('_id isOnline isOnRide wallet location zoneId vehicleTypeId vehicleType vehicleIconType');

    if (!driver?.isOnline || driver?.isOnRide || driver?.wallet?.isBlocked || !driver?.location?.coordinates?.length) {
      return;
    }

    const dispatchConfig = await resolveTransportDispatchConfig();
    const activeRideIds = Array.from(activeDispatches.keys());

    for (const rideId of activeRideIds) {
      const ride = await Ride.findById(rideId).populate('userId', 'name phone countryCode');

      if (!ride || ride.status !== RIDE_STATUS.SEARCHING) {
        continue;
      }

      const dispatchState = getDispatchState(rideId);

      if (
        dispatchState.notifiedDriverIds.includes(driverKey) ||
        dispatchState.rejectedDriverIds.includes(driverKey)
      ) {
        continue;
      }

      const attemptIndex = Number.isInteger(dispatchState.radiusIndex) ? dispatchState.radiusIndex : 0;
      const radius = getAttemptRadiusMeters(
        dispatchConfig.baseDistanceMeters || dispatchConfig.maxDistanceMeters,
        attemptIndex,
      );
      const dispatchVehicleTypeIds = getDispatchVehicleTypeIds(ride);
      const { zone, drivers, searchRadiusMeters } = await matchDispatchDrivers({
        ride,
        radius,
        dispatchVehicleTypeIds,
      });

      const matchedDriver = drivers.find((item) => String(item._id) === driverKey);
      if (!matchedDriver) {
        continue;
      }

      const effectiveRadius = Number.isFinite(searchRadiusMeters) && searchRadiusMeters > 0
        ? searchRadiusMeters
        : radius;

      const nextNotifiedDriverIds = [...dispatchState.notifiedDriverIds, driverKey];
      const nextDriverIds = dispatchConfig.dispatchType === 'broadcast'
        ? [...new Set([...dispatchState.driverIds, driverKey])]
        : dispatchState.driverIds.length
          ? dispatchState.driverIds
          : [driverKey];

      saveDispatchState(rideId, {
        driverIds: nextDriverIds,
        notifiedDriverIds: nextNotifiedDriverIds,
      });

      await emitRideRequestToDrivers({
        ride,
        targetDrivers: [matchedDriver],
        zone,
        effectiveRadius,
        dispatchVehicleTypeIds,
        dispatchConfig,
        attemptIndex,
      });
    }
  })()
    .finally(() => {
      lateDriverNotificationInflight.delete(driverKey);
    });

  lateDriverNotificationInflight.set(driverKey, notifyPromise);
  return notifyPromise;
};

export const notifyRideAccepted = async (ride) => {
  const state = getDispatchState(ride._id);
  stopDispatchFlow(ride._id);
  await persistDispatchTrackingProgress({ rideId: ride._id, reset: true }).catch(() => null);

  // Once one driver wins the race, the rider is updated and the rest are told to stop.
  const populatedRide = await Ride.findById(ride._id).populate(
    'driverId',
    'name phone profileImage vehicleTypeId vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating',
  );

  if (!populatedRide) {
    return;
  }

  emitToRoom(getUserRoom(populatedRide.userId), 'rideAccepted', {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    type: populatedRide.serviceType || 'ride',
    serviceType: populatedRide.serviceType || 'ride',
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    otp: populatedRide.otp || '',
    vehicleIconType: populatedRide.vehicleIconType || '',
    vehicleIconUrl: populatedRide.vehicleIconUrl || '',
    driver: populatedRide.driverId,
    parcel: populatedRide.parcel || null,
  });

  emitToRoom(getUserRoom(populatedRide.userId), SOCKET_EVENTS.RIDE_STATE, {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    type: populatedRide.serviceType || 'ride',
    serviceType: populatedRide.serviceType || 'ride',
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    fare: populatedRide.fare,
    estimatedDistanceMeters: populatedRide.estimatedDistanceMeters || 0,
    estimatedDurationMinutes: populatedRide.estimatedDurationMinutes || 0,
    paymentMethod: populatedRide.paymentMethod,
    otp: populatedRide.otp || '',
    vehicleIconType: populatedRide.vehicleIconType || '',
    vehicleIconUrl: populatedRide.vehicleIconUrl || '',
    parcel: populatedRide.parcel || null,
    intercity: populatedRide.intercity || null,
    commissionAmount: populatedRide.commissionAmount,
    driverEarnings: populatedRide.driverEarnings,
    pickupLocation: populatedRide.pickupLocation,
    pickupAddress: populatedRide.pickupAddress || '',
    dropLocation: populatedRide.dropLocation,
    dropAddress: populatedRide.dropAddress || '',
    acceptedAt: populatedRide.acceptedAt,
    startedAt: populatedRide.startedAt,
    completedAt: populatedRide.completedAt,
    lastDriverLocation: populatedRide.lastDriverLocation?.coordinates?.length
      ? {
          type: populatedRide.lastDriverLocation.type,
          coordinates: populatedRide.lastDriverLocation.coordinates,
          heading: populatedRide.lastDriverLocation.heading,
          speed: populatedRide.lastDriverLocation.speed,
          updatedAt: populatedRide.lastDriverLocation.updatedAt,
        }
      : null,
    driver: populatedRide.driverId,
  });

  emitToRoom(getRideRoom(populatedRide._id), SOCKET_EVENTS.RIDE_STATUS_UPDATED, {
    rideId: String(populatedRide._id),
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    acceptedAt: populatedRide.acceptedAt,
  });

  emitToRoom(getDriverRoom(populatedRide.driverId._id), 'rideAccepted', {
    rideId: String(populatedRide._id),
    room: getRideRoom(populatedRide._id),
    status: populatedRide.status,
    liveStatus: populatedRide.liveStatus,
    acceptedAt: populatedRide.acceptedAt,
    otp: populatedRide.otp || '',
  });

  emitToRoom(getRideRoom(populatedRide._id), 'rideRequestClosed', {
    rideId: String(populatedRide._id),
        acceptedDriverId: String(populatedRide.driverId._id),
        notifiedDriverIds: state.notifiedDriverIds,
        reason: 'accepted-by-another-driver',
  });

  for (const driverId of state.notifiedDriverIds) {
    emitToDriver(driverId, 'rideRequestClosed', {
      rideId: String(populatedRide._id),
      acceptedDriverId: String(populatedRide.driverId._id),
      reason: 'accepted-by-another-driver',
    });
  }

  sendPushNotificationToEntities({
    userIds: [String(populatedRide.userId)],
    title: 'Ride accepted',
    body: populatedRide.driverId?.name
      ? `${populatedRide.driverId.name} accepted your request.`
      : 'A driver accepted your request.',
    data: {
      type: 'ride_accepted',
      rideId: String(populatedRide._id),
      serviceType: populatedRide.serviceType || 'ride',
      driverId: String(populatedRide.driverId?._id || ''),
    },
  }).catch((error) => {
    console.error('Failed to send user ride-accepted push notification', error);
  });
};

export const notifyRideBidUpdated = async ({ ride, bid }) => {
  const safeRide = ride?._id ? ride : await Ride.findById(ride?.rideId || ride);

  if (!safeRide) {
    return;
  }

  const payload = {
    rideId: String(safeRide._id),
    bookingMode: safeRide.bookingMode || 'normal',
    pricingNegotiationMode: safeRide.pricingNegotiationMode || 'none',
    biddingStatus: safeRide.biddingStatus || 'none',
    fare: Number(safeRide.fare || 0),
    baseFare: Number(safeRide.baseFare || safeRide.fare || 0),
    bidFloorFare: Number(safeRide.bidFloorFare ?? safeRide.baseFare ?? safeRide.fare ?? 0),
    userMaxBidFare: Number(safeRide.userMaxBidFare || safeRide.fare || 0),
    bidCeilingMaxFare: Number(safeRide.bidCeilingMaxFare || safeRide.userMaxBidFare || safeRide.fare || 0),
    bidStepAmount: Number(safeRide.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(safeRide.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: safeRide.nextFareIncreaseAt || null,
    bid,
  };

  emitToRoom(getUserRoom(safeRide.userId), 'rideBidUpdated', payload);
  emitToRoom(getRideRoom(safeRide._id), 'rideBidUpdated', payload);
};

export const notifyRideBiddingUpdated = async (ride) => {
  const safeRide = ride?._id ? ride : await Ride.findById(ride);

  if (!safeRide) {
    return;
  }

  const payload = {
    rideId: String(safeRide._id),
    bookingMode: safeRide.bookingMode || 'normal',
    pricingNegotiationMode: safeRide.pricingNegotiationMode || 'none',
    biddingStatus: safeRide.biddingStatus || 'none',
    fare: Number(safeRide.fare || 0),
    baseFare: Number(safeRide.baseFare || safeRide.fare || 0),
    bidFloorFare: Number(safeRide.bidFloorFare ?? safeRide.baseFare ?? safeRide.fare ?? 0),
    userMaxBidFare: Number(safeRide.userMaxBidFare || safeRide.fare || 0),
    bidCeilingMaxFare: Number(safeRide.bidCeilingMaxFare || safeRide.userMaxBidFare || safeRide.fare || 0),
    bidStepAmount: Number(safeRide.bidStepAmount || 10),
    fareIncreaseWaitMinutes: Number(safeRide.fareIncreaseWaitMinutes || 0),
    nextFareIncreaseAt: safeRide.nextFareIncreaseAt || null,
  };

  emitToRoom(getUserRoom(safeRide.userId), 'rideBiddingUpdated', payload);
  emitToRoom(getRideRoom(safeRide._id), 'rideBiddingUpdated', payload);

  const dispatchState = getDispatchState(safeRide._id);
  for (const driverId of dispatchState.notifiedDriverIds) {
    emitToDriver(driverId, 'rideBiddingUpdated', payload);
  }
};
