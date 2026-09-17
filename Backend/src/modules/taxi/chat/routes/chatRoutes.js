import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  deleteSupportConversation,
  getSupportConversationList,
  getSupportConversationMessages,
  markSupportConversationRead,
  sendSupportMessage,
} from '../controllers/chatController.js';

export const chatRouter = Router();

chatRouter.use(authenticate(['admin', 'user', 'driver'], { allowPending: true }));

chatRouter.get('/conversations', asyncHandler(getSupportConversationList));
chatRouter.get('/messages/:conversationKey', asyncHandler(getSupportConversationMessages));
chatRouter.patch('/messages/:conversationKey/read', asyncHandler(markSupportConversationRead));
chatRouter.post('/messages', asyncHandler(sendSupportMessage));
chatRouter.delete('/messages/:conversationKey', asyncHandler(deleteSupportConversation));
