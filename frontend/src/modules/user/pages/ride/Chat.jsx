import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Phone, Smile, Loader2 } from 'lucide-react';
import UserSupportChatPanel from '../../../shared/components/UserSupportChatPanel';
import { socketService } from '../../../../shared/api/socket';
import { getCurrentRide } from '../../services/currentRideService';

const RIDE_EVENTS = {
  joined: 'ride:joined',
  state: 'ride:state',
  send: 'ride:message:send',
  incoming: 'ride:message:new',
};

const toClock = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const normalizeMessage = (message, fallbackRole) => ({
  id: String(message?.id || message?._id || `${message?.senderId || 'msg'}-${message?.sentAt || Date.now()}`),
  senderRole: String(message?.senderRole || fallbackRole || '').toLowerCase(),
  senderId: String(message?.senderId || ''),
  message: String(message?.message || '').trim(),
  sentAt: message?.sentAt || new Date().toISOString(),
});

const buildPeerFromRideState = (ride, chatRole, fallbackPeer = {}) => {
  const otherParty = chatRole === 'driver' ? ride?.user : ride?.driver;
  const fallbackName = chatRole === 'driver' ? 'Passenger' : 'Driver';
  const fallbackSubtitle = chatRole === 'driver' ? 'Passenger - Active now' : 'Driver - Active now';

  return {
    name: otherParty?.name || fallbackPeer.name || fallbackName,
    phone: otherParty?.phone || otherParty?.mobile || otherParty?.phoneNumber || fallbackPeer.phone || '',
    subtitle: fallbackPeer.subtitle || fallbackSubtitle,
  };
};

const Chat = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isAdminChat = searchParams.get('admin') === 'true';
  const routeRole = searchParams.get('role');
  const isDriverRoute = location.pathname.startsWith('/taxi/driver');
  const chatRole = routeRole === 'driver' || routeRole === 'user'
    ? routeRole
    : isDriverRoute
      ? 'driver'
      : 'user';

  const peerFromState = location.state?.peer || location.state?.driver || {};
  const initialDraft = String(location.state?.initialDraft || '').trim();
  const rideId = location.state?.rideId || getCurrentRide()?.rideId || '';
  const hasLiveToken = Boolean(
    chatRole === 'driver'
      ? localStorage.getItem('driverToken') || localStorage.getItem('token')
      : localStorage.getItem('userToken') || localStorage.getItem('token'),
  );

  const [messages, setMessages] = useState(() => (
    isAdminChat
      ? [{ id: 'support-init', sender: 'other', text: 'Hello! How can we help you today?', time: '12:45' }]
      : []
  ));
  const [input, setInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [isJoiningRide, setIsJoiningRide] = useState(!isAdminChat);
  const [resolvedPeer, setResolvedPeer] = useState({
    name: peerFromState.name || (chatRole === 'driver' ? 'Passenger' : 'Driver'),
    phone: peerFromState.phone || peerFromState.mobile || peerFromState.phoneNumber || '',
    subtitle: peerFromState.subtitle || (chatRole === 'driver' ? 'Passenger - Active now' : 'Driver - Active now'),
  });

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const quickReplies = isAdminChat
    ? ['Payment Issue', 'Ride Cancelled', 'Lost Item', 'Safety']
    : ['Wait for me', "I'm coming", 'Where exactly?', 'Okay'];

  useEffect(() => {
    if (isAdminChat || !hasLiveToken) {
      return undefined;
    }

    if (!rideId) {
      setIsJoiningRide(false);
      setChatError('Ride chat is unavailable because no active ride was found.');
      return undefined;
    }

    const socket = socketService.connect({ role: chatRole });
    if (!socket) {
      setIsJoiningRide(false);
      setChatError('Could not connect trip chat right now.');
      return undefined;
    }

    const onRideState = (ride) => {
      if (!ride || String(ride.rideId || ride._id || '') !== String(rideId)) {
        return;
      }

      setResolvedPeer(buildPeerFromRideState(ride, chatRole, peerFromState));
      setMessages(
        Array.isArray(ride.messages)
          ? ride.messages
              .map((message) => normalizeMessage(message, chatRole))
              .filter((message) => message.message)
              .map((message) => ({
                id: message.id,
                sender: message.senderRole === chatRole ? 'user' : 'other',
                text: message.message,
                time: toClock(message.sentAt),
              }))
          : [],
      );
      setChatError('');
      setIsJoiningRide(false);
    };

    const onRideJoined = (payload) => {
      if (String(payload?.rideId || '') === String(rideId)) {
        setChatError('');
      }
    };

    const onRideMessage = (message) => {
      const normalized = normalizeMessage(message, chatRole);
      if (!normalized.message || String(message?.rideId || '') !== String(rideId)) {
        return;
      }

      setMessages((prev) => {
        if (prev.some((entry) => entry.id === normalized.id)) {
          return prev;
        }

        return [
          ...prev,
          {
            id: normalized.id,
            sender: normalized.senderRole === chatRole ? 'user' : 'other',
            text: normalized.message,
            time: toClock(normalized.sentAt),
          },
        ];
      });
    };

    const onSocketError = (payload) => {
      const nextMessage = payload?.message || 'Could not load ride chat.';
      setChatError(nextMessage);
      setIsJoiningRide(false);
    };

    socketService.on(RIDE_EVENTS.state, onRideState);
    socketService.on(RIDE_EVENTS.joined, onRideJoined);
    socketService.on(RIDE_EVENTS.incoming, onRideMessage);
    socketService.on('errorMessage', onSocketError);

    socketService.emit('joinRide', { rideId });
    socketService.emit('ride:join', { rideId });

    return () => {
      socketService.off(RIDE_EVENTS.state, onRideState);
      socketService.off(RIDE_EVENTS.joined, onRideJoined);
      socketService.off(RIDE_EVENTS.incoming, onRideMessage);
      socketService.off('errorMessage', onSocketError);
    };
  }, [chatRole, hasLiveToken, isAdminChat, peerFromState, rideId]);

  if (isAdminChat && hasLiveToken) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_60%,#EEF2F7_100%)] w-full lg:max-w-3xl mx-auto flex flex-col font-sans relative overflow-hidden p-4 lg:min-h-[85vh] lg:my-6 lg:rounded-3xl lg:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] lg:border lg:border-white/50">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Support</p>
            <h1 className="text-[16px] font-black text-slate-900">
              {chatRole === 'driver' ? 'Driver Chat' : 'User Chat'}
            </h1>
          </div>
        </div>
        <UserSupportChatPanel
          mode="participant"
          title={chatRole === 'driver' ? 'Driver Support' : 'User Support'}
          subtitle="Connected to the support desk"
          preferredRole={chatRole}
          initialDraft={initialDraft}
        />
      </div>
    );
  }

  const send = (text) => {
    const outgoing = String(text || input).trim();
    if (!outgoing || !rideId) {
      return;
    }

    setInput('');
    setChatError('');
    socketService.emit(RIDE_EVENTS.send, {
      rideId,
      message: outgoing,
    });
  };

  const otherName = resolvedPeer.name;
  const otherSub = resolvedPeer.subtitle;
  const otherPhone = resolvedPeer.phone;
  const avatarName = encodeURIComponent(otherName);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_60%,#EEF2F7_100%)] w-full lg:max-w-3xl mx-auto flex flex-col font-sans relative overflow-hidden lg:min-h-[85vh] lg:my-6 lg:rounded-3xl lg:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] lg:border lg:border-white/50">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/50 blur-3xl pointer-events-none" />

      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 backdrop-blur-md px-4 py-3.5 flex items-center gap-3 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)] sticky top-0 z-20">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0">
          <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
        </motion.button>

        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-[13px] flex items-center justify-center overflow-hidden border border-white/80 shadow-sm bg-slate-100">
            <img src={`https://ui-avatars.com/api/?name=${avatarName}&background=f1f5f9&color=0f172a`} alt={otherName} className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-black text-slate-900 leading-tight">{otherName}</p>
          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">{otherSub}</p>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            if (!otherPhone) {
              window.alert('Phone number is not available for this chat yet.');
              return;
            }
            window.open(`tel:${String(otherPhone).replace(/[^\d+]/g, '')}`, '_self');
          }}
          className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.07)] shrink-0"
        >
          <Phone size={15} className="text-slate-700" strokeWidth={2.5} />
        </motion.button>
      </motion.header>

      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto no-scrollbar">
        {isJoiningRide ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-2xl bg-white/90 border border-slate-100 px-4 py-3 shadow-sm">
              <Loader2 size={18} className="animate-spin text-slate-500" />
              <span className="text-[13px] font-bold text-slate-600">Connecting trip chat...</span>
            </div>
          </div>
        ) : (
          <>
            {!messages.length && !chatError && (
              <div className="flex justify-center pt-6">
                <div className="rounded-2xl bg-white/90 border border-slate-100 px-4 py-3 text-[12px] font-bold text-slate-500 shadow-sm">
                  Trip chat is connected.
                </div>
              </div>
            )}

            {chatError && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[12px] font-bold text-rose-600 shadow-sm">
                {chatError}
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8, x: isUser ? 12 : -12 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    transition={{ duration: 0.22 }}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[78%] px-4 py-2.5 rounded-[18px] shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${
                        isUser ? 'bg-slate-900 text-white rounded-br-[6px]' : 'bg-white/95 border border-white/80 text-slate-800 rounded-bl-[6px]'
                      }`}
                    >
                      <p className="text-[14px] font-bold leading-relaxed">{m.text}</p>
                      <span className={`text-[9px] font-black mt-1 block uppercase tracking-wider ${isUser ? 'text-white/50' : 'text-slate-400'}`}>
                        {m.time}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white/90 backdrop-blur-md border-t border-white/80 px-4 pt-3 pb-6 space-y-2.5 shadow-[0_-4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {quickReplies.map((r) => (
            <motion.button key={r} whileTap={{ scale: 0.95 }} onClick={() => send(r)} className="shrink-0 px-3.5 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-600 active:bg-slate-100 transition-all">
              {r}
            </motion.button>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-slate-50/80 rounded-[16px] px-3 py-2 border border-slate-100">
          <Smile size={18} className="text-slate-400 shrink-0" strokeWidth={2} />
          <input
            type="text"
            placeholder={rideId ? 'Type a message...' : 'Ride chat unavailable'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={!rideId || isJoiningRide}
            className="flex-1 bg-transparent border-none text-[14px] font-bold text-slate-900 focus:outline-none placeholder:text-slate-300 disabled:text-slate-400"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => send()}
            disabled={!input.trim() || !rideId || isJoiningRide}
            className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-all shrink-0 ${
              input.trim() && rideId && !isJoiningRide ? 'bg-slate-900 shadow-[0_4px_10px_rgba(15,23,42,0.2)]' : 'bg-slate-200'
            }`}
          >
            <Send size={14} className={input.trim() && rideId && !isJoiningRide ? 'text-white' : 'text-slate-400'} strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
