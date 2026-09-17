import mongoose from 'mongoose';

const poolingStopSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
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
    landmark: {
      type: String,
      default: '',
      trim: true,
    },
    stopType: {
      type: String,
      enum: ['pickup', 'drop', 'both', 'stop'],
      default: 'stop',
    },
    sequence: {
      type: Number,
      default: 1,
      min: 1,
    },
    etaMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const poolingScheduleSchema = new mongoose.Schema(
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

const poolingRouteSchema = new mongoose.Schema(
  {
    routeName: {
      type: String,
      required: true,
      trim: true,
    },
    routeCode: {
      type: String,
      default: '',
      trim: true,
    },
    originLabel: {
      type: String,
      required: true,
      trim: true,
    },
    destinationLabel: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    assignedVehicleTypeIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'TaxiPoolingVehicle',
      default: [],
    },
    pickupPoints: {
      type: [poolingStopSchema],
      default: [],
    },
    dropPoints: {
      type: [poolingStopSchema],
      default: [],
    },
    stops: {
      type: [poolingStopSchema],
      default: [],
    },
    schedules: {
      type: [poolingScheduleSchema],
      default: [],
    },
    farePerSeat: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxSeatsPerBooking: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxAdvanceBookingHours: {
      type: Number,
      default: 24,
      min: 0,
    },
    boardingBufferMinutes: {
      type: Number,
      default: 15,
      min: 0,
    },
    poolingRules: {
      allowInstantBooking: {
        type: Boolean,
        default: true,
      },
      allowLuggage: {
        type: Boolean,
        default: true,
      },
      womenOnly: {
        type: Boolean,
        default: false,
      },
      autoAssignNearestPickup: {
        type: Boolean,
        default: true,
      },
      maxDetourKm: {
        type: Number,
        default: 5,
        min: 0,
      },
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'paused'],
      default: 'draft',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

poolingRouteSchema.index({ routeName: 1, originLabel: 1, destinationLabel: 1 });
poolingRouteSchema.index({ status: 1, active: 1 });

export const PoolingRoute =
  mongoose.models.TaxiPoolingRoute ||
  mongoose.model('TaxiPoolingRoute', poolingRouteSchema);
