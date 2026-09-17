import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
    Clock, 
    ShieldCheck, 
    HelpCircle, 
    CheckCircle2, 
    FileText,
    TrendingUp
} from 'lucide-react';

const ApplicationStatus = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-taxi-bg font-sans select-none overflow-x-hidden p-8 pb-32 flex flex-col pt-20">
            {/* Lottie-like Animation Wrapper */}
            <div className="relative flex-1 flex flex-col items-center justify-center space-y-12">
                <div className="relative">
                    {/* Pulsing Outer Ring */}
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1.2, opacity: 0.3 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                        className="absolute inset-[-20%] bg-taxi-primary rounded-full blur-3xl"
                    />
                    
                    {/* Main Animated Review Icon */}
                    <motion.div 
                        initial={{ rotate: -15, scale: 0.8, opacity: 0 }}
                        animate={{ rotate: 0, scale: 1, opacity: 1 }}
                        className="w-32 h-32 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex items-center justify-center relative z-10"
                    >
                        <Clock size={52} className="text-taxi-secondary" strokeWidth={2.5} />
                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-full border-4 border-white flex items-center justify-center text-white shadow-lg">
                            <CheckCircle2 size={20} strokeWidth={3} />
                        </div>
                    </motion.div>
                </div>

                <div className="text-center space-y-4 px-2">
                    <h1 className="text-3xl font-black text-taxi-text leading-tight tracking-tight">
                        Application Successfully Submitted
                    </h1>
                    <p className="text-[14px] font-bold text-slate-400 leading-relaxed">
                        Our team is currently reviewing your documents. This usually takes <span className="text-taxi-text">12-24 hours.</span>
                    </p>
                </div>

                {/* Status Breakdown */}
                <div className="w-full space-y-4">
                    <div className="bg-white p-5 rounded-3xl border border-slate-50 shadow-[0_4px_25px_rgba(0,0,0,0.01)] flex items-center justify-between">
                         <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                                 <FileText size={20} />
                             </div>
                             <div className="space-y-0.5">
                                 <h4 className="text-[14px] font-black text-taxi-text">KYC Verification</h4>
                                 <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">In Progress</p>
                             </div>
                         </div>
                         <TrendingUp size={16} className="text-emerald-500 animate-pulse" />
                    </div>

                    <div className="bg-white p-5 rounded-3xl border border-slate-50 shadow-[0_4px_25px_rgba(0,0,0,0.01)] flex items-center justify-between">
                         <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-slate-50 text-slate-300 rounded-2xl flex items-center justify-center">
                                 <ShieldCheck size={20} />
                             </div>
                             <div className="space-y-0.5 opacity-40">
                                 <h4 className="text-[14px] font-black text-taxi-text">Background Check</h4>
                                 <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tighter">Waiting</p>
                             </div>
                         </div>
                    </div>
                </div>
            </div>

            {/* Bottom Panel */}
            <div className="fixed bottom-0 left-0 right-0 p-8 pt-4 pb-12 bg-white/50 backdrop-blur-xl z-50 flex flex-col gap-4">
                <button 
                  onClick={() => navigate('/taxi/driver/support')}
                  className="w-full h-16 bg-white border-2 border-slate-100 rounded-3xl flex items-center justify-center gap-3 text-[16px] font-black text-slate-500 active:scale-95 transition-all tracking-tight uppercase"
                >
                  Contact Support <HelpCircle size={20} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
};

export default ApplicationStatus;
