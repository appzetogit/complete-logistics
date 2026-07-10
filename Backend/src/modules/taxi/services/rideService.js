import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { getOrLoadCachedValue } from '../../../utils/cache.js';
import { normalizePoint, toPoint } from '../../../utils/geo.js';
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
import { applyPromoToRideInTransaction } from './promoService.js';
import { getTipSettings } from './appSettingsService.js';
import { getBidRideSettings } from './transportSettingsService.js';

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
  await activeRide.save();
  await syncDeliveryWithRide(activeRide);

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

const normalizeRidePaymentMethod = (paymentMethod) => (
  !paymentMethod || String(paymentMethod).trim().toLowerCase() === 'cash' ? 'cash' : 'online'
);

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
    .map((item) => (item === 'cash' ? 'cash' : item === 'online' || item === 'wallet' ? 'online' : null))
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
}) => {
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
  const resolvedVehicleIconUrl = String(
    vehicleIconUrl || primaryVehicle?.image || primaryVehicle?.map_icon || primaryVehicle?.icon || '',
  ).trim();
  const normalizedTransportType = normalizeRideTransportType(transport_type);
  const resolvedZoneId =
    zone_id && mongoose.Types.ObjectId.isValid(zone_id)
      ? new mongoose.Types.ObjectId(zone_id)
      : null;
  const resolvedServiceLocationId =
    service_location_id && mongoose.Types.ObjectId.isValid(service_location_id)
      ? new mongoose.Types.ObjectId(service_location_id)
      : null;
  const { pricingRule, allowedPaymentMethods } = await getAllowedRidePaymentMethodsForPricing({
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
  const parcelCommissionFallback =
    normalizedServiceType === 'parcel'
      ? {
          admin_commission_type_from_driver: Number(primaryVehicle?.admin_commission_type_from_driver ?? 1),
          admin_commission_from_driver: Number(primaryVehicle?.admin_commission_from_driver ?? 0),
          admin_commission_type_for_owner: Number(primaryVehicle?.admin_commission_type_for_owner ?? 1),
          admin_commission_for_owner: Number(primaryVehicle?.admin_commission_for_owner ?? 0),
        }
      : null;
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
  const applicableSubscription = primaryVehicleTypeId
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
  const effectiveDriverPaymentCollection = isSubscriptionCovered
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
  const effectivePaymentMethod = isSubscriptionCovered ? 'online' : resolvedRequestedPaymentMethod;
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

  if (isSubscriptionCovered && promoCode) {
    throw new ApiError(400, 'Promo codes cannot be combined with subscription rides');
  }

  if (!promoCode) {
    const ride = await Ride.create({
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

export const getRideDetails = async (rideId) => {
  const ride = await Ride.findById(rideId)
    .populate('deliveryId')
    .populate('userId', 'name phone')
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
    .populate('deliveryId')
    .populate('userId', 'name phone')
    .populate('driverId', 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating');

export const serializeRideRealtime = (ride) => ({
  rideId: String(ride._id),
  room: getRideRoom(ride._id),
  deliveryId: ride.deliveryId?._id ? String(ride.deliveryId._id) : ride.deliveryId ? String(ride.deliveryId) : null,
  type: ride.serviceType || 'ride',
  serviceType: ride.serviceType || 'ride',
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
  otp: ride.otp || '',
  parcel: ride.deliveryId?.parcel || ride.parcel || null,
  intercity: ride.intercity || null,
  commissionAmount: ride.commissionAmount,
  driverEarnings: ride.driverEarnings,
  promo: ride.promo?.code ? ride.promo : null,
  pricingSnapshot: ride.pricingSnapshot
    ? {
        setPriceId: ride.pricingSnapshot.setPriceId || null,
        admin_commission_type_from_driver: Number(ride.pricingSnapshot.admin_commission_type_from_driver ?? 1),
        admin_commission_from_driver: Number(ride.pricingSnapshot.admin_commission_from_driver ?? 0),
        admin_commission_type_for_owner: Number(ride.pricingSnapshot.admin_commission_type_for_owner ?? 1),
        admin_commission_for_owner: Number(ride.pricingSnapshot.admin_commission_for_owner ?? 0),
        waiting_charge: Number(ride.pricingSnapshot.waiting_charge ?? 0),
        free_waiting_before: Number(ride.pricingSnapshot.free_waiting_before ?? 0),
        free_waiting_after: Number(ride.pricingSnapshot.free_waiting_after ?? 0),
        allowed_payment_methods: normalizeAllowedRidePaymentMethods(ride.pricingSnapshot.allowed_payment_methods),
        resolvedAt: ride.pricingSnapshot.resolvedAt || null,
      }
    : null,
  vehicleIconType: ride.vehicleIconType || '',
  vehicleIconUrl: ride.vehicleIconUrl || '',
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
      .populate('userId', 'name phone')
      .populate('driverId', 'name phone profileImage vehicleType vehicleIconType vehicleNumber vehicleColor vehicleMake vehicleModel vehicleImage rating');

    return rides.find((ride) => !isRideScheduledForFuture(ride)) || null;
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
      ? 'name phone profileImage'
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
    otp: ride.otp || '',
    parcel: ride.deliveryId?.parcel || ride.parcel || null,
    intercity: ride.intercity || null,
    pricingSnapshot: ride.pricingSnapshot || null,
    commissionAmount: ride.commissionAmount,
    driverEarnings: ride.driverEarnings,
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

export const acceptRideAssignment = async ({ rideId, driverId }) => {
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

      await ensureDriverWalletCanAcceptRide(driver, { session });

      ride.driverId = driver._id;
      ride.status = RIDE_STATUS.ACCEPTED;
      ride.liveStatus = RIDE_LIVE_STATUS.ACCEPTED;
      ride.acceptedAt = new Date();
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

      if (!isTransient || attempt === 2) {
        throw error;
      }
    } finally {
      session.endSession();
    }
  }

  throw lastError || new ApiError(500, 'Failed to accept ride');
};

const rideStatusConfig = {
  [RIDE_LIVE_STATUS.ACCEPTED]: {
    persistedStatus: RIDE_STATUS.ACCEPTED,
    allowedCurrent: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING],
  },
  [RIDE_LIVE_STATUS.ARRIVING]: {
    persistedStatus: RIDE_STATUS.ACCEPTED,
    allowedCurrent: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING],
  },
  [RIDE_LIVE_STATUS.STARTED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: [RIDE_LIVE_STATUS.ACCEPTED, RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.STARTED],
  },
  [RIDE_LIVE_STATUS.ARRIVED]: {
    persistedStatus: RIDE_STATUS.ONGOING,
    allowedCurrent: [RIDE_LIVE_STATUS.STARTED, RIDE_LIVE_STATUS.ARRIVED],
  },
  [RIDE_LIVE_STATUS.COMPLETED]: {
    persistedStatus: RIDE_STATUS.COMPLETED,
    allowedCurrent: [RIDE_LIVE_STATUS.STARTED, RIDE_LIVE_STATUS.ARRIVED, RIDE_LIVE_STATUS.ARRIVING, RIDE_LIVE_STATUS.ACCEPTED],
  },
};

export const updateRideLifecycle = async ({ rideId, driverId, nextStatus, paymentMethod }) => {
  const config = rideStatusConfig[nextStatus];

  if (!config) {
    throw new ApiError(400, 'Unsupported ride status');
  }

  const ride = await Ride.findOne({ _id: rideId, driverId });

  if (!ride) {
    throw new ApiError(404, 'Assigned ride not found');
  }

  if (!config.allowedCurrent.includes(ride.liveStatus)) {
    throw new ApiError(409, `Ride cannot move from ${ride.liveStatus} to ${nextStatus}`);
  }

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
  }

  if (paymentMethod !== undefined && paymentMethod !== null && String(paymentMethod).trim()) {
    ride.paymentMethod = normalizeRidePaymentMethod(paymentMethod);
  }

  if (nextStatus === RIDE_LIVE_STATUS.COMPLETED) {
    ride.completedAt = new Date();
  }

  await ride.save();
  await syncDeliveryWithRide(ride);

  let walletUpdate = null;

  if (nextStatus === RIDE_LIVE_STATUS.COMPLETED) {
    await Promise.all([
      User.findByIdAndUpdate(ride.userId, { currentRideId: null }),
      Driver.findByIdAndUpdate(driverId, { isOnRide: false }),
    ]);

    walletUpdate = await settleCompletedRideWallet({ rideId: ride._id });
    await consumeUserSubscriptionRide({ ride });
    const settledRide = await Ride.findById(ride._id).select('completedAt driverEarnings estimatedDistanceMeters');

    await incrementDriverTodaySummaryForCompletedRide({
      driverId,
      completedAt: settledRide?.completedAt || ride.completedAt,
      driverEarnings: settledRide?.driverEarnings,
      distanceMeters: settledRide?.estimatedDistanceMeters,
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

export const updateRideDriverLocation = async ({ rideId, driverId, coordinates, heading = null, speed = null }) => {
  const normalizedCoords = normalizePoint(coordinates, 'coordinates');
  const nextDriverLocation = {
    type: 'Point',
    coordinates: normalizedCoords,
    heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
    updatedAt: new Date(),
  };
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
  }).select('name phone profileImage vehicleType vehicleNumber vehicleColor vehicleMake vehicleModel rating');

  if (!driver) {
    throw new ApiError(409, 'Driver is unavailable to bid on this ride');
  }

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
  });

  if (!ride) {
    throw new ApiError(404, 'Completed ride not found');
  }

  if (!ride.driverId) {
    throw new ApiError(409, 'Ride has no assigned driver');
  }

  if (ride.feedback?.submittedAt) {
    throw new ApiError(409, 'Feedback already submitted for this ride');
  }

  const driver = await Driver.findById(ride.driverId);

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

  await Promise.all([ride.save(), driver.save()]);

  return populateRideRealtime(ride._id);
};
