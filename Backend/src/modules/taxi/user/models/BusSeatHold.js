import mongoose from 'mongoose';

const busSeatHoldSchema = new mongoose.Schema(
  {
    busServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusService',
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiUser',
      required: true,
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
    seatId: {
      type: String,
      required: true,
      trim: true,
    },
    holdToken: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['held', 'booked', 'released'],
      default: 'held',
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

busSeatHoldSchema.index(
  { busServiceId: 1, scheduleId: 1, travelDate: 1, seatId: 1 },
  { unique: true, name: 'unique_bus_travel_seat' },
);
busSeatHoldSchema.index({ status: 1, expiresAt: 1 });
busSeatHoldSchema.index({ busServiceId: 1, travelDate: 1, status: 1, scheduleId: 1 });

export const BusSeatHold =
  mongoose.models.TaxiBusSeatHold || mongoose.model('TaxiBusSeatHold', busSeatHoldSchema);
