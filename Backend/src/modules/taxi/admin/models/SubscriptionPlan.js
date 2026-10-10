import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema({
  audience: {
    type: String,
    enum: ['driver', 'user'],
    default: 'driver',
    index: true,
  },
  name: String,
  description: String,
  amount: Number,
  duration: Number, // in days
  transport_type: String,
  vehicle_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiVehicle' },
  // Every vehicle type the plan covers (e.g. "bike" = several bike types). `vehicle_type_id` stays the first one.
  vehicle_type_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'TaxiVehicle', default: [] },
  benefit_type: {
    type: String,
    enum: ['standard', 'limited', 'unlimited'],
    default: 'standard',
  },
  ride_limit: {
    type: Number,
    default: 0,
    min: 0,
  },
  how_it_works: String,
  // Admin-set marketing text shown in the app: a short ribbon and a tick list. Only claims the ride flow
  // really applies (see validation in adminService).
  badge: { type: String, default: '', trim: true },
  benefits: { type: [String], default: [] },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const SubscriptionPlan = mongoose.models.TaxiSubscriptionPlan || mongoose.model('TaxiSubscriptionPlan', subscriptionPlanSchema);
