import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      required: true,
      index: true,
    },
    service_location_name: {
      type: String,
      default: '',
      trim: true,
    },
    send_to: {
      type: String,
      enum: ['all', 'drivers', 'users'],
      default: 'all',
      trim: true,
      index: true,
    },
    push_title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['sent', 'draft'],
      default: 'sent',
      index: true,
    },
    sent_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

notificationSchema.index({ service_location_id: 1, send_to: 1, createdAt: -1 });

export const Notification =
  mongoose.models.TaxiNotification || mongoose.model('TaxiNotification', notificationSchema);
