import React from 'react';
import SupportChatPanel from '../../../shared/components/SupportChatPanel';

const Chat = () => (
  <div className="h-[calc(100vh-7.5rem)] min-h-[36rem] min-w-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <SupportChatPanel
      mode="admin"
      title="Chats"
      subtitle="Admin <-> User & Driver conversations"
      surface="plain"
      className="h-full min-h-0"
    />
  </div>
);

export default Chat;
