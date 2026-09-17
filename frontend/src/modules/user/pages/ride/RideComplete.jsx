import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Banknote, CheckCircle2, ChevronRight, CreditCard, MessageSquare, Receipt, Share2, Star, Wallet } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import { userAuthService } from '../../services/authService';
import { clearCurrentRide, getCurrentRide } from '../../services/currentRideService';
import carIcon from '../../../../assets/icons/car.png';
import bikeIcon from '../../../../assets/icons/bike.png';
import autoIcon from '../../../../assets/icons/auto.png';
import deliveryIcon from '../../../../assets/icons/Delivery.png';
import { useSettings } from '../../../../shared/context/SettingsContext';

const TIP_OPTIONS = [0, 20, 50, 100];
const PAYMENT_OPTIONS = [
  { id: 'cash', label: 'COD / Cash', sub: 'Pay driver directly', Icon: Banknote },
  { id: 'online', label: 'Online', sub: 'UPI, cards or Razorpay', Icon: CreditCard },
  { id: 'wallet', label: 'Wallet', sub: 'Use in-app wallet balance', Icon: Wallet },
];
const ONLINE_PAYMENT_OPTIONS = [
  { id: 'upi', label: 'UPI', sub: 'PhonePe, GPay or Paytm' },
  { id: 'card', label: 'Card', sub: 'Debit or credit card' },
  { id: 'netbanking', label: 'Netbanking', sub: 'Choose your bank in checkout' },
];
const PAID_COLLECTION_STATUSES = new Set(['paid', 'captured', 'completed']);

const normalizePaymentChoice = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('wallet')) return 'wallet';
  if (normalized.includes('cash') || normalized.includes('cod')) return 'cash';
  return 'online';
};

const getInitials = (name = '') =>
  String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'DR';

const isLikelyVehiclePhoto = (value = '') => /^(https?:|data:image\/|blob:|\/uploads\/|\/images\/)/i.test(String(value || '').trim());
const isCollectionPaid = (collection = null) =>
  Boolean(collection?.paidAt) || PAID_COLLECTION_STATUSES.has(String(collection?.status || '').trim().toLowerCase());

const getVehicleIcon = (serviceType = 'ride', driver = {}) => {
  const customIcon = String(driver.vehicleIconUrl || driver.map_icon || driver.icon || '').trim();
  if (customIcon) return customIcon;

  const normalizedService = String(serviceType || '').toLowerCase();
  const iconType = String(driver.vehicleIconType || driver.vehicleType || '').toLowerCase();

  if (normalizedService === 'parcel') return deliveryIcon;
  if (iconType.includes('bike')) return bikeIcon;
  if (iconType.includes('auto')) return autoIcon;
  return carIcon;
};

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

const RideComplete = () => {
  const { settings } = useSettings();
  const appName = settings.general?.app_name || 'App';
  const navigate = useNavigate();
  const location = useLocation();
  const storedRide = useMemo(() => getCurrentRide(), []);
  const state = useMemo(() => location.state || storedRide || {}, [location.state, storedRide]);

  const [rating, setRating] = useState(() => Number(state.feedback?.rating || 0));
  const [comment, setComment] = useState(() => state.feedback?.comment || '');
  const [selectedTip, setSelectedTip] = useState(() => Number(state.feedback?.tipAmount || 0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(Boolean(state.feedback?.submittedAt));
  const [showSubmittedOverlay, setShowSubmittedOverlay] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [error, setError] = useState('');
  const [vehicleImageBroken, setVehicleImageBroken] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(() => normalizePaymentChoice(state.paymentMethod || 'Cash'));
  const [selectedOnlineMethod, setSelectedOnlineMethod] = useState('upi');
  const [walletSnapshot, setWalletSnapshot] = useState({ balance: 0, currency: 'INR' });
  const [walletLoading, setWalletLoading] = useState(false);
  const [paymentCollection, setPaymentCollection] = useState(() => state.driverPaymentCollection || null);
  const [rideLiveStatus, setRideLiveStatus] = useState(() => String(state.liveStatus || state.status || '').toLowerCase());
  const [tipSettings, setTipSettings] = useState({
    enable_tips: '1',
    min_tip_amount: '10',
  });

  const routeHome = location.pathname.startsWith('/taxi/user') ? '/taxi/user' : '/';
  const rideId = state.rideId || '';
  const fare = Number(state.fare || 22);
  const paymentMethod = state.paymentMethod || 'Cash';
  const paymentMethodLabel = PAYMENT_OPTIONS.find((option) => option.id === selectedPaymentMethod)?.label || paymentMethod;
  const pickup = state.pickup || 'Pickup';
  const drop = state.drop || 'Drop';
  const serviceType = String(state.serviceType || state.type || 'ride').toLowerCase();
  const driver = state.driver || {
    name: 'Captain',
    rating: '4.9',
    vehicle: serviceType === 'parcel' ? 'Delivery' : 'Taxi',
    plate: 'Assigned',
    profileImage: '',
    vehicleImage: '',
  };

  const driverImage = driver.profileImage || '';
  const vehicleLabel = driver.vehicle || driver.vehicleType || (serviceType === 'parcel' ? 'Delivery' : 'Taxi');
  const hasVehiclePhoto = isLikelyVehiclePhoto(driver.vehicleImage) && !vehicleImageBroken;
  const vehicleVisual = hasVehiclePhoto ? driver.vehicleImage : getVehicleIcon(serviceType, {
    ...driver,
    vehicleIconUrl: driver.vehicleIconUrl || state.vehicleIconUrl || state.vehicle?.vehicleIconUrl || state.vehicle?.icon || '',
  });
  const totalBill = fare + Number(selectedTip || 0);
  const fareDueNow = isCollectionPaid(paymentCollection) ? 0 : fare;
  const payableNow = fareDueNow + Number(selectedTip || 0);
  const isRideFinalized = ['completed', 'delivered'].includes(rideLiveStatus) || Boolean(state.feedback?.submittedAt);
  const tipsEnabled = String(tipSettings.enable_tips || '1') === '1';
  const minimumTipAmount = Number(tipSettings.min_tip_amount || 0);
  const availableTipOptions = useMemo(() => {
    if (!tipsEnabled) {
      return [0];
    }

    const nextOptions = [...new Set([0, minimumTipAmount, ...TIP_OPTIONS].filter((amount) => Number.isFinite(amount) && amount >= 0))]
      .sort((left, right) => left - right);

    return nextOptions;
  }, [minimumTipAmount, tipsEnabled]);
  const rideDate = new Date(state.completedAt || state.arrivedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const rideTime = new Date(state.completedAt || state.arrivedAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  useEffect(() => {
    // We keep the ride state for the review screen to allow refreshes
  }, []);

  useEffect(() => {
    const fetchTipSettings = async () => {
      try {
        const response = await api.get('/rides/app-settings/tip');
        const nextSettings = response?.data?.settings || response?.settings || {};
        setTipSettings((current) => ({
          ...current,
          ...nextSettings,
        }));
      } catch (tipError) {
        console.error('Failed to load tip settings:', tipError);
      }
    };

    fetchTipSettings();
  }, []);

  useEffect(() => {
    let active = true;

    const hydrateCompletedRide = async () => {
      if (!rideId) return;

      try {
        const response = await api.get(`/rides/${rideId}`);
        const payload = response?.data?.data || response?.data || response || {};
        const feedback = payload?.feedback || null;
        const nextLiveStatus = String(payload?.liveStatus || payload?.status || '').toLowerCase();

        if (active) {
          setPaymentCollection(payload?.driverPaymentCollection || null);
          setRideLiveStatus(nextLiveStatus);
        }

        if (!active || !feedback) {
          return;
        }

        setRating(Number(feedback.rating || 0));
        setComment(feedback.comment || '');
        setSelectedTip(Number(feedback.tipAmount || 0));
        setIsSubmitted(Boolean(feedback.submittedAt));
      } catch (rideError) {
        console.error('Failed to refresh completed ride receipt:', rideError);
      }
    };

    hydrateCompletedRide();
    const refreshTimer = window.setInterval(() => {
      hydrateCompletedRide();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [rideId]);

  useEffect(() => {
    setVehicleImageBroken(false);
  }, [driver.vehicleImage]);

  useEffect(() => {
    let active = true;

    const loadWalletSnapshot = async () => {
      if (selectedPaymentMethod !== 'wallet') {
        return;
      }

      try {
        setWalletLoading(true);
        const response = await userAuthService.getWallet();
        const wallet = response?.data?.wallet || response?.wallet || response?.data || response || {};

        if (!active) {
          return;
        }

        setWalletSnapshot({
          balance: Number(wallet.balance || 0),
          currency: wallet.currency || 'INR',
        });
      } catch (walletError) {
        if (!active) {
          return;
        }

        setWalletSnapshot((current) => ({
          ...current,
          balance: Number(current.balance || 0),
        }));
      } finally {
        if (active) {
          setWalletLoading(false);
        }
      }
    };

    loadWalletSnapshot();

    return () => {
      active = false;
    };
  }, [selectedPaymentMethod]);

  useEffect(() => {
    if (!tipsEnabled && selectedTip !== 0) {
      setSelectedTip(0);
      return;
    }

    if (
      tipsEnabled &&
      Number.isFinite(minimumTipAmount) &&
      minimumTipAmount > 0 &&
      selectedTip > 0 &&
      selectedTip < minimumTipAmount
    ) {
      setSelectedTip(minimumTipAmount);
    }
  }, [minimumTipAmount, selectedTip, tipsEnabled]);

  useEffect(() => {
    if (!rideId && !isSubmitted) {
      navigate(routeHome, { replace: true });
    }
  }, [isSubmitted, navigate, rideId, routeHome]);

  const handleShare = async () => {
    const text = `${appName} Receipt\n${rideDate} ${rideTime}\nDriver: ${driver.name}\nFrom: ${pickup}\nTo: ${drop}\nTotal: Rs ${totalBill}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${appName} Receipt`, text });
        return;
      } catch (_error) {
        return;
      }
    }

    navigator.clipboard?.writeText(text).then(() => {
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 2200);
    });
  };

  const submitFeedback = async () => {
    if (!rideId) {
      navigate(routeHome, { replace: true });
      return;
    }

    if (rating < 1) {
      setError('Please rate your driver before finishing.');
      return;
    }

    if (!isRideFinalized) {
      setError('Waiting for the driver to finish the trip. You can rate as soon as the ride is finalized.');
      return;
    }

    if (!tipsEnabled && Number(selectedTip || 0) > 0) {
      setError('Tips are currently disabled.');
      return;
    }

    if (tipsEnabled && Number(selectedTip || 0) > 0 && minimumTipAmount > 0 && Number(selectedTip || 0) < minimumTipAmount) {
      setError(`Minimum tip amount is Rs ${minimumTipAmount}.`);
      return;
    }

    if (selectedPaymentMethod === 'wallet' && Number(payableNow || 0) > Number(walletSnapshot.balance || 0)) {
      setError('Wallet balance is too low for this payment amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      let response;

      if (Number(payableNow || 0) > 0 && selectedPaymentMethod === 'online') {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          throw new Error('Razorpay SDK failed to load');
        }

        const orderResponse = await api.post(`/rides/${rideId}/complete-payment/razorpay/order`, {
          rating,
          comment,
          tipAmount: selectedTip || 0,
        });
        const order = orderResponse?.data || orderResponse || {};

        if (!order.keyId || !order.orderId) {
          throw new Error('Unable to start ride payment');
        }

        let userInfo = {};
        try {
          userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        } catch {
          userInfo = {};
        }

        response = await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: order.keyId,
            amount: order.amount,
            currency: order.currency || 'INR',
            name: appName,
            description: `Ride payment for ${driver.name || 'driver'}`,
            order_id: order.orderId,
            prefill: {
              name: userInfo?.name || '',
              email: userInfo?.email || '',
              contact: userInfo?.phone ? `+91${userInfo.phone}` : '',
            },
            modal: {
              ondismiss: () => reject(new Error('Ride payment was cancelled')),
            },
            handler: async (paymentResponse) => {
              try {
                const verifyResponse = await api.post(`/rides/${rideId}/complete-payment/razorpay/verify`, {
                  ...paymentResponse,
                  rating,
                  comment,
                  tipAmount: selectedTip || 0,
                });
                resolve(verifyResponse);
              } catch (verifyError) {
                reject(new Error(verifyError?.message || 'Ride payment verification failed'));
              }
            },
            theme: {
              color: '#0f172a',
            },
          });

          rzp.on('payment.failed', (event) => {
            reject(new Error(event?.error?.description || event?.error?.reason || 'Ride payment failed'));
          });

          rzp.open();
        });
      } else if (Number(payableNow || 0) > 0 && selectedPaymentMethod === 'wallet') {
        response = await api.post(`/rides/${rideId}/complete-payment/wallet`, {
          rating,
          comment,
          tipAmount: selectedTip || 0,
        });
      } else {
        response = await api.patch(`/rides/${rideId}/feedback`, {
          rating,
          comment,
          tipAmount: 0,
        });
      }

      const payload = response?.data?.data || response?.data || response;
      if (payload?.feedback) {
        setRating(Number(payload.feedback.rating || rating));
        setComment(payload.feedback.comment || comment);
        setSelectedTip(Number(payload.feedback.tipAmount || 0));
      }
      if (payload?.driverPaymentCollection) {
        setPaymentCollection(payload.driverPaymentCollection);
      }
      setIsSubmitted(true);
      setShowSubmittedOverlay(true);
      clearCurrentRide();
    } catch (submitError) {
      setError(submitError?.message || 'Could not submit feedback right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] max-w-lg mx-auto relative overflow-hidden">
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-[14px] bg-slate-900 px-5 py-3 text-[12px] font-black text-white shadow-xl"
          >
            Receipt copied
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSubmittedOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white/95 max-w-lg mx-auto"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-[0_10px_25px_rgba(16,185,129,0.28)]">
              <CheckCircle2 size={30} className="text-white" />
            </div>
            <p className="text-[20px] font-black text-slate-900">Thanks for rating your driver</p>
            <p className="text-[13px] font-bold text-slate-500">Your feedback has been saved successfully.</p>
            <button
              type="button"
              onClick={() => navigate(routeHome, { replace: true })}
              className="mt-2 rounded-[16px] bg-slate-900 px-6 py-3 text-[13px] font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 pb-8 pt-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.28)]">
            <CheckCircle2 size={24} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {isRideFinalized
                ? (serviceType === 'parcel' ? 'Delivery Completed' : 'Ride Completed')
                : (serviceType === 'parcel' ? 'Reached Destination' : 'Reached Destination')}
            </p>
            <h1 className="text-[22px] font-black text-slate-900">
              {isRideFinalized
                ? (serviceType === 'parcel' ? 'Package delivered' : 'You have arrived')
                : (serviceType === 'parcel' ? 'Package reached destination' : 'Driver reached destination')}
            </h1>
          </div>
        </div>

        {!isRideFinalized ? (
          <div className="rounded-[18px] border border-amber-100 bg-amber-50/90 px-4 py-3 text-center shadow-[0_8px_20px_rgba(245,158,11,0.08)]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Finalizing trip</p>
            <p className="mt-1 text-[12px] font-bold text-amber-900">
              The driver has marked destination arrival. This page will unlock rating and payment as soon as the trip is finalized.
            </p>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[22px] border border-white/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/10">
                <Receipt size={14} className="text-orange-300" />
              </div>
              <div>
                <p className="text-[13px] font-black text-white">Trip Receipt</p>
                <p className="text-[10px] font-bold text-slate-400">{rideDate} · {rideTime}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-white"
            >
              <Share2 size={12} />
              Share
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="flex items-center gap-3 rounded-[18px] border border-slate-100 bg-slate-50/80 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-slate-100 bg-slate-100">
                {driverImage ? (
                  <img src={driverImage} alt={driver.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-[18px] font-black text-white">
                    {getInitials(driver.name)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-black text-slate-900">{driver.name}</p>
                <p className="truncate text-[11px] font-bold text-slate-500">
                  {driver.vehicleNumber || driver.plate || 'Assigned'} · {vehicleLabel}
                </p>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-black text-slate-800">
                  <Star size={10} className="fill-yellow-500 text-yellow-500" />
                  {driver.rating || '4.9'}
                </div>
              </div>
              <div className="h-14 w-16 shrink-0 overflow-hidden rounded-[12px] border border-slate-100 bg-white">
                <img
                  src={vehicleVisual}
                  alt={vehicleLabel}
                  className={`h-full w-full ${hasVehiclePhoto ? 'object-contain bg-white' : 'object-cover'}`}
                  onError={() => setVehicleImageBroken(true)}
                />
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-100 bg-white p-3">
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <div className="h-10 border-l border-dashed border-slate-200" />
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <p className="truncate text-[13px] font-black text-slate-900">{pickup}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Pickup</p>
                  </div>
                  <div>
                    <p className="truncate text-[13px] font-black text-slate-900">{drop}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Drop</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-100 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-500">Base fare</span>
                <span className="text-[13px] font-black text-slate-900">Rs {fare.toFixed(2)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-500">Tip</span>
                <span className="text-[13px] font-black text-slate-900">Rs {Number(selectedTip || 0).toFixed(2)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[15px] font-black text-slate-900">Total</span>
                <span className="text-[18px] font-black text-slate-900">Rs {totalBill.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-white/80 bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          {isSubmitted ? (
            <div className="text-center">
              <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-emerald-500">
                Feedback submitted
              </p>
              <p className="mt-2 text-[12px] font-bold text-slate-500">
                Rating: {rating || 0}/5 {selectedTip > 0 ? `| Tip added: Rs ${Number(selectedTip || 0).toFixed(2)}` : '| No tip added'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                {tipsEnabled ? 'Tip your driver' : 'Driver tips disabled'}
              </p>
              {tipsEnabled && minimumTipAmount > 0 ? (
                <p className="mt-2 text-center text-[11px] font-bold text-slate-500">Minimum tip amount: Rs {minimumTipAmount}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {availableTipOptions.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => {
                      setSelectedTip(amount);
                      setError('');
                    }}
                    disabled={!tipsEnabled && amount > 0}
                    className={`rounded-full border px-4 py-2 text-[11px] font-black transition-all ${
                      selectedTip === amount
                        ? 'border-orange-500 bg-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,0.24)]'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    } ${!tipsEnabled && amount > 0 ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {amount === 0 ? 'No tip' : `Rs ${amount}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-[20px] border border-white/80 bg-white/95 px-4 py-4 text-center shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <p className="text-[16px] font-black text-slate-900">How was your trip with {driver.name?.split(' ')[0] || 'your driver'}?</p>
          <div className="mt-4 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setRating(value);
                  setError('');
                }}
                disabled={isSubmitted}
                className={`flex h-11 w-11 items-center justify-center rounded-[12px] transition-all ${
                  rating >= value
                    ? 'bg-orange-500 shadow-[0_10px_20px_rgba(249,115,22,0.24)]'
                    : 'bg-slate-100'
                } ${isSubmitted ? 'cursor-default' : ''}`}
              >
                <Star size={19} className={rating >= value ? 'fill-white text-white' : 'text-slate-300'} />
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-[16px] border border-slate-100 bg-slate-50/80 px-3 py-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
              <MessageSquare size={14} />
              Add a note
            </div>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
              maxLength={500}
              disabled={isSubmitted}
              placeholder="Tell us about the trip"
              className="w-full resize-none rounded-[12px] border border-slate-100 bg-white px-3 py-2 text-[13px] font-bold text-slate-900 outline-none placeholder:text-slate-300"
            />
          </div>

          {error ? <p className="mt-3 text-[12px] font-black text-red-500">{error}</p> : null}

          <button
            type="button"
            onClick={submitFeedback}
            disabled={isSubmitting || isSubmitted || !isRideFinalized}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[16px] bg-slate-900 py-3.5 text-[14px] font-black text-white shadow-[0_12px_24px_rgba(15,23,42,0.18)] disabled:opacity-60"
          >
            {isSubmitting
              ? 'Saving your feedback...'
              : isSubmitted
                ? 'Feedback already saved'
                : !isRideFinalized
                  ? 'Waiting for driver to finalize trip'
                : 'Submit rating'}
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={() => {
              clearCurrentRide();
              navigate(routeHome, { replace: true });
            }}
            className="mt-3 text-[12px] font-black text-slate-500"
          >
            Skip and go home
          </button>
        </div>
      </div>
    </div>
  );
};

export default RideComplete;
