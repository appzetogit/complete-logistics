import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, ShieldCheck, CreditCard, Wallet, Smartphone } from 'lucide-react';
import { userService } from '../../services/userService';
import { userAuthService } from '../../services/authService';
import { useSettings } from '../../../../shared/context/SettingsContext';
import { openExternalCheckout } from '../../../../shared/utils/externalNavigation';
import {
  clearPendingPhonePeRedirect,
  rememberPendingPhonePeRedirect,
  resolvePendingPhonePeTransaction,
} from '../../../../shared/utils/phonePeResume';

const PAYMENT_METHODS = [
  { id: 'upi', label: 'UPI', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

const RENTAL_DEPOSIT_STATE_KEY = 'taxi:rental-deposit-pending';
const PHONEPE_RENTAL_FLOW_KEY = 'user-rental-advance';

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

const buildRentalBookingPayload = ({
  state,
  vehicle,
  payableNow,
  advancePaymentLabel,
  paymentStatus,
  paymentMethod,
  paymentMethodLabel,
  payment,
  bookingReference,
}) => ({
  bookingReference,
  vehicleTypeId: vehicle.id || vehicle._id,
  pickupDateTime: state.pickup,
  returnDateTime: state.returnTime,
  totalCost: Number(state.totalCost || 0),
  payableNow: Number(payableNow || 0),
  advancePaymentLabel,
  paymentStatus,
  paymentMethod,
  paymentMethodLabel,
  payment,
  kycCompleted: true,
  kycDocuments: state.rentalKyc?.documents || null,
  selectedPackage: state.selectedPackage
    ? {
        id: state.selectedPackage.id || state.selectedPackage._id || '',
        label: state.selectedPackage.label || '',
        durationHours: Number(state.selectedPackage.durationHours || 0),
        price: Number(state.selectedPackage.price || 0),
        extraHourPrice: Number(state.selectedPackage.extraHourPrice || 0),
      }
    : null,
  serviceLocation: state.serviceLocation
    ? {
        id: state.serviceLocation.id || state.serviceLocation._id || '',
        name: state.serviceLocation.name || '',
        address: state.serviceLocation.address || '',
        city: state.serviceLocation.city || state.serviceLocation.country || '',
        latitude: state.serviceLocation.latitude,
        longitude: state.serviceLocation.longitude,
        distanceKm: state.serviceLocation.distanceKm,
      }
    : null,
});

const RentalDeposit = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useSettings();
  const routeState = location.state && Object.keys(location.state).length > 0 ? location.state : null;
  const restoredState = useMemo(() => {
    if (routeState) return routeState;

    try {
      const raw = sessionStorage.getItem(RENTAL_DEPOSIT_STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [routeState]);
  const state = routeState || restoredState;
  const activePaymentGateway = settings.paymentGateway || null;
  const [vehicleSnapshot, setVehicleSnapshot] = useState(state.vehicle || null);

  useEffect(() => {
    setVehicleSnapshot(state.vehicle || null);
  }, [state.vehicle]);

  useEffect(() => {
    let mounted = true;

    const refreshVehicle = async () => {
      const vehicleId = state.vehicle?.id;
      if (!vehicleId) return;

      try {
        const response = await userService.getRentalVehicles();
        const results = response?.data?.results || response?.results || [];
        const latestVehicle = results.find(
          (item) => String(item.id || item._id) === String(vehicleId),
        );

        if (mounted && latestVehicle) {
          setVehicleSnapshot((current) => ({
            ...(current || {}),
            ...latestVehicle,
          }));
        }
      } catch {
        // Keep the booking flow usable even if the refresh fails.
      }
    };

    refreshVehicle();

    return () => {
      mounted = false;
    };
  }, [state.vehicle?.id]);

  const { totalCost, selectedPackage, serviceLocation } = state;
  const vehicle = useMemo(() => vehicleSnapshot || {}, [vehicleSnapshot]);
  const advancePayment = vehicle.advancePayment || {};
  const advancePaymentMode = String(advancePayment.paymentMode || 'percentage').toLowerCase();
  const payableNow = useMemo(
    () => {
      if (!advancePayment.enabled) return 0;
      if (advancePaymentMode === 'full') return Number(totalCost || 0);
      if (advancePaymentMode === 'percentage') {
        return Math.min(
          Number(totalCost || 0),
          Math.round((((Number(totalCost || 0) * Number(advancePayment.amount || 0)) / 100) + Number.EPSILON) * 100) / 100,
        );
      }
      return Math.min(Number(totalCost || 0), Number(advancePayment.amount || 0));
    },
    [advancePayment.amount, advancePayment.enabled, advancePaymentMode, totalCost],
  );
  const advancePaymentLabel = advancePayment.label || 'Advance booking payment';
  const bookingReference = useMemo(
    () => state.bookingReference || `RNT-${Date.now().toString(36).slice(-6).toUpperCase()}`,
    [state.bookingReference],
  );
  const [method, setMethod] = useState('upi');
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const supportsRentalAdvance = activePaymentGateway?.supportsRentalAdvance === true;
  const rentalAdvanceMode = activePaymentGateway?.rentalAdvanceMode || '';
  const isPhonePeRentalFlow = method !== 'wallet' && rentalAdvanceMode === 'phonepe_redirect';

  const submitBookingRequest = React.useCallback(async ({
    paymentStatus,
    paymentMethod,
    paymentMethodLabel,
    payment,
    bookingReference,
  }) => {
    const response = await userService.createRentalBookingRequest(
      buildRentalBookingPayload({
        state,
        vehicle,
        payableNow,
        advancePaymentLabel,
        paymentStatus,
        paymentMethod,
        paymentMethodLabel,
        payment,
        bookingReference,
      }),
    );

    return response?.data || response || {};
  }, [advancePaymentLabel, payableNow, state, vehicle]);

  useEffect(() => {
    if (!state || Object.keys(state).length === 0) {
      return;
    }

    try {
      sessionStorage.setItem(RENTAL_DEPOSIT_STATE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures and keep the flow usable.
    }
  }, [state]);

  useEffect(() => {
    let mounted = true;

    const loadWallet = async () => {
      setWalletLoading(true);
      try {
        const response = await userAuthService.getWallet();
        const data = response?.data || response || {};
        if (mounted) {
          setWalletBalance(Number(data.balance || 0));
        }
      } catch {
        if (mounted) {
          setWalletBalance(0);
        }
      } finally {
        if (mounted) {
          setWalletLoading(false);
        }
      }
    };

    loadWallet();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const merchantTransactionId = resolvePendingPhonePeTransaction(PHONEPE_RENTAL_FLOW_KEY);
    if (!merchantTransactionId || rentalAdvanceMode !== 'phonepe_redirect') {
      return;
    }

    let cancelled = false;

    const clearPhonePeQuery = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('phonepe_txn');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    };

    const syncPhonePeRentalAdvance = async () => {
      setPaying(true);
      setPaymentError('');

      try {
        const verifyResponse = await userService.verifyPhonePeRentalAdvancePayment(merchantTransactionId);
        if (cancelled) return;

        const payment = verifyResponse?.data || {};
        if (payment.status === 'paid') {
          clearPendingPhonePeRedirect(PHONEPE_RENTAL_FLOW_KEY);
          const methodLabel = PAYMENT_METHODS.find((item) => item.id === method)?.label || activePaymentGateway?.label || 'Online';
          const bookingRequest = await submitBookingRequest({
            paymentStatus: 'paid',
            paymentMethod: method,
            paymentMethodLabel: methodLabel,
            payment,
            bookingReference: payment.bookingReference || bookingReference,
          });

          navigate('/rental/confirmed', {
            replace: true,
            state: {
              ...state,
              vehicle,
              deposit: payableNow,
              paymentMethod: method,
              paymentMethodLabel: methodLabel,
              paymentStatus: 'paid',
              payment,
              bookingReference: bookingRequest.bookingReference || payment.bookingReference || bookingReference,
              bookingRequest,
            },
          });
          sessionStorage.removeItem(RENTAL_DEPOSIT_STATE_KEY);
          return;
        }

        if (payment.status === 'pending') {
          setPaymentError('PhonePe payment is still pending. Please refresh in a few seconds.');
        } else {
          clearPendingPhonePeRedirect(PHONEPE_RENTAL_FLOW_KEY);
          setPaymentError(verifyResponse?.message || 'PhonePe payment was not completed.');
        }
      } catch (error) {
        if (!cancelled) {
          setPaymentError(error?.message || 'Could not verify PhonePe payment.');
        }
      } finally {
        if (!cancelled) {
          setPaying(false);
          clearPhonePeQuery();
        }
      }
    };

    syncPhonePeRentalAdvance();

    return () => {
      cancelled = true;
    };
  }, [
    activePaymentGateway?.label,
    bookingReference,
    method,
    navigate,
    payableNow,
    rentalAdvanceMode,
    state,
    submitBookingRequest,
    vehicle,
  ]);

  if (!vehicleSnapshot) {
    navigate('/rental');
    return null;
  }

  const handlePay = async () => {
    if (paying) return;

    setPaymentError('');

    if (payableNow <= 0) {
      try {
        const bookingRequest = await submitBookingRequest({
          paymentStatus: 'not_required',
          paymentMethod: method,
          paymentMethodLabel: PAYMENT_METHODS.find((item) => item.id === method)?.label || 'Online',
          payment: {
            provider: 'manual',
            status: 'not_required',
            amount: 0,
            currency: 'INR',
          },
          bookingReference,
        });

        navigate('/rental/confirmed', {
          state: {
            ...state,
            vehicle,
            deposit: payableNow,
            paymentMethod: method,
            paymentStatus: 'not_required',
            bookingReference: bookingRequest.bookingReference || '',
            bookingRequest,
          },
        });
      } catch (error) {
        setPaymentError(error?.message || 'Unable to save rental booking');
      }
      return;
    }

    setPaying(true);

    try {
      if (method !== 'wallet') {
        if (!activePaymentGateway) {
          throw new Error('No payment gateway is enabled by admin right now.');
        }

        if (!supportsRentalAdvance || !['razorpay_checkout', 'phonepe_redirect'].includes(rentalAdvanceMode)) {
          throw new Error(`${activePaymentGateway?.label || 'This payment gateway'} is enabled by admin, but rental advance payment is not available for it yet.`);
        }
      }

      if (method === 'wallet') {
        if (Number(walletBalance || 0) < payableNow) {
          throw new Error('Not enough wallet balance for this advance payment');
        }

        const walletResponse = await userService.payRentalAdvanceWithWallet({
          amount: payableNow,
          bookingReference,
          vehicleId: vehicle.id || vehicle._id,
          vehicleName: vehicle.name,
        });
        const payment = walletResponse?.data || walletResponse || {};
        const bookingRequest = await submitBookingRequest({
          paymentStatus: 'paid',
          paymentMethod: 'wallet',
          paymentMethodLabel: 'Wallet',
          payment,
          bookingReference,
        });
        setWalletBalance(Number(payment.balance || 0));
        navigate('/rental/confirmed', {
          replace: true,
          state: {
            ...state,
            vehicle,
            deposit: payableNow,
            paymentMethod: 'wallet',
            paymentMethodLabel: 'Wallet',
            paymentStatus: 'paid',
            payment,
            bookingReference: bookingRequest.bookingReference || bookingReference,
            bookingRequest,
          },
        });
        sessionStorage.removeItem(RENTAL_DEPOSIT_STATE_KEY);
        return;
      }

      if (rentalAdvanceMode === 'phonepe_redirect') {
        const sessionResponse = await userService.createPhonePeRentalAdvanceOrder({
          amount: payableNow,
          bookingReference,
          vehicleId: vehicle.id || vehicle._id,
          vehicleName: vehicle.name,
          pickup: state.pickup,
          returnTime: state.returnTime,
        });
        const session = sessionResponse?.data || {};

        if (!session.checkoutUrl) {
          throw new Error('Unable to start PhonePe payment');
        }

        rememberPendingPhonePeRedirect(PHONEPE_RENTAL_FLOW_KEY, {
          merchantTransactionId: session.merchantTransactionId,
          bookingReference: session.bookingReference || bookingReference,
          checkoutUrl: session.checkoutUrl,
        });
        const opened = await openExternalCheckout(session.checkoutUrl);
        if (!opened) {
          throw new Error('PhonePe checkout could not open outside the app WebView. Please update the app bridge or open this payment flow in your browser.');
        }
        setPaying(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const orderResponse = await userService.createRentalAdvanceOrder({
        amount: payableNow,
        vehicleId: vehicle.id || vehicle._id,
        vehicleName: vehicle.name,
        pickup: state.pickup,
        returnTime: state.returnTime,
      });
      const order = orderResponse?.data || orderResponse || {};

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start rental payment');
      }

      let userInfo = {};
      try {
        userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      } catch {
        userInfo = {};
      }

      const methodLabel = PAYMENT_METHODS.find((item) => item.id === method)?.label || 'Online';
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: vehicle.name || 'Rental Booking',
        description: `${advancePaymentLabel} - ${methodLabel}`,
        order_id: order.orderId,
        prefill: {
          name: userInfo?.name || '',
          email: userInfo?.email || '',
          contact: userInfo?.phone || '',
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
          },
        },
        theme: {
          color: '#0F172A',
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userService.verifyRentalAdvancePayment(response);
            const payment = verifyResponse?.data || verifyResponse || {};
            const bookingRequest = await submitBookingRequest({
              paymentStatus: 'paid',
              paymentMethod: method,
              paymentMethodLabel: methodLabel,
              payment,
              bookingReference: order.bookingReference || '',
            });
            navigate('/rental/confirmed', {
              replace: true,
              state: {
                ...state,
                vehicle,
                deposit: payableNow,
                paymentMethod: method,
                paymentMethodLabel: methodLabel,
                paymentStatus: 'paid',
                payment,
                bookingReference: bookingRequest.bookingReference || order.bookingReference || bookingReference,
                bookingRequest,
              },
            });
            sessionStorage.removeItem(RENTAL_DEPOSIT_STATE_KEY);
          } catch (verifyError) {
            setPaymentError(verifyError?.message || 'Payment completed but the rental booking could not be saved');
            setPaying(false);
          }
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        setPaymentError(message);
        setPaying(false);
      });

      rzp.open();
    } catch (error) {
      setPaymentError(error?.message || 'Unable to continue with payment');
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F3F4F6_38%,#EEF2F7_100%)] max-w-lg mx-auto font-sans pb-28 relative overflow-hidden">
      <div className="absolute -top-16 right-[-40px] h-44 w-44 rounded-full bg-orange-100/60 blur-3xl pointer-events-none" />

      <Motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-30 w-full"
      >
        <div className="bg-white/85 backdrop-blur-2xl px-5 pt-12 pb-5 border-b border-white/40 shadow-[0_8px_32px_rgba(15,23,42,0.06)] relative overflow-hidden">
          {/* Subtle accent gradients */}
          <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-orange-400/5 blur-[40px] pointer-events-none" />
          <div className="absolute top-0 left-0 h-24 w-24 rounded-full bg-blue-400/5 blur-[40px] pointer-events-none" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate(-1)}
                className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center shadow-[0_4px_12px_rgba(15,23,42,0.15)] shrink-0 group transition-all"
              >
                <ArrowLeft size={20} className="text-white group-hover:opacity-80 transition-opacity" strokeWidth={2.5} />
              </Motion.button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500/60 leading-none mb-1.5">Step 5 of 5 · Checkout</p>
                <h1 className="text-[22px] font-[900] tracking-tight text-slate-950 leading-none truncate max-w-[200px]">
                  Advance Payment
                </h1>
              </div>
            </div>
          </div>
        </div>
      </Motion.header>

      <div className="px-5 pt-5 space-y-4">
        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
            Booking Summary
          </p>
          <div className="flex items-center gap-3">
            <img src={vehicle.image} alt={vehicle.name} className="h-14 w-16 object-contain drop-shadow-md shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-slate-900 leading-tight">{vehicle.name}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                {selectedPackage?.label || state.duration} - {state.pickup?.slice(0, 16).replace('T', ' ')}
              </p>
              {serviceLocation?.name ? (
                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                  Pickup: {serviceLocation.name}
                </p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-slate-50 pt-3 space-y-1.5">
            <div className="flex justify-between text-[12px] font-bold text-slate-500">
              <span>Rental cost</span>
              <span>Rs.{totalCost}</span>
            </div>
            <div className="flex justify-between text-[12px] font-bold text-slate-500">
              <span>
                {advancePaymentLabel}
              </span>
              <span>Rs.{payableNow}</span>
            </div>
            <div className="flex justify-between text-[14px] font-bold text-slate-950 pt-1 border-t border-slate-50">
              <span>Total now</span>
              <span>Rs.{payableNow}</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400">
              Rental cost Rs.{totalCost} is paid at pickup.
            </p>
          </div>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-[16px] border border-white/80 bg-white/90 px-4 py-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
        >
          <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center shrink-0">
            <ShieldCheck size={15} className="text-emerald-500" strokeWidth={2} />
          </div>
          <p className="text-[12px] font-bold text-slate-500 leading-relaxed">
            You are paying Rs.{payableNow} right now as the booking advance. The remaining rental cost is paid at pickup.
          </p>
        </Motion.div>

        <Motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-[20px] border border-white/80 bg-white/90 shadow-[0_4px_14px_rgba(15,23,42,0.05)] px-5 py-4 space-y-3"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500/80">
            Payment Method
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-[14px] border transition-all ${
                  method === id
                    ? 'border-orange-200 bg-orange-50 shadow-[0_4px_12px_rgba(249,115,22,0.12)]'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                {React.createElement(icon, {
                  size: 18,
                  className: method === id ? 'text-orange-500' : 'text-slate-400',
                  strokeWidth: 2,
                })}
                <span className={`text-[11px] font-bold ${method === id ? 'text-slate-900' : 'text-slate-400'}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
          {method === 'wallet' ? (
            <div className="rounded-[14px] border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              {walletLoading
                ? 'Loading wallet balance...'
                : `Wallet balance: Rs.${Number(walletBalance || 0).toFixed(2)}`}
            </div>
          ) : null}
          {isPhonePeRentalFlow ? (
            <div className="rounded-[14px] border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700">
              {activePaymentGateway?.label || 'PhonePe'} checkout will be used for this advance payment.
            </div>
          ) : null}
          {paymentError ? (
            <div className="rounded-[14px] border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
              {paymentError}
            </div>
          ) : null}
        </Motion.div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-6 pt-3 bg-gradient-to-t from-[#EEF2F7] via-[#F3F4F6]/95 to-transparent pointer-events-none z-30">
        <Motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handlePay}
          disabled={paying || (method === 'wallet' && !walletLoading && Number(walletBalance || 0) < payableNow)}
          className="pointer-events-auto w-full bg-slate-950 py-4 rounded-[18px] text-[15px] font-bold text-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2"
        >
          {paying ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {method === 'wallet' ? <Wallet size={16} strokeWidth={2} /> : <CreditCard size={16} strokeWidth={2} />} {isPhonePeRentalFlow ? 'Continue to PhonePe' : 'Confirm & Pay'} Rs.{payableNow}
            </>
          )}
        </Motion.button>
      </div>
    </div>
  );
};

export default RentalDeposit;
