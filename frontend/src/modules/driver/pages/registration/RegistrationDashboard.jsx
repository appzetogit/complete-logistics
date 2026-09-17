import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    User, 
    Car, 
    FileText, 
    Camera, 
    CreditCard, 
    ChevronRight, 
    CheckCircle2, 
    Circle,
    Clock,
    ShieldAlert,
    Stars,
    Zap,
    ShieldCheck
} from 'lucide-react';
import RegistrationProgress from '../../../shared/components/RegistrationProgress';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { getStoredDriverRegistrationSession } from '../../services/registrationService';

const RegistrationDashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { settings } = useSettings();
    const appName = settings.general?.app_name || 'App';
    const appLogo = settings.general?.logo || settings.customization?.logo;
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const storedSession = getStoredDriverRegistrationSession();

    const steps = [
        { id: 'personal', title: 'Personal Information', sub: 'ID & Profile', icon: <User size={18} /> },
        { id: 'vehicle', title: 'Vehicle Information', sub: 'Fleet & RC', icon: <Car size={18} /> },
        { id: 'docs', title: 'KYC Documents', sub: 'Legal Verification', icon: <FileText size={18} /> },
        { id: 'bank', title: 'Payout Details', sub: 'Earnings Account', icon: <CreditCard size={18} /> }
    ];

    return (
        <div className="min-h-screen bg-taxi-bg font-sans select-none overflow-x-hidden p-6 pb-28 flex flex-col pt-6">
            {/* Premium Welcome Header */}
            <header className="mb-6 space-y-4">
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-taxi-text shadow-2xl overflow-hidden p-2"
                >
                    {appLogo ? (
                        <img src={appLogo} alt={appName} className="w-full h-full object-contain" />
                    ) : (
                        <Zap size={24} className="text-slate-900" />
                    )}
                </motion.div>
                
                <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-2"
                >
                    <div className="flex items-center gap-2 mb-1">
                        <span className="bg-emerald-500/10 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/10 flex items-center gap-1.5">
                            <ShieldCheck size={12} strokeWidth={3} /> Verified Partner Program
                        </span>
                    </div>
                    <h1 className="text-3xl font-black text-taxi-text tracking-tighter leading-none uppercase">
                        Start Your <br/> <span className="text-orange-500">Journey</span>
                    </h1>
                    <p className="text-[14px] font-bold text-slate-400">Complete these 4 simple steps to join the Elite Driver network and start earning today.</p>
                </motion.div>
            </header>

            {/* List of Steps Visualizer (Summary) */}
            <main className="flex-1 space-y-8 overflow-y-auto scrollbar-hide pb-10">
                <div className="grid grid-cols-1 gap-4">
                    {steps.map((step, index) => (
                        <motion.div 
                            key={step.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * index + 0.3 }}
                            className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 flex items-center justify-between group"
                        >
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 shadow-inner group-hover:bg-taxi-primary group-hover:text-taxi-text transition-colors">
                                    {step.icon}
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="text-[15px] font-black text-taxi-text leading-tight tracking-tight">{step.title}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 opacity-60 uppercase tracking-tighter">{step.sub}</p>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-200">
                                <ChevronRight size={16} />
                            </div>
                        </motion.div>
                    ))}
                </div>

                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="p-4 bg-slate-900 rounded-2xl text-white flex items-center justify-between relative overflow-hidden group active:scale-95 transition-all cursor-pointer shadow-xl"
                >
                    <div className="relative z-10 space-y-1">
                        <div className="flex items-center gap-2">
                             <Stars size={16} className="text-taxi-primary" fill="currentColor" />
                             <h4 className="text-[15px] font-black uppercase tracking-tight">Driver Handbook</h4>
                        </div>
                        <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest text-taxi-primary">Read community guidelines</p>
                    </div>
                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-taxi-primary/10 to-transparent group-hover:from-taxi-primary/20 transition-all" />
                    <ChevronRight size={24} className="relative z-10 text-taxi-primary" />
                </motion.div>
            </main>

            {/* CTA Panel */}
            <div className="fixed bottom-0 left-0 right-0 p-6 pt-3 pb-8 bg-white/80 backdrop-blur-xl z-50 border-t border-slate-50">
                <motion.button 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.8, type: "spring" }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                        const hasActiveSession = Boolean(
                            String(storedSession.registrationId || '').trim()
                            && String(storedSession.phone || '').replace(/\D/g, '').slice(-10),
                        );

                        navigate(
                            hasActiveSession
                                ? `${routePrefix}/step-personal`
                                : `${routePrefix}/reg-phone`,
                            { state: storedSession },
                        );
                    }}
                    className="w-full h-14 bg-taxi-primary text-taxi-text py-4 rounded-2xl flex items-center justify-center gap-4 text-[18px] font-black shadow-2xl shadow-taxi-primary/20 border border-taxi-primary/80 active:scale-95 transition-all tracking-tight uppercase"
                >
                    Start Registration <ChevronRight size={22} strokeWidth={3} />
                </motion.button>
            </div>
        </div>
    );
};

export default RegistrationDashboard;
