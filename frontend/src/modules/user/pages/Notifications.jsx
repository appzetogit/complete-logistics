import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bell, Trash2, Tag, ShieldCheck, Star, AlertCircle, RefreshCw, Megaphone, CheckCircle2 } from 'lucide-react';
// ... removed BottomNavbar import ...
import { userAuthService } from '../services/authService';
import { useUserTheme } from '../../../shared/context/UserThemeContext';
import {
  USER_NOTIFICATIONS_UPDATED_EVENT,
  clearRealtimeNotifications,
  getRealtimeNotifications,
  isRealtimeNotification,
  removeRealtimeNotification,
} from '../utils/realtimeNotificationStore';
import toast from 'react-hot-toast';

const formatNotificationTime = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TYPE_ICONS = {
  ride:     { icon: Star,        bg: 'bg-orange-50',  color: 'text-orange-500' },
  promo:    { icon: Tag,         bg: 'bg-yellow-50',  color: 'text-yellow-500' },
  safety:   { icon: ShieldCheck, bg: 'bg-blue-50',    color: 'text-blue-500'   },
  referral: { icon: Star,        bg: 'bg-emerald-50', color: 'text-emerald-500'},
  parcel:   { icon: Bell,        bg: 'bg-violet-50',  color: 'text-violet-500' },
};

const SkeletonCard = () => (
  <div className="animate-pulse rounded-[20px] bg-white/70 border border-white/80 p-4 flex items-start gap-3">
    <div className="w-10 h-10 rounded-[12px] bg-slate-200 shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-slate-200 rounded-full w-2/3" />
      <div className="h-2.5 bg-slate-100 rounded-full w-full" />
      <div className="h-2.5 bg-slate-100 rounded-full w-4/5" />
    </div>
  </div>
);

const Notifications = () => {
  const navigate = useNavigate();
  const [serverNotifications, setServerNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clearing, setClearing] = useState(false);

  const notifications = useMemo(() => {
    const merged = [...serverNotifications, ...getRealtimeNotifications()];

    return merged
      .filter((notification) => notification?.id)
      .sort((left, right) => {
        const leftTime = new Date(left.sentAt || 0).getTime();
        const rightTime = new Date(right.sentAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [serverNotifications]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await userAuthService.getNotifications();
      setServerNotifications(response?.data?.results || []);
    } catch (err) {
      setError(err?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  useEffect(() => {
    const handleRealtimeNotificationsUpdated = () => {
      setServerNotifications((current) => [...current]);
    };

    window.addEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, handleRealtimeNotificationsUpdated);

    return () => {
      window.removeEventListener(USER_NOTIFICATIONS_UPDATED_EVENT, handleRealtimeNotificationsUpdated);
    };
  }, []);

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm('Are you sure you want to clear all notifications?')) return;

    setClearing(true);
    try {
      await userAuthService.clearAllNotifications();
      clearRealtimeNotifications();
      setServerNotifications([]);
      toast.success('All notifications cleared', {
        icon: <CheckCircle2 size={18} className="text-emerald-500" />,
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-emerald-50 bg-white',
      });
    } catch (err) {
      toast.error(err?.message || 'Failed to clear notifications');
    } finally {
      setClearing(false);
    }
  };

  const handleRemoveSingle = async (id) => {
    if (isRealtimeNotification(id)) {
      removeRealtimeNotification(id);
      toast.success('Notification removed', {
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-slate-50 bg-white',
      });
      return;
    }

    try {
      await userAuthService.deleteNotification(id);
      setServerNotifications((prev) => prev.filter((notification) => notification.id !== id));
      toast.success('Notification removed', {
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-slate-50 bg-white',
      });
    } catch (err) {
      toast.error('Failed to remove notification');
    }
  };

  const totalCount = useMemo(() => notifications.length, [notifications.length]);

  const { theme } = useUserTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen max-w-lg mx-auto font-sans pb-28 relative overflow-hidden transition-colors duration-300 ${isDark ? 'bg-slate-950 text-white' : 'bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] text-slate-900'}`}>
      <div className={`absolute -top-16 right-[-40px] h-44 w-44 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-purple-100/60'}`} />
      <div className={`absolute top-52 left-[-60px] h-52 w-52 rounded-full blur-3xl pointer-events-none ${isDark ? 'bg-yellow-500/5' : 'bg-blue-100/40'}`} />

      {/* Header */}
      <header className={`backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b transition-colors duration-300 ${isDark ? 'bg-slate-900/90 border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' : 'bg-white/90 border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]'}`}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/taxi/user/profile')} className={`w-9 h-9 rounded-[12px] border flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-white/80 bg-white/90 text-slate-900'}`}>
            <ArrowLeft size={18} className={isDark ? 'text-white' : 'text-slate-900'} strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Inbox</p>
            <h1 className={`text-[19px] font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Notifications</h1>
          </div>
          <div className={`text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm ${isDark ? 'bg-yellow-400 text-slate-950' : 'bg-slate-900 text-white'}`}>
            {totalCount}
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">Admin & System Alerts</p>
          <div className="flex items-center gap-4">
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing || loading}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-500 active:scale-95 transition-all disabled:opacity-50"
              >
                <Trash2 size={12} strokeWidth={2.5} />
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={fetchNotifications}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 transition-all"
            >
              <RefreshCw size={12} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <AlertCircle size={28} className="text-red-400" strokeWidth={2} />
            </div>
            <p className="text-[14px] font-black text-slate-700">{error}</p>
            <button onClick={fetchNotifications}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all">
              <RefreshCw size={13} strokeWidth={2.5} /> Retry
            </button>
          </div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <Bell size={36} className="text-slate-300" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[16px] font-black text-slate-700">You're all caught up</p>
              <p className="text-[12px] font-bold text-slate-400 mt-1">No new notifications right now</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {!loading && !error && notifications.map((n) => {
            return (
              <motion.div key={n.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="relative rounded-[20px] border border-white/80 bg-white p-4 flex items-start gap-3 transition-all shadow-[0_4px_14px_rgba(15,23,42,0.07)]">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 bg-blue-50">
                  <Megaphone size={16} className="text-blue-500" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] leading-tight font-black text-slate-900">{n.title || 'Notification'}</p>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                        {formatNotificationTime(n.sentAt)}
                      </span>
                      <button
                        onClick={() => handleRemoveSingle(n.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">{n.body || 'No message'}</p>
                  
                  {n.image && (
                    <div className="mt-3 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                      <img 
                        src={n.image} 
                        alt="Notification content" 
                        className="w-full h-auto max-h-[180px] object-cover"
                      />
                    </div>
                  )}

                  {n.serviceLocationName && (
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-2">
                      {n.serviceLocationName}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Notifications;
