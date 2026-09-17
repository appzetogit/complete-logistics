import mongoose from 'mongoose';

const SUPPORT_USER_TYPES = ['user', 'driver', 'owner'];
const SUPPORT_TYPES = ['general', 'request'];

const supportTicketTitleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    userType: {
      type: String,
      enum: SUPPORT_USER_TYPES,
      required: true,
      index: true,
    },
    supportType: {
      type: String,
      enum: SUPPORT_TYPES,
      default: 'general',
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiAdmin',
      default: null,
    },
  },
  { timestamps: true },
);

supportTicketTitleSchema.index(
  { title: 1, userType: 1, supportType: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);

export const SUPPORT_TICKET_USER_TYPES = SUPPORT_USER_TYPES;
export const SUPPORT_TICKET_TYPES = SUPPORT_TYPES;

export const SupportTicketTitle =
  mongoose.models.TaxiSupportTicketTitle ||
  mongoose.model('TaxiSupportTicketTitle', supportTicketTitleSchema);
