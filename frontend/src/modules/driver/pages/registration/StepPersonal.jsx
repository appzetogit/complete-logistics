import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, ChevronRight, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    getStoredDriverRegistrationSession,
    saveDriverPersonalDetails,
    saveDriverRegistrationSession,
} from '../../services/registrationService';

const NAME_REGEX = /^[A-Za-z]+(?:[ .'-][A-Za-z]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SPECIAL_SIGNUP_ROLES = ['bus_driver', 'service_center', 'service_center_staff'];

const StepPersonal = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner')
        ? '/taxi/owner'
        : '/taxi/driver';
    const session = getStoredDriverRegistrationSession();
    const phone = String(session.phone || '').replace(/\D/g, '').slice(-10);
    const registrationId = session.registrationId || '';
    const role = routePrefix === '/taxi/owner'
        ? 'owner'
        : (session.role || 'driver');
    const isOwner = role === 'owner';

    const [formData, setFormData] = useState({
        fullName: session.fullName || '',
        email: session.email || '',
        gender: session.gender || '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        saveDriverRegistrationSession({
            ...session,
            ...formData,
        });
    }, [formData]);

    useEffect(() => {
        if (!phone || !registrationId) {
            navigate(`${routePrefix}/login`, { replace: true });
        }
        if (session.roleConfirmed === false || session.needsRoleSelection === true) {
            navigate('/taxi/driver/select-role', { replace: true });
        }
    }, [navigate, phone, registrationId, routePrefix, session.needsRoleSelection, session.roleConfirmed]);

    const handleContinue = async () => {
        const fullName = formData.fullName.trim();
        const email = formData.email.trim().toLowerCase();

        if (!fullName || !email || !formData.gender) {
            setError('Please fill all required details');
            return;
        }

        if (!NAME_REGEX.test(fullName)) {
            setError(`${isOwner ? 'Owner' : 'Driver'} name should contain alphabets only`);
            return;
        }

        if (!EMAIL_REGEX.test(email)) {
            setError('Please enter a valid email address, example aa@gmail.com');
            return;
        }

            setLoading(true);
            setError('');

            try {
                const normalizedFormData = {
                    ...formData,
                    fullName,
                    email,
                };
                const response = await saveDriverPersonalDetails({
                    registrationId,
                    phone,
                    ...normalizedFormData,
                });

                saveDriverRegistrationSession({
                    ...session,
                    registrationId,
                    phone,
                    role,
                    ...normalizedFormData,
                    personalSession: response?.data?.session || null,
                });

                navigate(
                    SPECIAL_SIGNUP_ROLES.includes(String(role || '').toLowerCase())
                        ? '/taxi/driver/role-signup'
                        : `${routePrefix}/step-referral`,
                );
            } catch (err) {
                setError(err?.message || 'Unable to save personal details');
            } finally {
                setLoading(false);
            }
    };

    const genders = ['Male', 'Female', 'Other'];

    return (
        <div
            className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-32 pt-8 select-none"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
            <main className="mx-auto max-w-sm space-y-6">
                <header className="space-y-6">
                    <div className="flex items-center justify-between">
                         <div className="rounded-full bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 border border-slate-900/5">
                            Step 1 of 4
                        </div>
                    </div>

                    <section className="space-y-3">
                        <div className="flex items-center gap-3">
                             <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-900/10">
                                <User size={22} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 opacity-60">
                                Profile Setup
                            </span>
                        </div>
                        <h1 className="font-['Outfit'] text-[48px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
                            Personal <span className="text-slate-400">Info</span>
                        </h1>
                        <p className="text-[15px] leading-relaxed text-slate-500 font-bold opacity-80 max-w-[28ch]">
                            Let's get the basics in place so your profile feels complete from day one.
                        </p>
                    </section>
                </header>

                <section className="space-y-5 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                    <div className="space-y-1 px-1">
                        <h2 className="text-lg font-black tracking-tight text-slate-900">Profile Information</h2>
                        <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest opacity-60">Verified Credentials</p>
                    </div>

                    <div className="space-y-4">
                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                    <User size={20} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">Full Name</label>
                                    <input
                                        value={formData.fullName}
                                        onChange={(e) => setFormData(p => ({ ...p, fullName: e.target.value.replace(/[^A-Za-z .'-]/g, '') }))}
                                        placeholder="Enter your name"
                                        className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[1.8rem] border-2 border-emerald-50 bg-emerald-50/30 p-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                                    <Phone size={20} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-emerald-600/60">Phone Number</label>
                                    <p className="text-lg font-black text-slate-900">+91 {phone}</p>
                                </div>
                            </div>
                        </div>

                        <div className="group rounded-[1.8rem] border-2 transition-all p-4 border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white transition-all">
                                    <Mail size={20} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70">Email Address</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData(p => ({ ...p, email: e.target.value.trim().toLowerCase() }))}
                                        placeholder="name@gmail.com"
                                        className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 opacity-70 px-2">Select Gender</label>
                            <div className="grid grid-cols-3 gap-3">
                                {genders.map((g) => (
                                    <button
                                        key={g}
                                        onClick={() => setFormData(p => ({ ...p, gender: g }))}
                                        className={`rounded-2xl h-12 text-[12px] font-black uppercase tracking-widest transition-all ${
                                            formData.gender === g
                                                ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20'
                                                : 'bg-white border-2 border-slate-50 text-slate-400 hover:bg-slate-50'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_10px_30px_rgba(244,63,94,0.08)]">
                        {error}
                    </div>
                )}

                <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
                    <div className="mx-auto max-w-sm">
                        <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleContinue}
                            disabled={loading}
                            className={`group flex h-16 w-full items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all relative overflow-hidden ${
                                formData.fullName && formData.email && formData.gender
                                    ? 'bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:bg-black'
                                    : 'pointer-events-none bg-slate-200 text-slate-400 shadow-none'
                            }`}
                        >
                            {loading ? (
                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="relative z-10 uppercase tracking-widest">Continue</span>
                                    <ChevronRight size={18} strokeWidth={3} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StepPersonal;
