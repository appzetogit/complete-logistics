import mongoose from 'mongoose';

const driverNeededDocumentSchema = new mongoose.Schema(
  {
    template_type: {
      type: String,
      enum: ['document', 'vehicle_field'],
      default: 'document',
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    account_type: {
      type: String,
      enum: ['individual', 'fleet_drivers', 'both'],
      default: 'individual',
      trim: true,
    },
    image_type: {
      type: String,
      enum: ['front_back', 'front', 'back', 'image'],
      default: 'front_back',
      trim: true,
    },
    has_expiry_date: {
      type: Boolean,
      default: false,
    },
    has_identify_number: {
      type: Boolean,
      default: false,
    },
    identify_number_key: {
      type: String,
      default: '',
      trim: true,
    },
    verification_type: {
      type: String,
      enum: ['none', 'driving_license', 'pan', 'gstin', 'rc'],
      default: 'none',
      trim: true,
      index: true,
    },
    is_editable: {
      type: Boolean,
      default: false,
    },
    is_required: {
      type: Boolean,
      default: false,
    },
    key: {
      type: String,
      default: '',
      trim: true,
    },
    front_key: {
      type: String,
      default: '',
      trim: true,
    },
    back_key: {
      type: String,
      default: '',
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    field_key: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    field_type: {
      type: String,
      default: 'text',
      trim: true,
    },
    field_group: {
      type: String,
      default: '',
      trim: true,
    },
    placeholder: {
      type: String,
      default: '',
      trim: true,
    },
    help_text: {
      type: String,
      default: '',
      trim: true,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
    options: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

driverNeededDocumentSchema.index({ name: 1 });
driverNeededDocumentSchema.index({ active: 1, image_type: 1 });

export const DriverNeededDocument =
  mongoose.models.TaxiDriverNeededDocument || mongoose.model('TaxiDriverNeededDocument', driverNeededDocumentSchema);
