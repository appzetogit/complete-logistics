import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Headset, Loader2 } from 'lucide-react';

export const ActivitySupportState = ({ onContact }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-5"
  >
    <div className="w-20 h-20 bg-white/80 border border-white/80 shadow-sm rounded-3xl flex items-center justify-center">
      <Headset size={36} className="text-orange-500" />
    </div>
    <div className="space-y-1">
      <h3 className="text-[17px] font-black text-slate-900">No support tickets</h3>
      <p className="text-[13px] font-bold text-slate-500">You haven&apos;t raised any support tickets yet.</p>
    </div>
    <button
      type="button"
      onClick={onContact}
      className="mt-2 bg-slate-900 text-white px-7 py-3 rounded-full text-[12px] font-black uppercase tracking-[0.18em] shadow-[0_16px_34px_rgba(15,23,42,0.18)] active:scale-95 transition-all"
    >
      Contact Us
    </button>
  </motion.div>
);

export const ActivityLoadingState = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-3"
  >
    <div className="w-14 h-14 rounded-3xl bg-white/80 border border-white/80 shadow-sm flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-orange-500" strokeWidth={3} />
    </div>
    <p className="text-[15px] font-black text-slate-500">Loading your trips</p>
  </motion.div>
);

export const ActivityErrorState = ({ error, onRetry }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-3"
  >
    <div className="w-14 h-14 rounded-3xl bg-white/80 border border-white/80 shadow-sm flex items-center justify-center">
      <AlertCircle size={24} className="text-rose-500" strokeWidth={3} />
    </div>
    <p className="text-[15px] font-black text-slate-700">{error}</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-2 bg-slate-900 text-white px-6 py-3 rounded-full text-[12px] font-black uppercase tracking-[0.18em] shadow-sm active:scale-95 transition-all"
    >
      Retry
    </button>
  </motion.div>
);

export const ActivityEmptyState = ({ activeTab }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center gap-3"
  >
    <div className="w-14 h-14 rounded-3xl bg-white/80 border border-white/80 shadow-sm flex items-center justify-center text-slate-400 text-[22px] font-black">
      -
    </div>
    <p className="text-[15px] font-black text-slate-500">No {activeTab.toLowerCase()} found</p>
  </motion.div>
);
