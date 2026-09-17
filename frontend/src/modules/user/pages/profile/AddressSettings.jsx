import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Briefcase, Home, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

const STORAGE_KEY = 'Appzeto 24:savedAddresses';

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultState = {
  home: {
    label: 'Home',
    address: 'Vijay Nagar, Indore',
    landmark: '',
    notes: '',
  },
  work: null,
  landmarks: [],
};

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <div className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">{label}</div>
    {children}
  </div>
);

const PrimaryButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] shadow-[0_16px_34px_rgba(15,23,42,0.18)] active:scale-95 transition-all ${className}`}
    {...props}
  >
    {children}
  </button>
);

const SecondaryButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white/75 backdrop-blur-md border border-white/80 text-slate-800 px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] shadow-[0_12px_26px_rgba(15,23,42,0.06)] active:scale-95 transition-all ${className}`}
    {...props}
  >
    {children}
  </button>
);

const AddressCard = ({ icon: Icon, title, subtitle, accentClass, onEdit, onDelete, isEmpty }) => (
  <motion.div
    whileTap={{ scale: 0.985 }}
    className="bg-white/80 backdrop-blur-md rounded-[22px] border border-white/80 shadow-[0_14px_34px_rgba(15,23,42,0.07)] p-4 flex items-start gap-4"
  >
    <div className={`w-12 h-12 rounded-2xl border border-white/80 bg-white/70 shadow-sm flex items-center justify-center shrink-0 ${accentClass}`}>
      <Icon size={22} strokeWidth={2.6} />
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-black text-slate-900 leading-none">{title}</div>
          <div className={`mt-1 text-[12px] font-bold ${isEmpty ? 'text-slate-400 italic' : 'text-slate-500'} truncate`}>
            {subtitle}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="w-9 h-9 rounded-full bg-slate-50 border border-white/80 shadow-sm flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
            aria-label={`Edit ${title}`}
          >
            <Pencil size={16} strokeWidth={2.8} />
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={onDelete}
              className="w-9 h-9 rounded-full bg-rose-50 border border-rose-100 shadow-sm flex items-center justify-center text-rose-500 active:scale-95 transition-transform"
              aria-label={`Delete ${title}`}
            >
              <Trash2 size={16} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
    </div>
  </motion.div>
);

const ModalShell = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4">
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-2xl backdrop-blur-md sm:max-h-[calc(100vh-2rem)]"
    >
      <div className="px-5 pt-5 pb-4 border-b border-white/70 bg-white/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[16px] font-black text-slate-900 tracking-tight">{title}</div>
            {subtitle && <div className="mt-1 text-[12px] font-bold text-slate-500">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/80 border border-white/80 shadow-sm flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.8} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
    </motion.div>
  </div>
);

const AddressSettings = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(defaultState);
  const [modal, setModal] = useState(null); // { mode: 'home'|'work'|'landmark', id?: string }
  const [confirmDelete, setConfirmDelete] = useState(null); // { mode: 'home'|'work'|'landmark', id?: string, title: string }

  const draftDefaults = useMemo(() => {
    const mode = modal?.mode;
    if (!mode) return null;
    if (mode === 'home') return data.home || defaultState.home;
    if (mode === 'work') return data.work || { label: 'Work', address: '', landmark: '', notes: '' };
    if (mode === 'landmark') {
      const existing = data.landmarks.find((l) => l.id === modal.id);
      return existing || { id: createId(), label: '', address: '', landmark: '', notes: '' };
    }
    return null;
  }, [data, modal]);

  const [draft, setDraft] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') setData({ ...defaultState, ...parsed });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [data]);

  useEffect(() => {
    if (!draftDefaults) {
      setDraft(null);
      return;
    }
    setDraft(draftDefaults);
  }, [draftDefaults]);

  const closeModal = () => setModal(null);

  const openEdit = (mode, id) => setModal({ mode, id });

  const saveDraft = () => {
    if (!modal || !draft) return;

    if (modal.mode === 'home') {
      setData((prev) => ({ ...prev, home: { ...prev.home, ...draft, label: 'Home' } }));
      closeModal();
      return;
    }

    if (modal.mode === 'work') {
      setData((prev) => ({ ...prev, work: { ...draft, label: 'Work' } }));
      closeModal();
      return;
    }

    if (modal.mode === 'landmark') {
      if (!draft.label.trim() || !draft.address.trim()) return;
      setData((prev) => {
        const exists = prev.landmarks.some((l) => l.id === draft.id);
        const nextLandmarks = exists
          ? prev.landmarks.map((l) => (l.id === draft.id ? { ...draft } : l))
          : [{ ...draft }, ...prev.landmarks];
        return { ...prev, landmarks: nextLandmarks };
      });
      closeModal();
    }
  };

  const doDelete = () => {
    if (!confirmDelete) return;

    if (confirmDelete.mode === 'home') {
      setData((prev) => ({ ...prev, home: { ...prev.home, address: '', landmark: '', notes: '' } }));
    } else if (confirmDelete.mode === 'work') {
      setData((prev) => ({ ...prev, work: null }));
    } else if (confirmDelete.mode === 'landmark') {
      setData((prev) => ({ ...prev, landmarks: prev.landmarks.filter((l) => l.id !== confirmDelete.id) }));
    }

    setConfirmDelete(null);
  };

  const homeSubtitle = data.home?.address?.trim() ? data.home.address : 'Add your home address';
  const workSubtitle = data.work?.address?.trim() ? data.work.address : 'Add your office address';
  const hasLandmarks = data.landmarks.length > 0;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto flex flex-col font-sans pb-8 relative overflow-x-hidden">
      <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-orange-100/55 blur-3xl pointer-events-none" />
      <div className="absolute top-64 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl pointer-events-none" />
      <div className="absolute bottom-24 right-[-40px] h-44 w-44 rounded-full bg-blue-100/50 blur-3xl pointer-events-none" />

      <header className="sticky top-0 z-30">
        <div className="bg-white/70 backdrop-blur-md border-b border-white/70 shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
          <div className="px-5 py-4 flex items-center gap-3">
            <button onClick={() => navigate('/taxi/user/profile')} className="p-2 -ml-2 active:scale-95 transition-all rounded-full">
              <ArrowLeft size={22} className="text-slate-900" strokeWidth={3} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Profile</p>
              <h1 className="mt-1 text-[18px] font-black text-slate-900 tracking-tight leading-none truncate">
                Addresses
              </h1>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-5 pt-5 space-y-5 flex-1">
        <div className="space-y-3">
          <AddressCard
            icon={Home}
            title="Home"
            subtitle={homeSubtitle}
            accentClass="text-orange-600"
            isEmpty={!data.home?.address?.trim()}
            onEdit={() => openEdit('home')}
            onDelete={() => setConfirmDelete({ mode: 'home', title: 'Home address' })}
          />
          <AddressCard
            icon={Briefcase}
            title="Work"
            subtitle={workSubtitle}
            accentClass="text-indigo-600"
            isEmpty={!data.work?.address?.trim()}
            onEdit={() => openEdit('work')}
            onDelete={() => setConfirmDelete({ mode: 'work', title: 'Work address' })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Landmarks</div>
              <div className="mt-1 text-[15px] font-black text-slate-900 tracking-tight">Saved places</div>
            </div>
            <button
              type="button"
              onClick={() => openEdit('landmark')}
              className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-md border border-white/80 px-3 py-2 text-[11px] font-black text-slate-700 shadow-[0_10px_18px_rgba(15,23,42,0.05)] active:scale-95 transition-all"
            >
              <Plus size={14} strokeWidth={3} />
              Add
            </button>
          </div>

          {hasLandmarks ? (
            <div className="bg-white/75 backdrop-blur-md rounded-[22px] border border-white/80 shadow-[0_14px_34px_rgba(15,23,42,0.06)] overflow-hidden">
              {data.landmarks.map((lm) => (
                <div key={lm.id} className="flex flex-wrap items-start gap-3 border-b border-white/70 px-4 py-3 last:border-none">
                  <div className="w-10 h-10 rounded-2xl bg-white/70 border border-white/80 shadow-sm flex items-center justify-center shrink-0 text-slate-500">
                    <MapPin size={18} strokeWidth={2.6} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-black text-slate-900 truncate">{lm.label}</div>
                    <div className="mt-1 text-[12px] font-bold text-slate-500 truncate">{lm.address}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit('landmark', lm.id)}
                      className="w-9 h-9 rounded-full bg-slate-50 border border-white/80 shadow-sm flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
                      aria-label={`Edit ${lm.label}`}
                    >
                      <Pencil size={16} strokeWidth={2.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ mode: 'landmark', id: lm.id, title: lm.label })}
                      className="w-9 h-9 rounded-full bg-rose-50 border border-rose-100 shadow-sm flex items-center justify-center text-rose-500 active:scale-95 transition-transform"
                      aria-label={`Delete ${lm.label}`}
                    >
                      <Trash2 size={16} strokeWidth={2.6} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/70 backdrop-blur-md rounded-[22px] border border-white/80 shadow-[0_14px_34px_rgba(15,23,42,0.06)] p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/70 border border-white/80 shadow-sm flex items-center justify-center mx-auto text-slate-400">
                <MapPin size={20} strokeWidth={2.6} />
              </div>
              <div className="mt-3 text-[14px] font-black text-slate-900">No landmarks yet</div>
              <div className="mt-1 text-[12px] font-bold text-slate-500">
                Save places like “Gym”, “Mom’s house”, or “Office gate”.
              </div>
              <div className="mt-4">
                <SecondaryButton onClick={() => openEdit('landmark')}>
                  <Plus size={14} strokeWidth={3} />
                  Add landmark
                </SecondaryButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {modal && draft && (
          <ModalShell
            title={
              modal.mode === 'home'
                ? 'Edit home'
                : modal.mode === 'work'
                  ? 'Edit work'
                  : modal.id
                    ? 'Edit landmark'
                    : 'Add landmark'
            }
            subtitle={modal.mode === 'landmark' ? 'Save a place for quick access.' : 'Update your saved address.'}
            onClose={closeModal}
          >
            <div className="space-y-4">
              {modal.mode === 'landmark' && (
                <Field label="Label">
                  <input
                    value={draft.label}
                    onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                    placeholder="e.g., Gym, Office gate"
                    className="w-full h-12 rounded-2xl bg-white/80 border border-white/80 shadow-sm px-4 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </Field>
              )}

              <Field label="Address">
                <textarea
                  value={draft.address}
                  onChange={(e) => setDraft((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Add full address"
                  rows={3}
                  className="w-full rounded-2xl bg-white/80 border border-white/80 shadow-sm px-4 py-3 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-none"
                />
              </Field>

              <Field label="Landmark (Optional)">
                <input
                  value={draft.landmark}
                  onChange={(e) => setDraft((prev) => ({ ...prev, landmark: e.target.value }))}
                  placeholder="Near…"
                  className="w-full h-12 rounded-2xl bg-white/80 border border-white/80 shadow-sm px-4 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </Field>

              <Field label="Notes (Optional)">
                <input
                  value={draft.notes}
                  onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g., Ring bell, call on arrival"
                  className="w-full h-12 rounded-2xl bg-white/80 border border-white/80 shadow-sm px-4 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </Field>

              <div className="pt-2 space-y-2.5">
                <PrimaryButton onClick={saveDraft}>
                  {modal.mode === 'landmark' ? 'Save landmark' : 'Save address'}
                </PrimaryButton>
                <SecondaryButton onClick={closeModal}>Cancel</SecondaryButton>
              </div>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full max-w-sm rounded-[26px] bg-white/92 backdrop-blur-md border border-white/80 shadow-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-black text-slate-900">Delete</div>
                  <div className="mt-1 text-[12px] font-bold text-slate-500">
                    Remove <span className="text-slate-900">{confirmDelete.title}</span> from saved addresses?
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="w-10 h-10 rounded-full bg-white/80 border border-white/80 shadow-sm flex items-center justify-center text-slate-500 active:scale-95 transition-transform"
                  aria-label="Close"
                >
                  <X size={18} strokeWidth={2.8} />
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 rounded-2xl bg-white/75 backdrop-blur-md border border-white/80 px-4 py-3 text-[12px] font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={doDelete}
                  className="flex-1 rounded-2xl bg-rose-600 px-4 py-3 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_34px_rgba(225,29,72,0.22)] active:scale-95 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddressSettings;
