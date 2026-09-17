import { Router } from 'express';
import { deliveryRouter } from './deliveryRoutes.js';
import { promoRouter } from './promoRoutes.js';
import { rideRouter } from './rideRoutes.js';
import { userRouter } from './userRoutes.js';
import { getUserHomeManagement } from '../../admin/controllers/adminController.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

export const userModuleRouter = Router();

userModuleRouter.get('/user-home-management', asyncHandler(getUserHomeManagement));
userModuleRouter.use('/users', userRouter);
userModuleRouter.use('/rides', rideRouter);
userModuleRouter.use('/deliveries', deliveryRouter);
userModuleRouter.use('/promos', promoRouter);
