import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  adminCreateSupportTitle,
  adminDeleteSupportTitle,
  adminGetSupportTicketDetail,
  adminListSupportTickets,
  adminListSupportTitles,
  adminReplySupportTicket,
  adminSupportTicketStats,
  adminUpdateSupportTicket,
  adminUpdateSupportTitle,
  createSupportTicket,
  getMySupportTicketDetail,
  getSupportTitlesForRequester,
  listMySupportTickets,
  replyMySupportTicket,
} from '../controllers/supportController.js';

export const supportRouter = Router();

supportRouter.get(
  '/support/titles',
  authenticate(['admin', 'user', 'driver', 'owner']),
  asyncHandler(getSupportTitlesForRequester),
);
supportRouter.post(
  '/support/tickets',
  authenticate(['user', 'driver', 'owner']),
  asyncHandler(createSupportTicket),
);
supportRouter.get(
  '/support/tickets/my',
  authenticate(['user', 'driver', 'owner']),
  asyncHandler(listMySupportTickets),
);
supportRouter.get(
  '/support/tickets/:ticketCode',
  authenticate(['user', 'driver', 'owner']),
  asyncHandler(getMySupportTicketDetail),
);
supportRouter.post(
  '/support/tickets/:ticketCode/reply',
  authenticate(['user', 'driver', 'owner']),
  asyncHandler(replyMySupportTicket),
);

supportRouter.get(
  '/admin/support/titles',
  authenticate(['admin']),
  asyncHandler(adminListSupportTitles),
);
supportRouter.post(
  '/admin/support/titles',
  authenticate(['admin']),
  asyncHandler(adminCreateSupportTitle),
);
supportRouter.patch(
  '/admin/support/titles/:titleId',
  authenticate(['admin']),
  asyncHandler(adminUpdateSupportTitle),
);
supportRouter.delete(
  '/admin/support/titles/:titleId',
  authenticate(['admin']),
  asyncHandler(adminDeleteSupportTitle),
);

supportRouter.get(
  '/admin/support/tickets/stats',
  authenticate(['admin']),
  asyncHandler(adminSupportTicketStats),
);
supportRouter.get(
  '/admin/support/tickets',
  authenticate(['admin']),
  asyncHandler(adminListSupportTickets),
);
supportRouter.get(
  '/admin/support/tickets/:ticketCode',
  authenticate(['admin']),
  asyncHandler(adminGetSupportTicketDetail),
);
supportRouter.patch(
  '/admin/support/tickets/:ticketCode',
  authenticate(['admin']),
  asyncHandler(adminUpdateSupportTicket),
);
supportRouter.post(
  '/admin/support/tickets/:ticketCode/reply',
  authenticate(['admin']),
  asyncHandler(adminReplySupportTicket),
);
