import React, { useEffect, useMemo, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  IndianRupee,
  Loader2,
  MapPin,
  Package,
  TrendingUp,
  User,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { getDriverRideHistory } from '../services/registrationService';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'ride', label: 'Rides' },
  { id: 'parcel', label: 'Deliveries' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All statuses' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'active', label: 'Active / Pending' },
];

const unwrap = (response) => response?.data?.results || response?.results || response?.data?.data?.results || [];

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const formatDateLabel = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatShortDate = (value) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatStatus = (status) => {
  const normalized = String(status || 'searching').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getRideTimeSource = (ride) => ride.completedAt || ride.startedAt || ride.acceptedAt || ride.createdAt || ride.updatedAt;

const buildLocationLabel = (address, point, fallback) => {
  if (address) {
    return address;
  }

  const [lng, lat] = point?.coordinates || [];
  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }

  return fallback;
};

const getDriverEarnings = (ride) => {
  const storedEarnings = Number(ride?.driverEarnings);
  if (Number.isFinite(storedEarnings) && storedEarnings > 0) {
    return storedEarnings;
  }

  const fare = Number(ride?.fare || 0);
  const commission = Number(ride?.commissionAmount || 0);
  if (commission > 0) {
    return Math.max(fare - commission, 0);
  }

  return fare;
};

const normalizePaymentLabel = (ride = {}) => {
  const rawValue = ride?.paymentMethod
    || ride?.payment_method
    || ride?.paymentType
    || ride?.payment_type
    || '';
  const normalized = String(rawValue || '').trim().toLowerCase();

  if (!normalized) {
    const collectionStatus = String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase();
    const providerMode = String(ride?.driverPaymentCollection?.providerMode || '').trim().toLowerCase();

    if (
      ['paid', 'captured', 'completed'].includes(collectionStatus)
      && (providerMode.includes('upi') || providerMode.includes('card') || providerMode.includes('qr') || providerMode.includes('online'))
    ) {
      return 'ONLINE';
    }

    return 'CASH';
  }

  if (normalized.includes('online') || normalized.includes('upi') || normalized.includes('card') || normalized.includes('qr')) {
    return 'ONLINE';
  }

  if (normalized === 'cash') {
    return 'CASH';
  }

  return normalized.toUpperCase();
};

const normalizeRide = (ride) => {
  const type = String(ride?.serviceType || ride?.type || 'ride').toLowerCase() === 'parcel' ? 'parcel' : 'ride';
  const status = formatStatus(ride?.status || ride?.liveStatus);
  const timeSource = getRideTimeSource(ride);
  const passengerName = ride?.user?.name || 'Passenger';
  const earnings = getDriverEarnings(ride);

  return {
    id: ride?.rideId || ride?._id || '',
    type,
    title: type === 'parcel' ? 'Delivery job' : 'Ride trip',
    subtitle: type === 'parcel' ? `Customer: ${passengerName}` : `Rider: ${passengerName}`,
    dateLabel: formatDateLabel(timeSource),
    shortDate: formatShortDate(timeSource),
    earnings,
    earningsLabel: formatCurrency(earnings),
    fareLabel: formatCurrency(ride?.fare || 0),
    pickup: buildLocationLabel(ride?.pickupAddress, ride?.pickupLocation, 'Pickup'),
    drop: buildLocationLabel(ride?.dropAddress, ride?.dropLocation, 'Drop'),
    status,
    paymentMethod: normalizePaymentLabel(ride),
    distanceKm: Number(ride?.estimatedDistanceMeters || 0) / 1000,
  };
};

const statusBadgeClass = (status) => {
  if (status === 'Completed' || status === 'Delivered') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }

  if (status === 'Cancelled') {
    return 'bg-rose-50 text-rose-700 border-rose-100';
  }

  return 'bg-amber-50 text-amber-700 border-amber-100';
};

const RideRequests = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await getDriverRideHistory({ limit: 100 });
        const results = unwrap(response);

        if (!active) {
          return;
        }

        setRides(results.map(normalizeRide).filter((ride) => ride.id));
      } catch (loadError) {
        if (!active) {
          return;
        }

        setRides([]);
        setError(loadError?.message || 'Could not load driver history.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  const filteredHistory = useMemo(
    () => {
      const byType = activeTab === 'all' ? rides : rides.filter((item) => item.type === activeTab);

      if (statusFilter === 'completed') {
        return byType.filter((item) => ['Completed', 'Delivered'].includes(item.status));
      }

      if (statusFilter === 'cancelled') {
        return byType.filter((item) => item.status === 'Cancelled');
      }

      if (statusFilter === 'active') {
        return byType.filter((item) => !['Completed', 'Delivered', 'Cancelled'].includes(item.status));
      }

      return byType;
    },
    [activeTab, rides, statusFilter],
  );

  const categoryHistory = useMemo(
    () => (activeTab === 'all' ? rides : rides.filter((item) => item.type === activeTab)),
    [activeTab, rides],
  );

  const stats = useMemo(() => {
    const completedTrips = categoryHistory.filter((item) => ['Completed', 'Delivered'].includes(item.status));
    const totalEarnings = completedTrips.reduce((sum, item) => sum + item.earnings, 0);
    const completionRate = categoryHistory.length ? Math.round((completedTrips.length / categoryHistory.length) * 100) : 0;

    return {
      totalEarnings: formatCurrency(totalEarnings),
      completionRate: `${completionRate}%`,
      totalTrips: categoryHistory.length,
    };
  }, [categoryHistory]);

  return (
    <div className="min-h-screen bg-[#f8f9fb] font-sans select-none overflow-x-hidden p-5 pb-32">
      <header className="flex items-center justify-between mb-6 pt-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.22em]">Driver log</p>
          <h1 className="text-lg font-black text-slate-900 tracking-tight uppercase">History</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsFilterOpen((value) => !value)}
          className={`w-10 h-10 bg-white rounded-xl shadow-sm border flex items-center justify-center transition-all ${isFilterOpen || statusFilter !== 'all' ? 'border-slate-900 text-slate-900' : 'border-slate-100 text-slate-400'}`}
        >
          <Filter size={16} />
        </button>
      </header>

      {isFilterOpen ? (
        <div className="mb-5 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Filter history</p>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  setStatusFilter(filter.id);
                  setIsFilterOpen(false);
                }}
                className={`rounded-xl px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === filter.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Completion Rate</p>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500">
              <TrendingUp size={14} />
            </div>
            <h3 className="text-xl font-black text-slate-900 leading-none">{stats.completionRate}</h3>
          </div>
        </div>
        <div className="bg-slate-900 p-4 rounded-2xl shadow-xl space-y-1">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Total Earned</p>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center text-white">
              <IndianRupee size={12} />
            </div>
            <h3 className="text-xl font-black text-white leading-none">{stats.totalEarnings}</h3>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.22em]">Trips on record</p>
        <p className="mt-1 text-2xl font-black text-slate-900">{stats.totalTrips}</p>
      </div>

      <div className="space-y-3">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-4">Activity Log</h4>

        {loading ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-50 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={22} className="animate-spin text-slate-500" />
            <p className="text-[13px] font-black text-slate-600">Loading trip history</p>
          </div>
        ) : error ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-50 flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle size={22} className="text-rose-500" />
            <p className="text-[13px] font-black text-slate-700">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest"
            >
              Retry
            </button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-50 flex flex-col items-center justify-center gap-3 text-center">
            <Clock size={22} className="text-slate-300" />
            <p className="text-[13px] font-black text-slate-600">No trips found in this filter</p>
          </div>
        ) : (
          filteredHistory.map((item) => (
            <Motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.type === 'parcel' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-900'}`}>
                    {item.type === 'parcel' ? <Package size={18} strokeWidth={2.5} /> : <Bike size={18} strokeWidth={2.5} />}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-[14px] font-black text-slate-900 uppercase tracking-tight leading-none">{item.title}</h4>
                    <p className="text-[10px] font-bold text-slate-500">{item.subtitle}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.dateLabel}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-black text-slate-900 leading-none">{item.earningsLabel}</p>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${statusBadgeClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-slate-400 font-black uppercase tracking-widest">Trip Date</p>
                  <div className="mt-1 flex items-center gap-1.5 text-slate-700 font-black">
                    <Calendar size={12} />
                    <span>{item.shortDate}</span>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                  <p className="text-slate-400 font-black uppercase tracking-widest">Payment</p>
                  <div className="mt-1 flex items-center gap-1.5 text-slate-700 font-black">
                    <IndianRupee size={12} />
                    <span>{item.paymentMethod}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 px-px">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full border-2 border-slate-900 bg-white mt-1 translate-y-[1px]" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pickup</p>
                    <p className="text-[12px] font-black text-slate-600 leading-tight break-words">{item.pickup}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full border-2 border-rose-500 bg-white mt-1 translate-y-[1px]" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Drop</p>
                    <p className="text-[12px] font-black text-slate-600 leading-tight break-words">{item.drop}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <User size={12} />
                  <span>{item.subtitle}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1"><MapPin size={12} /> {item.distanceKm.toFixed(1)} km</span>
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} /> {item.fareLabel}</span>
                </div>
              </div>
            </Motion.div>
          ))
        )}
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default RideRequests;
