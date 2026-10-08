import { Router } from 'express';
import * as commonController from '../controllers/commonController.js';
import { authenticate } from '../../middlewares/authMiddleware.js';

export const commonRouter = Router();

// Universal image upload endpoint
// Any signed-in account (apps, admin panel). Pending drivers may upload their documents.
commonRouter.post(
  '/common/upload/image',
  authenticate(['user', 'driver', 'admin', 'owner', 'pooling_driver', 'bus_driver', 'service_center', 'service_center_staff'], { allowPending: true }),
  commonController.uploadImage,
);
commonRouter.get('/common/referrals/translation', commonController.getReferralTranslation);
commonRouter.get('/common/referrals/settings', commonController.getReferralSettingsContent);
commonRouter.get('/common/payment-gateway', commonController.getPaymentGatewayConfig);
commonRouter.post('/common/payment-gateway/phonepe/callback', commonController.acknowledgePhonePeCallback);
commonRouter.get('/common/recharge-api/callback', commonController.acknowledgeRechargeApiCallback);
commonRouter.post('/common/recharge-api/callback', commonController.acknowledgeRechargeApiCallback);
