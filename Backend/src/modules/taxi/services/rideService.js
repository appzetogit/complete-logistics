import mongoose from 'mongoose';
import { isDataUrl } from '../../../utils/localImageStore.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getOrLoadCachedValue } from '../../../utils/cache.js';
import { distanceMeters, normalizePoint, toPoint } from '../../../utils/geo.js';
import { RIDE_LIVE_STATUS, RIDE_STATUS } from '../constants/index.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';
import { SetPrice } from '../admin/models/SetPrice.js';
import { Vehicle } from '../admin/models/Vehicle.js';
import { Driver } from '../driver/models/Driver.js';
import { WalletTransaction } from '../driver/models/WalletTransaction.js';
import { incrementDriverTodaySummaryForCompletedRide } from '../driver/services/driverTodaySummaryService.js';
import { applyDriverWalletAdjustment, ensureDriverWalletCanAcceptRide, settleCompletedRideWallet } from '../driver/services/walletService.js';
import { Delivery } from '../user/models/Delivery.js';
import { RideBid } from '../user/models/RideBid.js';
import { Ride } from '../user/models/Ride.js';
import { User } from '../user/models/User.js';
import { UserWallet } from '../user/models/UserWallet.js';
import { consumeUserSubscriptionRide, resolveApplicableUserSubscription } from '../user/services/subscriptionService.js';
import { consumeFreeRide, resolveFreeRideForNewRide } from '../user/services/freeRideService.js';
import { assertDriverNotCancelBlocked } from '../driver/services/driverCancelService.js';
import {
  forfeitGoodsAdvance,
  getRemainingFare,
  resolveGoodsAdvanceForNewRide,
  serializeGoodsAdvance,
} from '../user/services/goodsAdvanceService.js';
import { applyPromoToRideInTransaction } from './promoService.js';
import { getTipSettings } from './appSettingsService.js';
import { getBidRideSettings, getTransportRideSettings } from './transportSettingsService.js';
import {
  captureRideWalletPayment,
  holdWalletForRide,
  releaseRideWalletHold,
  releaseUncommittedHold,
  walletAmountDueForRide,
} from './rideWalletService.js';

const CANCEL_REASON_MAX = 300;

/**
 * The `cancellation` block stored on a ride. `by`: user | driver | admin | system;
 * `code`: a stable machine-readable reason; `reason`: free text (the canceller's own words, or a default).
 */
const toMoney = (value) => Math.max(0, Math.round(Number(value || 0) * 100) / 100);

/**
 * `fee` is the RIDER's cancellation fee decided for this cancel; `feeCharged` says whether it was
 * really debited (false when the wallet could not cover it). A driver's own fee goes in `driverFee`.
 */
export const buildRideCancellation = ({ by, code, reason = '', fee = 0, feeCharged, feeGoesTo = '', driverFee = 0 }) => {
  const safeFee = toMoney(fee);
  const charged = safeFee > 0 && (feeCharged === undefined ? true : Boolean(feeCharged));
  return {
    by,
    at: new Date(),
    code: String(code || '').trim(),
    reason: String(reason || '').trim().slice(0, CANCEL_REASON_MAX),
    fee: safeFee,
    feeCharged: charged,
    feeStatus: safeFee <= 0 ? 'none' : (charged ? 'charged' : 'not_charged'),
    feeGoesTo: charged ? String(feeGoesTo || '') : '',
    driverFee: toMoney(driverFee),
  };
};

export const serializeRideCancellation = (ride) => {
  const value = ride?.cancellation;
  if (!value?.by) {
    return null;
  }
  return {
    by: value.by,
    at: value.at || null,
    code: value.code || '',
    reason: value.reason || '',
    fee: Number(value.fee || 0),
    feeCharged: Boolean(value.feeCharged),
    feeStatus: value.feeStatus || 'none',
    feeGoesTo: value.feeGoesTo || '',
    driverFee: Number(value.driverFee || 0),
  };
};

const clearUserActiveRideIfPresent = async (user) => {
  if (!user?.currentRideId) {
    return;
  }

  const activeRide = await Ride.findById(user.currentRideId);

  if (!activeRide) {
    user.currentRideId = null;
    await user.save();
    return;
  }

  if ([RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED].includes(activeRide.status)) {
    user.currentRideId = null;
    await user.save();
    return;
  }

  activeRide.status = RIDE_STATUS.CANCELLED;
  activeRide.liveStatus = RIDE_LIVE_STATUS.CANCELLED;
  activeRide.cancellation = buildRideCancellation({
    by: 'system',
    code: 'replaced_by_new_booking',
    reason: 'replaced_by_new_booking',
  });
  await activeRide.save();
  await releaseRideWalletHold({ rideId: activeRide._id, reason: 'replaced by a new booking' }).catch(() => null);
  await syncDeliveryWithRide(activeRide);
  // Drivers must stop seeing the old offer. A booking nobody had accepted yet is not a
  // real rider cancel, so its paid advance is refunded; one a driver already took keeps
  // the forfeit rule.
  const { releaseReplacedRide } = await import('./dispatchService.js');
  const released = await releaseReplacedRide(activeRide).catch((error) => {
    console.error('Failed to release replaced ride', String(activeRide._id), error?.message || error);
    return { refunded: false };
  });
  if (!released.refunded) {
    await forfeitGoodsAdvance({ rideId: activeRide._id }).catch((error) => {
      console.error('Failed to forfeit goods advance', String(activeRide._id), error?.message || error);
    });
  }

  await Promise.all([
    activeRide.driverId ? Driver.findByIdAndUpdate(activeRide.driverId, { isOnRide: false }) : Promise.resolve(),
    User.findByIdAndUpdate(activeRide.userId, { currentRideId: null }),
  ]);

  user.currentRideId = null;
};

export const clearDriverActiveRideIfStale = async (driverOrId) => {
  const driver =
    typeof driverOrId === 'object' && driverOrId?._id
      ? driverOrId
      : await Driver.findById(driverOrId);

  if (!driver?.isOnRide) {
    return driver;
  }

  const activeRide = await Ride.findOne({
    driverId: driver._id,
    status: { $in: activeRideStatuses },
  }).select('_id status liveStatus');

  if (activeRide) {
    return driver;
  }

  driver.isOnRide = false;
  await driver.save();

  return driver;
};

// cash | wallet (the rider's in-app wallet, auto-debited at completion) | online (razorpay, card, upi, ...)
const normalizeRidePaymentMethod = (paymentMethod) => {
  const value = String(paymentMethod || '').trim().toLowerCase();
  if (!value || value === 'cash') return 'cash';
  if (value === 'wallet') return 'wallet';
  return 'online';
};

const normalizeServiceType = (serviceType) => {
  const normalized = String(serviceType || 'ride').trim().toLowerCase();
  return ['parcel', 'intercity'].includes(normalized) ? normalized : 'ride';
};

const ensureUserWallet = async (userId) => {
  if (!userId) {
    return;
  }

  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true },
  );
};

const getUserReferralProgramSettings = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const userReferral = setting?.referral?.user || {};

  return {
    enabled: Boolean(userReferral.enabled),
    type: String(userReferral.type || 'instant_referrer').trim().toLowerCase(),
    amount: Math.max(0, Number(userReferral.amount || 0) || 0),
    rideCount: Math.max(0, Number(userReferral.ride_count || 0) || 0),
  };
};

const getDriverReferralProgramSettings = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const driverReferral = setting?.referral?.driver || {};

  return {
    enabled: Boolean(driverReferral.enabled),
    type: String(driverReferral.type || 'instant_referrer').trim().toLowerCase(),
    amount: Math.max(0, Number(driverReferral.amount || 0) || 0),
    rideCount: Math.max(0, Number(driverReferral.ride_count || 0) || 0),
  };
};

const creditUserWalletByReference = async ({ userId, amount, title, referenceKey }) => {
  const normalizedAmount = Math.max(0, Number(amount || 0) || 0);
  const normalizedReferenceKey = String(referenceKey || '').trim();

  if (!userId || normalizedAmount <= 0 || !normalizedReferenceKey) {
    return 'skipped';
  }

  await ensureUserWallet(userId);

  const existingTransaction = await UserWallet.findOne({
    userId,
    'transactions.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .lean();

  if (existingTransaction) {
    return 'existing';
  }

  await UserWallet.updateOne(
    { userId },
    {
      $inc: { balance: normalizedAmount },
      $push: {
        transactions: {
          $each: [
            {
              kind: 'credit',
              amount: normalizedAmount,
              title: String(title || 'Referral Reward').trim(),
              referenceKey: normalizedReferenceKey,
            },
          ],
          $slice: -50,
        },
      },
    },
  );

  return 'credited';
};

const creditDriverWalletByReference = async ({ driverId, amount, title, referenceKey, metadata = {} }) => {
  const normalizedAmount = Math.max(0, Number(amount || 0) || 0);
  const normalizedReferenceKey = String(referenceKey || '').trim();

  if (!driverId || normalizedAmount <= 0 || !normalizedReferenceKey) {
    return 'skipped';
  }

  const existingTransaction = await WalletTransaction.findOne({
    driverId,
    'metadata.referenceKey': normalizedReferenceKey,
  })
    .select('_id')
    .lean();

  if (existingTransaction) {
    return 'existing';
  }

  await applyDriverWalletAdjustment({
    driverId,
    amount: normalizedAmount,
    type: 'adjustment',
    description: String(title || 'Referral Reward').trim(),
    metadata: {
      ...metadata,
      referenceKey: normalizedReferenceKey,
      source: 'driver_referral',
    },
  });

  return 'credited';
};

const processCompletedRideReferralReward = async (ride) => {
  if (!ride?.userId) {
    return;
  }

  const referredUser = await User.findById(ride.userId)
    .select('phone referredBy referredRideCompletionCount referralRewardGrantedAt')
    .lean();

  if (!referredUser?.referredBy || referredUser?.referralRewardGrantedAt) {
    return;
  }

  const settings = await getUserReferralProgramSettings();
  const isConditionalProgram =
    settings.enabled &&
    ['conditional_referrer', 'conditional_referrer_new'].includes(settings.type);

  if (!isConditionalProgram) {
    return;
  }

  const completedRideCount = await Ride.countDocuments({
    userId: ride.userId,
    status: RIDE_STATUS.COMPLETED,
    serviceType: { $in: ['ride', 'intercity'] },
  });

  const requiredRideCount = Math.max(1, settings.rideCount || 1);

  await User.updateOne(
    { _id: ride.userId },
    { $set: { referredRideCompletionCount: completedRideCount } },
  );

  if (completedRideCount < requiredRideCount || settings.amount <= 0) {
    return;
  }

  const rewardBaseKey = `user-referral:completed:${String(ride.userId)}:${requiredRideCount}`;
  const referrerResult = await creditUserWalletByReference({
    userId: referredUser.referredBy,
    amount: settings.amount,
    title: `Referral reward after ${completedRideCount} completed rides by ${referredUser.phone || 'referred user'}`,
    referenceKey: `${rewardBaseKey}:referrer`,
  });

  let newUserResult = 'skipped';
  if (settings.type === 'conditional_referrer_new') {
    newUserResult = await creditUserWalletByReference({
      userId: ride.userId,
      amount: settings.amount,
      title: `Referral completion reward after ${completedRideCount} rides`,
      referenceKey: `${rewardBaseKey}:new-user`,
    });
  }

  const rewardSatisfied =
    ['credited', 'existing'].includes(referrerResult) &&
    (settings.type !== 'conditional_referrer_new' || ['credited', 'existing'].includes(newUserResult));

  if (rewardSatisfied) {
    await User.updateOne(
      { _id: ride.userId },
      { $set: { referralRewardGrantedAt: new Date(), referredRideCompletionCount: completedRideCount } },
    );
  }
};

const processCompletedDriverReferralReward = async (ride) => {
  if (!ride?.driverId) {
    return;
  }

  const referredDriver = await Driver.findById(ride.driverId)
    .select('phone referredBy referredRideCompletionCount referralRewardGrantedAt')
    .lean();

  if (!referredDriver?.referredBy || referredDriver?.referralRewardGrantedAt) {
    return;
  }

  const settings = await getDriverReferralProgramSettings();
  const isConditionalProgram =
    settings.enabled &&
    ['conditional_referrer', 'conditional_referrer_new'].includes(settings.type);

  if (!isConditionalProgram) {
    return;
  }

  const completedRideCount = await Ride.countDocuments({
    driverId: ride.driverId,
    status: RIDE_STATUS.COMPLETED,
  });

  const requiredRideCount = Math.max(1, settings.rideCount || 1);

  await Driver.updateOne(
    { _id: ride.driverId },
    { $set: { referredRideCompletionCount: completedRideCount } },
  );

  if (completedRideCount < requiredRideCount || settings.amount <= 0) {
    return;
  }

  const rewardBaseKey = `driver-referral:completed:${String(ride.driverId)}:${requiredRideCount}`;
  const referrerResult = await creditDriverWalletByReference({
    driverId: referredDriver.referredBy,
    amount: settings.amount,
    title: `Referral reward after ${completedRideCount} completed rides by ${referredDriver.phone || 'referred driver'}`,
    referenceKey: `${rewardBaseKey}:referrer`,
    metadata: {
      referredDriverId: String(ride.driverId),
      completedRideCount,
    },
  });

  let newDriverResult = 'skipped';
  if (settings.type === 'conditional_referrer_new') {
    newDriverResult = await creditDriverWalletByReference({
      driverId: ride.driverId,
      amount: settings.amount,
      title: `Referral completion reward after ${completedRideCount} rides`,
      referenceKey: `${rewardBaseKey}:new-driver`,
      metadata: {
        referrerDriverId: String(referredDriver.referredBy),
        completedRideCount,
      },
    });
  }

  const rewardSatisfied =
    ['credited', 'existing'].includes(referrerResult) &&
    (settings.type !== 'conditional_referrer_new' || ['credited', 'existing'].includes(newDriverResult));

  if (rewardSatisfied) {
    await Driver.updateOne(
      { _id: ride.driverId },
      { $set: { referralRewardGrantedAt: new Date(), referredRideCompletionCount: completedRideCount } },
    );
  }
};

const normalizeAddress = (value = '') => String(value || '').trim();
const generateRideOtp = () => String(Math.floor(1000 + Math.random() * 9000));
const DEFAULT_BID_STEP_AMOUNT = 10;
const DEFAULT_MAX_BID_STEPS = 5;

const normalizeParcelPayload = (parcel = {}) => ({
  category: String(parcel.category || '').trim(),
  weight: String(parcel.weight || '').trim(),
  description: String(parcel.description || '').trim(),
  deliveryCategory: String(parcel.deliveryCategory || parcel.delivery_category || '').trim().toLowerCase(),
  goodsTypeFor: String(parcel.goodsTypeFor || parcel.goods_type_for || '').trim(),
  deliveryScope: String(parcel.deliveryScope || (parcel.isOutstation ? 'outstation' : 'city')).trim().toLowerCase() === 'outstation'
    ? 'outstation'
    : 'city',
  isOutstation: Boolean(parcel.isOutstation || String(parcel.deliveryScope || '').trim().toLowerCase() === 'outstation'),
  senderName: String(parcel.senderName || '').trim(),
  senderMobile: String(parcel.senderMobile || '').trim(),
  receiverName: String(parcel.receiverName || '').trim(),
  receiverMobile: String(parcel.receiverMobile || '').trim(),
});

const normalizeIntercityPayload = (intercity = {}) => ({
  bookingId: String(intercity.bookingId || '').trim(),
  fromCity: String(intercity.fromCity || '').trim(),
  toCity: String(intercity.toCity || '').trim(),
  tripType: String(intercity.tripType || '').trim(),
  travelDate: String(intercity.travelDate || intercity.date || '').trim(),
  passengers: Math.max(Number(intercity.passengers || 1), 1),
  distance: Math.max(Number(intercity.distance || 0), 0),
  vehicleName: String(intercity.vehicleName || '').trim(),
});

const normalizeScheduledAt = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const DRIVER_SCHEDULE_LOCK_WINDOW_MS = 30 * 60 * 1000;
const DRIVER_SCHEDULE_MIN_DURATION_MINUTES = 30;
const DRIVER_SCHEDULE_TURNOVER_BUFFER_MS = 15 * 60 * 1000;

const getScheduledRideTimestamp = (ride = {}) => {
  const scheduledAt = ride?.scheduledAt ? new Date(ride.scheduledAt) : null;
  const time = scheduledAt?.getTime?.() || NaN;
  return Number.isFinite(time) ? time : NaN;
};

export const isRideScheduledForFuture = (ride = {}, referenceTime = new Date()) => {
  const scheduledTime = getScheduledRideTimestamp(ride);
  return Number.isFinite(scheduledTime) && scheduledTime > new Date(referenceTime).getTime();
};

const getScheduledRideCommitmentWindow = (ride = {}) => {
  const scheduledTime = getScheduledRideTimestamp(ride);

  if (!Number.isFinite(scheduledTime)) {
    return null;
  }

  const durationMinutes = Math.max(
    DRIVER_SCHEDULE_MIN_DURATION_MINUTES,
    Number(ride?.estimatedDurationMinutes || 0),
  );

  return {
    startTime: scheduledTime - DRIVER_SCHEDULE_LOCK_WINDOW_MS,
    endTime:
      scheduledTime +
      (durationMinutes * 60 * 1000) +
      DRIVER_SCHEDULE_TURNOVER_BUFFER_MS,
  };
};

const doRideCommitmentWindowsOverlap = (firstWindow, secondWindow) => (
  Boolean(firstWindow)
  && Boolean(secondWindow)
  && firstWindow.startTime < secondWindow.endTime
  && secondWindow.startTime < firstWindow.endTime
);

export const findDriverConflictingScheduledRide = async ({
  driverId,
  ride,
  excludeRideId = null,
  session = null,
} = {}) => {
  const normalizedDriverId = String(driverId || '').trim();
  const targetWindow = getScheduledRideCommitmentWindow(ride);

  if (!normalizedDriverId || !targetWindow) {
    return null;
  }

  const query = {
    driverId: normalizedDriverId,
    scheduledAt: { $ne: null },
    status: { $in: [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
    liveStatus: { $nin: [RIDE_LIVE_STATUS.CANCELLED, RIDE_LIVE_STATUS.COMPLETED] },
  };

  if (excludeRideId) {
    query._id = { $ne: excludeRideId };
  }

  const ridesQuery = Ride.find(query)
    .select('_id scheduledAt estimatedDurationMinutes status liveStatus')
    .sort({ scheduledAt: 1 })
    .lean();

  if (session) {
    ridesQuery.session(session);
  }

  const rides = await ridesQuery;

  return rides.find((candidateRide) =>
    doRideCommitmentWindowsOverlap(
      targetWindow,
      getScheduledRideCommitmentWindow(candidateRide),
    )) || null;
};

export const getDriverIdsBlockedByUpcomingScheduledRides = async (
  driverIds = [],
  { referenceTime = new Date(), lockWindowMs = DRIVER_SCHEDULE_LOCK_WINDOW_MS, session = null } = {},
) => {
  const normalizedDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : [driverIds])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];

  if (normalizedDriverIds.length === 0) {
    return new Set();
  }

  const windowStart = new Date(referenceTime);
  const windowEnd = new Date(windowStart.getTime() + Math.max(0, Number(lockWindowMs) || 0));
  const query = {
    driverId: { $in: normalizedDriverIds },
    scheduledAt: {
      $ne: null,
      $gte: windowStart,
      $lte: windowEnd,
    },
    status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
    liveStatus: { $nin: [RIDE_LIVE_STATUS.CANCELLED, RIDE_LIVE_STATUS.COMPLETED] },
  };

  const ridesQuery = Ride.find(query).select('driverId').lean();
  if (session) {
    ridesQuery.session(session);
  }

  const rides = await ridesQuery;
  return new Set(
    rides
      .map((ride) => String(ride?.driverId || '').trim())
      .filter(Boolean),
  );
};

const normalizeVehicleTypeIds = (vehicleTypeIds = [], vehicleTypeId = null) => {
  const values = Array.isArray(vehicleTypeIds) ? vehicleTypeIds : [vehicleTypeIds];

  if (vehicleTypeId) {
    values.push(vehicleTypeId);
  }

  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
};

const normalizeVehicleKey = (value = '') => String(value || '').trim().toLowerCase();

const normalizeVehicleKeys = (vehicles = []) => {
  const keys = vehicles.flatMap((vehicle) => [
    vehicle?.name,
    vehicle?.vehicle_type,
    vehicle?.icon_types,
    String(vehicle?.name || '').replace(/\s+/g, '_'),
    String(vehicle?.icon_types || '').replace(/\s+/g, '_'),
  ]);

  return [...new Set(keys.map(normalizeVehicleKey).filter(Boolean))];
};

const normalizeBidStepAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : DEFAULT_BID_STEP_AMOUNT;
};

const clampPercentage = (value, fallback = 0) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, numericValue));
};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
};

const alignBidAmountToStep = ({ baseFare, amount, bidStepAmount, direction = 'up' }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeStep = normalizeBidStepAmount(bidStepAmount);
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  const delta = safeAmount - safeBaseFare;

  if (delta === 0) {
    return safeBaseFare;
  }

  const absoluteDelta = Math.abs(delta);
  const rawSteps = absoluteDelta / safeStep;
  const normalizedSteps = direction === 'down'
    ? Math.floor(rawSteps)
    : direction === 'nearest'
      ? Math.round(rawSteps)
      : Math.ceil(rawSteps);

  const signedDelta = Math.sign(delta) * Math.max(0, normalizedSteps) * safeStep;
  return Math.max(0, safeBaseFare + signedDelta);
};

const resolveBidRideRange = ({ baseFare, bidStepAmount, settings = {} }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeStep = normalizeBidStepAmount(bidStepAmount);
  const driverLowPercentage = clampPercentage(settings?.bidding_low_percentage, 10);
  const driverHighPercentage = clampPercentage(settings?.bidding_high_percentage, 20);
  const userLowPercentage = clampPercentage(settings?.user_bidding_low_percentage, 10);
  const userHighPercentage = clampPercentage(settings?.user_bidding_high_percentage, 20);

  const normalizedUserLowPercentage = Math.min(userLowPercentage, userHighPercentage);
  const normalizedUserHighPercentage = Math.max(userLowPercentage, userHighPercentage);
  const normalizedDriverLowPercentage = Math.min(driverLowPercentage, driverHighPercentage);
  const normalizedDriverHighPercentage = Math.max(driverLowPercentage, driverHighPercentage);

  const driverBidFloorFare = alignBidAmountToStep({
    baseFare: safeBaseFare,
    amount: safeBaseFare * (1 - (normalizedDriverLowPercentage / 100)),
    bidStepAmount: safeStep,
    direction: 'down',
  });
  const driverBidCeilingFare = alignBidAmountToStep({
    baseFare: safeBaseFare,
    amount: safeBaseFare * (1 + (normalizedDriverHighPercentage / 100)),
    bidStepAmount: safeStep,
    direction: 'up',
  });
  const userBidFloorFare = alignBidAmountToStep({
    baseFare: safeBaseFare,
    amount: safeBaseFare * (1 + (normalizedUserLowPercentage / 100)),
    bidStepAmount: safeStep,
    direction: 'up',
  });
  const userBidCeilingFare = alignBidAmountToStep({
    baseFare: safeBaseFare,
    amount: safeBaseFare * (1 + (normalizedUserHighPercentage / 100)),
    bidStepAmount: safeStep,
    direction: 'up',
  });

  return {
    safeBaseFare,
    safeStep,
    driverBidFloorFare: Math.min(driverBidFloorFare, safeBaseFare),
    driverBidCeilingFare: Math.max(driverBidCeilingFare, safeBaseFare),
    userBidFloorFare: Math.max(userBidFloorFare, safeBaseFare),
    userBidCeilingFare: Math.max(userBidCeilingFare, safeBaseFare),
  };
};

const clampBidAmountWithinRange = ({ amount, minFare, maxFare, baseFare, bidStepAmount }) => {
  const safeBaseFare = Math.max(0, Math.round(Number(baseFare || 0)));
  const safeMinFare = Math.max(0, Math.round(Number(minFare ?? safeBaseFare)));
  const safeMaxFare = Math.max(safeMinFare, Math.round(Number(maxFare ?? safeMinFare)));
  const safeRequestedFare = Number.isFinite(Number(amount))
    ? Math.round(Number(amount))
    : safeMinFare;
  const clampedFare = Math.min(safeMaxFare, Math.max(safeMinFare, safeRequestedFare));

  return alignBidAmountToStep({
    baseFare: safeBaseFare,
    amount: clampedFare,
    bidStepAmount,
    direction: 'nearest',
  });
};

const normalizeRideBidAmount = ({ ride, bidFare }) => {
  const safeBidFare = Math.round(Number(bidFare || 0));
  const baseFare = Math.max(0, Math.round(Number(ride?.baseFare || ride?.fare || 0)));
  const bidStepAmount = normalizeBidStepAmount(ride?.bidStepAmount);
  const bidFloorFare = Math.max(0, Math.round(Number(ride?.bidFloorFare ?? baseFare)));
  const userMaxBidFare = Math.max(bidFloorFare, Math.round(Number(ride?.userMaxBidFare || baseFare)));

  if (!Number.isFinite(safeBidFare) || safeBidFare < bidFloorFare) {
    throw new ApiError(400, 'Bid fare is below the minimum allowed floor');
  }

  if (safeBidFare > userMaxBidFare) {
    throw new ApiError(400, 'Bid fare exceeds rider ceiling');
  }

  const delta = safeBidFare - baseFare;
  if (Math.abs(delta) % bidStepAmount !== 0) {
    throw new ApiError(400, `Bid fare must increase in Rs ${bidStepAmount} steps`);
  }

  return {
    bidFare: safeBidFare,
    incrementAmount: delta,
  };
};

const serializeRideBid = (bid) => ({
  id: String(bid._id),
  rideId: String(bid.rideId?._id || bid.rideId),
  driverId: String(bid.driverId?._id || bid.driverId),
  bidFare: Number(bid.bidFare || 0),
  incrementAmount: Number(bid.incrementAmount || 0),
  status: String(bid.status || 'pending'),
  createdAt: bid.createdAt || null,
  updatedAt: bid.updatedAt || null,
  driver: bid.driverId && typeof bid.driverId === 'object'
    ? {
        id: String(bid.driverId._id),
        name: bid.driverId.name || '',
        phone: bid.driverId.phone || '',
        profileImage: bid.driverId.profileImage || '',
        vehicleType: bid.driverId.vehicleType || '',
        vehicleNumber: bid.driverId.vehicleNumber || '',
        vehicleColor: bid.driverId.vehicleColor || '',
        vehicleMake: bid.driverId.vehicleMake || '',
        vehicleModel: bid.driverId.vehicleModel || '',
        rating: bid.driverId.rating || '',
      }
    : null,
});

export const normalizeAllowedRidePaymentMethods = (paymentTypes = []) => {
  const rawItems = Array.isArray(paymentTypes)
    ? paymentTypes
    : typeof paymentTypes === 'string'
      ? paymentTypes.split(',')
      : [];

  const normalized = rawItems
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (['cash', 'online', 'wallet'].includes(item) ? item : null))
    .filter(Boolean);

  const unique = [...new Set(normalized)];
  return unique.length ? unique : ['cash', 'online'];
};

const SET_PRICE_CACHE_TTL_MS = 30_000;

export const resolveSetPriceForRide = async ({ zoneId = null, serviceLocationId = null, transportType = 'taxi', vehicleTypeId = null }) => {
  if (!vehicleTypeId) {
    return null;
  }

  const normalizedTransportType = String(transportType || 'taxi').trim().toLowerCase() || 'taxi';
  const filters = [
    ...(zoneId
      ? [
          {
            vehicle_type: vehicleTypeId,
            active: 1,
            status: 'active',
            zone_id: zoneId,
            transport_type: normalizedTransportType,
          },
          {
            vehicle_type: vehicleTypeId,
            active: 1,
            status: 'active',
            zone_id: zoneId,
            transport_type: 'both',
          },
        ]
      : []),
    ...(serviceLocationId
      ? [
          {
            vehicle_type: vehicleTypeId,
            active: 1,
            status: 'active',
            service_location_id: serviceLocationId,
            transport_type: normalizedTransportType,
          },
          {
            vehicle_type: vehicleTypeId,
            active: 1,
            status: 'active',
            service_location_id: serviceLocationId,
            transport_type: 'both',
          },
        ]
      : []),
    {
      vehicle_type: vehicleTypeId,
      active: 1,
      status: 'active',
      transport_type: normalizedTransportType,
    },
    {
      vehicle_type: vehicleTypeId,
      active: 1,
      status: 'active',
      transport_type: 'both',
    },
  ];

  const cacheKey = [
    'cache:set_price',
    String(zoneId || 'none'),
    String(serviceLocationId || 'none'),
    normalizedTransportType,
    String(vehicleTypeId),
  ].join(':');

  return getOrLoadCachedValue(
    cacheKey,
    {
      ttlMs: SET_PRICE_CACHE_TTL_MS,
      load: async () => {
        for (const filter of filters) {
          const match = await SetPrice.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean();
          if (match) {
            return match;
          }
        }

        return null;
      },
    },
  );
};

export const getAllowedRidePaymentMethodsForPricing = async ({ zoneId = null, serviceLocationId = null, transportType = 'taxi', vehicleTypeId = null }) => {
  const pricingRule = await resolveSetPriceForRide({ zoneId, serviceLocationId, transportType, vehicleTypeId });

  return {
    pricingRule,
    allowedPaymentMethods: normalizeAllowedRidePaymentMethods(pricingRule?.payment_type),
  };
};

const normalizeRideTransportType = (value = 'taxi') => {
  const normalized = String(value || 'taxi').trim().toLowerCase() || 'taxi';

  if (normalized === 'both' || normalized === 'all') {
    return 'taxi';
  }

  return normalized;
};

const buildDriverVehicleAcceptFilter = async (ride) => {
  const vehicleTypeIds = normalizeVehicleTypeIds(ride.dispatchVehicleTypeIds || [], ride.vehicleTypeId);

  if (vehicleTypeIds.length === 0) {
    const fallbackKeys = [
      ride?.vehicleIconType,
      ride?.vehicleType,
      String(ride?.vehicleIconType || '').replace(/\s+/g, '_'),
      String(ride?.vehicleType || '').replace(/\s+/g, '_'),
    ]
      .map(normalizeVehicleKey)
      .filter(Boolean);
    const clauses = [
      ...([...(new Set(fallbackKeys))].length
        ? [
            { vehicleType: { $in: [...(new Set(fallbackKeys))] } },
            { vehicleIconType: { $in: [...(new Set(fallbackKeys))] } },
          ]
        : []),
    ];

    return clauses.length > 1 ? { $or: clauses } : clauses[0] || {};
  }

  return { vehicleTypeId: { $in: vehicleTypeIds } };
};

const syncDeliveryWithRide = async (ride) => {
  if (!ride || (ride.serviceType || 'ride') !== 'parcel') {
    return null;
  }

  const payload = {
    rideId: ride._id,
    userId: ride.userId,
    driverId: ride.driverId || null,
    vehicleTypeId: ride.vehicleTypeId || null,
    vehicleIconType: ride.vehicleIconType || '',
    vehicleIconUrl: ride.vehicleIconUrl || '',
    status: ride.status,
    liveStatus: ride.liveStatus,
    pickupLocation: ride.pickupLocation,
    pickupAddress: normalizeAddress(ride.pickupAddress),
    dropLocation: ride.dropLocation,
    dropAddress: normalizeAddress(ride.dropAddress),
    fare: ride.fare,
    paymentMethod: ride.paymentMethod,
    parcel: normalizeParcelPayload(ride.parcel),
    acceptedAt: ride.acceptedAt || null,
    startedAt: ride.startedAt || null,
    completedAt: ride.completedAt || null,
  };

  if (ride.deliveryId) {
    return Delivery.findByIdAndUpdate(ride.deliveryId, payload, { returnDocument: 'after' });
  }

  const delivery = await Delivery.create(payload);
  ride.deliveryId = delivery._id;
  await ride.save();
  return delivery;
};

export const createRideRecord = async ({
  userId,
  pickupCoords,
  dropCoords,
  pickupAddress,
  dropAddress,
  fare,
  estimatedDistanceMeters,
  estimatedDurationMinutes,
  vehicleTypeId,
  vehicleTypeIds,
  vehicleIconType,
  vehicleIconUrl,
  paymentMethod,
  serviceType,
  tripMode,
  parcel,
  intercity,
  promo_code,
  zone_id,
  service_location_id,
  transport_type,
  scheduledAt,
  bookingMode,
  userMaxBidFare,
  bidStepAmount,
  advancePercent,
  setPriceRule = null,
}) => {
  // Goods are priced only from a delivery Set Price, which only POST /deliveries resolves and passes in here.
  // A parcel booked any other way (POST /rides, the requestRide socket event) would carry the app's own fare.
  if (normalizeServiceType(serviceType) === 'parcel' && !setPriceRule) {
    throw new ApiError(400, 'Goods bookings must be made through POST /deliveries', { code: 'USE_DELIVERIES_ENDPOINT' });
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await clearUserActiveRideIfPresent(user);

  const safeFare = Number(fare);
  const safeEstimatedDistanceMeters = Math.max(0, Number(estimatedDistanceMeters || 0));
  const safeEstimatedDurationMinutes = Math.max(0, Number(estimatedDurationMinutes || 0));

  if (!Number.isFinite(safeFare) || safeFare < 0) {
    throw new ApiError(400, 'fare must be a positive number or zero');
  }

  const dispatchVehicleTypeIds = normalizeVehicleTypeIds(vehicleTypeIds, vehicleTypeId);

  if (dispatchVehicleTypeIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ApiError(400, 'vehicleTypeId is invalid');
  }

  const primaryVehicleTypeId = dispatchVehicleTypeIds[0] || null;
  const primaryVehicle = primaryVehicleTypeId
    ? await Vehicle.findById(primaryVehicleTypeId).select('icon map_icon image dispatch_type admin_commission_type_from_driver admin_commission_from_driver admin_commission_type_for_owner admin_commission_for_owner').lean()
    : null;
  // Take the first value that is a reference rather than the image itself. A
  // data: URL here lands in this ride and in the delivery synced from it, so a
  // single 3 MB vehicle icon would be re-stored on every booking.
  const asImageReference = (value) => {
    const text = String(value || '').trim();
    return isDataUrl(text) ? '' : text;
  };
  const resolvedVehicleIconUrl =
    asImageReference(vehicleIconUrl) ||
    asImageReference(primaryVehicle?.image) ||
    asImageReference(primaryVehicle?.map_icon) ||
    asImageReference(primaryVehicle?.icon);
  const normalizedTransportType = normalizeRideTransportType(transport_type);
  const resolvedZoneId =
    zone_id && mongoose.Types.ObjectId.isValid(zone_id)
      ? new mongoose.Types.ObjectId(zone_id)
      : null;
  const resolvedServiceLocationId =
    service_location_id && mongoose.Types.ObjectId.isValid(service_location_id)
      ? new mongoose.Types.ObjectId(service_location_id)
      : null;
  // A goods booking passes the delivery Set Price that priced it, so commission and payment methods come from
  // the same rule as the fare (never a 'both' row or the vehicle type).
  const { pricingRule, allowedPaymentMethods } = setPriceRule
    ? { pricingRule: setPriceRule, allowedPaymentMethods: normalizeAllowedRidePaymentMethods(setPriceRule.payment_type) }
    : await getAllowedRidePaymentMethodsForPricing({
      zoneId: resolvedZoneId,
      serviceLocationId: resolvedServiceLocationId,
      transportType: normalizedTransportType,
      vehicleTypeId: primaryVehicleTypeId,
    });
  const normalizedPaymentMethod = normalizeRidePaymentMethod(paymentMethod);
  const resolvedRequestedPaymentMethod = allowedPaymentMethods.includes(normalizedPaymentMethod)
    ? normalizedPaymentMethod
    : (allowedPaymentMethods[0] || 'cash');
  const supportsBidding = ['bidding', 'both'].includes(String(primaryVehicle?.dispatch_type || '').trim().toLowerCase());
  const requestedBookingMode = String(bookingMode || '').trim().toLowerCase();
  const normalizedServiceType = normalizeServiceType(serviceType);
  const bidRideSettings = await getBidRideSettings();
  const fareIncreaseWaitMinutes = toPositiveNumber(
    bidRideSettings.user_fare_increase_wait_minutes,
    2,
  );
  const isOutstationBiddingFlow = normalizedServiceType === 'intercity';
  const pricingNegotiationMode =
    supportsBidding && requestedBookingMode === 'bidding'
      ? isOutstationBiddingFlow
        ? 'driver_bid'
        : 'user_increment_only'
      : 'none';
  const effectiveBookingMode = pricingNegotiationMode === 'driver_bid' ? 'bidding' : 'normal';
  const configuredBidStepAmount = pricingNegotiationMode !== 'none'
    ? normalizeBidStepAmount(
        isOutstationBiddingFlow
          ? bidRideSettings.bidding_amount_increase_or_decrease
          : bidRideSettings.user_bidding_amount_increase_or_decrease,
      )
    : normalizeBidStepAmount(bidStepAmount);
  const effectiveBidStepAmount = configuredBidStepAmount || normalizeBidStepAmount(bidStepAmount);
  const bidRideRange = resolveBidRideRange({
    baseFare: safeFare,
    bidStepAmount: effectiveBidStepAmount,
    settings: bidRideSettings,
  });
  const effectiveUserMaxBidFare = pricingNegotiationMode === 'driver_bid'
    ? clampBidAmountWithinRange({
        amount: userMaxBidFare,
        minFare: bidRideRange.userBidFloorFare,
        maxFare: Math.min(bidRideRange.userBidCeilingFare, bidRideRange.driverBidCeilingFare),
        baseFare: safeFare,
        bidStepAmount: effectiveBidStepAmount,
      })
    : pricingNegotiationMode === 'user_increment_only'
      ? clampBidAmountWithinRange({
          amount: safeFare,
          minFare: bidRideRange.userBidFloorFare,
          maxFare: bidRideRange.userBidCeilingFare,
          baseFare: safeFare,
          bidStepAmount: effectiveBidStepAmount,
        })
      : safeFare;
  const effectiveBidFloorFare = pricingNegotiationMode === 'driver_bid'
    ? bidRideRange.driverBidFloorFare
    : pricingNegotiationMode === 'user_increment_only'
      ? bidRideRange.userBidFloorFare
      : safeFare;
  const effectiveBidCeilingMaxFare = pricingNegotiationMode === 'driver_bid'
    ? Math.min(bidRideRange.userBidCeilingFare, bidRideRange.driverBidCeilingFare)
    : pricingNegotiationMode === 'user_increment_only'
      ? bidRideRange.userBidCeilingFare
      : safeFare;
  const effectiveStartingFare = pricingNegotiationMode === 'user_increment_only'
    ? effectiveUserMaxBidFare
    : safeFare;
  const nextFareIncreaseAt = pricingNegotiationMode === 'user_increment_only'
    ? new Date(Date.now() + fareIncreaseWaitMinutes * 60 * 1000)
    : null;
  // Goods commission comes only from the delivery Set Price (pricingRule); the vehicle type's own commission
  // fields are no longer used.
  const parcelCommissionFallback = null;
  const pricingSnapshot = {
    setPriceId: pricingRule?._id || null,
    admin_commission_type_from_driver: Number(pricingRule?.admin_commission_type_from_driver ?? parcelCommissionFallback?.admin_commission_type_from_driver ?? 1),
    admin_commission_from_driver: Number(pricingRule?.admin_commission_from_driver ?? parcelCommissionFallback?.admin_commission_from_driver ?? 0),
    admin_commission_type_for_owner: Number(pricingRule?.admin_commission_type_for_owner ?? parcelCommissionFallback?.admin_commission_type_for_owner ?? 1),
    admin_commission_for_owner: Number(pricingRule?.admin_commission_for_owner ?? parcelCommissionFallback?.admin_commission_for_owner ?? 0),
    waiting_charge: Number(pricingRule?.waiting_charge ?? 0),
    free_waiting_before: Number(pricingRule?.free_waiting_before ?? 0),
    free_waiting_after: Number(pricingRule?.free_waiting_after ?? 0),
    allowed_payment_methods: allowedPaymentMethods,
    resolvedAt: pricingRule ? new Date() : null,
  };

  const promoCode = typeof promo_code === 'string' ? promo_code.trim() : '';
  const normalizedScheduledAt = normalizeScheduledAt(scheduledAt);
  // Free rides take priority over subscriptions. Negotiated (bidding) rides are
  // never free: their fare can rise after booking, past what was covered.
  const freeRide = pricingNegotiationMode === 'none'
    ? await resolveFreeRideForNewRide({ user, fare: safeFare })
    : { covered: false };
  const applicableSubscription = !freeRide.covered && pricingNegotiationMode === 'none' && primaryVehicleTypeId
    ? await resolveApplicableUserSubscription({
        userId,
        vehicleTypeId: primaryVehicleTypeId,
      })
    : null;
  const isSubscriptionCovered = Boolean(applicableSubscription?._id);
  const subscriptionBenefitType = String(applicableSubscription?.benefit_type || '').trim().toLowerCase() === 'unlimited'
    ? 'unlimited'
    : 'limited';
  const subscriptionRideLimit = Math.max(0, Number(applicableSubscription?.ride_limit || 0));
  const subscriptionRidesUsed = Math.max(0, Number(applicableSubscription?.rides_used || 0));
  const subscriptionRidesRemaining = subscriptionBenefitType === 'unlimited'
    ? null
    : Math.max(0, subscriptionRideLimit - subscriptionRidesUsed);
  const effectiveDriverPaymentCollection = freeRide.covered
    ? {
        provider: 'free_ride',
        providerId: '',
        providerOrderId: '',
        providerPaymentId: '',
        providerMode: 'free_ride',
        source: 'free_ride',
        status: 'paid',
        amount: safeFare,
        currency: 'INR',
        linkUrl: '',
        paidAt: new Date(),
        updatedAt: new Date(),
      }
    : isSubscriptionCovered
    ? {
        provider: 'subscription',
        providerId: String(applicableSubscription._id),
        providerOrderId: '',
        providerPaymentId: '',
        providerMode: 'subscription_wallet',
        source: 'user_subscription',
        status: 'paid',
        amount: safeFare,
        currency: 'INR',
        linkUrl: '',
        paidAt: new Date(),
        updatedAt: new Date(),
      }
    : undefined;
  const effectivePaymentMethod = (freeRide.covered || isSubscriptionCovered) ? 'online' : resolvedRequestedPaymentMethod;
  // Goods need an advance paid online before dispatch (not when the rider
  // pays nothing anyway). Stays `pending` until the advance endpoints confirm it.
  const effectiveGoodsAdvance = await resolveGoodsAdvanceForNewRide({
    serviceType: normalizedServiceType,
    fare: effectiveStartingFare,
    waived: freeRide.covered || isSubscriptionCovered,
    requestedPercent: advancePercent,
  });
  const effectiveFreeRide = freeRide.covered
    ? {
        covered: true,
        fareCovered: freeRide.fareCovered,
        freeRidesUsedBefore: freeRide.freeRidesUsedBefore,
      }
    : undefined;
  const effectiveSubscriptionUsage = isSubscriptionCovered
    ? {
        covered: true,
        subscriptionId: applicableSubscription._id,
        planId: applicableSubscription.planId || null,
        planName: applicableSubscription.name || '',
        vehicleTypeId: applicableSubscription.vehicle_type_id || primaryVehicleTypeId,
        benefitType: subscriptionBenefitType,
        fareCovered: safeFare,
        ridesUsedBefore: subscriptionRidesUsed,
        ridesRemainingBefore: subscriptionRidesRemaining,
      }
    : undefined;

  if (scheduledAt && !normalizedScheduledAt) {
    throw new ApiError(400, 'scheduledAt is invalid');
  }

  if (freeRide.covered && promoCode) {
    throw new ApiError(400, 'Promo codes cannot be combined with free rides');
  }

  if (isSubscriptionCovered && promoCode) {
    throw new ApiError(400, 'Promo codes cannot be combined with subscription rides');
  }

  // Wallet: reserve the amount due now (fare less a goods advance paid online), so it is there at completion.
  const rideObjectId = new mongoose.Types.ObjectId();
  const walletHold = effectivePaymentMethod === 'wallet'
    ? await holdWalletForRide({
      userId,
      rideId: rideObjectId,
      amount: walletAmountDueForRide(
        { fare: effectiveStartingFare, goodsAdvance: effectiveGoodsAdvance },
        { includePendingAdvance: true },
      ),
    })
    : null;
  const requestedPaymentMethod = paymentMethod ? normalizedPaymentMethod : null;

  const createRideDocuments = async () => {
  if (!promoCode) {
    const ride = await Ride.create({
      _id: rideObjectId,
      walletHold: walletHold || undefined,
      userId,
      vehicleTypeId: primaryVehicleTypeId,
      dispatchVehicleTypeIds,
      vehicleIconType: vehicleIconType || '',
      vehicleIconUrl: resolvedVehicleIconUrl,
      serviceType: normalizedServiceType,
      tripMode: String(tripMode || '').toLowerCase() === 'round_trip' ? 'round_trip' : 'one_way',
      pickupLocation: toPoint(pickupCoords, 'pickup'),
      pickupAddress: normalizeAddress(pickupAddress),
      dropLocation: toPoint(dropCoords, 'drop'),
      dropAddress: normalizeAddress(dropAddress),
      fare: effectiveStartingFare,
      baseFare: safeFare,
      bookingMode: effectiveBookingMode,
      pricingNegotiationMode,
      biddingStatus: pricingNegotiationMode === 'driver_bid' ? 'open' : 'none',
      bidStepAmount: effectiveBidStepAmount,
      bidFloorFare: effectiveBidFloorFare,
      userMaxBidFare: effectiveUserMaxBidFare,
      bidCeilingMaxFare: effectiveBidCeilingMaxFare,
      fareIncreaseWaitMinutes: pricingNegotiationMode === 'user_increment_only' ? fareIncreaseWaitMinutes : 0,
      nextFareIncreaseAt,
      estimatedDistanceMeters: safeEstimatedDistanceMeters,
      estimatedDurationMinutes: safeEstimatedDurationMinutes,
      paymentMethod: effectivePaymentMethod,
      driverPaymentCollection: effectiveDriverPaymentCollection,
      goodsAdvance: effectiveGoodsAdvance,
      freeRide: effectiveFreeRide,
      subscriptionUsage: effectiveSubscriptionUsage,
      otp: generateRideOtp(),
      service_location_id: resolvedServiceLocationId,
      transport_type: normalizedTransportType,
      pricingSnapshot,
      parcel: normalizeParcelPayload(parcel),
      intercity: normalizeIntercityPayload(intercity),
      scheduledAt: normalizedScheduledAt,
      status: RIDE_STATUS.SEARCHING,
      liveStatus: RIDE_LIVE_STATUS.SEARCHING,
    });

    user.currentRideId = ride._id;
    await user.save();
    await syncDeliveryWithRide(ride);

    return ride;
  }

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const ride = await Ride.create(
        [
          {
            _id: rideObjectId,
            walletHold: walletHold || undefined,
            userId,
            vehicleTypeId: primaryVehicleTypeId,
            dispatchVehicleTypeIds,
            vehicleIconType: vehicleIconType || '',
            vehicleIconUrl: resolvedVehicleIconUrl,
            serviceType: normalizedServiceType,
            pickupLocation: toPoint(pickupCoords, 'pickup'),
            pickupAddress: normalizeAddress(pickupAddress),
            dropLocation: toPoint(dropCoords, 'drop'),
            dropAddress: normalizeAddress(dropAddress),
            fare: effectiveStartingFare,
            baseFare: safeFare,
            bookingMode: effectiveBookingMode,
            pricingNegotiationMode,
            biddingStatus: pricingNegotiationMode === 'driver_bid' ? 'open' : 'none',
            bidStepAmount: effectiveBidStepAmount,
            bidFloorFare: effectiveBidFloorFare,
            userMaxBidFare: effectiveUserMaxBidFare,
            bidCeilingMaxFare: effectiveBidCeilingMaxFare,
            fareIncreaseWaitMinutes: pricingNegotiationMode === 'user_increment_only' ? fareIncreaseWaitMinutes : 0,
            nextFareIncreaseAt,
            estimatedDistanceMeters: safeEstimatedDistanceMeters,
            estimatedDurationMinutes: safeEstimatedDurationMinutes,
            paymentMethod: effectivePaymentMethod,
            driverPaymentCollection: effectiveDriverPaymentCollection,
            goodsAdvance: effectiveGoodsAdvance,
            freeRide: effectiveFreeRide,
            subscriptionUsage: effectiveSubscriptionUsage,
            otp: generateRideOtp(),
            service_location_id: resolvedServiceLocationId,
            transport_type: normalizedTransportType,
            pricingSnapshot,
            parcel: normalizeParcelPayload(parcel),
            intercity: normalizeIntercityPayload(intercity),
            scheduledAt: normalizedScheduledAt,
            status: RIDE_STATUS.SEARCHING,
            liveStatus: RIDE_LIVE_STATUS.SEARCHING,
          },
        ],
        { session },
      );

      const rideDoc = ride[0];

      user.currentRideId = rideDoc._id;
      await user.save({ session });

      await applyPromoToRideInTransaction({
        session,
        ride: rideDoc,
        userId,
        code: promoCode,
        fare: safeFare,
        service_location_id,
        transport_type: transport_type || 'taxi',
      });

      await session.commitTransaction();
      await syncDeliveryWithRide(rideDoc);
      return rideDoc;
    } catch (error) {
      lastError = error;
      await session.abortTransaction();

      const isTransient =
        typeof error?.hasErrorLabel === 'function' &&
        (error.hasErrorLabel('TransientTransactionError') || error.hasErrorLabel('UnknownTransactionCommitResult'));

      if (!isTransient || attempt === 2) {
        throw error;
      }
    } finally {
      session.endSession();
    }
  }

  throw lastError || new ApiError(500, 'Failed to create ride with promo');
  };

  let createdRide;
  try {
    createdRide = await createRideDocuments();
  } catch (error) {
    if (walletHold) {
      // If the ride document was saved after all, release through its claim (so a later cancel cannot release it
      // again); otherwise give the bare hold back.
      const saved = await Ride.exists({ _id: rideObjectId }).catch(() => null);
      if (saved) {
        await releaseRideWalletHold({ rideId: rideObjectId, reason: 'booking failed' }).catch(() => null);
      } else {
        await releaseUncommittedHold({ userId, rideId: rideObjectId, amount: walletHold.amount }).catch(() => null);
      }
    }
    throw error;
  }
  // Wallet (or any method) asked for but not allowed here: the app tells the rider which method was used instead.
  if (requestedPaymentMethod && createdRide.paymentMethod !== requestedPaymentMethod
    && !(createdRide.freeRide?.covered || createdRide.subscriptionUsage?.covered)) {
    createdRide.$locals.paymentMethodChanged = true;
    createdRide.$locals.requestedPaymentMethod = requestedPaymentMethod;
  }
  return createdRide;
};

export const getRideDetails = async (rideId, { includeDriverFeedback = false } = {}) => {
  const ride = await Ride.findById(rideId)
    .select(includeDriverFeedback ? '+driverFeedback' : '')
    .populate('deliveryId')
    .populate('userId', 'name phone rating ratingCount')
    .populate('driverId', 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating');

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  return ride;
};

export const getRideRoom = (rideId) => `ride_${rideId}`;

const activeRideStatuses = [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING];

const populateRideRealtime = async (rideId) =>
  Ride.findById(rideId)
    .select('+driverFeedback')
    .populate('deliveryId')
    .populate('userId', 'name phone rating ratingCount')
    .populate('driverId', 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating')
    .maxTimeMS(8000);

/// Combines the Delivery mirror with the ride's own parcel record, letting the
/// ride win field by field. Returns null when neither side has anything, so
/// passenger rides still serialize `parcel: null`.
const mergeParcelRecords = (mirror, authoritative) => {
  const toPlain = (value) => {
    if (!value) return null;
    return typeof value.toObject === 'function' ? value.toObject() : value;
  };

  const base = toPlain(mirror);
  const primary = toPlain(authoritative);

  if (!base && !primary) return null;
  if (!base) return primary;
  if (!primary) return base;

  const merged = { ...base };

  for (const [key, value] of Object.entries(primary)) {
    const isEmpty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (!isEmpty) {
      merged[key] = value;
    }
  }

  return merged;
};

// The accept selfie is for admin review only. It is dropped by default
// (audience 'user', which is also what shared ride-room broadcasts use, since
// the rider is in that room). Only the driver's own responses opt in.
// The driver's pickup/drop face selfies are for admin review, like the accept selfie.
export const withoutParcelSelfies = (parcel) => {
  if (!parcel) return parcel;
  const { pickupSelfie, dropSelfie, ...rest } = typeof parcel.toObject === 'function' ? parcel.toObject() : parcel;
  return rest;
};

export const RIDE_AUDIENCE = Object.freeze({ USER: 'user', DRIVER: 'driver', ADMIN: 'admin' });

export const audienceForRole = (role) => (role === 'driver' ? RIDE_AUDIENCE.DRIVER : RIDE_AUDIENCE.USER);

/**
 * A raw ride document cut down for one participant: the rider never gets the driver's earnings, the platform
 * commission or the accept selfie; the driver never gets the start-trip OTP. Neither sees the OTP attempt counter.
 */
export const rawRideForAudience = (ride, audience) => {
  const plain = audience === RIDE_AUDIENCE.USER
    ? withoutAcceptSelfie(ride)
    : (typeof ride?.toObject === 'function' ? ride.toObject() : { ...(ride || {}) });
  delete plain.otpCheck;
  if (audience === RIDE_AUDIENCE.USER) {
    delete plain.commissionAmount;
    delete plain.driverEarnings;
    delete plain.walletSettledAt;
    if (plain.pricingSnapshot) {
      const { waiting_charge, free_waiting_before, free_waiting_after } = plain.pricingSnapshot;
      plain.pricingSnapshot = { waiting_charge, free_waiting_before, free_waiting_after };
    }
  } else if (audience === RIDE_AUDIENCE.DRIVER) {
    delete plain.otp;
  }
  return plain;
};

// For callers that return a raw ride document instead of the serializer.
export const withoutAcceptSelfie = (ride) => {
  const plain = typeof ride?.toObject === 'function' ? ride.toObject() : { ...(ride || {}) };
  delete plain.acceptSelfie;
  if (plain.parcel) {
    plain.parcel = withoutParcelSelfies(plain.parcel);
  }
  return plain;
};

const PAID_COLLECTION_STATUSES = new Set(['paid', 'captured', 'success', 'completed']);

/**
 * How the ride is paid, for both apps: isPaid, what the driver must still collect, and the wallet details.
 *   cash: the driver collects the fare (less a paid goods advance)
 *   wallet: nothing to collect, unless the wallet fell short at completion (walletShortfall)
 *   online: nothing to collect
 */
export const serializeRidePaymentState = (ride) => {
  const method = ride?.paymentMethod || 'cash';
  const collectionPaid = Boolean(ride?.driverPaymentCollection?.paidAt)
    || PAID_COLLECTION_STATUSES.has(String(ride?.driverPaymentCollection?.status || '').toLowerCase());
  const shortfall = Number(ride?.walletShortfall || 0);
  const remaining = getRemainingFare(ride);
  return {
    isPaid: collectionPaid || (method === 'wallet' && Boolean(ride?.walletPayment?.at) && shortfall <= 0),
    // What the DRIVER collects in hand: only on cash rides. A wallet shortfall is paid by the rider in the app
    // (the driver was already credited at completion).
    amountToCollect: collectionPaid || method !== 'cash' ? 0 : remaining,
    riderPaysInApp: method === 'wallet' && !collectionPaid ? shortfall : 0,
    walletHold: ride?.walletHold?.status
      ? { amount: Number(ride.walletHold.amount || 0), status: ride.walletHold.status }
      : null,
    walletPayment: ride?.walletPayment?.at
      ? { amount: Number(ride.walletPayment.amount || 0), at: ride.walletPayment.at }
      : null,
    walletShortfall: shortfall,
  };
};

export const serializeRideRealtime = (ride, { audience = RIDE_AUDIENCE.USER } = {}) => ({
  rideId: String(ride._id),
  room: getRideRoom(ride._id),
  deliveryId: ride.deliveryId?._id ? String(ride.deliveryId._id) : ride.deliveryId ? String(ride.deliveryId) : null,
  type: ride.serviceType || 'ride',
  serviceType: ride.serviceType || 'ride',
  tripMode: ride.tripMode || 'one_way',
  status: ride.status,
  liveStatus: ride.liveStatus,
  fare: ride.fare,
  baseFare: Number(ride.baseFare || ride.fare || 0),
  bookingMode: ride.bookingMode || 'normal',
  pricingNegotiationMode: ride.pricingNegotiationMode || 'none',
  biddingStatus: ride.biddingStatus || 'none',
  bidStepAmount: Number(ride.bidStepAmount || DEFAULT_BID_STEP_AMOUNT),
  bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
  userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
  bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
  fareIncreaseWaitMinutes: Number(ride.fareIncreaseWaitMinutes || 0),
  nextFareIncreaseAt: ride.nextFareIncreaseAt || null,
  acceptedBidId: ride.acceptedBidId ? String(ride.acceptedBidId) : null,
  estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
  estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
  paymentMethod: ride.paymentMethod,
  subscriptionUsage: ride.subscriptionUsage?.covered
    ? {
        covered: true,
        subscriptionId: ride.subscriptionUsage.subscriptionId ? String(ride.subscriptionUsage.subscriptionId) : '',
        planId: ride.subscriptionUsage.planId ? String(ride.subscriptionUsage.planId) : '',
        planName: ride.subscriptionUsage.planName || '',
        vehicleTypeId: ride.subscriptionUsage.vehicleTypeId ? String(ride.subscriptionUsage.vehicleTypeId) : '',
        benefitType: ride.subscriptionUsage.benefitType || '',
        fareCovered: Number(ride.subscriptionUsage.fareCovered || 0),
        ridesUsedBefore: Number(ride.subscriptionUsage.ridesUsedBefore || 0),
        ridesRemainingBefore: ride.subscriptionUsage.ridesRemainingBefore === null
          ? null
          : Number(ride.subscriptionUsage.ridesRemainingBefore || 0),
        ridesUsedAfter: ride.subscriptionUsage.ridesUsedAfter === null
          ? null
          : Number(ride.subscriptionUsage.ridesUsedAfter || 0),
        ridesRemainingAfter: ride.subscriptionUsage.ridesRemainingAfter === null
          ? null
          : Number(ride.subscriptionUsage.ridesRemainingAfter || 0),
      }
    : null,
  driverPaymentCollection: ride.driverPaymentCollection
    ? {
        provider: ride.driverPaymentCollection.provider || '',
        providerId: ride.driverPaymentCollection.providerId || '',
        providerOrderId: ride.driverPaymentCollection.providerOrderId || '',
        providerPaymentId: ride.driverPaymentCollection.providerPaymentId || '',
        providerMode: ride.driverPaymentCollection.providerMode || '',
        source: ride.driverPaymentCollection.source || '',
        status: ride.driverPaymentCollection.status || 'pending',
        amount: Number(ride.driverPaymentCollection.amount || 0),
        currency: ride.driverPaymentCollection.currency || 'INR',
        linkUrl: ride.driverPaymentCollection.linkUrl || '',
        paidAt: ride.driverPaymentCollection.paidAt || null,
        updatedAt: ride.driverPaymentCollection.updatedAt || null,
      }
    : null,
  freeRide: { covered: Boolean(ride.freeRide?.covered) },
  cancellation: serializeRideCancellation(ride),
  goodsAdvance: serializeGoodsAdvance(ride),
  remainingFare: getRemainingFare(ride),
  // The start-trip OTP is the rider's to read out: the driver must ask for it, never receive it.
  ...(audience === RIDE_AUDIENCE.USER ? { otp: ride.otp || '' } : {}),
  waitingMinutes: Number(ride.waitingMinutes || 0),
  waitingCharge: Number(ride.waitingCharge || 0),
  actualDistanceMeters: Math.round(Number(ride.actualDistanceMeters || 0)),
  ...serializeRidePaymentState(ride),
  // Set when the trip ended before the booked drop (the rider got off early).
  earlyDrop: ride.earlyDrop?.at
    ? { at: ride.earlyDrop.at, distanceFromDropMeters: ride.earlyDrop.distanceFromDropMeters ?? null }
    : null,
  // The ride carries the authoritative parcel record — the fare engine writes
  // the paid add-ons and the driver's proof photos onto it. The Delivery
  // mirror holds only the booking basics, so it fills gaps rather than
  // shadowing the richer copy.
  parcel: audience === RIDE_AUDIENCE.USER
    ? withoutParcelSelfies(mergeParcelRecords(ride.deliveryId?.parcel, ride.parcel))
    : mergeParcelRecords(ride.deliveryId?.parcel, ride.parcel),
  intercity: ride.intercity || null,
  // The platform's cut and the driver's take are not the rider's business.
  ...(audience !== RIDE_AUDIENCE.USER
    ? { commissionAmount: ride.commissionAmount, driverEarnings: ride.driverEarnings }
    : {}),
  promo: ride.promo?.code ? ride.promo : null,
  pricingSnapshot: ride.pricingSnapshot
    ? {
        setPriceId: ride.pricingSnapshot.setPriceId || null,
        ...(audience !== RIDE_AUDIENCE.USER
          ? {
              admin_commission_type_from_driver: Number(ride.pricingSnapshot.admin_commission_type_from_driver ?? 1),
              admin_commission_from_driver: Number(ride.pricingSnapshot.admin_commission_from_driver ?? 0),
              admin_commission_type_for_owner: Number(ride.pricingSnapshot.admin_commission_type_for_owner ?? 1),
              admin_commission_for_owner: Number(ride.pricingSnapshot.admin_commission_for_owner ?? 0),
            }
          : {}),
        waiting_charge: Number(ride.pricingSnapshot.waiting_charge ?? 0),
        free_waiting_before: Number(ride.pricingSnapshot.free_waiting_before ?? 0),
        free_waiting_after: Number(ride.pricingSnapshot.free_waiting_after ?? 0),
        allowed_payment_methods: normalizeAllowedRidePaymentMethods(ride.pricingSnapshot.allowed_payment_methods),
        resolvedAt: ride.pricingSnapshot.resolvedAt || null,
      }
    : null,
  vehicleIconType: ride.vehicleIconType || '',
  // URL only (older rides copied a base64 icon from the vehicle)
  vehicleIconUrl: isDataUrl(ride.vehicleIconUrl) ? '' : (ride.vehicleIconUrl || ''),
  pickupLocation: ride.pickupLocation,
  pickupAddress: ride.pickupAddress || '',
  dropLocation: ride.dropLocation,
  dropAddress: ride.dropAddress || '',
  scheduledAt: ride.scheduledAt || null,
  acceptedAt: ride.acceptedAt,
  ...(audience !== RIDE_AUDIENCE.USER
    ? {
        acceptSelfie: ride.acceptSelfie?.imageUrl
          ? {
              imageUrl: ride.acceptSelfie.imageUrl,
              capturedAt: ride.acceptSelfie.capturedAt || null,
            }
          : null,
        // The driver still owes the accept selfie (scheduled and bid rides included).
        acceptSelfieRequired: Boolean(ride.driverId)
          && [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING].includes(ride.status)
          && !ride.acceptSelfie?.imageUrl,
      }
    : {}),
  arrivedAt: ride.arrivedAt,
  startedAt: ride.startedAt,
  completedAt: ride.completedAt,
  createdAt: ride.createdAt || null,
  updatedAt: ride.updatedAt || null,
  feedback: ride.feedback || null,
  ...(audience !== RIDE_AUDIENCE.USER ? { driverFeedback: ride.driverFeedback?.submittedAt ? ride.driverFeedback : null } : {}),
  lastDriverLocation: ride.lastDriverLocation?.coordinates?.length
    ? {
        type: ride.lastDriverLocation.type,
        coordinates: ride.lastDriverLocation.coordinates,
        heading: ride.lastDriverLocation.heading,
        speed: ride.lastDriverLocation.speed,
        updatedAt: ride.lastDriverLocation.updatedAt,
      }
    : null,
  user: ride.userId,
  driver: ride.driverId,
  messages: (ride.messages || []).slice(-30).map((message) => ({
    id: String(message._id),
    senderRole: message.senderRole,
    senderId: String(message.senderId),
    message: message.message,
    sentAt: message.sentAt,
  })),
});

export const ensureRideParticipantAccess = async ({ rideId, role, entityId }) => {
  const ride = await Ride.findById(rideId).select('userId driverId status liveStatus');

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  const actorId = String(entityId);
  const isUser = role === 'user' && String(ride.userId) === actorId;
  const isDriver = role === 'driver' && ride.driverId && String(ride.driverId) === actorId;

  if (!isUser && !isDriver) {
    throw new ApiError(403, 'You are not allowed to access this ride room');
  }

  return ride;
};

export const getActiveRideForIdentity = async ({ role, entityId }) => {
  if (role === 'user') {
    const user = await User.findById(entityId).select('currentRideId');

    if (!user?.currentRideId) {
      return null;
    }

    return populateRideRealtime(user.currentRideId);
  }

  if (role === 'driver') {
    const rides = await Ride.find({
      driverId: entityId,
      status: { $in: activeRideStatuses },
    })
      .sort({ updatedAt: -1 })
      .populate('userId', 'name phone rating ratingCount')
      .populate('driverId', 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating');

    // A scheduled ride that is still in the future is normally not "active", but one that was just
    // accepted and has no selfie yet must be returned so the app can open the selfie screen.
    return rides.find((ride) => !isRideScheduledForFuture(ride))
      || rides.find((ride) => ride.status === RIDE_STATUS.ACCEPTED && !ride.acceptSelfie?.imageUrl)
      || null;
  }

  return null;
};

export const listRideHistoryForIdentity = async ({ role, entityId, limit = 50, page = 1, category = 'all' }) => {
  if (!['user', 'driver'].includes(role)) {
    throw new ApiError(403, 'Only riders and drivers can access ride history');
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const query = role === 'driver' ? { driverId: entityId } : { userId: entityId };
  const normalizedCategory = String(category || 'all').trim().toLowerCase();

  if (normalizedCategory === 'rides') {
    query.serviceType = 'ride';
    query.scheduledAt = null;
  } else if (normalizedCategory === 'parcels') {
    query.serviceType = 'parcel';
    query.scheduledAt = null;
    query['parcel.isOutstation'] = { $ne: true };
    query['parcel.deliveryScope'] = { $ne: 'outstation' };
  } else if (normalizedCategory === 'outstation') {
    query.scheduledAt = null;
    query.$or = [
      { serviceType: 'intercity' },
      {
        serviceType: 'parcel',
        $or: [
          { 'parcel.isOutstation': true },
          { 'parcel.deliveryScope': 'outstation' },
        ],
      },
    ];
  } else if (normalizedCategory === 'scheduled') {
    query.scheduledAt = { $ne: null };
  }

  const counterpartPath = role === 'driver' ? 'userId' : 'driverId';
  const counterpartSelect =
    role === 'driver'
      ? 'name phone profileImage rating ratingCount'
      : 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating';

  const ridesQuery = Ride.find(query)
    .select([
      '_id',
      'deliveryId',
      'serviceType',
      'status',
      'liveStatus',
      'fare',
      'baseFare',
      'bookingMode',
      'biddingStatus',
      'bidStepAmount',
      'userMaxBidFare',
      'acceptedBidId',
      'estimatedDistanceMeters',
      'estimatedDurationMinutes',
      'paymentMethod',
      'freeRide',
      'subscriptionUsage',
      'waitingMinutes',
      'waitingCharge',
      'actualDistanceMeters',
      'walletHold',
      'walletPayment',
      'walletShortfall',
      'driverPaymentCollection',
      'cancellation',
      'goodsAdvance',
      'otp',
      'parcel',
      'intercity',
      'pricingSnapshot',
      'commissionAmount',
      'driverEarnings',
      'vehicleIconType',
      'vehicleIconUrl',
      'pickupLocation',
      'pickupAddress',
      'dropLocation',
      'dropAddress',
      'scheduledAt',
      'acceptedAt',
      'arrivedAt',
      'startedAt',
      'completedAt',
      'feedback',
      // the driver's own rating of the rider; never selected for the rider
      ...(role === 'driver' ? ['+driverFeedback'] : []),
      'createdAt',
      'updatedAt',
      'userId',
      'driverId',
    ].join(' '))
    .sort({ createdAt: -1 })
    .skip((safePage - 1) * safeLimit)
    .limit(safeLimit)
    .populate(counterpartPath, counterpartSelect)
    .lean();

  if (role === 'user') {
    ridesQuery.populate('deliveryId', 'parcel');
  }

  const [rides, total] = await Promise.all([
    ridesQuery,
    Ride.countDocuments(query),
  ]);

  return {
    results: rides.map((ride) => ({
    rideId: String(ride._id),
    deliveryId: ride.deliveryId?._id ? String(ride.deliveryId._id) : ride.deliveryId ? String(ride.deliveryId) : null,
    type: ride.serviceType || 'ride',
    serviceType: ride.serviceType || 'ride',
    tripMode: ride.tripMode || 'one_way',
    status: ride.status,
    liveStatus: ride.liveStatus,
    fare: ride.fare,
    baseFare: Number(ride.baseFare || ride.fare || 0),
    bookingMode: ride.bookingMode || 'normal',
    biddingStatus: ride.biddingStatus || 'none',
    bidStepAmount: Number(ride.bidStepAmount || DEFAULT_BID_STEP_AMOUNT),
    bidFloorFare: Number(ride.bidFloorFare ?? ride.baseFare ?? ride.fare ?? 0),
    userMaxBidFare: Number(ride.userMaxBidFare || ride.fare || 0),
    bidCeilingMaxFare: Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || ride.fare || 0),
    acceptedBidId: ride.acceptedBidId ? String(ride.acceptedBidId) : null,
    estimatedDistanceMeters: ride.estimatedDistanceMeters || 0,
    estimatedDurationMinutes: ride.estimatedDurationMinutes || 0,
    paymentMethod: ride.paymentMethod,
    freeRide: { covered: Boolean(ride.freeRide?.covered) },
    subscriptionUsage: ride.subscriptionUsage?.covered
      ? { covered: true, planId: ride.subscriptionUsage.planId ? String(ride.subscriptionUsage.planId) : '', planName: ride.subscriptionUsage.planName || '' }
      : null,
    cancellation: serializeRideCancellation(ride),
    goodsAdvance: serializeGoodsAdvance(ride),
    remainingFare: getRemainingFare(ride),
    ...(role === 'user' ? { otp: ride.otp || '' } : {}),
    waitingMinutes: Number(ride.waitingMinutes || 0),
    waitingCharge: Number(ride.waitingCharge || 0),
    actualDistanceMeters: Math.round(Number(ride.actualDistanceMeters || 0)),
    ...serializeRidePaymentState(ride),
    // The ride carries the authoritative parcel record — the fare engine writes
    // the paid add-ons and the driver's proof photos onto it. The Delivery
    // mirror holds only the booking basics, so it fills gaps rather than
    // shadowing the richer copy.
    // The driver's pickup/drop selfies are admin-only: never in the rider's history.
    parcel: role === 'user'
      ? withoutParcelSelfies(mergeParcelRecords(ride.deliveryId?.parcel, ride.parcel))
      : mergeParcelRecords(ride.deliveryId?.parcel, ride.parcel),
    intercity: ride.intercity || null,
    ...(role === 'driver'
      ? {
          pricingSnapshot: ride.pricingSnapshot || null,
          commissionAmount: ride.commissionAmount,
          driverEarnings: ride.driverEarnings,
        }
      : {
          pricingSnapshot: ride.pricingSnapshot
            ? {
                waiting_charge: Number(ride.pricingSnapshot.waiting_charge ?? 0),
                free_waiting_before: Number(ride.pricingSnapshot.free_waiting_before ?? 0),
                free_waiting_after: Number(ride.pricingSnapshot.free_waiting_after ?? 0),
              }
            : null,
        }),
    vehicleIconType: ride.vehicleIconType,
    // Keep history responses light; giant data URLs can stall the activity screen.
    vehicleIconUrl: String(ride.vehicleIconUrl || '').startsWith('data:') ? '' : (ride.vehicleIconUrl || ''),
    pickupLocation: ride.pickupLocation,
    pickupAddress: ride.pickupAddress || '',
    dropLocation: ride.dropLocation,
    dropAddress: ride.dropAddress || '',
    scheduledAt: ride.scheduledAt || null,
    acceptedAt: ride.acceptedAt,
    arrivedAt: ride.arrivedAt,
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
    feedback: ride.feedback || null,
    ...(role === 'driver' ? { driverFeedback: ride.driverFeedback?.submittedAt ? ride.driverFeedback : null } : {}),
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
    user: role === 'driver' ? (ride.userId || null) : null,
    driver: role === 'user' ? (ride.driverId || null) : null,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasNextPage: safePage * safeLimit < total,
      hasPrevPage: safePage > 1,
    },
  };
};

export const acceptRideAssignment = async ({ rideId, driverId, selfieUrl = '' }) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const ride = await Ride.findOne({
        _id: rideId,
        status: RIDE_STATUS.SEARCHING,
        driverId: null,
      }).session(session);

      if (!ride) {
        throw new ApiError(409, 'Ride is no longer available for acceptance');
      }

      if (ride.bookingMode === 'bidding') {
        throw new ApiError(409, 'Bidding rides must be won through bid acceptance');
      }

      const driverVehicleFilter = await buildDriverVehicleAcceptFilter(ride);
      const driver = await Driver.findOne({
        _id: driverId,
        isOnline: true,
        isOnRide: false,
        'wallet.isBlocked': { $ne: true },
        ...driverVehicleFilter,
      }).session(session);

      if (!driver) {
        throw new ApiError(409, 'Driver is unavailable to accept this ride');
      }

      const blockedDriverIds = await getDriverIdsBlockedByUpcomingScheduledRides([driverId], { session });
      if (blockedDriverIds.has(String(driverId))) {
        throw new ApiError(409, 'Driver is blocked from new rides within 30 minutes of a scheduled trip');
      }

      const conflictingScheduledRide = await findDriverConflictingScheduledRide({
        driverId,
        ride,
        excludeRideId: ride._id,
        session,
      });
      if (conflictingScheduledRide) {
        throw new ApiError(409, 'Driver already has another scheduled trip in a similar time range');
      }

      assertDriverNotCancelBlocked(driver);
      await ensureDriverWalletCanAcceptRide(driver, { session });

      ride.driverId = driver._id;
      ride.status = RIDE_STATUS.ACCEPTED;
      ride.liveStatus = RIDE_LIVE_STATUS.ACCEPTED;
      ride.acceptedAt = new Date();
      if (selfieUrl) {
        ride.acceptSelfie = {
          imageUrl: selfieUrl,
          driverId: driver._id,
          capturedAt: new Date(),
        };
      }
      driver.isOnRide = !isRideScheduledForFuture(ride);

      await ride.save({ session });
      await driver.save({ session });
      await session.commitTransaction();
      await syncDeliveryWithRide(ride);

      return ride;
    } catch (error) {
      lastError = error;
      await session.abortTransaction();

      const isTransient =
        typeof error?.hasErrorLabel === 'function' &&
        (error.hasErrorLabel('TransientTransactionError') || error.hasErrorLabel('UnknownTransactionCommitResult'));

      if (isTransient && attempt === 2) {
        // Retries exhausted because several drivers accepted the same ride at
        // once. This driver lost the race in practice, so tell them that
        // instead of leaking a storage-engine write conflict into their app.
        throw new ApiError(409, 'Ride is no longer available for acceptance');
      }

      if (!isTransient) {
        throw error;
      }
    } finally {
      session.endSession();
    }
  }

  throw lastError || new ApiError(500, 'Failed to accept ride');
};

// The driver app now sends `acceptRide` immediately on tap, before the selfie
// capture, so assignment always lands well inside the per-driver offer window
// instead of racing it. The selfie itself arrives slightly later, once the ride
// has already moved out of SEARCHING, so it can't go through
// acceptRideAssignment's searching-only transaction — this attaches it
// separately to a ride the calling driver already owns.
export const attachAcceptSelfie = async ({ rideId, driverId, selfieUrl }) => {
  if (!selfieUrl || !String(selfieUrl).trim()) {
    throw new ApiError(400, 'selfieUrl is required');
  }

  const ride = await Ride.findOne({ _id: rideId, driverId }).maxTimeMS(8000);

  if (!ride) {
    throw new ApiError(404, 'Ride not found for this driver');
  }

  ride.acceptSelfie = {
    imageUrl: String(selfieUrl).trim(),
    driverId,
    capturedAt: new Date(),
  };

  await ride.save({ maxTimeMS: 8000 });

  return populateRideRealtime(ride._id);
};

const isParcelRide = (ride) =>
  String(ride?.serviceType || ride?.type || 'ride').toLowerCase() === 'parcel';

// Strict order, no skipping:
//   ride:   accepted -> arriving (at pickup) -> started -> arrived (at drop) -> completed
//   parcel: accepted -> arriving -> goods_loaded -> started -> arrived -> goods_delivered -> completed
// Repeating the current step is a no-op, and arriving -> accepted undoes a mistaken "at pickup".
// `allowedCurrent` may be a function of the ride when parcels and rides differ.
// `atTarget` names the point the driver must be near (`pickup` / `drop`) for the step.
const rideStatusConfig = {
  [RIDE_LIVE_STATUS.ACCEPTED]: {
    persistedStatus: RIDE_STATUS.ACCEPTED,
    allowedCurrent: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING],
  },
  [RIDE_LIVE_STATUS.ARRIVING]: {
    persistedStatus: RIDE_STATUS.ACCEPTED,
    allowedCurrent: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING],
    atTarget: 'pickup',
  },
  // Parcel only: the consignment is loaded and photographed at the pickup
  // before the trip may start.
  [RIDE_LIVE_STATUS.GOODS_LOADED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: [RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.GOODS_LOADED],
    parcelOnly: true,
    requiresProof: 'pickupProof',
    atTarget: 'pickup',
  },
  [RIDE_LIVE_STATUS.STARTED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: (ride) => (isParcelRide(ride)
      ? [RIDE_LIVE_STATUS.GOODS_LOADED, RIDE_LIVE_STATUS.STARTED]
      : [RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.STARTED]),
    requiresOtp: true,
  },
  [RIDE_LIVE_STATUS.ARRIVED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: [RIDE_LIVE_STATUS.STARTED, RIDE_LIVE_STATUS.ARRIVED],
    atTarget: 'drop',
  },
  // Parcel only: handover is photographed at the drop before completion.
  [RIDE_LIVE_STATUS.GOODS_DELIVERED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: [RIDE_LIVE_STATUS.ARRIVED, RIDE_LIVE_STATUS.GOODS_DELIVERED],
    parcelOnly: true,
    requiresProof: 'dropProof',
    atTarget: 'drop',
  },
  // No location check here: the strict order means the driver was already verified at the drop ("arrived" /
  // "goods_delivered"). Checking again would strand a ride whose driver moved off while collecting cash.
  [RIDE_LIVE_STATUS.COMPLETED]: {
    persistedStatus: RIDE_STATUS.COMPLETED,
    allowedCurrent: (ride) => (isParcelRide(ride)
      ? [RIDE_LIVE_STATUS.GOODS_DELIVERED]
      : [RIDE_LIVE_STATUS.ARRIVED]),
  },
};

const OTP_MAX_FAILED_ATTEMPTS = 5;
const OTP_LOCK_MS = 10 * 60 * 1000;
// A saved GPS point older than this cannot prove where the driver is now.
const DRIVER_LOCATION_MAX_AGE_MS = 2 * 60 * 1000;

const isSettingOn = (value, fallback = true) => {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const readRadiusSetting = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * The driver must be within the admin radius of the pickup (`arriving`, `goods_loaded`) or the drop (`arrived`,
 * `goods_delivered`, `completed`). Position: the coordinates sent with the request, else the last GPS point saved on
 * the ride if it is fresh. A radius of 0 turns the check off.
 */
const assertDriverAtTarget = async ({ ride, target, coordinates }) => {
  const settings = await getTransportRideSettings();
  const radiusMeters = target === 'pickup'
    ? readRadiusSetting(settings.arrival_radius_meters, 200)
    : readRadiusSetting(settings.drop_radius_meters, 300);
  if (!radiusMeters) {
    return;
  }

  const targetPoint = target === 'pickup' ? ride.pickupLocation?.coordinates : ride.dropLocation?.coordinates;
  if (!Array.isArray(targetPoint) || targetPoint.length !== 2) {
    return; // nothing to compare against (e.g. a ride without a drop point)
  }

  // Where the driver is: the coordinates sent with this request; else the last GPS point of this ride; else the
  // driver's live location (online heartbeat). The saved points only count while fresh.
  let driverPoint = null;
  if (coordinates !== undefined && coordinates !== null) {
    driverPoint = normalizePoint(coordinates, 'coordinates');
  } else {
    const isFresh = (at) => Boolean(at) && Date.now() - new Date(at).getTime() <= DRIVER_LOCATION_MAX_AGE_MS;
    const saved = ride.lastDriverLocation;
    if (Array.isArray(saved?.coordinates) && saved.coordinates.length === 2 && isFresh(saved.updatedAt)) {
      driverPoint = saved.coordinates;
    } else if (ride.driverId) {
      const driver = await Driver.findById(ride.driverId).select('location incentiveTracking.lastSeenAt').lean();
      const live = driver?.location?.coordinates;
      if (Array.isArray(live) && live.length === 2 && (live[0] || live[1]) && isFresh(driver?.incentiveTracking?.lastSeenAt)) {
        driverPoint = live;
      }
    }
  }

  if (!driverPoint) {
    // Admin switch for a rollout: '0' lets the step through when no position is known at all (a driver that is
    // known to be far away is still refused).
    if (!isSettingOn(settings.status_location_required, true)) {
      return;
    }
    throw new ApiError(409, 'Your current location is needed for this step. Turn on GPS and try again.', {
      code: 'LOCATION_REQUIRED',
    });
  }

  const meters = Math.round(distanceMeters(driverPoint, targetPoint));
  if (meters > radiusMeters) {
    throw new ApiError(409, `You are ${meters} m from the ${target}. Move within ${radiusMeters} m to continue.`, {
      code: 'OUT_OF_ARRIVAL_RADIUS',
      target,
      distanceMeters: meters,
      radiusMeters,
    });
  }
};

/** The start-trip OTP the rider reads out. Wrong guesses are counted; too many lock the start for a while. */
const assertStartOtp = async ({ ride, otp }) => {
  const expected = String(ride.otp || '').trim();
  if (!expected) {
    return; // rides created before OTPs existed
  }
  // Admin switch for a rollout: '0' starts trips without the OTP (e.g. while an app build cannot send it).
  const settings = await getTransportRideSettings();
  if (!isSettingOn(settings.start_trip_otp_required, true)) {
    return;
  }

  const lockedError = (lockedUntil) => {
    const ms = Math.max(1000, new Date(lockedUntil || Date.now() + OTP_LOCK_MS).getTime() - Date.now());
    return new ApiError(429, `Too many wrong OTPs. Try again in ${Math.max(1, Math.ceil(ms / 60000))} min.`, {
      code: 'OTP_LOCKED',
      attemptsLeft: 0,
      retryAfterSeconds: Math.ceil(ms / 1000),
    });
  };

  const given = String(otp ?? '').trim();
  if (!given) {
    throw new ApiError(400, 'Enter the OTP the rider shares to start the trip', { code: 'OTP_REQUIRED' });
  }

  // Every guess, right or wrong, first takes one of the attempts atomically, and only a guess that got a slot is
  // compared. Thousands of parallel guesses therefore still get at most OTP_MAX_FAILED_ATTEMPTS comparisons per lock
  // window. An expired lock starts a new round.
  const lockedUntilField = { $ifNull: ['$otpCheck.lockedUntil', null] };
  const claimed = await Ride.findOneAndUpdate(
    {
      _id: ride._id,
      $or: [{ 'otpCheck.lockedUntil': null }, { 'otpCheck.lockedUntil': { $lte: new Date() } }],
    },
    [
      {
        $set: {
          'otpCheck.failedAttempts': {
            $cond: [
              { $ne: [lockedUntilField, null] }, // the lock that was there has expired
              1,
              { $add: [{ $ifNull: ['$otpCheck.failedAttempts', 0] }, 1] },
            ],
          },
          'otpCheck.lockedUntil': null,
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).select('otpCheck').lean();

  const lockNow = () => Ride.findOneAndUpdate(
    { _id: ride._id, 'otpCheck.lockedUntil': null },
    { $set: { 'otpCheck.lockedUntil': new Date(Date.now() + OTP_LOCK_MS) } },
    { returnDocument: 'after' },
  ).select('otpCheck').lean();

  if (!claimed) {
    const current = await Ride.findById(ride._id).select('otpCheck').lean();
    throw lockedError(current?.otpCheck?.lockedUntil);
  }

  const attempt = Number(claimed.otpCheck?.failedAttempts || 0);
  if (attempt > OTP_MAX_FAILED_ATTEMPTS) {
    const locked = await lockNow();
    throw lockedError(locked?.otpCheck?.lockedUntil);
  }

  if (given === expected) {
    await Ride.updateOne({ _id: ride._id }, { $set: { 'otpCheck.failedAttempts': 0, 'otpCheck.lockedUntil': null } });
    return;
  }

  const attemptsLeft = Math.max(0, OTP_MAX_FAILED_ATTEMPTS - attempt);
  if (!attemptsLeft) {
    const locked = await lockNow();
    throw lockedError(locked?.otpCheck?.lockedUntil);
  }
  throw new ApiError(400, `Wrong OTP. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`, {
    code: 'INVALID_OTP',
    attemptsLeft,
  });
};

/**
 * Waiting at the pickup beyond the free minutes, billed per minute (rides the rider pays for only).
 * The clock starts when the driver is at the pickup, but never before a scheduled ride's pickup time (arriving early
 * is the driver's choice). For goods it stops when loading starts (the goods_loaded step): loading has its own
 * detention terms.
 */
const computeWaitingCharge = (ride, startedAt) => {
  const covered = Boolean(ride.freeRide?.covered || ride.subscriptionUsage?.covered);
  const perMinute = Number(ride.pricingSnapshot?.waiting_charge || 0);
  const arrivedAt = ride.arrivedAt ? new Date(ride.arrivedAt).getTime() : 0;
  if (covered || !(perMinute > 0) || !arrivedAt) {
    return { waitingMinutes: 0, waitingCharge: 0 };
  }
  const scheduledAt = ride.scheduledAt ? new Date(ride.scheduledAt).getTime() : 0;
  const waitFrom = Math.max(arrivedAt, Number.isFinite(scheduledAt) ? scheduledAt : 0);
  const loadingAt = isParcelRide(ride) && ride.parcel?.pickupProof?.capturedAt
    ? new Date(ride.parcel.pickupProof.capturedAt).getTime()
    : 0;
  const waitUntil = loadingAt && loadingAt < startedAt.getTime() ? loadingAt : startedAt.getTime();
  const freeMinutes = Math.max(0, Number(ride.pricingSnapshot?.free_waiting_before || 0));
  const waitedMinutes = Math.max(0, Math.floor((waitUntil - waitFrom) / 60000));
  const waitingMinutes = Math.max(0, waitedMinutes - freeMinutes);
  return {
    waitingMinutes,
    waitingCharge: Math.round(waitingMinutes * perMinute * 100) / 100,
  };
};

export const updateRideLifecycle = async ({
  rideId,
  driverId,
  nextStatus,
  paymentMethod,
  proofImageUrl,
  proofNote,
  receivedBy,
  selfieImageUrl,
  coordinates,
  otp,
  endTripEarly = false,
}) => {
  const config = rideStatusConfig[nextStatus];

  if (!config) {
    throw new ApiError(400, 'Unsupported ride status');
  }

  const ride = await Ride.findOne({ _id: rideId, driverId });

  if (!ride) {
    throw new ApiError(404, 'Assigned ride not found');
  }

  if (config.parcelOnly && !isParcelRide(ride)) {
    throw new ApiError(400, `${nextStatus} applies to delivery jobs only`);
  }

  const allowedCurrent = typeof config.allowedCurrent === 'function' ? config.allowedCurrent(ride) : config.allowedCurrent;
  if (!allowedCurrent.includes(ride.liveStatus)) {
    throw new ApiError(409, `Ride cannot move from ${ride.liveStatus} to ${nextStatus}`, {
      code: 'INVALID_STATUS_TRANSITION',
      currentStatus: ride.liveStatus,
      allowedFrom: allowedCurrent,
    });
  }

  // Repeating the current step changes nothing, so it needs neither the location nor the OTP again.
  const isRepeat = ride.liveStatus === nextStatus;
  // The rider got off before the booked drop: a passenger ride may end where it is ("arrived" with endTripEarly).
  // Recorded on the ride with the distance from the drop, for the admin and the receipts. Goods must reach the drop.
  const earlyEnd = !isRepeat && nextStatus === RIDE_LIVE_STATUS.ARRIVED && !isParcelRide(ride)
    && (endTripEarly === true || String(endTripEarly).toLowerCase() === 'true');
  if (earlyEnd) {
    let distanceFromDropMeters = 0;
    try {
      await assertDriverAtTarget({ ride, target: 'drop', coordinates });
    } catch (error) {
      if (!['OUT_OF_ARRIVAL_RADIUS', 'LOCATION_REQUIRED'].includes(error?.details?.code)) throw error;
      distanceFromDropMeters = error.details.code === 'OUT_OF_ARRIVAL_RADIUS' ? error.details.distanceMeters : null;
    }
    ride.earlyDrop = {
      at: new Date(),
      distanceFromDropMeters,
      coordinates: Array.isArray(coordinates) && coordinates.length === 2 ? normalizePoint(coordinates, 'coordinates') : undefined,
    };
  } else if (!isRepeat && config.atTarget) {
    await assertDriverAtTarget({ ride, target: config.atTarget, coordinates });
  }
  if (!isRepeat && config.requiresOtp) {
    await assertStartOtp({ ride, otp });
  }

  // The loading and handover steps exist to capture evidence, so the photo is
  // required rather than optional — a step recorded without one proves nothing.
  if (config.requiresProof) {
    const imageUrl = String(proofImageUrl || '').trim();

    if (!imageUrl) {
      throw new ApiError(400, 'A photo of the consignment is required for this step');
    }

    ride.parcel = ride.parcel || {};
    ride.parcel[config.requiresProof] = {
      imageUrl,
      capturedAt: new Date(),
      note: String(proofNote || '').trim(),
      ...(config.requiresProof === 'dropProof'
        ? { receivedBy: String(receivedBy || '').trim() }
        : {}),
    };

    // Driver face selfie at the same step (pickup / drop). Optional until the admin switches
    // `goods_selfie_required` on, so older driver apps keep working.
    const selfieKey = config.requiresProof === 'pickupProof' ? 'pickupSelfie' : 'dropSelfie';
    const selfieUrl = String(selfieImageUrl || '').trim();
    if (selfieUrl) {
      ride.parcel[selfieKey] = { imageUrl: selfieUrl, capturedAt: new Date() };
    } else {
      const transportSettings = await getTransportRideSettings();
      if (['1', 'true', 'yes', 'on'].includes(String(transportSettings.goods_selfie_required ?? '0').trim().toLowerCase())) {
        throw new ApiError(400, 'A selfie of the driver is required for this step');
      }
    }
    ride.markModified('parcel');
  }

  // A delivery cannot be completed until the handover has been photographed.
  if (nextStatus === RIDE_LIVE_STATUS.COMPLETED && isParcelRide(ride)) {
    if (!String(ride.parcel?.dropProof?.imageUrl || '').trim()) {
      throw new ApiError(409, 'Capture the delivery photo before completing this job');
    }
  }

  const previousLiveStatus = ride.liveStatus;
  const previousStatus = ride.status;
  ride.liveStatus = nextStatus;
  ride.status = config.persistedStatus;

  if (nextStatus === RIDE_LIVE_STATUS.ACCEPTED) {
    ride.arrivedAt = null;
  }

  if (nextStatus === RIDE_LIVE_STATUS.ARRIVING && !ride.arrivedAt) {
    ride.arrivedAt = new Date();
  }

  if (nextStatus === RIDE_LIVE_STATUS.STARTED && !ride.startedAt) {
    ride.startedAt = new Date();
    const { waitingMinutes, waitingCharge } = computeWaitingCharge(ride, ride.startedAt);
    if (waitingCharge > 0) {
      ride.waitingMinutes = waitingMinutes;
      ride.waitingCharge = waitingCharge;
      // Billed with the fare, so payment, settlement and receipts all include it.
      ride.fare = Math.round((Number(ride.fare || 0) + waitingCharge) * 100) / 100;
    }
  }

  // The driver's app may report how it was paid (cash/online), but a wallet ride stays a wallet ride: the rider
  // chose it and the money is already held.
  // Nor can the driver make a ride a wallet ride: only the rider chooses wallet, at booking (with a hold).
  if (paymentMethod !== undefined && paymentMethod !== null && String(paymentMethod).trim() && ride.paymentMethod !== 'wallet') {
    const driverReportedMethod = normalizeRidePaymentMethod(paymentMethod);
    ride.paymentMethod = driverReportedMethod === 'wallet' ? 'online' : driverReportedMethod;
  }

  if (nextStatus === RIDE_LIVE_STATUS.COMPLETED) {
    ride.completedAt = new Date();
  }

  // Claim the step atomically: if the ride was cancelled (or moved on) since it was loaded, a cancel and this
  // step cannot both win (otherwise a cancelled wallet ride could still be completed and charged).
  const claimed = await Ride.updateOne(
    { _id: ride._id, driverId, status: previousStatus, liveStatus: previousLiveStatus },
    { $set: { status: config.persistedStatus, liveStatus: nextStatus } },
  );
  if (!claimed.matchedCount) {
    throw new ApiError(409, 'This ride changed in the meantime (for example it was cancelled). Refresh and try again.', {
      code: 'RIDE_STATE_CHANGED',
    });
  }
  await ride.save();
  await syncDeliveryWithRide(ride);

  let walletUpdate = null;

  if (nextStatus === RIDE_LIVE_STATUS.COMPLETED) {
    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }),
      Driver.findByIdAndUpdate(driverId, { isOnRide: false }),
    ]);

    try {
      walletUpdate = await settleCompletedRideWallet({ rideId: ride._id });
    } finally {
      // Wallet ride: debit the rider's wallet now (hold first), no payment sheet. Once per ride; runs even if
      // the driver settlement failed, and the recovery sweep retries it if this fails.
      if (ride.paymentMethod === 'wallet') {
        await captureRideWalletPayment({ rideId: ride._id }).catch((error) => {
          console.error('Wallet capture failed; the sweep will retry', String(ride._id), error?.message || error);
        });
      }
    }
    await consumeUserSubscriptionRide({ ride });
    // Counting a free ride is best-effort: the ride is already completed and
    // settled, so a failure here must not turn the driver's request into a 500.
    await consumeFreeRide({ ride }).catch((error) => {
      console.error('Failed to count free ride', String(ride._id), error?.message || error);
    });
    const settledRide = await Ride.findById(ride._id).select('completedAt driverEarnings estimatedDistanceMeters actualDistanceMeters');

    await incrementDriverTodaySummaryForCompletedRide({
      driverId,
      completedAt: settledRide?.completedAt || ride.completedAt,
      driverEarnings: settledRide?.driverEarnings,
      // what was really driven when the GPS trail has it, else the planned route
      distanceMeters: Number(settledRide?.actualDistanceMeters) > 0
        ? settledRide.actualDistanceMeters
        : settledRide?.estimatedDistanceMeters,
    });

    await processCompletedRideReferralReward(ride);
    await processCompletedDriverReferralReward(ride);
  }

  const populatedRide = await populateRideRealtime(ride._id);
  populatedRide.$locals.walletUpdate = walletUpdate;

  return populatedRide;
};

export const appendRideMessage = async ({ rideId, role, senderId, message }) => {
  const trimmedMessage = String(message || '').trim();

  if (!trimmedMessage) {
    throw new ApiError(400, 'Message is required');
  }

  if (!['user', 'driver'].includes(role)) {
    throw new ApiError(403, 'Only rider and driver can send ride messages');
  }

  await ensureRideParticipantAccess({ rideId, role, entityId: senderId });

  const ride = await Ride.findById(rideId);

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  ride.messages.push({
    senderRole: role,
    senderId,
    message: trimmedMessage,
  });

  if (ride.messages.length > 200) {
    ride.messages = ride.messages.slice(-200);
  }

  await ride.save();

  const latestMessage = ride.messages[ride.messages.length - 1];

  return {
    id: String(latestMessage._id),
    rideId: String(ride._id),
    senderRole: latestMessage.senderRole,
    senderId: String(latestMessage.senderId),
    message: latestMessage.message,
    sentAt: latestMessage.sentAt,
  };
};

// GPS points closer than this are jitter, and a jump faster than this is a bad fix: neither adds distance.
const TRAVEL_MIN_STEP_METERS = 3;
const TRAVEL_MAX_SPEED_MPS = 100;

/**
 * The driven distance is measured from an anchor point, not from the previous GPS fix: the anchor only moves once
 * the driver is at least TRAVEL_MIN_STEP_METERS away from it, so slow crawling still adds up while jitter does not.
 * Returns what to do for a new fix: `{ meters, moveAnchor }` (meters 0 for jitter, the first fix, or a bad jump).
 */
const planTravelStep = (previous, nextCoords, now) => {
  if (previous?.liveStatus !== RIDE_LIVE_STATUS.STARTED) return { meters: 0, moveAnchor: false };
  const anchor = previous.travelAnchor;
  if (!Array.isArray(anchor?.coordinates) || anchor.coordinates.length !== 2 || !anchor.at) {
    return { meters: 0, moveAnchor: true }; // first fix of the trip
  }
  const meters = distanceMeters(anchor.coordinates, nextCoords);
  if (!Number.isFinite(meters) || meters < TRAVEL_MIN_STEP_METERS) return { meters: 0, moveAnchor: false };
  const seconds = Math.max(0.5, (now.getTime() - new Date(anchor.at).getTime()) / 1000);
  if (meters / seconds > TRAVEL_MAX_SPEED_MPS) return { meters: 0, moveAnchor: true }; // a bad fix: skip it
  return { meters, moveAnchor: true };
};

export const updateRideDriverLocation = async ({ rideId, driverId, coordinates, heading = null, speed = null }) => {
  const normalizedCoords = normalizePoint(coordinates, 'coordinates');
  const now = new Date();
  const nextDriverLocation = {
    type: 'Point',
    coordinates: normalizedCoords,
    heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
    updatedAt: now,
  };
  const previous = await Ride.findOne({ _id: rideId, driverId })
    .select('liveStatus +travelAnchor')
    .lean();
  const step = planTravelStep(previous, normalizedCoords, now);
  if (previous && step.moveAnchor) {
    // Only if the anchor is still the one this step was measured from: two fixes processed at once cannot both
    // add the same stretch.
    await Ride.updateOne(
      { _id: rideId, driverId, 'travelAnchor.at': previous.travelAnchor?.at ?? null },
      {
        $set: { travelAnchor: { coordinates: normalizedCoords, at: now } },
        ...(step.meters > 0 ? { $inc: { actualDistanceMeters: Math.round(step.meters * 10) / 10 } } : {}),
      },
    );
  }
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, driverId },
    {
      $set: {
        lastDriverLocation: nextDriverLocation,
      },
    },
    {
      returnDocument: 'after',
      projection: {
        _id: 1,
        lastDriverLocation: 1,
      },
    },
  ).lean();

  if (!ride) {
    throw new ApiError(404, 'Assigned ride not found');
  }

  // During a ride the app reports here instead of the general `locationUpdate`, so this is also the online
  // heartbeat (active time). At most one write a minute: the filter matches only a stale heartbeat.
  Driver.updateOne(
    {
      _id: driverId,
      $or: [
        { 'incentiveTracking.lastSeenAt': null },
        { 'incentiveTracking.lastSeenAt': { $lt: new Date(now.getTime() - 60 * 1000) } },
      ],
    },
    // the position too, so the live-location fallback never pairs a fresh heartbeat with an old point
    { $set: { 'incentiveTracking.lastSeenAt': now, location: { type: 'Point', coordinates: normalizedCoords } } },
  ).catch(() => null);

  return {
    rideId: String(ride._id),
    coordinates: ride.lastDriverLocation?.coordinates || normalizedCoords,
    heading: ride.lastDriverLocation.heading,
    speed: ride.lastDriverLocation.speed,
    updatedAt: ride.lastDriverLocation.updatedAt,
  };
};

export const listRideBidsForUser = async ({ rideId, userId }) => {
  const ride = await Ride.findOne({ _id: rideId, userId }).select(
    '_id userId status liveStatus fare baseFare bookingMode pricingNegotiationMode biddingStatus bidStepAmount bidFloorFare userMaxBidFare bidCeilingMaxFare fareIncreaseWaitMinutes nextFareIncreaseAt acceptedBidId',
  );

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  const bids = await RideBid.find({ rideId: ride._id })
    .populate('driverId', 'name phone profileImage vehicleType vehicleNumber vehicleColor vehicleMake vehicleModel rating')
    .sort({ bidFare: 1, createdAt: 1 });

  return {
    ride: serializeRideRealtime(ride),
    bids: bids.map(serializeRideBid),
  };
};

export const submitRideBid = async ({ rideId, driverId, bidFare }) => {
  const ride = await Ride.findById(rideId).select(
    '_id userId driverId vehicleTypeId dispatchVehicleTypeIds status liveStatus fare baseFare bookingMode pricingNegotiationMode biddingStatus bidStepAmount bidFloorFare userMaxBidFare bidCeilingMaxFare',
  );

  if (!ride) {
    throw new ApiError(404, 'Ride not found');
  }

  if (ride.status !== RIDE_STATUS.SEARCHING || ride.liveStatus !== RIDE_LIVE_STATUS.SEARCHING) {
    throw new ApiError(409, 'Ride is no longer open for bidding');
  }

  if (ride.pricingNegotiationMode !== 'driver_bid' || ride.bookingMode !== 'bidding' || ride.biddingStatus !== 'open') {
    throw new ApiError(409, 'Ride is not open for bidding');
  }

  const driverVehicleFilter = await buildDriverVehicleAcceptFilter(ride);
  const driver = await Driver.findOne({
    _id: driverId,
    isOnline: true,
    isOnRide: false,
    'wallet.isBlocked': { $ne: true },
    ...driverVehicleFilter,
  }).select('name phone profileImage vehicleType vehicleNumber vehicleColor vehicleMake vehicleModel rating cancelTracking');

  if (!driver) {
    throw new ApiError(409, 'Driver is unavailable to bid on this ride');
  }

  assertDriverNotCancelBlocked(driver);

  const blockedDriverIds = await getDriverIdsBlockedByUpcomingScheduledRides([driverId]);
  if (blockedDriverIds.has(String(driverId))) {
    throw new ApiError(409, 'Driver is blocked from new rides within 30 minutes of a scheduled trip');
  }

  const conflictingScheduledRide = await findDriverConflictingScheduledRide({
    driverId,
    ride,
  });
  if (conflictingScheduledRide) {
    throw new ApiError(409, 'Driver already has another scheduled trip in a similar time range');
  }

  const normalizedBid = normalizeRideBidAmount({ ride, bidFare });

  const bid = await RideBid.findOneAndUpdate(
    { rideId: ride._id, driverId },
    {
      rideId: ride._id,
      userId: ride.userId,
      driverId,
      bidFare: normalizedBid.bidFare,
      incrementAmount: normalizedBid.incrementAmount,
      status: 'pending',
    },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
    },
  ).populate('driverId', 'name phone profileImage vehicleType vehicleNumber vehicleColor vehicleMake vehicleModel rating');

  return {
    ride: serializeRideRealtime(ride),
    bid: serializeRideBid(bid),
  };
};

export const increaseRideBidCeiling = async ({ rideId, userId, incrementSteps = 1 }) => {
  const ride = await Ride.findOne({
    _id: rideId,
    userId,
    status: RIDE_STATUS.SEARCHING,
    liveStatus: RIDE_LIVE_STATUS.SEARCHING,
  });

  if (!ride) {
    throw new ApiError(404, 'Active ride not found');
  }

  const safeSteps = Math.max(1, Math.round(Number(incrementSteps || 1)));
  const safeStepAmount = normalizeBidStepAmount(ride.bidStepAmount);
  if (ride.pricingNegotiationMode === 'driver_bid') {
    if (ride.bookingMode !== 'bidding' || ride.biddingStatus !== 'open') {
      throw new ApiError(409, 'Ride is not open for bid increases');
    }

    const nextUserMaxBidFare = Math.max(
      Number(ride.baseFare || ride.fare || 0),
      Number(ride.userMaxBidFare || ride.fare || 0) + (safeSteps * safeStepAmount),
    );
    const updatedRide = await Ride.findOneAndUpdate(
      {
        _id: rideId,
        userId,
        status: RIDE_STATUS.SEARCHING,
        liveStatus: RIDE_LIVE_STATUS.SEARCHING,
        bookingMode: 'bidding',
        biddingStatus: 'open',
        pricingNegotiationMode: 'driver_bid',
      },
      {
        $set: {
          userMaxBidFare: nextUserMaxBidFare,
        },
      },
      {
        returnDocument: 'after',
        runValidators: true,
      },
    );

    if (!updatedRide) {
      throw new ApiError(409, 'Ride is not open for bid increases');
    }

    return serializeRideRealtime(updatedRide);
  }

  if (ride.pricingNegotiationMode !== 'user_increment_only') {
    throw new ApiError(409, 'Ride is not open for fare increases');
  }

  const nextFareIncreaseAt = ride.nextFareIncreaseAt ? new Date(ride.nextFareIncreaseAt) : null;
  if (nextFareIncreaseAt && nextFareIncreaseAt.getTime() > Date.now()) {
    throw new ApiError(409, 'Fare can be increased after the waiting time completes');
  }

  const currentFare = Math.max(0, Number(ride.fare || ride.baseFare || 0));
  const maxAllowedFare = Math.max(currentFare, Number(ride.bidCeilingMaxFare || ride.userMaxBidFare || currentFare));
  if (currentFare >= maxAllowedFare) {
    throw new ApiError(409, 'Fare is already at the configured ceiling');
  }

  const nextFare = Math.min(maxAllowedFare, currentFare + (safeSteps * safeStepAmount));
  const waitMinutes = Math.max(0, Math.round(Number(ride.fareIncreaseWaitMinutes || 0)));
  const updatedRide = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      userId,
      status: RIDE_STATUS.SEARCHING,
      liveStatus: RIDE_LIVE_STATUS.SEARCHING,
      pricingNegotiationMode: 'user_increment_only',
    },
    {
      $set: {
        fare: nextFare,
        userMaxBidFare: nextFare,
        nextFareIncreaseAt: waitMinutes > 0 ? new Date(Date.now() + waitMinutes * 60 * 1000) : null,
      },
    },
    {
      returnDocument: 'after',
      runValidators: true,
    },
  );

  if (!updatedRide) {
    throw new ApiError(409, 'Ride is not open for fare increases');
  }

  return serializeRideRealtime(updatedRide);
};

export const acceptRideBidAssignment = async ({ rideId, bidId, userId }) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const ride = await Ride.findOne({
        _id: rideId,
        userId,
        status: RIDE_STATUS.SEARCHING,
        liveStatus: RIDE_LIVE_STATUS.SEARCHING,
        bookingMode: 'bidding',
        biddingStatus: 'open',
        driverId: null,
      }).session(session);

      if (!ride) {
        throw new ApiError(409, 'Ride is no longer available for bid acceptance');
      }

      const bid = await RideBid.findOne({
        _id: bidId,
        rideId: ride._id,
        status: 'pending',
      }).session(session);

      if (!bid) {
        throw new ApiError(404, 'Bid not found');
      }

      const driverVehicleFilter = await buildDriverVehicleAcceptFilter(ride);
      const driver = await Driver.findOne({
        _id: bid.driverId,
        isOnline: true,
        isOnRide: false,
        'wallet.isBlocked': { $ne: true },
        ...driverVehicleFilter,
      }).session(session);

      if (!driver) {
        throw new ApiError(409, 'Driver is unavailable to accept this bid');
      }

      const blockedDriverIds = await getDriverIdsBlockedByUpcomingScheduledRides([String(bid.driverId || '')], { session });
      if (blockedDriverIds.has(String(bid.driverId || ''))) {
        throw new ApiError(409, 'Driver is blocked from new rides within 30 minutes of a scheduled trip');
      }

      const conflictingScheduledRide = await findDriverConflictingScheduledRide({
        driverId: String(bid.driverId || ''),
        ride,
        excludeRideId: ride._id,
        session,
      });
      if (conflictingScheduledRide) {
        throw new ApiError(409, 'Driver already has another scheduled trip in a similar time range');
      }

      await ensureDriverWalletCanAcceptRide(driver, { session });

      ride.driverId = driver._id;
      ride.fare = Number(bid.bidFare || ride.fare || 0);
      ride.acceptedBidId = bid._id;
      ride.status = RIDE_STATUS.ACCEPTED;
      ride.liveStatus = RIDE_LIVE_STATUS.ACCEPTED;
      ride.biddingStatus = 'accepted';
      ride.acceptedAt = new Date();
      driver.isOnRide = !isRideScheduledForFuture(ride);
      bid.status = 'accepted';

      await ride.save({ session });
      await driver.save({ session });
      await bid.save({ session });
      await RideBid.updateMany(
        {
          rideId: ride._id,
          _id: { $ne: bid._id },
          status: 'pending',
        },
        { status: 'rejected' },
        { session },
      );

      await session.commitTransaction();
      await syncDeliveryWithRide(ride);

      return ride;
    } catch (error) {
      lastError = error;
      await session.abortTransaction();

      const isTransient =
        typeof error?.hasErrorLabel === 'function' &&
        (error.hasErrorLabel('TransientTransactionError') || error.hasErrorLabel('UnknownTransactionCommitResult'));

      if (!isTransient || attempt === 2) {
        throw error;
      }
    } finally {
      session.endSession();
    }
  }

  throw lastError || new ApiError(500, 'Failed to accept ride bid');
};

/**
 * The driver rates the rider after a completed ride. Once per ride: the claim on the ride is atomic,
 * so a double tap cannot count twice. The rider's average is recomputed in the same update.
 */
export const submitRiderRatingByDriver = async ({ rideId, driverId, rating, comment = '' }) => {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new ApiError(400, 'rating must be an integer between 1 and 5');
  }
  if (comment !== undefined && comment !== null && typeof comment !== 'string') {
    throw new ApiError(400, 'comment must be text');
  }
  const cleanComment = String(comment ?? '').trim();
  if (cleanComment.length > 500) {
    throw new ApiError(400, 'comment must be at most 500 characters');
  }
  if (!mongoose.Types.ObjectId.isValid(String(rideId))) {
    throw new ApiError(404, 'Completed ride not found');
  }

  const claimed = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      driverId,
      status: RIDE_STATUS.COMPLETED,
      'driverFeedback.submittedAt': null,
    },
    {
      $set: {
        driverFeedback: { rating: numericRating, comment: cleanComment, submittedAt: new Date() },
      },
    },
    { returnDocument: 'after' },
  ).select('_id userId').maxTimeMS(8000);

  if (!claimed) {
    const existing = await Ride.findOne({ _id: rideId, driverId, status: RIDE_STATUS.COMPLETED })
      .select('_id')
      .maxTimeMS(8000)
      .lean();
    throw existing
      ? new ApiError(409, 'You already rated this rider for this ride')
      : new ApiError(404, 'Completed ride not found');
  }

  try {
    await User.updateOne(
      { _id: claimed.userId },
      [
        {
          $set: {
            ratingCount: { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] },
            totalRatingScore: { $add: [{ $ifNull: ['$totalRatingScore', 0] }, numericRating] },
          },
        },
        { $set: { rating: { $round: [{ $divide: ['$totalRatingScore', '$ratingCount'] }, 1] } } },
      ],
      { updatePipeline: true },
    ).maxTimeMS(8000);
  } catch (error) {
    // Not counted: release the claim so the driver can submit again.
    await Ride.updateOne({ _id: claimed._id }, { $unset: { driverFeedback: 1 } }).catch(() => null);
    throw error;
  }

  return populateRideRealtime(claimed._id);
};

export const submitRideFeedback = async ({ rideId, userId, rating, comment = '', tipAmount = 0 }) => {
  const numericRating = Number(rating);
  const numericTip = Number(tipAmount || 0);

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

  if (
    tipsEnabled &&
    numericTip > 0 &&
    Number.isFinite(minimumTipAmount) &&
    minimumTipAmount > 0 &&
    numericTip < minimumTipAmount
  ) {
    throw new ApiError(400, `tipAmount must be at least ${minimumTipAmount}`);
  }

  const ride = await Ride.findOne({
    _id: rideId,
    userId,
    status: RIDE_STATUS.COMPLETED,
  }).maxTimeMS(8000);

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const driver = await Driver.findById(ride.driverId).maxTimeMS(8000);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  ride.feedback = {
    rating: numericRating,
    comment: String(comment || '').trim(),
    tipAmount: numericTip,
    submittedAt: new Date(),
  };

  driver.ratingCount = Number(driver.ratingCount || 0) + 1;
  driver.totalRatingScore = Number(driver.totalRatingScore || 0) + numericRating;
  driver.rating = Number((driver.totalRatingScore / driver.ratingCount).toFixed(1));

  await Promise.all([
    ride.save({ maxTimeMS: 8000 }),
    driver.save({ maxTimeMS: 8000 }),
  ]);

  return populateRideRealtime(ride._id);
};
