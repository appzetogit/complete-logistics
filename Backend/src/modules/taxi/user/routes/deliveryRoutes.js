import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { goodsAdvanceConfirmRateLimit, paymentOrderRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import {
  createDelivery,
  createGoodsAdvanceRazorpayOrder,
  payGoodsAdvanceFromWallet,
  razorpayAdvanceWebhook,
  reconcileGoodsAdvanceRazorpayPayment,
  verifyGoodsAdvanceRazorpayPayment,
  getDelivery,
  getMyActiveDelivery,
  listMyDeliveries,
  quoteDelivery,
} from '../controllers/deliveryController.js';

export const deliveryRouter = Router();

deliveryRouter.post('/quote', authenticate(['user']), asyncHandler(quoteDelivery));
deliveryRouter.post('/', authenticate(['user']), asyncHandler(createDelivery));
deliveryRouter.post('/advance/razorpay/order', authenticate(['user']), paymentOrderRateLimit, asyncHandler(createGoodsAdvanceRazorpayOrder));
deliveryRouter.post('/advance/razorpay/verify', authenticate(['user']), goodsAdvanceConfirmRateLimit, asyncHandler(verifyGoodsAdvanceRazorpayPayment));
deliveryRouter.post('/advance/razorpay/reconcile', authenticate(['user']), goodsAdvanceConfirmRateLimit, asyncHandler(reconcileGoodsAdvanceRazorpayPayment));
// Called by Razorpay itself (no login): authenticated by the webhook signature over the raw body.
deliveryRouter.post('/advance/razorpay/webhook', asyncHandler(razorpayAdvanceWebhook));
deliveryRouter.post('/advance/wallet', authenticate(['user']), paymentOrderRateLimit, asyncHandler(payGoodsAdvanceFromWallet));
deliveryRouter.get('/', authenticate(['user']), asyncHandler(listMyDeliveries));
deliveryRouter.get('/active/me', authenticate(['user', 'driver']), asyncHandler(getMyActiveDelivery));
deliveryRouter.get('/:deliveryId', authenticate(['user', 'driver']), asyncHandler(getDelivery));
