import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    // hold / release: money reserved for a wallet ride and given back (they move balance <-> heldBalance)
    kind: {
      type: String,
      enum: ['credit', 'debit', 'hold', 'release'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Which amount the entry moved: the spendable `balance` (default) or `refundWallet` (refund credits).
    walletField: {
      type: String,
      enum: ['balance', 'refundWallet'],
      default: 'balance',
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
    // Reserved for wallet rides in progress; already taken out of `balance` (balance = what can be spent).
    heldBalance: {
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
