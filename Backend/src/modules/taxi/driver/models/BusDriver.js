import mongoose from 'mongoose';

const busDriverSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    approve: {
      type: Boolean,
      default: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'blocked'],
      default: 'approved',
      index: true,
    },
    assignedBusServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      default: null,
      index: true,
    },
    operatorName: {
      type: String,
      default: '',
      trim: true,
    },
    busName: {
      type: String,
      default: '',
      trim: true,
    },
    serviceNumber: {
      type: String,
      default: '',
      trim: true,
    },
    registrationNumber: {
      type: String,
      default: '',
      trim: true,
    },
    routeName: {
      type: String,
      default: '',
      trim: true,
    },
    originCity: {
      type: String,
      default: '',
      trim: true,
    },
    destinationCity: {
      type: String,
      default: '',
      trim: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    fcmTokenWeb: {
      type: String,
      default: '',
      trim: true,
    },
    fcmTokenMobile: {
      type: String,
      default: '',
      trim: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    signupSource: {
      type: String,
      enum: ['admin', 'self_signup'],
      default: 'admin',
    },
    onboarding: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

export const BusDriver =
  mongoose.models.TaxiBusDriver || mongoose.model('TaxiBusDriver', busDriverSchema);
