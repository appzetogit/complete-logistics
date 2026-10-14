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
    /// Whether the rider booked a one-way or a return journey. Drives the fare
    /// on the app side and is surfaced on the driver's request card so they
    /// know the job involves a return leg before accepting.
    tripMode: {
      type: String,
      enum: ['one_way', 'round_trip'],
      default: 'one_way',
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
      /// Optional handling note the sender types at booking — lift access,
      /// fragile contents, call before arriving.
      instructions: {
        type: String,
        default: '',
        trim: true,
      },
      /// Body height the rider paid for. Declared here because the fare engine
      /// writes it on every goods booking; without it Mongoose silently
      /// dropped the field and the driver was never told what to bring.
      loadHeight: {
        key: { type: String, default: '', trim: true },
        label: { type: String, default: '', trim: true },
        height_ft: { type: Number, default: 0 },
        price: { type: Number, default: 0 },
      },
      /// Paid add-ons the rider ticked, e.g. tarpaulin sheet, roof carrier,
      /// helper. The driver has to know what the job requires before accepting.
      extras: {
        type: [
          {
            _id: false,
            key: { type: String, default: '', trim: true },
            label: { type: String, default: '', trim: true },
            price: { type: Number, default: 0 },
          },
        ],
        default: [],
      },
      /// Loading/unloading waiting terms disclosed with the quote and settled
      /// at completion.
      detention: {
        freeMinutes: { type: Number, default: 0 },
        chargePerHour: { type: Number, default: 0 },
      },
      /// Proof the consignment was collected — photographed by the driver at
      /// the pickup before the trip may start.
      pickupProof: {
        imageUrl: { type: String, default: '', trim: true },
        capturedAt: { type: Date, default: null },
        note: { type: String, default: '', trim: true },
      },
      /// Proof the consignment was handed over at the drop, captured before
      /// the delivery may be completed.
      dropProof: {
        imageUrl: { type: String, default: '', trim: true },
        capturedAt: { type: Date, default: null },
        note: { type: String, default: '', trim: true },
        receivedBy: { type: String, default: '', trim: true },
      },
      /// Driver face selfies taken at the pickup and at the drop. For admin review only: never
      /// included in a rider's payload (like `acceptSelfie`).
      pickupSelfie: {
        imageUrl: { type: String, default: '', trim: true },
        capturedAt: { type: Date, default: null },
      },
      dropSelfie: {
        imageUrl: { type: String, default: '', trim: true },
        capturedAt: { type: Date, default: null },
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
      enum: ['cash', 'online', 'wallet'],
      default: 'cash',
      lowercase: true,
      trim: true,
    },
    // Wallet rides: the amount reserved from the rider's wallet at booking (services/rideWalletService.js).
    walletHold: {
      type: {
        amount: { type: Number, default: 0, min: 0 },
        at: { type: Date, default: null },
        status: { type: String, enum: ['held', 'captured', 'released'], default: 'held' },
        capturedAmount: { type: Number, default: 0, min: 0 },
        releasedAt: { type: Date, default: null },
      },
      default: undefined,
    },
    // Wallet rides: what was debited from the wallet when the trip completed.
    walletPayment: {
      type: {
        amount: { type: Number, default: 0, min: 0 },
        transferId: { type: String, default: '' },
        at: { type: Date, default: null },
      },
      default: undefined,
    },
    // Wallet rides: the part of the fare the wallet could not cover (paid through the normal completion payment).
    walletShortfall: {
      type: Number,
      default: 0,
      min: 0,
    },
    otp: {
      type: String,
      trim: true,
      minlength: 4,
      maxlength: 4,
    },
    // Wrong start-trip OTPs entered by the driver; after too many the start is locked for a while.
    otpCheck: {
      failedAttempts: { type: Number, default: 0 },
      lockedUntil: { type: Date, default: null },
    },
    // Waiting at the pickup beyond the free minutes, billed on top of the fare (set when the trip starts).
    waitingMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    waitingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Distance actually driven between trip start and drop, summed from the driver's GPS points.
    actualDistanceMeters: {
      type: Number,
      default: 0,
      min: 0,
    },
    // The trip ended before the booked drop at the rider's request (passenger rides only).
    earlyDrop: {
      type: {
        at: { type: Date, default: null },
        distanceFromDropMeters: { type: Number, default: null },
        coordinates: { type: [Number], default: undefined },
      },
      default: undefined,
    },
    // The point the driven distance was last measured from (moves once the driver is a few meters away from it).
    travelAnchor: {
      type: {
        coordinates: { type: [Number], default: undefined },
        at: { type: Date, default: null },
      },
      default: undefined,
      select: false,
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
    // Audit trail of drivers who accepted this ride and then cancelled it.
    driverCancellations: {
      type: [
        {
          _id: false,
          driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver' },
          reason: { type: String, default: '', trim: true },
          liveStatusAtCancel: { type: String, default: '' },
          acceptSelfieUrl: { type: String, default: '' },
          cancelledAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // Goods (parcel) bookings only: advance paid online before dispatch.
    // pending = not yet paid (ride must not be dispatched), paid = held,
    // refunded = returned to the rider, forfeited = kept after a rider cancel.
    /// Who cancelled the ride, when, why, and the cancellation fee charged. Empty (`by: ''`) until cancelled.
    cancellation: {
      by: { type: String, enum: ['', 'user', 'driver', 'admin', 'system'], default: '' },
      at: { type: Date, default: null },
      code: { type: String, default: '', trim: true },
      reason: { type: String, default: '', trim: true },
      // The rider's cancellation fee decided for this cancel, and whether it was really debited.
      fee: { type: Number, default: 0, min: 0 },
      feeCharged: { type: Boolean, default: false },
      feeStatus: { type: String, enum: ['none', 'charged', 'not_charged'], default: 'none' },
      feeGoesTo: { type: String, default: '', trim: true },
      // A driver's own cancellation fee (scheduled ride), never charged to the rider.
      driverFee: { type: Number, default: 0, min: 0 },
    },
    goodsAdvance: {
      percent: { type: Number, default: 0, min: 0 },
      amount: { type: Number, default: 0, min: 0 },
      status: {
        type: String,
        enum: ['none', 'pending', 'paid', 'refunded', 'forfeited'],
        default: 'none',
      },
      provider: { type: String, default: '', trim: true },
      providerOrderId: { type: String, default: '', trim: true },
      // Every order created for this advance, so a payment on an older order can still be reconciled.
      providerOrderIds: { type: [String], default: [] },
      providerPaymentId: { type: String, default: '', trim: true },
      refundDestination: { type: String, default: '', trim: true },
      paidAt: { type: Date, default: null },
      refundedAt: { type: Date, default: null },
      forfeitedAt: { type: Date, default: null },
    },
    freeRide: {
      covered: {
        type: Boolean,
        default: false,
      },
      fareCovered: {
        type: Number,
        default: 0,
        min: 0,
      },
      freeRidesUsedBefore: {
        type: Number,
        default: 0,
        min: 0,
      },
      // Set once when the completed ride is counted against the user's limit.
      consumedAt: {
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
    // How the completed ride was settled with the driver: 'cash' = commission deducted, the fare is credited when
    // the rider pays online; 'online' = fare - commission credited at completion. Empty on older rides.
    settledAs: {
      type: String,
      enum: ['', 'cash', 'online'],
      default: '',
    },
    // Online booking the rider did not pay in time: the platform credited the driver the fare (amount) at this
    // moment. The rider still owes it; a later payment goes to the platform, not to the driver again.
    platformCoveredAt: {
      type: Date,
      default: null,
    },
    platformCoveredAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // 'cash' when a cash ride ended up paid online (reports can show both).
    paymentSwitchedFrom: {
      type: String,
      default: '',
      trim: true,
    },
    // The rider's open in-app checkout order for the fare, reused while unpaid (a double tap never makes two).
    riderPaymentOrder: {
      type: {
        orderId: { type: String, default: '' },
        amountPaise: { type: Number, default: 0 },
        fareDue: { type: Number, default: 0 },
        tipAmount: { type: Number, default: 0 },
        createdAt: { type: Date, default: null },
      },
      default: undefined,
    },
    // Payments returned to the rider because the ride was already paid (or the amount was wrong).
    paymentRefunds: {
      type: [
        {
          _id: false,
          paymentId: { type: String, default: '' },
          amount: { type: Number, default: 0 },
          refundId: { type: String, default: '' },
          // pending -> processed (Razorpay accepted) | failed (retry in Admin > Payment Refunds) | resolved_manually
          status: { type: String, default: '' },
          reason: { type: String, default: '' },
          error: { type: String, default: '' },
          note: { type: String, default: '' },
          resolvedBy: { type: String, default: '' },
          at: { type: Date, default: null },
          updatedAt: { type: Date, default: null },
        },
      ],
      default: [],
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
    acceptSelfie: {
      imageUrl: { type: String, default: '', trim: true },
      driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', default: null },
      capturedAt: { type: Date, default: null },
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
    // The driver's rating of the rider (the reverse of `feedback`). Seen by drivers and admin only, so it is
    // never loaded unless asked for (`+driverFeedback`); raw ride documents sent to riders cannot leak it.
    driverFeedback: {
      type: new mongoose.Schema({
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
        submittedAt: {
          type: Date,
          default: null,
        },
      }, { _id: false }),
      default: undefined, // absent until the driver rates
      select: false,
    },
  },
  { timestamps: true },
);

rideSchema.index({ userId: 1, createdAt: -1 });
// One gateway payment can pay one ride only, even if two requests race. Empty ids (unpaid, cash, free rides)
// are left out. Production has autoIndex off: create it with `node scripts/ensureRidePaymentIndexes.js`.
rideSchema.index(
  { 'driverPaymentCollection.providerPaymentId': 1 },
  {
    name: 'uniq_ride_provider_payment_id',
    unique: true,
    partialFilterExpression: { 'driverPaymentCollection.providerPaymentId': { $gt: '' } },
  },
);
// The unpaid-online-booking cover sweep (see ridePaymentService.coverUnpaidOnlineRides).
rideSchema.index(
  { completedAt: 1 },
  {
    name: 'ride_unpaid_online_cover',
    partialFilterExpression: { settledAs: 'cash', paymentMethod: 'online', platformCoveredAt: null },
  },
);
// Admin > Payment Refunds: rides with a refund that needs attention.
rideSchema.index({ 'paymentRefunds.status': 1 }, { name: 'ride_payment_refund_status', sparse: true });
rideSchema.index({ driverId: 1, createdAt: -1 });
rideSchema.index({ status: 1, liveStatus: 1, scheduledAt: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, scheduledAt: 1, status: 1, liveStatus: 1 });

export const Ride = mongoose.models.TaxiRide || mongoose.model('TaxiRide', rideSchema);
