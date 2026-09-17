import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, HelpCircle, Phone, MessageCircle, ChevronRight, FileText, Globe, Search, ArrowUpRight, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const DriverSupport = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFaq, setActiveFaq] = useState(null);

    const faqs = [
        { q: 'How is payout calculated?', a: 'Based on distance + base fare + time.' },
        { q: 'What to do in an accident?', a: 'Press SOS immediately and call support.' },
        { q: 'How to change active vehicle?', a: 'Go to Vehicle Fleet and select primary.' }
    ];

    const openHelp = (type) => {
        if(type === 'call') window.open('tel:1800123456');
        if(type === 'wa') window.open('https://wa.me/919424100424');
    };

    return (
        <div className="min-h-screen bg-[#f8f9fb] font-sans p-6 pt-10 pb-32">
            <header className="flex items-center gap-4 mb-6 text-slate-900 uppercase">
                <button onClick={() => navigate(`${routePrefix}/profile`)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-lg font-black tracking-tight tracking-tighter">Support Hub</h1>
            </header>

            <AnimatePresence>
                {activeFaq !== null && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
                    >
                         <motion.div 
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-white p-7 rounded-[2rem] shadow-2xl space-y-4 max-w-sm w-full"
                         >
                             <div className="flex justify-between items-center text-blue-500 mb-2">
                                 <HelpCircle size={28} />
                                 <button onClick={() => setActiveFaq(null)} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><X size={18} /></button>
                             </div>
                             <h4 className="text-lg font-black text-slate-900 tracking-tight leading-none">{faqs[activeFaq].q}</h4>
                             <p className="text-[13px] font-bold text-slate-400 opacity-80 leading-relaxed">{faqs[activeFaq].a}</p>
                             <button onClick={() => setActiveFaq(null)} className="w-full h-12 bg-slate-900 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest mt-2">Close Topic</button>
                         </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="space-y-6">
                <div className="relative group overflow-hidden bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                    <Search size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Search issues..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-[13px] font-black tracking-tight text-slate-900 bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300 uppercase tracking-widest text-[9px]"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => openHelp('wa')}
                        className="bg-emerald-50 text-emerald-500 p-5 rounded-3xl border border-emerald-500/10 flex flex-col items-center gap-2 shadow-sm active:scale-95 transition-all text-center"
                    >
                        <MessageCircle size={24} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Chat on WhatsApp</span>
                    </button>
                    <button 
                        onClick={() => openHelp('call')}
                        className="bg-blue-50 text-blue-500 p-5 rounded-3xl border border-blue-500/10 flex flex-col items-center gap-2 shadow-sm active:scale-95 transition-all text-center"
                    >
                        <Phone size={24} strokeWidth={2.5} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Speak to Agent</span>
                    </button>
                </div>

                <div className="space-y-4">
                     <div className="flex items-center justify-between px-1">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Troubleshooting</h3>
                          <button className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 pb-0.5">Documentation</button>
                     </div>

                     <div className="space-y-3">
                         {faqs.map((faq, idx) => (
                             <div 
                                key={idx} 
                                onClick={() => setActiveFaq(idx)}
                                className="bg-white p-4 py-5 rounded-2xl border border-white shadow-sm flex items-center justify-between group active:scale-[0.99] transition-all cursor-pointer"
                             >
                                 <div className="flex items-center gap-4">
                                     <div className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                         <HelpCircle size={18} />
                                     </div>
                                     <h4 className="text-[13px] font-black text-slate-900 leading-tight tracking-tight uppercase tracking-tighter">{faq.q}</h4>
                                 </div>
                                 <ArrowUpRight size={18} className="text-slate-200 group-hover:text-blue-500 transition-colors" />
                             </div>
                         ))}
                     </div>
                </div>

                <div className="space-y-3 pb-5">
                    {[
                        { label: 'Privacy Policy', icon: <FileText size={16} />, path: '/privacy' },
                        { label: 'Terms of Service', icon: <Globe size={16} />, path: '/terms' }
                    ].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-400 px-2 py-1 active:text-slate-900 transition-colors cursor-pointer">
                             <div className="flex items-center gap-3">
                                 {item.icon}
                                 <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                             </div>
                             <ChevronRight size={16} />
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default DriverSupport;
