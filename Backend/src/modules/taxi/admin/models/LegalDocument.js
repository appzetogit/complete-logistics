import mongoose from 'mongoose';

// One list, so adding a new page (FAQ, safety tips, ...) is one line.
export const LEGAL_DOCUMENT_TYPES = ['about', 'privacy', 'terms', 'refund', 'cancellation', 'driver_agreement'];
export const LEGAL_AUDIENCES = ['user', 'driver', 'all'];

// One row per (type, audience, language). `title` / `body` are what the apps see (only while `status` is
// 'published'). Edits are saved into `draft_*` and go live on publish, so saving a draft never changes the apps.
const legalDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: LEGAL_DOCUMENT_TYPES, trim: true, lowercase: true },
    audience: { type: String, required: true, enum: LEGAL_AUDIENCES, default: 'all', trim: true, lowercase: true },
    language_code: { type: String, required: true, trim: true, lowercase: true, default: 'en' },
    title: { type: String, default: '', trim: true },
    body: { type: String, default: '' },
    draft_title: { type: String, default: '', trim: true },
    draft_body: { type: String, default: '' },
    has_draft: { type: Boolean, default: false },
    version: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    published_at: { type: Date, default: null },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiAdmin', default: null },
  },
  { timestamps: true },
);

legalDocumentSchema.index({ type: 1, audience: 1, language_code: 1 }, { unique: true });

export const LegalDocument =
  mongoose.models.TaxiLegalDocument || mongoose.model('TaxiLegalDocument', legalDocumentSchema);
