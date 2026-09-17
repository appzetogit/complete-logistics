import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const VEHICLE_ICON_TYPES = [
  'car',
  'bike',
  'auto',
  'truck',
  'ehcb',
  'HCV',
  'LCV',
  'MCV',
  'Luxary',
  'premium',
  'suv',
];

const VEHICLE_CATEGORIES = [
  '',
  'bike',
  'car',
  'auto',
];

const DELIVERY_CATEGORY_TYPES = [
  '',
  'trucks',
  '2wheeler',
  'movers',
];

const DELIVERY_DISTANCE_PRICING_DEFAULTS = {
  enabled: false,
  base_price: 0,
  free_distance: 0,
  distance_price: 0,
  free_time: 0,
  time_price: 0,
};

const vehicleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    short_description: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    transport_type: {
      type: String,
      enum: ['taxi', 'delivery', 'pooling', 'both'],
      required: true,
      trim: true,
    },
    dispatch_type: {
      type: String,
      enum: ['normal', 'bidding', 'both'],
      default: 'normal',
      trim: true,
    },
    icon_types: {
      type: String,
      enum: VEHICLE_ICON_TYPES,
      default: 'car',
      trim: true,
    },
    category: {
      type: String,
      enum: VEHICLE_CATEGORIES,
      default: '',
      trim: true,
    },
    capacity: {
      type: Number,
      default: 0,
    },
    size: {
      type: String,
      default: '',
    },
    is_taxi: {
      type: String,
      enum: ['taxi', 'delivery', 'pooling', 'both'],
      default: 'taxi',
    },
    is_accept_share_ride: {
      type: Number,
      enum: [0, 1],
      default: 0,
    },
    delivery_category: {
      type: String,
      enum: DELIVERY_CATEGORY_TYPES,
      default: '',
      trim: true,
    },
    delivery_distance_pricing: {
      enabled: {
        type: Boolean,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.enabled,
      },
      base_price: {
        type: Number,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.base_price,
      },
      free_distance: {
        type: Number,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.free_distance,
      },
      distance_price: {
        type: Number,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.distance_price,
      },
      free_time: {
        type: Number,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.free_time,
      },
      time_price: {
        type: Number,
        default: DELIVERY_DISTANCE_PRICING_DEFAULTS.time_price,
      },
    },
    service_tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    admin_commission_type_from_driver: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
    admin_commission_from_driver: {
      type: Number,
      default: 0,
      min: 0,
    },
    admin_commission_type_for_owner: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
    admin_commission_for_owner: {
      type: Number,
      default: 0,
      min: 0,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    icon: {
      type: String,
      default: '',
      trim: true,
    },
    map_icon: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: Number,
      enum: [0, 1],
      default: 1,
    },
    active: {
      type: Boolean,
      default: true,
    },
    supported_other_vehicle_types: {
      type: [ObjectId],
      ref: 'TaxiVehicle',
      default: [],
    },
    vehicle_preference: {
      type: [ObjectId],
      ref: 'TaxiPreference',
      default: [],
    },
  },
  { timestamps: true },
);

vehicleSchema.pre('save', function syncActiveStatus() {
  if (this.isModified('status')) {
    this.active = this.status === 1;
  } else if (this.isModified('active')) {
    this.status = this.active ? 1 : 0;
  }
});

vehicleSchema.index({ name: 1 });
vehicleSchema.index({ transport_type: 1, status: 1 });

export const Vehicle = mongoose.models.TaxiVehicle || mongoose.model('TaxiVehicle', vehicleSchema);
