import mongoose from 'mongoose';

const SUPPORT_ROLES = ['admin', 'user', 'driver', 'owner'];
const SUPPORT_STATUS = ['pending', 'assigned', 'closed'];

const supportMessageSchema = new mongoose.Schema(
  {
    senderRole: {
      type: String,
      enum: SUPPORT_ROLES,
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderName: {
      type: String,
      default: '',
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    titleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiSupportTicketTitle',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    userType: {
      type: String,
      enum: ['user', 'driver', 'owner'],
      required: true,
      index: true,
    },
    supportType: {
      type: String,
      enum: ['general', 'request'],
      default: 'general',
      index: true,
    },
    requesterRole: {
      type: String,
      enum: ['user', 'driver', 'owner'],
      required: true,
      index: true,
    },
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    requesterName: {
      type: String,
      default: '',
      trim: true,
    },
    requesterPhone: {
      type: String,
      default: '',
      trim: true,
    },
    serviceLocation: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: SUPPORT_STATUS,
      default: 'pending',
      index: true,
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiAdmin',
      default: null,
      index: true,
    },
    assignedAdminName: {
      type: String,
      default: '',
      trim: true,
    },
    messages: {
      type: [supportMessageSchema],
      default: [],
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ requesterRole: 1, requesterId: 1, updatedAt: -1 });
supportTicketSchema.index({ status: 1, updatedAt: -1 });

export const SUPPORT_TICKET_STATUS = SUPPORT_STATUS;

export const SupportTicket =
  mongoose.models.TaxiSupportTicket ||
  mongoose.model('TaxiSupportTicket', supportTicketSchema);
