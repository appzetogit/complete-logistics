import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  AlertCircle,
  RefreshCw,
  Radio,
  Trash2,
  CheckCircle2,
  CalendarClock,
  ChevronRight,
  Clock3,
  MapPin,
} from 'lucide-react';
import { getDriverNotifications, getDriverScheduledRides } from '../../services/registrationService';
import {
  getVisibleDriverNotifications,
  getMergedDriverNotifications,
  hideAllDriverNotifications,
  hideDriverNotification,
  markDriverNotificationsAsRead,
} from '../../utils/notificationState';
import IncomingRideRequest from '../IncomingRideRequest';
import toast from 'react-hot-toast';
import { getScheduledRideCountdown } from '../../utils/scheduledRideTime';

const formatNotificationTime = (value) => {
  if (!value) {
    return 'Recently';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatScheduledDateTime = (value) => {
  if (!value) {
    return 'Schedule time not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Schedule time not available';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDistanceLabel = (meters) => {
  const value = Number(meters || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Nearby';
  }

  if (value < 1000) {
    return `${Math.round(value)} m`;
  }

  return `${(value / 1000).toFixed(1)} km`;
};

const formatFareLabel = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Rs 0';
  }

  return `Rs ${amount}`;
};

const createScheduledRidePreview = (ride) => ({
  rideId: ride.rideId,
  type: ride.type || ride.serviceType || 'ride',
  fare: formatFareLabel(ride.fare || ride.baseFare),
  distance: formatDistanceLabel(ride.estimatedDistanceMeters),
  payment: ride.paymentMethod || 'cash',
  pickup: ride.pickupAddress || 'Pickup point',
  drop: ride.dropAddress || 'Drop point',
  scheduledAt: ride.scheduledAt || null,
  customer: {
    name: ride.user?.name || 'Customer',
    phone: ride.user?.phone || '',
  },
  raw: {
    fare: ride.fare,
    baseFare: ride.baseFare,
    bookingMode: ride.bookingMode || 'normal',
    parcel: ride.parcel || null,
    intercity: ride.intercity || null,
    user: ride.user || null,
    pickupAddress: ride.pickupAddress || '',
    dropAddress: ride.dropAddress || '',
    scheduledAt: ride.scheduledAt || null,
    ride,
  },
});

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

const DriverNotifications = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';
  const [activeTab, setActiveTab] = useState('alerts');
  const [alertItems, setAlertItems] = useState([]);
  const [scheduledRides, setScheduledRides] = useState([]);
  const [selectedScheduledRide, setSelectedScheduledRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduledError, setScheduledError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());

  const [alertsPage, setAlertsPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);
  const [hasMoreAlerts, setHasMoreAlerts] = useState(false);
  const [hasMoreSchedule, setHasMoreSchedule] = useState(false);
  const pageSize = 10;

  const handleClearAll = async () => {
    if (alertItems.length === 0) return;

    setClearing(true);
    try {
      hideAllDriverNotifications(alertItems.map((notification) => notification.id || notification._id));
      setAlertItems([]);
      toast.success('All notifications cleared', {
        icon: <CheckCircle2 size={18} className="text-emerald-500" />,
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-emerald-50 bg-white',
      });
    } catch {
      toast.error('Failed to clear notifications');
    } finally {
      setClearing(false);
    }
  };

  const handleRemoveSingle = async (id) => {
    try {
      hideDriverNotification(id);
      setAlertItems((prev) => prev.filter((notification) => String(notification.id || notification._id) !== String(id)));
      toast.success('Notification removed', {
        className: 'font-bold text-[13px] rounded-2xl shadow-xl border border-slate-50 bg-white',
      });
    } catch {
      toast.error('Failed to remove notification');
    }
  };

  const loadAllData = async (targetPage = 1, isLoadMore = false) => {
    if (activeTab === 'alerts') setLoading(true);
    else setScheduledLoading(true);
    
    setError('');
    setScheduledError('');

    try {
      if (activeTab === 'alerts') {
        const res = await getDriverNotifications({ page: targetPage, limit: pageSize });
        const results = res?.data?.results || [];
        const total = res?.data?.totalCount || results.length;
        
        const visibleNotifications = getVisibleDriverNotifications(results);
        setAlertItems(visibleNotifications);
        setHasMoreAlerts(targetPage * pageSize < total);
        setAlertsPage(targetPage);
        
        if (results.length > 0) {
          markDriverNotificationsAsRead(getMergedDriverNotifications(results).map((n) => n.id || n._id));
        }
      } else {
        const res = await getDriverScheduledRides({ page: targetPage, limit: pageSize });
        const results = res?.data?.results || [];
        const total = res?.data?.totalCount || results.length;
        
        const nextScheduledRides = results
          .filter((ride) => ride?.scheduledAt)
          .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        
        setScheduledRides(nextScheduledRides);
        setHasMoreSchedule(targetPage * pageSize < total);
        setSchedulePage(targetPage);
      }
    } catch (err) {
      if (activeTab === 'alerts') setError(err?.message || 'Failed to load notifications');
      else setScheduledError(err?.message || 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    loadAllData(1);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'schedule' || scheduledRides.length === 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      setScheduleNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, scheduledRides.length]);

  const totalCount = useMemo(
    () => (activeTab === 'schedule' ? scheduledRides.length : alertItems.length),
    [activeTab, alertItems.length, scheduledRides.length],
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-12 relative overflow-hidden">
      <IncomingRideRequest
        visible={Boolean(selectedScheduledRide)}
        requestData={selectedScheduledRide}
        mode="preview"
        onClose={() => setSelectedScheduledRide(null)}
        onDecline={() => setSelectedScheduledRide(null)}
      />

      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-blue-100/60 blur-3xl pointer-events-none" />
      <div className="absolute top-52 left-[-60px] h-52 w-52 rounded-full bg-slate-100/70 blur-3xl pointer-events-none" />

      <header className="bg-white/90 backdrop-blur-md px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-white/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`${routePrefix}/${routePrefix === '/taxi/owner' ? 'dashboard' : 'home'}`)} className="w-9 h-9 rounded-[12px] border border-white/80 bg-white/90 flex items-center justify-center shadow-sm active:scale-95 transition-all">
            <ArrowLeft size={18} className="text-slate-900" strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-400">Inbox</p>
            <h1 className="text-[19px] font-black tracking-tight text-slate-900 leading-tight">Notifications</h1>
          </div>
          <div className="bg-slate-900 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm">
            {totalCount}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => loadAllData(activeTab === 'alerts' ? alertsPage : schedulePage)}
            disabled={loading || scheduledLoading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} strokeWidth={2.5} className={loading || scheduledLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {activeTab === 'alerts' ? (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing || loading || alertItems.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 active:scale-95 transition-all disabled:opacity-50"
            >
              <Trash2 size={12} strokeWidth={2.5} />
              Clear All
            </button>
          ) : null}
        </div>
      </header>

      <div className="px-5 pt-4 space-y-2.5">
        <div className="grid grid-cols-2 gap-2 rounded-[22px] border border-white/80 bg-white/70 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          {[
            { id: 'alerts', label: 'Alerts', count: alertItems.length },
            { id: 'schedule', label: 'Schedule', count: scheduledRides.length },
          ].map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-[18px] px-3 py-3 text-[11px] font-black uppercase tracking-[0.16em] transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]'
                    : 'text-slate-500'
                }`}
              >
                {tab.id === 'schedule' ? <CalendarClock size={14} strokeWidth={2.4} /> : <Radio size={14} strokeWidth={2.4} />}
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-[9px] ${isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-slate-400">
            {activeTab === 'schedule' ? 'Scheduled Rides' : 'Admin & System Alerts'}
          </p>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{totalCount} visible</p>
        </div>

        {activeTab === 'alerts' && loading && Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
        {activeTab === 'schedule' && scheduledLoading && Array.from({ length: 3 }).map((_, index) => <SkeletonCard key={index} />)}

        {activeTab === 'alerts' && error && !loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <AlertCircle size={28} className="text-red-400" strokeWidth={2} />
            </div>
            <p className="text-[14px] font-black text-slate-700">{error}</p>
            <button
              type="button"
              onClick={() => loadAllData(1)}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : null}

        {activeTab === 'schedule' && scheduledError && !scheduledLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <AlertCircle size={28} className="text-red-400" strokeWidth={2} />
            </div>
            <p className="text-[14px] font-black text-slate-700">{scheduledError}</p>
            <button
              type="button"
              onClick={() => loadAllData(1)}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full text-[12px] font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              <RefreshCw size={13} strokeWidth={2.5} />
              Retry
            </button>
          </div>
        ) : null}

        {activeTab === 'alerts' && !loading && !error && alertItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <Bell size={36} className="text-slate-300" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[16px] font-black text-slate-700">No notifications yet</p>
              <p className="text-[12px] font-bold text-slate-400 mt-1">Admin and payment notifications will appear here automatically</p>
            </div>
          </div>
        ) : null}

        {activeTab === 'schedule' && !scheduledLoading && !scheduledError && scheduledRides.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-20 h-20 bg-white/80 border border-white/80 rounded-3xl flex items-center justify-center">
              <CalendarClock size={34} className="text-slate-300" strokeWidth={1.7} />
            </div>
            <div>
              <p className="text-[16px] font-black text-slate-700">No scheduled rides yet</p>
              <p className="text-[12px] font-bold text-slate-400 mt-1">Scheduled bookings tied to this driver will show here with pickup, drop, rider info, and time.</p>
            </div>
          </div>
        ) : null}

        <AnimatePresence>
          {activeTab === 'alerts' && !loading && !error && alertItems.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative rounded-[20px] border border-white/80 bg-white p-4 flex items-start gap-3 transition-all shadow-[0_4px_14px_rgba(15,23,42,0.07)]"
            >
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 bg-emerald-50">
                <Radio size={16} className="text-emerald-500" strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] leading-tight font-black text-slate-900">{notification.title || 'Notification'}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                      {formatNotificationTime(notification.sentAt)}
                    </span>
                    <button
                      onClick={() => handleRemoveSingle(notification.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">{notification.body || 'No message'}</p>

                {notification.image ? (
                  <div className="mt-3 rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
                    <img
                      src={notification.image}
                      alt="Notification content"
                      className="w-full h-auto max-h-[180px] object-cover"
                    />
                  </div>
                ) : null}

                {notification.serviceLocationName ? (
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-2">
                    {notification.serviceLocationName}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ))}

          {activeTab === 'schedule' && !scheduledLoading && !scheduledError && scheduledRides.map((ride) => (
            <motion.button
              key={ride.rideId}
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => setSelectedScheduledRide(createScheduledRidePreview(ride))}
              className="relative w-full rounded-[20px] border border-white/80 bg-white p-4 text-left transition-all shadow-[0_4px_14px_rgba(15,23,42,0.07)] active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 bg-blue-50">
                  <CalendarClock size={16} className="text-blue-600" strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] leading-tight font-black text-slate-900">
                        {ride.type === 'parcel' ? 'Scheduled delivery' : ride.type === 'intercity' ? 'Scheduled intercity ride' : 'Scheduled ride'}
                      </p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-500">
                        {formatScheduledDateTime(ride.scheduledAt)}
                      </p>
                      <p className="mt-1 text-[11px] font-black text-emerald-600">
                        {getScheduledRideCountdown(ride.scheduledAt, scheduleNow)}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0 mt-0.5" strokeWidth={2.5} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Fare</p>
                      <p className="mt-1 text-[13px] font-black text-slate-900">{formatFareLabel(ride.fare || ride.baseFare)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Distance</p>
                      <p className="mt-1 text-[13px] font-black text-slate-900">{formatDistanceLabel(ride.estimatedDistanceMeters)}</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-start gap-2 text-slate-600">
                      <Clock3 size={13} className="mt-0.5 shrink-0 text-blue-500" strokeWidth={2.3} />
                      <p className="text-[11px] font-bold leading-relaxed">{ride.user?.name || 'Customer'}{ride.user?.phone ? ` • ${ride.user.phone}` : ''}</p>
                    </div>
                    <div className="flex items-start gap-2 text-slate-600">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-emerald-500" strokeWidth={2.3} />
                      <p className="text-[11px] font-bold leading-relaxed line-clamp-1">{ride.pickupAddress || 'Pickup point'}</p>
                    </div>
                    <div className="flex items-start gap-2 text-slate-600">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-orange-500" strokeWidth={2.3} />
                      <p className="text-[11px] font-bold leading-relaxed line-clamp-1">{ride.dropAddress || 'Drop point'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>

        {/* Pagination Controls */}
        {((activeTab === 'alerts' && alertItems.length > 0) || (activeTab === 'schedule' && scheduledRides.length > 0)) && (
          <div className="flex items-center justify-between py-6 px-1">
            <button
              type="button"
              disabled={(activeTab === 'alerts' ? alertsPage : schedulePage) === 1 || loading || scheduledLoading}
              onClick={() => loadAllData((activeTab === 'alerts' ? alertsPage : schedulePage) - 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-sm"
            >
              <ArrowLeft size={14} strokeWidth={2.5} /> Prev
            </button>
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
              Page {activeTab === 'alerts' ? alertsPage : schedulePage}
            </span>
            <button
              type="button"
              disabled={!(activeTab === 'alerts' ? hasMoreAlerts : hasMoreSchedule) || loading || scheduledLoading}
              onClick={() => loadAllData((activeTab === 'alerts' ? alertsPage : schedulePage) + 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-40 disabled:grayscale transition-all active:scale-95 shadow-sm"
            >
              Next <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverNotifications;
