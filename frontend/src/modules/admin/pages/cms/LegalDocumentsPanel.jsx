import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Edit2, FileText, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { adminService } from '../../services/adminService';

// Same list as LEGAL_DOCUMENT_TYPES on the backend.
const DOCUMENT_TYPES = [
  { type: 'about', label: 'About Us' },
  { type: 'privacy', label: 'Privacy Policy' },
  { type: 'terms', label: 'Terms & Conditions' },
  { type: 'refund', label: 'Refund Policy' },
  { type: 'cancellation', label: 'Cancellation Policy' },
  { type: 'driver_agreement', label: 'Driver Agreement' },
];
const AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'user', label: 'Riders (user app)' },
  { value: 'driver', label: 'Drivers (driver app)' },
];
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
];

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const labelOf = (list, value, key = 'value') => list.find((item) => item[key] === value)?.label || value;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const LegalDocumentsPanel = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editor, setEditor] = useState(null); // null = closed
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'error', text }

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const data = unwrap(await adminService.getLegalDocuments());
      setDocuments(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      setLoadError(error?.message || 'Could not load the documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const byType = useMemo(() => {
    const groups = {};
    DOCUMENT_TYPES.forEach(({ type }) => { groups[type] = []; });
    documents.forEach((doc) => {
      (groups[doc.type] ||= []).push(doc);
    });
    return groups;
  }, [documents]);

  const openNew = (type) => setEditor({ id: null, type, audience: type === 'terms' ? 'user' : 'all', language_code: 'en', title: labelOf(DOCUMENT_TYPES, type, 'type'), body: '', status: 'draft', version: 0, has_draft: false });

  const openExisting = async (doc) => {
    setNotice(null);
    setBusy(`open-${doc.id}`);
    try {
      setEditor(unwrap(await adminService.getLegalDocument(doc.id)));
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Could not open the document' });
    } finally {
      setBusy('');
    }
  };

  const run = async (name, action, okText) => {
    setNotice(null);
    setBusy(name);
    try {
      const result = await action();
      setNotice({ kind: 'ok', text: okText });
      await refresh();
      return result;
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Something went wrong' });
      return null;
    } finally {
      setBusy('');
    }
  };

  const saveDraft = async () => {
    const saved = await run('save', async () => unwrap(await adminService.saveLegalDraft(editor.type, {
      audience: editor.audience,
      language_code: editor.language_code,
      title: editor.title,
      body: editor.body,
    })), 'Draft saved. The apps and website still show the published text.');
    if (saved) setEditor((current) => ({ ...current, ...saved }));
    return saved;
  };

  const publish = async () => {
    // Publish what is on screen: save it as the draft first, then make the draft live.
    const saved = await saveDraft();
    if (!saved) return;
    const published = await run('publish', async () => unwrap(await adminService.publishLegalDocument(saved.id)), 'Published. It is now visible in the apps and on the website.');
    if (published) setEditor((current) => ({ ...current, ...published }));
  };

  const unpublish = async () => {
    const hidden = await run('unpublish', async () => unwrap(await adminService.unpublishLegalDocument(editor.id)), 'Unpublished. The apps now use their built-in text for this page.');
    if (hidden) setEditor((current) => ({ ...current, ...hidden }));
  };

  const remove = async () => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    const done = await run('delete', () => adminService.deleteLegalDocument(editor.id), 'Document deleted.');
    if (done) setEditor(null);
  };

  const isNew = !editor?.id;
  const canSave = Boolean(editor?.body?.trim()) && !busy;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-gray-900 tracking-tight">Legal & About Content</h3>
      </div>

      {notice && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] font-bold ${notice.kind === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      {loading && <div className="flex items-center gap-2 text-[12px] font-bold text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading...</div>}
      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] font-bold text-red-700">{loadError}</div>}

      {!loading && !loadError && (
        <div className="space-y-4">
          {DOCUMENT_TYPES.map(({ type, label }) => (
            <div key={type} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400"><FileText size={20} /></div>
                  <div>
                    <h4 className="text-[14px] font-black text-gray-900">{label}</h4>
                    <p className="text-[11px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">
                      {byType[type].length ? `${byType[type].length} version${byType[type].length > 1 ? 's' : ''}` : 'Not written yet (the apps use their built-in text)'}
                    </p>
                  </div>
                </div>
                <button onClick={() => openNew(type)} className="px-3 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                  <Plus size={14} /> Add
                </button>
              </div>

              {byType[type].length > 0 && (
                <div className="mt-4 divide-y divide-gray-50 border-t border-gray-50">
                  {byType[type].map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="text-[12px] font-bold text-gray-700">
                        {labelOf(AUDIENCES, doc.audience)} · {labelOf(LANGUAGES, doc.language_code)}
                        <span className={`ml-3 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${doc.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {doc.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        {doc.has_draft && doc.status === 'published' && (
                          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">Unpublished changes</span>
                        )}
                        <span className="ml-3 text-[11px] font-bold text-gray-400">v{doc.version} · Last updated {formatDate(doc.published_at || doc.updatedAt)}</span>
                      </div>
                      <button onClick={() => openExisting(doc)} disabled={Boolean(busy)} className="px-4 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                        {busy === `open-${doc.id}` ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />} Edit Content
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-900">{labelOf(DOCUMENT_TYPES, editor.type, 'type')}</h3>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                  {isNew ? 'New document' : `${editor.status === 'published' ? 'Published' : 'Draft'} · version ${editor.version}`}
                </p>
              </div>
              <button onClick={() => setEditor(null)} className="p-2 text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                Shown to
                <select
                  value={editor.audience}
                  disabled={!isNew}
                  onChange={(event) => setEditor({ ...editor, audience: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-bold normal-case tracking-normal text-gray-800 disabled:bg-gray-50"
                >
                  {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                Language
                <select
                  value={editor.language_code}
                  disabled={!isNew}
                  onChange={(event) => setEditor({ ...editor, language_code: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-bold normal-case tracking-normal text-gray-800 disabled:bg-gray-50"
                >
                  {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500">
              Title
              <input
                value={editor.title}
                maxLength={150}
                onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-bold normal-case tracking-normal text-gray-800"
              />
            </label>

            <label className="block text-[11px] font-black uppercase tracking-widest text-gray-500">
              Text (plain text, a blank line starts a new paragraph, no HTML)
              <textarea
                value={editor.body}
                onChange={(event) => setEditor({ ...editor, body: event.target.value })}
                rows={16}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[12px] normal-case tracking-normal text-gray-800"
              />
            </label>

            <p className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-[11px] font-bold text-amber-800">
              Save draft keeps the change private. Publish makes this text visible to all apps and the website immediately.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                {!isNew && (
                  <button onClick={remove} disabled={Boolean(busy)} className="px-4 py-2 text-[12px] font-bold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 disabled:opacity-50">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {!isNew && editor.status === 'published' && (
                  <button onClick={unpublish} disabled={Boolean(busy)} className="px-4 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    {busy === 'unpublish' ? 'Working...' : 'Unpublish'}
                  </button>
                )}
                <button onClick={saveDraft} disabled={!canSave} className="px-4 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50">
                  {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
                </button>
                <button onClick={publish} disabled={!canSave} className="px-5 py-2 bg-black text-white rounded-lg text-[12px] font-bold hover:opacity-90 flex items-center gap-2 disabled:opacity-50">
                  {busy === 'publish' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Publish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalDocumentsPanel;
