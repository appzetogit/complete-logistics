import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, IndianRupee, ArrowRight, X, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Motion = motion;

const LowBalanceModal = ({
    isOpen,
    onClose,
    balance,
    cashLimit,
    minimumBalance,
    isBlocked,
    belowMinimumBalance,
    cashLimitExceeded,
}) => {
    const navigate = useNavigate();
    
    if (!isOpen) return null;

    const normalizedCashLimit = Math.max(0, Number(cashLimit || 0));
    const cashLimitUsed = Math.max(0, Number(balance || 0) < 0 ? Math.abs(Number(balance || 0)) : 0);
    const remainingLimit = Math.max(0, normalizedCashLimit - cashLimitUsed);
    const progress = normalizedCashLimit > 0
        ? Math.min(100, Math.max(0, (cashLimitUsed / normalizedCashLimit) * 100))
        : 0;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                <Motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-100"
                >
                    {/* Header with Icon */}
                    <div className={`pt-10 pb-6 flex flex-col items-center text-center px-6 ${isBlocked ? 'bg-rose-50' : 'bg-amber-50'}`}>
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg ${isBlocked ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-amber-500 text-white shadow-amber-200'}`}>
                            {isBlocked ? <AlertTriangle size={40} /> : <Wallet size={40} />}
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">
                            {isBlocked ? 'Go Online Unavailable' : 'Wallet Alert'}
                        </h3>
                        <p className={`mt-2 text-sm font-semibold px-4 ${isBlocked ? 'text-rose-600' : 'text-amber-600'}`}>
                            {isBlocked
                                ? belowMinimumBalance
                                    ? 'Your minimum wallet balance is not maintained. Please top up to continue taking rides.'
                                    : cashLimitExceeded
                                        ? 'Your cash limit has been exceeded. Please deposit cash to continue taking rides.'
                                        : 'Your wallet needs attention before you can continue taking rides.'
                                : 'Your available wallet balance is getting low. Top up soon to avoid going offline.'}
                        </p>
                    </div>

                    <div className="p-8">
                        {/* Stats Card */}
                        <div className="bg-slate-50 rounded-[2rem] p-6 mb-8 border border-slate-100">
                            <div className="flex justify-between items-end mb-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Balance</span>
                                    <span className={`text-2xl font-black ${Number(balance || 0) < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                        Rs {Math.abs(Number(balance || 0)).toFixed(2)}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {belowMinimumBalance ? 'Minimum Balance' : 'Cash Limit'}
                                    </span>
                                    <span className="block text-sm font-bold text-slate-600">
                                        Rs {belowMinimumBalance ? Number(minimumBalance || 0) : Number(cashLimit || 0)}
                                    </span>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                                <Motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className={`h-full transition-all ${progress > 90 ? 'bg-rose-500' : 'bg-amber-500'}`}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-400">
                                <span>{belowMinimumBalance ? 'Current balance' : 'Used'}</span>
                                <span>
                                    {belowMinimumBalance
                                        ? `Required Rs ${Number(minimumBalance || 0)}`
                                        : `${Math.round(progress)}% of limit`}
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={() => navigate('/taxi/driver/wallet')}
                                className="w-full h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
                            >
                                <IndianRupee size={18} />
                                Deposit Now
                                <ArrowRight size={18} />
                            </button>
                            <button 
                                onClick={onClose}
                                className="w-full h-14 bg-white text-slate-500 rounded-2xl flex items-center justify-center text-sm font-bold active:bg-slate-50 transition-all underline decoration-slate-200 underline-offset-4"
                            >
                                {isBlocked ? 'I\'ll do it later' : 'Dismiss'}
                            </button>
                        </div>
                    </div>
                </Motion.div>
            </div>
        </AnimatePresence>
    );
};

export default LowBalanceModal;
