import { asyncHandler } from '../../../../utils/asyncHandler.js';
import {
  deleteLegalDocument,
  getLegalDocumentForAdmin,
  listLegalDocumentsForAdmin,
  publishLegalDocument,
  saveLegalDraft,
  unpublishLegalDocument,
} from '../../services/legalContentService.js';

const adminIdOf = (req) => req.auth?.admin?._id || req.auth?.admin?.id || null;

export const listLegal = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { results: await listLegalDocumentsForAdmin(req.query || {}) } });
});

export const getLegal = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getLegalDocumentForAdmin(req.params.id) });
});

export const saveLegal = asyncHandler(async (req, res) => {
  const { audience, language_code: languageCode, title, body } = req.body || {};
  const data = await saveLegalDraft({ type: req.params.type, audience, language_code: languageCode, title, body }, adminIdOf(req));
  res.json({ success: true, data });
});

export const publishLegal = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await publishLegalDocument(req.params.id, adminIdOf(req)) });
});

export const unpublishLegal = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await unpublishLegalDocument(req.params.id, adminIdOf(req)) });
});

export const removeLegal = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await deleteLegalDocument(req.params.id) });
});
