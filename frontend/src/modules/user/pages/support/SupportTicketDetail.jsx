import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { supportTicketService } from '../../../shared/services/supportTicketService';

const STATUS_STYLES = {
  pending: 'bg-orange-50 text-orange-600 border-orange-100',
  assigned: 'bg-blue-50 text-blue-600 border-blue-100',
  closed: 'bg-emerald-50 text-emerald-600 border-emerald-100',
};

const SupportTicketDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: ticketCode } = useParams();
  const pathRole = window.location.pathname.includes('/taxi/driver') ? 'driver' : 'user';
  const ticketFromState = location.state?.ticket || null;

  const [ticket, setTicket] = useState(ticketFromState);
  const [messages, setMessages] = useState((ticketFromState?.messages || []).map((item) => ({
    id: item.id,
    senderRole: item.senderRole,
    senderName: item.senderName,
    message: item.message,
    createdAt: item.createdAt,
  })));
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading] = useState(!ticketFromState);
  const [error, setError] = useState('');

  const fetchTicket = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await supportTicketService.getMyTicket(ticketCode);
      const nextTicket = response?.data || null;
      setTicket(nextTicket);
      setMessages(
        (nextTicket?.messages || []).map((item) => ({
          id: item.id,
          senderRole: item.senderRole,
          senderName: item.senderName,
          message: item.message,
          createdAt: item.createdAt,
        })),
      );
    } catch (apiError) {
      setError(apiError?.message || 'Unable to load support ticket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ticketCode) return;
    fetchTicket();
  }, [ticketCode]);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    setError('');
    try {
      await supportTicketService.replyMyTicket(ticketCode, { message: text });
      setReply('');
      await fetchTicket();
    } catch (apiError) {
      setError(apiError?.message || 'Unable to send reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_100%)] max-w-lg mx-auto font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all shrink-0 mt-0.5">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">{ticket?.supportType || 'support'}</p>
            <h1 className="text-[16px] font-black tracking-tight text-slate-900 leading-tight truncate">{ticket?.title || 'Support Ticket'}</h1>
          </div>
          <span className={`text-[9px] font-black px-2.5 py-1 rounded-full border shrink-0 mt-1 ${STATUS_STYLES[ticket?.status] || STATUS_STYLES.pending}`}>{ticket?.status || 'pending'}</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 px-5 py-4 space-y-3 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : null}
        {error ? (
          <div className="rounded-[12px] border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-bold text-red-600">
            {error}
          </div>
        ) : null}
        {messages.map((m, i) => (
          <motion.div key={m.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`flex ${m.senderRole === pathRole ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-[16px] px-4 py-3 ${
              m.senderRole === pathRole
                ? 'bg-slate-900 text-white rounded-br-[4px]'
                : 'bg-white border border-white/80 shadow-[0_2px_8px_rgba(15,23,42,0.06)] text-slate-900 rounded-bl-[4px]'
            }`}>
              <p className={`text-[13px] font-bold leading-relaxed ${m.senderRole === pathRole ? 'text-white' : 'text-slate-800'}`}>{m.message}</p>
              <p className={`text-[9px] font-bold mt-1 ${m.senderRole === pathRole ? 'text-white/50 text-right' : 'text-slate-400'}`}>
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Reply bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/95 backdrop-blur-md border-t border-slate-100 px-4 py-3 pb-6 flex items-end gap-3">
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type your reply..."
          rows={1}
          className="flex-1 bg-slate-50 border border-slate-100 rounded-[14px] px-4 py-3 text-[14px] font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
        />
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleSend} disabled={!reply.trim() || sending}
          className={`w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 transition-all ${
            reply.trim() ? 'bg-slate-900 shadow-sm' : 'bg-slate-200'
          }`}>
          {sending
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Send size={16} className={reply.trim() ? 'text-white' : 'text-slate-400'} strokeWidth={2.5} />
          }
        </motion.button>
      </div>
    </div>
  );
};

export default SupportTicketDetail;
