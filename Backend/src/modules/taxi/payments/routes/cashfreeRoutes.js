import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { paymentOrderRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import {
  cashfreeWebhook,
  createDriverCollectOrder,
  getDriverCollectStatus,
  createDriverWalletOrder,
  createRideCompletionOrder,
  createUserWalletOrder,
  verifyDriverWalletOrder,
  verifyRideCompletionOrder,
  verifyUserWalletOrder,
} from '../controllers/cashfreeController.js';

// Cashfree payments, mounted with the other modules (/api/v1/payments/cashfree/...).
export const cashfreePaymentRouter = Router();

cashfreePaymentRouter.post('/payments/cashfree/user-wallet/order', authenticate(['user']), paymentOrderRateLimit, asyncHandler(createUserWalletOrder));
cashfreePaymentRouter.post('/payments/cashfree/user-wallet/verify', authenticate(['user']), asyncHandler(verifyUserWalletOrder));

cashfreePaymentRouter.post('/payments/cashfree/driver-wallet/order', authenticate(['driver']), paymentOrderRateLimit, asyncHandler(createDriverWalletOrder));
cashfreePaymentRouter.post('/payments/cashfree/driver-wallet/verify', authenticate(['driver']), asyncHandler(verifyDriverWalletOrder));

cashfreePaymentRouter.post('/payments/cashfree/rides/:rideId/order', authenticate(['user']), paymentOrderRateLimit, asyncHandler(createRideCompletionOrder));
cashfreePaymentRouter.post('/payments/cashfree/rides/:rideId/verify', authenticate(['user']), asyncHandler(verifyRideCompletionOrder));

// Driver: collect the fare at the drop (the rider scans the QR). Same job as POST /drivers/payments/qr and
// GET /drivers/payments/qr/status, which the driver app already calls.
cashfreePaymentRouter.post('/payments/cashfree/rides/:rideId/collect/order', authenticate(['driver']), paymentOrderRateLimit, asyncHandler(createDriverCollectOrder));
cashfreePaymentRouter.get('/payments/cashfree/rides/:rideId/collect/status', authenticate(['driver']), asyncHandler(getDriverCollectStatus));

// Public: Cashfree calls it. Authenticated by the signature over the raw body.
cashfreePaymentRouter.post('/payments/cashfree/webhook', asyncHandler(cashfreeWebhook));
