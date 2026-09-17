import mongoose from 'mongoose';

const withdrawalRequestSchema = new mongoose.Schema({
  transactionId: String,
  driver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver' },
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiOwner' },
  amount: Number,
  payment_method: String,
  bank_details_snapshot: {
    accountHolderName: {
      type: String,
      default: '',
      trim: true,
    },
    upiId: {
      type: String,
      default: '',
      trim: true,
    },
    qrCodeImage: {
      type: String,
      default: '',
      trim: true,
    },
    accountNumber: {
      type: String,
      default: '',
      trim: true,
    },
    ifsc: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    branchName: {
      type: String,
      default: '',
      trim: true,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
  },
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending' }
}, { timestamps: true });

export const WithdrawalRequest = mongoose.models.TaxiWithdrawalRequest || mongoose.model('TaxiWithdrawalRequest', withdrawalRequestSchema);
