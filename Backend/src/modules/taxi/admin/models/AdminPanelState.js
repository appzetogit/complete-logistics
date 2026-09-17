import mongoose from 'mongoose';

const { Mixed } = mongoose.Schema.Types;

const adminPanelStateSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    dashboard: { type: Mixed, default: {} },
    // Global metadata or settings not yet moved to independent models
    lastSnapshot: { type: Mixed, default: {} },
  },
  { timestamps: true },
);

export const AdminPanelState =
  mongoose.models.TaxiAdminPanelState || mongoose.model('TaxiAdminPanelState', adminPanelStateSchema);
