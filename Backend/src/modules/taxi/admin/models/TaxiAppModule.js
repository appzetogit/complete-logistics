import mongoose from 'mongoose';

const taxiAppModuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    transport_type: {
      type: String, // taxi, delivery
      required: true,
    },
    service_type: {
      type: String, // normal, rental, outstation, pooling
      required: true,
    },
    icon_types_for: {
      type: String,
      default: null,
    },
    order_by: {
      type: Number,
      default: 1,
    },
    short_description: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    mobile_menu_icon: {
      type: String,
      default: '',
    },
    mobile_menu_cover_image: {
      type: String,
      default: null,
    },
    active: {
      type: Number, // 1 for active, 0 for inactive
      default: 1,
    },
    company_key: {
      type: String,
      default: null,
    }
  },
  {
    timestamps: true,
  }
);

export const TaxiAppModule = mongoose.models.TaxiAppModule || mongoose.model('TaxiAppModule', taxiAppModuleSchema);
