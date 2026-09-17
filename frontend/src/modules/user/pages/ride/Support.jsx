import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Phone, HelpCircle, AlertCircle, XCircle, ShieldCheck, ChevronRight, Siren } from 'lucide-react';
// ... removed BottomNavbar import ...
import { SUPPORT_INFO } from '../../../shared/content/supportInfo';

const Support = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';

  const helpTopics = [
    { title: "Driver didn't arrive", Icon: XCircle, iconClass: 'text-rose-500', ringClass: 'bg-rose-50/70 dark:bg-rose-950/20' },
    { title: 'Safety concern', Icon: ShieldCheck, iconClass: 'text-blue-600', ringClass: 'bg-blue-50/70 dark:bg-blue-950/20' },
    { title: 'I lost an item', Icon: HelpCircle, iconClass: 'text-orange-500', ringClass: 'bg-orange-50/70 dark:bg-amber-950/20' },
    { title: 'Payment failure', Icon: AlertCircle, iconClass: 'text-slate-800 dark:text-slate-200', ringClass: 'bg-slate-50/70 dark:bg-zinc-800/40' },
  ];

  const handleCall = () => {
    window.open(`tel:${SUPPORT_INFO.phoneHref}`, '_self');
  };

  const openSupportChat = (topicTitle = '') => {
    const initialDraft = topicTitle ? `Hi, I need help with: ${topicTitle}.` : '';

    navigate(`${routePrefix}/ride/chat?admin=true&role=user`, {
      state: initialDraft ? { initialDraft } : undefined,
    });
  };

  return (
    <div className="min-h-screen max-w-lg mx-auto flex flex-col font-sans relative pb-24 overflow-hidden user-app-theme">
      <div className="absolute -top-20 right-[-40px] h-48 w-48 rounded-full bg-orange-100/55 dark:bg-orange-500/10 blur-3xl pointer-events-none" />
      <div className="absolute top-56 left-[-60px] h-56 w-56 rounded-full bg-emerald-100/50 dark:bg-emerald-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-24 right-[-40px] h-44 w-44 rounded-full bg-blue-100/50 dark:bg-blue-500/5 blur-3xl pointer-events-none" />

      <header className="relative z-20 sticky top-0">
        <div className="bg-white/70 backdrop-blur-md border-b border-white/70 shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
          <div className="px-5 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 active:scale-95 transition-all rounded-full">
              <ArrowLeft size={22} className="text-slate-900" strokeWidth={3} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black tracking-[0.26em] text-slate-400">Support</p>
              <h1 className="mt-1 text-[18px] font-black text-slate-900 tracking-tight leading-none truncate">
                Help &amp; Support
              </h1>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-5 pt-4 flex-1 space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => openSupportChat()}
            className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(140px_100px_at_20%_25%,rgba(249,115,22,0.18),transparent_60%)]" aria-hidden="true" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl border border-white/80 bg-white/70 shadow-sm flex items-center justify-center text-orange-600">
                <MessageCircle size={20} strokeWidth={2.6} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-black text-slate-900 leading-tight">Live chat</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">Get quick help</div>
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={handleCall}
            className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(140px_100px_at_20%_25%,rgba(99,102,241,0.18),transparent_60%)]" aria-hidden="true" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl border border-white/80 bg-white/70 shadow-sm flex items-center justify-center text-indigo-600">
                <Phone size={20} strokeWidth={2.6} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-black text-slate-900 leading-tight">Call support</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">Talk to us</div>
              </div>
            </div>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`${routePrefix}/safety/sos`)}
            className="relative overflow-hidden rounded-2xl border border-white/80 bg-white/80 p-4 text-left shadow-[0_14px_34px_rgba(15,23,42,0.07)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(140px_100px_at_20%_25%,rgba(239,68,68,0.18),transparent_60%)]" aria-hidden="true" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl border border-white/80 bg-white/70 shadow-sm flex items-center justify-center text-rose-600">
                <Siren size={20} strokeWidth={2.6} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-black text-slate-900 leading-tight">Emergency SOS</div>
                <div className="mt-0.5 text-[11px] font-bold text-slate-500 truncate">Get safety help fast</div>
              </div>
            </div>
          </motion.button>
        </div>

        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400 mb-3 ml-1">
            Choose a topic
          </h3>
          <div className="space-y-2.5">
            {helpTopics.map((topic) => (
              <motion.button
                key={topic.title}
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => openSupportChat(topic.title)}
                className="w-full text-left bg-white/85 backdrop-blur-sm rounded-2xl p-3.5 border border-white/80 shadow-[0_14px_34px_rgba(15,23,42,0.07)] flex items-center justify-between gap-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.09)] active:translate-y-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-2xl border border-white/80 ${topic.ringClass} flex items-center justify-center shadow-sm`}>
                    <topic.Icon size={18} strokeWidth={2.6} className={topic.iconClass} />
                  </div>
                  <span className="text-[14px] font-black text-slate-900 tracking-tight truncate">{topic.title}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-50 border border-white/80 flex items-center justify-center text-slate-300 shadow-sm shrink-0">
                  <ChevronRight size={16} strokeWidth={3} />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Support;
