import mongoose from 'mongoose';

const ownerWalletTransactionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    kind: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export const OwnerWalletTransaction = mongoose.model('TaxiOwnerWalletTransaction', ownerWalletTransactionSchema);