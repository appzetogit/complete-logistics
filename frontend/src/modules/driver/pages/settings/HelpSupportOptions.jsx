import React from 'react';
import { ArrowLeft, ChevronRight, Headset, MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const HelpSupportOptions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

  return (
    <div className="min-h-screen bg-[#f8f9fb] p-6 pt-10 font-sans">
      <header className="mb-8 flex items-center gap-4 text-slate-900">
        <button
          onClick={() => navigate(`${routePrefix}/profile`)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-black tracking-tight">Help & Support</h1>
      </header>

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/support/chat`)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <MessageCircle size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">Live Chat</p>
              <p className="text-xs font-semibold text-slate-400">Talk instantly with support team</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>

        <button
          type="button"
          onClick={() => navigate(`${routePrefix}/support/tickets`)}
          className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-5 shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Headset size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-slate-900">Support Ticket</p>
              <p className="text-xs font-semibold text-slate-400">Raise and track issue tickets</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-slate-300" />
        </button>
      </div>
    </div>
  );
};

export default HelpSupportOptions;
