import mongoose from 'mongoose';
import { REFERRER_TYPES, REWARD_STATUS } from '../constants.js';

// Ledger of referral payouts. `referenceKey` is unique, so a payout can be created once however many requests race.
const referralRewardSchema = new mongoose.Schema(
  {
    referenceKey: { type: String, required: true, unique: true, trim: true },
    payeeType: { type: String, enum: REFERRER_TYPES, required: true },
    payeeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // who referred whom, for the history screens (payee is one of the two)
    referrerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    referredId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    title: { type: String, default: '', trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: Object.values(REWARD_STATUS), default: REWARD_STATUS.PENDING },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },
    creditedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    // a payout found already in the wallet that was paid before this ledger existed
    legacy: { type: Boolean, default: false },
  },
  { timestamps: true },
);

referralRewardSchema.index({ status: 1, updatedAt: 1 });

export const ReferralReward =
  mongoose.models.TaxiReferralReward || mongoose.model('TaxiReferralReward', referralRewardSchema);
