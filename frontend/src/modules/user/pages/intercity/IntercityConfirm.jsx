import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, CheckCircle2, Clock3, LoaderCircle, Navigation } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';

const generateIntercityBookingId = () =>
  'IC-' + Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

const generateSearchNonce = () =>
  `intercity-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const IntercityConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '';
  const state = useMemo(() => location.state || {}, [location.state]);
  const [status, setStatus] = useState('saving');
  const [error, setError] = useState('');
  const requestStartedRef = useRef(false);
  const isScheduled = state.rideMode === 'schedule' && Boolean(state.scheduledAt);
  const isBiddingRide = String(state.bookingMode || '').trim().toLowerCase() === 'bidding';

  useEffect(() => {
    if (!state.pickup || !state.drop || !state.vehicle) {
      navigate(`${routePrefix}/intercity`, { replace: true });
      return;
    }

    if (!isScheduled || isBiddingRide) {
      const bookingId = state.bookingId || generateIntercityBookingId();

      navigate(`${routePrefix}/ride/searching`, {
        replace: true,
        state: {
          ...state,
          bookingId,
          searchNonce: state.searchNonce || generateSearchNonce(),
          vehicleTypeId: state.vehicleTypeId || state.vehicle?.vehicleTypeId || '',
          vehicleIconType: state.vehicleIconType || state.vehicle?.iconType || state.vehicle?.name || 'car',
          vehicleIconUrl: state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
          paymentMethod: state.paymentMethod || 'Cash',
          serviceType: 'intercity',
          transport_type: 'intercity',
          bookingMode: isBiddingRide ? 'bidding' : (state.bookingMode || 'normal'),
          bidStepAmount: Number(state.bidStepAmount || 10),
          userMaxBidFare: Number(state.userMaxBidFare || state.fare || 0),
          intercity: {
            bookingId,
            fromCity: state.fromCity || '',
            toCity: state.toCity || '',
            tripType: state.tripType || 'One Way',
            travelDate: state.date || 'Ride Now',
            passengers: state.passengers || 1,
            distance: Number(state.distance || 0),
            vehicleName: state.vehicle?.name || state.vehicle?.id || 'Intercity Cab',
            packageId: state.vehicle?.packageId || '',
            packageTypeName: state.vehicle?.packageTypeName || 'Intercity',
          },
        },
      });
      return;
    }

    if (requestStartedRef.current) {
      return;
    }
    requestStartedRef.current = true;

    const bookingId = state.bookingId || generateIntercityBookingId();

    (async () => {
      try {
        await api.post('/rides', {
          pickup: state.pickupCoords,
          drop: state.dropCoords,
          pickupAddress: state.pickup,
          dropAddress: state.drop,
          fare: Number(state.fare || 0),
          vehicleTypeId: state.vehicleTypeId || state.vehicle?.vehicleTypeId || '',
          vehicleTypeIds: state.vehicleTypeId || state.vehicle?.vehicleTypeId ? [state.vehicleTypeId || state.vehicle?.vehicleTypeId] : [],
          vehicleIconType: state.vehicleIconType || state.vehicle?.iconType || state.vehicle?.name || 'car',
          vehicleIconUrl: state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
          paymentMethod: state.paymentMethod || 'Cash',
          serviceType: 'intercity',
          transport_type: 'intercity',
          bookingMode: state.bookingMode || 'normal',
          userMaxBidFare: Number(state.userMaxBidFare || state.fare || 0),
          bidStepAmount: Number(state.bidStepAmount || 10),
          scheduledAt: state.scheduledAt,
          intercity: {
            bookingId,
            fromCity: state.fromCity || '',
            toCity: state.toCity || '',
            tripType: state.tripType || 'One Way',
            travelDate: state.travelDate || state.date || '',
            passengers: state.passengers || 1,
            distance: Number(state.distance || 0),
            vehicleName: state.vehicle?.name || state.vehicle?.id || 'Intercity Cab',
          },
        });
        setStatus('scheduled');
      } catch (requestError) {
        setStatus('error');
        setError(requestError?.message || 'Could not schedule this intercity ride.');
      }
    })();
  }, [isScheduled, navigate, routePrefix, state]);

  const formattedSchedule = useMemo(() => {
    if (!state.scheduledAt) {
      return '';
    }
    const parsed = new Date(state.scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      return state.scheduledAt;
    }
    return parsed.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [state.scheduledAt]);

  return (
    <div className="min-h-screen max-w-lg mx-auto flex items-center justify-center bg-slate-950 px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full rounded-[32px] border border-white/10 bg-white/5 px-6 py-8 text-center shadow-2xl"
      >
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] ${
          status === 'scheduled' ? 'bg-emerald-600/20 text-emerald-400' :
          status === 'error' ? 'bg-rose-600/20 text-rose-400' : 'bg-blue-600/20 text-blue-400'
        }`}>
          {status === 'scheduled' ? <CheckCircle2 size={26} /> : <Navigation size={26} />}
        </div>
        <h1 className="mt-5 text-[22px] font-black text-white">
          {status === 'scheduled' ? 'Intercity ride scheduled' : status === 'error' ? 'Scheduling failed' : 'Scheduling your ride'}
        </h1>
        <p className="mt-2 text-[13px] font-bold text-white/55">
          {status === 'scheduled'
            ? 'Your booking has been saved. Drivers will be notified automatically at the scheduled time.'
            : status === 'error'
              ? error
              : 'Saving your intercity booking and preparing automatic driver notification.'}
        </p>
        <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-left">
          <div className="flex items-center gap-3 text-white">
            <Calendar size={16} className="text-blue-300" />
            <span className="text-sm font-bold">Scheduled For</span>
          </div>
          <p className="mt-2 text-lg font-black text-white">{formattedSchedule || state.date || 'Scheduled'}</p>
          <div className="mt-4 flex items-center gap-3 text-white/65">
            <Clock3 size={15} />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">{state.fromCity} to {state.toCity}</span>
          </div>
        </div>
        {status === 'saving' ? (
          <div className="mt-6 flex items-center justify-center gap-3 text-[12px] font-black uppercase tracking-[0.18em] text-blue-300">
            <LoaderCircle size={18} className="animate-spin" />
            Saving Schedule
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(routePrefix || '/')}
          className="mt-6 h-12 w-full rounded-[18px] bg-white text-sm font-black uppercase tracking-[0.16em] text-slate-900"
        >
          {status === 'error' ? 'Back to Home' : 'Done'}
        </button>
      </motion.div>
    </div>
  );
};

export default IntercityConfirm;
