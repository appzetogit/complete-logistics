import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { LEGAL_AUDIENCES, LEGAL_DOCUMENT_TYPES, LegalDocument } from '../admin/models/LegalDocument.js';

export const MAX_LEGAL_BODY_BYTES = 500 * 1024;
export const MAX_LEGAL_TITLE_LENGTH = 150;
const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[a-z]{2})?$/;
// Plain text only: anything that looks like an HTML tag or comment is refused, never stripped silently.
const HTML_PATTERN = /<\/?[a-z!][^<>]*>|<!--/i;

const normalizeType = (value) => {
  const type = String(value || '').trim().toLowerCase();
  if (!LEGAL_DOCUMENT_TYPES.includes(type)) {
    throw new ApiError(400, `type must be one of: ${LEGAL_DOCUMENT_TYPES.join(', ')}`);
  }
  return type;
};

const normalizeAudience = (value, fallback = 'all') => {
  const audience = String(value || fallback).trim().toLowerCase();
  if (!LEGAL_AUDIENCES.includes(audience)) {
    throw new ApiError(400, `audience must be one of: ${LEGAL_AUDIENCES.join(', ')}`);
  }
  return audience;
};

const normalizeLanguage = (value, fallback = DEFAULT_LANGUAGE) => {
  const language = String(value || fallback).trim().toLowerCase().replace('_', '-');
  if (!LANGUAGE_PATTERN.test(language)) {
    throw new ApiError(400, 'language_code must look like "en", "hi" or "pt-br"');
  }
  return language;
};

/** Validates and cleans the text of a document. Throws a 400 for anything that is not plain text. */
export const cleanLegalText = ({ title, body }) => {
  const cleanTitle = String(title ?? '').trim();
  const cleanBody = String(body ?? '').replace(/\r\n?/g, '\n').trim();

  if (cleanTitle.length > MAX_LEGAL_TITLE_LENGTH) {
    throw new ApiError(400, `title can be at most ${MAX_LEGAL_TITLE_LENGTH} characters`);
  }
  if (Buffer.byteLength(cleanBody, 'utf8') > MAX_LEGAL_BODY_BYTES) {
    throw new ApiError(400, `body can be at most ${MAX_LEGAL_BODY_BYTES / 1024} KB`);
  }
  if (HTML_PATTERN.test(cleanTitle) || HTML_PATTERN.test(cleanBody)) {
    throw new ApiError(400, 'Only plain text is allowed (remove the HTML tags)');
  }

  return { title: cleanTitle, body: cleanBody };
};

// ------------------------------------------------------------------ public

const publicShape = (doc, requested) => ({
  type: doc.type,
  audience: doc.audience,
  language: doc.language_code,
  requestedLanguage: requested,
  title: doc.title,
  body: doc.body,
  version: doc.version,
  updatedAt: (doc.published_at || doc.updatedAt || null),
});

/**
 * The published document for the app: the asked language, then English; for each of those the asked audience,
 * then 'all'. A draft is never returned. Returns null when nothing is published.
 */
export const getPublishedLegalDocument = async ({ type, audience, lang } = {}) => {
  const docType = normalizeType(type);
  const wantedAudience = normalizeAudience(audience);
  const wantedLanguage = normalizeLanguage(lang);

  const languages = [...new Set([wantedLanguage, DEFAULT_LANGUAGE])];
  const audiences = [...new Set([wantedAudience, 'all'])];

  const rows = await LegalDocument.find({
    type: docType,
    status: 'published',
    audience: { $in: audiences },
    language_code: { $in: languages },
  }).lean();

  for (const language of languages) {
    for (const aud of audiences) {
      const found = rows.find((row) => row.language_code === language && row.audience === aud);
      if (found) {
        return publicShape(found, wantedLanguage);
      }
    }
  }

  return null;
};

/** The menu for the app: what is published, without the text. */
export const listPublishedLegalDocuments = async ({ audience, lang } = {}) => {
  const wantedAudience = audience ? normalizeAudience(audience) : null;
  const wantedLanguage = lang ? normalizeLanguage(lang) : null;

  const query = { status: 'published' };
  if (wantedAudience) {
    query.audience = { $in: [wantedAudience, 'all'] };
  }
  if (wantedLanguage) {
    query.language_code = { $in: [...new Set([wantedLanguage, DEFAULT_LANGUAGE])] };
  }

  const rows = await LegalDocument.find(query).select('-body -draft_body').sort({ type: 1, audience: 1, language_code: 1 }).lean();

  return rows.map((row) => ({
    type: row.type,
    audience: row.audience,
    language: row.language_code,
    title: row.title,
    version: row.version,
    updatedAt: row.published_at || row.updatedAt || null,
  }));
};

// ------------------------------------------------------------------ admin

const adminShape = (doc, { withBody = true } = {}) => {
  // What the admin edits: the draft if there is one, else what is live.
  const editingTitle = doc.has_draft ? doc.draft_title : doc.title;
  const editingBody = doc.has_draft ? doc.draft_body : doc.body;

  return {
    id: String(doc._id),
    type: doc.type,
    audience: doc.audience,
    language_code: doc.language_code,
    status: doc.status,
    version: doc.version,
    has_draft: Boolean(doc.has_draft),
    title: editingTitle || '',
    live_title: doc.title || '',
    published_at: doc.published_at || null,
    updated_by: doc.updated_by ? String(doc.updated_by) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(withBody ? { body: editingBody || '', live_body: doc.body || '' } : {}),
  };
};

const loadById = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, 'Document not found');
  }
  const doc = await LegalDocument.findById(id);
  if (!doc) {
    throw new ApiError(404, 'Document not found');
  }
  return doc;
};

export const listLegalDocumentsForAdmin = async (filters = {}) => {
  const query = {};
  if (filters.type) query.type = normalizeType(filters.type);
  if (filters.audience) query.audience = normalizeAudience(filters.audience);
  if (filters.language_code) query.language_code = normalizeLanguage(filters.language_code);
  if (filters.status) {
    const status = String(filters.status).trim().toLowerCase();
    if (!['draft', 'published'].includes(status)) {
      throw new ApiError(400, 'status must be draft or published');
    }
    query.status = status;
  }

  const rows = await LegalDocument.find(query).select('-body -draft_body').sort({ type: 1, audience: 1, language_code: 1 }).lean();
  return rows.map((row) => adminShape(row, { withBody: false }));
};

export const getLegalDocumentForAdmin = async (id) => adminShape(await loadById(id));

/** Creates the document or saves a draft. The live text (what the apps see) is not touched. */
export const saveLegalDraft = async ({ type, audience, language_code, title, body }, adminId = null) => {
  const docType = normalizeType(type);
  const docAudience = normalizeAudience(audience);
  const docLanguage = normalizeLanguage(language_code);
  const clean = cleanLegalText({ title, body });

  const doc = await LegalDocument.findOneAndUpdate(
    { type: docType, audience: docAudience, language_code: docLanguage },
    {
      $set: {
        draft_title: clean.title,
        draft_body: clean.body,
        has_draft: true,
        updated_by: adminId || null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return adminShape(doc);
};

/** Makes the draft live for all apps and the website. Publishing again with no new draft changes nothing. */
export const publishLegalDocument = async (id, adminId = null) => {
  const doc = await loadById(id);

  if (!doc.has_draft && doc.status === 'published') {
    return adminShape(doc);
  }

  const nextTitle = doc.has_draft ? doc.draft_title : doc.title;
  const nextBody = doc.has_draft ? doc.draft_body : doc.body;
  if (!String(nextBody || '').trim()) {
    throw new ApiError(400, 'The document is empty, write the text before publishing');
  }

  doc.title = nextTitle;
  doc.body = nextBody;
  doc.draft_title = '';
  doc.draft_body = '';
  doc.has_draft = false;
  doc.status = 'published';
  doc.version = Number(doc.version || 0) + 1;
  doc.published_at = new Date();
  doc.updated_by = adminId || null;
  await doc.save();

  return adminShape(doc);
};

/** Hides it from the apps. The text is kept as a draft so it can be edited and published again. */
export const unpublishLegalDocument = async (id, adminId = null) => {
  const doc = await loadById(id);

  if (doc.status !== 'published') {
    return adminShape(doc);
  }

  if (!doc.has_draft) {
    doc.draft_title = doc.title;
    doc.draft_body = doc.body;
    doc.has_draft = true;
  }
  doc.status = 'draft';
  doc.updated_by = adminId || null;
  await doc.save();

  return adminShape(doc);
};

export const deleteLegalDocument = async (id) => {
  const doc = await loadById(id);
  await doc.deleteOne();
  return { id: String(doc._id) };
};
