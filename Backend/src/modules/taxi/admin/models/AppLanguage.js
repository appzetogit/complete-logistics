import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema({
  name: String,
  code: String,
  active: { type: Number, default: 1 },
  default_status: { type: Number, default: 0 }
}, { timestamps: true });

export const AppLanguage = mongoose.models.TaxiAppLanguage || mongoose.model('TaxiAppLanguage', languageSchema);
