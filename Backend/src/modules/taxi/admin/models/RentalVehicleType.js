import mongoose from 'mongoose';

const rentalVehicleSeatCellSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ['seat', 'aisle'],
      default: 'seat',
    },
    id: {
      type: String,
      default: '',
      trim: true,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    variant: {
      type: String,
      default: 'seat',
      trim: true,
    },
    status: {
      type: String,
      enum: ['available', 'blocked'],
      default: 'available',
    },
  },
  { _id: false },
);

const rentalVehiclePricingSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    durationHours: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    includedKm: {
      type: Number,
      default: 0,
      min: 0,
    },
    extraHourPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    extraKmPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const rentalVehicleAdvancePaymentSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    paymentMode: {
      type: String,
      enum: ['full', 'percentage', 'fixed'],
      default: 'percentage',
    },
    amount: {
      type: Number,
      default: 20,
      min: 0,
    },
    label: {
      type: String,
      default: 'Advance booking payment',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const rentalVehicleTypeSchema = new mongoose.Schema(
  {
    transport_type: {
      type: String,
      default: 'rental',
      trim: true,
    },
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
    vehicleCategory: {
      type: String,
      default: 'Car',
      trim: true,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    coverImage: {
      type: String,
      default: '',
      trim: true,
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    map_icon: {
      type: String,
      default: '',
      trim: true,
    },
    capacity: {
      type: Number,
      default: 4,
      min: 1,
    },
    luggageCapacity: {
      type: Number,
      default: 0,
      min: 0,
    },
    amenities: {
      type: [String],
      default: [],
    },
    serviceStoreIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'TaxiServiceStore',
      default: [],
    },
    poolingEnabled: {
      type: Boolean,
      default: false,
    },
    blueprint: {
      templateKey: {
        type: String,
        default: 'compact_4',
        trim: true,
      },
      lowerDeck: {
        type: [[rentalVehicleSeatCellSchema]],
        default: [],
      },
      upperDeck: {
        type: [[rentalVehicleSeatCellSchema]],
        default: [],
      },
    },
    pricing: {
      type: [rentalVehiclePricingSchema],
      default: [],
    },
    advancePayment: {
      type: rentalVehicleAdvancePaymentSchema,
      default: () => ({
        enabled: false,
        paymentMode: 'percentage',
        amount: 20,
        label: 'Advance booking payment',
        notes: '',
      }),
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

rentalVehicleTypeSchema.index({ name: 1, transport_type: 1 });
rentalVehicleTypeSchema.index({ status: 1, active: 1 });

export const RentalVehicleType =
  mongoose.models.TaxiRentalVehicleType ||
  mongoose.model('TaxiRentalVehicleType', rentalVehicleTypeSchema);
