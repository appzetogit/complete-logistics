import mongoose from 'mongoose';

const poolingSeatReservationSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingRoute',
      required: true,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingVehicle',
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiPoolingBooking',
      required: true,
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
  },
  { timestamps: true },
);

poolingSeatReservationSchema.index(
  { route: 1, vehicle: 1, scheduleId: 1, travelDate: 1, seatId: 1 },
  { unique: true },
);

export const PoolingSeatReservation =
  mongoose.models.TaxiPoolingSeatReservation ||
  mongoose.model('TaxiPoolingSeatReservation', poolingSeatReservationSchema);
