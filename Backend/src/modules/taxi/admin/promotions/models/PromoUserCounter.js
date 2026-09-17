import mongoose from 'mongoose';

const promoUserCounterSchema = new mongoose.Schema(
  {
    promo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPromoCode',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    uses_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    cumulative_discount_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

promoUserCounterSchema.index({ promo_id: 1, user_id: 1 }, { unique: true });

export const PromoUserCounter =
  mongoose.models.TaxiPromoUserCounter || mongoose.model('TaxiPromoUserCounter', promoUserCounterSchema);
