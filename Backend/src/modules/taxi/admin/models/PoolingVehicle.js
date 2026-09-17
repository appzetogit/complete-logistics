import mongoose from 'mongoose';

const poolingVehicleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleModel: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    driverName: {
      type: String,
      trim: true,
      default: '',
    },
    driverPhone: {
      type: String,
      trim: true,
      default: '',
    },
    approve: {
      type: Boolean,
      default: true,
    },
    color: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    adminCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    ownerCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    serviceTaxPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    vehicleType: {
      type: String,
      enum: ['bike', 'sedan', 'hatchback', 'suv', 'van', 'luxury'],
      default: 'sedan',
    },
    blueprint: {
      type: Object, // JSON layout of seats
      default: {},
    },
    images: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'maintenance'],
      default: 'active',
    },
    poolingEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

poolingVehicleSchema.index({ status: 1 });
poolingVehicleSchema.index({ driverPhone: 1 });
poolingVehicleSchema.index({ approve: 1, status: 1 });

export const PoolingVehicle =
  mongoose.models.TaxiPoolingVehicle ||
  mongoose.model('TaxiPoolingVehicle', poolingVehicleSchema);
