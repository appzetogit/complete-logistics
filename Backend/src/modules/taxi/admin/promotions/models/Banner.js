import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    image: {
      type: String,
      required: true,
      trim: true,
    },
    link_type: {
      type: String,
      enum: ['external_link', 'deep_link'],
      default: 'external_link',
      trim: true,
    },
    external_link: {
      type: String,
      default: '',
      trim: true,
    },
    deep_link: {
      type: String,
      default: '',
      trim: true,
    },
    redirect_url: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    push_count: {
      type: Number,
      default: 0,
    },
    last_pushed_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

bannerSchema.index({ active: 1, createdAt: -1 });

export const Banner = mongoose.models.TaxiBanner || mongoose.model('TaxiBanner', bannerSchema);
