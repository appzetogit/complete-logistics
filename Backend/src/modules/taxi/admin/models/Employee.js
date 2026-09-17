import mongoose from 'mongoose';

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    employeeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

employeeSchema.index({ phone: 1 }, { unique: true });
employeeSchema.index({ employeeCode: 1 }, { unique: true });
employeeSchema.index({ name: 1 });

export const Employee =
  mongoose.models.TaxiEmployee || mongoose.model('TaxiEmployee', employeeSchema);
