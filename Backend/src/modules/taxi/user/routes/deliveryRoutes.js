import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  createDelivery,
  getDelivery,
  getMyActiveDelivery,
  listMyDeliveries,
} from '../controllers/deliveryController.js';

export const deliveryRouter = Router();

deliveryRouter.post('/', authenticate(['user']), asyncHandler(createDelivery));
deliveryRouter.get('/', authenticate(['user']), asyncHandler(listMyDeliveries));
deliveryRouter.get('/active/me', authenticate(['user', 'driver']), asyncHandler(getMyActiveDelivery));
deliveryRouter.get('/:deliveryId', authenticate(['user', 'driver']), asyncHandler(getDelivery));
