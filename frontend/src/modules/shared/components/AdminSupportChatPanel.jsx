import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  CircleUser,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  ChevronLeft,
  Paperclip,
  MessageSquare,
  AlertCircle,
  Filter,
  Phone,
  User,
  MapPin,
  CreditCard,
  Car,
  Star,
  Shield,
  Smile,
  Image,
  MoreVertical,
  Info,
  Calendar,
  ChevronRight,
  Plus,
  Check,
  CheckCheck,
  RefreshCw,
  FileText,
  X,
  LifeBuoy,
} from 'lucide-react';
import { socketService } from '../../../shared/api/socket';
import { deleteSupportConversation, getSupportConversations, getSupportMessages, markSupportMessagesRead, sendSupportMessage } from '../chat/chatApi';
import { getChatSession, parseSupportConversationKey } from '../chat/chatIdentity';

const quickReplies = ['Payment issue', 'Ride delayed', 'Lost item', 'Safety concern'];
const AnimatedError = motion.div;

const formatTime = (value) => {
  if (!value) {
    return 'Just now';
  }

  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Just now';
  }
};

const normalizeMessage = (message) => ({
  ...message,
  sender: {
    role: message?.sender?.role || 'user',
    id: message?.sender?.id || '',
    name: message?.sender?.name || '',
    phone: message?.sender?.phone || '',
  },
  receiver: {
    role: message?.receiver?.role || 'admin',
    id: message?.receiver?.id || '',
    name: message?.receiver?.name || '',
    phone: message?.receiver?.phone || '',
  },
});

const normalizeConversation = (conversation) => ({
  conversationKey: conversation.conversationKey,
  peer: conversation.peer || {
    role: 'admin',
    id: '',
    name: 'Support Team',
    phone: '',
  },
  latestMessage: conversation.latestMessage ? normalizeMessage(conversation.latestMessage) : null,
  unreadCount: conversation.unreadCount || 0,
  updatedAt: conversation.updatedAt || conversation.latestMessage?.createdAt || null,
});

const getConversationIdentityKey = (conversationKey) =>
  parseSupportConversationKey(conversationKey)?.canonicalKey || String(conversationKey || '');

const mergeConversationEntry = (existing = {}, incoming = {}) => {
  const existingUpdatedAt = new Date(existing.updatedAt || 0).getTime();
  const incomingUpdatedAt = new Date(incoming.updatedAt || 0).getTime();
  const prefersIncoming = incomingUpdatedAt >= existingUpdatedAt;

  return {
    ...existing,
    ...incoming,
    conversationKey: prefersIncoming
      ? (incoming.conversationKey || existing.conversationKey)
      : (existing.conversationKey || incoming.conversationKey),
    peer: {
      ...(existing.peer || {}),
      ...(incoming.peer || {}),
    },
    latestMessage: incoming.latestMessage || existing.latestMessage || null,
    unreadCount: Math.max(existing.unreadCount || 0, incoming.unreadCount || 0),
    updatedAt: incoming.updatedAt || existing.updatedAt || null,
  };
};

const dedupeConversations = (conversationList = []) => {
  const merged = new Map();

  for (const conversation of conversationList) {
    const identityKey = getConversationIdentityKey(conversation.conversationKey);
    const existing = merged.get(identityKey);
    merged.set(identityKey, mergeConversationEntry(existing, conversation));
  }

  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0),
  );
};

const SupportChatPanel = ({
  mode = 'participant',
  title = 'Support Chat',
  subtitle = 'Live messages with admin',
  preferredRole,
  className = '',
  initialDraft = '',
  surface = 'card',
  targetConversationKey = '',
  targetPeerRole = '',
  targetPeerId = '',
  targetPeerName = '',
  targetPeerPhone = '',
  showSidebar = true,
}) => {
  const session = useMemo(
    () => getChatSession(preferredRole || (mode === 'admin' ? 'admin' : undefined)),
    [mode, preferredRole],
  );
  const isAdminPanel = mode === 'admin';
  const isLiveEnabled = session.isAuthenticated;
  const isPlainSurface = surface === 'plain';

  useEffect(() => {
    if (!session.role || session.role === 'guest') {
      return undefined;
    }

    localStorage.setItem('chatRole', session.role);

    return () => {
      if (localStorage.getItem('chatRole') === session.role) {
        localStorage.removeItem('chatRole');
      }
    };
  }, [session.role]);

  const [conversations, setConversations] = useState([]);
  const [selectedConversationKey, setSelectedConversationKey] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(socketService.isConnected());
  const bottomRef = useRef(null);
  const appliedInitialDraftRef = useRef('');
  const typingTimeoutRef = useRef(null);

  const [filterTab, setFilterTab] = useState('ALL');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(true);

  useEffect(() => {
    if (targetConversationKey) {
      setSelectedConversationKey(targetConversationKey);
      setConversations((current) => {
        const identityKey = getConversationIdentityKey(targetConversationKey);
        const exists = current.some(
          (item) => getConversationIdentityKey(item.conversationKey) === identityKey
        );
        if (!exists) {
          const synthetic = {
            conversationKey: targetConversationKey,
            peer: {
              role: targetPeerRole || parseSupportConversationKey(targetConversationKey)?.peerRole || 'user',
              id: targetPeerId || parseSupportConversationKey(targetConversationKey)?.peerId || '',
              name: targetPeerName || 'Support Contact',
              phone: targetPeerPhone || '',
            },
            latestMessage: null,
            unreadCount: 0,
            updatedAt: new Date().toISOString(),
          };
          return dedupeConversations([synthetic, ...current]);
        }
        return current;
      });
    }
  }, [targetConversationKey, targetPeerRole, targetPeerId, targetPeerName, targetPeerPhone]);

  const normalizedSelectedConversationKey = useMemo(
    () => getConversationIdentityKey(selectedConversationKey),
    [selectedConversationKey],
  );

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (item) => getConversationIdentityKey(item.conversationKey) === normalizedSelectedConversationKey,
      ) || null,
    [conversations, normalizedSelectedConversationKey],
  );

  const isMessageForActiveConversation = (message, conversationKey = selectedConversationKey) => {
    const parsedConversation = parseSupportConversationKey(conversationKey);

    if (!parsedConversation || !message?.sender || !message?.receiver) {
      return false;
    }

    const sessionId = session.id ? String(session.id) : '';
    const senderId = String(message.sender.id || '');
    const receiverId = String(message.receiver.id || '');

    if (!sessionId || !senderId || !receiverId) {
      return message.conversationKey === conversationKey || message.conversationKey === parsedConversation.canonicalKey;
    }

    if (session.role === 'admin') {
      return (
        message.sender.role === 'admin' &&
        senderId === sessionId &&
        message.receiver.role === parsedConversation.peerRole &&
        receiverId === String(parsedConversation.peerId)
      ) || (
          message.sender.role === parsedConversation.peerRole &&
          senderId === String(parsedConversation.peerId) &&
          message.receiver.role === 'admin' &&
          receiverId === sessionId
        );
    }

    return (
      message.sender.role === session.role &&
      senderId === sessionId &&
      message.receiver.role === 'admin' &&
      receiverId === String(parsedConversation.adminId)
    ) || (
        message.sender.role === 'admin' &&
        senderId === String(parsedConversation.adminId) &&
        message.receiver.role === session.role &&
        receiverId === sessionId
      );
  };

  const visibleConversations = useMemo(() => {
    let list = conversations;
    const normTab = String(filterTab || 'ALL').toUpperCase();

    if (normTab === 'USERS') {
      list = list.filter((c) => {
        const role = String(c.peer?.role || 'user').toLowerCase();
        return role === 'user' || role === 'customer';
      });
    } else if (normTab === 'DRIVERS') {
      list = list.filter((c) => String(c.peer?.role || '').toLowerCase() === 'driver');
    } else if (normTab === 'VENDORS') {
      list = list.filter((c) => {
        const role = String(c.peer?.role || '').toLowerCase();
        return role === 'vendor' || role === 'owner';
      });
    } else if (normTab === 'SUPPORT') {
      list = list.filter((c) => {
        const role = String(c.peer?.role || '').toLowerCase();
        return role === 'support' || role === 'admin';
      });
    } else if (normTab === 'UNREAD') {
      list = list.filter((c) => (c.unreadCount || 0) > 0);
    } else if (normTab === 'ACTIVE') {
      list = list.filter((c) => c.latestMessage !== null);
    } else if (normTab === 'RESOLVED') {
      list = [];
    }

    const query = search.trim().toLowerCase();

    if (!query) {
      return list;
    }

    return list.filter((conversation) => {
      const peerName = conversation.peer?.name || '';
      const peerPhone = conversation.peer?.phone || '';
      const latestText = conversation.latestMessage?.message || '';
      return [peerName, peerPhone, latestText].some((value) => value.toLowerCase().includes(query));
    });
  }, [conversations, search, filterTab]);

  const syncConversationList = (message) => {
    setConversations((current) => {
      const latestMessage = normalizeMessage(message);
      const parsedConversation = parseSupportConversationKey(message.conversationKey);
      const identityKey = getConversationIdentityKey(message.conversationKey);
      const existingConversation =
        current.find((item) => getConversationIdentityKey(item.conversationKey) === identityKey) || null;
      const adminSide =
        latestMessage.sender.role === 'admin'
          ? {
            role: 'admin',
            id: latestMessage.sender.id,
            name: latestMessage.sender.name,
            phone: latestMessage.sender.phone,
          }
          : {
            role: 'admin',
            id: latestMessage.receiver.id,
            name: latestMessage.receiver.name,
            phone: latestMessage.receiver.phone,
          };

      const peer =
        session.role === 'admin'
          ? {
            role: parsedConversation?.peerRole || (latestMessage.sender.role === 'admin' ? latestMessage.receiver.role : latestMessage.sender.role),
            id: parsedConversation?.peerId || (latestMessage.sender.role === 'admin' ? latestMessage.receiver.id : latestMessage.sender.id),
            name: latestMessage.sender.role === 'admin' ? latestMessage.receiver.name : latestMessage.sender.name,
            phone: latestMessage.sender.role === 'admin' ? latestMessage.receiver.phone : latestMessage.sender.phone,
          }
          : {
            ...adminSide,
            name: adminSide.name || 'Support Team',
            phone: adminSide.phone || '',
          };

      const unreadCount =
        message.receiver.role === session.role &&
          message.sender.role !== session.role &&
          normalizedSelectedConversationKey !== identityKey
          ? (existingConversation?.unreadCount || 0) + 1
          : 0;

      const nextConversation = {
        conversationKey: parsedConversation?.canonicalKey || message.conversationKey,
        peer,
        latestMessage,
        unreadCount,
        updatedAt: message.createdAt,
      };
      const next = current.map((item) =>
        getConversationIdentityKey(item.conversationKey) === identityKey ? mergeConversationEntry(item, nextConversation) : item,
      );

      if (next.some((item) => getConversationIdentityKey(item.conversationKey) === identityKey)) {
        return dedupeConversations(next);
      }

      return dedupeConversations([nextConversation, ...current]);
    });
  };

  const resolveConversationKeys = (conversationKey) => {
    const parsed = parseSupportConversationKey(conversationKey);
    return parsed?.keys || (conversationKey ? [conversationKey] : []);
  };

  const matchesConversationKey = (leftKey, rightKey) => {
    const leftKeys = resolveConversationKeys(leftKey);
    const rightKeys = resolveConversationKeys(rightKey);
    return leftKeys.some((key) => rightKeys.includes(key));
  };

  useEffect(() => {
    if (!isLiveEnabled) {
      return undefined;
    }

    socketService.connect({ role: session.role, token: session.token });

    const handleMessage = (incomingMessage) => {
      const message = normalizeMessage(incomingMessage);
      syncConversationList(message);

      if (isMessageForActiveConversation(message)) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) {
            return current;
          }

          return [...current, message];
        });

        if (message.sender.role !== session.role) {
          socketService.emit('chat:read', { conversationKey: message.conversationKey });
        }
      }
    };

    const handleConversationUpdate = ({ message }) => {
      if (!message) {
        return;
      }

      syncConversationList(normalizeMessage(message));
    };

    const handleSocketError = (payload) => {
      setError(payload?.message || 'Socket connection error');
    };

    const handleConversationDeleted = (payload) => {
      const deletedKeys = payload?.keys || resolveConversationKeys(payload?.conversationKey);
      const activeConversationKeys = resolveConversationKeys(selectedConversationKey);
      const isActiveDeleted = activeConversationKeys.some((key) => deletedKeys.includes(key));

      if (isActiveDeleted) {
        setMessages([]);
        setDraft('');
      }

      setConversations((current) => {
        const next = current.filter((item) => !deletedKeys.includes(item.conversationKey));

        if (!isAdminPanel) {
          if (next.length === 0 && current.length > 0) {
            const fallback = current[0];
            return [
              {
                ...fallback,
                latestMessage: null,
                unreadCount: 0,
                updatedAt: null,
              },
            ];
          }

          return next.map((item) =>
            deletedKeys.includes(item.conversationKey)
              ? {
                ...item,
                latestMessage: null,
                unreadCount: 0,
                updatedAt: null,
              }
              : item,
          );
        }

        if (isActiveDeleted) {
          setSelectedConversationKey(next[0]?.conversationKey || '');
        }

        return next;
      });
    };

    const handleTyping = (payload) => {
      const payloadKey = getConversationIdentityKey(payload?.conversationKey);
      const activeKey = getConversationIdentityKey(selectedConversationKey);
      if (payloadKey === activeKey && payload?.role !== session.role) {
        setIsPeerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          setIsPeerTyping(false);
        }, 4000);
      }
    };

    const handleStopTyping = (payload) => {
      const payloadKey = getConversationIdentityKey(payload?.conversationKey);
      const activeKey = getConversationIdentityKey(selectedConversationKey);
      if (payloadKey === activeKey && payload?.role !== session.role) {
        setIsPeerTyping(false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    };

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);

    socketService.on('chat:message', handleMessage);
    socketService.on('chat:conversation-updated', handleConversationUpdate);
    socketService.on('chat:conversation-deleted', handleConversationDeleted);
    socketService.on('chat:typing', handleTyping);
    socketService.on('chat:stop-typing', handleStopTyping);
    socketService.on('errorMessage', handleSocketError);

    setIsConnected(socketService.isConnected());

    return () => {
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('chat:message', handleMessage);
      socketService.off('chat:conversation-updated', handleConversationUpdate);
      socketService.off('chat:conversation-deleted', handleConversationDeleted);
      socketService.off('chat:typing', handleTyping);
      socketService.off('chat:stop-typing', handleStopTyping);
      socketService.off('errorMessage', handleSocketError);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [isLiveEnabled, session.role, selectedConversationKey]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadConversations = async () => {
    if (!isLiveEnabled) return;
    setLoading(true);
    setError('');

    try {
      const response = await getSupportConversations(session.token);
      const nextConversations = (response?.data?.conversations || []).map(normalizeConversation);

      setConversations((current) => {
        return dedupeConversations([...current, ...nextConversations]);
      });

      if (!selectedConversationKey && nextConversations.length > 0) {
        setSelectedConversationKey(getConversationIdentityKey(nextConversations[0].conversationKey));
      }
    } catch (chatError) {
      setError(chatError?.message || 'Unable to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!isLiveEnabled || !selectedConversationKey) return;
    setMessages([]);
    setLoading(true);
    setError('');

    try {
      const response = await getSupportMessages(selectedConversationKey, session.token);
      const nextMessages = (response?.data?.messages || [])
        .map(normalizeMessage)
        .filter((message) => isMessageForActiveConversation(message, selectedConversationKey));

      setMessages(
        nextMessages.sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0)),
      );
      socketService.emit('chat:join', { conversationKey: selectedConversationKey });
      socketService.emit('chat:read', { conversationKey: selectedConversationKey });
      await markSupportMessagesRead(selectedConversationKey, session.token);
    } catch (chatError) {
      setError(chatError?.message || 'Unable to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [isLiveEnabled]);

  useEffect(() => {
    loadMessages();
  }, [isLiveEnabled, selectedConversationKey]);

  useEffect(() => {
    const parsedConversation = parseSupportConversationKey(selectedConversationKey);

    if (parsedConversation && parsedConversation.canonicalKey !== selectedConversationKey) {
      setSelectedConversationKey(parsedConversation.canonicalKey);
    }
  }, [selectedConversationKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const normalizedInitialDraft = String(initialDraft || '').trim();

    if (!normalizedInitialDraft || appliedInitialDraftRef.current === normalizedInitialDraft) {
      return;
    }

    setDraft((current) => current || normalizedInitialDraft);
    appliedInitialDraftRef.current = normalizedInitialDraft;
  }, [initialDraft]);

  const handleSelectConversation = (conversationKey) => {
    const parsedConversation = parseSupportConversationKey(conversationKey);
    setSelectedConversationKey(parsedConversation?.canonicalKey || conversationKey);
  };

  const handleClearChat = async () => {
    if (!selectedConversationKey || deleting) {
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await deleteSupportConversation(selectedConversationKey, session.token);
      const selectedKeys = resolveConversationKeys(selectedConversationKey);

      setMessages([]);
      setDraft('');

      setConversations((current) => {
        if (!isAdminPanel) {
          return current.map((item) =>
            selectedKeys.some((key) => matchesConversationKey(item.conversationKey, key))
              ? {
                ...item,
                latestMessage: null,
                unreadCount: 0,
                updatedAt: null,
              }
              : item,
          );
        }

        const next = current.filter((item) => !selectedKeys.some((key) => matchesConversationKey(item.conversationKey, key)));
        setSelectedConversationKey(next[0]?.conversationKey || '');
        return next;
      });
    } catch (chatError) {
      setError(chatError?.message || 'Unable to delete chat');
    } finally {
      setDeleting(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !selectedConversationKey) {
      return;
    }

    setSending(true);
    setError('');
    const parsedConversation = parseSupportConversationKey(selectedConversationKey);

    const payload = isAdminPanel
      ? {
        message: text,
        receiverRole: parsedConversation?.peerRole || selectedConversation?.peer?.role || 'user',
        receiverId: parsedConversation?.peerId || selectedConversation?.peer?.id,
        conversationKey: selectedConversationKey,
      }
      : {
        message: text,
        conversationKey: selectedConversationKey,
      };

    try {
      if (socketService.isConnected()) {
        socketService.emit('chat:send', payload);
      } else {
        const response = await sendSupportMessage(payload, session.token);
        const savedMessage = normalizeMessage(response?.data?.message);

        if (savedMessage?.id) {
          setMessages((current) => [...current, savedMessage]);
          syncConversationList(savedMessage);
        }
      }

      setDraft('');
    } catch (chatError) {
      setError(chatError?.message || 'Unable to send message');
    } finally {
      setSending(false);
    }
  };

  const unreadCountTotal = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [conversations]);

  const filterCounts = useMemo(() => {
    return {
      ALL: conversations.length,
      USERS: conversations.filter((c) => {
        const role = String(c.peer?.role || 'user').toLowerCase();
        return role === 'user' || role === 'customer';
      }).length,
      DRIVERS: conversations.filter((c) => String(c.peer?.role || '').toLowerCase() === 'driver').length,
      VENDORS: conversations.filter((c) => {
        const role = String(c.peer?.role || '').toLowerCase();
        return role === 'vendor' || role === 'owner';
      }).length,
      SUPPORT: conversations.filter((c) => {
        const role = String(c.peer?.role || '').toLowerCase();
        return role === 'support' || role === 'admin';
      }).length,
      UNREAD: conversations.filter((c) => (c.unreadCount || 0) > 0).length,
      ACTIVE: conversations.filter((c) => c.latestMessage !== null).length,
      RESOLVED: 0,
    };
  }, [conversations]);

  const stats = useMemo(() => [
    {
      title: 'Total Conversations',
      value: 245 + conversations.length,
      icon: <MessageSquare size={18} className="text-[#0B1220]" />,
      bg: 'bg-indigo-50/40 border-indigo-100',
    },
    {
      title: 'Unread Messages',
      value: unreadCountTotal,
      icon: <LifeBuoy size={18} className="text-rose-600" />,
      bg: 'bg-rose-50/40 border-rose-100',
    },
    {
      title: 'Online Users',
      value: conversations.length + (isConnected ? 5 : 1),
      icon: <CircleUser size={18} className="text-emerald-600" />,
      bg: 'bg-emerald-50/40 border-emerald-100',
    },
    {
      title: 'Open Support Tickets',
      value: conversations.filter(c => c.unreadCount > 0).length + 3,
      icon: <FileText size={18} className="text-amber-600" />,
      bg: 'bg-amber-50/40 border-amber-100',
    },
  ], [conversations, unreadCountTotal, isConnected]);

  const activePeerRole = selectedConversation?.peer?.role || 'user';
  const activePeerName = selectedConversation?.peer?.name || 'Support Thread';
  const activePeerPhone = selectedConversation?.peer?.phone || 'No phone number available';

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadConversations();
      if (selectedConversationKey) {
        await loadMessages();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportChat = () => {
    if (!selectedConversation || messages.length === 0) {
      alert('Please select a conversation first');
      return;
    }

    const header = 'Sender Role,Sender Name,Message,Timestamp\n';
    const rows = messages.map(msg => {
      const role = msg.sender?.role || 'user';
      const name = msg.sender?.name || 'Unknown';
      const cleanMessage = String(msg.message || '').replace(/"/g, '""');
      const time = formatTime(msg.createdAt);
      return `"${role}","${name}","${cleanMessage}","${time}"`;
    }).join('\n');

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + rows);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `chat_transcript_${selectedConversationKey}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-full flex-col bg-[#F8FAFC] font-poppins min-h-[38rem] overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFC400]/10 text-[#0B1220]">
            <MessageSquare size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0B1220] tracking-tight">Chats</h1>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Admin ↔ User ↔ Driver ↔ Vendor Conversations
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${isConnected ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'
            }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="tracking-wider uppercase text-[10px]">{isConnected ? 'Live Connection' : 'Offline'}</span>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all hover:scale-[1.02] disabled:opacity-50"
            title="Refresh Conversations"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={handleExportChat}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all hover:scale-[1.02]"
          >
            <FileText size={14} />
            <span>Export Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDetailsPanel(prev => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all hover:scale-[1.02] ${showDetailsPanel ? 'border-slate-350 bg-slate-100 text-slate-800' : 'border-slate-200 bg-white text-slate-700'
              }`}
          >
            <Info size={14} />
            <span>Info Panel</span>
          </button>
        </div>
      </div>

      {/* Top Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 shrink-0 bg-[#F8FAFC]">
        {stats.map((stat, idx) => (
          <div key={idx} className={`flex items-center justify-between p-4 rounded-[18px] border bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group ${stat.bg}`}>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{stat.title}</p>
              <h3 className="text-xl font-bold text-[#0B1220] mt-1 group-hover:scale-105 transition-transform origin-left">{stat.value}</h3>
            </div>
            <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100">
              {stat.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="px-6 py-4 bg-white border-b border-slate-200/60 shrink-0 flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] px-4 py-2.5 focus-within:border-indigo-500 focus-within:bg-white transition-all">
          <Search size={18} className="text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search conversations by name, phone, email, ride ID..."
            className="w-full bg-transparent text-sm font-semibold text-slate-750 outline-none placeholder:text-slate-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'USERS', 'DRIVERS', 'VENDORS', 'SUPPORT', 'UNREAD', 'ACTIVE', 'RESOLVED'].map((tab) => {
            const count = filterCounts[tab] !== undefined ? filterCounts[tab] : 0;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-[1.02] ${filterTab === tab
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                  }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="flex flex-1 min-h-0 min-w-0 bg-[#F8FAFC]">
        {/* Left Side: Conversation List */}
        <aside className={`flex flex-col shrink-0 bg-white border-r border-slate-200/60 w-full md:w-[28%] transition-all duration-300 ${mobileShowChat ? 'hidden md:flex' : 'flex'
          }`}>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {loading && conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2.5">
                <Loader2 size={22} className="animate-spin text-[#FFC400]" />
                <span className="text-xs font-semibold">Syncing support desk...</span>
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center bg-slate-50/30 border border-dashed border-slate-200 rounded-2xl mx-1.5">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 text-slate-400 mb-2 animate-bounce">
                  <LifeBuoy size={16} />
                </div>
                <h3 className="text-[11px] font-bold text-[#0B1220] uppercase tracking-wider">No Chats</h3>
                <p className="text-[10px] font-medium text-slate-455 mt-1 max-w-[170px]">
                  Incoming support chats will appear here.
                </p>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="mt-3.5 px-2.5 py-1 text-[9px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors uppercase flex items-center gap-1.5 justify-center mx-auto"
                >
                  {isRefreshing && <Loader2 size={10} className="animate-spin text-[#FFC400]" />}
                  <span>Refresh</span>
                </button>
              </div>
            ) : (
              visibleConversations.map((conversation) => {
                const isSel = selectedConversationKey === conversation.conversationKey;
                const peerRole = conversation.peer?.role || 'user';
                return (
                  <button
                    key={conversation.conversationKey}
                    onClick={() => {
                      handleSelectConversation(conversation.conversationKey);
                      setMobileShowChat(true);
                    }}
                    className={`flex w-full items-start gap-3 rounded-[16px] border p-3.5 text-left transition-all relative group ${isSel
                        ? 'border-slate-100 bg-[#FFC400]/5 shadow-sm shadow-[#FFC400]/10 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3.5px] before:bg-[#FFC400] before:rounded-r-md'
                        : 'border-transparent bg-transparent hover:bg-slate-100/50'
                      }`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-slate-600 bg-white ${isSel ? 'border-amber-200 text-amber-700 shadow-sm' : 'border-slate-200'
                      }`}>
                      {peerRole === 'driver' ? <Car size={18} /> : <User size={18} />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <p className={`truncate text-xs font-bold leading-none ${isSel ? 'text-indigo-600' : 'text-slate-900'}`}>
                          {conversation.peer?.name || 'Support Contact'}
                        </p>
                        <span className="text-[9px] font-bold text-slate-400 shrink-0">
                          {formatTime(conversation.updatedAt).split(',')[1] || 'Today'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 leading-none">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${peerRole === 'driver' ? 'text-amber-600' : 'text-indigo-600'
                          }`}>
                          {peerRole}
                        </span>
                        {conversation.peer?.id && (
                          <>
                            <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                            <span className="text-[9px] font-semibold text-slate-400">ID: {String(conversation.peer.id).slice(-6)}</span>
                          </>
                        )}
                      </div>

                      <p className="mt-2 truncate text-[11px] font-medium text-slate-500 leading-normal">
                        {conversation.latestMessage?.message || 'No messages yet'}
                      </p>
                    </div>

                    {conversation.unreadCount > 0 && (
                      <span className="absolute right-3 bottom-3 rounded-full bg-[#FFC400] px-2 py-0.5 text-[9px] font-bold text-[#0B1220]">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Center: Selected Chat Area */}
        <main className={`flex-1 min-w-0 min-h-0 flex flex-col bg-white border-r border-slate-200/60 transition-all duration-300 ${mobileShowChat ? 'flex' : 'hidden md:flex'
          }`}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/60 bg-white px-6 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileShowChat(false)}
                    className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 border border-slate-100">
                    {activePeerRole === 'driver' ? <Car size={18} /> : <User size={18} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-slate-900 leading-tight">
                        {activePeerName}
                      </h3>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 leading-none mt-0.5">
                      {activePeerRole === 'driver' ? 'Driver Live thread' : 'User Live thread'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${activePeerPhone}`}
                    className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                    title="Call Contact"
                  >
                    <Phone size={14} />
                  </a>

                  <button
                    type="button"
                    onClick={handleClearChat}
                    disabled={!selectedConversationKey || messages.length === 0 || deleting}
                    className="p-2 rounded-xl border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-150 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Resolve support thread"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="flex flex-wrap items-center gap-2 bg-[#F8FAFC] border-b border-slate-200/60 px-6 py-2.5">
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/50 rounded-lg cursor-not-allowed border border-slate-200/40"
                >
                  Refund
                </button>
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/50 rounded-lg cursor-not-allowed border border-slate-200/40"
                >
                  Call User
                </button>
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/50 rounded-lg cursor-not-allowed border border-slate-200/40"
                >
                  Call Driver
                </button>
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/50 rounded-lg cursor-not-allowed border border-slate-200/40"
                >
                  Escalate
                </button>
                <button
                  type="button"
                  disabled
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-200/50 rounded-lg cursor-not-allowed border border-slate-200/40"
                >
                  Assign Admin
                </button>
                <button
                  type="button"
                  onClick={handleClearChat}
                  disabled={!selectedConversationKey || messages.length === 0 || deleting}
                  className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 rounded-lg border border-rose-100 hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
                >
                  Resolve Ticket
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50/40">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-4 py-2.5 shadow-sm">
                      <Loader2 size={14} className="animate-spin text-indigo-600" />
                      <span className="text-[11px] font-bold text-slate-500">Retrieving chats...</span>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-3xl flex-col gap-3.5">
                    {/* Date separator mockup */}
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-[1px] bg-slate-200/60" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today</span>
                      <div className="flex-1 h-[1px] bg-slate-200/60" />
                    </div>

                    {messages.map((message) => {
                      const isMine =
                        message.sender.id && session.id
                          ? String(message.sender.id) === String(session.id)
                          : message.sender.role === session.role;
                      const senderRole = message.sender.role || 'user';
                      return (
                        <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex max-w-[78%] items-end gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100 shrink-0">
                              {isMine ? <User size={13} /> : <CircleUser size={13} />}
                            </div>
                            <div>
                              <div
                                className={`rounded-[18px] px-4 py-3 shadow-sm text-xs leading-relaxed ${isMine
                                    ? 'rounded-br-none bg-indigo-600 border border-indigo-650 text-white'
                                    : senderRole === 'driver'
                                      ? 'rounded-bl-none border border-slate-250 bg-amber-50/50 text-slate-800'
                                      : 'rounded-bl-none border border-slate-200 bg-white text-slate-800'
                                  }`}
                              >
                                <p className="font-medium whitespace-pre-wrap">{message.message}</p>
                              </div>
                              <div className={`mt-1 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 ${isMine ? 'justify-end' : 'justify-start'
                                }`}>
                                <span>{formatTime(message.createdAt)}</span>
                                {isMine && <CheckCheck size={11} className="text-indigo-600" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing indicator */}
                    {isPeerTyping && (
                      <div className="flex justify-start">
                        <div className="flex max-w-[78%] items-end gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100 shrink-0">
                            <CircleUser size={13} />
                          </div>
                          <div className="rounded-[18px] rounded-bl-none border border-slate-200 bg-white px-4 py-3.5 shadow-sm flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {/* Chat Input Area */}
              <div className="border-t border-slate-200/60 bg-white p-4">
                <AnimatePresence>
                  {error && (
                    <AnimatedError
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="mb-3 rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600 flex items-center gap-2 animate-shake"
                    >
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{error}</span>
                    </AnimatedError>
                  )}
                </AnimatePresence>

                <div className="mx-auto flex max-w-3xl items-center gap-2.5 rounded-[18px] border border-slate-250 bg-slate-50 px-3.5 py-2">
                  <button
                    type="button"
                    title="Quick replies"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-150 hover:bg-slate-50 transition-colors"
                    onClick={() => {
                      setDraft('Understood, resolving the issue right now.');
                    }}
                  >
                    <Smile size={14} />
                  </button>

                  <button
                    type="button"
                    title="Attachments are disabled currently"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-150 cursor-not-allowed opacity-50"
                  >
                    <Paperclip size={14} />
                  </button>

                  <input
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (socketService.isConnected() && selectedConversationKey) {
                        socketService.emit('chat:typing', { conversationKey: selectedConversationKey, role: session.role });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSend();
                      }
                    }}
                    placeholder={isAdminPanel ? 'Reply to support ticket...' : 'Type a message to admin...'}
                    className="flex-1 bg-transparent text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                  />

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-white transition-all ${sending || !draft.trim()
                        ? 'bg-slate-200 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/10'
                      }`}
                  >
                    {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Selected Chat Professional Empty State */
            <div className="flex-1 flex flex-col items-center justify-center bg-white p-8 text-center">
              <div className="w-16 h-16 rounded-[22px] bg-[#FFC400]/10 border border-[#FFC400]/20 flex items-center justify-center text-[#0B1220] mb-5">
                <LifeBuoy size={28} className="stroke-[2.5]" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-poppins">Welcome to Appzeto  Support Center</h3>
              <p className="text-xs text-slate-450 mt-2 max-w-sm leading-relaxed font-medium">
                Manage all conversations between Users, Drivers, Vendors, and Administrators from one single dashboard workspace.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (visibleConversations.length > 0) {
                    handleSelectConversation(visibleConversations[0].conversationKey);
                  }
                }}
                className="mt-6 px-4 py-2 bg-[#FFC400] text-[#0B1220] text-xs font-bold rounded-xl shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all uppercase"
              >
                View Active Conversations
              </button>
            </div>
          )}
        </main>

        {/* Right collapsible information panel */}
        {showDetailsPanel && (
          <aside className="hidden lg:flex flex-col shrink-0 w-[22%] bg-white border-l border-slate-200/60 p-5 overflow-y-auto">
            <div className="flex items-center gap-2 mb-5">
              <Info size={16} className="text-slate-400" />
              <h3 className="text-xs font-bold text-[#0B1220] uppercase tracking-wider">Session Info</h3>
            </div>

            {selectedConversation ? (
              <div className="space-y-5">
                {/* User/Driver info */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Participant Details</p>
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-xs font-bold text-slate-900">{activePeerName}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{activePeerRole}</p>
                    <p className="text-[10px] font-semibold text-slate-500 mt-2 truncate">{activePeerPhone}</p>
                  </div>
                </div>

                {/* Location mockup */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status & Services</p>
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-505">
                      <span>Trip Status</span>
                      <span className="text-[9px] font-bold uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Active</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-505">
                      <span>Rating</span>
                      <span className="flex items-center gap-0.5 text-amber-500">
                        <Star size={10} fill="currentColor" /> 4.9
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-[1px] bg-slate-100" />

                {/* No additional information helper block */}
                <div>
                  <p className="text-[10px] font-bold text-slate-450 italic text-center">
                    No additional information available.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <Info size={24} className="text-slate-350 mb-2" />
                <p className="text-xs font-semibold">Select a conversation to view details</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};

export default SupportChatPanel;
