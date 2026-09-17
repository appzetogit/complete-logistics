import mongoose from 'mongoose';

const adminRoleSchema = new mongoose.Schema({
  name: String,
  slug: String,
  description: String,
  permissions: { type: [String], default: [] }
}, { timestamps: true });

export const AdminRole = mongoose.models.TaxiAdminRole || mongoose.model('TaxiAdminRole', adminRoleSchema);
