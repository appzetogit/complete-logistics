import mongoose from 'mongoose';

const paymentFieldSchema = new mongoose.Schema(
  {
    type: { type: String, default: 'text' },
    name: { type: String, required: true },
    placeholder: { type: String, default: '' },
    is_required: { type: Boolean, default: false },
  },
  { _id: false },
);

const paymentMethodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    fields: { type: [paymentFieldSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const PaymentMethod =
  mongoose.models.TaxiPaymentMethod ||
  mongoose.model('TaxiPaymentMethod', paymentMethodSchema);
