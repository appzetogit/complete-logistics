import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { SubscriptionPlan } from '../../admin/models/SubscriptionPlan.js';
import { UserWallet } from '../models/UserWallet.js';
import { UserSubscription } from '../models/UserSubscription.js';

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizeBenefitType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'unlimited' ? 'unlimited' : 'limited';
};

const isActiveSubscriptionStatus = (value = '') => String(value || '').trim().toLowerCase() === 'active';

const ensureSubscriptionStatusFresh = async (subscription) => {
  if (!subscription) {
    return null;
  }

  const now = new Date();
  const hasExpired = subscription.expiresAt && new Date(subscription.expiresAt) <= now;
  const noRemainingLimitedRides =
    normalizeBenefitType(subscription.benefit_type) === 'limited' &&
    Number(subscription.ride_limit || 0) > 0 &&
    Number(subscription.rides_used || 0) >= Number(subscription.ride_limit || 0);

  let nextStatus = '';

  if (hasExpired) {
    nextStatus = 'expired';
  } else if (noRemainingLimitedRides) {
    nextStatus = 'consumed';
  }

  if (!nextStatus || subscription.status === nextStatus || subscription.active === false) {
    return subscription;
  }

  subscription.status = nextStatus;
  subscription.active = false;
  await subscription.save();
  return subscription;
};

const buildSubscriptionMetrics = (subscription = {}) => {
  const benefitType = normalizeBenefitType(subscription.benefit_type);
  const rideLimit = Math.max(0, Number(subscription.ride_limit || 0));
  const ridesUsed = Math.max(0, Number(subscription.rides_used || 0));
  const ridesRemaining = benefitType === 'unlimited'
    ? null
    : Math.max(0, rideLimit - ridesUsed);

  return {
    benefitType,
    rideLimit,
    ridesUsed,
    ridesRemaining,
    isUnlimited: benefitType === 'unlimited',
  };
};

export const serializeSubscriptionPlan = (plan = {}) => ({
  id: String(plan._id || plan.id || ''),
  name: String(plan.name || '').trim(),
  description: String(plan.description || '').trim(),
  amount: roundMoney(plan.amount || 0),
  duration: Math.max(0, Number(plan.duration || 0)),
  transport_type: String(plan.transport_type || 'taxi').trim().toLowerCase(),
  vehicle_type_id: plan.vehicle_type_id?._id ? String(plan.vehicle_type_id._id) : (plan.vehicle_type_id ? String(plan.vehicle_type_id) : ''),
  vehicle_type: plan.vehicle_type_id?._id
    ? {
        id: String(plan.vehicle_type_id._id),
        name: String(plan.vehicle_type_id.name || '').trim(),
      }
    : null,
  benefit_type: normalizeBenefitType(plan.benefit_type),
  ride_limit: Math.max(0, Number(plan.ride_limit || 0)),
  how_it_works: String(plan.how_it_works || '').trim(),
  active: plan.active !== false,
  audience: String(plan.audience || 'driver').trim().toLowerCase(),
  createdAt: plan.createdAt || null,
  updatedAt: plan.updatedAt || null,
});

export const serializeUserSubscription = (subscription = {}) => {
  const metrics = buildSubscriptionMetrics(subscription);

  return {
    id: String(subscription._id || subscription.id || ''),
    planId: subscription.planId?._id ? String(subscription.planId._id) : String(subscription.planId || ''),
    name: String(subscription.name || subscription.planId?.name || '').trim(),
    description: String(subscription.description || subscription.planId?.description || '').trim(),
    amount: roundMoney(subscription.amount || subscription.planId?.amount || 0),
    durationDays: Math.max(0, Number(subscription.durationDays || subscription.planId?.duration || 0)),
    transport_type: String(subscription.transport_type || subscription.planId?.transport_type || 'taxi').trim().toLowerCase(),
    vehicle_type_id: subscription.vehicle_type_id?._id
      ? String(subscription.vehicle_type_id._id)
      : subscription.vehicle_type_id
        ? String(subscription.vehicle_type_id)
        : (subscription.planId?.vehicle_type_id?._id ? String(subscription.planId.vehicle_type_id._id) : ''),
    vehicle_type: subscription.vehicle_type_id?._id
      ? {
          id: String(subscription.vehicle_type_id._id),
          name: String(subscription.vehicle_type_id.name || '').trim(),
        }
      : subscription.planId?.vehicle_type_id?._id
        ? {
            id: String(subscription.planId.vehicle_type_id._id),
            name: String(subscription.planId.vehicle_type_id.name || '').trim(),
          }
        : null,
    benefit_type: metrics.benefitType,
    ride_limit: metrics.rideLimit,
    rides_used: metrics.ridesUsed,
    rides_remaining: metrics.ridesRemaining,
    isUnlimited: metrics.isUnlimited,
    status: String(subscription.status || 'active').trim().toLowerCase(),
    active: subscription.active !== false && isActiveSubscriptionStatus(subscription.status),
    purchaseSource: String(subscription.purchaseSource || 'wallet').trim().toLowerCase(),
    purchasedAt: subscription.purchasedAt || null,
    startedAt: subscription.startedAt || null,
    expiresAt: subscription.expiresAt || null,
    lastRideAt: subscription.lastRideAt || null,
    createdAt: subscription.createdAt || null,
    updatedAt: subscription.updatedAt || null,
  };
};

export const listCustomerSubscriptionPlans = async () => {
  const plans = await SubscriptionPlan.find({
    audience: 'user',
    active: true,
  })
    .sort({ amount: 1, createdAt: -1 })
    .populate('vehicle_type_id', 'name')
    .lean();

  return plans.map(serializeSubscriptionPlan);
};

export const listUserSubscriptions = async (userId) => {
  const items = await UserSubscription.find({ userId })
    .sort({ active: -1, expiresAt: 1, createdAt: -1 })
    .populate('planId', 'name description amount duration transport_type vehicle_type_id benefit_type ride_limit')
    .populate('vehicle_type_id', 'name');

  const refreshed = [];
  for (const item of items) {
    refreshed.push(await ensureSubscriptionStatusFresh(item));
  }

  return refreshed.map((item) => serializeUserSubscription(item?.toObject ? item.toObject() : item));
};

export const getUserSubscriptionSummary = async (userId) => {
  const subscriptions = await listUserSubscriptions(userId);
  const activeSubscriptions = subscriptions.filter((item) => item.active);
  const limitedCredits = activeSubscriptions.reduce(
    (sum, item) => sum + (item.isUnlimited ? 0 : Number(item.rides_remaining || 0)),
    0,
  );

  return {
    activeCount: activeSubscriptions.length,
    hasUnlimitedPlan: activeSubscriptions.some((item) => item.isUnlimited),
    availableRideCredits: limitedCredits,
    activePlans: activeSubscriptions,
    history: subscriptions,
  };
};

export const purchaseUserSubscription = async ({ userId, planId, paymentSource = 'wallet' }) => {
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    throw new ApiError(400, 'Valid subscription plan id is required');
  }

  const plan = await SubscriptionPlan.findOne({
    _id: planId,
    audience: 'user',
    active: true,
  }).populate('vehicle_type_id', 'name');

  if (!plan) {
    throw new ApiError(404, 'Subscription plan not found');
  }

  const amount = roundMoney(plan.amount || 0);
  if (amount <= 0) {
    throw new ApiError(400, 'Subscription plan amount must be greater than zero');
  }

  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true },
  );
  const wallet = await UserWallet.findOne({ userId });
  if (!wallet) {
    throw new ApiError(404, 'User wallet not found');
  }

  if (Number(wallet.balance || 0) < amount) {
    throw new ApiError(400, 'Insufficient wallet balance');
  }

  const now = new Date();
  const durationDays = Math.max(0, Number(plan.duration || 0));
  const benefitType = normalizeBenefitType(plan.benefit_type);
  const rideLimit = benefitType === 'unlimited'
    ? 0
    : Math.max(1, Number(plan.ride_limit || 0));
  const expiresAt = durationDays > 0
    ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  wallet.balance = roundMoney(Number(wallet.balance || 0) - amount);
  wallet.transactions.push({
    kind: 'debit',
    amount,
    title: `Subscription purchase: ${plan.name || 'Plan'}`,
    provider: 'user_subscription_wallet',
    providerPaymentId: `sub_${Date.now().toString(36)}_${String(plan._id).slice(-6)}`,
  });
  wallet.transactions = wallet.transactions.slice(-50);

  const subscription = new UserSubscription({
    userId,
    planId: plan._id,
    name: plan.name || '',
    description: plan.description || '',
    amount,
    durationDays,
    transport_type: plan.transport_type || 'taxi',
    vehicle_type_id: plan.vehicle_type_id?._id || plan.vehicle_type_id || null,
    benefit_type: benefitType,
    ride_limit: rideLimit,
    rides_used: 0,
    status: 'active',
    active: true,
    purchaseSource: paymentSource === 'admin' ? 'admin' : 'wallet',
    purchasedAt: now,
    startedAt: now,
    expiresAt,
  });

  await Promise.all([wallet.save(), subscription.save()]);

  return {
    subscription: serializeUserSubscription({
      ...subscription.toObject(),
      vehicle_type_id: plan.vehicle_type_id,
      planId: plan,
    }),
    wallet: {
      balance: roundMoney(wallet.balance || 0),
      refundWallet: roundMoney(wallet.refundWallet || 0),
    },
  };
};

export const resolveApplicableUserSubscription = async ({ userId, vehicleTypeId }) => {
  if (!userId || !vehicleTypeId || !mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
    return null;
  }

  const items = await UserSubscription.find({
    userId,
    vehicle_type_id: vehicleTypeId,
    status: 'active',
    active: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .populate('vehicle_type_id', 'name');

  for (const item of items) {
    const refreshed = await ensureSubscriptionStatusFresh(item);
    if (!refreshed || refreshed.active === false || refreshed.status !== 'active') {
      continue;
    }

    const metrics = buildSubscriptionMetrics(refreshed);
    if (!metrics.isUnlimited && metrics.ridesRemaining <= 0) {
      continue;
    }

    return refreshed;
  }

  return null;
};

export const consumeUserSubscriptionRide = async ({ ride, session = null }) => {
  const subscriptionId = ride?.subscriptionUsage?.subscriptionId;
  const covered = Boolean(ride?.subscriptionUsage?.covered);

  if (!covered || !subscriptionId || !mongoose.Types.ObjectId.isValid(subscriptionId)) {
    return null;
  }

  const subscription = await UserSubscription.findById(subscriptionId).session(session);
  if (!subscription) {
    return null;
  }

  if (ride?.subscriptionUsage?.ridesUsedAfter !== null && ride?.subscriptionUsage?.ridesUsedAfter !== undefined) {
    return null;
  }

  if (normalizeBenefitType(subscription.benefit_type) === 'limited') {
    subscription.rides_used = Math.max(0, Number(subscription.rides_used || 0)) + 1;
  }

  subscription.lastRideAt = ride.completedAt || new Date();
  await ensureSubscriptionStatusFresh(subscription);
  await subscription.save({ session });

  ride.subscriptionUsage.ridesUsedAfter = Math.max(0, Number(subscription.rides_used || 0));
  ride.subscriptionUsage.ridesRemainingAfter =
    normalizeBenefitType(subscription.benefit_type) === 'unlimited'
      ? null
      : Math.max(0, Number(subscription.ride_limit || 0) - Number(subscription.rides_used || 0));

  await ride.save({ session });

  return subscription;
};
