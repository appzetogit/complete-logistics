import { Router } from 'express';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { referralAttributeRateLimit, referralLinkRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import { claimReferralAttribution, openReferralLink } from '../controllers/referralController.js';

// Mounted at the site root (not under /api): the link people share is https://<domain>/r/<code>.
export const referralLinkRouter = Router();
referralLinkRouter.get('/r/:referralCode', referralLinkRateLimit, openReferralLink);

// Mounted under /api and /api/v1 with the other modules.
export const referralRouter = Router();
referralRouter.post('/referrals/attribute', referralAttributeRateLimit, asyncHandler(claimReferralAttribution));
