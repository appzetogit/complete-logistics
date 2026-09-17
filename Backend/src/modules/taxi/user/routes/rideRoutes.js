import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  availableDriversRateLimit,
  paymentOrderRateLimit,
  rideCreationRateLimit,
} from '../../middlewares/rateLimitMiddleware.js';
import {
  acceptRideBid,
  createRazorpayRideCompletionOrder,
  cancelRide,
  createRazorpayRideTipOrder,
  createRide,
  getRideBids,
  getRideAppTipSettings,
  getMyActiveRide,
  getRideById,
  listMyRides,
  listAvailableDrivers,
  payRideCompletionWithWallet,
  submitRideReview,
  updateRideBidCeiling,
  updateRideStatus,
  verifyRazorpayRideCompletion,
  verifyRazorpayRideTip,
} from '../controllers/rideController.js';

export const rideRouter = Router();

rideRouter.post('/', authenticate(['user']), rideCreationRateLimit, asyncHandler(createRide));
rideRouter.get('/', authenticate(['user', 'driver']), asyncHandler(listMyRides));
rideRouter.get('/app-settings/tip', asyncHandler(getRideAppTipSettings));
rideRouter.get('/available-drivers', availableDriversRateLimit, asyncHandler(listAvailableDrivers));
rideRouter.get('/active/me', authenticate(['user', 'driver']), asyncHandler(getMyActiveRide));
rideRouter.patch('/:rideId/cancel', authenticate(['user']), asyncHandler(cancelRide));
rideRouter.get('/:rideId/bids', authenticate(['user']), asyncHandler(getRideBids));
rideRouter.patch('/:rideId/bids/ceiling', authenticate(['user']), asyncHandler(updateRideBidCeiling));
rideRouter.post('/:rideId/bids/:bidId/accept', authenticate(['user']), asyncHandler(acceptRideBid));
rideRouter.get('/:rideId', authenticate(['user', 'driver']), asyncHandler(getRideById));
rideRouter.patch('/:rideId/status', authenticate(['driver']), asyncHandler(updateRideStatus));
rideRouter.post('/:rideId/complete-payment/razorpay/order', authenticate(['user']), paymentOrderRateLimit, asyncHandler(createRazorpayRideCompletionOrder));
rideRouter.post('/:rideId/complete-payment/razorpay/verify', authenticate(['user']), asyncHandler(verifyRazorpayRideCompletion));
rideRouter.post('/:rideId/complete-payment/wallet', authenticate(['user']), asyncHandler(payRideCompletionWithWallet));
rideRouter.post('/:rideId/tip/razorpay/order', authenticate(['user']), paymentOrderRateLimit, asyncHandler(createRazorpayRideTipOrder));
rideRouter.post('/:rideId/tip/razorpay/verify', authenticate(['user']), asyncHandler(verifyRazorpayRideTip));
rideRouter.patch('/:rideId/feedback', authenticate(['user']), asyncHandler(submitRideReview));
