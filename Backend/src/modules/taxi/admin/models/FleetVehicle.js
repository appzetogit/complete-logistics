import mongoose from 'mongoose';

const fleetVehicleSchema = new mongoose.Schema(
  {
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
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
      default: 'taxi',
      trim: true,
      index: true,
    },
    vehicle_type_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiVehicle',
      default: null,
      index: true,
    },
    car_brand: {
      type: String,
      required: true,
      trim: true,
    },
    car_model: {
      type: String,
      required: true,
      trim: true,
    },
    license_plate_number: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    car_color: {
      type: String,
      required: true,
      trim: true,
    },
    documents: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      trim: true,
      index: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

fleetVehicleSchema.index({ owner_id: 1, license_plate_number: 1 }, { unique: true });

export const FleetVehicle =
  mongoose.models.TaxiFleetVehicle || mongoose.model('TaxiFleetVehicle', fleetVehicleSchema);

