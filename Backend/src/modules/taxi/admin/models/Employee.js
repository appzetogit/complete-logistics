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
    // Counts typed by the admin. When set they are shown instead of the automatic count
    // (users / drivers who signed up with this employee's code). null = use the automatic count.
    manualUsersCount: {
      type: Number,
      default: null,
      min: 0,
    },
    manualDriversCount: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { timestamps: true },
);

employeeSchema.index({ phone: 1 }, { unique: true });
employeeSchema.index({ employeeCode: 1 }, { unique: true });
employeeSchema.index({ name: 1 });

export const Employee =
  mongoose.models.TaxiEmployee || mongoose.model('TaxiEmployee', employeeSchema);
