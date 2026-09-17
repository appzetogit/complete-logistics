import mongoose from 'mongoose';

const goodsTypeSchema = new mongoose.Schema(
  {
    goods_type_name: {
      type: String,
      required: true,
      trim: true,
    },
    translation_dataset: {
      type: String,
      default: '',
    },
    goods_types_for: {
      type: String,
      default: 'both',
      trim: true,
    },
    company_key: {
      type: String,
      default: null,
    },
    external_id: {
      type: Number,
      default: null,
    },
    active: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      default: 'active',
      trim: true,
    },
    goods_type_translation_words: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    icon: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

goodsTypeSchema.pre('save', function syncName() {
  if (!this.name && this.goods_type_name) {
    this.name = this.goods_type_name;
  }
});

goodsTypeSchema.index({ name: 1 });
goodsTypeSchema.index({ goods_type_for: 1, status: 1 });

export const GoodsType = mongoose.models.TaxiGoodsType || mongoose.model('TaxiGoodsType', goodsTypeSchema);
