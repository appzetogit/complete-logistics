import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema(
  {
    instant_referrer_user: { type: String, default: '' },
    instant_referrer_user_and_new_user: { type: String, default: '' },
    conditional_referrer_user_ride_count: { type: String, default: '' },
    conditional_referrer_user_earnings: { type: String, default: '' },
    dual_conditional_referrer_user_and_new_user_ride_count: { type: String, default: '' },
    dual_conditional_referrer_user_and_new_user_earnings: { type: String, default: '' },
    banner_text: { type: String, default: '' },
  },
  { _id: false },
);

const referralTranslationSchema = new mongoose.Schema(
  {
    language_code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    language_name: {
      type: String,
      default: '',
      trim: true,
    },
    user_referral: {
      type: sectionSchema,
      default: () => ({}),
    },
    driver_referral: {
      type: sectionSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

referralTranslationSchema.index({ language_code: 1 }, { unique: true });

export const ReferralTranslation =
  mongoose.models.TaxiReferralTranslation ||
  mongoose.model('TaxiReferralTranslation', referralTranslationSchema);
