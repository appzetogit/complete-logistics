import mongoose from 'mongoose';

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiSubscriptionPlan',
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    transport_type: {
      type: String,
      default: 'taxi',
      trim: true,
    },
    vehicle_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiVehicle',
      default: null,
      index: true,
    },
    benefit_type: {
      type: String,
      enum: ['limited', 'unlimited'],
      default: 'limited',
    },
    ride_limit: {
      type: Number,
      default: 0,
      min: 0,
    },
    rides_used: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'consumed'],
      default: 'active',
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    purchaseSource: {
      type: String,
      enum: ['wallet', 'admin'],
      default: 'wallet',
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastRideAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

userSubscriptionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
userSubscriptionSchema.index({ userId: 1, vehicle_type_id: 1, status: 1 });

export const UserSubscription =
  mongoose.models.TaxiUserSubscription || mongoose.model('TaxiUserSubscription', userSubscriptionSchema);
