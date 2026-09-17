import mongoose from 'mongoose';

const promoRedemptionSchema = new mongoose.Schema(
  {
    promo_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPromoCode',
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRide',
      required: true,
      index: true,
    },
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      required: true,
      index: true,
    },
    transport_type: {
      type: String,
      enum: ['taxi', 'delivery', 'all'],
      default: 'all',
      trim: true,
      index: true,
    },
    fare_before_discount: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    fare_after_discount: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_percentage_snapshot: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    maximum_discount_amount_snapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    cumulative_max_discount_amount_snapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    uses_per_user_snapshot: {
      type: Number,
      default: 1,
      min: 1,
    },
    max_uses_total_snapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['applied', 'cancelled', 'refunded'],
      default: 'applied',
      index: true,
    },
    idempotency_key: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);

promoRedemptionSchema.index({ promo_id: 1, ride_id: 1 }, { unique: true });
promoRedemptionSchema.index({ promo_id: 1, user_id: 1, status: 1, createdAt: -1 });

export const PromoRedemption =
  mongoose.models.TaxiPromoRedemption || mongoose.model('TaxiPromoRedemption', promoRedemptionSchema);
