import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { Ride } from '../../user/models/Ride.js';
import {
  STALE_PENDING_REFUND_MS,
  resolveRidePaymentRefundManually,
  retryRidePaymentRefund,
} from '../../services/ridePaymentService.js';

// Admin > Payment Refunds: rider payments the app refunded automatically (ride already paid, wrong amount...).
// "Needs attention" = Razorpay rejected the refund, or it got stuck: the rider has not got the money back yet.

const ATTENTION = 'attention';

const serializeRefundRow = (ride, refund) => ({
  rideId: String(ride._id),
  serviceType: ride.serviceType || 'ride',
  rideStatus: ride.status,
  fare: Number(ride.fare || 0),
  riderName: ride.userId?.name || '',
  riderPhone: ride.userId?.phone || '',
  paymentId: refund.paymentId,
  amount: Number(refund.amount || 0),
  reason: refund.reason || '',
  status: refund.status || '',
  refundId: refund.refundId || '',
  error: refund.error || '',
  note: refund.note || '',
  at: refund.at || null,
  updatedAt: refund.updatedAt || refund.at || null,
});

const needsAttention = (refund, staleBefore) =>
  refund.status === 'failed'
  || (refund.status === 'pending' && new Date(refund.updatedAt || refund.at || 0) < staleBefore);

export const listRidePaymentRefunds = asyncHandler(async (req, res) => {
  const filter = String(req.query.status || ATTENTION).trim().toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const staleBefore = new Date(Date.now() - STALE_PENDING_REFUND_MS);

  const query = filter === ATTENTION
    ? { 'paymentRefunds.status': { $in: ['failed', 'pending'] } }
    : filter === 'all'
      ? { 'paymentRefunds.0': { $exists: true } }
      : { 'paymentRefunds.status': filter };

  const rides = await Ride.find(query)
    .select('serviceType status fare userId paymentRefunds updatedAt')
    .populate('userId', 'name phone')
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const results = rides
    .flatMap((ride) => (ride.paymentRefunds || [])
      .filter((refund) => (filter === ATTENTION ? needsAttention(refund, staleBefore) : filter === 'all' || refund.status === filter))
      .map((refund) => serializeRefundRow(ride, refund)))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const attentionCount = filter === ATTENTION
    ? results.length
    : (await Ride.find({ 'paymentRefunds.status': { $in: ['failed', 'pending'] } }).select('paymentRefunds').lean())
      .reduce((count, ride) => count + ride.paymentRefunds.filter((refund) => needsAttention(refund, staleBefore)).length, 0);

  res.json({ success: true, data: { results, attentionCount } });
});

const readRefundParams = (req) => {
  const rideId = String(req.params.rideId || '').trim();
  const paymentId = String(req.params.paymentId || '').trim();
  if (!mongoose.isValidObjectId(rideId) || !paymentId) {
    throw new ApiError(400, 'rideId and paymentId are required');
  }
  return { rideId, paymentId };
};

export const retryRidePaymentRefundAdmin = asyncHandler(async (req, res) => {
  const refund = await retryRidePaymentRefund(readRefundParams(req));
  res.json({ success: refund.status !== 'failed', data: refund, message: refund.status === 'failed' ? refund.error : 'Refund sent' });
});

export const resolveRidePaymentRefundAdmin = asyncHandler(async (req, res) => {
  await resolveRidePaymentRefundManually({
    ...readRefundParams(req),
    note: req.body?.note,
    adminId: req.auth?.sub,
  });
  res.json({ success: true });
});
