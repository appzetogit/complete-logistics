import mongoose from 'mongoose';

const paymentGatewaySchema = new mongoose.Schema({
  name: String,
  slug: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const PaymentGateway = mongoose.models.TaxiPaymentGateway || mongoose.model('TaxiPaymentGateway', paymentGatewaySchema);
