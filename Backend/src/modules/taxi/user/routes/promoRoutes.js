import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { getAvailablePromos, validatePromo } from '../controllers/promoController.js';

export const promoRouter = Router();

promoRouter.post('/validate', authenticate(['user']), asyncHandler(validatePromo));
promoRouter.get('/available', authenticate(['user']), asyncHandler(getAvailablePromos));
