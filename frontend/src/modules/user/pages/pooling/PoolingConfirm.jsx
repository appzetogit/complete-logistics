import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  Armchair,
  Car,
  CreditCard,
  Zap,
  Ticket,
  CalendarDays,
  MapPin,
  Receipt,
  CircleCheckBig,
  Navigation,
  Info,
  Clock,
  MapPinned,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userService } from '../../services/userService';
import toast from 'react-hot-toast';
import { schedulePoolingBookingReminders } from '../../utils/upcomingRideReminderService';

// Asset Imports
import taxiImg from '../../../../assets/3d images/AutoCab/taxi.png';

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const formatTravelDate = (value) => {
  if (!value) return 'Today';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};

const computePoolingFareBreakdown = (route, vehicle, selectedSeats = []) => {
  const safeSeatCount = Array.isArray(selectedSeats) ? selectedSeats.length : 0;
  const farePerSeat = Math.max(0, Number(route?.farePerSeat || 0));
  const baseFare = Math.round(farePerSeat * safeSeatCount * 100) / 100;
  const serviceTaxPercentage = Math.max(0, Number(vehicle?.serviceTaxPercentage || 0));
  const serviceTaxAmount = Math.round((baseFare * serviceTaxPercentage) * 100) / 100 / 100;
  const totalFare = Math.round((baseFare + serviceTaxAmount) * 100) / 100;

  return { baseFare, serviceTaxPercentage, serviceTaxAmount, totalFare };
};

const formatDateTime = (dateValue, scheduleLabel = '') => {
  const parsed = new Date(dateValue);
  const formattedDate = Number.isNaN(parsed.getTime())
    ? formatTravelDate(dateValue)
    : parsed.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

  return scheduleLabel ? `${formattedDate} • ${scheduleLabel}` : formattedDate;
};

const PoolingConfirm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { route, vehicle, selectedSeats, totalFare, fareBreakdown: routeFareBreakdown, travelDate, schedule, pickupStop, dropStop } = location.state || {};

  const [isBooking, setIsBooking] = useState(false);
  const [isBooked, setIsBooked] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  useEffect(() => {
    if (!confirmedBooking) {
      return;
    }

    schedulePoolingBookingReminders({
      ...confirmedBooking,
      route: {
        ...(confirmedBooking.route || {}),
        schedules: Array.isArray(route?.schedules) ? route.schedules : [],
      },
      departureTime: schedule?.departureTime || '',
    });
  }, [confirmedBooking, route?.schedules, schedule?.departureTime]);

  if (!route || !vehicle || !schedule?.id || !pickupStop?.id || !dropStop?.id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white p-6 text-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-rose-50 text-rose-500 shadow-inner"
        >
          <Ticket size={48} />
        </motion.div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900">Session Expired</h2>
        <p className="mt-3 max-w-xs text-sm font-medium text-slate-500 leading-relaxed">
          Your booking session has timed out or data is missing. Please restart the process.
        </p>
        <button
          type="button"
          onClick={() => navigate('/taxi/user/pooling')}
          className="mt-10 flex items-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-2xl shadow-slate-200 transition-all hover:bg-slate-800 active:scale-95"
        >
          <ArrowLeft size={16} />
          Restart Booking
        </button>
      </div>
    );
  }

  const handleConfirm = async () => {
    setIsBooking(true);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderResponse = await userService.createPoolingBookingOrder({
        routeId: route._id,
        vehicleId: vehicle._id,
        scheduleId: schedule.id,
        travelDate,
        selectedSeats,
        pickupStopId: pickupStop.id,
        dropStopId: dropStop.id,
      });
      const order = unwrapPayload(orderResponse);

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start pooling payment');
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Pooling Booking',
        description: `${route.originLabel} to ${route.destinationLabel}`,
        order_id: order.orderId,
        modal: {
          ondismiss: () => {
            setIsBooking(false);
          },
        },
        theme: {
          color: '#0f172a',
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userService.verifyPoolingBookingPayment({
              ...response,
              routeId: route._id,
              vehicleId: vehicle._id,
              scheduleId: schedule.id,
              travelDate,
              selectedSeats,
              pickupStopId: pickupStop.id,
              dropStopId: dropStop.id,
            });
            const booking = unwrapPayload(verifyResponse);

            setConfirmedBooking(booking);
            setIsBooked(true);
            toast.success('Pooling booking confirmed');
          } catch (verifyError) {
            const message =
              verifyError?.response?.data?.message ||
              verifyError?.message ||
              'Payment verification failed. Please contact support if payment was deducted.';
            toast.error(message);
            setIsBooking(false);
          }
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        toast.error(message);
        setIsBooking(false);
      });

      rzp.open();
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Unable to continue with Razorpay payment';
      toast.error(message);
      setIsBooking(false);
    }
  };

  const vehicleImage = (vehicle.images && vehicle.images.length > 0) ? vehicle.images[0] : taxiImg;
  const fareBreakdown = routeFareBreakdown || computePoolingFareBreakdown(route, vehicle, selectedSeats);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-32 font-sans selection:bg-indigo-100">
      <AnimatePresence mode="wait">
        {isBooked ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen bg-slate-50 px-5 pb-10 pt-8"
          >
            <div className="overflow-hidden rounded-[40px] border border-white bg-white shadow-[0_32px_64px_-12px_rgba(15,23,42,0.12)]">
              <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-6 pb-12 pt-10 text-white">
                <div className="absolute right-0 top-0 -mr-12 -mt-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
                
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
                  className="relative z-10 mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[28px] bg-white/20 shadow-xl backdrop-blur-xl"
                >
                  <CircleCheckBig size={40} />
                </motion.div>

                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <motion.p 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-100"
                    >
                      Booking Successful
                    </motion.p>
                    <motion.h1 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="mt-3 text-3xl font-black tracking-tight leading-tight"
                    >
                      Your ride is <br />all set!
                    </motion.h1>
                  </div>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                    className="rounded-2xl bg-white/20 px-4 py-3 text-right backdrop-blur-md border border-white/10 shadow-lg"
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Booking ID</p>
                    <p className="mt-1 font-mono text-sm font-black">{confirmedBooking?.bookingId?.slice(-8).toUpperCase() || 'TX-8291'}</p>
                  </motion.div>
                </div>
              </div>

              <div className="relative -mt-8 space-y-5 rounded-t-[40px] bg-white px-6 pb-8 pt-10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5 transition-all hover:bg-slate-50">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Date & Time</p>
                    <div className="mt-4 flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                        <CalendarDays size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {formatDateTime(confirmedBooking?.travelDate || travelDate, confirmedBooking?.scheduleId || schedule?.departureTime || '')}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scheduled Departure</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-5 transition-all hover:bg-slate-50">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Amount Paid</p>
                    <div className="mt-4 flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                        <Receipt size={16} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-900">₹{confirmedBooking?.fare || fareBreakdown.totalFare || totalFare}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                          <ShieldCheck size={10} />
                          PAID
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="group relative overflow-hidden rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-5">
                    <div className="relative h-20 w-24 overflow-hidden rounded-2xl bg-slate-100 flex items-center justify-center">
                      <img src={vehicleImage} alt={vehicle.name} className="h-16 w-auto object-contain transform group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vehicle Info</p>
                      <p className="mt-1 text-xl font-black text-slate-900 truncate">{vehicle.name}</p>
                      <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.15em] text-indigo-600">{vehicle.vehicleNumber}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                          <Armchair size={10} />
                          Seats: {(confirmedBooking?.selectedSeats || selectedSeats).join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Trip Details</p>
                    <div className="flex items-center gap-1 text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      <MapPinned size={12} />
                      Track Route
                    </div>
                  </div>
                  <div className="relative mt-2 flex items-start gap-5">
                    <div className="relative flex flex-col items-center pt-1.5">
                      <div className="z-10 h-3 w-3 rounded-full border-2 border-emerald-500 bg-white shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
                      <div className="h-14 w-0.5 border-l-2 border-dashed border-slate-200" />
                      <div className="z-10 h-3 w-3 rounded-full bg-slate-900 ring-4 ring-slate-50" />
                    </div>
                    <div className="flex-1 space-y-6">
                      <div className="relative">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pickup</p>
                        <p className="mt-1 text-sm font-black leading-tight text-slate-900">
                          {confirmedBooking?.pickupLabel || pickupStop?.name || route.originLabel}
                        </p>
                      </div>
                      <div className="relative">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Drop</p>
                        <p className="mt-1 text-sm font-black leading-tight text-slate-900">
                          {confirmedBooking?.dropLabel || dropStop?.name || route.destinationLabel}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[32px] border border-emerald-100 bg-emerald-50/50 p-5">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 rounded-xl bg-emerald-100 p-2 text-emerald-600">
                      <Info size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Next Steps</p>
                      <p className="mt-1.5 text-xs font-semibold leading-relaxed text-emerald-800">
                        Please arrive at the pickup point 10 mins early. Show your booking ID to the driver when boarding.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/taxi/user/activity')}
                    className="group flex items-center justify-center gap-2 rounded-3xl border-2 border-slate-100 bg-white px-4 py-5 text-sm font-black text-slate-900 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                  >
                    My Rides
                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/taxi/user')}
                    className="rounded-3xl bg-slate-900 px-4 py-5 text-sm font-black text-white shadow-[0_20px_40px_-12px_rgba(15,23,42,0.4)] transition-all hover:bg-slate-800 active:scale-[0.98]"
                  >
                    Go Home
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 px-5 pb-5 pt-12 backdrop-blur-xl"
            >
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-900 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black tracking-tight text-slate-900">Confirm Ride</h1>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-600">
                      Step 3/3
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Finalize your pooling trip</p>
                </div>
              </div>
            </motion.div>

            <div className="space-y-6 px-5 pt-8">
              {/* Premium Ticket Card */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative"
              >
                <div className="overflow-hidden rounded-[44px] border border-white bg-white shadow-[0_32px_64px_-16px_rgba(15,23,42,0.1)]">
                  {/* Vehicle Header with Image */}
                  <div className="relative bg-slate-900 px-8 py-10 text-white overflow-hidden">
                    <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-600/20 blur-3xl" />
                    
                    <div className="relative z-10 flex items-center justify-between">
                      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-md border border-white/5">
                        <ShieldCheck size={12} className="text-indigo-400" />
                        Verified Ride
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Seats</p>
                        <p className="text-xl font-black">{selectedSeats.length}</p>
                      </div>
                    </div>

                    <div className="relative z-10 mt-8 flex items-center gap-6">
                      <div className="relative h-28 w-36 overflow-hidden rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center group">
                        <motion.img 
                          whileHover={{ scale: 1.1, rotate: -5 }}
                          src={vehicleImage} 
                          alt={vehicle.name} 
                          className="h-24 w-auto object-contain" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-2xl font-black leading-tight truncate">{vehicle.name}</h2>
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-indigo-400">{vehicle.vehicleNumber}</p>
                        <div className="mt-4 flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {[...Array(Math.min(3, selectedSeats.length))].map((_, i) => (
                              <div key={i} className="h-6 w-6 rounded-full border-2 border-slate-900 bg-indigo-500 flex items-center justify-center text-[10px] font-black">
                                <Armchair size={10} />
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {selectedSeats.join(', ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Perforated Divider */}
                  <div className="relative h-6 bg-slate-900">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-0">
                      <div className="h-6 w-3 rounded-r-full bg-slate-50" />
                      <div className="flex flex-1 items-center justify-around px-4">
                        {[...Array(18)].map((_, i) => (
                          <div key={i} className="h-1 w-1 rounded-full bg-slate-50/20" />
                        ))}
                      </div>
                      <div className="h-6 w-3 rounded-l-full bg-slate-50" />
                    </div>
                  </div>

                  {/* Route Info */}
                  <div className="space-y-8 bg-white p-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 shadow-inner">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Departure</p>
                          <p className="text-sm font-black text-slate-900">{schedule?.departureTime || 'TBA'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Date</p>
                        <p className="text-sm font-black text-slate-900">{formatTravelDate(travelDate)}</p>
                      </div>
                    </div>

                    <div className="relative flex items-start gap-6 pt-2">
                      <div className="relative flex flex-col items-center pt-1.5">
                        <div className="z-10 h-3.5 w-3.5 rounded-full border-[3px] border-indigo-500 bg-white" />
                        <div className="h-20 w-0.5 border-l-2 border-dashed border-slate-100" />
                        <div className="z-10 h-3.5 w-3.5 rounded-full bg-indigo-600 ring-4 ring-indigo-50" />
                        <Navigation size={14} className="absolute -bottom-7 text-indigo-600 animate-bounce" />
                      </div>
                      <div className="flex-1 space-y-10">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pickup Point</p>
                          <p className="mt-1 text-base font-black leading-tight text-slate-900">
                            {pickupStop?.name || route.originLabel}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destination</p>
                          <p className="mt-1 text-base font-black leading-tight text-slate-900">
                            {dropStop?.name || route.destinationLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Fare Breakdown Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-[36px] border border-slate-100 bg-white p-8 shadow-sm"
              >
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm">
                      <Ticket size={18} />
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Price Details</h3>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    <Zap size={12} fill="currentColor" />
                    Best Deal
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                    <span className="flex items-center gap-2">
                      Base Fare ({selectedSeats.length} Seats)
                    </span>
                    <span className="text-slate-900">₹{fareBreakdown.baseFare}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold text-slate-500">
                    <span>Service Tax ({fareBreakdown.serviceTaxPercentage}%)</span>
                    <span className="text-slate-900">₹{fareBreakdown.serviceTaxAmount}</span>
                  </div>
                  
                  <div className="mt-8 flex items-end justify-between border-t border-slate-50 pt-8">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Amount Payable</p>
                      <p className="mt-1 text-4xl font-black tracking-tight text-slate-900">₹{fareBreakdown.totalFare}</p>
                    </div>
                    <div className="mb-1">
                      <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                        Proceed to Pay
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Payment Method Card */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="group relative overflow-hidden rounded-[32px] border-2 border-dashed border-slate-200 bg-white p-6 transition-all hover:border-indigo-300 hover:bg-indigo-50/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-slate-50 text-slate-900 shadow-inner group-hover:bg-white group-hover:text-indigo-600 transition-colors">
                      <CreditCard size={26} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Secured Payment</p>
                      <p className="text-base font-black text-slate-900">Pay via Razorpay</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500 max-w-[180px] leading-relaxed">
                        Cards, UPI, NetBanking and Wallets supported.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                      Active
                    </div>
                    <img src="https://razorpay.com/assets/razorpay-glyph.svg" alt="Razorpay" className="h-5 w-auto opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all" />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Action Bar */}
            <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2">
              <div className="mx-5 mb-8 overflow-hidden rounded-[32px] bg-slate-900/90 p-2 shadow-[0_24px_50px_-12px_rgba(15,23,42,0.4)] backdrop-blur-xl border border-white/10">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isBooking}
                  className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-[26px] bg-white py-5 text-sm font-black text-slate-900 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                >
                  {isBooking ? (
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                      <span className="uppercase tracking-[0.2em]">Processing...</span>
                    </div>
                  ) : (
                    <>
                      <span className="uppercase tracking-[0.2em]">Confirm & Pay ₹{fareBreakdown.totalFare}</span>
                      <div className="rounded-full bg-slate-900 p-1 text-white group-hover:translate-x-1 transition-transform">
                        <ChevronRight size={18} />
                      </div>
                    </>
                  )}
                  
                  {/* Subtle Shimmer */}
                  {!isBooking && (
                    <div className="absolute inset-0 translate-x-[-100%] animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
};

export default PoolingConfirm;
