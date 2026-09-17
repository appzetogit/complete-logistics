import mongoose from 'mongoose';

const rentalQuoteRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
    },
    vehicleTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRentalVehicleType',
      required: true,
    },
    vehicleName: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleCategory: {
      type: String,
      default: '',
      trim: true,
    },
    contactName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    contactEmail: {
      type: String,
      default: '',
      trim: true,
    },
    requestedHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    pickupDateTime: {
      type: Date,
      default: null,
    },
    returnDateTime: {
      type: Date,
      default: null,
    },
    seatsNeeded: {
      type: Number,
      default: 1,
      min: 1,
    },
    luggageNeeded: {
      type: Number,
      default: 0,
      min: 0,
    },
    pickupLocation: {
      type: String,
      default: '',
      trim: true,
    },
    dropLocation: {
      type: String,
      default: '',
      trim: true,
    },
    specialRequirements: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'quoted', 'rejected'],
      default: 'pending',
    },
    adminQuotedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminNote: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true },
);

rentalQuoteRequestSchema.index({ status: 1, createdAt: -1 });
rentalQuoteRequestSchema.index({ vehicleTypeId: 1, createdAt: -1 });

export const RentalQuoteRequest =
  mongoose.models.TaxiRentalQuoteRequest ||
  mongoose.model('TaxiRentalQuoteRequest', rentalQuoteRequestSchema);
