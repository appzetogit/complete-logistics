import mongoose from 'mongoose';

export const PAYMENT_ORDER_STATUS = Object.freeze({
  CREATED: 'created',
  PAID: 'paid',
  APPLIED: 'applied',
  FAILED: 'failed',
  REFUND_PENDING: 'refund_pending',
  REFUNDED: 'refunded',
});

// One row per gateway order we opened (Cashfree today). The row, not the client, says what the order is for, who
// owns it and how much it must be: verify, webhook and the reconcile loop all read it and apply it once.
const paymentOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, trim: true },
    gateway: { type: String, required: true, trim: true, index: true },
    purpose: { type: String, enum: ['user_wallet_topup', 'driver_wallet_topup', 'ride_payment', 'goods_advance', 'subscription'], required: true },
    ownerType: { type: String, enum: ['user', 'driver'], required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: Object.values(PAYMENT_ORDER_STATUS), default: PAYMENT_ORDER_STATUS.CREATED, index: true },
    paymentSessionId: { type: String, default: '' },
    providerPaymentId: { type: String, default: '', trim: true },
    // purpose specific: ride payment => { rideId, fareDue, tipAmount }; goods advance => { rideId }; subscription => { planId }
    context: { type: mongoose.Schema.Types.Mixed, default: {} },
    paidAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },
    applyResult: { type: String, default: '' },
    refund: {
      refundId: { type: String, default: '' },
      status: { type: String, default: '' },
      reason: { type: String, default: '' },
      error: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// a gateway payment id can settle one order only
paymentOrderSchema.index(
  { gateway: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string', $gt: '' } } },
);
paymentOrderSchema.index({ status: 1, createdAt: 1 });

export const PaymentOrder = mongoose.models.TaxiPaymentOrder || mongoose.model('TaxiPaymentOrder', paymentOrderSchema);
