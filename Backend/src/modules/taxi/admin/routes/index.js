import { Router } from 'express';
import { adminRouter } from './adminRoutes.js';

export const adminModuleRouter = Router();

adminModuleRouter.use('/', adminRouter);
