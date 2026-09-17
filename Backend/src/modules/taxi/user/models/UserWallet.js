import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    counterpartyPhone: {
      type: String,
      default: '',
      trim: true,
    },
    provider: {
      type: String,
      default: '',
      trim: true,
    },
    providerOrderId: {
      type: String,
      default: '',
      trim: true,
    },
    providerPaymentId: {
      type: String,
      default: '',
      trim: true,
    },
    referenceKey: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: true, timestamps: true },
);

const userWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    refundWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactions: {
      type: [walletTransactionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

userWalletSchema.index({ userId: 1 }, { unique: true });

export const UserWallet = mongoose.models.TaxiUserWallet || mongoose.model('TaxiUserWallet', userWalletSchema);
