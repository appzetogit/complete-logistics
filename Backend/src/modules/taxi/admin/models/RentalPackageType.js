import mongoose from 'mongoose';

const rentalPackageTypeSchema = new mongoose.Schema(
  {
    transport_type: {
      type: String,
      required: true,
      trim: true,
      default: 'taxi',
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

rentalPackageTypeSchema.index({ name: 1, transport_type: 1 });
rentalPackageTypeSchema.index({ transport_type: 1, status: 1 });

export const RentalPackageType =
  mongoose.models.TaxiRentalPackageType || mongoose.model('TaxiRentalPackageType', rentalPackageTypeSchema);
