import mongoose from "mongoose";

const biometricFingerSchema = new mongoose.Schema(
  {
    fingerCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    displayName: {
      type: String,
      default: "",
      trim: true,
    },
    hand: {
      type: String,
      enum: ["left", "right", "unknown"],
      default: "unknown",
    },
    templateFormat: {
      type: String,
      default: "vendor-template",
      trim: true,
    },
    templateEncrypted: {
      type: String,
      default: "",
      trim: true,
    },
    templateHash: {
      type: String,
      default: "",
      trim: true,
    },
    previewImage: {
      type: String,
      default: "",
      trim: true,
    },
    qualityScore: {
      type: Number,
      default: null,
      min: 0,
    },
    captureSource: {
      type: String,
      enum: ["phone_sensor", "usb_scanner", "bluetooth_scanner", "manual", "unknown"],
      default: "unknown",
    },
    deviceLabel: {
      type: String,
      default: "",
      trim: true,
    },
    scannerSerial: {
      type: String,
      default: "",
      trim: true,
    },
    sampleCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    capturedAt: {
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

const biometricAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    fingerCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    actorRole: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    matchScore: {
      type: Number,
      default: null,
      min: 0,
    },
    verificationStatus: {
      type: String,
      default: "",
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const thumbParticipantSchema = new mongoose.Schema(
  {
    participantKey: {
      type: String,
      required: true,
      trim: true,
    },
    participantType: {
      type: String,
      enum: ["customer", "co_passenger", "employee", "other"],
      default: "customer",
    },
    participantLabel: {
      type: String,
      default: "",
      trim: true,
    },
    userType: {
      type: String,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiUser",
      default: null,
    },
    linkedStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiServiceCenterStaff",
      default: null,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const thumbCaptureSchema = new mongoose.Schema(
  {
    captureId: {
      type: String,
      required: true,
      trim: true,
    },
    participantKey: {
      type: String,
      required: true,
      trim: true,
    },
    participantType: {
      type: String,
      enum: ["customer", "co_passenger", "employee", "other"],
      default: "customer",
    },
    participantLabel: {
      type: String,
      default: "",
      trim: true,
    },
    userType: {
      type: String,
      default: "",
      trim: true,
    },
    thumbCode: {
      type: String,
      enum: ["LEFT_THUMB", "RIGHT_THUMB", "UNKNOWN_THUMB"],
      default: "UNKNOWN_THUMB",
    },
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    fileName: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    captureSource: {
      type: String,
      enum: ["phone_sensor", "usb_scanner", "bluetooth_scanner", "manual", "unknown"],
      default: "unknown",
    },
    deviceLabel: {
      type: String,
      default: "",
      trim: true,
    },
    scannerSerial: {
      type: String,
      default: "",
      trim: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const customerBiometricProfileSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiRentalBookingRequest",
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiUser",
      default: null,
      index: true,
    },
    serviceCenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiServiceStore",
      required: true,
      index: true,
    },
    capturedByStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiServiceCenterStaff",
      default: null,
    },
    enrollmentMode: {
      type: String,
      enum: ["thumbs_only", "optional", "all_ten"],
      default: "thumbs_only",
    },
    requiredFingerCount: {
      type: Number,
      default: 2,
      min: 1,
      max: 10,
    },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed", "verified"],
      default: "not_started",
    },
    consentAccepted: {
      type: Boolean,
      default: false,
    },
    consentAcceptedAt: {
      type: Date,
      default: null,
    },
    consentNotes: {
      type: String,
      default: "",
      trim: true,
    },
    fingers: {
      type: [biometricFingerSchema],
      default: [],
    },
    thumbParticipants: {
      type: [thumbParticipantSchema],
      default: [],
    },
    thumbCaptures: {
      type: [thumbCaptureSchema],
      default: [],
    },
    verificationSummary: {
      lastVerifiedAt: {
        type: Date,
        default: null,
      },
      lastVerificationStatus: {
        type: String,
        default: "",
        trim: true,
      },
      lastVerifiedFingerCode: {
        type: String,
        default: "",
        trim: true,
        uppercase: true,
      },
      lastMatchScore: {
        type: Number,
        default: null,
        min: 0,
      },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    auditLogs: {
      type: [biometricAuditLogSchema],
      default: [],
    },
  },
  { timestamps: true },
);

customerBiometricProfileSchema.index({ serviceCenterId: 1, createdAt: -1 });
customerBiometricProfileSchema.index({ userId: 1, updatedAt: -1 });

export const CustomerBiometricProfile =
  mongoose.models.TaxiCustomerBiometricProfile ||
  mongoose.model("TaxiCustomerBiometricProfile", customerBiometricProfileSchema);
