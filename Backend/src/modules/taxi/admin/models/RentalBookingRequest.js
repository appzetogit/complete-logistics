import mongoose from 'mongoose';

const rentalTrackingHistorySchema = new mongoose.Schema(
  {
    coordinates: {
      type: [Number],
      default: [],
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    heading: {
      type: Number,
      default: null,
    },
    speed: {
      type: Number,
      default: null,
    },
    accuracyMeters: {
      type: Number,
      default: null,
    },
    zoneStatus: {
      type: String,
      default: 'unknown',
      trim: true,
    },
  },
  { _id: false },
);

const rentalTrackingAlertSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      default: '',
      trim: true,
    },
    severity: {
      type: String,
      default: 'warning',
      trim: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const rentalTrackingPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(value) {
          return (
            Array.isArray(value) &&
            value.length === 2 &&
            value.every((coordinate) => Number.isFinite(Number(coordinate)))
          );
        },
        message: 'rentalTracking.currentLocation.coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
);

const inspectionPhotoMetadataSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      default: '',
      trim: true,
    },
    fileName: {
      type: String,
      default: '',
      trim: true,
    },
    mimeType: {
      type: String,
      default: '',
      trim: true,
    },
    deviceModel: {
      type: String,
      default: '',
      trim: true,
    },
    watermarkText: {
      type: String,
      default: '',
      trim: true,
    },
    exif: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const rentalBookingRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      default: null,
    },
    bookingReference: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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
    vehicleImage: {
      type: String,
      default: '',
      trim: true,
    },
    selectedPackage: {
      packageId: {
        type: String,
        default: '',
        trim: true,
      },
      label: {
        type: String,
        default: '',
        trim: true,
      },
      durationHours: {
        type: Number,
        default: 0,
        min: 0,
      },
      price: {
        type: Number,
        default: 0,
        min: 0,
      },
      extraHourPrice: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    serviceLocation: {
      locationId: {
        type: String,
        default: '',
        trim: true,
      },
      name: {
        type: String,
        default: '',
        trim: true,
      },
      address: {
        type: String,
        default: '',
        trim: true,
      },
      city: {
        type: String,
        default: '',
        trim: true,
      },
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      distanceKm: {
        type: Number,
        default: null,
      },
    },
    pickupDateTime: {
      type: Date,
      required: true,
    },
    returnDateTime: {
      type: Date,
      required: true,
    },
    requestedHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    payableNow: {
      type: Number,
      default: 0,
      min: 0,
    },
    advancePaymentLabel: {
      type: String,
      default: '',
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'not_required', 'failed'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      default: '',
      trim: true,
    },
    paymentMethodLabel: {
      type: String,
      default: '',
      trim: true,
    },
    payment: {
      provider: {
        type: String,
        default: '',
        trim: true,
      },
      status: {
        type: String,
        default: '',
        trim: true,
      },
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      currency: {
        type: String,
        default: 'INR',
        trim: true,
      },
      orderId: {
        type: String,
        default: '',
        trim: true,
      },
      paymentId: {
        type: String,
        default: '',
        trim: true,
      },
      signature: {
        type: String,
        default: '',
        trim: true,
      },
    },
    contactName: {
      type: String,
      default: '',
      trim: true,
    },
    contactPhone: {
      type: String,
      default: '',
      trim: true,
    },
    contactEmail: {
      type: String,
      default: '',
      trim: true,
    },
    kycCompleted: {
      type: Boolean,
      default: false,
    },
    kycDocuments: {
      drivingLicense: {
        imageUrl: {
          type: String,
          default: '',
          trim: true,
        },
        fileName: {
          type: String,
          default: '',
          trim: true,
        },
        uploadedAt: {
          type: Date,
          default: null,
        },
      },
      aadhaarCard: {
        imageUrl: {
          type: String,
          default: '',
          trim: true,
        },
        fileName: {
          type: String,
          default: '',
          trim: true,
        },
        uploadedAt: {
          type: Date,
          default: null,
        },
      },
    },
    assignedVehicle: {
      vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiRentalVehicleType',
        default: null,
      },
      name: {
        type: String,
        default: '',
        trim: true,
      },
      vehicleCategory: {
        type: String,
        default: '',
        trim: true,
      },
      image: {
        type: String,
        default: '',
        trim: true,
      },
    },
    rentalInspection: {
      beforeHandover: {
        exteriorOk: { type: Boolean, default: false },
        interiorOk: { type: Boolean, default: false },
        dashboardOk: { type: Boolean, default: false },
        tyresOk: { type: Boolean, default: false },
        fuelOk: { type: Boolean, default: false },
        documentsOk: { type: Boolean, default: false },
      },
      afterReturn: {
        exteriorChecked: { type: Boolean, default: false },
        interiorChecked: { type: Boolean, default: false },
        dashboardChecked: { type: Boolean, default: false },
        fuelChecked: { type: Boolean, default: false },
        tyresChecked: { type: Boolean, default: false },
        damageReviewed: { type: Boolean, default: false },
      },
      pickupNotes: {
        type: String,
        default: '',
        trim: true,
      },
      returnNotes: {
        type: String,
        default: '',
        trim: true,
      },
      pickupMeterReading: {
        type: Number,
        default: null,
        min: 0,
      },
      returnMeterReading: {
        type: Number,
        default: null,
        min: 0,
      },
      pickupFuelLevel: {
        type: String,
        default: '',
        trim: true,
      },
      returnFuelLevel: {
        type: String,
        default: '',
        trim: true,
      },
      beforeConditionImages: {
        type: [String],
        default: [],
      },
      afterConditionImages: {
        type: [String],
        default: [],
      },
      beforeConditionImageDetails: {
        type: [inspectionPhotoMetadataSchema],
        default: [],
      },
      afterConditionImageDetails: {
        type: [inspectionPhotoMetadataSchema],
        default: [],
      },
    },
    serviceCenterIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'TaxiServiceStore',
      default: [],
    },
    commissionSnapshot: {
      serviceStoreId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiServiceStore',
        default: null,
      },
      serviceStoreName: {
        type: String,
        default: '',
        trim: true,
      },
      ownerName: {
        type: String,
        default: '',
        trim: true,
      },
      serviceStoreCommissionType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
      },
      serviceStoreCommissionValue: {
        type: Number,
        default: 0,
        min: 0,
      },
      ownerCommissionType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage',
      },
      ownerCommissionValue: {
        type: Number,
        default: 0,
        min: 0,
      },
      serviceTaxPercentage: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    assignedStaffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceCenterStaff',
      default: null,
    },
    assignedStaffName: {
      type: String,
      default: '',
      trim: true,
    },
    assignedStaffPhone: {
      type: String,
      default: '',
      trim: true,
    },
    serviceCenterNote: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'assigned', 'end_requested', 'completed', 'cancelled'],
      default: 'pending',
    },
    assignedAt: {
      type: Date,
      default: null,
    },
    completionRequestedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    finalCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalElapsedMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelReason: {
      type: String,
      default: '',
      trim: true,
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
    rentalTracking: {
      trackingStatus: {
        type: String,
        enum: ['inactive', 'active', 'location_off', 'tracking_stopped'],
        default: 'inactive',
      },
      zoneStatus: {
        type: String,
        enum: ['inside', 'outside', 'unknown'],
        default: 'unknown',
      },
      currentLocation: {
        type: rentalTrackingPointSchema,
        default: undefined,
      },
      lastLocationAt: {
        type: Date,
        default: null,
      },
      lastClientTimestamp: {
        type: Date,
        default: null,
      },
      lastHeading: {
        type: Number,
        default: null,
      },
      lastSpeed: {
        type: Number,
        default: null,
      },
      lastAccuracyMeters: {
        type: Number,
        default: null,
      },
      matchedZoneName: {
        type: String,
        default: '',
        trim: true,
      },
      distanceFromHubMeters: {
        type: Number,
        default: null,
      },
      geofenceRadiusMeters: {
        type: Number,
        default: null,
      },
      hubName: {
        type: String,
        default: '',
        trim: true,
      },
      history: {
        type: [rentalTrackingHistorySchema],
        default: [],
      },
      alerts: {
        type: [rentalTrackingAlertSchema],
        default: [],
      },
    },
  },
  { timestamps: true },
);

rentalBookingRequestSchema.index({ status: 1, createdAt: -1 });
rentalBookingRequestSchema.index({ userId: 1, createdAt: -1 });
rentalBookingRequestSchema.index({ vehicleTypeId: 1, createdAt: -1 });
rentalBookingRequestSchema.index({ 'rentalTracking.currentLocation': '2dsphere' });

export const RentalBookingRequest =
  mongoose.models.TaxiRentalBookingRequest ||
  mongoose.model('TaxiRentalBookingRequest', rentalBookingRequestSchema);
