import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  BusFront, 
  CircleAlert, 
  Loader2, 
  Phone, 
  ReceiptText, 
  Route, 
  ShieldAlert, 
  Star, 
  Ticket,
  MapPin,
  Clock,
  CalendarDays,
  ChevronDown,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import userBusService from '../../services/busService';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const formatMoney = (amount, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

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

const formatDurationCompact = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Direct';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?/gi, 'h')
    .replace(/hrs?/gi, 'h')
    .replace(/minutes?/gi, 'm')
    .replace(/mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

const unwrapPayload = (response) => response?.data?.data || response?.data || response || null;

const computeSelectionQuote = (booking, selectedSeatIds) => {
  const seatCount = Number(booking?.seatSummary?.total || 0);
  const selectedCount = selectedSeatIds.length;
  const perSeatAmount = Number(booking?.perSeatAmount || 0);
  const subtotal = Math.round(perSeatAmount * selectedCount * 100) / 100;
  const rule = booking?.cancellation || {};
  let refundAmount = 0;

  if (selectedCount <= 0 || !rule.allowed) {
    return {
      subtotal: 0,
      refundAmount: 0,
      chargeAmount: 0,
    };
  }

  if (rule.refundType === 'percentage') {
    refundAmount = Math.round(subtotal * Math.min(100, Number(rule.refundValue || 0)) / 100 * 100) / 100;
  } else if (rule.refundType === 'fixed') {
    refundAmount = Math.min(subtotal, Math.round(Number(rule.refundValue || 0) * 100) / 100);
  }

  if (seatCount <= 0) {
    refundAmount = 0;
  }

  return {
    subtotal,
    refundAmount,
    chargeAmount: Math.max(0, Math.round((subtotal - refundAmount) * 100) / 100),
  };
};

const BusBookingDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [cancelling, setCancelling] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    let active = true;

    const loadBooking = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await userBusService.getBookingById(id);
        if (!active) return;
        const nextBooking = unwrapPayload(response);
        setBooking(nextBooking);
        setSelectedSeatIds(Array.isArray(nextBooking?.activeSeatIds) ? nextBooking.activeSeatIds : []);
        setSelectedRating(Number(nextBooking?.review?.userRating || 0));
        setReviewComment(nextBooking?.review?.userComment || '');
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load booking details');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadBooking();
    return () => {
      active = false;
    };
  }, [id]);

  const activeSeatIds = Array.isArray(booking?.activeSeatIds) ? booking.activeSeatIds : [];
  const activeSeatLabels = Array.isArray(booking?.activeSeatLabels) ? booking.activeSeatLabels : [];
  const canCancel = Boolean(booking?.cancellation?.allowed) && booking?.status === 'confirmed' && activeSeatIds.length > 0;
  const selectionQuote = computeSelectionQuote(booking, selectedSeatIds);
  const canRate = Boolean(booking?.review?.canRate);

  const toggleSeat = (seatId) => {
    setSelectedSeatIds((current) => (
      current.includes(seatId)
        ? current.filter((item) => item !== seatId)
        : [...current, seatId]
    ));
  };

  const handleCancelSeats = async () => {
    if (!booking || cancelling || selectedSeatIds.length === 0) return;

    try {
      setCancelling(true);
      const response = await userBusService.cancelBooking(booking.id, {
        seatIds: selectedSeatIds,
        travelDate: booking.travelDate,
      });
      const updatedBooking = unwrapPayload(response);
      setBooking(updatedBooking);
      setSelectedSeatIds(Array.isArray(updatedBooking?.activeSeatIds) ? updatedBooking.activeSeatIds : []);
      toast.success(response?.data?.message || response?.message || 'Selected seats cancelled successfully');
    } catch (err) {
      toast.error(err?.message || 'Unable to cancel selected seats');
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!booking || !canRate || savingReview) return;
    if (!selectedRating) {
      toast.error('Please select a rating');
      return;
    }

    try {
      setSavingReview(true);
      const response = await userBusService.submitBookingReview(booking.id, {
        rating: selectedRating,
        comment: reviewComment,
      });
      const updatedBooking = unwrapPayload(response);
      setBooking(updatedBooking);
      setSelectedRating(Number(updatedBooking?.review?.userRating || 0));
      setReviewComment(updatedBooking?.review?.userComment || '');
      toast.success(response?.data?.message || response?.message || 'Bus rating saved');
    } catch (err) {
      toast.error(err?.message || 'Unable to save bus rating');
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-32">
      {/* Header */}
      <div className="bg-white px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(`${routePrefix}/profile/bus-bookings`)}
            className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Ticket Details</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Booking ID: {booking?.bookingCode || '...'}</p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        {loading ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
            <Loader2 size={28} className="mx-auto animate-spin text-slate-400 mb-3" />
            <p className="text-sm font-bold text-slate-900">Loading details...</p>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-rose-600">{error}</p>
          </div>
        ) : null}

        {(!loading && !error && booking) ? (
          <div className="space-y-6">
            {/* Ticket Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">PNR Number</p>
                  <p className="text-sm font-black tracking-widest">{booking.bookingCode}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Status</p>
                  <div className="px-3 py-1 rounded-full bg-white/10 text-white border border-white/20 text-[10px] font-black uppercase tracking-wider">
                    {booking.status}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Route Header */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xl font-black text-slate-900 truncate">{booking.bus?.fromCity || 'From'}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase mt-0.5">{booking.bus?.departure || '--:--'}</p>
                  </div>
                  <div className="flex flex-col items-center flex-1 px-2">
                    <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                      {formatDurationCompact(booking.bus?.duration)}
                    </span>
                    <div className="w-full h-[1px] border-t border-dashed border-slate-200 my-3" />
                    <BusFront size={18} className="text-slate-300" />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-xl font-black text-slate-900 truncate">{booking.bus?.toCity || 'To'}</p>
                    <p className="text-xs font-bold text-slate-400 uppercase mt-0.5">{booking.bus?.arrival || '--:--'}</p>
                  </div>
                </div>

                {/* Operator Info */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bus & Operator</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-black">
                      {String(booking.bus?.operator || 'B').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{booking.bus?.operator || 'Bus Service'}</p>
                      <p className="text-[11px] text-slate-500">{booking.bus?.type || 'Standard Service'}</p>
                    </div>
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <CalendarDays size={14} />
                      <p className="text-[9px] font-bold uppercase tracking-widest">Travel Date</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">{booking.travelDate || 'NA'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Ticket size={14} />
                      <p className="text-[9px] font-bold uppercase tracking-widest">Seat Count</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">{activeSeatIds.length} Seats</p>
                  </div>
                </div>

                {/* More Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <BusFront size={14} />
                      <p className="text-[9px] font-bold uppercase tracking-widest">Bus Number</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">{booking.bus?.registrationNumber || 'Pending'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Phone size={14} />
                      <p className="text-[9px] font-bold uppercase tracking-widest">Contact</p>
                    </div>
                    <p className="text-sm font-black text-slate-900">{booking.bus?.driverPhone || 'Assigned soon'}</p>
                  </div>
                </div>

                {/* Locations */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-4">
                    <Route size={14} />
                    <p className="text-[9px] font-bold uppercase tracking-widest">Route Points</p>
                  </div>
                  <div className="space-y-4">
                    <div className="relative pl-6">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-emerald-500" />
                      <div className="absolute left-[3px] top-4 w-0.5 h-6 bg-slate-200" />
                      <p className="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Pickup</p>
                      <p className="text-sm font-black text-slate-900">{booking.bus?.pickupLocation || booking.bus?.fromCity}</p>
                    </div>
                    <div className="relative pl-6">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-rose-500" />
                      <p className="text-[9px] font-bold text-rose-600 uppercase mb-0.5">Dropoff</p>
                      <p className="text-sm font-black text-slate-900">{booking.bus?.dropLocation || booking.bus?.toCity}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Seat Summary & Cancellation Section */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <Ticket size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-900">Manage Seats</h2>
              </div>

              <div className="space-y-3">
                {activeSeatIds.map((seatId, index) => (
                  <label
                    key={seatId}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                      selectedSeatIds.includes(seatId) 
                        ? 'bg-slate-900 border-slate-900 text-white' 
                        : 'bg-slate-50 border-slate-100 text-slate-900 hover:border-slate-200'
                    } ${!canCancel ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <p className="text-sm font-black">{activeSeatLabels[index] || seatId}</p>
                      <p className={`text-[10px] font-bold ${selectedSeatIds.includes(seatId) ? 'text-slate-400' : 'text-slate-500'}`}>
                        Active Seat • {formatMoney(booking.perSeatAmount, booking.currency)}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={selectedSeatIds.includes(seatId)}
                      disabled={!canCancel}
                      onChange={() => toggleSeat(seatId)}
                    />
                    {canCancel && (
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                        selectedSeatIds.includes(seatId) ? 'bg-white border-white text-slate-900' : 'bg-white border-slate-200'
                      }`}>
                        {selectedSeatIds.includes(seatId) && <div className="w-2.5 h-2.5 bg-slate-900 rounded-sm" />}
                      </div>
                    )}
                  </label>
                ))}

                {Array.isArray(booking.cancelledSeats) && booking.cancelledSeats.length > 0 && (
                  <div className="pt-4 space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cancelled Seats</p>
                    {booking.cancelledSeats.map((seat) => (
                      <div key={seat.seatId} className="p-4 rounded-2xl border border-slate-50 bg-slate-50/50 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-black text-slate-400">{seat.seatLabel || seat.seatId}</p>
                          <p className="text-[10px] text-slate-400">Cancelled {formatDateTime(seat.cancelledAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-400">{formatMoney(seat.refundAmount, booking.currency)}</p>
                          <p className="text-[9px] font-bold uppercase text-slate-400">Refunded</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Refund Preview */}
              {selectedSeatIds.length > 0 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-100"
                >
                  <div className="flex items-center gap-2 mb-4 text-slate-900 font-black text-xs uppercase tracking-wider">
                    <ReceiptText size={14} />
                    Refund Preview
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Total</p>
                      <p className="text-sm font-black text-slate-900">{formatMoney(selectionQuote.subtotal, booking.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Refund</p>
                      <p className="text-sm font-black text-emerald-600">{formatMoney(selectionQuote.refundAmount, booking.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-rose-600 uppercase mb-1">Fee</p>
                      <p className="text-sm font-black text-rose-600">{formatMoney(selectionQuote.chargeAmount, booking.currency)}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleCancelSeats}
                    disabled={cancelling}
                    className="w-full mt-5 py-4 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-rose-100 active:scale-[0.98] transition-transform"
                  >
                    {cancelling ? 'Processing...' : `Confirm Cancellation`}
                  </button>
                </motion.div>
              )}
            </div>

            {/* Rating Section */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Star size={20} className="text-slate-900" />
                  <h2 className="text-lg font-black text-slate-900">Your Review</h2>
                </div>
                {booking.review?.averageRating && (
                  <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-full text-amber-600">
                    <Star size={12} fill="currentColor" />
                    <span className="text-xs font-black">{Number(booking.review.averageRating).toFixed(1)}</span>
                  </div>
                )}
              </div>

              {canRate ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setSelectedRating(score)}
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                          score <= selectedRating ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-200'
                        }`}
                      >
                        <Star size={24} fill={score <= selectedRating ? 'currentColor' : 'transparent'} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Tell us about your trip experience..."
                    className="w-full min-h-[120px] bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-200 transition-colors"
                  />
                  <button
                    onClick={handleSubmitReview}
                    disabled={savingReview || !selectedRating}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-slate-100 active:scale-[0.98] transition-transform"
                  >
                    {savingReview ? 'Saving...' : 'Submit Review'}
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-100">
                  <Info size={24} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-black text-slate-500">
                    {booking.review?.tripCompleted 
                      ? 'Review window is closed'
                      : 'You can rate this trip after completion'}
                  </p>
                </div>
              )}
            </div>

            {/* Policy */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert size={20} className="text-slate-900" />
                <h2 className="text-lg font-black text-slate-900">Policies</h2>
              </div>
              <div className="space-y-4">
                {(booking.cancellationPolicy?.rules || []).map((rule) => (
                  <div key={rule.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-sm font-black text-slate-900">{rule.label}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock size={12} className="text-slate-400" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {rule.hoursBeforeDeparture}h Before Departure
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <ReceiptText size={12} className="text-slate-400" />
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                        {rule.refundType === 'percentage' ? `${rule.refundValue}% Refund` : `${formatMoney(rule.refundValue, booking.currency)} Refund`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BusBookingDetail;
