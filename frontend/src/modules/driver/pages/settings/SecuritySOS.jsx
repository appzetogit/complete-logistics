import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ShieldCheck,
  Phone,
  Plus,
  Trash2,
  Zap,
  X,
  CheckCircle2,
  User,
  Smartphone,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addDriverEmergencyContact,
  deleteDriverEmergencyContact,
  getDriverEmergencyContacts,
} from '../../services/registrationService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { triggerDriverSosAlert } from '../../../../shared/services/safetyAlertService';

const MAX_CONTACTS = 5;
const PHONE_REGEX = /^\d{10}$/;
const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const normalizeName = (value) => String(value || '').replace(/[^A-Za-z .'-]/g, '').replace(/\s+/g, ' ');

const SecuritySOS = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const canUseContactPicker =
    typeof navigator !== 'undefined' &&
    navigator.contacts &&
    typeof navigator.contacts.select === 'function';

  const remainingSlots = useMemo(
    () => Math.max(0, MAX_CONTACTS - contacts.length),
    [contacts.length],
  );

  const resetForm = () => {
    setName('');
    setPhone('');
    setErrors({});
  };

  const loadContacts = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await getDriverEmergencyContacts();
      setContacts(response?.data?.results || []);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to load emergency contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (!showToast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShowToast(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  const validateContact = (contactName, contactPhone) => {
    const nextErrors = {};
    const trimmedName = String(contactName || '').trim();
    const normalizedPhone = normalizePhone(contactPhone);

    if (!trimmedName) {
      nextErrors.name = 'Name is required';
    } else if (!NAME_REGEX.test(trimmedName)) {
      nextErrors.name = 'Use alphabets only for the contact name';
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
      nextErrors.phone = 'Enter a valid 10-digit mobile number';
    }

    if (contacts.some((contact) => normalizePhone(contact.phone) === normalizedPhone)) {
      nextErrors.phone = 'This number is already added';
    }

    setErrors(nextErrors);

    return {
      isValid: Object.keys(nextErrors).length === 0,
      name: trimmedName,
      phone: normalizedPhone,
    };
  };

  const handleAddContact = async ({ contactName, contactPhone, source = 'manual' }) => {
    const result = validateContact(contactName, contactPhone);

    if (!result.isValid) {
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      setError(`You can add up to ${MAX_CONTACTS} emergency contacts`);
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const response = await addDriverEmergencyContact({
        name: result.name,
        phone: result.phone,
        source,
      });

      setContacts((prev) => [...prev, response?.data || {}]);
      resetForm();
      setShowAddSheet(false);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to add emergency contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteTarget?.id) {
      return;
    }

    setIsDeletingId(deleteTarget.id);
    setError('');

    try {
      await deleteDriverEmergencyContact(deleteTarget.id);
      setContacts((prev) => prev.filter((contact) => contact.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError?.message || 'Unable to remove emergency contact');
    } finally {
      setIsDeletingId('');
    }
  };

  const handlePickFromDevice = async () => {
    if (!canUseContactPicker) {
      setError('Phone contact selection is not supported on this device/browser');
      return;
    }

    if (contacts.length >= MAX_CONTACTS) {
      setError(`You can add up to ${MAX_CONTACTS} emergency contacts`);
      return;
    }

    setError('');

    try {
      const [pickedContact] = await navigator.contacts.select(['name', 'tel'], {
        multiple: false,
      });

      if (!pickedContact) {
        return;
      }

      const pickedName = Array.isArray(pickedContact.name)
        ? pickedContact.name[0]
        : pickedContact.name || '';
      const pickedPhone = Array.isArray(pickedContact.tel)
        ? pickedContact.tel[0]
        : pickedContact.tel || '';

      setName(normalizeName(pickedName).trim());
      setPhone(normalizePhone(pickedPhone));
      setShowAddSheet(true);

      await handleAddContact({
        contactName: pickedName,
        contactPhone: pickedPhone,
        source: 'device',
      });
    } catch (requestError) {
      if (requestError?.name === 'AbortError') {
        return;
      }

      setError(requestError?.message || 'Unable to read device contacts');
    }
  };

  const triggerSOS = () => {
    setShowToast(true);
    triggerDriverSosAlert()
      .catch((requestError) => {
        console.error('Failed to trigger driver SOS:', requestError);
        setError(requestError?.message || 'Unable to alert safety center');
      })
      .finally(() => {
        window.setTimeout(() => {
          window.open('tel:112', '_self');
        }, 250);
      });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] font-sans p-6 pt-10 pb-32">
      <header className="flex items-center gap-4 mb-8 text-slate-900 uppercase">
        <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-black tracking-tight">SOS</h1>
      </header>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-10 left-6 right-6 z-[100] bg-rose-500 text-white p-4 rounded-2xl flex items-center gap-3 shadow-2xl shadow-rose-500/20"
          >
            <Zap size={20} fill="currentColor" strokeWidth={3} className="animate-pulse" />
            <p className="text-[12px] font-black uppercase tracking-widest">SOS Triggered For Saved Contacts</p>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="space-y-6">
        <div className="bg-slate-900 p-6 rounded-[2rem] text-white relative overflow-hidden group shadow-2xl">
          <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-rose-500/20 rounded-full blur-3xl" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-[14px] font-black uppercase tracking-widest text-rose-500"> SOS</h3>
                <p className="text-[20px] font-black tracking-tighter">Emergency Contacts</p>
              </div>
              <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-rose-500/5 transition-transform group-hover:scale-110">
                <Zap size={24} fill="currentColor" strokeWidth={3} />
              </div>
            </div>
            <p className="text-[11px] font-bold text-white/40 leading-tight">
              Add trusted contacts manually or pick from your phone contacts. These contacts can be used for emergency driver safety actions.
            </p>
            <button
              type="button"
              onClick={triggerSOS}
              className="h-12 w-full bg-white/10 hover:bg-rose-500 hover:text-white border border-white/10 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all"
            >
              Trigger SOS
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Emergency List</h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {contacts.length}/{MAX_CONTACTS}
              </span>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowAddSheet(true);
                }}
                disabled={remainingSlots === 0}
                className="text-[10px] font-black text-blue-500 uppercase tracking-widest border-b border-blue-500/20 pb-0.5 disabled:text-slate-300 disabled:border-slate-200"
              >
                + Add New
              </button>
            </div>
          </div>

          {error ? (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 px-4 py-3 rounded-2xl text-[11px] font-bold">
              {error}
            </div>
          ) : null}

          {isLoading ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center text-[11px] font-bold text-slate-400">
              Loading emergency contacts...
            </div>
          ) : null}

          {!isLoading && contacts.length === 0 ? (
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center text-[11px] font-bold text-slate-400">
              No emergency contacts added yet.
            </div>
          ) : null}

          {!isLoading &&
            contacts.map((contact) => (
              <div key={contact.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group active:bg-slate-50 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-rose-50 group-hover:text-rose-500 transition-colors bg-slate-50">
                    <Phone size={18} />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[14px] font-black text-slate-900 leading-tight tracking-tight">{contact.name}</h4>
                    <p className="text-[10px] font-black text-slate-400 opacity-60 leading-tight uppercase tracking-widest">
                      +91 {contact.phone}
                    </p>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                      {contact.source === 'device' ? 'From Phone Contacts' : 'Added Manually'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(`tel:+91${contact.phone}`)}
                    className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center active:scale-90 transition-all"
                  >
                    <Phone size={13} className="text-emerald-500" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(contact)}
                    className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center active:scale-90 transition-all"
                  >
                    <Trash2 size={13} className="text-red-400" strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </main>

      <AnimatePresence>
        {showAddSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSheet(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] px-5 pt-4 pb-10 z-[101]"
            >
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[18px] font-black text-slate-900">Add Emergency Contact</h3>
                <button type="button" onClick={() => setShowAddSheet(false)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                  <X size={15} className="text-slate-500" strokeWidth={2.5} />
                </button>
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handlePickFromDevice}
                  disabled={!canUseContactPicker || remainingSlots === 0 || isSaving}
                  className="w-full flex items-center justify-center gap-2 rounded-[16px] border border-slate-100 bg-slate-50 px-4 py-3 text-[12px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Smartphone size={16} strokeWidth={2.5} />
                  {canUseContactPicker ? 'Pick From Phone Contacts' : 'Phone Contact Picker Unavailable'}
                </button>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Name</label>
                  <div className={`flex items-center gap-3 rounded-[14px] px-4 py-3 border-2 transition-all ${errors.name ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                    <User size={16} className="text-slate-400 shrink-0" strokeWidth={2} />
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(normalizeName(event.target.value));
                        setErrors((prev) => ({ ...prev, name: '' }));
                      }}
                      placeholder="Contact name"
                      className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                    />
                  </div>
                  {errors.name ? <p className="text-[11px] font-black text-red-500 ml-1 mt-1">{errors.name}</p> : null}
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Mobile Number</label>
                  <div className={`flex items-center gap-3 rounded-[14px] px-4 py-3 border-2 transition-all ${errors.phone ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                    <Phone size={16} className="text-slate-400 shrink-0" strokeWidth={2} />
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(event) => {
                        setPhone(normalizePhone(event.target.value));
                        setErrors((prev) => ({ ...prev, phone: '' }));
                      }}
                      placeholder="10-digit mobile number"
                      className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                    />
                    {PHONE_REGEX.test(phone) ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} /> : null}
                  </div>
                  {errors.phone ? <p className="text-[11px] font-black text-red-500 ml-1 mt-1">{errors.phone}</p> : null}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => handleAddContact({ contactName: name, contactPhone: phone, source: 'manual' })}
                  disabled={isSaving || remainingSlots === 0}
                  className="w-full bg-slate-900 text-white py-4 rounded-[16px] text-[14px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm mt-2 disabled:opacity-60"
                >
                  {isSaving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>
                    <Plus size={15} strokeWidth={2.5} />
                    Save Contact
                  </>}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] max-w-sm bg-white rounded-[28px] p-7 z-[101] shadow-2xl text-center"
            >
              <div className="w-14 h-14 bg-red-50 rounded-[18px] flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} className="text-red-400" strokeWidth={2} />
              </div>
              <h3 className="text-[17px] font-black text-slate-900 mb-1">Remove contact?</h3>
              <p className="text-[13px] font-bold text-slate-400 mb-6">
                {deleteTarget.name} will be removed from your emergency list.
              </p>
              <div className="space-y-2.5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleDeleteContact}
                  disabled={isDeletingId === deleteTarget.id}
                  className="w-full bg-red-500 text-white py-3.5 rounded-[16px] text-[13px] font-black uppercase tracking-widest"
                >
                  {isDeletingId === deleteTarget.id ? 'Removing...' : 'Remove'}
                </motion.button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="w-full py-3.5 text-[13px] font-black text-slate-400 uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default SecuritySOS;
