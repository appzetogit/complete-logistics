import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      required: true,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRide',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['ride_earning', 'commission_deduction', 'top_up', 'adjustment'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    cashLimit: {
      type: Number,
      required: true,
    },
    isBlockedAfter: {
      type: Boolean,
      required: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ driverId: 1, createdAt: -1 });

export const WalletTransaction =
  mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', walletTransactionSchema);
