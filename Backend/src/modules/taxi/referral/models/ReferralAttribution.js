import mongoose from 'mongoose';
import { ATTRIBUTION_STATUS, REFERRER_TYPES } from '../constants.js';

// One row per opened referral link. The raw token is shown to the visitor once; only its hash is stored.
const referralAttributionSchema = new mongoose.Schema(
  {
    referralCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    referrerType: { type: String, enum: REFERRER_TYPES, required: true },
    referrerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: Object.values(ATTRIBUTION_STATUS),
      default: ATTRIBUTION_STATUS.CLICKED,
      index: true,
    },
    clickedAt: { type: Date, default: Date.now },
    claimedAt: { type: Date, default: null },
    attributedAt: { type: Date, default: null },
    convertedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, index: true },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referredDriverId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // the person it was used for: a driver onboarding session, and the phone they signed up with
    registrationId: { type: String, default: '', trim: true },
    referredPhone: { type: String, default: '', trim: true },
    failureReason: { type: String, default: '', trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

referralAttributionSchema.index({ referrerType: 1, referrerId: 1, status: 1 });

export const ReferralAttribution =
  mongoose.models.TaxiReferralAttribution || mongoose.model('TaxiReferralAttribution', referralAttributionSchema);
