import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CreditCard, Plus, HelpCircle, ArrowRight, ShieldCheck, Banknote, X, CheckSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const PayoutMethods = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const [accounts, setAccounts] = useState([
        { id: 1, type: 'Bank Account', name: 'Zeto Bank Savings', info: '**** 5678', status: 'Primary', icon: <Banknote size={20} /> },
        { id: 2, type: 'UPI ID', name: 'Google Pay', info: '95898@okaxis', status: 'Active', icon: <CreditCard size={20} /> }
    ]);
    const [showAdd, setShowAdd] = useState(false);

    const openContact = () => window.open('https://wa.me/919424100424');

    return (
        <div className="min-h-screen bg-[#f8f9fb] font-sans p-6 pt-10 pb-32">
            <header className="flex items-center gap-4 mb-10 text-slate-900 uppercase">
                <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-lg font-black tracking-tight tracking-tighter uppercase">Payout Portfolio</h1>
            </header>

            <AnimatePresence>
                {showAdd && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-white w-full rounded-t-[2.1rem] p-7 pb-10 space-y-6">
                            <div className="flex justify-between items-center text-emerald-500">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Add Payout</h3>
                                <button onClick={() => setShowAdd(false)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><X size={18} /></button>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                     <button className="bg-emerald-50 border border-emerald-500/20 p-4 rounded-2xl flex flex-col items-center gap-2">
                                         <Banknote size={20} className="text-emerald-500" />
                                         <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Bank</span>
                                     </button>
                                     <button className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col items-center gap-2">
                                         <CreditCard size={20} className="text-slate-400" />
                                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">UPI ID</span>
                                     </button>
                                </div>
                                <input placeholder="ACCOUNT HOLDER NAME" className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-[12px] font-black tracking-widest placeholder:text-slate-200" />
                                <input placeholder="IFSC CODE / UPI ID" className="w-full h-14 bg-slate-50 border-none rounded-2xl px-5 text-[12px] font-black tracking-widest placeholder:text-slate-200" />
                                <button onClick={() => setShowAdd(false)} className="w-full h-14 bg-slate-900 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest shadow-xl mt-4">Link Method</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <main className="space-y-6">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 rounded-[2.5rem] text-white relative overflow-hidden group shadow-xl transition-all hover:scale-102">
                    <div className="absolute top-[-40%] right-[-10%] w-48 h-48 bg-white/20 rounded-full blur-3xl opacity-50 transition-opacity" />
                    <div className="relative z-10 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <h3 className="text-[12px] font-black uppercase tracking-widest text-white/50">Settlement Standard</h3>
                                <p className="text-[20px] font-black tracking-tight leading-none">{accounts[0]?.name || '--'}</p>
                                <p className="text-[14px] font-black tracking-[0.2em] opacity-40">{accounts[0]?.info || '--'}</p>
                            </div>
                            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-lg">
                                <ShieldCheck size={28} strokeWidth={2.5} />
                            </div>
                        </div>
                        <div className="bg-white/10 border border-white/10 px-4 py-3 rounded-2xl flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                             <span>Settlements daily 2 AM</span>
                             <div className="flex items-center gap-2"><div className="w-2 h-2 bg-white rounded-full animate-pulse" /> Verified</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                     <div className="flex items-center justify-between px-1">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Payout Accounts</h3>
                          <button onClick={() => setShowAdd(true)} className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">+ Link Bank</button>
                     </div>

                     <div className="space-y-3">
                         {accounts.map((acc) => (
                             <div key={acc.id} className="bg-white p-5 rounded-2xl border border-white shadow-[0_5px_30px_rgba(0,0,0,0.015)] flex items-center justify-between group active:scale-98 transition-all">
                                 <div className="flex items-center gap-4">
                                     <div className={`w-11 h-11 rounded-xl flex items-center justify-center border border-slate-50 transition-colors bg-slate-50 text-slate-400 shadow-sm transition-transform group-hover:bg-slate-900 group-hover:text-white`}>
                                         {acc.icon}
                                     </div>
                                     <div className="space-y-0.5">
                                         <h4 className="text-[14px] font-black text-slate-900 leading-tight tracking-tight uppercase tracking-tighter">{acc.type}</h4>
                                         <p className="text-[11px] font-bold text-slate-400 opacity-60 leading-tight uppercase tracking-widest">{acc.info}</p>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                      <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border shadow-sm ${acc.status === 'Primary' ? 'bg-emerald-50 text-emerald-500 border-emerald-500/10' : 'bg-slate-50 text-slate-300 border-slate-200/50'}`}>{acc.status}</span>
                                      <ArrowRight size={16} className="text-slate-200" />
                                 </div>
                             </div>
                         ))}
                     </div>
                </div>

                <div onClick={openContact} className="bg-amber-50 border border-amber-500/10 p-5 rounded-2xl flex items-center gap-4 active:scale-97 transition-all cursor-pointer">
                     <HelpCircle size={22} className="text-amber-500" strokeWidth={3} />
                     <p className="text-[11px] font-bold text-slate-600 leading-snug tracking-tighter">Facing delay in settlements? <span className="text-amber-600 font-black border-b border-amber-600/20 uppercase tracking-widest ml-1">Connect Finance</span></p>
                </div>
            </main>
        </div>
    );
};

export default PayoutMethods;
