import { asyncHandler } from '../../../../../utils/asyncHandler.js';
import * as promotionsService from '../services/promotionsService.js';

const ok = (res, data, extra = {}) => res.json({ success: true, data, ...extra });

export const getPromotionsBootstrap = asyncHandler(async (_req, res) =>
  ok(res, await promotionsService.getPromotionsBootstrap()),
);

export const getPromoCodes = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.listPromoCodes(req.query)),
);

export const createPromoCode = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.createPromoCode(req.body)),
);

export const updatePromoCode = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.updatePromoCode(req.params.id, req.body)),
);

export const deletePromoCode = asyncHandler(async (req, res) => {
  await promotionsService.deletePromoCode(req.params.id);
  ok(res, { deleted: true });
});

export const togglePromoCodeStatus = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.togglePromoCodeStatus(req.params.id)),
);

export const getNotifications = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.listNotifications(req.query)),
);

export const sendNotification = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.createNotification(req.body)),
);

export const deleteNotification = asyncHandler(async (req, res) => {
  await promotionsService.deleteNotification(req.params.id);
  ok(res, { deleted: true });
});

export const getBanners = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.listBanners(req.query)),
);

export const createBanner = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.createBanner(req.body)),
);

export const updateBanner = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.updateBanner(req.params.id, req.body)),
);

export const deleteBanner = asyncHandler(async (req, res) => {
  await promotionsService.deleteBanner(req.params.id);
  ok(res, { deleted: true });
});

export const pushBanner = asyncHandler(async (req, res) =>
  ok(res, await promotionsService.pushBanner(req.params.id)),
);

export const getPromotionsUsers = asyncHandler(async (_req, res) =>
  ok(res, { results: await promotionsService.listAdminUsersForPromotions() }),
);

export const getPromotionsServiceLocations = asyncHandler(async (_req, res) =>
  ok(res, { results: await promotionsService.listServiceLocationsForPromotions() }),
);
