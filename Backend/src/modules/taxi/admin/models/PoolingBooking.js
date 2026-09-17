import mongoose from 'mongoose';

const poolingBookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingRoute',
      required: true,
    },
    scheduleId: {
      type: String,
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingVehicle',
    },
    pickupStopId: {
      type: String,
      required: true,
    },
    dropStopId: {
      type: String,
      required: true,
    },
    seatsBooked: {
      type: Number,
      default: 1,
      min: 1,
    },
    fare: {
      type: Number,
      required: true,
    },
    baseFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    serviceTaxPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    serviceTaxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    driverCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    driverCommissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ownerCommissionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    ownerCommissionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    selectedSeats: {
      type: [String],
      default: [],
    },
    pickupLabel: {
      type: String,
      default: '',
      trim: true,
    },
    dropLabel: {
      type: String,
      default: '',
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    bookingStatus: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'confirmed',
    },
    travelDate: {
      type: Date,
      required: true,
    },
    otp: {
      type: String,
    },
    payment: {
      provider: {
        type: String,
        default: 'razorpay',
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
      status: {
        type: String,
        default: 'pending',
        trim: true,
      },
      paidAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true },
);

poolingBookingSchema.index({ user: 1 });
poolingBookingSchema.index({ route: 1 });
poolingBookingSchema.index({ travelDate: 1 });
poolingBookingSchema.index({ 'payment.orderId': 1 });
poolingBookingSchema.index({ 'payment.paymentId': 1 });

export const PoolingBooking =
  mongoose.models.TaxiPoolingBooking ||
  mongoose.model('TaxiPoolingBooking', poolingBookingSchema);
