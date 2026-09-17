import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Globe, ChevronRight } from 'lucide-react';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { getLocalDriverToken, getStoredDriverRole } from '../../services/registrationService';

const LanguageSelect = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { settings } = useSettings();
    const appName = settings.general?.app_name || 'App';
    const appLogo = settings.general?.logo || settings.customization?.logo || settings.general?.favicon || '';
    const [selectedLang, setSelectedLang] = useState(() => localStorage.getItem('driver_lang') || 'english');
    const isAuthenticatedDriver = Boolean(getLocalDriverToken()) && !location.state?.registrationFlow;
    const authenticatedHome =
        String(getStoredDriverRole() || 'driver').toLowerCase() === 'owner'
            ? '/taxi/driver/profile'
            : '/taxi/driver/home';

    const languages = [
        { id: 'english', label: 'English', sub: 'Standard Experience', native: 'English' },
        { id: 'hindi', label: 'Hindi', sub: 'मानक अनुभव', native: 'हिन्दी' },
        { id: 'marathi', label: 'Marathi', sub: 'मानक अनुभव', native: 'मराठी' },
        { id: 'gujarati', label: 'Gujarati', sub: 'પ્રમાણભૂત અનુભવ', native: 'ગુજરાતી' }
    ];

    const handleConfirm = () => {
        localStorage.setItem('driver_lang', selectedLang);
        navigate(isAuthenticatedDriver ? authenticatedHome : '/taxi/driver/reg-phone', { replace: true });
    };

    return (
        <div 
            className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] select-none overflow-x-hidden flex flex-col p-5 pt-8 pb-32"
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
            {/* Branding */}
            <div className="mb-6 flex flex-col items-center text-center space-y-4">
                {appLogo ? (
                    <img src={appLogo} alt={appName} className="h-10 object-contain drop-shadow-sm" />
                ) : (
                    <div className="rounded-xl bg-slate-900 px-4 py-2 text-base font-black tracking-tighter text-white shadow-xl shadow-slate-900/10">
                        {appName}
                    </div>
                )}
                <div className="space-y-1">
                    <h1 className="font-['Outfit'] text-[32px] font-black leading-[1.1] tracking-[-0.04em] text-slate-900">
                        Select <span className="text-slate-400">Language</span>
                    </h1>
                    <p className="text-[14px] font-bold text-slate-500 opacity-80 max-w-[32ch] mx-auto leading-relaxed">Choose your preferred communication language to get started.</p>
                </div>
            </div>

            {/* Language Grid */}
            <main className="flex-1 grid grid-cols-1 gap-3">
                {languages.map((lang, index) => (
                    <motion.div
                        key={lang.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => setSelectedLang(lang.id)}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group relative overflow-hidden ${
                            selectedLang === lang.id 
                            ? 'bg-slate-950 border-slate-950 shadow-lg shadow-slate-900/20' 
                            : 'bg-white border-slate-50 shadow-sm hover:border-slate-100'
                        }`}
                    >
                        <div className="flex items-center gap-3.5 relative z-10">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                selectedLang === lang.id ? 'bg-white/10 text-white' : 'bg-slate-50 text-slate-400'
                            }`}>
                                <Globe size={20} strokeWidth={2.5} />
                            </div>
                            <div className="leading-tight">
                                <h4 className={`text-base font-black tracking-tight transition-colors ${selectedLang === lang.id ? 'text-white' : 'text-slate-900'}`}>{lang.label}</h4>
                                <p className={`text-[11px] font-black uppercase tracking-widest mt-0.5 opacity-60 ${selectedLang === lang.id ? 'text-white' : 'text-slate-400'}`}>{lang.native}</p>
                            </div>
                        </div>

                        {selectedLang === lang.id && (
                            <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-slate-900 shadow-xl relative z-10"
                            >
                                <Check size={16} strokeWidth={3} />
                            </motion.div>
                        )}
                        
                        {/* Subtle Background Pattern */}
                        <div className={`absolute -right-3 -bottom-3 transition-opacity ${selectedLang === lang.id ? 'opacity-[0.05] text-white' : 'opacity-[0.02] text-slate-900'}`}>
                            <Globe size={80} />
                        </div>
                    </motion.div>
                ))}
            </main>

            {/* Footer Action */}
            <div className="fixed bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-white via-white/95 to-transparent z-20">
                <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleConfirm}
                    className="w-full h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-2.5 text-[14px] font-black uppercase tracking-widest shadow-[0_15px_30px_rgba(0,0,0,0.15)] transition-all group"
                >
                    {isAuthenticatedDriver ? 'Save Changes' : 'Confirm & Start'}
                    <ChevronRight size={17} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
                </motion.button>
            </div>
        </div>
    );
};

export default LanguageSelect;
