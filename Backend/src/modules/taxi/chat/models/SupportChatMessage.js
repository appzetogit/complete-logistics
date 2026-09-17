import mongoose from 'mongoose';

const supportChatMessageSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['support'],
      default: 'support',
      index: true,
    },
    conversationKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ['admin', 'user', 'driver'],
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    senderName: {
      type: String,
      default: '',
      trim: true,
    },
    senderPhone: {
      type: String,
      default: '',
      trim: true,
    },
    receiverRole: {
      type: String,
      enum: ['admin', 'user', 'driver'],
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    receiverName: {
      type: String,
      default: '',
      trim: true,
    },
    receiverPhone: {
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
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

supportChatMessageSchema.index({ conversationKey: 1, createdAt: -1 });
supportChatMessageSchema.index({ receiverRole: 1, receiverId: 1, readAt: 1, createdAt: -1 });

export const SupportChatMessage =
  mongoose.models.TaxiSupportChatMessage || mongoose.model('TaxiSupportChatMessage', supportChatMessageSchema);
