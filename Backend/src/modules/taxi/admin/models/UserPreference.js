import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema({
  name: String,
  icon: String,
  active: { type: Number, default: 1 }
}, { timestamps: true });

export const UserPreference = mongoose.models.TaxiUserPreference || mongoose.model('TaxiUserPreference', userPreferenceSchema);
