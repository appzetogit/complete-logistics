import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Phone, User, AlertTriangle, ShieldAlert, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { triggerUserSosAlert } from '../../../../shared/services/safetyAlertService';

const MAX_CONTACTS = 5;
const PHONE_REGEX = /^[6-9]\d{9}$/;

const MOCK_CONTACTS = [
  { id: '1', name: 'Rahul Verma',  phone: '9876543210' },
  { id: '2', name: 'Priya Sharma', phone: '9123456789' },
];

const EMERGENCY_SERVICES = [
  { id: 'police', label: 'Police', phone: '100', accent: 'bg-blue-50 border-blue-100 text-blue-600' },
  { id: 'ambulance', label: 'Ambulance', phone: '108', accent: 'bg-emerald-50 border-emerald-100 text-emerald-600' },
  { id: 'fire', label: 'Fire Brigade', phone: '101', accent: 'bg-orange-50 border-orange-100 text-orange-600' },
];

const SOSContacts = () => {
  const navigate = useNavigate();
  const [contacts, setContacts]         = useState(MOCK_CONTACTS);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [name, setName]                 = useState('');
  const [phone, setPhone]               = useState('');
  const [errors, setErrors]             = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sosActive, setSosActive]       = useState(false);
  const [countdown, setCountdown]       = useState(3);
  const [saving, setSaving]             = useState(false);
  const [isTriggeringSos, setIsTriggeringSos] = useState(false);

  const validate = () => {
    const e = {};
    if (!name.trim())              e.name  = 'Name is required';
    if (!PHONE_REGEX.test(phone))  e.phone = 'Enter a valid 10-digit mobile number';
    if (contacts.some(c => c.phone === phone)) e.phone = 'This number is already added';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdd = async () => {
    if (!validate()) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 500)); // POST /api/v1/common/sos/store
    setContacts(prev => [...prev, { id: Date.now().toString(), name: name.trim(), phone }]);
    setName(''); setPhone(''); setErrors({});
    setShowAddSheet(false);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await new Promise(r => setTimeout(r, 300)); // POST /api/v1/common/sos/delete/:id
    setContacts(prev => prev.filter(c => c.id !== id));
    setDeleteTarget(null);
  };

  const triggerSOS = () => {
    if (isTriggeringSos) return;

    setSosActive(true);
    setCountdown(3);
    setIsTriggeringSos(true);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setSosActive(false);
          setCountdown(3);
          triggerUserSosAlert()
            .then(() => {
              toast.success('SOS sent to safety center');
            })
            .catch((error) => {
              console.error('Failed to trigger user SOS:', error);
              toast.error(error?.message || 'Unable to send SOS right now');
            })
            .finally(() => {
              setIsTriggeringSos(false);
            });
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-12 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-red-100/50 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Safety</p>
            <h1 className="text-[19px] font-black tracking-tight text-slate-900">SOS Contacts</h1>
          </div>
          <motion.button whileTap={{ scale: 0.9 }}
            onClick={() => setShowAddSheet(true)}
            disabled={contacts.length >= MAX_CONTACTS}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-[12px] text-[11px] font-black uppercase tracking-widest transition-all ${
              contacts.length >= MAX_CONTACTS
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white shadow-sm'
            }`}>
            <Plus size={13} strokeWidth={3} /> Add
          </motion.button>
        </div>
      </header>

      <div className="px-5 pt-4 space-y-4">
        {/* SOS trigger */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] bg-gradient-to-br from-red-500 to-red-600 p-5 shadow-[0_12px_32px_rgba(239,68,68,0.25)] text-white">
          <div className="flex items-center gap-3 mb-4">
            <ShieldAlert size={22} className="text-white" strokeWidth={2} />
            <div>
              <p className="text-[14px] font-black leading-tight">Emergency SOS</p>
              <p className="text-[11px] font-bold text-red-100">Alerts all your emergency contacts</p>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.96 }} onClick={triggerSOS} disabled={sosActive}
            className="w-full bg-white text-red-600 py-3.5 rounded-[14px] text-[14px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
            {sosActive ? (
              <><span className="text-[20px] font-black">{countdown}</span> Alerting contacts...</>
            ) : (
              <><AlertTriangle size={16} strokeWidth={2.5} /> Trigger SOS</>
            )}
          </motion.button>
        </motion.div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Emergency Services</p>
            <span className="text-[10px] font-bold text-slate-400">Quick call</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {EMERGENCY_SERVICES.map((service) => (
              <motion.button
                key={service.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => window.open(`tel:${service.phone}`, '_self')}
                className="rounded-[18px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${service.accent}`}>
                    <Phone size={15} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-[14px] font-black text-slate-900 leading-tight">{service.label}</p>
                    <p className="text-[11px] font-bold text-slate-400 mt-0.5">Call {service.phone}</p>
                  </div>
                  <div className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
                    {service.phone}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Contacts list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Emergency Contacts</p>
            <span className="text-[10px] font-bold text-slate-400">{contacts.length}/{MAX_CONTACTS}</span>
          </div>

          {contacts.length === 0 && (
            <div className="rounded-[20px] border border-white/80 bg-white/90 p-8 flex flex-col items-center gap-3 text-center shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
              <ShieldAlert size={32} className="text-slate-300" strokeWidth={1.5} />
              <p className="text-[13px] font-black text-slate-500">Add emergency contacts to stay safe</p>
            </div>
          )}

          <div className="space-y-2">
            {contacts.map((c, i) => (
              <motion.div key={c.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-4 py-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <span className="text-[14px] font-black text-red-500">{c.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-black text-slate-900 leading-tight">{c.name}</p>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">+91 {c.phone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.open(`tel:+91${c.phone}`)}
                    className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center active:scale-90 transition-all">
                    <Phone size={13} className="text-emerald-500" strokeWidth={2.5} />
                  </button>
                  <button onClick={() => setDeleteTarget(c)}
                    className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center active:scale-90 transition-all">
                    <Trash2 size={13} className="text-red-400" strokeWidth={2} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Add contact bottom sheet */}
      <AnimatePresence>
        {showAddSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddSheet(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white rounded-t-[28px] px-5 pt-4 pb-10 z-[101]">
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[18px] font-black text-slate-900">Add SOS Contact</h3>
                <button onClick={() => setShowAddSheet(false)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                  <X size={15} className="text-slate-500" strokeWidth={2.5} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Name</label>
                  <div className={`flex items-center gap-3 rounded-[14px] px-4 py-3 border-2 transition-all ${errors.name ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                    <User size={16} className="text-slate-400 shrink-0" strokeWidth={2} />
                    <input type="text" value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
                      placeholder="Contact name" className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300" />
                  </div>
                  {errors.name && <p className="text-[11px] font-black text-red-500 ml-1 mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Mobile Number</label>
                  <div className={`flex items-center gap-3 rounded-[14px] px-4 py-3 border-2 transition-all ${errors.phone ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                    <Phone size={16} className="text-slate-400 shrink-0" strokeWidth={2} />
                    <input type="tel" maxLength={10} value={phone} onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setErrors(p => ({ ...p, phone: '' })); }}
                      placeholder="10-digit mobile number" className="flex-1 bg-transparent border-none text-[15px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300" />
                    {PHONE_REGEX.test(phone) && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" strokeWidth={2.5} />}
                  </div>
                  {errors.phone && <p className="text-[11px] font-black text-red-500 ml-1 mt-1">{errors.phone}</p>}
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleAdd} disabled={saving}
                  className="w-full bg-slate-900 text-white py-4 rounded-[16px] text-[14px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm mt-2">
                  {saving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save Contact'}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] max-w-lg mx-auto" />
            <motion.div initial={{ scale: 0.92, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 40 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[82%] max-w-sm bg-white rounded-[28px] p-7 z-[101] shadow-2xl text-center">
              <div className="w-14 h-14 bg-red-50 rounded-[18px] flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} className="text-red-400" strokeWidth={2} />
              </div>
              <h3 className="text-[17px] font-black text-slate-900 mb-1">Remove contact?</h3>
              <p className="text-[13px] font-bold text-slate-400 mb-6">{deleteTarget?.name} will be removed from your SOS list.</p>
              <div className="space-y-2.5">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleDelete(deleteTarget.id)}
                  className="w-full bg-red-500 text-white py-3.5 rounded-[16px] text-[13px] font-black uppercase tracking-widest">
                  Remove
                </motion.button>
                <button onClick={() => setDeleteTarget(null)}
                  className="w-full py-3.5 text-[13px] font-black text-slate-400 uppercase tracking-widest">
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SOSContacts;
