import mongoose from 'mongoose';

const serviceCenterStaffBiometricSchema = new mongoose.Schema(
  {
    fingerCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    displayName: {
      type: String,
      default: '',
      trim: true,
    },
    templateEncrypted: {
      type: String,
      default: '',
      trim: true,
    },
    templateHash: {
      type: String,
      default: '',
      trim: true,
    },
    templateFormat: {
      type: String,
      default: 'vendor-template',
      trim: true,
    },
    source: {
      type: String,
      enum: ['phone_sensor', 'usb_scanner', 'bluetooth_scanner', 'manual', 'unknown'],
      default: 'unknown',
    },
    qualityScore: {
      type: Number,
      default: null,
      min: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    verificationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const serviceCenterStaffSchema = new mongoose.Schema(
  {
    serviceCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceStore',
      required: true,
      index: true,
    },
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
    active: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    approve: {
      type: Boolean,
      default: true,
      index: true,
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
    biometrics: {
      type: [serviceCenterStaffBiometricSchema],
      default: [],
    },
  },
  { timestamps: true },
);

export const ServiceCenterStaff =
  mongoose.models.TaxiServiceCenterStaff ||
  mongoose.model('TaxiServiceCenterStaff', serviceCenterStaffSchema);
