import mongoose from 'mongoose';

const ownerBookingSchema = new mongoose.Schema(
  {
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
      default: null,
    },
    booking_reference: {
      type: String,
      required: true,
      trim: true,
    },
    customer_name: {
      type: String,
      required: true,
      trim: true,
    },
    customer_phone: {
      type: String,
      default: '',
      trim: true,
    },
    pickup_location: {
      type: String,
      default: '',
      trim: true,
    },
    dropoff_location: {
      type: String,
      default: '',
      trim: true,
    },
    trip_type: {
      type: String,
      enum: ['city', 'rental', 'outstation'],
      default: 'city',
    },
    vehicle_type: {
      type: String,
      default: '',
      trim: true,
    },
    trip_date: {
      type: Date,
      default: null,
    },
    fare_amount: {
      type: Number,
      default: 0,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },
    booking_status: {
      type: String,
      enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'],
      default: 'pending',
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

ownerBookingSchema.index({ booking_reference: 1 }, { unique: true });
ownerBookingSchema.index({ owner_id: 1, booking_status: 1 });
ownerBookingSchema.index({ trip_date: -1 });

export const OwnerBooking = mongoose.models.TaxiOwnerBooking || mongoose.model('TaxiOwnerBooking', ownerBookingSchema);
