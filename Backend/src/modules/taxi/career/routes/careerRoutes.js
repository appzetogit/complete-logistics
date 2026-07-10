import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { authenticate } from '../../middlewares/authMiddleware.js';
import {
  listActiveJobs,
  submitApplication,
  uploadApplicationFile,
  adminListJobs,
  adminCreateJob,
  adminUpdateJob,
  adminDeleteJob,
  adminListApplications,
  adminUpdateApplicationStatus,
  adminDeleteApplication
} from '../controllers/careerController.js';

export const careerRouter = Router();

// Public routes
careerRouter.get('/careers/jobs', asyncHandler(listActiveJobs));
careerRouter.post('/careers/applications', asyncHandler(submitApplication));
careerRouter.post('/careers/upload', asyncHandler(uploadApplicationFile));

// Admin routes (requires admin authentication)
careerRouter.get('/admin/careers/jobs', authenticate(['admin']), asyncHandler(adminListJobs));
careerRouter.post('/admin/careers/jobs', authenticate(['admin']), asyncHandler(adminCreateJob));
careerRouter.patch('/admin/careers/jobs/:id', authenticate(['admin']), asyncHandler(adminUpdateJob));
careerRouter.delete('/admin/careers/jobs/:id', authenticate(['admin']), asyncHandler(adminDeleteJob));

careerRouter.get('/admin/careers/applications', authenticate(['admin']), asyncHandler(adminListApplications));
careerRouter.patch('/admin/careers/applications/:id/status', authenticate(['admin']), asyncHandler(adminUpdateApplicationStatus));
careerRouter.delete('/admin/careers/applications/:id', authenticate(['admin']), asyncHandler(adminDeleteApplication));

