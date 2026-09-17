import mongoose from 'mongoose';

const safetyAlertLogSchema = new mongoose.Schema(
  {
    actorRole: {
      type: String,
      enum: ['system', 'admin', 'user', 'driver'],
      default: 'system',
    },
    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const safetyAlertSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      enum: ['sos'],
      default: 'sos',
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'resolved'],
      default: 'active',
      lowercase: true,
      trim: true,
      index: true,
    },
    sourceApp: {
      type: String,
      enum: ['user', 'driver'],
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    serviceType: {
      type: String,
      enum: ['ride', 'parcel', 'intercity', 'general'],
      default: 'general',
      lowercase: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      default: null,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRide',
      default: null,
      index: true,
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
      index: true,
    },
    riderName: {
      type: String,
      default: '',
      trim: true,
    },
    riderPhone: {
      type: String,
      default: '',
      trim: true,
    },
    driverName: {
      type: String,
      default: '',
      trim: true,
    },
    driverPhone: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleLabel: {
      type: String,
      default: '',
      trim: true,
    },
    tripCode: {
      type: String,
      default: '',
      trim: true,
    },
    pickupAddress: {
      type: String,
      default: '',
      trim: true,
    },
    dropAddress: {
      type: String,
      default: '',
      trim: true,
    },
    locationLabel: {
      type: String,
      default: '',
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    notes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    logs: {
      type: [safetyAlertLogSchema],
      default: [],
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedByAdminId: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

safetyAlertSchema.index({ createdAt: -1 });
safetyAlertSchema.index({ status: 1, createdAt: -1 });

export const SafetyAlert =
  mongoose.models.TaxiSafetyAlert || mongoose.model('TaxiSafetyAlert', safetyAlertSchema);
