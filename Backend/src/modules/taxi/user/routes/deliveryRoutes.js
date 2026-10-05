import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { paymentOrderRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import {
  createDelivery,
  createGoodsAdvanceRazorpayOrder,
  payGoodsAdvanceFromWallet,
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
deliveryRouter.post('/advance/razorpay/verify', authenticate(['user']), paymentOrderRateLimit, asyncHandler(verifyGoodsAdvanceRazorpayPayment));
deliveryRouter.post('/advance/wallet', authenticate(['user']), paymentOrderRateLimit, asyncHandler(payGoodsAdvanceFromWallet));
deliveryRouter.get('/', authenticate(['user']), asyncHandler(listMyDeliveries));
deliveryRouter.get('/active/me', authenticate(['user', 'driver']), asyncHandler(getMyActiveDelivery));
deliveryRouter.get('/:deliveryId', authenticate(['user', 'driver']), asyncHandler(getDelivery));
