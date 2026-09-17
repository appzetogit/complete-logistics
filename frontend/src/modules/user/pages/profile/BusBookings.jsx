import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  BusFront, 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  MoveRight, 
  SlidersHorizontal, 
  Star, 
  Ticket,
  MapPin,
  Clock,
  ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import userBusService from '../../services/busService';

const PAGE_SIZE = 8;
const FILTERS = [
  { id: 'all', label: 'All', status: '', tripState: '' },
  { id: 'upcoming', label: 'Upcoming', status: '', tripState: 'upcoming' },
  { id: 'completed', label: 'Completed', status: '', tripState: 'completed' },
  { id: 'cancelled', label: 'Cancelled', status: 'cancelled', tripState: 'cancelled' },
];

const statusTone = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  pending: 'bg-amber-50 text-amber-700 border-amber-100',
  failed: 'bg-rose-50 text-rose-700 border-rose-100',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatDateTime = (value) => {
  if (!value) return 'NA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'NA';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const BusBookings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => (location.pathname.startsWith('/taxi/user') ? '/taxi/user' : ''), [location.pathname]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('all');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [ratingLoadingId, setRatingLoadingId] = useState('');
  const selectedFilter = FILTERS.find((item) => item.id === activeFilter) || FILTERS[0];

  useEffect(() => {
    setPage(1);
  }, [activeFilter]);

  useEffect(() => {
    let active = true;

    const loadBookings = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getMyBookings({
          page,
          limit: PAGE_SIZE,
          status: selectedFilter.status,
          tripState: selectedFilter.tripState,
        });
        if (!active) return;
        const payload = response?.data || {};
        setBookings(Array.isArray(payload.results) ? payload.results : []);
        setPagination(payload.pagination || {
          page,
          limit: PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: page > 1,
        });
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load bus bookings');
        setBookings([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBookings();
    return () => {
      active = false;
    };
  }, [page, selectedFilter.status, selectedFilter.tripState]);

  const handleInlineRating = async (event, bookingId, rating) => {
    event.preventDefault();
    event.stopPropagation();
    if (!bookingId || !rating || ratingLoadingId === bookingId) return;

    try {
      setRatingLoadingId(bookingId);
      const response = await userBusService.submitBookingReview(bookingId, { rating, comment: '' });
      const updatedBooking = response?.data?.data || response?.data || response || null;

      setBookings((current) => current.map((item) => (
        item.id === bookingId && updatedBooking ? updatedBooking : item
      )));
      toast.success(response?.data?.message || response?.message || 'Bus rating saved');
    } catch (err) {
      toast.error(err?.message || 'Unable to save bus rating');
    } finally {
      setRatingLoadingId('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-32">
      {/* Header */}
      <div className="bg-white px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`${routePrefix || '/taxi/user'}`)}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Bus Bookings</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your travel history</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-6 space-y-4">
        {/* Compact Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                activeFilter === filter.id
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md shadow-slate-200'
                  : 'bg-white text-slate-500 border-slate-100 hover:border-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* List Content */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
              <Loader2 size={24} className="mx-auto animate-spin text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-900">Loading trips...</p>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-center">
              <p className="text-xs font-bold text-rose-600">{error}</p>
            </div>
          ) : null}

          {!loading && !error && bookings.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <BusFront size={32} className="text-slate-300" />
              </div>
              <h3 className="text-md font-bold text-slate-900">No bookings yet</h3>
              <p className="text-xs text-slate-500 mt-1">Book your next journey now!</p>
              <button 
                onClick={() => navigate(`${routePrefix}/bus`)}
                className="mt-4 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Book Now
              </button>
            </div>
          ) : null}

          <AnimatePresence mode="popLayout">
            {!loading && !error && bookings.map((booking, index) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => navigate(`${routePrefix}/profile/bus-bookings/${booking.id}`)}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
              >
                {/* Header Row: PNR & Status */}
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PNR</p>
                    <p className="text-[11px] font-black tracking-widest text-slate-900">{booking.bookingCode}</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusTone[booking.status] || 'bg-white text-slate-400 border-slate-200'}`}>
                    {booking.status}
                  </div>
                </div>

                <div className="p-4">
                  {/* Route & Times */}
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900 truncate">{booking.bus?.fromCity || 'From'}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">{booking.bus?.departure || '--:--'}</p>
                    </div>
                    <div className="flex flex-col items-center px-1">
                      <div className="w-12 h-[1px] bg-slate-100 relative">
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-slate-200 rounded-full" />
                      </div>
                      <BusFront size={12} className="text-slate-300 mt-1" />
                    </div>
                    <div className="flex-1 text-right">
                      <p className="text-sm font-black text-slate-900 truncate">{booking.bus?.toCity || 'To'}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">{booking.bus?.arrival || '--:--'}</p>
                    </div>
                  </div>

                  {/* Trip Details Bar */}
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-900">{booking.travelDate || 'NA'}</p>
                    </div>
                    <div className="w-[1px] h-3 bg-slate-200" />
                    <div className="flex items-center gap-1.5">
                      <Ticket size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-900">{(booking.activeSeatLabels || []).join(', ') || 'NA'}</p>
                    </div>
                    <div className="w-[1px] h-3 bg-slate-200" />
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-black text-slate-900">{formatMoney(booking.amount, booking.currency)}</p>
                    </div>
                  </div>

                  {/* Rating or Footer Row */}
                  {booking.review?.tripCompleted ? (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((score) => {
                          const activeScore = Number(booking.review?.userRating || 0);
                          const filled = score <= activeScore;
                          return (
                            <button
                              key={`${booking.id}-rating-${score}`}
                              type="button"
                              onClick={(event) => handleInlineRating(event, booking.id, score)}
                              className="p-0.5"
                            >
                              <Star
                                size={14}
                                className={filled ? 'text-amber-500' : 'text-slate-200'}
                                fill={filled ? 'currentColor' : 'transparent'}
                              />
                            </button>
                          );
                        })}
                        <span className="ml-1 text-[9px] font-bold text-slate-400 uppercase">
                          {booking.review?.userRating ? 'Rated' : 'Rate trip'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-900 uppercase">
                        Details <MoveRight size={10} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Booked {formatDateTime(booking.createdAt)}</p>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-900 uppercase">
                        Details <MoveRight size={10} />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {!loading && !error && pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between py-2 px-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <button
              type="button"
              disabled={!pagination.hasPrevPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="p-2 rounded-lg bg-slate-50 text-slate-900 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-[10px] font-black text-slate-900 uppercase">
              Page {pagination.page} / {pagination.totalPages}
            </p>
            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              className="p-2 rounded-lg bg-slate-50 text-slate-900 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BusBookings;
