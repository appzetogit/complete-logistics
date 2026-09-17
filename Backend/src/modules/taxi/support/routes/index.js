import { Router } from 'express';
import { supportRouter } from './supportRoutes.js';

export const supportModuleRouter = Router();

supportModuleRouter.use(supportRouter);
