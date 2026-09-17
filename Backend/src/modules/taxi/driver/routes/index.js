import { Router } from 'express';
import { driverRouter } from './driverRoutes.js';

export const driverModuleRouter = Router();

driverModuleRouter.use('/drivers', driverRouter);
