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
    /// Seating capacity, in seats. Passenger side only — the goods flow reads
    /// `load_capacity_ton` instead, because reusing one number for both meant
    /// a parcel bike advertised itself as '73 Ton'.
    capacity: {
      type: Number,
      default: 0,
    },
    /// Load capacity in tonnes, shown on the goods vehicle card as 'X Ton'.
    /// Fractional values are allowed so sub-tonne vehicles (parcel bikes,
    /// small carriers) can be described honestly.
    load_capacity_ton: {
      type: Number,
      default: 0,
      min: 0,
    },
    /// Optional free-text override for the load figure when a single number
    /// will not do, e.g. '9 Ton - 16 Ton'. Wins over `load_capacity_ton` when
    /// set.
    capacity_label: {
      type: String,
      default: '',
      trim: true,
    },
    /// Body heights this vehicle can be booked with, e.g. 6ft / 6.5ft / 7ft.
    /// The rider picks exactly one on the vehicle options screen; `price` is
    /// added to the fare, so a taller body can cost more.
    load_height_options: {
      type: [
        {
          _id: false,
          /// Stable identifier the apps send back, e.g. '6_5ft'.
          key: { type: String, required: true, trim: true },
          /// What the rider sees on the chip, e.g. '6.5 ft'.
          label: { type: String, required: true, trim: true },
          height_ft: { type: Number, default: 0, min: 0 },
          price: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    /// Optional add-ons the rider can tick, e.g. Extra Tirpal, Helper Required.
    /// Each carries its own charge; leave `price` at 0 for ones that only tell
    /// the driver what to bring.
    extra_options: {
      type: [
        {
          _id: false,
          key: { type: String, required: true, trim: true },
          label: { type: String, required: true, trim: true },
          price: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    /// Headline '₹X/km' rate shown on the vehicle card. Kept separate from
    /// delivery_distance_pricing.distance_price so marketing can advertise a
    /// 'from' rate without touching the fare engine.
    price_per_km: {
      type: Number,
      default: 0,
      min: 0,
    },
    /// Typical pickup ETA in minutes, and the position the vehicle takes in
    /// its list. Held per module because a `transport_type: 'both'` vehicle is
    /// a different proposition on each screen — a car may be 4 minutes away for
    /// a ride and 15 for a parcel run, and belong near the top of one list and
    /// the bottom of the other.
    ///
    /// `sequence` sorts ascending; 0 means "unset" and sinks to the bottom.
    taxi_eta_minutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxi_sequence: {
      type: Number,
      default: 0,
      min: 0,
    },
    delivery_eta_minutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    delivery_sequence: {
      type: Number,
      default: 0,
      min: 0,
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
