import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, User, Phone, Mail, ChevronRight, Check, Loader2 } from 'lucide-react';
import userBusService from '../../services/busService';
import { userAuthService } from '../../services/authService';
import { buildBusRouteState, toPlainData } from './busNavigationState';

const getRoutePrefix = (pathname = '') => (pathname.startsWith('/taxi/user') ? '/taxi/user' : '');

const getDisplayRoute = (bus, fallbackFromCity = '', fallbackToCity = '') => ({
  fromCity: bus?.route?.originCity || bus?.fromCity || fallbackFromCity,
  toCity: bus?.route?.destinationCity || bus?.toCity || fallbackToCity,
});

const resolveSeatPrice = (bus, seat) => {
  const variantPricing = bus?.variantPricing || {};
  const defaultPrice = Number(bus?.price || 0);
  const variantKey = String(seat?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
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

const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch (err) {
    return dateStr;
  }
};

const CURRENCY_SYMBOL = '\u20B9';
const formatMoney = (value) => Number(value || 0).toLocaleString('en-IN');

const BusDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routePrefix = useMemo(() => getRoutePrefix(location.pathname), [location.pathname]);
  const state = location.state || {};
  const { bus, fromCity, toCity, date, selectedSeats } = state;
  const displayRoute = getDisplayRoute(bus, fromCity, toCity);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isPaying, setIsPaying] = useState(false);
  const [travellerMode, setTravellerMode] = useState('self');
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [liveBus, setLiveBus] = useState(null);
  const pricingBus = liveBus || bus;
  const pricedSelectedSeats = useMemo(
    () => selectedSeats.map((seat) => ({
      ...seat,
      price: resolveSeatPrice(pricingBus, seat),
    })),
    [pricingBus, selectedSeats],
  );
  const seatSubtotal = useMemo(
    () => pricedSelectedSeats.reduce((sum, seat) => sum + Number(seat?.price || 0), 0),
    [pricedSelectedSeats],
  );
  const serviceTaxPercentage = Math.max(0, Number(pricingBus?.serviceTaxPercentage || 0));
  const serviceTaxAmount = useMemo(
    () => Math.round((((seatSubtotal * serviceTaxPercentage) / 100) + Number.EPSILON) * 100) / 100,
    [seatSubtotal, serviceTaxPercentage],
  );
  const payableAmount = useMemo(
    () => Math.round(((seatSubtotal + serviceTaxAmount) + Number.EPSILON) * 100) / 100,
    [seatSubtotal, serviceTaxAmount],
  );

  const unwrapPayload = (response) => response?.data?.data || response?.data || response || {};

  useEffect(() => {
    let active = true;

    const storedProfile = (() => {
      try {
        return JSON.parse(localStorage.getItem('userInfo') || '{}');
      } catch {
        return {};
      }
    })();

    const applyProfile = (profile = {}, mode = travellerMode) => {
      if (!active) {
        return;
      }

      const nextProfile = {
        name: String(profile?.name || '').trim(),
        email: String(profile?.email || '').trim(),
        phone: String(profile?.phone || '').trim(),
      };

      setProfileData(nextProfile);

      if (mode === 'self') {
        setName(nextProfile.name || '');
        setEmail(nextProfile.email || '');
        setPhone(nextProfile.phone || '');
      }
    };

    applyProfile(storedProfile, travellerMode);

    const loadProfile = async () => {
      try {
        const response = await userAuthService.getCurrentUser();
        const user = response?.data?.user || {};
        const normalizedUser = {
          name: user.name || storedProfile?.name || '',
          email: user.email || storedProfile?.email || '',
          phone: user.phone || storedProfile?.phone || '',
        };

        localStorage.setItem('userInfo', JSON.stringify({
          ...storedProfile,
          ...user,
        }));
        applyProfile(normalizedUser, travellerMode);
      } catch {
        applyProfile(storedProfile, travellerMode);
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (travellerMode === 'self' && profileData) {
      setName(profileData.name || '');
      setEmail(profileData.email || '');
      setPhone(profileData.phone || '');
    }
  }, [travellerMode, profileData]);

  useEffect(() => {
    if (!bus?.busServiceId || !bus?.scheduleId || !date) {
      return undefined;
    }

    let active = true;

    const loadLiveBus = async () => {
      try {
        const response = await userBusService.getSeatLayout({
          busServiceId: bus.busServiceId,
          scheduleId: bus.scheduleId,
          date,
        });

        if (!active) {
          return;
        }

        const nextBus = toPlainData(response?.data?.bus || response?.bus || null);
        if (nextBus) {
          setLiveBus(nextBus);
        }
      } catch {
        // Keep rendering with the routed bus snapshot if refresh fails.
      }
    };

    loadLiveBus();

    return () => {
      active = false;
    };
  }, [bus?.busServiceId, bus?.scheduleId, date]);

  const applySelfProfile = () => {
    setTravellerMode('self');
    setName(profileData?.name || '');
    setEmail(profileData?.email || '');
    setPhone(profileData?.phone || '');
    setError('');
  };

  const switchToSomeoneElse = () => {
    setTravellerMode('other');
    setName('');
    setAge('');
    setGender('Male');
    setPhone('');
    setEmail('');
    setError('');
  };

  if (!bus || !selectedSeats?.length) {
    navigate(`${routePrefix}/bus`, { replace: true });
    return null;
  }

  const handleContinue = async () => {
    if (isPaying) return;

    if (!name || !age || !phone || !email) {
      setError('Please fill in all passenger details.');
      return;
    }

    setError('');
    setIsPaying(true);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Razorpay SDK failed to load');
      }

      const passenger = { name, age, gender, phone, email };
      const orderResponse = await userBusService.createBookingOrder({
        busServiceId: bus.busServiceId,
        scheduleId: bus.scheduleId,
        travelDate: date,
        seatIds: selectedSeats.map((seat) => seat.id),
        passenger,
      });
      const order = unwrapPayload(orderResponse);

      if (!order.keyId || !order.orderId) {
        throw new Error('Unable to start bus payment');
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: bus.operator || 'Bus Booking',
        description: `${displayRoute.fromCity} to ${displayRoute.toCity}`,
        order_id: order.orderId,
        prefill: {
          name,
          email,
          contact: phone,
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false);
          },
        },
        theme: {
          color: '#C2410C',
        },
        handler: async (response) => {
          try {
            const verifyResponse = await userBusService.verifyBookingPayment(response);
            const booking = toPlainData(unwrapPayload(verifyResponse));
            navigate(`${routePrefix}/bus/confirm`, {
              replace: true,
              state: buildBusRouteState({
                booking,
                fromCity: displayRoute.fromCity,
                toCity: displayRoute.toCity,
                date,
              }),
            });
          } catch (verifyError) {
            setError(verifyError?.message || 'Payment verification failed');
            setIsPaying(false);
          }
        },
      });

      rzp.on('payment.failed', (event) => {
        const message = event?.error?.description || event?.error?.reason || 'Payment failed';
        setError(message);
        setIsPaying(false);
      });

      rzp.open();
    } catch (err) {
      setError(err?.message || 'Unable to continue with payment');
      setIsPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto font-sans pb-32">
      <div className="bg-white px-5 pt-10 pb-4 sticky top-0 z-20 border-b border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center shadow-sm active:scale-95 transition-all"
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900 truncate">Passenger Details</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
              {selectedSeats.length} Seat(s) • {displayRoute.fromCity} to {displayRoute.toCity}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-6 space-y-6">
        <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_58%,#334155_100%)] p-6 text-white shadow-xl shadow-slate-200">
          <div className="flex justify-between items-start gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2">{formatTravelDate(date)} • {bus.departure}</p>
              <h3 className="text-xl font-bold leading-tight">{bus.operator}</h3>
              <p className="text-sm font-medium text-slate-300 mt-1">{bus.type}</p>
              <p className="mt-3 text-xs font-semibold text-slate-300">{displayRoute.fromCity} to {displayRoute.toCity}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">Seats</p>
              <p className="text-base font-bold text-white">{selectedSeats.map((seat) => seat.label || seat.id).join(', ')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Primary Passenger</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Choose who is travelling, then confirm the details below.</p>
            </div>
            {profileLoading ? (
              <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Loading
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={applySelfProfile}
              className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                travellerMode === 'self'
                  ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">Self</p>
              <p className={`mt-1 text-sm font-black ${travellerMode === 'self' ? 'text-white' : 'text-slate-900'}`}>
                Use my profile
              </p>
              <p className={`mt-1 text-[11px] font-semibold ${travellerMode === 'self' ? 'text-white/70' : 'text-slate-500'}`}>
                Name, phone, and email auto-fill from your account.
              </p>
            </button>
            <button
              type="button"
              onClick={switchToSomeoneElse}
              className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                travellerMode === 'other'
                  ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">Other</p>
              <p className={`mt-1 text-sm font-black ${travellerMode === 'other' ? 'text-white' : 'text-slate-900'}`}>
                Book for someone else
              </p>
              <p className={`mt-1 text-[11px] font-semibold ${travellerMode === 'other' ? 'text-white/70' : 'text-slate-500'}`}>
                Enter passenger details manually.
              </p>
            </button>
          </div>

          {travellerMode === 'self' && profileData ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] font-bold text-emerald-700">
              {profileData.email
                ? `Using ${profileData.email} for the ticket confirmation.`
                : 'Profile phone and name are filled. Add an email if you want the e-ticket mailed too.'}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Full Name</label>
              <div className="flex min-w-0 items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <User size={16} className="shrink-0 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Age</label>
                <input
                  type="number"
                  placeholder="Age"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
              <div className="flex-[2] space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Gender</label>
                <div className="flex bg-slate-50 border border-slate-100 rounded-2xl p-1">
                  {['Male', 'Female', 'Other'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setGender(item)}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${gender === item ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Contact Info</h3>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-full">For e-ticket</span>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Mobile Number</label>
              <div className="flex min-w-0 items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <Phone size={16} className="shrink-0 text-slate-400" />
                <input
                  type="tel"
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Email ID</label>
              <div className="flex min-w-0 items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <Mail size={16} className="shrink-0 text-slate-400" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-300"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-5 pb-8 pt-4 bg-white border-t border-slate-100 z-30">
        <div className="mb-4 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fare Summary</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{selectedSeats.length} seat{selectedSeats.length > 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1">
              <Check size={12} className="text-emerald-600" strokeWidth={3} />
              <p className="text-[10px] font-bold text-emerald-700">Calculated live</p>
            </div>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold">Seat subtotal</span>
              <span className="font-bold text-slate-900">{CURRENCY_SYMBOL}{formatMoney(seatSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="font-semibold">Service tax ({serviceTaxPercentage}%)</span>
              <span className="font-bold text-slate-900">{CURRENCY_SYMBOL}{formatMoney(serviceTaxAmount)}</span>
            </div>
            <div className="border-t border-dashed border-slate-200 pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Payable Amount</span>
                <span className="text-2xl font-black text-slate-900">{CURRENCY_SYMBOL}{formatMoney(payableAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={isPaying}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 transition-all"
        >
          {isPaying ? <Loader2 size={20} className="animate-spin" /> : `Pay ${CURRENCY_SYMBOL}${formatMoney(payableAmount)}`}
          {!isPaying && <ChevronRight size={18} />}
        </motion.button>
      </div>
    </div>
  );
};

export default BusDetails;
