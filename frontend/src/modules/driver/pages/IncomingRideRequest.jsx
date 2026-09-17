import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Banknote,
  Bike,
  Clock,
  CreditCard,
  MapPin,
  Navigation,
  Phone,
  Package,
  Route,
  User,
  X,
} from 'lucide-react';
import { getScheduledRideCountdown } from '../utils/scheduledRideTime';

const Motion = motion;
const DEFAULT_ACCEPT_REJECT_SECONDS = 15;

const normalizePayment = (value = '') => String(value || 'cash').toUpperCase();

const getRequestExpiryTime = (data, requestDurationSeconds) => {
  const safeData = data || {};
  const rawExpiryTime = safeData.requestExpiresAt || safeData.raw?.requestExpiresAt;
  const expiryTimestamp = rawExpiryTime ? new Date(rawExpiryTime).getTime() : NaN;

  if (Number.isFinite(expiryTimestamp) && expiryTimestamp > Date.now()) {
    return expiryTimestamp;
  }

  return Date.now() + (requestDurationSeconds * 1000);
};

const getRequestDurationSeconds = (data) => {
  const safeData = data || {};
  const rawDuration = safeData.acceptRejectDurationSeconds ||
    safeData.expiresInSeconds ||
    safeData.raw?.acceptRejectDurationSeconds ||
    safeData.raw?.expiresInSeconds;
  const duration = Number(rawDuration);

  return Number.isFinite(duration) && duration > 0
    ? Math.ceil(duration)
    : DEFAULT_ACCEPT_REJECT_SECONDS;
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

const IncomingRideRequest = ({
  visible,
  onAccept,
  onDecline,
  onSubmitBid,
  onClose,
  requestData,
  isAccepting = false,
  onPreviewCancel,
  isPreviewCancelling = false,
  canPreviewCancel = true,
  previewCancelDisabledLabel = 'Cancel unavailable',
  previewCancelHelpText = '',
  mode = 'live',
}) => {
  const isPreviewMode = mode === 'preview';
  const requestDurationSeconds = getRequestDurationSeconds(requestData);
  const [timer, setTimer] = useState(requestDurationSeconds);
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const data = requestData;

  useEffect(() => {
    if (isPreviewMode || !visible || !data?.rideId) {
      return undefined;
    }

    const expiresAt = getRequestExpiryTime(data, requestDurationSeconds);
    let hasExpired = false;

    const syncTimer = () => {
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimer(remainingSeconds);

      if (!hasExpired && remainingSeconds <= 0) {
        hasExpired = true;
        onDecline();
      }
    };

    syncTimer();
    const interval = setInterval(syncTimer, 250);

    return () => {
      clearInterval(interval);
    };
  }, [visible, onDecline, requestDurationSeconds, data?.rideId, data?.requestExpiresAt, isPreviewMode]);

  useEffect(() => {
    if (!visible || !isPreviewMode) {
      return undefined;
    }

    setPreviewNow(Date.now());
    const interval = setInterval(() => {
      setPreviewNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [visible, isPreviewMode]);

  if (!visible || !data) return null;

  const isParcel = data.type === 'parcel';
  const isIntercity = data.type === 'intercity';
  const scheduledAt = data.scheduledAt || data.raw?.scheduledAt || data.raw?.ride?.scheduledAt || null;
  const isScheduledRequest = Boolean(scheduledAt);
  const title = isPreviewMode
    ? (isParcel ? 'Scheduled delivery' : isIntercity ? 'Scheduled intercity trip' : 'Scheduled ride')
    : (isScheduledRequest
      ? (isParcel ? 'Scheduled delivery request' : isIntercity ? 'Scheduled intercity request' : 'Scheduled ride request')
      : (isParcel ? 'New delivery request' : isIntercity ? 'New intercity request' : 'New ride request'));
  const intercityRoute = [data.raw?.intercity?.fromCity, data.raw?.intercity?.toCity].filter(Boolean).join(' to ');
  const category = data.raw?.parcel?.category || data.raw?.parcel?.weight || (isParcel ? 'Parcel delivery' : isIntercity ? intercityRoute || 'Intercity trip' : 'Passenger ride');
  const payment = normalizePayment(data.payment);
  const timerProgress = Math.max(0, Math.min(100, (timer / requestDurationSeconds) * 100));
  const accentClass = isParcel ? 'bg-orange-500' : isIntercity ? 'bg-yellow-400' : 'bg-blue-600';
  const accentTextClass = isParcel ? 'text-orange-600' : isIntercity ? 'text-yellow-700' : 'text-blue-600';
  const pickupAddress = data.raw?.pickupAddress || data.pickup || 'Pickup point';
  const dropAddress = data.raw?.dropAddress || data.drop || 'Drop point';
  const attemptCount = Number(data.attempt || data.raw?.attempt || 1);
  const maxAttempts = Number(data.maxAttempts || data.raw?.maxAttempts || 1);
  const searchRadiusMeters = Number(data.raw?.radius || data.radius || 0);
  const searchRadiusLabel = searchRadiusMeters > 0 ? `${(searchRadiusMeters / 1000).toFixed(1)} km` : 'nearby';
  const customerName = data.customer?.name || data.raw?.user?.name || 'Customer';
  const customerPhone = [data.customer?.countryCode, data.customer?.phone]
    .filter(Boolean)
    .join(' ')
    .trim() || data.raw?.user?.phone || '';
  const pricingNegotiationMode = String(data.raw?.pricingNegotiationMode || 'none').toLowerCase();
  const isBidding = pricingNegotiationMode === 'driver_bid' && (Boolean(data.raw?.bidding?.enabled) || String(data.raw?.bookingMode || '').toLowerCase() === 'bidding');
  const isUserIncrementOnly = pricingNegotiationMode === 'user_increment_only';
  const fareWasIncreased = isUserIncrementOnly && Number(data.raw?.fare || 0) > Number(data.raw?.baseFare || data.raw?.fare || 0);
  const bidBaseFare = Number(data.raw?.bidding?.baseFare || data.raw?.baseFare || data.raw?.fare || 0);
  const bidFloorFare = Number(data.raw?.bidding?.bidFloorFare || bidBaseFare);
  const bidMaxFare = Number(data.raw?.bidding?.userMaxBidFare || data.raw?.userMaxBidFare || bidBaseFare);
  const bidStepAmount = Number(data.raw?.bidding?.bidStepAmount || 10);
  const scheduledCountdown = getScheduledRideCountdown(scheduledAt, previewNow);
  const bidOptions = isBidding
    ? Array.from({ length: Math.max(1, Math.floor((bidMaxFare - bidFloorFare) / bidStepAmount) + 1) }, (_, index) => bidFloorFare + (index * bidStepAmount))
    : [];

  const themeBgGradient = isParcel 
    ? 'from-orange-50/90 to-white' 
    : isIntercity 
      ? 'from-teal-50/90 to-white' 
      : 'from-emerald-50/95 to-white';
  const accentBg = isParcel ? 'bg-orange-500' : isIntercity ? 'bg-teal-500' : 'bg-emerald-500';
  const accentText = isParcel ? 'text-orange-600' : isIntercity ? 'text-teal-600' : 'text-emerald-600';
  const accentHoverBg = isParcel ? 'hover:bg-orange-600' : isIntercity ? 'hover:bg-teal-600' : 'hover:bg-emerald-600';
  const lightBg = isParcel ? 'bg-orange-50/80' : isIntercity ? 'bg-teal-50/80' : 'bg-emerald-50/80';
  const lightBorder = isParcel ? 'border-orange-100' : isIntercity ? 'border-teal-100' : 'border-emerald-100';
  const glowShadow = isParcel 
    ? 'shadow-[0_12px_24px_rgba(249,115,22,0.3)]' 
    : isIntercity 
      ? 'shadow-[0_12px_24px_rgba(13,148,136,0.3)]' 
      : 'shadow-[0_12px_24px_rgba(16,185,129,0.3)]';

  return (
    <AnimatePresence mode="wait">
      <Motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 px-3 pb-4 sm:pb-8 backdrop-blur-[2px]"
      >
        <Motion.div
          initial={{ y: 80, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 80, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          className="relative w-full max-w-[430px] overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.22)]"
        >
          {!isPreviewMode ? (
            <div className="absolute inset-x-0 top-0 h-[3px] bg-slate-100">
              <Motion.div className={`h-full ${accentBg}`} animate={{ width: `${timerProgress}%` }} transition={{ duration: 0.35 }} />
            </div>
          ) : null}

          <div className={`bg-gradient-to-b ${themeBgGradient} px-5 pb-5 pt-6 text-slate-900 border-b border-slate-100`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] ${accentBg} text-white shadow-[0_10px_20px_rgba(0,0,0,0.1)]`}>
                  {isParcel ? <Package size={26} /> : isIntercity ? <Navigation size={26} /> : <Bike size={26} />}
                </div>
                <div className="min-w-0">
                  <span className={`inline-flex rounded-full ${lightBg} ${accentText} px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider`}>
                    {isPreviewMode ? 'Scheduled Trip' : 'Ride Offer'}
                  </span>
                  <h2 className="mt-1 text-[21px] font-black leading-tight tracking-tight text-slate-900">{title}</h2>
                  <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-500">{category}</p>
                  {isPreviewMode ? (
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Scheduled for {formatScheduledDateTime(scheduledAt)}
                    </p>
                  ) : isScheduledRequest ? (
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">
                      Scheduled for {formatScheduledDateTime(scheduledAt)}
                    </p>
                  ) : (
                    <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Wave {attemptCount} of {maxAttempts} • Radius {searchRadiusLabel}
                    </p>
                  )}
                  {fareWasIncreased ? (
                    <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                      Fare increased
                    </p>
                  ) : null}
                </div>
              </div>

              {isPreviewMode ? (
                <button
                  type="button"
                  onClick={onClose || onDecline}
                  className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all active:scale-95"
                >
                  <X size={20} />
                </button>
              ) : (
                <div
                  className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full transition-all"
                  style={{
                    background: `conic-gradient(${
                      isParcel ? '#f97316' : isIntercity ? '#0d9488' : '#10b981'
                    } ${timerProgress}%, #e2e8f0 0)`
                  }}
                >
                  <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white shadow-sm">
                    <span className="text-[21px] font-black leading-none text-slate-900">{timer}</span>
                    <span className="-mt-0.5 text-[7px] font-black uppercase tracking-widest text-slate-400">sec</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 pt-4 bg-white">
            <div className="mb-4 grid grid-cols-3 overflow-hidden rounded-[20px] border border-slate-100 bg-slate-50/50 shadow-sm">
              <div className="flex flex-col items-center justify-center p-3 text-center">
                <div className="mb-1 flex items-center gap-1 text-slate-400">
                  <Route size={14} className="text-slate-400" />
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Distance</p>
                </div>
                <p className="text-[15px] font-black text-slate-800">{data.distance || 'Nearby'}</p>
              </div>
              
              <div className={`flex flex-col items-center justify-center border-x border-slate-100 ${lightBg} p-3 text-center`}>
                <div className="mb-1 flex items-center gap-1">
                  <Banknote size={14} className={accentText} />
                  <p className={`text-[9px] font-extrabold uppercase tracking-wider ${accentText}`}>Earnings</p>
                </div>
                <p className={`text-[21px] font-black leading-none ${accentText}`}>{data.fare || 'Rs 0'}</p>
              </div>

              <div className="flex flex-col items-center justify-center p-3 text-center">
                <div className="mb-1 flex items-center gap-1 text-slate-400">
                  {payment.includes('CASH') ? <Banknote size={14} className="text-slate-400" /> : <CreditCard size={14} className="text-slate-400" />}
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Payment</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wide ${
                  payment.includes('CASH') ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {payment}
                </span>
              </div>
            </div>

            {isPreviewMode ? (
              <div className="mb-4 rounded-[20px] border border-blue-100 bg-blue-50/50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-blue-600 shadow-sm border border-blue-100/50">
                    <Clock size={18} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-wider text-blue-500/80">Scheduled time</p>
                    <p className="mt-1 text-[14px] font-black text-slate-800">{formatScheduledDateTime(scheduledAt)}</p>
                    <p className="mt-1 text-[11px] font-black text-blue-600">{scheduledCountdown}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">This request is stored for later dispatch and shown here with full details.</p>
                  </div>
                </div>
              </div>
            ) : isScheduledRequest ? (
              <div className="mb-4 rounded-[20px] border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white text-emerald-600 shadow-sm border border-emerald-100/50">
                    <Clock size={18} strokeWidth={2.3} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600/80">Scheduled time</p>
                    <p className="mt-1 text-[14px] font-black text-slate-800">{formatScheduledDateTime(scheduledAt)}</p>
                    <p className="mt-1 text-[11px] font-black text-emerald-600">{scheduledCountdown}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                      This is a scheduled request. Accept only if you can commit to this pickup slot.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {isIntercity && (
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-[18px] border border-teal-100 bg-teal-50/40 px-3 py-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-teal-700/60">Trip</p>
                  <p className="mt-1 truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.tripType || 'Intercity'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-teal-700/60">Date</p>
                  <p className="mt-1 truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.travelDate || 'Today'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-teal-700/60">Pax</p>
                  <p className="mt-1 truncate text-[12px] font-extrabold text-slate-800">{data.raw?.intercity?.passengers || 1}</p>
                </div>
              </div>
            )}

            <div className="mb-4 rounded-[20px] border border-slate-100 bg-slate-50/30 p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 font-extrabold text-sm border border-slate-200/50">
                  {customerName.substring(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Rider</p>
                    {customerPhone && (
                      <a
                        href={`tel:${customerPhone}`}
                        className={`flex items-center gap-1 text-[11px] font-bold ${accentText} ${lightBg} hover:opacity-90 rounded-full px-2.5 py-0.5 transition-colors`}
                      >
                        <Phone size={10} strokeWidth={2.5} />
                        <span>Call</span>
                      </a>
                    )}
                  </div>
                  <p className="truncate text-[14px] font-extrabold text-slate-800">{customerName}</p>
                </div>
              </div>
            </div>

            <div className="mb-5 rounded-[24px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.02)]">
              <div className="relative flex flex-col gap-5">
                {/* Timeline Line */}
                <div className="absolute left-[9px] top-3.5 bottom-3.5 w-[2px] bg-slate-100" />

                {/* Pickup Pin */}
                <div className="flex items-start gap-4">
                  <div className="relative z-10 mt-1 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-emerald-100 shadow-sm border border-white">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                      Pickup
                    </span>
                    <p className="mt-1 text-[14px] font-bold leading-snug text-slate-800">{pickupAddress}</p>
                  </div>
                </div>

                {/* Drop Pin */}
                <div className="flex items-start gap-4">
                  <div className="relative z-10 mt-1 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-100 shadow-sm border border-white">
                    <span className="h-2.5 w-2.5 rounded bg-rose-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-700">
                      Drop
                    </span>
                    <p className="mt-1 text-[14px] font-bold leading-snug text-slate-800">{dropAddress}</p>
                  </div>
                </div>
              </div>
            </div>

            {isPreviewMode ? (
              onPreviewCancel ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={onClose || onDecline}
                    disabled={isPreviewCancelling}
                    className="flex h-[56px] items-center justify-center rounded-[18px] border border-slate-200 bg-white text-[13px] font-bold uppercase tracking-[0.15em] text-slate-600 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-60"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canPreviewCancel) {
                        onPreviewCancel(data);
                      }
                    }}
                    disabled={isPreviewCancelling || !canPreviewCancel}
                    className="flex h-[56px] items-center justify-center rounded-[18px] bg-rose-500 px-5 text-[13px] font-bold uppercase tracking-[0.15em] text-white shadow-[0_8px_20px_rgba(244,63,94,0.2)] hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-60"
                  >
                    {isPreviewCancelling ? 'Cancelling...' : canPreviewCancel ? 'Cancel ride' : previewCancelDisabledLabel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onClose || onDecline}
                  className="flex h-[56px] w-full items-center justify-center rounded-[18px] bg-slate-900 px-5 text-[13px] font-bold uppercase tracking-[0.15em] text-white hover:bg-slate-850 shadow-md transition-all active:scale-95"
                >
                  Close details
                </button>
              )
            ) : (
              <>
                <div className="grid grid-cols-[76px_1fr] gap-3 items-end">
                  <button
                    type="button"
                    onClick={onDecline}
                    disabled={isAccepting}
                    className="flex h-[56px] items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition-all active:scale-95 disabled:opacity-60"
                  >
                    <X size={24} />
                  </button>
                  {isBidding ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {bidOptions.slice(0, 6).map((bidValue) => (
                          <button
                            key={bidValue}
                            type="button"
                            onClick={() => onSubmitBid?.(bidValue)}
                            disabled={isAccepting}
                            className={`rounded-[14px] border ${lightBorder} ${lightBg} py-2.5 text-[11px] font-extrabold uppercase tracking-wide ${accentText} hover:opacity-90 active:scale-98 transition-all disabled:opacity-60`}
                          >
                            Rs {bidValue}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => onSubmitBid?.(bidBaseFare)}
                        disabled={isAccepting}
                        className={`flex h-[56px] w-full items-center justify-center rounded-[18px] ${accentBg} px-5 text-[14px] font-extrabold uppercase tracking-[0.15em] text-white ${glowShadow} ${accentHoverBg} transition-all active:scale-95 disabled:opacity-70`}
                      >
                        {isAccepting ? 'Submitting...' : 'Send Bid'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAccept(data)}
                      disabled={isAccepting}
                      className={`flex h-[56px] w-full items-center justify-center rounded-[18px] ${accentBg} px-5 text-[14px] font-extrabold uppercase tracking-[0.15em] text-white ${glowShadow} ${accentHoverBg} transition-all active:scale-95 disabled:opacity-70`}
                    >
                      {isAccepting ? 'Accepting...' : 'Accept ride'}
                    </button>
                  )}
                </div>

                <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <Clock size={12} />
                  Request auto-declines when the timer ends.
                </p>
              </>
            )}
          </div>
        </Motion.div>
      </Motion.div>
    </AnimatePresence>
  );
};

export default IncomingRideRequest;
