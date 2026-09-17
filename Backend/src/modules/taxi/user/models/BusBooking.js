import mongoose from 'mongoose';

const passengerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    age: {
      type: Number,
      default: null,
    },
    gender: {
      type: String,
      default: '',
      trim: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
  },
  { _id: false },
);

const cancelledSeatSchema = new mongoose.Schema(
  {
    seatId: {
      type: String,
      default: '',
      trim: true,
    },
    seatLabel: {
      type: String,
      default: '',
      trim: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    chargeAmount: {
      type: Number,
      default: 0,
    },
    refundStatus: {
      type: String,
      default: '',
      trim: true,
    },
    refundId: {
      type: String,
      default: '',
      trim: true,
    },
    refundProcessedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const busBookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
      index: true,
    },
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
      index: true,
    },
    bookingCode: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    scheduleId: {
      type: String,
      required: true,
      trim: true,
    },
    travelDate: {
      type: String,
      required: true,
      trim: true,
    },
    seatIds: {
      type: [String],
      default: [],
    },
    seatLabels: {
      type: [String],
      default: [],
    },
    passenger: {
      type: passengerSchema,
      default: () => ({}),
    },
    amount: {
      type: Number,
      default: 0,
    },
    bookingSource: {
      type: String,
      enum: ['user', 'bus_driver', 'admin'],
      default: 'user',
      index: true,
    },
    reservedByDriverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusDriver',
      default: null,
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    routeSnapshot: {
      originCity: { type: String, default: '' },
      destinationCity: { type: String, default: '' },
      departureTime: { type: String, default: '' },
      arrivalTime: { type: String, default: '' },
      durationHours: { type: String, default: '' },
      busName: { type: String, default: '' },
      operatorName: { type: String, default: '' },
      coachType: { type: String, default: '' },
      busCategory: { type: String, default: '' },
      registrationNumber: { type: String, default: '' },
      driverName: { type: String, default: '' },
      driverPhone: { type: String, default: '' },
    },
    payment: {
      provider: { type: String, default: 'razorpay' },
      orderId: { type: String, default: '', index: true },
      paymentId: { type: String, default: '' },
      signature: { type: String, default: '' },
      status: { type: String, default: 'pending' },
      paidAt: { type: Date, default: null },
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellation: {
      allowed: { type: Boolean, default: false },
      appliedRuleId: { type: String, default: '' },
      appliedRuleLabel: { type: String, default: '' },
      refundType: { type: String, default: '' },
      refundValue: { type: Number, default: 0 },
      hoursBeforeDeparture: { type: Number, default: 0 },
      refundAmount: { type: Number, default: 0 },
      chargeAmount: { type: Number, default: 0 },
      notes: { type: String, default: '' },
    },
    cancelledSeats: {
      type: [cancelledSeatSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

busBookingSchema.index({ status: 1, expiresAt: 1 });
busBookingSchema.index({ busServiceId: 1, travelDate: 1, scheduleId: 1, status: 1 });

export const BusBooking =
  mongoose.models.TaxiBusBooking || mongoose.model('TaxiBusBooking', busBookingSchema);
