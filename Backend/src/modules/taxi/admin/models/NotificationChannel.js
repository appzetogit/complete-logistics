import mongoose from 'mongoose';

const notificationChannelSchema = new mongoose.Schema({
  name: String,
  topic_name: String,
  description: String,
  push_notification: { type: Boolean, default: true },
  mail: { type: Boolean, default: false },
  for_user: { type: Boolean, default: true }
}, { timestamps: true });

export const NotificationChannel = mongoose.models.TaxiNotificationChannel || mongoose.model('TaxiNotificationChannel', notificationChannelSchema);
