import { Router } from 'express';
import { chatRouter } from './chatRoutes.js';

export const chatModuleRouter = Router();

chatModuleRouter.use('/chats', chatRouter);
