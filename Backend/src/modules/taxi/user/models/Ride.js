import mongoose from 'mongoose';
import { RIDE_LIVE_STATUS, RIDE_STATUS } from '../../constants/index.js';

const rideMessageSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: ['user', 'driver'],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const rideSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
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
    dispatchVehicleTypeIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'TaxiVehicle',
        },
      ],
      default: [],
    },
    dispatchTracking: {
      notifiedDriverIds: {
        type: [String],
        default: [],
      },
      rejectedDriverIds: {
        type: [String],
        default: [],
      },
      lastDispatchAttemptAt: {
        type: Date,
        default: null,
      },
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
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
    },
    serviceType: {
      type: String,
      enum: ['ride', 'parcel', 'intercity'],
      default: 'ride',
      lowercase: true,
      trim: true,
    },
    intercity: {
      bookingId: {
        type: String,
        default: '',
        trim: true,
      },
      fromCity: {
        type: String,
        default: '',
        trim: true,
      },
      toCity: {
        type: String,
        default: '',
        trim: true,
      },
      tripType: {
        type: String,
        default: '',
        trim: true,
      },
      travelDate: {
        type: String,
        default: '',
        trim: true,
      },
      passengers: {
        type: Number,
        default: 1,
        min: 1,
      },
      distance: {
        type: Number,
        default: 0,
        min: 0,
      },
      vehicleName: {
        type: String,
        default: '',
        trim: true,
      },
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
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
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
    baseFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    bookingMode: {
      type: String,
      enum: ['normal', 'bidding'],
      default: 'normal',
      lowercase: true,
      trim: true,
    },
    pricingNegotiationMode: {
      type: String,
      enum: ['none', 'driver_bid', 'user_increment_only'],
      default: 'none',
      lowercase: true,
      trim: true,
    },
    biddingStatus: {
      type: String,
      enum: ['none', 'open', 'accepted', 'expired', 'cancelled'],
      default: 'none',
      lowercase: true,
      trim: true,
    },
    bidStepAmount: {
      type: Number,
      default: 10,
      min: 1,
    },
    bidFloorFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    userMaxBidFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    bidCeilingMaxFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    fareIncreaseWaitMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextFareIncreaseAt: {
      type: Date,
      default: null,
    },
    acceptedBidId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRideBid',
      default: null,
    },
    estimatedDistanceMeters: {
      type: Number,
      default: 0,
      min: 0,
    },
    estimatedDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'online'],
      default: 'cash',
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      trim: true,
      minlength: 4,
      maxlength: 4,
    },
    driverPaymentCollection: {
      provider: {
        type: String,
        default: '',
        trim: true,
      },
      providerId: {
        type: String,
        default: '',
        trim: true,
      },
      providerOrderId: {
        type: String,
        default: '',
        trim: true,
      },
      providerPaymentId: {
        type: String,
        default: '',
        trim: true,
      },
      providerMode: {
        type: String,
        default: '',
        trim: true,
      },
      source: {
        type: String,
        default: '',
        trim: true,
      },
      status: {
        type: String,
        enum: ['pending', 'created', 'active', 'issued', 'closed', 'paid', 'captured', 'completed', 'expired', 'cancelled', 'failed'],
        default: 'pending',
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
      linkUrl: {
        type: String,
        default: '',
        trim: true,
      },
      paidAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    subscriptionUsage: {
      covered: {
        type: Boolean,
        default: false,
      },
      subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiUserSubscription',
        default: null,
      },
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiSubscriptionPlan',
        default: null,
      },
      planName: {
        type: String,
        default: '',
        trim: true,
      },
      vehicleTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiVehicle',
        default: null,
      },
      benefitType: {
        type: String,
        enum: ['limited', 'unlimited', ''],
        default: '',
      },
      fareCovered: {
        type: Number,
        default: 0,
        min: 0,
      },
      ridesUsedBefore: {
        type: Number,
        default: 0,
        min: 0,
      },
      ridesRemainingBefore: {
        type: Number,
        default: null,
        min: 0,
      },
      ridesUsedAfter: {
        type: Number,
        default: null,
        min: 0,
      },
      ridesRemainingAfter: {
        type: Number,
        default: null,
        min: 0,
      },
    },
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      default: null,
    },
    transport_type: {
      type: String,
      enum: ['taxi', 'delivery', 'intercity', 'all'],
      default: 'taxi',
      trim: true,
    },
    pricingSnapshot: {
      setPriceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiSetPrice',
        default: null,
      },
      admin_commission_type_from_driver: {
        type: Number,
        default: 1,
      },
      admin_commission_from_driver: {
        type: Number,
        default: 0,
      },
      admin_commission_type_for_owner: {
        type: Number,
        default: 1,
      },
      admin_commission_for_owner: {
        type: Number,
        default: 0,
      },
      waiting_charge: {
        type: Number,
        default: 0,
        min: 0,
      },
      free_waiting_before: {
        type: Number,
        default: 0,
        min: 0,
      },
      free_waiting_after: {
        type: Number,
        default: 0,
        min: 0,
      },
      allowed_payment_methods: {
        type: [String],
        default: ['cash', 'online'],
      },
      resolvedAt: {
        type: Date,
        default: null,
      },
    },
    commissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    driverEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
    walletSettledAt: {
      type: Date,
      default: null,
    },
    promo: {
      code: {
        type: String,
        default: '',
        trim: true,
        uppercase: true,
      },
      promo_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiPromoCode',
        default: null,
      },
      discount_amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      fare_before_discount: {
        type: Number,
        default: 0,
        min: 0,
      },
      fare_after_discount: {
        type: Number,
        default: 0,
        min: 0,
      },
      service_location_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaxiServiceLocation',
        default: null,
      },
      transport_type: {
        type: String,
        enum: ['taxi', 'delivery', 'intercity', 'all'],
        default: 'taxi',
        trim: true,
      },
      applied_at: {
        type: Date,
        default: null,
      },
    },
    lastDriverLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
      heading: {
        type: Number,
        default: null,
      },
      speed: {
        type: Number,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    messages: {
      type: [rideMessageSchema],
      default: [],
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    arrivedAt: {
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
    feedback: {
      rating: {
        type: Number,
        default: null,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        default: '',
        trim: true,
        maxlength: 500,
      },
      tipAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      tipPaymentId: {
        type: String,
        default: '',
        trim: true,
      },
      tipOrderId: {
        type: String,
        default: '',
        trim: true,
      },
      tipPaidAt: {
        type: Date,
        default: null,
      },
      submittedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true },
);

rideSchema.index({ userId: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, createdAt: -1 });
rideSchema.index({ status: 1, liveStatus: 1, scheduledAt: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, scheduledAt: 1, status: 1, liveStatus: 1 });

export const Ride = mongoose.models.TaxiRide || mongoose.model('TaxiRide', rideSchema);
