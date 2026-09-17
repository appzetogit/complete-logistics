import mongoose from 'mongoose';
import { RIDE_LIVE_STATUS, RIDE_STATUS } from '../../constants/index.js';

const deliverySchema = new mongoose.Schema(
  {
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRide',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      default: null,
    },
    vehicleTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiVehicle',
      default: null,
    },
    vehicleIconType: {
      type: String,
      default: '',
      trim: true,
    },
    vehicleIconUrl: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(RIDE_STATUS),
      default: RIDE_STATUS.SEARCHING,
    },
    liveStatus: {
      type: String,
      enum: Object.values(RIDE_LIVE_STATUS),
      default: RIDE_LIVE_STATUS.SEARCHING,
    },
    pickupLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    pickupAddress: {
      type: String,
      default: '',
      trim: true,
    },
    dropLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    dropAddress: {
      type: String,
      default: '',
      trim: true,
    },
    fare: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online'],
      default: 'cash',
      lowercase: true,
      trim: true,
    },
    parcel: {
      category: {
        type: String,
        default: '',
        trim: true,
      },
      weight: {
        type: String,
        default: '',
        trim: true,
      },
      description: {
        type: String,
        default: '',
        trim: true,
      },
      deliveryCategory: {
        type: String,
        default: '',
        trim: true,
      },
      goodsTypeFor: {
        type: String,
        default: '',
        trim: true,
      },
      deliveryScope: {
        type: String,
        enum: ['city', 'outstation'],
        default: 'city',
        lowercase: true,
        trim: true,
      },
      isOutstation: {
        type: Boolean,
        default: false,
      },
      senderName: {
        type: String,
        default: '',
        trim: true,
      },
      senderMobile: {
        type: String,
        default: '',
        trim: true,
      },
      receiverName: {
        type: String,
        default: '',
        trim: true,
      },
      receiverMobile: {
        type: String,
        default: '',
        trim: true,
      },
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export const Delivery = mongoose.models.Delivery || mongoose.model('Delivery', deliverySchema);
