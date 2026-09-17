import mongoose from 'mongoose';

const rideBidSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    bidFare: {
      type: Number,
      required: true,
      min: 0,
    },
    incrementAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
      default: 'pending',
      lowercase: true,
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);

rideBidSchema.index({ rideId: 1, driverId: 1 }, { unique: true });
rideBidSchema.index({ rideId: 1, status: 1, bidFare: 1, createdAt: 1 });

export const RideBid = mongoose.models.TaxiRideBid || mongoose.model('TaxiRideBid', rideBidSchema);
