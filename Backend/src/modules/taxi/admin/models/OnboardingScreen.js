import mongoose from 'mongoose';

const onboardingScreenSchema = new mongoose.Schema({
  audience: { type: String, enum: ['user', 'driver', 'owner'] },
  screen: { type: String },
  order: { type: Number, default: 0 },
  title: String,
  description: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const OnboardingScreen = mongoose.models.TaxiOnboardingScreen || mongoose.model('TaxiOnboardingScreen', onboardingScreenSchema);
