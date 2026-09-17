import mongoose from 'mongoose';

const busSeatCellSchema = new mongoose.Schema(
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

const busStopSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      default: '',
      trim: true,
    },
    pointName: {
      type: String,
      default: '',
      trim: true,
    },
    stopType: {
      type: String,
      enum: ['pickup', 'drop', 'both'],
      default: 'pickup',
    },
    arrivalTime: {
      type: String,
      default: '',
      trim: true,
    },
    departureTime: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const busRoutePointSchema = new mongoose.Schema(
  {
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const busLiveTrackingPointSchema = new mongoose.Schema(
  {
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
    recordedAt: {
      type: Date,
      default: null,
    },
    accuracyMeters: {
      type: Number,
      default: null,
    },
    heading: {
      type: Number,
      default: null,
    },
    speedKmph: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const busLiveTrackingSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['idle', 'in_progress', 'paused', 'completed'],
      default: 'idle',
    },
    scheduleId: {
      type: String,
      default: '',
      trim: true,
    },
    travelDate: {
      type: String,
      default: '',
      trim: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
    currentLocation: {
      type: busLiveTrackingPointSchema,
      default: null,
    },
    recentPath: {
      type: [busLiveTrackingPointSchema],
      default: [],
    },
    totalDistanceKm: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const busDeckLayoutConfigSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    rows: {
      type: Number,
      default: 0,
    },
    leftSeats: {
      type: Number,
      default: 0,
    },
    rightSeats: {
      type: Number,
      default: 0,
    },
    seatType: {
      type: String,
      enum: ['seat', 'sleeper'],
      default: 'seat',
    },
  },
  { _id: false },
);

const busScheduleSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    departureTime: {
      type: String,
      default: '',
      trim: true,
    },
    arrivalTime: {
      type: String,
      default: '',
      trim: true,
    },
    activeDays: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'draft'],
      default: 'active',
    },
  },
  { _id: false },
);

const busCancellationRuleSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      default: '',
      trim: true,
    },
    hoursBeforeDeparture: {
      type: Number,
      default: 0,
    },
    refundType: {
      type: String,
      enum: ['percentage', 'fixed', 'none'],
      default: 'percentage',
    },
    refundValue: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const busReviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    reviewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const busServiceSchema = new mongoose.Schema(
  {
    operatorName: {
      type: String,
      required: true,
      trim: true,
    },
    busName: {
      type: String,
      required: true,
      trim: true,
    },
    serviceNumber: {
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
    busDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusDriver',
      default: null,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      default: null,
      index: true,
    },
    ownerDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
      index: true,
    },
    coachType: {
      type: String,
      default: 'AC Sleeper',
      trim: true,
    },
    busCategory: {
      type: String,
      default: 'Sleeper',
      trim: true,
    },
    registrationNumber: {
      type: String,
      default: '',
      trim: true,
    },
    busColor: {
      type: String,
      default: '#1f2937',
      trim: true,
    },
    seatPrice: {
      type: Number,
      default: 0,
    },
    adminCommissionPercentage: {
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
    fareCurrency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },
    variantPricing: {
      seat: {
        type: Number,
        default: 0,
      },
      window: {
        type: Number,
        default: 0,
      },
      aisle: {
        type: Number,
        default: 0,
      },
      sleeper: {
        type: Number,
        default: 0,
      },
    },
    boardingPolicy: {
      type: String,
      default: '',
      trim: true,
    },
    cancellationPolicy: {
      type: String,
      default: '',
      trim: true,
    },
    cancellationRules: {
      type: [busCancellationRuleSchema],
      default: [],
    },
    luggagePolicy: {
      type: String,
      default: '',
      trim: true,
    },
    amenities: {
      type: [String],
      default: [],
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
    blueprint: {
      templateKey: {
        type: String,
        default: 'seater_2_2',
        trim: true,
      },
      layoutConfig: {
        lower: {
          type: busDeckLayoutConfigSchema,
          default: () => ({}),
        },
        upper: {
          type: busDeckLayoutConfigSchema,
          default: () => ({}),
        },
      },
      lowerDeck: {
        type: [[busSeatCellSchema]],
        default: [],
      },
      upperDeck: {
        type: [[busSeatCellSchema]],
        default: [],
      },
    },
    route: {
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
      originCoords: {
        type: busRoutePointSchema,
        default: null,
      },
      destinationCoords: {
        type: busRoutePointSchema,
        default: null,
      },
      distanceKm: {
        type: String,
        default: '',
        trim: true,
      },
      durationHours: {
        type: String,
        default: '',
        trim: true,
      },
      stops: {
        type: [busStopSchema],
        default: [],
      },
    },
    returnRouteEnabled: {
      type: Boolean,
      default: false,
    },
    returnRoute: {
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
      originCoords: {
        type: busRoutePointSchema,
        default: null,
      },
      destinationCoords: {
        type: busRoutePointSchema,
        default: null,
      },
      distanceKm: {
        type: String,
        default: '',
        trim: true,
      },
      durationHours: {
        type: String,
        default: '',
        trim: true,
      },
      stops: {
        type: [busStopSchema],
        default: [],
      },
    },
    schedules: {
      type: [busScheduleSchema],
      default: [],
    },
    liveTracking: {
      type: busLiveTrackingSchema,
      default: () => ({}),
    },
    capacity: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRatingScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviews: {
      type: [busReviewSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      default: 'draft',
    },
  },
  { timestamps: true },
);

busServiceSchema.index({ operatorName: 1, busName: 1 });
busServiceSchema.index({ serviceNumber: 1 });
busServiceSchema.index({ 'route.originCity': 1, 'route.destinationCity': 1, status: 1 });
busServiceSchema.index({ ownerId: 1, createdAt: -1 });

export const BusService =
  mongoose.models.TaxiBusService || mongoose.model('TaxiBusService', busServiceSchema);
