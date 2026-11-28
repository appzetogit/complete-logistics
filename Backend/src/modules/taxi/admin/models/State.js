import mongoose from 'mongoose';

// An Indian state / union territory. Service locations (cities) belong to one state; admins can be limited to states.
const stateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // short code such as MP, MH, DL (unique, upper case)
    code: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

stateSchema.index({ code: 1 }, { unique: true });
stateSchema.index({ name: 1 });

export const State = mongoose.models.TaxiState || mongoose.model('TaxiState', stateSchema);
