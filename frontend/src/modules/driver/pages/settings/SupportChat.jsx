import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import UserSupportChatPanel from '../../../shared/components/UserSupportChatPanel';

const SupportChat = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const backPath = location.state?.backPath || `${routePrefix}/help-support`;
  const backState = location.state?.backState;

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans">
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <button
          onClick={() => navigate(backPath, backState ? { state: backState } : undefined)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-black text-slate-900">Support Chat</h1>
      </header>

      <UserSupportChatPanel
        mode="participant"
        preferredRole="driver"
        title="Driver Support Chat"
        subtitle="Live Messages"
        surface="plain"
        className="flex-1"
      />
    </div>
  );
};

export default SupportChat;
