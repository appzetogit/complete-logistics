import mongoose from 'mongoose';

const promoCodeSchema = new mongoose.Schema(
  {
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      required: true,
      index: true,
    },
    service_location_name: {
      type: String,
      default: '',
      trim: true,
    },
    service_location_ids: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TaxiServiceLocation',
        },
      ],
      default: [],
      index: true,
    },
    service_location_names: {
      type: [String],
      default: [],
    },
    user_id: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    user_name: {
      type: String,
      default: '',
      trim: true,
    },
    user_specific: {
      type: Boolean,
      default: false,
      index: true,
    },
    transport_type: {
      type: String,
      enum: ['taxi', 'delivery', 'pooling', 'bus', 'self_drive', 'all'],
      default: 'all',
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
    },
    minimum_trip_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maximum_discount_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cumulative_max_discount_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount_percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    from_date: {
      type: Date,
      required: true,
      index: true,
    },
    to_date: {
      type: Date,
      required: true,
      index: true,
    },
    uses_per_user: {
      type: Number,
      default: 1,
      min: 1,
    },
    max_uses_total: {
      type: Number,
      default: 0,
      min: 0,
    },
    usage_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

promoCodeSchema.index({ service_location_id: 1, transport_type: 1, active: 1, createdAt: -1 });
promoCodeSchema.index({ service_location_ids: 1, transport_type: 1, active: 1, createdAt: -1 });

export const PromoCode = mongoose.models.TaxiPromoCode || mongoose.model('TaxiPromoCode', promoCodeSchema);
